import { parseAddress } from '@email-utils/validator-syntax';
import { describe, expect, it } from 'vitest';
import {
  createSanitizer,
  type NormalizeOptions,
  type NormalizedEmail,
  normalizeEmail,
} from '../src';

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

function key(email: string, options?: NormalizeOptions): string {
  return normalized(email, options).key;
}

const rfc5321: NormalizeOptions = { syntax: { preset: 'rfc5321' } };
const rfc5322: NormalizeOptions = { syntax: { preset: 'rfc5322' } };

describe('the API page examples', () => {
  it('keys a Gmail address and keeps what was typed in `address`', () => {
    expect(normalizeEmail('Ada.Lovelace+news@GMAIL.com')).toEqual({
      ok: true,
      value: {
        key: 'adalovelace@gmail.com',
        address: 'Ada.Lovelace+news@gmail.com',
        envelope: 'Ada.Lovelace+news@gmail.com',
        provider: 'gmail',
      },
    });
  });

  it('keeps comments in `address` and drops them from `envelope`', () => {
    const sanitize = createSanitizer({ syntax: { allowComments: true } });
    expect(
      sanitize.normalize('Ada.Lovelace+news(work)@googlemail.com'),
    ).toEqual({
      ok: true,
      value: {
        key: 'adalovelace@gmail.com',
        address: 'Ada.Lovelace+news(work)@googlemail.com',
        envelope: 'Ada.Lovelace+news@googlemail.com',
        provider: 'gmail',
      },
    });
  });

  it('drops a subaddress tag from the key only', () => {
    expect(normalized('me+validatorsyntax@gmail.com')).toMatchObject({
      key: 'me@gmail.com',
      address: 'me+validatorsyntax@gmail.com',
    });
  });

  it('fails on input that does not parse', () => {
    expect(normalizeEmail('not an email')).toMatchObject({
      ok: false,
      reason: 'sanitizer.address.unparsable',
    });
  });

  it('applies Workspace rules to a custom domain given its provider', () => {
    expect(
      normalized('A.da+news@mycompany.com', { provider: 'google-workspace' }),
    ).toMatchObject({
      key: 'a.da@mycompany.com',
      address: 'A.da+news@mycompany.com',
      provider: 'google-workspace',
    });
  });
});

