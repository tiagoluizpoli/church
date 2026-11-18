import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { MinistryNameForm } from '@/features/ministries/components/ministry-name-form';
import { invalidateMinistryReads } from '@/features/ministries/ministry-queries';
import { useMediaQuery } from '@/hooks/use-media-query';
import { adminApi } from '@/utils/api-instances';

interface SaveInput {
  name: string;
}

/** Name-only creation; success opens the new Ministry's Sectors tab. */
export function CreateMinistryDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const create = async ({ name }: SaveInput) => {
    const ministry = await adminApi.createMinistry({ name });
    await invalidateMinistryReads({ queryClient });
    toast.success(m.ministry_created_toast());
    setOpen(false);
    await navigate({
      to: '/ministries/$ministryId/sectors',
      params: { ministryId: ministry.id },
    });
  };

  return (
    <>
      <Button
        type="button"
        size={isMobile ? 'touch' : 'default'}
        onClick={() => setOpen(true)}
      >
        {m.ministries_new()}
      </Button>
      <ResponsiveFormSurface
        open={open}
        onOpenChange={setOpen}
        title={m.ministries_create_title()}
        description={m.ministries_create_description()}
      >
        {open ? (
          <MinistryNameForm
            initialName=""
            autoFocus
            onSave={create}
            renderActions={(pending) => (
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  {m.ministries_cancel()}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <Spinner /> : null}
                  {m.ministries_create_submit()}
                </Button>
              </DialogFooter>
            )}
          />
        ) : null}
      </ResponsiveFormSurface>
    </>
  );
}
