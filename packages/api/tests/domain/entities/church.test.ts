import { describe, expect, it } from 'vitest';
import { Church } from '../../../src/domain/entities/church';

describe('Church Entity', () => {
  it('constructs with minimum props and provides defaults', () => {
    const church = new Church({ name: 'Grace Church', slug: 'grace-church' });

    expect(church.name).toBe('Grace Church');
    expect(church.slug).toBe('grace-church');
    expect(church.timezone).toBe('UTC');
    expect(church.settings).toBeUndefined();
    expect(church.id).toBeDefined();
    expect(church.createdAt).toBeInstanceOf(Date);
  });

  it('constructs with full props', () => {
    const settings = { theme: 'dark' };
    const church = new Church({
      name: 'Grace Church',
      slug: 'grace',
      timezone: 'America/New_York',
      settings,
    });

    expect(church.timezone).toBe('America/New_York');
    expect(church.settings).toBe(settings);
  });
});
