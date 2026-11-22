import { isAxiosError } from 'axios';
import { useState } from 'react';
import type { PrecedenceAnswer } from './precedence-answer-radios';
import type {
  TemplateCollisionAnswerInput,
  TemplateCollisionDialogProps,
} from './template-collision-dialog';
import type { CreateEventTemplate409 } from '@/infrastructure/api/churchAPI.schemas';

const UNANSWERED_COLLISIONS_CODE = 'UNANSWERED_TEMPLATE_COLLISIONS';

/** One collision answer, in the shape the save body takes. */
export interface CollisionAnswer {
  otherTemplateId: string;
  answer: PrecedenceAnswer;
}

export interface UseTemplateCollisionsResult {
  /** Answers collected so far, in the shape the save body takes. */
  precedences: CollisionAnswer[];
  /** True when the error was the collision refusal and the dialog now asks. */
  handleError: (error: unknown) => boolean;
  dialog: Omit<TemplateCollisionDialogProps, 'pending' | 'onConfirm'>;
}

/**
 * Keeps the per-pair answers across the 409 → ask → resubmit loop. Answers are
 * kept after a cancel so a retry does not ask the same pair twice.
 */
export function useTemplateCollisions(): UseTemplateCollisionsResult {
  const [collisions, setCollisions] = useState<
    TemplateCollisionDialogProps['collisions']
  >([]);
  const [answers, setAnswers] = useState<Record<string, PrecedenceAnswer>>({});

  return {
    precedences: Object.entries(answers).map(([otherTemplateId, answer]) => ({
      otherTemplateId,
      answer,
    })),
    handleError: (error) => {
      const body = isAxiosError<CreateEventTemplate409>(error)
        ? error.response?.data
        : undefined;
      if (body?.error !== UNANSWERED_COLLISIONS_CODE || !body.collisions) {
        return false;
      }
      setCollisions(body.collisions);
      return true;
    },
    dialog: {
      collisions,
      answers,
      onAnswer: ({ otherTemplateId, answer }: TemplateCollisionAnswerInput) =>
        setAnswers((current) => ({ ...current, [otherTemplateId]: answer })),
      onCancel: () => setCollisions([]),
    },
  };
}
