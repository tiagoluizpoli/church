import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mswServer, trpcMsw } from './msw';
import { StaffingMeter } from '@/features/scheduling/components/builder/staffing-meter';
import { trpcClient } from '@/utils/trpc';

// Smoke tests for the `component` project (jsdom + RTL + MSW).
describe('vitest component project', () => {
  it('renders a component into jsdom (RTL + jest-dom)', () => {
    render(<StaffingMeter fillRatio={1} variant="slot" />);
    expect(screen.getByTestId('staffing-meter-slot')).toHaveTextContent('100%');
  });

  it('intercepts tRPC calls through MSW', async () => {
    mswServer.use(trpcMsw.healthCheck.query(() => 'OK'));
    await expect(trpcClient.healthCheck.query()).resolves.toBe('OK');
  });
});
