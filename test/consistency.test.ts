// Against validator-syntax: the sanitizer never splits an address itself.
// validator-syntax's `parseAddress` does, and every form is built from its
// parts, so each must split exactly where `parseAddress` does, `@`, `.`, and
// `+` inside quotes and comments included.
import {
  createSyntaxValidator,
  type ParsedAddress,
  parseAddress,
  type SyntaxOptions,
} from '@email-utils/validator-syntax';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type NormalizedEmail, normalizeEmail } from '../src';
import {
  anyAddress,
  anyString,
  dotAtomLocal,
  providerAddress,
  quotedLocal,
  rfcDomain,
  syntaxOptions,
} from './arbitraries';

/** `email` trimmed as normalizeEmail trims it: of spaces, tabs, CRs, and LFs. */
function trimmed(email: string): string {
  return email.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
}

function parsed(email: string, syntax?: SyntaxOptions): ParsedAddress {
  const result = parseAddress(email, syntax);
  if (!result.ok) {
    throw new Error(`${email} didn't parse: ${result.reason}`);
  }
  return result.value;
}

function normalized(email: string, syntax?: SyntaxOptions): NormalizedEmail {
  const result = normalizeEmail(email, { syntax });
  if (!result.ok) {
    throw new Error(`${email} didn't normalize: ${result.reason}`);
  }
  return result.value;
}

const rfc5321: SyntaxOptions = { preset: 'rfc5321' };
const rfc5322: SyntaxOptions = { preset: 'rfc5322' };

describe('splits where parseAddress does', () => {
  // [input, syntax, the key's local part, the key's domain]
  it.each<[string, SyntaxOptions, string, string]>([
    ['"a@b"@example.com', rfc5321, '"a@b"', 'example.com'],
    ['"@"@example.com', rfc5321, '"@"', 'example.com'],
    ['"a@b.c+d"@gmail.com', rfc5321, '"a@b.c+d"', 'gmail.com'],
    ['"A.b+C d"@GoogleMail.com', rfc5321, '"a.b+c d"', 'gmail.com'],
    ['"x@y.z+t"@fastmail.com', rfc5321, '"x@y.z+t"', 'fastmail.com'],
    ['"a\\"@b"@example.com', rfc5321, '"a\\"@b"', 'example.com'],
    ['"a@b".c+d@gmail.com', rfc5322, '"a@b.c+d"', 'gmail.com'],
    ['a(x@y.z)@example.com', rfc5322, 'a', 'example.com'],
    ['"a+b"(c@d)@(e@f)example.com', rfc5322, 'a+b', 'example.com'],
    ['a@[IPv6:2001:DB8::1]', rfc5321, 'a', '[ipv6:2001:db8::1]'],
  ])('%s', (input, syntax, keyLocal, keyDomain) => {
    const parts = parsed(input, syntax);
    const forms = normalized(input, syntax);
    const domain = parts.domain.toLowerCase();
    expect(forms.envelope).toBe(`${parts.local}@${domain}`);
    expect(normalizeEmail(parts, { syntax })).toEqual(
      normalizeEmail(input, { syntax }),
    );
    // The key splits there too, with dots and tags inside the quotes kept.
    expect(parsed(forms.key, syntax)).toMatchObject({
      local: keyLocal,
      domain: keyDomain,
    });
  });

  it('keeps each comment on its side of the @ it split at', () => {
    expect(normalized('(a@b)x(c@d)@(e@f)example.com(g@h)', rfc5322)).toEqual({
      key: 'x@example.com',
      address: '(a@b)x(c@d)@(e@f)example.com(g@h)',
      envelope: 'x@example.com',
    });
  });
});

// Surrounding whitespace, sometimes enough to carry an address past the
// default `maxLength`.
const padding = fc.oneof(
  fc.string({ unit: fc.constantFrom(' ', '\t', '\r', '\n'), maxLength: 8 }),
  fc.nat(600).map((n) => ' '.repeat(n)),
);

// `maxLength` from well under an address to past the default, or none.
const maxLength = fc.option(
  fc.oneof(fc.integer({ min: 1, max: 600 }), fc.constant(Infinity)),
  { nil: undefined },
);

describe('agrees with parseAddress on generated input', () => {
  it('accepts exactly what parseAddress accepts, after trimming, up to `maxLength`', () => {
    fc.assert(
      fc.property(
        fc.oneof(providerAddress, anyAddress, anyString),
        padding,
        padding,
        syntaxOptions,
        maxLength,
        (address, before, after, options, max) => {
          const email = before + address + after;
          const syntax =
            max === undefined ? options : { ...options, maxLength: max };
          // The sanitizer checks `maxLength` before it trims, so padding
          // counts toward it, and input past it fails even when
          // parseAddress takes it trimmed.
          const fits = email.length <= createSyntaxValidator(syntax).maxLength;
          expect(normalizeEmail(email, { syntax }).ok).toBe(
            fits && parseAddress(trimmed(email), syntax).ok,
          );
        },
      ),
    );
  });

  it('builds `envelope` from parseAddress’s parts', () => {
    fc.assert(
      fc.property(
        fc.oneof(providerAddress, anyAddress),
        syntaxOptions,
        (email, syntax) => {
          const parts = parseAddress(trimmed(email), syntax);
          fc.pre(parts.ok);
          const { local, domain } = parts.value;
          const result = normalizeEmail(email, { syntax });
          expect(result).toMatchObject({
            ok: true,
            value: { envelope: `${local}@${domain.toLowerCase()}` },
          });
          expect(normalizeEmail(parts.value, { syntax })).toEqual(result);
        },
      ),
    );
  });

  it('builds `address` from parseAddress’s parts when there are no comments', () => {
    fc.assert(
      fc.property(
        fc.oneof(providerAddress, anyAddress),
        syntaxOptions,
        (email, syntax) => {
          const parts = parseAddress(trimmed(email), syntax);
          fc.pre(parts.ok && parts.value.comments.length === 0);
          const { local, domain } = parts.value;
          expect(normalizeEmail(email, { syntax })).toMatchObject({
            ok: true,
            value: { address: `${local}@${domain.toLowerCase()}` },
          });
        },
      ),
    );
  });

  it('keeps the quoted local parts the key needs, dots and tags inside', () => {
    fc.assert(
      fc.property(
        quotedLocal,
        fc.option(dotAtomLocal, { nil: undefined }),
        rfcDomain,
        (quoted, atoms, domain) => {
          // A quoted word followed by atoms is RFC 5322's obsolete syntax.
          const syntax = atoms === undefined ? rfc5321 : rfc5322;
          const local = atoms === undefined ? quoted : `${quoted}.${atoms}`;
          const email = `${local}@${domain}`;
          const parts = parseAddress(email, syntax);
          fc.pre(parts.ok);
          expect(parts.value.local).toBe(local);
          // The text needs its quotes, so the key keeps them around all of
          // it, lowercased, with every dot and separator where it was.
          const text = quoted.slice(1, -1).replace(/\\(.)/gu, '$1');
          const joined = atoms === undefined ? text : `${text}.${atoms}`;
          const keyLocal = `"${joined.toLowerCase().replace(/["\\]/g, '\\$&')}"`;
          const split = parsed(normalized(email, syntax).key, syntax);
          expect(split.local).toBe(keyLocal);
          // The key's domain is the one any local part gets at that domain.
          expect(split.domain).toBe(
            parsed(normalized(`x@${domain}`, syntax).key, syntax).domain,
          );
        },
      ),
    );
  });
});
