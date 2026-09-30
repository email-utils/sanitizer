// What the benches run: the built package, its validator-syntax, and 0.0.1
// from npm, all through Node's own `require`. Not src: under Vitest's
// module runner every call between src's modules goes through an export
// getter (https://vitest.dev/guide/benchmarking#module-runner-overhead),
// which Vitest warns about and which isn't the code users run.
// `npm run bench` builds first; run `npm run build` before a bare
// `vitest bench`, or it measures whatever dist/ holds.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import type * as Syntax from '@email-utils/validator-syntax';
import type * as Root from '../src';
import type * as Fixtures from '../src/fixtures';
import type EmailSanitizer from '../test/legacy/sanitizer';

const require = createRequire(import.meta.url);

if (!existsSync(new URL('../dist/index.cjs', import.meta.url))) {
  throw new Error('The benches run the built package: run `npm run build`');
}

/** The v1 root entry, as built. */
export const sanitizer: typeof Root = require('../dist/index.cjs');

/** The v1 fixtures entry, as built. */
export const fixtures: typeof Fixtures = require('../dist/fixtures.cjs');

/**
 * validator-syntax as the built sanitizer requires it, so `parseAddress`
 * and `normalizeEmail` run the same copy of the parser.
 */
export const syntax: typeof Syntax = require('@email-utils/validator-syntax');

/**
 * The 0.0.1 sanitizer, from the `sanitizer-0.0.1` alias of
 * `@email-utils/sanitizer@0.0.1-2`. It's CommonJS, with the class on
 * `exports.default` and no types, so it's typed from the verbatim copy in
 * test/legacy.
 */
const legacy: { default: typeof EmailSanitizer } = require('sanitizer-0.0.1');
export const LegacySanitizer: typeof EmailSanitizer = legacy.default;
