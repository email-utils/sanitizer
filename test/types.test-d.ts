// The public types: results narrow on `ok`, options accept what the runtime
// does and reject what it throws on, and the reason codes are exact.
import type { ProviderId } from '@email-utils/classifier/providers';
import {
  type ParsedAddress,
  parseAddress,
  type SyntaxOptions,
} from '@email-utils/validator-syntax';
import { describe, expectTypeOf, it } from 'vitest';
import {
  createSanitizer,
  type NormalizeOptions,
  type NormalizedEmail,
  normalizeEmail,
  type ReasonCode,
  type Result,
  type Sanitizer,
} from '../src';
import {
  type InvalidSanitizerEntry,
  previewSanitizerOptions,
  type SanitizerExpected,
  type SanitizerFixture,
  type SanitizerPreview,
  sanitizerFixtures,
  type ValidSanitizerEntry,
} from '../src/fixtures';

describe('Result', () => {
  it('narrows on `ok`', () => {
    const result = normalizeEmail('ada@example.com');
    expectTypeOf(result).toEqualTypeOf<Result<NormalizedEmail>>();
    if (result.ok) {
      expectTypeOf(result).toEqualTypeOf<{
        ok: true;
        value: NormalizedEmail;
      }>();
    } else {
      expectTypeOf(result).toEqualTypeOf<{
        ok: false;
        reason: ReasonCode;
        message?: string;
      }>();
    }
  });

  it('has a value only on success, and a reason only on failure', () => {
    const result = normalizeEmail('ada@example.com');
    // @ts-expect-error `value` needs `ok` checked first
    expectTypeOf(result.value).toBeObject();
    // @ts-expect-error `reason` needs `ok` checked first
    expectTypeOf(result.reason).toBeString();
  });

  it('carries any value type', () => {
    expectTypeOf<Extract<Result<number>, { ok: true }>['value']>().toBeNumber();
  });
});

describe('ReasonCode', () => {
  it('is exactly the sanitizer’s one code', () => {
    expectTypeOf<ReasonCode>().toEqualTypeOf<'sanitizer.address.unparsable'>();
  });

  it('is what a failure and a failed fixture carry', () => {
    expectTypeOf<
      Extract<Result<NormalizedEmail>, { ok: false }>['reason']
    >().toEqualTypeOf<ReasonCode>();
    expectTypeOf<Extract<SanitizerExpected, { ok: false }>>().toEqualTypeOf<{
      ok: false;
      reason: ReasonCode;
    }>();
    expectTypeOf<InvalidSanitizerEntry['reason']>().toEqualTypeOf<ReasonCode>();
  });
});

describe('NormalizedEmail', () => {
  it('has the three forms and an optional provider', () => {
    expectTypeOf<NormalizedEmail>().toEqualTypeOf<{
      key: string;
      address: string;
      envelope: string;
      provider?: ProviderId;
    }>();
  });
});

describe('normalizeEmail', () => {
  it('takes a string or what parseAddress returned', () => {
    expectTypeOf(normalizeEmail)
      .parameter(0)
      .toEqualTypeOf<string | ParsedAddress>();
    const parsed = parseAddress('ada@example.com');
    if (parsed.ok) {
      expectTypeOf(normalizeEmail).toBeCallableWith(parsed.value);
    }
  });

  it('rejects anything else', () => {
    // @ts-expect-error a number isn't an address
    expectTypeOf(normalizeEmail).toBeCallableWith(42);
    // @ts-expect-error a parsed address has `comments`
    expectTypeOf(normalizeEmail).toBeCallableWith({
      local: 'ada',
      domain: 'example.com',
    });
  });
});

