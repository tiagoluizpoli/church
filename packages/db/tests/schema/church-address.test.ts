import { beforeEach, describe, expect, it } from 'vitest';
import { churchAddress } from '../../src/schema/church';
import { createChurch } from '../../src/tenancy';
import { clearDatabase, testDb } from './setup';

const ADDRESS = {
  street: 'Rua das Flores',
  number: '10',
  bairro: 'Centro',
  city: 'Campinas',
  uf: 'SP',
};

describe('Church Address schema', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  async function newChurch() {
    return createChurch({ db: testDb, name: 'Igreja', slug: 'igreja' });
  }

  it('refuses a second Main Address for one Church', async () => {
    const { id: churchId } = await newChurch();
    await testDb
      .insert(churchAddress)
      .values({ churchId, position: 0, isMain: true, ...ADDRESS });

    await expect(
      testDb
        .insert(churchAddress)
        .values({ churchId, position: 1, isMain: true, ...ADDRESS }),
    ).rejects.toThrow();
  });

  it('refuses a Church left with addresses but no Main Address', async () => {
    const { id: churchId } = await newChurch();

    await expect(
      testDb
        .insert(churchAddress)
        .values({ churchId, position: 0, isMain: false, ...ADDRESS }),
    ).rejects.toMatchObject({ cause: { message: /no main address/ } });
  });

  it('allows a Church with no addresses and a main handed over inside one transaction', async () => {
    const { id: churchId } = await newChurch();
    const [first] = await testDb
      .insert(churchAddress)
      .values({ churchId, position: 0, isMain: true, ...ADDRESS })
      .returning();

    await expect(
      testDb.transaction(async (tx) => {
        await tx
          .insert(churchAddress)
          .values({ churchId, position: 1, isMain: false, ...ADDRESS });
        await tx.delete(churchAddress);
      }),
    ).resolves.toBeUndefined();
    expect(first?.country).toBe('BR');
  });

  it('refuses a malformed CEP, a foreign country and a half pin', async () => {
    const { id: churchId } = await newChurch();
    const base = { churchId, position: 0, isMain: true, ...ADDRESS };

    await expect(
      testDb.insert(churchAddress).values({ ...base, cep: '1234' }),
    ).rejects.toThrow();
    await expect(
      testDb.insert(churchAddress).values({ ...base, country: 'US' }),
    ).rejects.toThrow();
    await expect(
      testDb.insert(churchAddress).values({ ...base, latitude: -22.9 }),
    ).rejects.toThrow();
  });
});
