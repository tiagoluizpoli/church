import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceIntroPanel } from './workspace-page';

describe('WorkspaceIntroPanel', () => {
  it('focuses the title when requested and the focus key changes', () => {
    const { rerender } = render(
      <WorkspaceIntroPanel
        key="list"
        title="Planning cycles"
        description="Review your planning cycle."
        autoFocusTitle
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Planning cycles' });
    expect(heading).toHaveFocus();

    rerender(
      <WorkspaceIntroPanel
        key="detail"
        title="August 2026"
        description="Review this cycle."
        autoFocusTitle
      />,
    );

    expect(screen.getByRole('heading', { name: 'August 2026' })).toHaveFocus();
  });
});
