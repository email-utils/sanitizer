// sanitizer#8's deterministic budgets: time that doesn't depend on the
// runner's speed, or only loosely. Input past the syntax options'
// `maxLength` is rejected in constant time, unread and untrimmed; time grows
// linearly with the input up to the length caps; and no generated input
// takes long. test/budgets.worker.ts does the timing, in a
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

/** µs, to two decimal places, for failure messages. */
function µs(ns: number): string {
  return `${(ns / 1000).toFixed(2)} µs`;
}

/** The largest of `values` by `by`, with what it came from. */
function worst<T>(values: readonly T[], by: (value: T) => number) {
  return values.reduce((a, b) => (by(b) > by(a) ? b : a));
}

// One line per budget in the log, so a runner's headroom shows even when
// every budget holds.
const oversized = worst(
  report.oversized.flatMap(({ name, times }) =>
    times.map(({ size, ns }) => ({ name, size, ns })),
  ),
  ({ ns }) => ns,
);
const linear = worst(
  report.linear.flatMap(({ name, times }) =>
    times.slice(1).map(({ size, ns }, i) => ({
      name,
      size,
      ratio: ns / (times[i]?.ns ?? 0),
    })),
  ),
  ({ ratio }) => ratio,
);
const adversarial = worst(report.adversarial, ({ ns }) => ns);
console.info(
  [
    `Budget, oversized input: ${µs(oversized.ns)} of 1 µs (${oversized.name}, ${oversized.size} characters)`,
    `Budget, linearity: ×${linear.ratio.toFixed(2)} of ×2.5 (${linear.name}, to ${linear.size})`,
    `Budget, adversarial input: ${µs(adversarial.ns)} of 50 µs (${adversarial.name})`,
  ].join('\n'),
);

describe('oversized input', () => {
  it.each(report.oversized)(
    '$name is rejected for its length',
    ({ rejected }) => {
      expect(rejected).toBe(true);
    },
  );

  // sanitizer#8 budget: ≤ 1 µs at any size. The length is checked against
  // the syntax validator's `maxLength` before the input is trimmed or
  // parsed, so padding past it is rejected as fast as any other shape.
  it.each(report.oversized)('$name is rejected in ≤ 1 µs', ({ times }) => {
    for (const { size, ns } of times) {
      expect(ns, `${size} characters: ${µs(ns)}`).toBeLessThanOrEqual(1000);
    }
  });
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
// default `maxLength`. Longer input is oversized input, above.
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
