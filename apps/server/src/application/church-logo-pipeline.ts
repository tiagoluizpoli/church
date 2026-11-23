import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { ChurchId } from '../domain/branded-ids';
import {
  churchLogoKey,
  detectLogoFormat,
  LOGO_CACHE_CONTROL,
  LOGO_CONTENT_TYPE,
  LOGO_MAX_LONGEST_SIDE,
  logoDimensionRefusal,
} from '../domain/church-logo';
import type { ObjectStorage } from '../domain/contracts/infrastructure/object-storage';
import {
  LogoBadAspectRatioError,
  LogoTooLargeError,
  LogoTooSmallError,
  LogoUnsupportedTypeError,
} from '../domain/errors/church-logo';

interface NormaliseLogoInput {
  bytes: Uint8Array;
}

/** Decodes (sharp's pixel limit on), checks the rules and returns one ≤512 px PNG without metadata. */
async function normaliseLogo({ bytes }: NormaliseLogoInput): Promise<Buffer> {
  if (!detectLogoFormat({ bytes })) throw new LogoUnsupportedTypeError();
  let width: number;
  let height: number;
  try {
    // As shown: a rotated phone photo's stored sides are swapped.
    ({ width, height } = (await sharp(bytes).metadata()).autoOrient);
  } catch (error) {
    if (String(error).includes('pixel limit')) throw new LogoTooLargeError();
    throw new LogoUnsupportedTypeError();
  }
  const refusal = logoDimensionRefusal({ width, height });
  if (refusal === 'LOGO_TOO_SMALL') throw new LogoTooSmallError();
  if (refusal === 'LOGO_BAD_ASPECT_RATIO') throw new LogoBadAspectRatioError();
  try {
    return await sharp(bytes)
      .autoOrient()
      .resize({
        width: LOGO_MAX_LONGEST_SIDE,
        height: LOGO_MAX_LONGEST_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch (error) {
    if (String(error).includes('pixel limit')) throw new LogoTooLargeError();
    throw new LogoUnsupportedTypeError();
  }
}

interface StoreChurchLogoInput {
  objectStorage: ObjectStorage;
  churchId: ChurchId;
  bytes: Uint8Array;
}

/** Normalises the upload and stores it under its content-hashed key; returns the key. */
export async function storeChurchLogo({
  objectStorage,
  churchId,
  bytes,
}: StoreChurchLogoInput): Promise<string> {
  const png = await normaliseLogo({ bytes });
  const sha256 = createHash('sha256').update(png).digest('hex');
  const key = churchLogoKey({ churchId, sha256 });
  // Same bytes, same key: re-putting it stores identical content, never a new object.
  await objectStorage.put({
    key,
    body: png,
    contentType: LOGO_CONTENT_TYPE,
    cacheControl: LOGO_CACHE_CONTROL,
  });
  return key;
}
