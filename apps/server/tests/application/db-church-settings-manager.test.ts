import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbChurchSettingsManager } from '@/application/db-church-settings-manager';
import { ChurchId } from '@/domain/branded-ids';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import { InMemoryObjectStorage } from '@/tests/test-support/in-memory-object-storage';

const CHURCH = ChurchId.from('11111111-1111-4111-8111-111111111111');

const SETTINGS = {
  name: 'Igreja',
  slug: 'igreja',
  website: null,
  accentColor: null,
  logoKey: null,
  addresses: [],
};

let churchRepository: ChurchRepository;
let storage: InMemoryObjectStorage;
let manager: DbChurchSettingsManager;

beforeEach(() => {
  churchRepository = {
    getSettings: vi.fn().mockResolvedValue(SETTINGS),
    saveLogoKey: vi.fn(),
    findPublicIdentityBySlug: vi.fn(),
  } as unknown as ChurchRepository;
  storage = new InMemoryObjectStorage();
  manager = new DbChurchSettingsManager({
    churchRepository,
    unitOfWork: { run: vi.fn() } as never,
    objectStorage: storage,
    publicOrigin: 'https://app.test/',
  });
});

interface ImageInput {
  width: number;
  height: number;
}

function png({ width, height }: ImageInput) {
  return sharp({
    create: { width, height, channels: 3, background: '#123456' },
  })
    .png()
    .toBuffer();
}

describe('DbChurchSettingsManager logo', () => {
  it('reads the logo URL from the stored key', async () => {
    vi.mocked(churchRepository.getSettings).mockResolvedValue({
      ...SETTINGS,
      logoKey: 'public/x.png',
    });

    expect(await manager.getChurchSettings({ churchId: CHURCH })).toEqual({
      ...SETTINGS,
      logoKey: 'public/x.png',
      logoUrl: 'https://storage.test/church/public/x.png',
      publicOrigin: 'https://app.test',
    });
  });

  it('stores the normalised logo and points the Church at it', async () => {
    await manager.uploadLogo({
      churchId: CHURCH,
      bytes: await png({ width: 1024, height: 256 }),
    });

    const [key] = storage.objects.keys();
    expect(key).toMatch(
      new RegExp(`^public/churches/${CHURCH}/logo/[0-9a-f]{64}\\.png$`),
    );
    expect(churchRepository.saveLogoKey).toHaveBeenCalledWith({
      id: CHURCH,
      logoKey: key,
    });
  });

  it.each([
    ['too small', { width: 100, height: 100 }, 'LOGO_TOO_SMALL'],
    ['too wide', { width: 600, height: 100 }, 'LOGO_BAD_ASPECT_RATIO'],
  ])('refuses a logo %s', async (_label, size, code) => {
    await expect(
      manager.uploadLogo({ churchId: CHURCH, bytes: await png(size) }),
    ).rejects.toMatchObject({ code });
    expect(storage.objects.size).toBe(0);
  });

  it('refuses an image over the decoder pixel limit as too large', async () => {
    // A valid PNG header declaring 20000×20000 px (400 Mpx, over sharp's limit).
    const header = await png({ width: 200, height: 200 });
    header.writeUInt32BE(20000, 16);
    header.writeUInt32BE(20000, 20);

    await expect(
      manager.uploadLogo({ churchId: CHURCH, bytes: header }),
    ).rejects.toMatchObject({ code: 'LOGO_TOO_LARGE' });
  });

  it('refuses a truncated image as unreadable', async () => {
    const whole = await png({ width: 300, height: 300 });

    await expect(
      manager.uploadLogo({ churchId: CHURCH, bytes: whole.subarray(0, 40) }),
    ).rejects.toMatchObject({ code: 'LOGO_UNSUPPORTED_TYPE' });
  });

  it('removes and restores only the Church reference', async () => {
    const key = `public/churches/${CHURCH}/logo/${'b'.repeat(64)}.png`;

    await manager.removeLogo({ churchId: CHURCH });
    await manager.restoreLogo({ churchId: CHURCH, key });

    expect(vi.mocked(churchRepository.saveLogoKey).mock.calls).toEqual([
      [{ id: CHURCH, logoKey: null }],
      [{ id: CHURCH, logoKey: key }],
    ]);
    await expect(
      manager.restoreLogo({ churchId: CHURCH, key: 'public/other.png' }),
    ).rejects.toMatchObject({ code: 'LOGO_KEY_INVALID' });
  });
});
