// The configuration preview: the real sanitizer's split of the corpus or the
// caller's addresses, and which of them the options move.
import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '../src';
import { previewSanitizerOptions, sanitizerFixtures } from '../src/fixtures';

/** `list`'s inputs in the order the corpus has them. */
function inCorpusOrder(list: readonly { input: string }[]): string[] {
  const listed = new Set(list.map(({ input }) => input));
  return sanitizerFixtures
    .map(({ input }) => input)
    .filter((input) => listed.has(input));
}

describe('previewSanitizerOptions', () => {
  it('matches the corpus with the default options', () => {
    const { valid, invalid } = previewSanitizerOptions();
    const judged = new Map<string, unknown>([
      ...valid.map(
        ({ input, key, address, envelope, provider }) =>
          [
            input,
            provider === undefined
              ? { ok: true, key, address, envelope }
              : { ok: true, key, address, envelope, provider },
          ] as const,
      ),
      ...invalid.map(
        ({ input, reason }) => [input, { ok: false, reason }] as const,
      ),
    ]);
    expect(judged.size).toBe(sanitizerFixtures.length);
    expect(
      sanitizerFixtures.map(({ input }) => [input, judged.get(input)]),
    ).toEqual(
      sanitizerFixtures.map(({ input, expected }) => [input, expected]),
    );
    expect([...valid, ...invalid].some(({ changed }) => changed)).toBe(false);
  });

  it('changes nothing with options that match the defaults', () => {
    const { valid, invalid } = previewSanitizerOptions({
      syntax: { preset: 'practical' },
      providerRules: true,
    });
    expect([...valid, ...invalid].some(({ changed }) => changed)).toBe(false);
  });

  it('keeps the corpus order and descriptions', () => {
    const { valid, invalid } = previewSanitizerOptions();
    const fixture = sanitizerFixtures.find(({ expected }) => expected.ok)!;
    const { ok: _, ...forms } = fixture.expected;
    expect(valid.find(({ input }) => input === fixture.input)).toEqual({
      input: fixture.input,
      description: fixture.description,
      ...forms,
      changed: false,
    });
    expect(valid.map(({ input }) => input)).toEqual(inCorpusOrder(valid));
    expect(invalid.map(({ input }) => input)).toEqual(inCorpusOrder(invalid));
  });

  it.each(
    sanitizerFixtures.flatMap((fixture) =>
      fixture.with === undefined ? [] : [[fixture.input, fixture] as const],
    ),
  )('gives %s its `with` result under that option', (input, fixture) => {
    const { options, expected } = fixture.with!;
    const { ok: _, ...forms } = expected;
    expect(
      previewSanitizerOptions(options).valid.find(
        (entry) => entry.input === input,
      ),
    ).toEqual({
      input,
      description: fixture.description,
      ...forms,
      changed: true,
    });
  });

  it('moves the comment fixtures into `valid` when comments are allowed', () => {
    const before = previewSanitizerOptions();
    expect(before.invalid).toContainEqual(
      expect.objectContaining({
        input: 'Ada(work)@gmail.com',
        reason: 'sanitizer.address.unparsable',
        changed: false,
      }),
    );
    const after = previewSanitizerOptions({ syntax: { allowComments: true } });
    expect(after.valid).toContainEqual(
      expect.objectContaining({
        input: 'Ada(work)@gmail.com',
        address: 'Ada(work)@gmail.com',
        envelope: 'Ada@gmail.com',
        changed: true,
      }),
    );
  });

  it('marks inputs the defaults reject as changed', () => {
    const failed = normalizeEmail('ada@localhost');
    if (failed.ok) {
      throw new Error('ada@localhost normalized');
    }
    const { ok: _, ...failure } = failed;
    expect(
      previewSanitizerOptions({ syntax: { checkTld: false } }, [
        'ada@example.con',
        'ada@localhost',
      ]),
    ).toEqual({
      valid: [
        {
          input: 'ada@example.con',
          key: 'ada@example.con',
          address: 'ada@example.con',
          envelope: 'ada@example.con',
          changed: true,
        },
      ],
      invalid: [{ input: 'ada@localhost', ...failure, changed: false }],
    });
  });

  it('judges your own addresses, with no description', () => {
    const addresses = [
      'Ada+x@Example.com',
      'ada@localhost',
      'Ada+x@Example.com',
    ];
    const forms = {
      key: 'ada@example.com',
      address: 'Ada+x@example.com',
      envelope: 'Ada+x@example.com',
    };
    expect(
      previewSanitizerOptions({ removeSubaddress: true }, addresses),
    ).toEqual({
      valid: [
        { input: 'Ada+x@Example.com', ...forms, changed: true },
        { input: 'Ada+x@Example.com', ...forms, changed: true },
      ],
      invalid: [
        expect.objectContaining({ input: 'ada@localhost', changed: false }),
      ],
    });
  });

  it('previews nothing for an empty list', () => {
    expect(previewSanitizerOptions({ removePeriods: true }, [])).toEqual({
      valid: [],
      invalid: [],
    });
  });

  it.each<[string, unknown, unknown]>([
    ['options that aren’t an object', 'strict', undefined],
    ['a malformed option', { removePeriods: 'yes' }, undefined],
    ['malformed syntax options', { syntax: { preset: 'loose' } }, undefined],
    ['addresses that aren’t an array', undefined, 'ada@example.com'],
    ['a non-string address', undefined, ['ada@example.com', 42]],
  ])('throws a TypeError for %s', (_, options, addresses) => {
    expect(() =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      previewSanitizerOptions(options as never, addresses as never),
    ).toThrow(TypeError);
  });
});
