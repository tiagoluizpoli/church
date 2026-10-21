// biome-ignore-all lint/style/useNamingConvention: catalog keys are snake_case by spec
import { describe, expect, it } from 'bun:test';
import { checkI18nParity } from '../../validation/i18n-parity';

describe('i18n parity check', () => {
  it('passes for matching catalogs', () => {
    expect(
      checkI18nParity({
        en: { common_generic_error: 'Something went wrong.' },
        ptBR: { common_generic_error: 'Algo deu errado.' },
      }),
    ).toEqual([]);
  });

  it('fails when en has a key pt-BR is missing', () => {
    const failures = checkI18nParity({
      en: { common_generic_error: 'Something went wrong.', extra_key: 'Extra' },
      ptBR: { common_generic_error: 'Algo deu errado.' },
    });
    expect(failures).toContain('pt-BR missing key: extra_key');
  });

  it('fails when pt-BR has a key en is missing', () => {
    const failures = checkI18nParity({
      en: { common_generic_error: 'Something went wrong.' },
      ptBR: { common_generic_error: 'Algo deu errado.', extra_key: 'Extra' },
    });
    expect(failures).toContain('en missing key: extra_key');
  });

  it('fails naming all keys missing on each side', () => {
    const failures = checkI18nParity({
      en: { a: 'A', b: 'B' },
      ptBR: { a: 'A', c: 'C' },
    });
    expect(failures).toContain('pt-BR missing key: b');
    expect(failures).toContain('en missing key: c');
  });

  it('passes when params match', () => {
    expect(
      checkI18nParity({
        en: { error_foo: 'Error: {code}' },
        ptBR: { error_foo: 'Erro: {code}' },
      }),
    ).toEqual([]);
  });

  it('fails when pt-BR is missing a param', () => {
    const failures = checkI18nParity({
      en: { error_foo: 'Error: {code}' },
      ptBR: { error_foo: 'Erro genérico.' },
    });
    expect(failures).toContain('error_foo: pt-BR missing param {code}');
  });

  it('fails when en is missing a param that pt-BR has', () => {
    const failures = checkI18nParity({
      en: { error_foo: 'Erro genérico.' },
      ptBR: { error_foo: 'Erro: {code}' },
    });
    expect(failures).toContain('error_foo: en missing param {code}');
  });

  it('ignores $schema key', () => {
    expect(
      checkI18nParity({
        en: {
          $schema: 'https://inlang.com/schema/inlang-message-format',
          common_generic_error: 'Something went wrong.',
        },
        ptBR: {
          $schema: 'https://inlang.com/schema/inlang-message-format',
          common_generic_error: 'Algo deu errado.',
        },
      }),
    ).toEqual([]);
  });
});
