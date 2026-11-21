// PROTOTYPE, throwaway (wayfinder #980): three Church Settings variants via ?variant=A|B|C, ?data=filled|empty.
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import {
  EMPTY,
  FILLED,
  useSettingsController,
} from '@/features/church-settings-prototype/prototype-state';
import { VARIANTS } from '@/features/church-settings-prototype/prototype-variants';
import { CapabilityGate } from '@/shared/components/capability-gate';

const searchSchema = z.object({
  variant: z.enum(['A', 'B', 'C']).catch('A'),
  data: z.enum(['filled', 'empty']).catch('filled'),
});

export const Route = createFileRoute(
  '/_authenticated/_active-church/prototype-church-settings',
)({
  validateSearch: (search) => searchSchema.parse(search),
  component: PrototypeChurchSettings,
});

function PrototypeChurchSettings() {
  const { variant, data } = Route.useSearch();
  const navigate = Route.useNavigate();
  const c = useSettingsController(data === 'empty' ? EMPTY : FILLED);
  const { Component } = VARIANTS[variant];
  const pill = 'rounded-full px-2 py-1 hover:bg-white/15';
  return (
    <CapabilityGate allow={(cap) => cap.isChurchAdmin} refusal="no-access">
      <Component c={c} />
      <PrototypeSwitcher
        variants={Object.entries(VARIANTS).map(([key, v]) => ({
          key,
          name: v.name,
        }))}
        current={variant}
        onChange={(key) =>
          navigate({
            search: (s) => ({ ...s, variant: key as typeof variant }),
            replace: true,
          })
        }
        extra={
          <>
            <button
              type="button"
              className={pill}
              onClick={() =>
                navigate({
                  search: (s) => ({
                    ...s,
                    data: data === 'empty' ? 'filled' : 'empty',
                  }),
                  replace: true,
                })
              }
            >
              {data === 'empty' ? 'Preenchido' : 'Vazio'}
            </button>
            <button type="button" className={pill} onClick={c.simulateErrors}>
              Erros do servidor
            </button>
          </>
        }
      />
      {c.log.length ? (
        <pre className="fixed right-3 bottom-16 z-50 max-w-sm rounded-lg bg-neutral-900/90 p-2 text-[11px] text-white">
          {c.log.join('\n')}
        </pre>
      ) : null}
    </CapabilityGate>
  );
}
