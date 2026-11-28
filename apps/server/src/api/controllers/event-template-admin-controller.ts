import { z } from 'zod';
import { EventTemplateId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IEventTemplateManager } from '../../domain/contracts/application/event-template-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import { createChurchAdminHook } from '../auth/authority-access';
import type { FastifyController } from '../contracts/fastify-controller';
import { authErrorResponses } from '../dtos/error-response.dto';
import {
  changeTemplatePrecedenceBodySchema,
  createEventTemplateBodySchema,
  eventTemplateListResponseSchema,
  eventTemplateMapper,
  eventTemplateResponseSchema,
  eventTemplateUsageResponseSchema,
  templateCollisionsResponseSchema,
  templatePrecedenceListResponseSchema,
  templatePrecedenceResponseSchema,
  updateEventTemplateBodySchema,
} from '../dtos/event-template.dto';
import { idSchema } from '../dtos/id.dto';
import { validationErrorResponseSchema } from '../dtos/validation-error.dto';
import type { EventTemplateAdminControllerDependencies } from './event-template-admin-controller.types';

const templateParamsSchema = z.object({ templateId: idSchema });
const templatePrecedenceParamsSchema = z.object({
  templateId: idSchema,
  otherTemplateId: idSchema,
});

/** Church-admin routes for EventTemplates and their Template Precedences. */
export class EventTemplateAdminController implements FastifyController {
  readonly prefix = '/admin';

  private readonly eventTemplateManager: IEventTemplateManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: IAuthorityGuard;

  constructor({
    eventTemplateManager,
    activeChurchResolver,
    authorityGuard,
  }: EventTemplateAdminControllerDependencies) {
    this.eventTemplateManager = eventTemplateManager;
    this.activeChurchResolver = activeChurchResolver;
    this.authorityGuard = authorityGuard;
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({ resolver: this.activeChurchResolver }),
    );

    app.addHook(
      'preValidation',
      createChurchAdminHook({ authorityGuard: this.authorityGuard }),
    );

