import {
  type ProviderId,
  type ProviderInfo,
  providers,
} from '@email-utils/classifier/providers';
import {
  createSyntaxValidator,
  type SyntaxOptions,
  type SyntaxValidator,
} from '@email-utils/validator-syntax';

/** Options for {@link normalizeEmail} and {@link createSanitizer}. */
export interface NormalizeOptions {
  /** How the input is parsed. @defaultValue the validator-syntax `practical` preset */
  syntax?: SyntaxOptions | undefined;
  /**
   * The provider when it's known from elsewhere, usually validator-dns's
   * `detectProviderByMx` for a custom domain. Takes precedence over detection
   * from the domain. An ID the registry doesn't know is treated as no provider.
   */
  provider?: ProviderId | undefined;
  /** Key only: apply the provider's rules. @defaultValue true */
  providerRules?: boolean | undefined;
  /** Key only: force dot removal regardless of provider. @defaultValue provider-driven */
  removePeriods?: boolean | undefined;
  /** Key only: force subaddress removal regardless of provider. @defaultValue provider-driven */
  removeSubaddress?: boolean | undefined;
  /** Key only: the separator `removeSubaddress` uses when the provider has none. @defaultValue '+' */
  subaddressSeparator?: string | undefined;
}

/** Options checked and looked up once, for every call that shares them. */
export interface Rules {
  syntax: SyntaxValidator;
  /** Look the provider up from the domain; false once `provider` is given. */
  detect: boolean;
  /** The `provider` option's registry entry, if it named one. */
  provider: ProviderInfo | undefined;
  providerRules: boolean;
  removePeriods: boolean | undefined;
  removeSubaddress: boolean | undefined;
  subaddressSeparator: string;
}

// Built on first use of the `provider` option, like the classifier's own
// domain index.
let byId: ReadonlyMap<ProviderId, ProviderInfo> | undefined;

function lookup(id: ProviderId): ProviderInfo | undefined {
  byId ??= new Map(providers.map((provider) => [provider.id, provider]));
  return byId.get(id);
}

function flag(
  options: NormalizeOptions,
  name: 'providerRules' | 'removePeriods' | 'removeSubaddress',
): boolean | undefined {
  const value = options[name];
  if (value !== undefined && typeof value !== 'boolean') {
    throw new TypeError(`Expected \`${name}\` to be a boolean`);
  }
  return value;
}

/**
 * Checks `options` and resolves them into {@link Rules}.
 *
 * @throws TypeError when `options` are malformed.
 */
export function resolve(options: NormalizeOptions = {}): Rules {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('Expected `options` to be an object');
  }
  const { provider, subaddressSeparator = '+' } = options;
  if (provider !== undefined && typeof provider !== 'string') {
    throw new TypeError('Expected `provider` to be a provider ID string');
  }
  // One UTF-16 unit: the registry's separators are all single ASCII
  // characters, and the local part is split on the first one.
  if (
    typeof subaddressSeparator !== 'string' ||
    subaddressSeparator.length !== 1
  ) {
    throw new TypeError(
      'Expected `subaddressSeparator` to be a single character',
    );
  }
  return {
    syntax: createSyntaxValidator(options.syntax),
    detect: provider === undefined,
    provider: provider === undefined ? undefined : lookup(provider),
    providerRules: flag(options, 'providerRules') ?? true,
    removePeriods: flag(options, 'removePeriods'),
    removeSubaddress: flag(options, 'removeSubaddress'),
    subaddressSeparator,
  };
}
