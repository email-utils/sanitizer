// The shared result shapes from the API conventions
// (https://email-utils.github.io/meta/docs/reference/conventions#results),
// declared here so no package depends on another for types.

/**
 * The `sanitizer.*` codes from the reason-code catalogue
 * (https://email-utils.github.io/meta/docs/reference/reason-codes#sanitizer).
 */
export type ReasonCode = 'sanitizer.address.unparsable';

/**
 * A normalization result: the value on success, or why there was nothing to
 * normalize. Branch on `reason`, never on `message`, which isn't
 * semver-stable.
 */
export type Result<T> =
  { ok: true; value: T } | { ok: false; reason: ReasonCode; message?: string };
