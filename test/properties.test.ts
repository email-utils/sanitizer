// Properties over generated input: nothing throws on strings, the forms are
// stable when normalized again, and the documented equivalences hold. The
// sanitizer has no `isX()` boolean, so there's no `isX() === x().ok` pair to
// check; test/consistency.test.ts checks that it accepts exactly what
// validator-syntax's `parseAddress` does instead.
import {
  type AddressComment,
  createSyntaxValidator,
} from '@email-utils/validator-syntax';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createSanitizer,
  type NormalizeOptions,
  type NormalizedEmail,
  normalizeEmail,
  type Result,
} from '../src';
import { previewSanitizerOptions } from '../src/fixtures';
import {
  anyAddress,
  anyString,
  dotAtomLocal,
  keyOptions,
  normalizeOptions,
  providerAddress,
  providerDomain,
  rfcDomain,
} from './arbitraries';

/** What a result settled on: normalized, or the reason it wasn't. */
function outcome(result: Result<NormalizedEmail>): string {
  return result.ok ? 'normalized' : result.reason;
}

const outcomes = ['normalized', 'sanitizer.address.unparsable'];

function normalized(
  email: string,
  options?: NormalizeOptions,
): NormalizedEmail {
  const result = normalizeEmail(email, options);
  if (!result.ok) {
    throw new Error(`${email} didn't normalize: ${result.reason}`);
  }
  return result.value;
}

/** An input's key, and what normalizing that key again gives. */
function keyedTwice(
  email: string,
  options?: NormalizeOptions,
): [string, Result<NormalizedEmail>] {
  const { key } = normalized(email, options);
  return [key, normalizeEmail(key, options)];
}

const positions: readonly AddressComment['position'][] = [
  'before-local',
  'inside-local',
  'after-local',
  'before-domain',
  'inside-domain',
  'after-domain',
];

/** A parsed address built by hand, as a JavaScript caller might. */
const parsedAddress = fc.record({
  local: anyString,
  domain: anyString,
  comments: fc.array(
    fc.record({ text: anyString, position: fc.constantFrom(...positions) }),
    { maxLength: 3 },
  ),
});

describe('never throws on a string', () => {
  it('with the default options', () => {
    fc.assert(
      fc.property(anyString, (email) => {
        expect(outcomes).toContain(outcome(normalizeEmail(email)));
      }),
    );
  });

  it('with any valid options', () => {
    fc.assert(
      fc.property(anyString, normalizeOptions, (email, options) => {
        expect(outcomes).toContain(outcome(normalizeEmail(email, options)));
      }),
    );
  });

  it('from a bound sanitizer', () => {
    fc.assert(
      fc.property(anyString, normalizeOptions, (email, options) => {
        const sanitize = createSanitizer(options);
        expect(outcomes).toContain(outcome(sanitize.normalize(email)));
      }),
    );
  });

  it('given a parsed address with arbitrary parts', () => {
    fc.assert(
      fc.property(parsedAddress, normalizeOptions, (parsed, options) => {
        expect(outcomes).toContain(outcome(normalizeEmail(parsed, options)));
      }),
    );
  });

  it('when previewing a configuration on arbitrary addresses', () => {
    fc.assert(
      fc.property(
        normalizeOptions,
        fc.array(anyString, { maxLength: 5 }),
        (options, addresses) => {
          const { valid, invalid } = previewSanitizerOptions(
            options,
            addresses,
          );
          expect(valid.length + invalid.length).toBe(addresses.length);
        },
      ),
    );
  });
});

describe('normalizing again', () => {
  it('`address` gives the same forms, at every provider and override', () => {
    fc.assert(
      fc.property(providerAddress, keyOptions, (email, options) => {
        const first = normalizeEmail(email, options);
        fc.pre(first.ok);
        expect(normalizeEmail(first.value.address, options)).toEqual(first);
      }),
    );
  });

  it('`address` gives the same forms, for any input that normalizes', () => {
    fc.assert(
      fc.property(anyAddress, normalizeOptions, (email, options) => {
        const first = normalizeEmail(email, options);
        fc.pre(first.ok);
        expect(normalizeEmail(first.value.address, options)).toEqual(first);
      }),
    );
  });

  it('`envelope` gives the same key and envelope', () => {
    fc.assert(
      fc.property(
        fc.oneof(providerAddress, anyAddress, anyString),
        normalizeOptions,
        (email, options) => {
          const first = normalizeEmail(email, options);
          fc.pre(first.ok);
          const { envelope } = first.value;
          expect(normalizeEmail(envelope, options)).toEqual({
            ok: true,
            value: { ...first.value, address: envelope },
          });
        },
      ),
    );
  });

  it('the key gives the same key, at every provider and override', () => {
    fc.assert(
      fc.property(providerAddress, keyOptions, (email, options) => {
        const [key, again] = keyedTwice(email, options);
        expect(again).toMatchObject({ ok: true, value: { key } });
      }),
    );
  });

  it('the key gives the same key, for any input that normalizes', () => {
    fc.assert(
      fc.property(anyAddress, normalizeOptions, (email, options) => {
        const first = normalizeEmail(email, options);
        fc.pre(first.ok);
        const { key } = first.value;
        expect(normalizeEmail(key, options)).toMatchObject({
          ok: true,
          value: { key },
        });
      }),
    );
  });
});

