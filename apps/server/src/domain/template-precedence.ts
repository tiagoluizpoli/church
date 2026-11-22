import type { EventTemplateId } from './branded-ids';

/** A stored Template Precedence outcome for the pair (A, B). */
export type StoredPrecedenceOutcome = 'both' | 'a_wins' | 'b_wins';

/** A Template Precedence answer as one template of the pair sees it. */
export type PrecedenceAnswer = 'both' | 'thisWins' | 'otherWins';

/** One answer per unordered pair, stored with `templateAId < templateBId`. */
export interface TemplatePrecedence {
  templateAId: EventTemplateId;
  templateBId: EventTemplateId;
  outcome: StoredPrecedenceOutcome;
}

export interface TemplatePrecedenceAnswer {
  otherTemplateId: EventTemplateId;
  answer: PrecedenceAnswer;
}

export interface ToStoredPrecedenceInput extends TemplatePrecedenceAnswer {
  templateId: EventTemplateId;
}

/** Orders the pair (lowercase uuids compare as the database does) and words the outcome for it. */
export function toStoredPrecedence({
  templateId,
  otherTemplateId,
  answer,
}: ToStoredPrecedenceInput): TemplatePrecedence {
  const self = templateId.toLowerCase() as EventTemplateId;
  const other = otherTemplateId.toLowerCase() as EventTemplateId;
  const selfIsA = self < other;
  const winner =
    answer === 'both'
      ? 'both'
      : (answer === 'thisWins') === selfIsA
        ? 'a'
        : 'b';
  return {
    templateAId: selfIsA ? self : other,
    templateBId: selfIsA ? other : self,
    outcome: winner === 'both' ? 'both' : `${winner}_wins`,
  };
}

export interface ToPrecedenceAnswerInput {
  precedence: TemplatePrecedence;
  templateId: EventTemplateId;
}

/** The stored pair as `templateId` sees it. */
export function toPrecedenceAnswer({
  precedence,
  templateId,
}: ToPrecedenceAnswerInput): TemplatePrecedenceAnswer {
  const selfIsA = precedence.templateAId === templateId.toLowerCase();
  const answer: PrecedenceAnswer =
    precedence.outcome === 'both'
      ? 'both'
      : (precedence.outcome === 'a_wins') === selfIsA
        ? 'thisWins'
        : 'otherWins';
  return {
    otherTemplateId: selfIsA ? precedence.templateBId : precedence.templateAId,
    answer,
  };
}
