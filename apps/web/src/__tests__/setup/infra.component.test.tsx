import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StaffingMeter } from '@/features/scheduling/components/builder/staffing-meter';

describe('vitest component project', () => {
  it('renders a component into jsdom (RTL + jest-dom)', () => {
    render(<StaffingMeter fillRatio={1} variant="slot" />);
    expect(screen.getByTestId('staffing-meter-slot')).toHaveTextContent('100%');
  });
});
