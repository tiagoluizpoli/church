import type { ChurchId, EventTemplateId } from '../../branded-ids';
import type { TemplatePrecedence } from '../../template-precedence';
import type { TransactionContext } from './transaction-context';

export interface ListTemplatePrecedencesInput {
  churchId: ChurchId;
  templateId: EventTemplateId;
  tx?: TransactionContext;
}

export interface SaveTemplatePrecedencesInput {
  churchId: ChurchId;
  precedences: TemplatePrecedence[];
  tx?: TransactionContext;
}

/** The pairs to forget; their outcome is ignored. */
export type DeleteTemplatePrecedencesInput = SaveTemplatePrecedencesInput;

export interface UpdateTemplatePrecedenceInput {
  churchId: ChurchId;
  precedence: TemplatePrecedence;
  tx?: TransactionContext;
}

export interface TemplatePrecedenceRepository {
  /** The template's stored pairs, ordered by the other template's name. */
  listByTemplate(
    input: ListTemplatePrecedencesInput,
  ): Promise<TemplatePrecedence[]>;
  /** Inserts each pair, replacing a stored outcome for the same pair. */
  save(input: SaveTemplatePrecedencesInput): Promise<void>;
  /** Forgets each pair's answer. */
  delete(input: DeleteTemplatePrecedencesInput): Promise<void>;
  /** Changes a stored pair's outcome; NotFoundError when the Church has no such pair. */
  update(input: UpdateTemplatePrecedenceInput): Promise<void>;
}
