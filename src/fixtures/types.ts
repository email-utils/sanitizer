// The shape of a fixture. Each one carries its expected forms under the
// default options, so one table drives the tests, dependents' consistency
// tests, and the docs' configuration preview.
import type { ProviderId } from '@email-utils/classifier/providers';
import type { NormalizeOptions } from '../options';
import type { ReasonCode } from '../result';

/** What `normalizeEmail` gives for a fixture's input, without the failure `message`. */
export type SanitizerExpected =
  | {
      ok: true;
      key: string;
      address: string;
      envelope: string;
      provider?: ProviderId;
    }
  | { ok: false; reason: ReasonCode };

/**
 * One corpus input, what the default options give for it, and, when its
 * feature needs an option, what that option gives.
 */
export interface SanitizerFixture {
  /** The string passed to `normalizeEmail`, surrounding whitespace and all. */
  input: string;
  description: string;
  /** The result with the default options. */
  expected: SanitizerExpected;
  /**
   * The result with the one option that turns the fixture's feature on, for
   * inputs the defaults reject or leave alone: comments, quotes, `-` tags,
   * and custom domains.
   */
  with?: { options: NormalizeOptions; expected: SanitizerExpected };
}
