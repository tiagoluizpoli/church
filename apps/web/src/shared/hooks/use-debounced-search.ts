import { useEffect, useRef, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 300;

export interface SearchCommit {
  /** The trimmed search, or undefined once cleared. */
  search?: string;
}

interface UseDebouncedSearchInput {
  /** The search the URL holds now. */
  committed: string;
  onCommit: (commit: SearchCommit) => void;
}

/**
 * A search box over a URL filter: the typed value commits 300 ms after typing
 * stops, or at once through `commitNow` (form submit), and follows the URL
 * when it changes elsewhere (clear filters, back/forward).
 */
export function useDebouncedSearch({
  committed,
  onCommit,
}: UseDebouncedSearchInput) {
  const [search, setSearch] = useState(committed);
  const [syncedSearch, setSyncedSearch] = useState(committed);
  if (committed !== syncedSearch) {
    setSyncedSearch(committed);
    if (committed !== search.trim()) setSearch(committed);
  }
  const latestOnCommit = useRef(onCommit);
  latestOnCommit.current = onCommit;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const trimmed = search.trim();
  useEffect(() => {
    if (trimmed === committed) return;
    timer.current = setTimeout(
      () => latestOnCommit.current({ search: trimmed || undefined }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer.current);
  }, [trimmed, committed]);
  const commitNow = () => {
    clearTimeout(timer.current);
    onCommit({ search: trimmed || undefined });
  };
  return { search, setSearch, commitNow };
}
