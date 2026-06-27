import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StaffingMeter } from './staffing-meter';

describe('StaffingMeter (T099)', () => {
  describe('slot variant — percentage + color', () => {
    it('renders the rounded fill percentage', () => {
      render(<StaffingMeter fillRatio={0.5} variant="slot" />);
      expect(screen.getByTestId('staffing-meter-slot')).toHaveTextContent(
        '50%',
      );
    });

    it('is red below 0.5', () => {
      render(<StaffingMeter fillRatio={0.25} variant="slot" />);
      expect(screen.getByTestId('staffing-meter-slot').className).toContain(
        'bg-red-600',
      );
    });

    it('is yellow from 0.5 up to (not including) 1.0', () => {
      render(<StaffingMeter fillRatio={0.75} variant="slot" />);
      expect(screen.getByTestId('staffing-meter-slot').className).toContain(
        'bg-yellow-500',
      );
    });

    it('is green at exactly 1.0', () => {
      render(<StaffingMeter fillRatio={1} variant="slot" />);
      expect(screen.getByTestId('staffing-meter-slot').className).toContain(
        'bg-green-700',
      );
    });
  });

  describe('Edge cases — clamping', () => {
    it('clamps over-staffed ratios to 100%', () => {
      render(<StaffingMeter fillRatio={1.5} variant="slot" />);
      expect(screen.getByTestId('staffing-meter-slot')).toHaveTextContent(
        '100%',
      );
    });

    it('clamps negative ratios to 0%', () => {
      render(<StaffingMeter fillRatio={-0.5} variant="slot" />);
      expect(screen.getByTestId('staffing-meter-slot')).toHaveTextContent('0%');
    });
  });

  describe('event variant', () => {
    it('renders the progress bar container with a label', () => {
      render(<StaffingMeter fillRatio={0.5} variant="event" />);
      expect(screen.getByTestId('staffing-meter-event')).toBeInTheDocument();
      expect(screen.getByText('Staffing')).toBeVisible();
    });
  });
});