// Inputs whose key or envelope once failed to normalize again, or trimmed
// to another address (sanitizer#24). The properties above can take them,
// but these pin them.
describe('normalizing again, where it once changed the form', () => {
  it.each<[string, string, NormalizeOptions?]>([
    [
      'a Yandex hyphen with dots removed',
      '-@yandex.ru',
      { removePeriods: true },
    ],
    ['a Yandex hyphen at the end', '-@yandex.ru'],
    ['a tag after a dot', 'a.+@outlook.com'],
    [
      'a Fastmail IDN subdomain',
      'x@ü.fastmail.com',
      { syntax: { allowIdn: true } },
    ],
    [
      'quotes around Unicode whitespace',
      '"\u00a0a"@example.com',
      { syntax: { preset: 'rfc5321', allowUnicode: true } },
    ],
  ])('the key gives the same key for %s', (_, email, options) => {
    const [key, again] = keyedTwice(email, options);
    expect(again).toMatchObject({ ok: true, value: { key } });
  });

  it('the envelope after a comment keeps its Unicode whitespace', () => {
    const options: NormalizeOptions = {
      syntax: { allowComments: true, allowUnicode: true },
    };
    const { envelope } = normalized('(c)\u00a0a@example.com', options);
    expect(normalizeEmail(envelope, options)).toMatchObject({
      ok: true,
      value: { envelope },
    });
  });
});

describe('documented equivalences', () => {
  it('a bound sanitizer gives what normalizeEmail does', () => {
    fc.assert(
      fc.property(
        fc.oneof(providerAddress, anyAddress, anyString),
        normalizeOptions,
        (email, options) => {
          expect(createSanitizer(options).normalize(email)).toEqual(
            normalizeEmail(email, options),
          );
        },
      ),
    );
  });

  it('surrounding whitespace changes nothing, up to `maxLength`', () => {
    const { maxLength } = createSyntaxValidator();
    fc.assert(
      fc.property(
        fc.oneof(providerAddress, anyAddress, anyString),
        fc.string({ unit: fc.constantFrom(' ', '\t', '\r', '\n') }),
        fc.string({ unit: fc.constantFrom(' ', '\t', '\r', '\n') }),
        (email, before, after) => {
          const padded = before + email + after;
          // Past it, the input fails before it's trimmed.
          expect(normalizeEmail(padded)).toEqual(
            padded.length <= maxLength
              ? normalizeEmail(email)
              : {
                  ok: false,
                  reason: 'sanitizer.address.unparsable',
                  message: `The input is longer than ${maxLength} characters`,
                },
          );
        },
      ),
    );
  });

  it('the domain’s case changes nothing', () => {
    fc.assert(
      fc.property(
        dotAtomLocal,
        providerDomain,
        keyOptions,
        (local, domain, options) => {
          expect(
            normalizeEmail(`${local}@${domain.toUpperCase()}`, options),
          ).toEqual(
            normalizeEmail(`${local}@${domain.toLowerCase()}`, options),
          );
        },
      ),
    );
  });

  it('the local part’s case changes only `address` and `envelope`', () => {
    fc.assert(
      fc.property(
        dotAtomLocal,
        providerDomain,
        keyOptions,
        (local, domain, options) => {
          const lower = normalized(`${local.toLowerCase()}@${domain}`, options);
          const upper = normalized(`${local.toUpperCase()}@${domain}`, options);
          expect(upper.key).toBe(lower.key);
          expect(upper.provider).toBe(lower.provider);
        },
      ),
    );
  });

  it('the key is lowercase', () => {
    fc.assert(
      fc.property(
        fc.oneof(providerAddress, anyAddress, anyString),
        normalizeOptions,
        (email, options) => {
          const result = normalizeEmail(email, options);
          fc.pre(result.ok);
          expect(result.value.key).toBe(result.value.key.toLowerCase());
        },
      ),
    );
  });

  it('quotes that aren’t needed don’t change the key', () => {
    const rfc5321: NormalizeOptions = { syntax: { preset: 'rfc5321' } };
    fc.assert(
      fc.property(dotAtomLocal, rfcDomain, (local, domain) => {
        const quoted = normalizeEmail(`"${local}"@${domain}`, rfc5321);
        const bare = normalizeEmail(`${local}@${domain}`, rfc5321);
        expect(quoted.ok).toBe(bare.ok);
        fc.pre(quoted.ok && bare.ok);
        expect(quoted.value.key).toBe(bare.value.key);
        expect(quoted.value.provider).toBe(bare.value.provider);
      }),
    );
  });

  it('`providerRules: false` reports no provider', () => {
    fc.assert(
      fc.property(
        fc.oneof(providerAddress, anyAddress, anyString),
        normalizeOptions,
        (email, options) => {
          const result = normalizeEmail(email, {
            ...options,
            providerRules: false,
          });
          fc.pre(result.ok);
          expect(result.value).not.toHaveProperty('provider');
        },
      ),
    );
  });

  it('a preview splits the addresses as the bound sanitizer does', () => {
    fc.assert(
      fc.property(
        normalizeOptions,
        fc.array(fc.oneof(providerAddress, anyAddress, anyString), {
          maxLength: 5,
        }),
        (options, addresses) => {
          const sanitize = createSanitizer(options);
          const { valid, invalid } = previewSanitizerOptions(
            options,
            addresses,
          );
          const results = addresses.map((input) => sanitize.normalize(input));
          expect(valid.map(({ input }) => input)).toEqual(
            addresses.filter((_, i) => results[i]?.ok),
          );
          expect(invalid.map(({ input }) => input)).toEqual(
            addresses.filter((_, i) => !results[i]?.ok),
          );
        },
      ),
    );
  });

  it('a preview with no options changes nothing', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(providerAddress, anyAddress, anyString), {
          maxLength: 5,
        }),
        (addresses) => {
          const { valid, invalid } = previewSanitizerOptions(
            undefined,
            addresses,
          );
          expect([...valid, ...invalid].some(({ changed }) => changed)).toBe(
            false,
          );
        },
      ),
    );
  });
});
