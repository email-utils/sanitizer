import { describe, expect, it } from 'vitest';
import EmailSanitizer from '../src';

// What 0.0.1 actually does, bugs included, so the rewrite's changes show up
// as deliberate diffs (sanitizer#7).
describe('0.0.1 characterization', () => {
  it('throws on a non-string', () => {
    const sanitizer = new EmailSanitizer();
    // JavaScript callers can pass anything.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    expect(() => sanitizer.sanitize(42 as unknown as string)).toThrow(
      'Email not a string. 42',
    );
  });

  it('throws on an empty string', () => {
    expect(() => new EmailSanitizer().sanitize('')).toThrow(
      'Email not provided.',
    );
  });

  it('leaves an address without @ alone when stripping dots and tags', () => {
    const sanitizer = new EmailSanitizer({
      local: { removePeriods: true, removePlusTag: true },
    });
    expect(sanitizer.sanitize('first.last+tag')).toBe('first.last+tag');
  });

  it('ignores a + that is in the domain', () => {
    const sanitizer = new EmailSanitizer({ local: { removePlusTag: true } });
    expect(sanitizer.sanitize('user@exa+mple.com')).toBe('user@exa+mple.com');
  });

  it('strips dots inside a quoted local part (a 0.0.1 bug)', () => {
    const sanitizer = new EmailSanitizer({ local: { removePeriods: true } });
    expect(sanitizer.sanitize('"first.last"@example.com')).toBe(
      '"firstlast"@example.com',
    );
  });

  it('sanitizeGSuite returns nothing (a 0.0.1 bug)', () => {
    const sanitizer = new EmailSanitizer();
    expect(
      sanitizer.sanitizeGSuite('First.Last+tag@example.com'),
    ).toBeUndefined();
    // It still mutates the instance, without lowercasing.
    expect(sanitizer.email).toBe('FirstLast@example.com');
  });
});
