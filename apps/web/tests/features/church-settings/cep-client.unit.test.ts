import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CepLookupFailed,
  fromBrasilApi,
  fromViaCep,
  lookupCep,
  normalizeCep,
} from '@/features/church-settings/cep-client';

const FILLED = {
  cep: '13015904',
  street: 'Rua Barão de Jaguara',
  bairro: 'Centro',
  city: 'Campinas',
  uf: 'SP',
};

const VIACEP_BODY = {
  cep: '13015-904',
  logradouro: 'Rua Barão de Jaguara',
  bairro: 'Centro',
  localidade: 'Campinas',
  uf: 'SP',
};

const BRASILAPI_BODY = {
  cep: '13015904',
  street: 'Rua Barão de Jaguara',
  neighborhood: 'Centro',
  city: 'Campinas',
  state: 'SP',
};

function reply(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

afterEach(() => vi.unstubAllGlobals());

describe('normalizeCep', () => {
  it.each([
    ['13015904', '13015904'],
    ['13015-904', '13015904'],
    [' 13.015-904 ', '13015904'],
  ])('accepts %s', (typed, digits) => {
    expect(normalizeCep(typed)).toBe(digits);
  });

  it.each([
    '',
    '1301590',
    '130159040',
    '1301590a',
    '13015_904',
  ])('refuses %j', (typed) => {
    expect(normalizeCep(typed)).toBeNull();
  });
});

describe('provider normalisation', () => {
  it('maps a ViaCEP answer to the shared fields', () => {
    expect(fromViaCep({ data: VIACEP_BODY })).toEqual(FILLED);
  });

  it('treats a ViaCEP erro answer as not found', () => {
    expect(fromViaCep({ data: { erro: true } })).toBeNull();
    expect(fromViaCep({ data: { erro: 'true' } })).toBeNull();
  });

  it('maps a BrasilAPI answer to the shared fields', () => {
    expect(fromBrasilApi({ data: BRASILAPI_BODY })).toEqual(FILLED);
  });

  it('leaves the fields a generic CEP lacks empty', () => {
    expect(
      fromViaCep({
        data: { cep: '13015-000', localidade: 'Campinas', uf: 'SP' },
      }),
    ).toEqual({
      cep: '13015000',
      street: '',
      bairro: '',
      city: 'Campinas',
      uf: 'SP',
    });
  });
});

describe('lookupCep', () => {
  it('asks ViaCEP first', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(VIACEP_BODY));
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookupCep({ cep: '13015904' })).resolves.toEqual(FILLED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://viacep.com.br/ws/13015904/json/',
    );
  });

  it('resolves null for a CEP ViaCEP does not know, without the fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ erro: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookupCep({ cep: '99999999' })).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to BrasilAPI when ViaCEP fails', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(reply(BRASILAPI_BODY));
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookupCep({ cep: '13015904' })).resolves.toEqual(FILLED);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://brasilapi.com.br/api/cep/v1/13015904',
    );
  });

  it('falls back on a ViaCEP error status too', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({}, false))
      .mockResolvedValueOnce(reply(BRASILAPI_BODY));
    vi.stubGlobal('fetch', fetchMock);

    await expect(lookupCep({ cep: '13015904' })).resolves.toEqual(FILLED);
  });

  it('throws CepLookupFailed when both providers fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));

    await expect(lookupCep({ cep: '13015904' })).rejects.toBeInstanceOf(
      CepLookupFailed,
    );
  });
});