describe('every form', () => {
  it('trims surrounding whitespace', () => {
    expect(normalized(' \tAda@Example.com\n')).toEqual({
      key: 'ada@example.com',
      address: 'Ada@example.com',
      envelope: 'Ada@example.com',
    });
  });

  it('trims in linear time, whatever whitespace the input holds', () => {
    // A regex ending in `[ \t\r\n]+$` retries from every tab here, and took
    // seconds; the result is the same either way. With no `maxLength`, so
    // the input reaches the trim.
    const email = `a${'\t'.repeat(200_000)}b@example.com`;
    const start = performance.now();
    expect(
      normalizeEmail(email, { syntax: { maxLength: Infinity } }),
    ).toMatchObject({ ok: false });
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('keeps Unicode whitespace, which an RFC 6531 local part may hold', () => {
    const unicode: NormalizeOptions = {
      syntax: { allowComments: true, allowUnicode: true },
    };
    expect(normalized('(c)\u00a0a@example.com', unicode)).toMatchObject({
      key: '\u00a0a@example.com',
      envelope: '\u00a0a@example.com',
    });
  });

  it('lowercases the domain, including a literal', () => {
    expect(normalized('Ada@[IPv6:2001:DB8::1]', rfc5321)).toEqual({
      key: 'ada@[ipv6:2001:db8::1]',
      address: 'Ada@[ipv6:2001:db8::1]',
      envelope: 'Ada@[ipv6:2001:db8::1]',
    });
  });
});

/** The failure for input longer than `max`. */
function tooLong(max: number) {
  return {
    ok: false,
    reason: 'sanitizer.address.unparsable',
    message: `The input is longer than ${max} characters`,
  };
}

// Each padded input has spaces before it, `padStart`'s length in all.
describe('`maxLength`', () => {
  // A full-length address: a 64-character local part and a 189-character
  // domain, 254 characters in all.
  const long = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`;

  it('normalizes input exactly `maxLength` long, padding and all', () => {
    expect(long).toHaveLength(254);
    expect(normalized(long.padStart(512))).toMatchObject({ envelope: long });
  });

  it('fails on input one character over, before it is trimmed', () => {
    // parseAddress takes it once trimmed; the padding carries it over.
    expect(parseAddress(long).ok).toBe(true);
    expect(normalizeEmail(long.padStart(513))).toEqual(tooLong(512));
    expect(normalizeEmail(`${long}${' '.repeat(259)}`)).toEqual(tooLong(512));
  });

  it('counts every kind of surrounding whitespace', () => {
    const email = `\r\n${'\t'.repeat(250)}ada@example.com${' '.repeat(250)}`;
    expect(email).toHaveLength(517);
    expect(normalizeEmail(email)).toEqual(tooLong(512));
    expect(normalized(email.slice(5))).toMatchObject({
      envelope: 'ada@example.com',
    });
  });

  it('follows a lower `syntax.maxLength`', () => {
    const options: NormalizeOptions = { syntax: { maxLength: 20 } };
    expect(normalized('ada@example.com'.padStart(20), options)).toMatchObject({
      envelope: 'ada@example.com',
    });
    expect(normalizeEmail('ada@example.com'.padStart(21), options)).toEqual(
      tooLong(20),
    );
    expect(createSanitizer(options).normalize(' '.repeat(21))).toEqual(
      tooLong(20),
    );
  });

  it('follows a higher `syntax.maxLength`', () => {
    const options: NormalizeOptions = { syntax: { maxLength: 1024 } };
    expect(normalized(long.padStart(1024), options)).toMatchObject({
      envelope: long,
    });
    expect(normalizeEmail(long.padStart(1025), options)).toEqual(tooLong(1024));
  });

  it('has no limit with `maxLength: Infinity`', () => {
    const email = 'Ada@Example.com'.padStart(1_000_000);
    expect(
      normalizeEmail(email, { syntax: { maxLength: Infinity } }),
    ).toMatchObject({ ok: true, value: { envelope: 'Ada@example.com' } });
  });

  it('applies to createSanitizer as to normalizeEmail', () => {
    const cases: [NormalizeOptions | undefined, number][] = [
      [undefined, 512],
      [{ syntax: { maxLength: 300 } }, 300],
    ];
    for (const [options, max] of cases) {
      const sanitize = createSanitizer(options);
      for (const length of [299, 300, 301, 512, 513]) {
        const email = long.padStart(length);
        expect(sanitize.normalize(email)).toEqual(
          normalizeEmail(email, options),
        );
        expect(sanitize.normalize(email).ok).toBe(length <= max);
      }
    }
  });

  it('does not apply to a parsed address, which parseAddress already bounded', () => {
    const parts = {
      local: 'a'.repeat(600),
      domain: 'example.com',
      comments: [],
    };
    expect(normalizeEmail(parts, { syntax: { maxLength: 20 } })).toMatchObject({
      ok: true,
    });
  });
});

describe('comments', () => {
  it('keeps each comment on its side of the @ in `address`', () => {
    expect(normalized('(pre)Ada@(pd)Example.com(post)', rfc5322)).toEqual({
      key: 'ada@example.com',
      address: '(pre)Ada@(pd)example.com(post)',
      envelope: 'Ada@example.com',
    });
  });

  it('moves an obsolete comment inside a part to the end of that part', () => {
    expect(normalized('a.(c)b@example.(d)com', rfc5322)).toMatchObject({
      address: 'a.b(c)@example.com(d)',
      envelope: 'a.b@example.com',
    });
  });

  it('keeps nested and escaped comment text as written', () => {
    expect(normalized('a(x(y)z)(p\\)q)@example.com', rfc5322).address).toBe(
      'a(x(y)z)(p\\)q)@example.com',
    );
  });

  it('fails when the syntax options reject comments', () => {
    expect(normalizeEmail('ada(work)@example.com')).toMatchObject({
      ok: false,
      reason: 'sanitizer.address.unparsable',
    });
  });
});

describe('quoted local parts', () => {
  it('drops quotes the key does not need', () => {
    expect(normalized('"Ada"@example.com', rfc5321)).toMatchObject({
      key: 'ada@example.com',
      address: '"Ada"@example.com',
      envelope: '"Ada"@example.com',
    });
  });

  it('joins quoted and unquoted words (RFC 5322 obsolete syntax)', () => {
    expect(key('"a".Da@example.com', rfc5322)).toBe('a.da@example.com');
  });

  it('keeps quotes the key needs, re-escaping what must be', () => {
    expect(key('"A B"@example.com', rfc5321)).toBe('"a b"@example.com');
    expect(key('"A\\"B\\\\"@example.com', rfc5321)).toBe(
      '"a\\"b\\\\"@example.com',
    );
    expect(key('"a\\b"@example.com', rfc5321)).toBe('ab@example.com');
  });

  it('drops quotes around Unicode whitespace, which an atom may hold', () => {
    const options: NormalizeOptions = {
      syntax: { preset: 'rfc5321', allowUnicode: true },
    };
    expect(key('"\u00a0a"@example.com', options)).toBe('\u00a0a@example.com');
  });

  it('applies provider rules once the quotes are gone', () => {
    // "a.da+x" is the same local part as a.da+x.
    expect(key('"A.da+x"@gmail.com', rfc5321)).toBe('ada@gmail.com');
  });

  it('leaves dots and separators alone inside quotes it keeps', () => {
    expect(key('"a b.c+d"@gmail.com', rfc5321)).toBe('"a b.c+d"@gmail.com');
    expect(
      key('"a b.c+d"@example.com', {
        ...rfc5321,
        removePeriods: true,
        removeSubaddress: true,
      }),
    ).toBe('"a b.c+d"@example.com');
  });
});

describe('provider rules', () => {
  it('maps domain aliases to the canonical domain', () => {
    expect(key('ada@googlemail.com')).toBe('ada@gmail.com');
    expect(key('ada@me.com')).toBe('ada@icloud.com');
    expect(key('ada@ya.ru')).toBe('ada@yandex.ru');
  });

  it('leaves domains without a canonical one alone', () => {
    expect(normalized('ada@hotmail.com')).toMatchObject({
      key: 'ada@hotmail.com',
      provider: 'outlook',
    });
  });

  it('folds subdomain addressing into the local part', () => {
    expect(normalized('News@Ada.fastmail.com')).toEqual({
      key: 'ada@fastmail.com',
      address: 'News@ada.fastmail.com',
      envelope: 'News@ada.fastmail.com',
      provider: 'fastmail',
    });
  });

  it('folds subdomain addressing whatever the local part is', () => {
    expect(key('"any one"@ada.fastmail.com', rfc5321)).toBe('ada@fastmail.com');
  });

  it('does not fold a subdomain that is not an ASCII name', () => {
    // No Fastmail account has a non-ASCII name, and ü@ needs allowUnicode.
    expect(key('x@ü.fastmail.com', { syntax: { allowIdn: true } })).toBe(
      'x@ü.fastmail.com',
    );
  });

  it('keeps dots where they are significant', () => {
    expect(key('A.da+x@fastmail.com')).toBe('a.da@fastmail.com');
    expect(
      key('a.da@mycompany.com', { provider: 'google-workspace' }),
    ).not.toBe(key('ada@mycompany.com', { provider: 'google-workspace' }));
  });

  it('spells hyphens as dots where hyphens are not significant', () => {
    expect(key('My-Address+x@yandex.com')).toBe('my.address@yandex.ru');
    expect(key('my.address@ya.ru')).toBe('my.address@yandex.ru');
  });

  it('removes the tag from the first separator', () => {
    expect(key('me+a+b@gmail.com')).toBe('me@gmail.com');
  });

  it('keeps the local part whole when nothing comes before the separator', () => {
    expect(key('+news@gmail.com')).toBe('+news@gmail.com');
  });

  it('collapses and trims the dots the rules leave', () => {
    expect(key('a.+x@outlook.com')).toBe('a@outlook.com');
    expect(key('-Ada--Lovelace-@yandex.ru')).toBe('ada.lovelace@yandex.ru');
  });

  it('keeps the local part the rules would leave empty', () => {
    expect(key('-@yandex.ru')).toBe('-@yandex.ru');
    expect(key('-@yandex.ru', { removePeriods: true })).toBe('-@yandex.ru');
  });

  it('keeps tags on providers without a separator', () => {
    expect(normalized('me+x@yahoo.com')).toMatchObject({
      key: 'me+x@yahoo.com',
      provider: 'yahoo',
    });
  });
});

describe('unknown domains', () => {
  it('keeps dots and tags, and reports no provider', () => {
    expect(normalized('First.Last+tag@example.com')).toEqual({
      key: 'first.last+tag@example.com',
      address: 'First.Last+tag@example.com',
      envelope: 'First.Last+tag@example.com',
    });
  });

  it('does not treat a subdomain of a provider without subdomain addressing as it', () => {
    expect(normalized('a.da@mail.gmail.com')).toEqual({
      key: 'a.da@mail.gmail.com',
      address: 'a.da@mail.gmail.com',
      envelope: 'a.da@mail.gmail.com',
    });
  });
});

describe('the `provider` option', () => {
  it('takes precedence over detection from the domain', () => {
    expect(
      normalized('a.da+x@gmail.com', { provider: 'outlook' }),
    ).toMatchObject({ key: 'a.da@gmail.com', provider: 'outlook' });
  });

  it('applies local-part rules but not the domain mapping to a custom domain', () => {
    expect(key('A.da+x@mycompany.com', { provider: 'gmail' })).toBe(
      'ada@mycompany.com',
    );
  });

  it('does not fold subdomains outside the provider’s domains', () => {
    expect(key('news@ada.mycompany.com', { provider: 'fastmail' })).toBe(
      'news@ada.mycompany.com',
    );
  });

  it('treats an unknown ID as no provider, without detecting one', () => {
    expect(normalized('a.da+x@gmail.com', { provider: 'nope' })).toEqual({
      key: 'a.da+x@gmail.com',
      address: 'a.da+x@gmail.com',
      envelope: 'a.da+x@gmail.com',
    });
  });
});

describe('overrides', () => {
  it('`providerRules: false` skips the provider and does not report it', () => {
    expect(
      normalized('A.da+x@googlemail.com', { providerRules: false }),
    ).toEqual({
      key: 'a.da+x@googlemail.com',
      address: 'A.da+x@googlemail.com',
      envelope: 'A.da+x@googlemail.com',
    });
  });

  it('`removePeriods` overrides the provider either way', () => {
    expect(key('a.da@gmail.com', { removePeriods: false })).toBe(
      'a.da@gmail.com',
    );
    expect(key('a.da@example.com', { removePeriods: true })).toBe(
      'ada@example.com',
    );
  });

  it('`removeSubaddress` overrides the provider either way', () => {
    expect(key('me+x@gmail.com', { removeSubaddress: false })).toBe(
      'me+x@gmail.com',
    );
    expect(key('me+x@example.com', { removeSubaddress: true })).toBe(
      'me@example.com',
    );
  });

  it('`subaddressSeparator` applies when the provider has none', () => {
    const options: NormalizeOptions = {
      removeSubaddress: true,
      subaddressSeparator: '-',
    };
    expect(key('me-news+x@example.com', options)).toBe('me@example.com');
    expect(key('me-news@yahoo.com', options)).toBe('me@yahoo.com');
    // Gmail's own separator wins.
    expect(key('me-news+x@gmail.com', options)).toBe('me-news@gmail.com');
  });

  it('leaves dots html5 takes alone when no rule changes the local part', () => {
    // Trimming .a.a to a.a would expose a tag the next normalization cuts.
    const options: NormalizeOptions = {
      syntax: { preset: 'html5' },
      removeSubaddress: true,
      subaddressSeparator: '.',
    };
    expect(key('.a.a@example.com', options)).toBe('.a.a@example.com');
    expect(key('a..b@example.com', { syntax: { preset: 'html5' } })).toBe(
      'a..b@example.com',
    );
  });

  it('the overrides still apply with `providerRules: false`', () => {
    expect(
      key('a.da+x@gmail.com', {
        providerRules: false,
        removePeriods: true,
        removeSubaddress: true,
      }),
    ).toBe('ada@gmail.com');
  });
});

describe('parsed input', () => {
  it('takes what parseAddress returned', () => {
    const parsed = parseAddress('Ada+x(work)@GMAIL.com', {
      allowComments: true,
    });
    if (!parsed.ok) {
      throw new Error('fixture did not parse');
    }
    expect(normalizeEmail(parsed.value)).toEqual({
      ok: true,
      value: {
        key: 'ada@gmail.com',
        address: 'Ada+x(work)@gmail.com',
        envelope: 'Ada+x@gmail.com',
        provider: 'gmail',
      },
    });
  });

  it('takes a parsed address built without `comments`', () => {
    // JavaScript callers can pass anything.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const parsed = { local: 'Ada', domain: 'Example.com' } as never;
    expect(normalizeEmail(parsed)).toMatchObject({
      ok: true,
      value: { key: 'ada@example.com', address: 'Ada@example.com' },
    });
  });

  it('fails on a parsed address with an empty half', () => {
    expect(
      normalizeEmail({ local: '', domain: 'example.com', comments: [] }),
    ).toMatchObject({ ok: false, reason: 'sanitizer.address.unparsable' });
    expect(
      normalizeEmail({ local: 'ada', domain: '', comments: [] }),
    ).toMatchObject({ ok: false, reason: 'sanitizer.address.unparsable' });
  });
});

describe('errors', () => {
  it('returns a result for the empty string, which threw in 0.0.1', () => {
    expect(normalizeEmail('')).toEqual({
      ok: false,
      reason: 'sanitizer.address.unparsable',
      message: 'The address is empty',
    });
  });

  it.each([42, null, undefined, { local: 'a' }, { local: 1, domain: 'b' }])(
    'throws TypeError for %j',
    (email) => {
      // JavaScript callers can pass anything.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      expect(() => normalizeEmail(email as never)).toThrow(TypeError);
    },
  );

  it.each<[string, unknown]>([
    ['options', null],
    ['options', 'gmail'],
    ['provider', { provider: 42 }],
    ['providerRules', { providerRules: 'yes' }],
    ['removePeriods', { removePeriods: 1 }],
    ['removeSubaddress', { removeSubaddress: null }],
    ['subaddressSeparator', { subaddressSeparator: '' }],
    ['subaddressSeparator', { subaddressSeparator: '++' }],
    ['subaddressSeparator', { subaddressSeparator: 43 }],
    ['syntax', { syntax: { preset: 'loose' } }],
  ])('throws TypeError for a malformed `%s`', (_name, options) => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const bad = options as never;
    expect(() => normalizeEmail('ada@example.com', bad)).toThrow(TypeError);
    expect(() => createSanitizer(bad)).toThrow(TypeError);
  });
});

describe('createSanitizer', () => {
  it('matches normalizeEmail with the same options', () => {
    const options: NormalizeOptions = {
      provider: 'google-workspace',
      syntax: { allowComments: true },
    };
    const sanitize = createSanitizer(options);
    for (const email of [
      'A.da+x(c)@mycompany.com',
      'not an email',
      '"a"@example.com',
    ]) {
      expect(sanitize.normalize(email)).toEqual(normalizeEmail(email, options));
    }
  });

  it('uses the defaults without options', () => {
    expect(createSanitizer().normalize('A.da+x@gmail.com')).toEqual(
      normalizeEmail('A.da+x@gmail.com'),
    );
  });
});
