import type { ChurchId } from '../domain/branded-ids';
import { TemplateTimeBlockId } from '../domain/branded-ids';
import type {
  ChangeTemplatePrecedenceManagerInput,
  CreateEventTemplateManagerInput,
  DeleteEventTemplateManagerInput,
  EventTemplateTimeBlockManagerInput,
  GetEventTemplateManagerInput,
  IEventTemplateManager,
  ListEventTemplatesManagerInput,
  TemplatePrecedenceView,
  UpdateEventTemplateManagerInput,
} from '../domain/contracts/application/event-template-manager';
import type {
  EventTemplateRepository,
  EventTemplateTimeBlockInput,
} from '../domain/contracts/infrastructure/event-template.repository';
import type { TemplatePrecedenceRepository } from '../domain/contracts/infrastructure/template-precedence.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import {
  EventTemplate,
  type EventTemplateUsage,
} from '../domain/entities/event-template';
import { UnansweredTemplateCollisionsError } from '../domain/errors/unanswered-template-collisions';
import { assertRecurrence } from '../domain/recurrence';
import { templatesCollide } from '../domain/template-collision';
import {
  type TemplatePrecedence,
  type TemplatePrecedenceAnswer,
  toPrecedenceAnswer,
  toStoredPrecedence,
} from '../domain/template-precedence';

interface DbEventTemplateManagerDependencies {
  templateRepository: EventTemplateRepository;
  precedenceRepository: TemplatePrecedenceRepository;
  unitOfWork: UnitOfWork;
}

interface SettlePrecedencesInput {
  churchId: ChurchId;
  template: EventTemplate;
  answers?: TemplatePrecedenceAnswer[];
  tx: TransactionContext;
}

interface NormalizeBlocksInput {
  blocks: EventTemplateTimeBlockManagerInput[];
}

/**
 * Validates the desired blocks and derives contiguous zero-based `order` by
 * ascending start time; equal starts keep their submitted relative order.
 * Text arrives trimmed by the API schema.
 */
function normalizeBlocks({
  blocks,
}: NormalizeBlocksInput): EventTemplateTimeBlockInput[] {
  EventTemplate.assertBlocks({ blocks });
  return blocks
    .map(
      ({ id, label, startTime, endTime, isPublic, place, placeAddressId }) => {
        const normalizedId = id?.toLowerCase();
        return {
          ...(normalizedId
            ? { id: TemplateTimeBlockId.from(normalizedId) }
            : {}),
          label,
          startTime,
          endTime,
          isPublic: isPublic ?? false,
          place: place || null,
          placeAddressId: placeAddressId ?? null,
        };
      },
    )
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
    .map((block, order) => ({ ...block, order }));
}

