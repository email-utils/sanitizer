// Times the sanitizer for test/budgets.test.ts, in a worker thread that
// Node runs directly. v8 coverage, which the CI test leg always collects,
// counts every block the code runs and makes a scan over a long input about
// 10× slower. It's enabled per thread, so a worker isn't instrumented, and
// the budgets measure the code as it ships under `npm test` and
// `npm run test:coverage` alike.
//
// Each time is the average over a batch of calls, best of several batches,
// so a shared runner or a GC pause doesn't count against the budget. What's
// timed is warmed up first, as a long-running service would be.
import { registerHooks } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';
import type { Arbitrary } from 'fast-check';
import type { NormalizedEmail, NormalizeOptions, Result } from '../src';

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
const { createSyntaxValidator } = await import('@email-utils/validator-syntax');
const { createSanitizer, normalizeEmail } = await import('../src/index.ts');
const { anyAddress, anyString, normalizeOptions } =
  await import('./arbitraries.ts');

/** What the worker measured, in nanoseconds per call. */
export interface Report {
  /**
   * Each oversized shape, through each function: whether every size was
   * rejected for its length, before it was read, and its times.
   */
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

/**
 * Calls `fn` until the engine has compiled it: `calls` times, since V8
 * optimizes code by how often it runs, not for how long, so a slow runner
 * needs as many calls as a fast one. A call so costly that `ms` pass first
 * has run its own loops often enough by then.
 */
function warmUp(fn: () => unknown, calls = 5000, ms = 100): void {
  const start = performance.now();
  for (let call = 0; call < calls; call++) {
    fn();
    if (performance.now() - start > ms) {
      return;
    }
  }
}

/**
 * How many calls of `fn` fill about `ms`, so cheap and costly calls are
 * timed alike. Warm `fn` up first: this doesn't make enough calls to.
 */
function callsIn(fn: () => unknown, ms: number): number {
  let calls = 0;
  const start = performance.now();
  while (performance.now() - start < ms) {
    fn();
    calls++;
  }
  return calls;
}

/**
 * Nanoseconds per call of each of `runs`, the best of `batches` batches of
 * `calls[r]` calls each. The runs take turns, so a slow patch on the runner
 * lands on all of them rather than on one.
 */
function nsPerCall(
  runs: readonly (() => unknown)[],
  batches: number,
  calls: readonly number[],
): number[] {
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

/** `unit` repeated between `prefix` and `suffix`, to about `size` characters. */
function fill(prefix: string, unit: string, suffix: string, size: number) {
  const units = Math.floor(
    (size - prefix.length - suffix.length) / unit.length,
  );
  return prefix + unit.repeat(Math.max(units, 0)) + suffix;
}

// The syntax validator's default `maxLength`: longer input is rejected
// before it's trimmed or read.
const { maxLength } = createSyntaxValidator();

// Past `maxLength`, from just over it to 4 MB. The padded address is valid
// once trimmed, so only the length rejects it.
const oversizes = [maxLength + 1, 1024, 65_536, 1_048_576, 4_194_304];
const oversized: readonly [string, (n: number) => string][] = [
  ['a long local part', (n) => fill('', 'a', '@example.com', n)],
  ['a long domain', (n) => fill('ada@', 'a', '.com', n)],
  ['no @', (n) => 'a'.repeat(n)],
  ['a Gmail local part of dots', (n) => fill('', 'a.', 'a@gmail.com', n)],
  [
    'an address in whitespace',
    (n) => fill('', ' ', 'ada@example.com'.padEnd(Math.ceil((n + 15) / 2)), n),
  ],
];

const sanitize = createSanitizer();
const functions: readonly [
  string,
  (email: string) => Result<NormalizedEmail>,
][] = [
  ['normalizeEmail', (email) => normalizeEmail(email)],
  // Options are resolved on every call that passes them.
  [
    'normalizeEmail with options',
    (email) => normalizeEmail(email, { syntax: { allowComments: true } }),
  ],
  ['createSanitizer().normalize', (email) => sanitize.normalize(email)],
];

/** Whether `result` is a rejection for the input's length, before it was read. */
function tooLong(result: Result<NormalizedEmail>): boolean {
  return (
    !result.ok &&
    result.message === `The input is longer than ${maxLength} characters`
  );
}

function timeOversized(): Report['oversized'] {
  const runs = oversized.flatMap(([shape, make]) => {
    const emails = oversizes.map(make);
    return functions.map(([name, fn]) => ({ shape, emails, name, fn }));
  });
  // Everything is warmed up before anything is timed, so the first function
  // timed isn't timed before the engine has compiled the code they share.
  for (const { emails, fn } of runs) {
    for (const email of emails) {
      warmUp(() => fn(email));
    }
  }
  return runs.map(({ shape, emails, name, fn }) => ({
    name: `${name} with ${shape}`,
    rejected: emails.every((email) => tooLong(fn(email))),
    times: emails.map((email) => {
      const call = () => fn(email);
      return { size: email.length, ns: perCall(call, callsIn(call, 1), 7) };
    }),
  }));
}

// Worst cases for the key and the forms, each built from a varying part `n`
// characters long that doubles up to the caps; a last step that would pass
// a cap stops at it. Comments don't count toward the 254-character address
// cap, so they go further, to just under `maxLength`, which they count
// toward.
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
    [60, 120, 240, 480],
    { syntax: { allowComments: true } },
  ],
  [
    'nested comments',
    (n) => `${'('.repeat(n / 2)}${')'.repeat(n / 2)}ada@gmail.com`,
    [30, 60, 120, 240, 480],
    { syntax: { allowComments: true } },
  ],
  [
    'a quoted local part of escaped quotes',
    (n) => `"${'\\"'.repeat(n / 2)}"@example.com`,
    [8, 16, 32, 62],
    { syntax: { preset: 'rfc5321' } },
  ],
];

function timeLinear(): Report['linear'] {
  const shapes = linear.map(([name, shape, sizes, options]) => {
    const emails = sizes.map(shape);
    return {
      name,
      sizes,
      options,
      emails,
      runs: emails.map((email) => () => normalizeEmail(email, options)),
    };
  });
  // Every shape at every size is warmed up before any is timed.
  for (const { runs } of shapes) {
    for (const run of runs) {
      warmUp(run);
    }
  }
  return shapes.map(({ name, sizes, options, emails, runs }) => {
    const calls = runs.map((run) => callsIn(run, 1));
    // A series with a step over 2.5 is measured again, twice at most,
    // keeping each size's best: a slow patch on the runner can't hold up a
    // linear shape three times running, and a quadratic one is over every
    // time.
    let times = nsPerCall(runs, 9, calls);
    for (let retry = 0; retry < 2 && !isLinear(times); retry++) {
      const again = nsPerCall(runs, 9, calls);
      times = times.map((ns, r) => Math.min(ns, again[r] ?? Infinity));
    }
    return {
      name,
      normalized: emails.every((email) => normalizeEmail(email, options).ok),
      times: sizes.map((size, i) => ({ size, ns: times[i] ?? Infinity })),
    };
  });
}

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

const arbitraries: readonly [string, Arbitrary<string>][] = [
  ['any string', anyString],
  ['address-shaped strings', anyAddress],
  ['runs of the characters that matter', tokens],
];
const adversarial = arbitraries.map(
  ([name, arbitrary]) =>
    [name, arbitrary.map((email) => email.slice(0, maxLength))] as const,
);

const report: Report = {
  oversized: timeOversized(),
  linear: timeLinear(),

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
