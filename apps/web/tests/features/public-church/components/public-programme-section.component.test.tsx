import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicProgrammeSection } from '@/features/public-church/components/public-programme-section';
import { renderWithProviders } from '@/tests/setup/render';

describe('PublicProgrammeSection', () => {
  it('hides the section when the Church has no Regular Activity', () => {
    const { container } = renderWithProviders(
      <PublicProgrammeSection programme={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows each activity as weekday, time and label, with the place only when there is one', () => {
    renderWithProviders(
      <PublicProgrammeSection
        programme={[
          {
            recurrence: { kind: 'weekly', weekdays: [0] },
            exceptOrdinals: [1],
            startTime: '19:00',
            label: 'Culto',
            place: null,
          },
          {
            recurrence: { kind: 'weekly', weekdays: [3] },
            exceptOrdinals: [],
            startTime: '20:00',
            label: 'Oração',
            place: 'Salão anexo',
          },
        ]}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Todo domingo, exceto o 1º · 19:00 · Culto',
      'Toda quarta-feira · 20:00 · Oração · Salão anexo',
    ]);
  });
});
