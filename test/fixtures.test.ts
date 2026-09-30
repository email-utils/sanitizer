// The corpus against the real sanitizer: every fixture's `expected` under the
// default options, and its `with` under the option it names.
import { describe, expect, it } from 'vitest';
import { type NormalizeOptions, normalizeEmail } from '../src';
import { type SanitizerExpected, sanitizerFixtures } from '../src/fixtures';

/** `normalizeEmail`'s result in a fixture's shape, without the message. */
function outcome(input: string, options?: NormalizeOptions): SanitizerExpected {
  const result = normalizeEmail(input, options);
  return result.ok
    ? { ok: true, ...result.value }
    : { ok: false, reason: result.reason };
}

// The fixtures with a `with`, whose option must change the result.
const optioned = sanitizerFixtures.flatMap(
  ({ description, input, expected, with: other }) =>
    other === undefined ? [] : [[description, input, expected, other] as const],
);

describe('sanitizerFixtures', () => {
  it.each(sanitizerFixtures.map((fixture) => [fixture.description, fixture]))(
    '%s',
    (_, { input, expected }) => {
      expect(outcome(input)).toEqual(expected);
    },
  );

  it.each(optioned)('%s, with its option', (_, input, expected, other) => {
    expect(outcome(input, other.options)).toEqual(other.expected);
    expect(other.expected).not.toEqual(expected);
  });

  it('has each input and description once', () => {
    const inputs = sanitizerFixtures.map(({ input }) => input);
    const descriptions = sanitizerFixtures.map(
      ({ description }) => description,
    );
    expect(new Set(inputs).size).toBe(inputs.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it.each([
    ['Gmail dots', '.Lovelace@gmail.com'],
    ['the googlemail.com alias', 'gmail.com'],
    ['a `+` tag', '+'],
    ['a `-` tag', '-'],
    ['Fastmail subdomains', '.fastmail.com'],
    ['a Workspace domain', 'mycompany.com'],
    ['comments', '('],
    ['quotes', '"'],
  ])('covers %s', (_, text) => {
    expect(sanitizerFixtures.some(({ input }) => input.includes(text))).toBe(
      true,
    );
  });

  it('covers inputs that fail to parse', () => {
    expect(
      sanitizerFixtures.filter(({ expected }) => !expected.ok).length,
    ).toBeGreaterThanOrEqual(5);
  });
});
