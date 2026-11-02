import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MinistryNameForm } from '@/features/ministries/components/ministry-name-form';
import { invalidateMinistryReads } from '@/features/ministries/ministry-queries';
import { adminApi } from '@/utils/api-instances';

interface SaveInput {
  name: string;
}

/** Name-only creation; success opens the new Ministry's Sectors tab. */
export function CreateMinistryDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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
      <Button type="button" onClick={() => setOpen(true)}>
        {m.ministries_new()}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{m.ministries_create_title()}</DialogTitle>
            <DialogDescription>
              {m.ministries_create_description()}
            </DialogDescription>
          </DialogHeader>
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
                    {m.ministries_create_submit()}
                  </Button>
                </DialogFooter>
              )}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
