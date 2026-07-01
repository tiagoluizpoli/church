import { Button } from '@church/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@church/ui/components/dialog';
import { Input } from '@church/ui/components/input';
import { Label } from '@church/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@church/ui/components/radio-group';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { adminApi } from '@/utils/api-instances';

interface SlotGenerateWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  onComplete: () => void;
}

export function SlotGenerateWizard({
  open,
  onOpenChange,
  eventId,
  onComplete,
}: SlotGenerateWizardProps) {
  const [step, setStep] = useState(1);
  const [value, setValue] = useState(60);
  const [templateId, setTemplateId] = useState<string>('none');

  const generate = useMutation({
    mutationFn: () =>
      adminApi.generateSlots(eventId, {
        strategy: {
          kind: 'equal-split',
          slotDurationMinutes: value,
        },
      }),
  });
  const templates = useQuery({
    queryKey: ['role-templates'],
    queryFn: () => adminApi.listRoleTemplates(),
    enabled: open,
  });

  const reset = () => {
    setStep(1);
    setValue(60);
    setTemplateId('none');
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleGenerate = async () => {
    await generate.mutateAsync();
    toast.success('Slots generated');
    onComplete();
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Split event into turns — Step {step} of 2</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Use this only for long events. Every generated slot stays inside
              the event window.
            </p>
            <div className="space-y-1">
              <Label htmlFor="gen-value">Minutes per slot</Label>
              <Input
                id="gen-value"
                type="number"
                min={1}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <Label>Role template</Label>
            <RadioGroup value={templateId} onValueChange={setTemplateId}>
              <Label className="flex items-center gap-2">
                <RadioGroupItem value="none" /> No template
              </Label>
              {(templates.data?.items ?? []).map((t) => (
                <Label key={t.id} className="flex items-center gap-2">
                  <RadioGroupItem value={t.id} /> {t.name}
                </Label>
              ))}
            </RadioGroup>
          </div>
        )}

        <DialogFooter>
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(step - 1)}
            >
              Back
            </Button>
          )}
          {step === 1 && (
            <Button
              type="button"
              disabled={value < 1 || generate.isPending}
              onClick={() => setStep(2)}
            >
              Next
            </Button>
          )}
          {step === 2 && (
            <Button
              type="button"
              disabled={generate.isPending}
              onClick={handleGenerate}
            >
              {generate.isPending ? 'Creating turns…' : 'Create turns'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
