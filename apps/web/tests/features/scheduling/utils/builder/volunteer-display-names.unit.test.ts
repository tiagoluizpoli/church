import { describe, expect, it } from 'vitest';
import { volunteerDisplayNames } from '@/features/scheduling/utils/builder/volunteer-display-names';

describe('volunteerDisplayNames', () => {
  it('keeps full names when nothing would read the same', () => {
    const result = volunteerDisplayNames({
      names: ['Ana Maria Almeida Souza', 'Bruno Dias'],
    });

    expect(result.get('Ana Maria Almeida Souza')).toBe(
      'Ana Maria Almeida Souza',
    );
    expect(result.get('Bruno Dias')).toBe('Bruno Dias');
  });

  it('drops middle names when clipped names would read the same', () => {
    const result = volunteerDisplayNames({
      names: [
        'Maria Aparecida da Silva Souza',
        'Maria Aparecida da Silva Santos',
      ],
    });

    expect(result.get('Maria Aparecida da Silva Souza')).toBe('Maria Souza');
    expect(result.get('Maria Aparecida da Silva Santos')).toBe('Maria Santos');
  });

  it('honours the budget', () => {
    const names = ['Ana Maria Almeida Souza', 'Ana Maria Almeida Santos'];

    expect(volunteerDisplayNames({ names, budget: 17 }).get(names[0])).toBe(
      'Ana Souza',
    );
    expect(volunteerDisplayNames({ names }).get(names[0])).toBe(names[0]);
  });

  it('leaves names that differ before the clip alone', () => {
    const result = volunteerDisplayNames({
      names: ['Ana Maria Almeida Souza', 'Ana Maria Alícia Souza'],
      budget: 14,
    });

    expect(result.get('Ana Maria Alícia Souza')).toBe('Ana Maria Alícia Souza');
  });

  it('keeps full names when the shortened forms would still collide', () => {
    const names = ['Ana Maria Almeida Souza', 'Ana Maria Alves Souza'];
    const result = volunteerDisplayNames({ names, budget: 8 });

    expect(result.get(names[0])).toBe(names[0]);
    expect(result.get(names[1])).toBe(names[1]);
  });

  it('treats a person listed twice as one name', () => {
    const result = volunteerDisplayNames({
      names: [
        'Maria Aparecida da Silva Souza',
        'Maria Aparecida da Silva Souza',
      ],
    });

    expect(result.get('Maria Aparecida da Silva Souza')).toBe(
      'Maria Aparecida da Silva Souza',
    );
  });
});
