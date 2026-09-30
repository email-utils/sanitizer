// The 0.0.1 behaviors sanitizer#7 changed, each pinned twice: what the 0.0.1
// class returned, checked against it here so each case keeps showing what it
// was, and what normalizeEmail returns now.
import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '../src';
import EmailSanitizer from './legacy/sanitizer';

const unparsable = { ok: false, reason: 'sanitizer.address.unparsable' };

function keyOf(result: ReturnType<typeof normalizeEmail>): string {
  if (!result.ok) {
    throw new Error(`didn't normalize: ${result.reason}`);
  }
  return result.value.key;
}

describe('input problems are results, not throws', () => {
  it('the empty string', () => {
    expect(() => new EmailSanitizer().sanitize('')).toThrow(
      'Email not provided.',
    );
    expect(normalizeEmail('')).toMatchObject(unparsable);
  });

  it('a non-string still throws, now as TypeError', () => {
    // JavaScript callers can pass anything.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const notString = 42 as unknown as string;
    expect(() => new EmailSanitizer().sanitize(notString)).toThrow(
      'Email not a string. 42',
    );
    expect(() => normalizeEmail(notString)).toThrow(TypeError);
  });

  it('an address with no @ comes back unparsable instead of unchanged', () => {
    const sanitizer = new EmailSanitizer({
      local: { removePeriods: true, removePlusTag: true },
    });
    expect(sanitizer.sanitize('first.last+tag')).toBe('first.last+tag');
    expect(normalizeEmail('first.last+tag')).toMatchObject(unparsable);
  });

  it('a + in the domain comes back unparsable instead of unchanged', () => {
    const sanitizer = new EmailSanitizer({ local: { removePlusTag: true } });
    expect(sanitizer.sanitize('user@exa+mple.com')).toBe('user@exa+mple.com');
    expect(normalizeEmail('user@exa+mple.com')).toMatchObject(unparsable);
  });
});

describe('Gmail rules come from the provider, not flags', () => {
  // 0.0.1's own suite expected these with its default config, and they
  // failed: it stripped nothing unless told to, on every domain alike.
  it.each([
    ['test.testing@gmail.com', 'testtesting@gmail.com'],
    ['test+thisisacomment@gmail.com', 'test@gmail.com'],
    ['test.testing+thisisacomment@gmail.com', 'testtesting@gmail.com'],
  ])('%s', (email, expected) => {
    expect(new EmailSanitizer().sanitize(email)).toBe(email);
    expect(keyOf(normalizeEmail(email))).toBe(expected);
  });

  it('the flags no longer strip dots on domains where they matter', () => {
    const sanitizer = new EmailSanitizer({
      local: { removePeriods: true, removePlusTag: true },
    });
    expect(sanitizer.sanitize('First.Last+tag@outlook.com')).toBe(
      'firstlast@outlook.com',
    );
    expect(keyOf(normalizeEmail('First.Last+tag@outlook.com'))).toBe(
      'first.last@outlook.com',
    );
  });
});

describe('case', () => {
  it('`lowercase: false` becomes `address`, and the key is always lowercase', () => {
    const sanitizer = new EmailSanitizer({ common: { lowercase: false } });
    expect(sanitizer.sanitize('tesT@Example.com')).toBe('tesT@Example.com');
    expect(normalizeEmail('tesT@Example.com')).toMatchObject({
      ok: true,
      value: { key: 'test@example.com', address: 'tesT@example.com' },
    });
  });
});

describe('quoted local parts', () => {
  it('dots inside quotes the address needs are kept', () => {
    const sanitizer = new EmailSanitizer({ local: { removePeriods: true } });
    expect(sanitizer.sanitize('"first.last name"@example.com')).toBe(
      '"firstlast name"@example.com',
    );
    expect(
      keyOf(
        normalizeEmail('"first.last name"@example.com', {
          syntax: { preset: 'rfc5321' },
          removePeriods: true,
        }),
      ),
    ).toBe('"first.last name"@example.com');
  });

  it('a tag separator inside quotes is not a tag', () => {
    const sanitizer = new EmailSanitizer({ local: { removePlusTag: true } });
    expect(sanitizer.sanitize('"a+b c"@gmail.com')).toBe('"a@gmail.com');
    expect(
      keyOf(
        normalizeEmail('"a+b c"@gmail.com', { syntax: { preset: 'rfc5321' } }),
      ),
    ).toBe('"a+b c"@gmail.com');
  });
});

describe('sanitizeGSuite is replaced by the google-workspace rules', () => {
  it('returned nothing, and stripped dots Workspace keeps', () => {
    const sanitizer = new EmailSanitizer();
    expect(
      sanitizer.sanitizeGSuite('First.Last+tag@example.com'),
    ).toBeUndefined();
    // It only mutated the instance, without lowercasing.
    expect(sanitizer.email).toBe('FirstLast@example.com');
    expect(
      keyOf(
        normalizeEmail('First.Last+tag@example.com', {
          provider: 'google-workspace',
        }),
      ),
    ).toBe('first.last@example.com');
  });
});
