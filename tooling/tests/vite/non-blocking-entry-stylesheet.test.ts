import { describe, expect, it } from 'bun:test';
import { rewriteEntryStylesheet } from '../../vite/non-blocking-entry-stylesheet';

const LINK = '<link rel="stylesheet" crossorigin href="/assets/index-abc.css">';

describe('rewriteEntryStylesheet', () => {
  it('loads the entry stylesheet as print, swapped in on load or error, with a preload', () => {
    expect(rewriteEntryStylesheet(`<head>${LINK}</head>`)).toBe(
      `<head><link rel="preload" as="style" crossorigin href="/assets/index-abc.css"><link rel="stylesheet" crossorigin href="/assets/index-abc.css" media="print" data-entry-stylesheet onload="this.media='all'" onerror="this.media='all'"></head>`,
    );
  });

  it('fails the build when the entry stylesheet link is missing', () => {
    expect(() =>
      rewriteEntryStylesheet(
        '<link rel="stylesheet" href="/assets/index-abc.css">',
      ),
    ).toThrow('found 0');
  });

  it('fails the build when more than one link matches', () => {
    expect(() => rewriteEntryStylesheet(LINK + LINK)).toThrow('found 2');
  });
});
