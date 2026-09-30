// sanitizer#8's import budgets: how long each built entry takes to import,
// and how much heap it keeps once imported and collected. Each measurement
// is a fresh `node --expose-gc` process, so nothing is loaded or compiled
// beforehand; the numbers are the median over several processes, less the
// same measurement of an empty module, which is the loader's own cost
// (about 0.3 ms and 120 kB). Fails when an entry, in either format, is over
// its budget, or has none.
//
//   npm run build && node scripts/import-cost.ts
//
// check:package runs it after size-limit, so the PR gate's `checks /
// package` leg enforces it.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface Budget {
  /** Milliseconds from the `import` or `require` to its return. */
  ms: number;
  /** Kilobytes (1,000 bytes) of heap still used after a full GC. */
  kB: number;
}

// Set from measurement with room for slower, noisier CI runners. On an
// Apple Silicon laptop with Node 26, the medians were 1.6–2.1 ms for either
// entry, so import time gets about 5×; retained heap was 281–296 kB for the
// root entry and 330–343 kB for fixtures (ESM–CJS), and barely varies
// between runs, so it gets about 1.5×. Both include the dependencies:
// validator-syntax's TLD set and the classifier's provider registry.
const budgets: Readonly<Record<string, Budget>> = {
  '.': { ms: 10, kB: 450 },
  './fixtures': { ms: 10, kB: 500 },
};

const runs = 7;

type Format = 'import' | 'require';

// Runs in the child: collects garbage, imports or requires the file, then
// collects again and reports the time and the heap it kept.
const probe = `
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const [file, format] = process.argv.slice(1);
gc();
gc();
const before = process.memoryUsage().heapUsed;
const start = performance.now();
const entry =
  format === 'import'
    ? await import(pathToFileURL(file).href)
    : createRequire(file)(file);
const ms = performance.now() - start;
gc();
gc();
const bytes = process.memoryUsage().heapUsed - before;
process.stdout.write(JSON.stringify({ ms, bytes, exports: Object.keys(entry).length }));
`;

interface Cost {
  ms: number;
  bytes: number;
}

function median(values: readonly number[]): number {
  // oxlint-disable-next-line unicorn/no-array-sort -- a fresh array; toSorted is ES2023, past the ES2022 lib
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

/** The median cost of loading `file` in a fresh process. */
function measure(file: string, format: Format): Cost {
  const samples = Array.from({ length: runs }, () => {
    const output = execFileSync(
      process.execPath,
      ['--expose-gc', '--input-type=module', '-e', probe, file, format],
      { encoding: 'utf8' },
    );
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the probe above writes exactly this shape
    return JSON.parse(output) as Cost & { exports: number };
  });
  if (samples.some(({ exports }) => exports === 0)) {
    throw new Error(`${file} loaded with no exports; is dist built?`);
  }
  return {
    ms: median(samples.map(({ ms }) => ms)),
    bytes: median(samples.map(({ bytes }) => bytes)),
  };
}

// The loader's own cost in each format, from a module with one export.
const scratch = mkdtempSync(join(tmpdir(), 'import-cost-'));
let baseline: Record<Format, Cost>;
try {
  writeFileSync(join(scratch, 'empty.mjs'), 'export const a = 1;\n');
  writeFileSync(join(scratch, 'empty.cjs'), 'exports.a = 1;\n');
  baseline = {
    import: measure(join(scratch, 'empty.mjs'), 'import'),
    require: measure(join(scratch, 'empty.cjs'), 'require'),
  };
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- package.json's own exports map
const { exports } = JSON.parse(readFileSync('package.json', 'utf8')) as {
  exports: Record<string, string | Partial<Record<Format, string>>>;
};

let failed = false;
const rows: string[] = [];
for (const [entry, target] of Object.entries(exports)) {
  if (typeof target === 'string') {
    continue; // ./package.json
  }
  const budget = budgets[entry];
  if (budget === undefined) {
    failed = true;
    rows.push(`✖ ${entry}: no budget; add one to scripts/import-cost.ts`);
    continue;
  }
  for (const format of ['import', 'require'] as const) {
    const path = target[format];
    if (path === undefined) {
      continue;
    }
    const cost = measure(resolve(path), format);
    const ms = cost.ms - baseline[format].ms;
    const kB = (cost.bytes - baseline[format].bytes) / 1000;
    const over = ms > budget.ms || kB > budget.kB;
    failed ||= over;
    rows.push(
      `${over ? '✖' : '✔'} ${entry} (${format}): ` +
        `${ms.toFixed(1)} ms of ${budget.ms} ms, ` +
        `${kB.toFixed(0)} kB of ${budget.kB} kB retained`,
    );
  }
}

process.stdout.write(
  `Import cost, median of ${runs} fresh processes, less an empty module's:\n` +
    `${rows.join('\n')}\n`,
);
if (failed) {
  process.exitCode = 1;
}
