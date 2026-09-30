// normalizeEmail's one pass: parse (or take a parsed address), then build
// `address`, `envelope`, and `key` from the same parts, so the three can't
// disagree about what the input was.
import {
  getProvider,
  type ProviderId,
  type ProviderInfo,
} from '@email-utils/classifier/providers';
import type {
  AddressComment,
  ParsedAddress,
} from '@email-utils/validator-syntax';
import type { Rules } from './options';
import type { Result } from './result';

/** The forms of one address, as {@link normalizeEmail} returns them. */
export interface NormalizedEmail {
  /**
   * Uniqueness key: two inputs that reach the same mailbox get the same key.
   * Store and compare it; never send mail to it. Normalizing it again, with
   * the same options, gives it back.
   */
  key: string;
  /**
   * The address to email: local-part case, dots, subaddress tag, and comments kept.
   * Valid in RFC 5322 headers such as `To:`.
   */
  address: string;
  /** `address` without comments: valid in the SMTP envelope (RFC 5321). */
  envelope: string;
  /** The provider whose rules built the key: the `provider` option, or detected from the domain. */
  provider?: ProviderId;
}

type Failure = Extract<Result<never>, { ok: false }>;

function unparsable(message: string): Failure {
  return { ok: false, reason: 'sanitizer.address.unparsable', message };
}

// RFC 5322 dot-atom, plus the non-ASCII RFC 6531 adds: a local part that
// matches needs no quotes.
const DOT_ATOM =
  /^[\w!#$%&'*+/=?^`{|}~\u0080-\u{10FFFF}-]+(?:\.[\w!#$%&'*+/=?^`{|}~\u0080-\u{10FFFF}-]+)*$/u;

/**
 * The key's local part: lowercased, with quotes dropped where they aren't
 * needed. `"Ada"`, `"a".da` and `ada` name the same mailbox, so they share
 * a key. `rules` is false when the quotes had to stay; provider rules then
 * leave the dots and separators inside alone.
 */
function keyLocal(local: string): { local: string; rules: boolean } {
  if (!local.includes('"')) {
    return { local: local.toLowerCase(), rules: true };
  }
  // Undo the quoting: quoted strings lose their quotes and backslashes,
  // atoms and dots between them stay as they are.
  let text = '';
  let quoted = false;
  for (let i = 0; i < local.length; i++) {
    const char = local[i];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === '\\' && quoted) {
      i++;
      text += local[i] ?? '';
    } else {
      text += char;
    }
  }
  text = text.toLowerCase();
  return DOT_ATOM.test(text)
    ? { local: text, rules: true }
    : { local: `"${text.replace(/["\\]/g, '\\$&')}"`, rules: false };
}

function commentsAt(
  comments: readonly AddressComment[],
  positions: readonly AddressComment['position'][],
): string {
  let out = '';
  for (const comment of comments) {
    if (positions.includes(comment.position)) {
      out += `(${comment.text})`;
    }
  }
  return out;
}

/**
 * `address`: the parts as written with the domain lowercased and each
 * comment kept on its side of the `@`. A comment between the words of the
 * local part or the labels of the domain (RFC 5322's obsolete syntax) moves
 * to the end of that part, since a comment is never part of the mailbox.
 */
function withComments(
  local: string,
  domain: string,
  comments: readonly AddressComment[],
): string {
  if (comments.length === 0) {
    return `${local}@${domain}`;
  }
  return (
    commentsAt(comments, ['before-local']) +
    local +
    commentsAt(comments, ['inside-local', 'after-local']) +
    '@' +
    commentsAt(comments, ['before-domain']) +
    domain +
    commentsAt(comments, ['inside-domain', 'after-domain'])
  );
}

/**
 * The part of `domain` after its first label, when that's one of
 * `provider`'s domains and the label is an ASCII atom. A mailbox name is
 * ASCII at every provider that addresses by subdomain, and an ASCII atom is
 * a local part every preset parses.
 */