export class DbEventTemplateManager implements IEventTemplateManager {
  private readonly templateRepository: EventTemplateRepository;
  private readonly precedenceRepository: TemplatePrecedenceRepository;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    templateRepository,
    precedenceRepository,
    unitOfWork,
  }: DbEventTemplateManagerDependencies) {
    this.templateRepository = templateRepository;
    this.precedenceRepository = precedenceRepository;
    this.unitOfWork = unitOfWork;
  }

  /**
   * Run after the template's write in the same transaction: refuses (rolling
   * the write back) while a colliding template has neither a stored nor a
   * submitted answer, then stores the submitted answers for colliding pairs.
   */
  private async settlePrecedences({
    churchId,
    template,
    answers = [],
    tx,
  }: SettlePrecedencesInput): Promise<void> {
    const colliding = (
      await this.templateRepository.list({ churchId, tx })
    ).filter(
      (other) =>
        other.id !== template.id &&
        templatesCollide({ left: template, right: other }),
    );
    const storedPairs = await this.precedenceRepository.listByTemplate({
      churchId,
      templateId: template.id,
      tx,
    });
    const otherOf = (precedence: TemplatePrecedence) =>
      toPrecedenceAnswer({ precedence, templateId: template.id })
        .otherTemplateId;
    const stored = new Set(storedPairs.map(otherOf));
    const submitted = new Map(
      answers.map((answer) => [
        answer.otherTemplateId.toLowerCase(),
        answer.answer,
      ]),
    );
    const unanswered = colliding.filter(
      (other) => !stored.has(other.id) && !submitted.has(other.id),
    );
    if (unanswered.length > 0) {
      throw new UnansweredTemplateCollisionsError({
        collisions: unanswered.map((other) => ({
          templateId: other.id,
          name: other.name,
        })),
      });
    }
    // An answer for a pair this save no longer makes collide would mislead the list and the Programme.
    const collidingIds = new Set(colliding.map(({ id }) => id));
    await this.precedenceRepository.delete({
      churchId,
      precedences: storedPairs.filter(
        (precedence) => !collidingIds.has(otherOf(precedence)),
      ),
      tx,
    });
    await this.precedenceRepository.save({
      churchId,
      precedences: colliding.flatMap((other) => {
        const answer = submitted.get(other.id);
        return answer
          ? [
              toStoredPrecedence({
                templateId: template.id,
                otherTemplateId: other.id,
                answer,
              }),
            ]
          : [];
      }),
      tx,
    });
  }

  async createTemplate(
    input: CreateEventTemplateManagerInput,
  ): Promise<EventTemplate> {
    assertRecurrence({ recurrence: input.recurrence });
    const blocks = normalizeBlocks({ blocks: input.blocks });
    return this.unitOfWork.run(async (tx) => {
      const template = await this.templateRepository.create({
        churchId: input.churchId,
        name: input.name,
        recurrence: input.recurrence,
        blocks,
        tx,
      });
      await this.settlePrecedences({
        churchId: input.churchId,
        template,
        answers: input.precedences,
        tx,
      });
      return template;
    });
  }

  async updateTemplate(
    input: UpdateEventTemplateManagerInput,
  ): Promise<EventTemplate> {
    assertRecurrence({ recurrence: input.recurrence });
    const blocks = normalizeBlocks({ blocks: input.blocks });
    return this.unitOfWork.run(async (tx) => {
      const template = await this.templateRepository.update({
        churchId: input.churchId,
        templateId: input.templateId,
        name: input.name,
        recurrence: input.recurrence,
        blocks,
        tx,
      });
      await this.settlePrecedences({
        churchId: input.churchId,
        template,
        answers: input.precedences,
        tx,
      });
      return template;
    });
  }

  async deleteTemplate(input: DeleteEventTemplateManagerInput): Promise<void> {
    await this.templateRepository.delete(input);
  }

  async getTemplate(
    input: GetEventTemplateManagerInput,
  ): Promise<EventTemplate> {
    return this.templateRepository.getById(input);
  }

  async getTemplateUsage(
    input: GetEventTemplateManagerInput,
  ): Promise<EventTemplateUsage> {
    return this.templateRepository.getUsage(input);
  }

  async listTemplates(
    input: ListEventTemplatesManagerInput,
  ): Promise<EventTemplate[]> {
    return this.templateRepository.list(input);
  }

  async listPrecedences(
    input: GetEventTemplateManagerInput,
  ): Promise<TemplatePrecedenceView[]> {
    const template = await this.templateRepository.getById(input);
    const names = new Map(
      (await this.templateRepository.list({ churchId: input.churchId })).map(
        (other) => [other.id as string, other.name],
      ),
    );
    const precedences = await this.precedenceRepository.listByTemplate({
      churchId: input.churchId,
      templateId: template.id,
    });
    return precedences.map((precedence) => {
      const answer = toPrecedenceAnswer({
        precedence,
        templateId: template.id,
      });
      return {
        ...answer,
        otherTemplateName: names.get(answer.otherTemplateId) ?? '',
      };
    });
  }

  async changePrecedence(
    input: ChangeTemplatePrecedenceManagerInput,
  ): Promise<TemplatePrecedenceView> {
    const [template, other] = await Promise.all([
      this.templateRepository.getById({
        churchId: input.churchId,
        templateId: input.templateId,
      }),
      this.templateRepository.getById({
        churchId: input.churchId,
        templateId: input.otherTemplateId,
      }),
    ]);
    await this.precedenceRepository.update({
      churchId: input.churchId,
      precedence: toStoredPrecedence({
        templateId: template.id,
        otherTemplateId: other.id,
        answer: input.answer,
      }),
    });
    return {
      otherTemplateId: other.id,
      answer: input.answer,
      otherTemplateName: other.name,
    };
  }
}
