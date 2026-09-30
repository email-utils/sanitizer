// Times the sanitizer for test/budgets.test.ts, in a worker thread that
// Node runs directly. v8 coverage, which the CI test leg always collects,
// counts every block the code runs and makes a scan over a long input about
// 10× slower. It's enabled per thread, so a worker isn't instrumented, and
// the budgets measure the code as it ships under `npm test` and
// `npm run test:coverage` alike.
//
// Each time is the average over a batch of calls, best of several batches,
// so a shared runner or a GC pause doesn't count against the budget.
import { registerHooks } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';
import type { Arbitrary } from 'fast-check';
import type { NormalizeOptions } from '../src';

// src imports its own files without extensions, as the bundler resolves
// them; Node needs the `.ts`. The hook has to be registered before src is
// imported, so everything else is imported dynamically below.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) {
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return nextResolve(specifier + suffix, context);
        } catch {
          // Not this one; try the next.
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const fc = await import('fast-check');
const { normalizeEmail } = await import('../src/index.ts');
const { anyAddress, anyString, normalizeOptions } =
  await import('./arbitraries.ts');

/** What the worker measured, in nanoseconds per call. */
export interface Report {
  /** Each oversized shape: whether every size was rejected, and its times. */
  oversized: {
    name: string;
    rejected: boolean;
    times: { size: number; ns: number }[];
  }[];
  /** Each worst-case shape: whether every size normalized, and its times. */
  linear: {
    name: string;
    normalized: boolean;
    times: { size: number; ns: number }[];
  }[];
  /** Each arbitrary: its slowest input, with the options it ran under. */
  adversarial: {
    name: string;
    ns: number;
    email: string;
    options: NormalizeOptions | undefined;
  }[];
}

/**
 * Nanoseconds per call of `fn`: the best of `batches` batches of `calls`
 * calls each.
 */
function perCall(fn: () => unknown, calls: number, batches: number): number {
  let best = Infinity;
  for (let batch = 0; batch < batches; batch++) {
    const start = performance.now();
    for (let call = 0; call < calls; call++) {
      fn();
    }
    best = Math.min(best, (performance.now() - start) / calls);
  }
  return best * 1e6;
}

/** How many calls of `run` take at least `ms` milliseconds. */
function calibrate(run: () => unknown, ms: number): number {
  for (let calls = 1; ; calls *= 2) {
    const start = performance.now();
    for (let call = 0; call < calls; call++) {
      run();
    }
    if (performance.now() - start >= ms) {
      return calls;
    }
  }
}

/**
 * Nanoseconds per call of each of `runs`, the best of `batches` batches of
 * about `ms` milliseconds each. The runs take turns, so a slow patch on the
 * runner lands on all of them rather than on one.
 */
function nsPerCall(
  runs: readonly (() => unknown)[],
  batches: number,
  ms: number,
): number[] {
  const calls = runs.map((run) => calibrate(run, ms));
  const best = runs.map(() => Infinity);
  for (let batch = 0; batch < batches; batch++) {
    runs.forEach((run, r) => {
      const count = calls[r] ?? 1;
      const start = performance.now();
      for (let call = 0; call < count; call++) {
        run();
      }
      best[r] = Math.min(
        best[r] ?? Infinity,
        ((performance.now() - start) * 1e6) / count,
      );
    });
  }
  return best;
}

/** Whether no step in `times` is over the 2.5 budget. */
function isLinear(times: readonly number[]): boolean {
  return times.every((ns, i) => i === 0 || ns / (times[i - 1] ?? 0) <= 2.5);
}

// Past validator-syntax's caps: 64 characters in the local part, 253 in the
// domain, and 254 in all. From just over the cap to 4 MB.
const oversized: readonly [string, (n: number) => string][] = [
  ['a long local part', (n) => `${'a'.repeat(n)}@example.com`],
  ['a long domain', (n) => `ada@${'a'.repeat(n)}.com`],
  ['no @', (n) => 'a'.repeat(n)],
  ['a Gmail local part of dots', (n) => `${'a.'.repeat(n / 2)}a@gmail.com`],
];
const oversizes = [256, 1024, 65_536, 1_048_576, 4_194_304];

// Worst cases for the key and the forms, each built from a varying part `n`
// characters long that doubles up to the caps; a last step that would pass
// a cap stops at it. Comments don't count toward the caps, so they go
// further.
const linear: readonly [
  string,
  (n: number) => string,
  readonly number[],
  NormalizeOptions?,
][] = [
  [
    'a Gmail local part of dots',
    (n) => `${'a.'.repeat(n / 2 - 1)}ab@gmail.com`,
    [8, 16, 32, 64],
  ],
  [
    'a Yandex local part of hyphens, then a tag',
    (n) => `${'a-'.repeat(n / 2 - 2)}a+bc@yandex.ru`,
    [8, 16, 32, 64],
  ],
  [
    'a Fastmail subdomain of many labels',
    (n) => `a@${'a.'.repeat(n / 2)}fastmail.com`,
    [30, 60, 120, 240],
  ],
  [
    'a Fastmail subdomain address',
    (n) => `ada@${'x'.repeat(n)}.fastmail.com`,
    [8, 16, 32, 63],
  ],
  [
    'many comments',
    (n) => `ada${'(c)'.repeat(n / 3)}@gmail.com`,
    [48, 96, 192, 384, 768],
    { syntax: { allowComments: true } },
  ],
  [
    'nested comments',
    (n) => `${'('.repeat(n / 2)}${')'.repeat(n / 2)}ada@gmail.com`,
    [32, 64, 128, 256, 512],
    { syntax: { allowComments: true } },
  ],
  [
    'a quoted local part of escaped quotes',
    (n) => `"${'\\"'.repeat(n / 2)}"@example.com`,
    [8, 16, 32, 62],
    { syntax: { preset: 'rfc5321' } },
  ],
];

// Runs of the characters that steer the parser and the key.
const tokens = fc
  .array(
    fc.constantFrom(
      ...Array.from('a.+-@"\\()[]:, \t'),
      '\r\n',
      'Gmail.com',
      'é',
    ),
    { maxLength: 400, size: 'max' },
  )
  .map((parts) => parts.join(''));

// The input cap validator-syntax's coming `maxLength` option defaults to.
// Anything longer is oversized input, which has its own, tighter budget
// above; these are cut to it.
const cap = 512;

const arbitraries: readonly [string, Arbitrary<string>][] = [
  ['any string', anyString],
  ['address-shaped strings', anyAddress],
  ['runs of the characters that matter', tokens],
];
const adversarial = arbitraries.map(
  ([name, arbitrary]) =>
    [name, arbitrary.map((email) => email.slice(0, cap))] as const,
);

const report: Report = {
  oversized: oversized.map(([name, shape]) => {
    const emails = oversizes.map(shape);
    return {
      name,
      rejected: emails.every((email) => !normalizeEmail(email).ok),
      times: emails.map((email, i) => ({
        size: oversizes[i] ?? 0,
        ns: perCall(
          () => normalizeEmail(email),
          Math.ceil(65_536 / email.length),
          5,
        ),
      })),
    };
  }),

  linear: linear.map(([name, shape, sizes, options]) => {
    const emails = sizes.map(shape);
    const runs = emails.map((email) => () => normalizeEmail(email, options));
    // A series with a step over 2.5 is measured again, twice at most,
    // keeping each size's best: a slow patch on the runner can't hold up a
    // linear shape three times running, and a quadratic one is over every
    // time.
    let times = nsPerCall(runs, 9, 1);
    for (let retry = 0; retry < 2 && !isLinear(times); retry++) {
      const again = nsPerCall(runs, 9, 1);
      times = times.map((ns, r) => Math.min(ns, again[r] ?? Infinity));
    }
    return {
      name,
      normalized: emails.every((email) => normalizeEmail(email, options).ok),
      times: sizes.map((size, i) => ({ size, ns: times[i] ?? Infinity })),
    };
  }),

  adversarial: adversarial.map(([name, arbitrary]) => {
    const samples = fc.sample(
      fc.tuple(arbitrary, fc.option(normalizeOptions, { nil: undefined })),
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test/budgets.test.ts passes the seed
      { numRuns: 300, seed: workerData as number },
    );
    // Warm up on every input first, as a long-running service would be.
    // Once the parser has seen arbitrary Unicode it runs about 3× slower on
    // a long input than when it has only seen ASCII, and that slower state
    // is the one timed.
    for (const [email, options] of samples) {
      normalizeEmail(email, options);
    }
    const timed = samples.map(([email, options]) => ({
      name,
      ns: perCall(() => normalizeEmail(email, options), 10, 3),
      email,
      options,
    }));
    // The slowest ten again, over more batches: an input that's slow only
    // because the runner was busy then gets a fair time.
    // oxlint-disable-next-line unicorn/no-array-sort -- timed is a fresh array
    const slowest = timed.sort((a, b) => b.ns - a.ns).slice(0, 10);
    for (const input of slowest) {
      input.ns = Math.min(
        input.ns,
        perCall(() => normalizeEmail(input.email, input.options), 10, 20),
      );
    }
    return slowest.reduce((a, b) => (b.ns > a.ns ? b : a));
  }),
};

// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker_threads port, not a window: it takes no origin
parentPort?.postMessage(report);