function parentDomain(
  domain: string,
  provider: ProviderInfo,
): string | undefined {
  const dot = domain.indexOf('.');
  const parent = domain.slice(dot + 1);
  return dot > 0 &&
    /^[\w!#$%&'*+/=?^`{|}~-]+$/.test(domain.slice(0, dot)) &&
    provider.domains.includes(parent)
    ? parent
    : undefined;
}

/**
 * `local` with the dots the provider rules left out of place collapsed and
 * trimmed, so the key stays a dot-atom: `a.+tag` loses its tag as `a`, not
 * `a.`. `before`, the local part the rules started from, stands in when
 * nothing would be left, and when the rules changed nothing: html5 takes
 * `a..b`, and it's then already a key that normalizes to itself.
 */
function tidyDots(local: string, before: string): string {
  if (local === before) {
    return local;
  }
  const tidied = local.replace(/\.{2,}/g, '.').replace(/^\.|\.$/g, '');
  return tidied === '' ? before : tidied;
}

/** The uniqueness key, with the rows the API page marks "provider-rule". */
function toKey(
  parsedLocal: string,
  domain: string,
  provider: ProviderInfo | undefined,
  rules: Rules,
): string {
  let { local, rules: localRules } = keyLocal(parsedLocal);
  const known = rules.providerRules ? provider : undefined;
  if (known !== undefined) {
    // Subdomain addressing: news@ada.fastmail.com delivers to ada@fastmail.com.
    const parent = known.subdomainAddressing
      ? parentDomain(domain, known)
      : undefined;
    if (parent !== undefined) {
      local = domain.slice(0, domain.indexOf('.'));
      localRules = true;
      domain = parent;
    }
    if (known.canonicalDomain !== undefined && known.domains.includes(domain)) {
      domain = known.canonicalDomain;
    }
  }
  if (localRules) {
    const before = local;
    const separator = known?.subaddressSeparator ?? rules.subaddressSeparator;
    if (rules.removeSubaddress ?? known?.subaddressSeparator !== undefined) {
      // The tag starts at the first separator, unless nothing comes before it.
      const at = local.indexOf(separator);
      if (at > 0) {
        local = local.slice(0, at);
      }
    }
    if (known?.hyphensSignificant === false) {
      local = local.replaceAll('-', '.');
    }
    if (rules.removePeriods ?? known?.dotsSignificant === false) {
      local = local.replaceAll('.', '');
    }
    local = tidyDots(local, before);
  }
  return `${local}@${domain}`;
}

/**
 * `email` without the space, tab, CR, and LF around it: the whitespace
 * validator-syntax knows. `trim()` would also take Unicode spaces, such as
 * U+00A0, that an RFC 6531 local part may start or end with.
 */
function trimWhitespace(email: string): string {
  return email.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
}

/**
 * The parsed address `email` stands for, or a failure for a string the
 * syntax options reject or a parsed address with an empty half.
 *
 * @throws TypeError when `email` is neither a string nor an object with
 * string `local` and `domain`.
 */
function partsOf(
  email: string | ParsedAddress,
  rules: Rules,
): Result<ParsedAddress> {
  if (typeof email === 'string') {
    const parsed = rules.syntax.parse(trimWhitespace(email));
    return parsed.ok
      ? parsed
      : unparsable(parsed.message ?? `Rejected as ${parsed.reason}`);
  }
  if (
    typeof email !== 'object' ||
    email === null ||
    typeof email.local !== 'string' ||
    typeof email.domain !== 'string'
  ) {
    throw new TypeError(
      `Expected a string or a parsed address, got ${email === null ? 'null' : typeof email}`,
    );
  }
  return email.local === '' || email.domain === ''
    ? unparsable('The parsed address has an empty local part or domain')
    : { ok: true, value: email };
}

/** {@link normalizeEmail} with its options already resolved. */
export function normalize(
  email: string | ParsedAddress,
  rules: Rules,
): Result<NormalizedEmail> {
  const parts = partsOf(email, rules);
  if (!parts.ok) {
    return parts;
  }
  const { local } = parts.value;
  // JavaScript callers may build a parsed address without `comments`.
  const comments: readonly AddressComment[] = Array.isArray(
    parts.value.comments,
  )
    ? parts.value.comments
    : [];
  const domain = parts.value.domain.toLowerCase();
  const provider = rules.detect
    ? getProvider({ ...parts.value, domain })
    : rules.provider;
  const value: NormalizedEmail = {
    key: toKey(local, domain, provider, rules),
    address: withComments(local, domain, comments),
    envelope: `${local}@${domain}`,
  };
  if (provider !== undefined && rules.providerRules) {
    value.provider = provider.id;
  }
  return { ok: true, value };
}
