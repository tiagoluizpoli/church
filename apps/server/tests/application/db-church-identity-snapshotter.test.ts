import { describe, expect, it, vi } from 'vitest';
import { DbChurchIdentitySnapshotter } from '@/application/db-church-identity-snapshotter';
import { ChurchId } from '@/domain/branded-ids';

const churchId = ChurchId.from('11111111-1111-4111-8111-111111111111');

function snapshotterWith(addresses: Array<Record<string, unknown>>) {
  const getSettings = vi
    .fn()
    .mockResolvedValue({ logoKey: null, accentColor: null, addresses });
  return new DbChurchIdentitySnapshotter({
    churchRepository: { getSettings } as never,
    objectStorage: { publicUrl: ({ key }: { key: string }) => key },
  });
}

describe('DbChurchIdentitySnapshotter locality', () => {
  it('freezes the Main Address locality, even when the address is private', async () => {
    const snapshotter = snapshotterWith([
      { isMain: false, bairro: 'Batel', city: 'Curitiba', uf: 'PR' },
      {
        isMain: true,
        isPublic: false,
        bairro: 'Centro',
        city: 'Campinas',
        uf: 'SP',
      },
    ]);

    expect(await snapshotter.snapshot({ churchId })).toEqual({
      churchLogoUrl: null,
      churchAccent: null,
      churchLocality: 'Centro, Campinas/SP',
    });
  });

  it('leaves the snapshot unchanged for a Church without an address', async () => {
    expect(await snapshotterWith([]).snapshot({ churchId })).toEqual({
      churchLogoUrl: null,
      churchAccent: null,
    });
  });
});
