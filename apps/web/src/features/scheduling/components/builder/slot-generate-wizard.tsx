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
import { useTimezone } from '../../../../shared/hooks/use-timezone';
import { trpc } from '@/utils/trpc';

interface SlotGenerateWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  ministryId: string;
  onComplete: () => void;
}

type Strategy = 'duration' | 'count';
interface PreviewItem {
  startTime: string;
  endTime: string;
  label: string;
}

export function SlotGenerateWizard({
  open,
  onOpenChange,
  eventId,
  ministryId,
  onComplete,
}: SlotGenerateWizardProps) {
  const { format } = useTimezone();
  const [step, setStep] = useState(1);
  const [strategy, setStrategy] = useState<Strategy>('duration');
  const [value, setValue] = useState(60);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [templateId, setTemplateId] = useState<string>('none');

  const generate = useMutation(
    trpc.adminLeader.generateSlots.mutationOptions(),
  );
  const applyTemplate = useMutation(
    trpc.adminLeader.applyRoleTemplate.mutationOptions(),
  );
  const templates = useQuery({
    ...trpc.adminLeader.listRoleTemplates.queryOptions({ ministryId }),
    enabled: open,
  });

  const reset = () => {
    setStep(1);
    setStrategy('duration');
    setValue(60);
    setPreview([]);
    setTemplateId('none');
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const loadPreview = async () => {
    const res = await generate.mutateAsync({
      eventId,
      strategy,
      value,
      confirm: false,
    });
    if ('preview' in res) {
      setPreview(res.preview);
      setStep(2);
    }
  };

  const handleGenerate = async () => {
    await generate.mutateAsync({ eventId, strategy, value, confirm: true });
    if (templateId !== 'none') {
      await applyTemplate.mutateAsync({ eventId, templateId });
    }
    toast.success('Slots generated');
    onComplete();
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Auto-generate slots — Step {step} of 3</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <RadioGroup
              value={strategy}
              onValueChange={(v) => setStrategy(v as Strategy)}
            >
              <Label className="flex items-center gap-2">
                <RadioGroupItem value="duration" /> By duration (minutes per
                slot)
              </Label>
              <Label className="flex items-center gap-2">
                <RadioGroupItem value="count" /> By count (total slots)
              </Label>
            </RadioGroup>
            <div className="space-y-1">
              <Label htmlFor="gen-value">
                {strategy === 'duration'
                  ? 'Minutes per slot'
                  : 'Number of slots'}
              </Label>
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
          <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
            {preview.map((p) => (
              <li key={p.startTime} className="rounded border px-2 py-1">
                {p.label}: {format(p.startTime, 'p')} – {format(p.endTime, 'p')}
              </li>
            ))}
          </ul>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <Label>Apply a role template (optional)</Label>
            <RadioGroup value={templateId} onValueChange={setTemplateId}>
              <Label className="flex items-center gap-2">
                <RadioGroupItem value="none" /> No template
              </Label>
              {(templates.data ?? []).map((t) => (
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
              onClick={loadPreview}
            >
              Next
            </Button>
          )}
          {step === 2 && (
            <Button type="button" onClick={() => setStep(3)}>
              Next
            </Button>
          )}
          {step === 3 && (
            <Button
              type="button"
              disabled={generate.isPending || applyTemplate.isPending}
              onClick={handleGenerate}
            >
              {generate.isPending ? 'Generating…' : 'Generate'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
