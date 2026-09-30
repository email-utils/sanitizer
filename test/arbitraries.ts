// fast-check arbitraries for the property and consistency suites: options the
// sanitizer accepts, addresses at every domain in the provider registry, and
// strings no one would type.
import { providers } from '@email-utils/classifier/providers';
import type { Preset, SyntaxOptions } from '@email-utils/validator-syntax';
import * as fc from 'fast-check';
import type { NormalizeOptions } from '../src';

/** `arbitrary`'s values, or `undefined`, which every option accepts. */
function maybe<T>(arbitrary: fc.Arbitrary<T>): fc.Arbitrary<T | undefined> {
  return fc.option(arbitrary, { nil: undefined });
}

/** A string of 1–`max` characters from `chars`. */
function of(chars: string, max: number): fc.Arbitrary<string> {
  return fc.string({
    unit: fc.constantFrom(...Array.from(chars)),
    minLength: 1,
    maxLength: max,
  });
}

type Flag = Exclude<keyof SyntaxOptions, 'preset'>;

// What each preset's grammar has no room for: validator-syntax throws
// TypeError when one of these is true.
const unsupported: Record<Preset, readonly Flag[]> = {
  practical: [],
  rfc5321: ['allowComments'],
  rfc5322: [],
  html5: ['allowComments', 'allowUnicode', 'allowIdn', 'allowIpLiteral'],
};

const presets: readonly Preset[] = ['practical', 'rfc5321', 'rfc5322', 'html5'];

/** Any `syntax` options validator-syntax accepts. */
export const syntaxOptions: fc.Arbitrary<SyntaxOptions> = fc
  .record(
    {
      preset: maybe(fc.constantFrom(...presets)),
      checkTld: maybe(fc.boolean()),
      allowNoTld: maybe(fc.boolean()),
      allowComments: maybe(fc.boolean()),
      allowUnicode: maybe(fc.boolean()),
      allowIdn: maybe(fc.boolean()),
      allowIpLiteral: maybe(fc.boolean()),
    },
    { requiredKeys: [] },
  )
  .map((options) => {
    const valid = { ...options };
    for (const flag of unsupported[options.preset ?? 'practical']) {
      if (valid[flag] === true) {
        valid[flag] = false;
      }
    }
    return valid;
  });

/** The registry's provider IDs. */
export const providerIds: readonly string[] = providers.map(({ id }) => id);

/** Every domain a registry provider serves, `gmail.com` to `ya.ru`. */
export const registryDomains: readonly string[] = providers.flatMap(
  ({ domains }) => domains,
);

/** One UTF-16 unit, lone surrogates and control characters included. */
const separator: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom('+', '-', '.', '_', '='),
  fc.integer({ min: 0, max: 0xffff }).map((code) => String.fromCharCode(code)),
);

/** Any options `normalizeEmail` accepts, a registry provider more often than not. */
export const normalizeOptions: fc.Arbitrary<NormalizeOptions> = fc.record(
  {
    syntax: maybe(syntaxOptions),
    provider: maybe(
      fc.oneof(
        { arbitrary: fc.constantFrom(...providerIds), weight: 3 },
        { arbitrary: fc.string(), weight: 1 },
      ),
    ),
    providerRules: maybe(fc.boolean()),
    removePeriods: maybe(fc.boolean()),
    removeSubaddress: maybe(fc.boolean()),
    subaddressSeparator: maybe(separator),
  },
  { requiredKeys: [] },
);

/**
 * Options for addresses at provider domains: the practical preset, so they
 * parse, with the provider detected from the domain or given, and the key
 * overrides in every combination.
 */
export const keyOptions: fc.Arbitrary<NormalizeOptions> = fc.record(
  {
    provider: fc.constantFrom(...providerIds),
    providerRules: fc.boolean(),
    removePeriods: fc.boolean(),
    removeSubaddress: fc.boolean(),
    subaddressSeparator: fc.constantFrom('+', '-', '.', '_', '='),
  },
  { requiredKeys: [] },
);

// Atoms from atext that the provider rules act on: dots join them, `+` and
// `-` start tags, and `-` is a dot on Yandex. Mixed case, for the key.
const atom = of('aBz09_+-', 5);

/** A dot-atom local part: `Ada.Lovelace+news`, `a.+x`, `+tag`, `a-b`. */
export const dotAtomLocal: fc.Arbitrary<string> = fc
  .array(atom, { minLength: 1, maxLength: 4 })
  .map((atoms) => atoms.join('.'));

