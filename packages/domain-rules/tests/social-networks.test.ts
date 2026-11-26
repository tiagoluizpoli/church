import { describe, expect, it } from 'vitest';
import { detectSocialNetwork, SOCIAL_NETWORKS } from '@/social-networks';

const SUPPORTED = [
  ['https://instagram.com/igreja', 'instagram'],
  ['https://www.instagram.com/igreja', 'instagram'],
  ['https://youtube.com/@igreja', 'youtube'],
  ['https://m.youtube.com/@igreja', 'youtube'],
  ['https://youtu.be/abc', 'youtube'],
  ['https://facebook.com/igreja', 'facebook'],
  ['https://m.facebook.com/igreja', 'facebook'],
  ['https://fb.com/igreja', 'facebook'],
  ['https://tiktok.com/@igreja', 'tiktok'],
  ['https://open.spotify.com/show/1', 'spotify'],
  ['https://x.com/igreja', 'x'],
  ['https://twitter.com/igreja', 'x'],
  ['https://threads.net/@igreja', 'threads'],
  ['https://threads.com/@igreja', 'threads'],
  ['https://t.me/igreja', 'telegram'],
  ['https://telegram.me/igreja', 'telegram'],
  ['https://whatsapp.com/channel/0029', 'whatsappChannel'],
  ['https://www.whatsapp.com/channel/0029', 'whatsappChannel'],
  ['https://chat.whatsapp.com/AbC123', 'whatsappGroup'],
  ['https://linkedin.com/company/igreja', 'linkedin'],
  ['https://www.linkedin.com/company/igreja', 'linkedin'],
  ['https://podcasts.apple.com/br/podcast/x/id1', 'applePodcasts'],
  ['https://deezer.com/br/show/1', 'deezer'],
  ['https://kwai.com/@igreja', 'kwai'],
  ['https://kw.ai/p/abc', 'kwai'],
] as const;

describe('detectSocialNetwork', () => {
  it.each(SUPPORTED)('detects %s as %s', (url, network) => {
    expect(detectSocialNetwork({ url })).toEqual({ network });
  });

  it('covers every network of the table', () => {
    const detected = new Set(SUPPORTED.map(([, network]) => network));
    expect(detected).toEqual(new Set(Object.keys(SOCIAL_NETWORKS)));
  });

  it('prepends https:// to a bare address and ignores case and spaces', () => {
    expect(detectSocialNetwork({ url: '  Instagram.com/igreja ' })).toEqual({
      network: 'instagram',
    });
    expect(detectSocialNetwork({ url: 'http://t.me/igreja' })).toEqual({
      network: 'telegram',
    });
  });

  it('sends a wa.me link to Contacts', () => {
    expect(detectSocialNetwork({ url: 'https://wa.me/5511999998888' })).toEqual(
      { refusal: 'USE_CONTACT' },
    );
    expect(
      detectSocialNetwork({ url: 'https://api.whatsapp.com/send?phone=1' }),
    ).toEqual({ refusal: 'USE_CONTACT' });
  });

  it.each([
    'https://example.com/igreja',
    'https://whatsapp.com/igreja',
    'https://whatsapp.com/',
    'https://chat.whatsapp.com.evil.com/AbC',
    'https://instagram.com.evil.com/igreja',
    'https://notinstagram.com/igreja',
    'https://evil.com/instagram.com/igreja',
    'https://instagram.com@evil.com/igreja',
    'https://evil.instagram.com.br/igreja',
  ])('refuses %s as an unsupported network', (url) => {
    expect(detectSocialNetwork({ url })).toEqual({ refusal: 'UNSUPPORTED' });
  });

  it.each([
    '',
    '   ',
    'not a url',
    'ftp://instagram.com/x',
    'javascript:alert(1)',
  ])('refuses %j as not a link', (url) => {
    expect(detectSocialNetwork({ url })).toEqual({ refusal: 'INVALID' });
  });
});
