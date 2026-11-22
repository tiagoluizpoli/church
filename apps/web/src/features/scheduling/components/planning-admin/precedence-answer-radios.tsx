import { m } from '@church/i18n/messages';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { ChangeTemplatePrecedenceBodyAnswer } from '@/infrastructure/api/churchAPI.schemas';

export type PrecedenceAnswer = ChangeTemplatePrecedenceBodyAnswer;

const ANSWERS: readonly PrecedenceAnswer[] = ['both', 'thisWins', 'otherWins'];

function answerLabel(answer: PrecedenceAnswer) {
  return {
    both: m.event_templates_precedence_both(),
    thisWins: m.event_templates_precedence_this_wins(),
    otherWins: m.event_templates_precedence_other_wins(),
  }[answer];
}

export interface PrecedenceAnswerRadiosProps {
  /** Unique per pair, so radio ids never clash across rows. */
  idPrefix: string;
  name: string;
  value: PrecedenceAnswer | null;
  disabled?: boolean;
  onChange: (answer: PrecedenceAnswer) => void;
}

/** The three answers for one colliding pair, as seen from the saving template. */
export function PrecedenceAnswerRadios({
  idPrefix,
  name,
  value,
  disabled,
  onChange,
}: PrecedenceAnswerRadiosProps) {
  return (
    <RadioGroup
      aria-label={name}
      className="gap-0"
      disabled={disabled}
      value={value}
      onValueChange={(next) => onChange(next as PrecedenceAnswer)}
    >
      {ANSWERS.map((answer) => (
        <Label
          key={answer}
          htmlFor={`${idPrefix}-${answer}`}
          className="flex min-h-11 items-center gap-3 font-normal text-sm md:min-h-8"
        >
          <RadioGroupItem value={answer} id={`${idPrefix}-${answer}`} />
          {answerLabel(answer)}
        </Label>
      ))}
    </RadioGroup>
  );
}