/** A mixed-case domain: a registry one, a provider subdomain, or a custom one. */
export const providerDomain: fc.Arbitrary<string> = fc
  .tuple(
    fc.oneof(
      { arbitrary: fc.constantFrom(...registryDomains), weight: 4 },
      // Fastmail's subdomain addressing, and subdomains of the rest.
      {
        arbitrary: fc
          .tuple(of('abc019', 6), fc.constantFrom(...registryDomains))
          .map(([label, domain]) => `${label}.${domain}`),
        weight: 2,
      },
      {
        arbitrary: fc.constantFrom('example.com', 'mycompany.com'),
        weight: 1,
      },
    ),
    fc.boolean(),
  )
  .map(([domain, upper]) => (upper ? domain.toUpperCase() : domain));

/** A practical-preset address at a provider domain, with dots and tags. */
export const providerAddress: fc.Arbitrary<string> = fc
  .tuple(dotAtomLocal, providerDomain)
  .map(([local, domain]) => `${local}@${domain}`);

/** Quoted-string text: always needs its quotes, and has `@`, `.`, and `+`. */
const quotedText = fc
  .tuple(
    of('aB.+@ ,-', 6),
    fc.constantFrom('@', ' ', '"', '\\', ',', '(', ':'),
    fc.string({
      unit: fc.constantFrom(...Array.from('aB.+@ ,-')),
      maxLength: 6,
    }),
  )
  .map(([before, needsQuotes, after]) => before + needsQuotes + after);

/** A quoted local part that stays quoted in the key, escaped as RFC 5321 wants. */
export const quotedLocal: fc.Arbitrary<string> = quotedText.map(
  (text) => `"${text.replace(/["\\]/g, '\\$&')}"`,
);

/** A domain `rfc5321` accepts: a registry one or a generated hostname. */
export const rfcDomain: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...registryDomains, 'example.com'),
  fc.domain(),
);

// Characters that reach the parser's and the key's edge cases: quotes,
// escapes, comments, brackets, whitespace ASCII and not, NUL, and letters
// whose case mapping changes their length.
const addressChars = [
  ...Array.from('aZ09.+-_@"\\()[]:, \t\r\n'),
  '\u0000',
  '\u007f',
  '\u0085',
  '\u00a0',
  '\u2028',
  '\ufeff',
  'é',
  'ß',
  'İ',
  'ẞ',
  '用',
  '\ud83d',
];

/**
 * Arbitrary strings: every code point and lone surrogates, graphemes,
 * control characters, very long runs, and address-shaped strings made of
 * the characters that matter to parsing.
 */
export const anyString: fc.Arbitrary<string> = fc.oneof(
  fc.string({ unit: 'binary' }),
  fc.string({ unit: 'grapheme' }),
  fc.string({
    unit: fc
      .integer({ min: 0, max: 0xffff })
      .map((code) => String.fromCharCode(code)),
  }),
  fc.string({ unit: 'binary', minLength: 500, maxLength: 5000 }),
  fc.string({ unit: fc.constantFrom(...addressChars), maxLength: 40 }),
  fc
    .tuple(
      fc.string({ unit: fc.constantFrom(...addressChars), maxLength: 20 }),
      fc.oneof(providerDomain, fc.string({ unit: 'binary' })),
    )
    .map(([local, domain]) => `${local}@${domain}`),
);

// Text for quoted strings and comments: anything but the characters that
// end them, which the generators escape.
const freeText = fc.string({
  unit: fc.oneof(
    fc.constantFrom(...addressChars),
    fc.string({ unit: 'binary', minLength: 1, maxLength: 1 }),
  ),
  maxLength: 8,
});

/**
 * An address that often parses under some syntax options: dot-atom,
 * Unicode, quoted, and obsolete local parts, comments, and registry,
 * generated, IDN, and literal domains.
 */
export const anyAddress: fc.Arbitrary<string> = fc
  .tuple(
    fc.oneof(
      dotAtomLocal,
      of('aZ.+-éß用İ\u00a0', 8),
      freeText.map((text) => `"${text.replace(/["\\]/g, '\\$&')}"`),
      fc
        .tuple(freeText, dotAtomLocal)
        .map(([text, atoms]) => `"${text.replace(/["\\]/g, '\\$&')}".${atoms}`),
    ),
    fc.oneof(
      providerDomain,
      rfcDomain,
      fc.constantFrom(
        '[192.0.2.1]',
        '[IPv6:2001:DB8::1]',
        'Bücher.de',
        'STRAẞE.de',
        'ü.fastmail.com',
        'localhost',
      ),
    ),
    fc.array(
      freeText.map((text) => `(${text.replace(/[()\\]/g, '\\$&')})`),
      {
        maxLength: 4,
      },
    ),
  )
  .map(([local, domain, comments]) => {
    const [a = '', b = '', c = '', d = ''] = comments;
    return `${a}${local}${b}@${c}${domain}${d}`;
  });
