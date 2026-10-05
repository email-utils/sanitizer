import { test } from 'vitest';
import { fixtures, LegacySanitizer, sanitizer, syntax } from './load';

// Each bench's target sits beside it, from the issue that set it. Nothing
// checks them: the benches run locally, with `npm run bench`, for the docs'
// numbers (meta#118).
const { createSanitizer, normalizeEmail } = sanitizer;
const { sanitizerFixtures } = fixtures;
const { parseAddress } = syntax;

// A typical address whose provider is detected from its domain: Gmail's
// rules drop the dot and the tag.
const typical = 'Ada.Lovelace+news@gmail.com';

// sanitizer#8's targets, for this address:
// - normalizeEmail ≤ 400 ns p50, absolute, set on Apple Silicon.
// - normalizeEmail ≤ 2.5× parseAddress on the same input in the same run,
//   which holds on any machine. normalizeEmail parses exactly once, so the
//   ratio is what building the three forms and the key costs on top.
test('typical address with provider detection', async ({ bench }) => {
  await bench.compare(
    bench('normalizeEmail', () => {
      normalizeEmail(typical);
    }),
    bench('parseAddress', () => {
      parseAddress(typical);
    }),
  );
});

const inputs = sanitizerFixtures.map(({ input }) => input);
const defaults = createSanitizer();
// The fixtures whose feature needs an option, each with its sanitizer
// bound once.
const optioned = sanitizerFixtures.flatMap(({ input, with: other }) =>
  other === undefined ? [] : [[createSanitizer(other.options), input] as const],
);

// No target: the corpus, one fixture per rule and failure, tracks every
// path at once.
test('corpus', async ({ bench }) => {
  await bench('normalizeEmail, default options', () => {
    for (const input of inputs) {
      normalizeEmail(input);
    }
  }).run();
  await bench('createSanitizer().normalize, default options', () => {
    for (const input of inputs) {
      defaults.normalize(input);
    }
  }).run();
  await bench("createSanitizer().normalize, each fixture's option", () => {
    for (const [bound, input] of optioned) {
      bound.normalize(input);
    }
  }).run();
});

// No target: checking and resolving options, which createSanitizer does
// once and normalizeEmail does on every call that passes them.
test('createSanitizer', async ({ bench }) => {
  await bench('default options', () => {
    createSanitizer();
  }).run();
  await bench('every option', () => {
    createSanitizer({
      syntax: { preset: 'rfc5322', allowComments: true },
      provider: 'google-workspace',
      providerRules: true,
      removePeriods: false,
      removeSubaddress: true,
      subaddressSeparator: '-',
    });
  }).run();
});

// Informational, not a target: sanitizer#8 has no legacy ratio, since 0.0.1
// only lowercased and replaced characters, and v1 parses on every call. The
// epic (meta#19) grounds its targets in 0.0.1 baselines, so this shows what
// that parse costs against them.
const lowercase = new LegacySanitizer();
const stripped = new LegacySanitizer({
  local: { removePeriods: true, removePlusTag: true },
});

test('0.0.1 comparison (informational)', async ({ bench }) => {
  await bench.compare(
    bench('0.0.1 sanitize(), lowercase only', () => {
      lowercase.sanitize(typical);
    }),
    bench('0.0.1 sanitize(), dots and tag removed', () => {
      stripped.sanitize(typical);
    }),
    bench('normalizeEmail', () => {
      normalizeEmail(typical);
    }),
  );
});
