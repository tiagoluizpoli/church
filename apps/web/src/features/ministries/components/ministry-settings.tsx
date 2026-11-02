import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MinistryArchive } from '@/features/ministries/components/ministry-archive';
import { MinistryNameForm } from '@/features/ministries/components/ministry-name-form';
import {
  invalidateMinistryReads,
  useMinistry,
} from '@/features/ministries/ministry-queries';
import { CapabilityGate } from '@/shared/components/capability-gate';
import type { CallerCapabilities } from '@/shared/hooks/use-caller-capabilities';
import { adminApi } from '@/utils/api-instances';

interface MinistrySettingsProps {
  ministryId: string;
}

interface SaveInput {
  name: string;
}

const isChurchAdmin = (capabilities: CallerCapabilities) =>
  capabilities.isChurchAdmin;

/** ChurchAdmin-only. Renaming keeps the identity, so every view shows the new name. */
export function MinistrySettings({ ministryId }: MinistrySettingsProps) {
  const queryClient = useQueryClient();
  const ministry = useMinistry({ ministryId }).data;

  const rename = async ({ name }: SaveInput) => {
    await adminApi.renameMinistry(ministryId, { name });
    await invalidateMinistryReads({ queryClient });
    toast.success(m.ministry_renamed_toast());
  };

  return (
    <CapabilityGate allow={isChurchAdmin} refusal="no-access">
      {ministry ? (
        <div className="space-y-4">
          <section className="surface-panel max-w-xl space-y-4 p-4">
            <h2 className="font-semibold text-lg">
              {m.ministry_settings_name_title()}
            </h2>
            <MinistryNameForm
              key={ministry.id}
              initialName={ministry.name}
              onSave={rename}
              renderActions={(pending) => (
                <Button type="submit" disabled={pending}>
                  {pending
                    ? m.ministry_settings_saving()
                    : m.ministry_settings_save()}
                </Button>
              )}
            />
          </section>
          <MinistryArchive ministryId={ministry.id} name={ministry.name} />
        </div>
      ) : null}
    </CapabilityGate>
  );
}
