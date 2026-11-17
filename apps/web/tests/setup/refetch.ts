import type { QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { expect, type Mock } from 'vitest';

interface StartHangingRefetchInput {
  queryClient: QueryClient;
  read: Mock;
}

/** Starts a refetch of every cached query whose `read` never settles, so a
 * test can assert what stays on screen while data is refreshing. */
export async function startHangingRefetch({
  queryClient,
  read,
}: StartHangingRefetchInput) {
  read.mockClear();
  read.mockReturnValue(new Promise(() => undefined));
  act(() => {
    void queryClient.invalidateQueries();
  });
  await waitFor(() => expect(read).toHaveBeenCalled());
}
