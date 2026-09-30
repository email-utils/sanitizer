/**
 * What is the address's canonical form? Provider-aware normalization: one
 * parse gives a uniqueness `key`, the `address` to email, and its SMTP
 * `envelope`, with the key built from the classifier's provider registry.
 *
 * @packageDocumentation
 */
import type { ParsedAddress } from '@email-utils/validator-syntax';
import { type NormalizedEmail, normalize } from './normalize';
import { type NormalizeOptions, resolve, type Rules } from './options';
import type { Result } from './result';

export type { NormalizedEmail } from './normalize';
export type { NormalizeOptions } from './options';
export type { ReasonCode, Result } from './result';

let defaults: Rules | undefined;

/**
 * Normalizes `email` into a uniqueness `key`, the `address` to email, and
 * its comment-free `envelope`, all from one parse.
 *
 * @remarks
 * `key` collapses every spelling that reaches the same mailbox, using the
 * provider's rules for domain aliases, subdomain addressing, dots, hyphens,
 * and subaddress tags; on a domain with no known provider, dots and tags are
 * kept. `key` is itself an address the same options parse, and normalizes to
 * itself. `address` and `envelope` only trim the input and lowercase the
 * domain. A string is trimmed of spaces, tabs, CRs, and LFs and then parsed
 * with the `syntax` options; a parsed address from validator-syntax's
 * `parseAddress` is used as is. A string longer than the `syntax` options'
 * `maxLength` (512 by default) fails before it's trimmed, so surrounding
 * whitespace counts toward it.
 *
 * @example
 * ```ts
 * import { normalizeEmail } from '@email-utils/sanitizer';
 *
 * normalizeEmail('Ada.Lovelace+news@GMAIL.com');
 * // => {
 * //   ok: true,
 * //   value: {
 * //     key: 'adalovelace@gmail.com',
 * //     address: 'Ada.Lovelace+news@gmail.com',
 * //     provider: 'gmail',
 * //   },
 * // }
 *
 * normalizeEmail('ada@');
 * // => { ok: false, reason: 'sanitizer.address.unparsable' }
 *
 * // Surrounding whitespace counts toward the 512-character `maxLength`.
 * normalizeEmail(`${' '.repeat(500)}ada@example.com`);
 * // => { ok: false, reason: 'sanitizer.address.unparsable' }
 *
 * // A custom domain's provider comes from its MX records.
 * normalizeEmail('A.da+news@example.com', { provider: 'google-workspace' });
 * // => { ok: true, value: { key: 'a.da@example.com' } }
 * ```
 *
 * @throws TypeError when `email` is neither a string nor a parsed address,
 * or `options` are malformed.
 */
export function normalizeEmail(
  email: string | ParsedAddress,
  options?: NormalizeOptions,
): Result<NormalizedEmail> {
  const rules =
    options === undefined ? (defaults ??= resolve()) : resolve(options);
  return normalize(email, rules);
}

/** {@link normalizeEmail} with options bound. */
export interface Sanitizer {
  normalize(email: string | ParsedAddress): Result<NormalizedEmail>;
}

/**
 * Binds `options` once, checking them and looking up the `provider` up
 * front, and returns {@link normalizeEmail} with them applied.
 *
 * @remarks
 * As with {@link normalizeEmail}, a string longer than the `syntax`
 * options' `maxLength` (512 by default) fails before it's trimmed, so
 * surrounding whitespace counts toward it.
 *
 * @example
 * ```ts
 * import { createSanitizer } from '@email-utils/sanitizer';
 *
 * const sanitize = createSanitizer({ syntax: { allowComments: true } });
 * sanitize.normalize('Ada.Lovelace+news(work)@googlemail.com');
 * // => {
 * //   ok: true,
 * //   value: {
 * //     key: 'adalovelace@gmail.com',
 * //     address: 'Ada.Lovelace+news(work)@googlemail.com',
 * //     envelope: 'Ada.Lovelace+news@googlemail.com',
 * //   },
 * // }
 *
 * // Malformed options throw here, not on every call.
 * createSanitizer({ subaddressSeparator: '--' }); // => throws TypeError
 * ```
 *
 * @throws TypeError when `options` are malformed.
 */
export function createSanitizer(options?: NormalizeOptions): Sanitizer {
  const rules = resolve(options);
  return {
    normalize: (email) => normalize(email, rules),
  };
}
