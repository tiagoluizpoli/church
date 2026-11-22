import { m } from '@church/i18n/messages';
import {
  type PrecedenceAnswer,
  PrecedenceAnswerRadios,
} from './precedence-answer-radios';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CreateEventTemplate409CollisionsItem } from '@/infrastructure/api/churchAPI.schemas';

export interface TemplateCollisionAnswerInput {
  otherTemplateId: string;
  answer: PrecedenceAnswer;
}

export interface TemplateCollisionDialogProps {
  /** The pairs the server could not save without an answer; empty closes the dialog. */
  collisions: CreateEventTemplate409CollisionsItem[];
  answers: Record<string, PrecedenceAnswer>;
  pending: boolean;
  onAnswer: (input: TemplateCollisionAnswerInput) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks once per unanswered colliding pair, then resubmits the save with the answers. */
export function TemplateCollisionDialog({
  collisions,
  answers,
  pending,
  onAnswer,
  onConfirm,
  onCancel,
}: TemplateCollisionDialogProps) {
  const complete = collisions.every(({ templateId }) => answers[templateId]);

  return (
    <AlertDialog
      open={collisions.length > 0}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <AlertDialogContent data-testid="template-collision-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {m.event_templates_collision_title()}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {m.event_templates_collision_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4">
          {collisions.map(({ templateId, name }) => (
            <fieldset
              key={templateId}
              className="space-y-1"
              data-testid="template-collision-pair"
            >
              <legend className="font-semibold text-sm">{name}</legend>
              <PrecedenceAnswerRadios
                idPrefix={`collision-${templateId}`}
                name={name}
                value={answers[templateId] ?? null}
                disabled={pending}
                onChange={(answer) =>
                  onAnswer({ otherTemplateId: templateId, answer })
                }
              />
            </fieldset>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {m.event_templates_cancel()}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || !complete}
            data-testid="confirm-template-collision-button"
            onClick={onConfirm}
          >
            {m.event_templates_collision_confirm()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