    app.post(
      '/event-templates',
      {
        schema: {
          tags: ['planning'],
          operationId: 'createEventTemplate',
          summary: 'Create an EventTemplate',
          description:
            'Create a church-owned EventTemplate with its ordered TemplateTimeBlocks on a weekly or monthly Recurrence. When it collides with templates it has no Template Precedence for, nothing is saved and 409 UNANSWERED_TEMPLATE_COLLISIONS names them; resubmit with an answer per pair in `precedences`.',
          body: createEventTemplateBodySchema,
          response: {
            201: eventTemplateResponseSchema,
            ...authErrorResponses,
            409: templateCollisionsResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const body = request.body;
        const template = await this.eventTemplateManager.createTemplate({
          churchId: request.churchId,
          name: body.name,
          recurrence: body.recurrence,
          blocks: body.blocks,
          precedences: eventTemplateMapper.precedencesFromBody(
            body.precedences,
          ),
        });
        return reply.status(201).send(eventTemplateMapper.toResponse(template));
      },
    );

    app.get(
      '/event-templates',
      {
        schema: {
          tags: ['planning'],
          operationId: 'listEventTemplates',
          summary: 'List EventTemplates',
          description: 'List the Church EventTemplates.',
          response: {
            200: eventTemplateListResponseSchema,
            ...authErrorResponses,
          },
        },
      },
      async (request, reply) => {
        const templates = await this.eventTemplateManager.listTemplates({
          churchId: request.churchId,
        });
        return reply.send(eventTemplateMapper.listToResponse(templates));
      },
    );

    app.get(
      '/event-templates/:templateId',
      {
        schema: {
          params: templateParamsSchema,
          tags: ['planning'],
          operationId: 'getEventTemplate',
          summary: 'Get an EventTemplate',
          description:
            'Get one Church EventTemplate with its ordered TemplateTimeBlocks for direct editing.',
          response: { 200: eventTemplateResponseSchema, ...authErrorResponses },
        },
      },
      async (request, reply) => {
        const { templateId } = request.params;
        const template = await this.eventTemplateManager.getTemplate({
          churchId: request.churchId,
          templateId: EventTemplateId.from(templateId),
        });
        return reply.send(eventTemplateMapper.toResponse(template));
      },
    );

    app.get(
      '/event-templates/:templateId/usage',
      {
        schema: {
          params: templateParamsSchema,
          tags: ['planning'],
          operationId: 'getEventTemplateUsage',
          summary: 'Get EventTemplate usage',
          description:
            'Count the distinct Ministries whose UsualSetup references each current TemplateTimeBlock, and across the template.',
          response: {
            200: eventTemplateUsageResponseSchema,
            ...authErrorResponses,
          },
        },
      },
      async (request, reply) => {
        const { templateId } = request.params;
        const usage = await this.eventTemplateManager.getTemplateUsage({
          churchId: request.churchId,
          templateId: EventTemplateId.from(templateId),
        });
        return reply.send(usage);
      },
    );

    app.patch(
      '/event-templates/:templateId',
      {
        schema: {
          params: templateParamsSchema,
          tags: ['planning'],
          operationId: 'updateEventTemplate',
          summary: 'Update an EventTemplate',
          description:
            "Apply an EventTemplate's complete desired name, Recurrence and TemplateTimeBlocks: blocks with a persisted id are updated in place, blocks without one are created and omitted blocks are deleted with their UsualSetup entries. Stored Template Precedences are never re-asked; a new colliding pair without one refuses the save with 409 UNANSWERED_TEMPLATE_COLLISIONS until `precedences` answers it.",
          body: updateEventTemplateBodySchema,
          response: {
            200: eventTemplateResponseSchema,
            ...authErrorResponses,
            409: templateCollisionsResponseSchema,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { templateId } = request.params;
        const body = request.body;
        const template = await this.eventTemplateManager.updateTemplate({
          churchId: request.churchId,
          templateId: EventTemplateId.from(templateId),
          name: body.name,
          recurrence: body.recurrence,
          blocks: body.blocks,
          precedences: eventTemplateMapper.precedencesFromBody(
            body.precedences,
          ),
        });
        return reply.send(eventTemplateMapper.toResponse(template));
      },
    );

    app.get(
      '/event-templates/:templateId/precedences',
      {
        schema: {
          params: templateParamsSchema,
          tags: ['planning'],
          operationId: 'listTemplatePrecedences',
          summary: 'List Template Precedences',
          description:
            "The template's stored Template Precedences, each as this template sees the pair, ordered by the other template's name.",
          response: {
            200: templatePrecedenceListResponseSchema,
            ...authErrorResponses,
          },
        },
      },
      async (request, reply) => {
        const { templateId } = request.params;
        const precedences = await this.eventTemplateManager.listPrecedences({
          churchId: request.churchId,
          templateId: EventTemplateId.from(templateId),
        });
        return reply.send(
          eventTemplateMapper.precedenceListToResponse(precedences),
        );
      },
    );

    app.put(
      '/event-templates/:templateId/precedences/:otherTemplateId',
      {
        schema: {
          params: templatePrecedenceParamsSchema,
          tags: ['planning'],
          operationId: 'changeTemplatePrecedence',
          summary: 'Change a Template Precedence',
          description:
            'Change one stored Template Precedence, as the first template sees the pair, without editing either template. A pair with no stored answer is 404.',
          body: changeTemplatePrecedenceBodySchema,
          response: {
            200: templatePrecedenceResponseSchema,
            ...authErrorResponses,
            422: validationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { templateId, otherTemplateId } = request.params;
        const body = request.body;
        const precedence = await this.eventTemplateManager.changePrecedence({
          churchId: request.churchId,
          templateId: EventTemplateId.from(templateId),
          otherTemplateId: EventTemplateId.from(otherTemplateId),
          answer: body.answer,
        });
        return reply.send(precedence);
      },
    );

    app.delete(
      '/event-templates/:templateId',
      {
        schema: {
          params: templateParamsSchema,
          tags: ['planning'],
          operationId: 'deleteEventTemplate',
          summary: 'Delete an EventTemplate',
          description: 'Delete an EventTemplate from the Church.',
          response: { 204: z.null(), ...authErrorResponses },
        },
      },
      async (request, reply) => {
        const { templateId } = request.params;
        await this.eventTemplateManager.deleteTemplate({
          churchId: request.churchId,
          templateId: EventTemplateId.from(templateId),
        });
        return reply.status(204).send(null);
      },
    );
  }
}
