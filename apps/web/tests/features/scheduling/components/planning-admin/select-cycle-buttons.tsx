import { useQuery } from '@tanstack/react-query';
import { useCycleSelection } from '@/features/scheduling/components/planning-admin/planning-admin-context';
import { adminApi } from '@/utils/api-instances';

/**
 * Stands in for the Cycle detail route: one "Selecionar <name>" button per
 * listed Cycle, selecting it in the planning-admin context.
 */
export function SelectCycleButtons() {
  const { handleSelectCycle } = useCycleSelection();
  const { data } = useQuery({
    queryKey: ['cycles'],
    queryFn: () => adminApi.listCycles(),
  });

  return (
    <>
      {(data?.cycles ?? []).map((cycle) => (
        <button
          key={cycle.id}
          type="button"
          onClick={() => handleSelectCycle({ cycleId: cycle.id })}
        >
          {`Selecionar ${cycle.name}`}
        </button>
      ))}
    </>
  );
}
