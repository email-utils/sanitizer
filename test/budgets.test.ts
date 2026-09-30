// sanitizer#8's deterministic budgets: time that doesn't depend on the
// runner's speed, or only loosely. Oversized input is rejected in constant
// time, time grows linearly with the input up to the length caps, and no
// generated input takes long. test/budgets.worker.ts does the timing, in a
// thread v8 coverage doesn't instrument; this checks what it measured.
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import type { Report } from './budgets.worker';

// The adversarial inputs' seed, in every failure message, so a run can be
// repeated.
const seed = Date.now();

const report = await new Promise<Report>((resolve, reject) => {
  const worker = new Worker(new URL('budgets.worker.ts', import.meta.url), {
    workerData: seed,
  });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the worker posts one Report
  worker.once('message', (message) => resolve(message as Report));
  worker.once('error', reject);
  worker.once('exit', (code) => {
    reject(new Error(`The timing worker exited with code ${code}`));
  });
});

/** µs, to one decimal place, for failure messages. */
function µs(ns: number): string {
  return `${(ns / 1000).toFixed(1)} µs`;
}

describe('oversized input', () => {
  it.each(report.oversized)('$name is rejected', ({ rejected }) => {
    expect(rejected).toBe(true);
  });

  // sanitizer#8 budget: ≤ 1 µs at any size. NOT MET YET: validator-syntax's
  // parse scans the whole input for its `@` before it checks a length, so
  // rejecting takes about 3 ns per character (1 µs at 256, 13 ms at 4 MB).
  // validator-syntax is adding a `maxLength` option, 512 by default, that
  // rejects a longer input before the scan, and the sanitizer passes its
  // `syntax` options through. These pass once the sanitizer depends on the
  // validator-syntax release with `maxLength`: `it.fails` then goes red, so
  // make these `it`. Input padded with whitespace past the cap still takes
  // linear time, since the sanitizer trims it before parsing; these shapes
  // have none.
  it.fails.each(report.oversized)(
    '$name is rejected in ≤ 1 µs',
    ({ times }) => {
      for (const { size, ns } of times) {
        expect(ns, `${size} characters: ${µs(ns)}`).toBeLessThanOrEqual(1000);
      }
    },
  );
});

// sanitizer#8 budget: time(2n) / time(n) ≤ 2.5, up to the caps.
describe('time grows linearly', () => {
  it.each(report.linear)('with $name', ({ normalized, times }) => {
    expect(normalized).toBe(true);
    for (let i = 1; i < times.length; i++) {
      const [before, after] = [times[i - 1], times[i]];
      const ratio = (after?.ns ?? Infinity) / (before?.ns ?? 0);
      expect(
        ratio,
        `${before?.size} → ${after?.size} characters`,
      ).toBeLessThanOrEqual(2.5);
    }
  });
});

// sanitizer#8 budget: ≤ 50 µs for each input, under any options, up to the
// 512-character cap. Longer input is oversized input, above.
describe('adversarial input', () => {
  it.each(report.adversarial)(
    '$name take ≤ 50 µs each',
    ({ ns, email, options }) => {
      const input = `${JSON.stringify(email)} under ${JSON.stringify(options)}`;
      expect(
        ns,
        `${µs(ns)} with seed ${seed} for ${input}`,
      ).toBeLessThanOrEqual(50_000);
    },
  );
});
