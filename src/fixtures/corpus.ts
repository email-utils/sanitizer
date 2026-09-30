// The sanitizer corpus: one fixture per rule on the API page's Behavior
// table and Subaddresses list, and the ways an input fails to parse.
// test/fixtures.test.ts runs every one through `normalizeEmail`.
import type { ProviderId } from '@email-utils/classifier/providers';
import type { SanitizerExpected, SanitizerFixture } from './types';

const unparsable: SanitizerExpected = {
  ok: false,
  reason: 'sanitizer.address.unparsable',
};

/** An input that normalizes, its forms in the order the result has them. */
function forms(
  key: string,
  address: string,
  envelope: string = address,
  provider?: ProviderId,
): SanitizerExpected {
  return provider === undefined
    ? { ok: true, key, address, envelope }
    : { ok: true, key, address, envelope, provider };
}

export const sanitizerFixtures: readonly SanitizerFixture[] = [
  // Trimming and case.
  {
    input: '  Ada@Example.COM  ',
    description: 'Surrounding whitespace trimmed and the domain lowercased',
    expected: forms('ada@example.com', 'Ada@example.com'),
  },
  {
    input: 'Ada.Lovelace@Example.com',
    description: 'A domain with no known provider keeps its dots',
    expected: forms('ada.lovelace@example.com', 'Ada.Lovelace@example.com'),
  },

  // Gmail dots and the googlemail.com alias.
  {
    input: 'Ada.Lovelace@gmail.com',
    description: 'Gmail ignores dots in the local part',
    expected: forms(
      'adalovelace@gmail.com',
      'Ada.Lovelace@gmail.com',
      undefined,
      'gmail',
    ),
  },
  {
    input: 'a.d.a@GMAIL.com',
    description: 'Every Gmail dot goes, and the domain is lowercased',
    expected: forms('ada@gmail.com', 'a.d.a@gmail.com', undefined, 'gmail'),
  },
  {
    input: 'Ada.Lovelace@googlemail.com',
    description: 'googlemail.com is an alias for gmail.com',
    expected: forms(
      'adalovelace@gmail.com',
      'Ada.Lovelace@googlemail.com',
      undefined,
      'gmail',
    ),
  },

  // `+` tags.
  {
    input: 'Ada.Lovelace+news@GoogleMail.com',
    description: 'Tag, dots, alias, and case all folded into the key',
    expected: forms(
      'adalovelace@gmail.com',
      'Ada.Lovelace+news@googlemail.com',
      undefined,
      'gmail',
    ),
  },
  {
    input: 'ada+a+b@gmail.com',
    description: 'The tag starts at the first separator',
    expected: forms('ada@gmail.com', 'ada+a+b@gmail.com', undefined, 'gmail'),
  },
  {
    input: '+news@gmail.com',
    description: 'Nothing before the separator, so the local part is kept',
    expected: forms('+news@gmail.com', '+news@gmail.com', undefined, 'gmail'),
  },
  {
    input: 'ada+news@fastmail.com',
    description: 'Fastmail drops a `+` tag',
    expected: forms(
      'ada@fastmail.com',
      'ada+news@fastmail.com',
      undefined,
      'fastmail',
    ),
  },
  {
    input: 'ada+news@yahoo.com',
    description: 'A provider with no `+` subaddressing keeps the tag',
    expected: forms(
      'ada+news@yahoo.com',
      'ada+news@yahoo.com',
      undefined,
      'yahoo',
    ),
  },
  {
    input: 'ada+news@example.com',
    description: 'A domain with no known provider keeps its `+` tag',
    expected: forms('ada+news@example.com', 'ada+news@example.com'),
    with: {
      options: { removeSubaddress: true },
      expected: forms('ada@example.com', 'ada+news@example.com'),
    },
  },

  // `-` tags and hyphens.
  {
    input: 'ada-news@example.com',
    description: 'A `-` tag is kept unless `-` is the separator',
    expected: forms('ada-news@example.com', 'ada-news@example.com'),
    with: {
      options: { removeSubaddress: true, subaddressSeparator: '-' },
      expected: forms('ada@example.com', 'ada-news@example.com'),
    },
  },
  {
    input: 'Ada-Lovelace@yandex.ru',
    description: 'Yandex reads a hyphen as a dot',
    expected: forms(
      'ada.lovelace@yandex.ru',
      'Ada-Lovelace@yandex.ru',
      undefined,
      'yandex',
    ),
  },

  // Fastmail subdomain addressing.
  {
    input: 'news@ada.fastmail.com',
    description: 'Fastmail delivers news@ada.fastmail.com to ada@fastmail.com',
    expected: forms(
      'ada@fastmail.com',
      'news@ada.fastmail.com',
      undefined,
      'fastmail',
    ),
  },
  {
    input: 'Shop+Deals@Ada.Fastmail.com',
    description: 'Subdomain addressing takes the subdomain whatever the tag',
    expected: forms(
      'ada@fastmail.com',
      'Shop+Deals@ada.fastmail.com',
      undefined,
      'fastmail',
    ),
  },

  // Google Workspace against Gmail.
  {
    input: 'A.da+news@mycompany.com',
    description:
      'A custom domain keeps dots and tag, and on Workspace only the tag goes',
    expected: forms('a.da+news@mycompany.com', 'A.da+news@mycompany.com'),
    with: {
      options: { provider: 'google-workspace' },
      expected: forms(
        'a.da@mycompany.com',
        'A.da+news@mycompany.com',
        undefined,
        'google-workspace',
      ),
    },
  },

  // Comments.
  {
    input: 'Ada(work)@gmail.com',
    description: 'A comment is kept in `address` and dropped from the rest',
    expected: unparsable,
    with: {
      options: { syntax: { allowComments: true } },
      expected: forms(
        'ada@gmail.com',
        'Ada(work)@gmail.com',
        'Ada@gmail.com',
        'gmail',
      ),
    },
  },
  {
    input: '(home)ada@(mx)example.com',
    description: 'Comments stay on their side of the `@`',
    expected: unparsable,
    with: {
      options: { syntax: { allowComments: true } },
      expected: forms(
        'ada@example.com',
        '(home)ada@(mx)example.com',
        'ada@example.com',
      ),
    },
  },

  // Quotes.
  {
    input: '"Ada"@gmail.com',
    description: 'Quotes that aren’t needed are dropped from the key',
    expected: unparsable,
    with: {
      options: { syntax: { preset: 'rfc5321' } },
      expected: forms('ada@gmail.com', '"Ada"@gmail.com', undefined, 'gmail'),
    },
  },
  {
    input: '"a".da@example.com',
    description: 'A quoted word among atoms loses its quotes in the key',
    expected: unparsable,
    with: {
      options: { syntax: { preset: 'rfc5322' } },
      expected: forms('a.da@example.com', '"a".da@example.com'),
    },
  },
  {
    input: '"a.da+x y"@gmail.com',
    description:
      'Quotes that are needed stay, and provider rules leave the inside alone',
    expected: unparsable,
    with: {
      options: { syntax: { preset: 'rfc5321' } },
      expected: forms(
        '"a.da+x y"@gmail.com',
        '"a.da+x y"@gmail.com',
        undefined,
        'gmail',
      ),
    },
  },

  // Inputs that don't parse.
  {
    input: '',
    description: 'Empty',
    expected: unparsable,
  },
  {
    input: 'not an email',
    description: 'No `@`',
    expected: unparsable,
  },
  {
    input: 'ada@localhost',
    description: 'A domain with no dot',
    expected: unparsable,
  },
  {
    input: 'ada@example.con',
    description: 'A TLD outside the IANA set',
    expected: unparsable,
    with: {
      options: { syntax: { checkTld: false } },
      expected: forms('ada@example.con', 'ada@example.con'),
    },
  },
  {
    input: 'ada..lovelace@gmail.com',
    description: 'Consecutive dots',
    expected: unparsable,
  },
];
