import { describe, expect, it } from 'vitest';
import {
  toChurchSettingsFieldErrors,
  updateChurchSettingsBodySchema,
} from '@/api/dtos/church-settings.dto';

describe('Church Settings field errors', () => {
  it('words each refused field once, in request order, in the request locale', () => {
    expect(
      toChurchSettingsFieldErrors({
        issues: [
          { instancePath: '/name', message: 'CHURCH_NAME_LENGTH' },
          { instancePath: '/name', message: 'INVALID' },
          { instancePath: '/website', message: 'Invalid input' },
          { instancePath: '/contacts/1/value' },
        ],
        locale: 'en',
      }),
    ).toEqual([
      {
        field: 'name',
        code: 'CHURCH_NAME_LENGTH',
        message: 'The name must be 2 to 80 characters long.',
      },
      { field: 'website', code: 'INVALID', message: 'Invalid value.' },
      { field: 'contacts.1.value', code: 'INVALID', message: 'Invalid value.' },
    ]);
  });
});

describe('Church Settings body', () => {
  it('normalises every field through the domain value objects', () => {
    expect(
      updateChurchSettingsBodySchema.parse({
        name: ' Igreja  Viva ',
        website: 'igrejaviva.org',
        accentColor: '#ABCDEF',
        addresses: [
          {
            street: ' Rua  A ',
            number: '1',
            bairro: 'Centro',
            city: 'Campinas',
            uf: 'SP',
            cep: '13010-000',
          },
        ],
        socialLinks: [
          { url: ' Instagram.com/igreja ', description: ' Perfil ' },
        ],
      }),
    ).toEqual({
      name: 'Igreja Viva',
      website: 'https://igrejaviva.org',
      accentColor: '#abcdef',
      addresses: [
        {
          id: null,
          label: null,
          street: 'Rua A',
          number: '1',
          complement: null,
          bairro: 'Centro',
          city: 'Campinas',
          uf: 'SP',
          cep: '13010000',
          country: 'BR',
          isPublic: true,
          isMain: false,
          latitude: null,
          longitude: null,
          pinSource: null,
          placeId: null,
        },
      ],
      socialLinks: [
        {
          url: 'https://Instagram.com/igreja',
          network: 'instagram',
          group: null,
          description: 'Perfil',
        },
      ],
    });
  });
});
