import { DomainError } from '@church/core';
import type { EventTemplateId } from '../branded-ids';

/** Another template a save collides with and has no Template Precedence for yet. */
export interface TemplateCollisionReference {
  templateId: EventTemplateId;
  name: string;
}

export interface UnansweredTemplateCollisionsErrorInput {
  collisions: TemplateCollisionReference[];
}

/** The save collides with templates it has no answer for; nothing was saved. */
export class UnansweredTemplateCollisionsError extends DomainError {
  readonly code = 'UNANSWERED_TEMPLATE_COLLISIONS' as const;
  readonly collisions: TemplateCollisionReference[];

  constructor({ collisions }: UnansweredTemplateCollisionsErrorInput) {
    super('The template collides with templates that need a precedence answer');
    this.collisions = collisions;
  }
}