describe('NormalizeOptions', () => {
  it('accepts every option, each also as undefined', () => {
    expectTypeOf(normalizeEmail).toBeCallableWith('ada@example.com', {
      syntax: { preset: 'rfc5321', allowUnicode: true },
      provider: 'google-workspace',
      providerRules: false,
      removePeriods: true,
      removeSubaddress: true,
      subaddressSeparator: '-',
    });
    expectTypeOf(normalizeEmail).toBeCallableWith('ada@example.com', {
      syntax: undefined,
      provider: undefined,
      providerRules: undefined,
      removePeriods: undefined,
      removeSubaddress: undefined,
      subaddressSeparator: undefined,
    });
  });

  it('types each option', () => {
    expectTypeOf<NormalizeOptions>().toEqualTypeOf<{
      syntax?: SyntaxOptions | undefined;
      provider?: ProviderId | undefined;
      providerRules?: boolean | undefined;
      removePeriods?: boolean | undefined;
      removeSubaddress?: boolean | undefined;
      subaddressSeparator?: string | undefined;
    }>();
  });

  it('takes any provider ID string, as the runtime does', () => {
    // An ID the registry doesn't know is treated as no provider.
    expectTypeOf<ProviderId>().toEqualTypeOf<string>();
  });

  it('rejects malformed options', () => {
    // @ts-expect-error options are an object
    expectTypeOf(normalizeEmail).toBeCallableWith('ada@example.com', 'gmail');
    expectTypeOf(normalizeEmail).toBeCallableWith('ada@example.com', {
      // @ts-expect-error the flags are booleans
      removePeriods: 'yes',
      // @ts-expect-error the flags are booleans
      providerRules: 1,
      // @ts-expect-error the separator is a string
      subaddressSeparator: 43,
      // @ts-expect-error the provider is an ID string
      provider: 42,
      // @ts-expect-error the syntax options are validator-syntax's
      syntax: { preset: 'loose' },
    });
    expectTypeOf(normalizeEmail).toBeCallableWith('ada@example.com', {
      // @ts-expect-error there's no such option
      removeDots: true,
    });
  });
});

describe('createSanitizer', () => {
  it('takes the same options and binds normalizeEmail', () => {
    expectTypeOf(createSanitizer).toBeCallableWith();
    expectTypeOf(createSanitizer)
      .parameter(0)
      .toEqualTypeOf<NormalizeOptions | undefined>();
    expectTypeOf(createSanitizer).returns.toEqualTypeOf<Sanitizer>();
    expectTypeOf<Sanitizer['normalize']>().toEqualTypeOf<
      (email: string | ParsedAddress) => Result<NormalizedEmail>
    >();
  });

  it('rejects malformed options', () => {
    // @ts-expect-error the flags are booleans
    expectTypeOf(createSanitizer).toBeCallableWith({ removeSubaddress: null });
    expectTypeOf<Sanitizer['normalize']>().toBeCallableWith(
      'ada@example.com',
      // @ts-expect-error a bound sanitizer takes no options
      {},
    );
  });
});

describe('the fixtures entry', () => {
  it('types the corpus', () => {
    expectTypeOf(sanitizerFixtures).toEqualTypeOf<
      readonly SanitizerFixture[]
    >();
    expectTypeOf<SanitizerFixture['with']>().toEqualTypeOf<
      { options: NormalizeOptions; expected: SanitizerExpected } | undefined
    >();
  });

  it('narrows an expected result on `ok`', () => {
    expectTypeOf<Extract<SanitizerExpected, { ok: true }>>().toEqualTypeOf<{
      ok: true;
      key: string;
      address: string;
      envelope: string;
      provider?: ProviderId;
    }>();
  });

  it('types the preview', () => {
    expectTypeOf(previewSanitizerOptions).toBeCallableWith();
    expectTypeOf(previewSanitizerOptions).toBeCallableWith(undefined, [
      'ada@example.com',
    ]);
    expectTypeOf(
      previewSanitizerOptions,
    ).returns.toEqualTypeOf<SanitizerPreview>();
    expectTypeOf<SanitizerPreview>().toEqualTypeOf<{
      valid: ValidSanitizerEntry[];
      invalid: InvalidSanitizerEntry[];
    }>();
    expectTypeOf<ValidSanitizerEntry>().toExtend<NormalizedEmail>();
    expectTypeOf<ValidSanitizerEntry['changed']>().toBeBoolean();
    expectTypeOf<InvalidSanitizerEntry['changed']>().toBeBoolean();
  });

  it('rejects addresses that aren’t strings', () => {
    // @ts-expect-error the addresses are strings
    expectTypeOf(previewSanitizerOptions).toBeCallableWith(undefined, [42]);
    expectTypeOf(previewSanitizerOptions).toBeCallableWith(
      undefined,
      // @ts-expect-error the addresses are an array
      'ada@example.com',
    );
  });
});
