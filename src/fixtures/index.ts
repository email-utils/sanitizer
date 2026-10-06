/**
 * The sanitizer corpus, published as `@email-utils/sanitizer/fixtures` so
 * dependents can check they key addresses exactly as `normalizeEmail` does,
 * and so the docs can preview a configuration on real addresses.
 *
 * @remarks
 * Every fixture's `expected` is the result under the default options: the
 * `practical` syntax preset, provider rules on, and the provider detected
 * from the domain. A fixture whose feature needs an option (comments,
 * quotes, a `-` separator, a custom domain's provider) also carries `with`,
 * the result under that one option.
 *
 * @packageDocumentation
 */
import { createSanitizer, normalizeEmail } from '../index';
import type { NormalizedEmail } from '../normalize';
import type { NormalizeOptions } from '../options';
import type { ReasonCode } from '../result';
import { sanitizerFixtures } from './corpus';

export type { SanitizerExpected, SanitizerFixture } from './types';
export { sanitizerFixtures };

/** An input the configuration normalizes, and the forms it gets. */
export interface ValidSanitizerEntry extends NormalizedEmail {
  input: string;
  /** The fixture's description; absent for addresses you pass in. */
  description?: string;
  /** Whether the default options give different forms, or reject it. */
  changed: boolean;
}

/** An input the configuration can't normalize, and why. */
export interface InvalidSanitizerEntry {
  input: string;
  /** The fixture's description; absent for addresses you pass in. */
  description?: string;
  reason: ReasonCode;
  message?: string;
  /** Whether the default options normalize it. */
  changed: boolean;
}

/** The inputs split by whether the configuration normalizes them. */
export interface SanitizerPreview {
  valid: ValidSanitizerEntry[];
  invalid: InvalidSanitizerEntry[];
}

/**
 * Runs `addresses` through `createSanitizer(options)` and splits them into
 * the ones it normalizes, with their forms, and the ones it can't, each list
 * in input order.
 *
 * @remarks
 * `changed` marks the inputs the options move: those the default options
 * would reject, accept, or key differently. With no options, nothing is
 * changed. The corpus inputs are judged by `options` alone; a fixture's
 * `with` isn't applied.
 *
 * @example
 * ```ts
 * import { previewSanitizerOptions } from '@email-utils/sanitizer/fixtures';
 *
 * previewSanitizerOptions({ provider: 'google-workspace' }, [
 *   'A.da+news@example.com',
 *   'ada@',
 * ]);
 * // => {
 * //   valid: [
 * //     {
 * //       input: 'A.da+news@example.com',
 * //       key: 'a.da@example.com',
 * //       changed: true,
 * //     },
 * //   ],
 * //   invalid: [
 * //     {
 * //       input: 'ada@',
 * //       reason: 'sanitizer.address.unparsable',
 * //       changed: false,
 * //     },
 * //   ],
 * // }
 *
 * // With no addresses, it previews the corpus: the comment fixtures now pass.
 * previewSanitizerOptions({ syntax: { allowComments: true } })
 *   .valid.filter((entry) => entry.changed)
 *   .map((entry) => entry.input);
 * // => ['Ada(work)@gmail.com', '(home)ada@(mx)example.com']
 * ```
 *
 * @param addresses - The inputs to normalize; the corpus's by default.
 * @throws TypeError when `options` are malformed or name an option that
 * doesn't exist, or `addresses` isn't an array of strings.
 */
export function previewSanitizerOptions(
  options?: NormalizeOptions,
  addresses?: readonly string[],
): SanitizerPreview {
  const sanitizer = createSanitizer(options);
  const entries = addresses === undefined ? sanitizerFixtures : own(addresses);
  const valid: ValidSanitizerEntry[] = [];
  const invalid: InvalidSanitizerEntry[] = [];
  for (const { input, description } of entries) {
    const result = sanitizer.normalize(input);
    const defaults = options === undefined ? result : normalizeEmail(input);
    const described = description === undefined ? {} : { description };
    if (result.ok) {
      const changed = !defaults.ok || !same(result.value, defaults.value);
      valid.push({ input, ...described, ...result.value, changed });
    } else {
      const { ok: _, ...failure } = result;
      invalid.push({ input, ...described, ...failure, changed: defaults.ok });
    }
  }
  return { valid, invalid };
}

function same(a: NormalizedEmail, b: NormalizedEmail): boolean {
  return (
    a.key === b.key &&
    a.address === b.address &&
    a.envelope === b.envelope &&
    a.provider === b.provider
  );
}

/** Checks the caller's addresses, before any of them is normalized. */
function own(
  addresses: readonly string[],
): { input: string; description?: undefined }[] {
  if (!Array.isArray(addresses)) {
    throw new TypeError('Expected the addresses to be an array');
  }
  return addresses.map((input: unknown, i) => {
    if (typeof input !== 'string') {
      throw new TypeError(`Expected addresses[${i}] to be a string`);
    }
    return { input };
  });
}
