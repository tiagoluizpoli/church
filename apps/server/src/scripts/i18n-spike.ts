import { greeting, people_needed, shift_starts } from '@church/i18n/messages';

// Spike #395: the shared catalog bundled by tsdown, called per locale as an
// outbox-driven email would, with no request context.
// An @church/time Instant (ISO string) formats directly.
const start = '2026-10-11T22:30:00.000Z';
for (const locale of ['en', 'pt-BR'] as const) {
  console.log(
    [
      greeting({ name: 'Ana' }, { locale }),
      people_needed({ count: 2 }, { locale }),
      shift_starts({ start, tz: 'America/Sao_Paulo' }, { locale }),
    ].join(' | '),
  );
}
