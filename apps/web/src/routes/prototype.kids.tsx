// PROTOTYPE (wayfinder #1093): throwaway Guardian screens, fake data, never merge.
import { createFileRoute } from '@tanstack/react-router';
import { GuardianPrototype } from '@/features/prototype-kids/prototype';

export interface PrototypeSearch {
  tela: string;
  v: 'F' | 'A' | 'B' | 'C';
}

export const Route = createFileRoute('/prototype/kids')({
  validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
    tela: typeof search.tela === 'string' ? search.tela : 'inicio',
    v:
      search.v === 'A' || search.v === 'B' || search.v === 'C' ? search.v : 'F',
  }),
  component: GuardianPrototype,
});
