import { m } from '@church/i18n/messages';
import { z } from 'zod';
import { ChurchId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IChurchSettingsManager } from '../../domain/contracts/application/church-settings-manager';
import { ChurchSlugTakenError } from '../../domain/errors/church-slug-taken';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  type ChurchSettingsValidationIssue,
  churchSettingsFieldError,
  churchSettingsResponseSchema,
  churchSettingsValidationErrorResponseSchema,
  slugAvailabilityQuerySchema,
  slugAvailabilityResponseSchema,
  toChurchSettingsFieldErrors,
  type UpdateChurchSettingsBody,
  updateChurchSettingsBodySchema,
} from '../dtos/church-settings.dto';
import { refuse } from '../utils/refuse';

interface SlugAvailabilityQuery {
  slug: string;
}

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

interface ChurchSettingsControllerDependencies {
  churchSettingsManager: IChurchSettingsManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
}

/** The Active Church's Church Settings, ChurchAdmin only. */
export class ChurchSettingsController implements FastifyController {
  readonly prefix = '/church-settings';

  private readonly churchSettingsManager: IChurchSettingsManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;

  constructor({
    churchSettingsManager,
    activeChurchResolver,
    authorityGuard,
  }: ChurchSettingsControllerDependencies) {
    this.churchSettingsManager = churchSettingsManager;
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

    app.addHook('preValidation', async (request, reply) => {
      const authorized = await this.authorityGuard.canManageChurch({
        churchId: ChurchId.from(request.churchId),
        userId: UserId.from(request.userId),
      });
      if (!authorized) {
        return refuse({ reply, request, code: 'FORBIDDEN' });
      }
    });

    app.get(
      '',
      {
        schema: {
          tags: ['church-settings'],
          operationId: 'getChurchSettings',
          summary: 'Get the Active Church settings',
          description:
            'The Church Settings of the Active Church (name, slug, website, accent colour) and the public origin the `…/slug` address is shown under. Empty optional fields are null. ChurchAdmin only.',
          response: {
            200: churchSettingsResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const settings = await this.churchSettingsManager.getChurchSettings({
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(settings);
      },
    );

    app.get(
      '/slug-availability',
      {
        schema: {
          tags: ['church-settings'],
          operationId: 'getChurchSlugAvailability',
          summary: 'Check a Church Slug for the Active Church',
          description:
            "Whether a Church Slug is free, taken, reserved, or held in the Active Church's own slug history (it may take it back). Never says which Church holds a taken slug. ChurchAdmin only.",
          querystring: slugAvailabilityQuerySchema,
          response: {
            200: slugAvailabilityResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const status = await this.churchSettingsManager.getSlugAvailability({
          churchId: ChurchId.from(request.churchId),
          slug: (request.query as SlugAvailabilityQuery).slug,
        });
        return reply.send({ status });
      },
    );

    app.put(
      '',
      {
        attachValidation: true,
        schema: {
          tags: ['church-settings'],
          operationId: 'updateChurchSettings',
          summary: 'Save the Active Church settings',
          description:
            'Saves the whole set of Church Settings in one transaction, last write wins; the slug changes only when one is sent (its old value moves to the slug history). A refused save changes nothing and answers 422 with one entry per refused field (list rows addressed by index). ChurchAdmin only.',
          body: updateChurchSettingsBodySchema,
          response: {
            200: churchSettingsResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            409: errorResponseSchema,
            422: churchSettingsValidationErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (request.validationError) {
          const { locale } = request;
          return reply.code(422).send({
            error: 'VALIDATION_ERROR',
            message: m.common_validation_error({}, { locale }),
            fieldErrors: toChurchSettingsFieldErrors({
              issues: request.validationError
                .validation as ChurchSettingsValidationIssue[],
              locale,
            }),
          });
        }
        try {
          const settings =
            await this.churchSettingsManager.updateChurchSettings({
              churchId: ChurchId.from(request.churchId),
              changes: request.body as UpdateChurchSettingsBody,
            });
          return reply.send(settings);
        } catch (error) {
          if (!(error instanceof ChurchSlugTakenError)) throw error;
          const { locale } = request;
          return reply.code(422).send({
            error: 'VALIDATION_ERROR',
            message: m.common_validation_error({}, { locale }),
            fieldErrors: [
              churchSettingsFieldError({
                field: 'slug',
                code: 'CHURCH_SLUG_TAKEN',
                locale,
              }),
            ],
          });
        }
      },
    );
  }
}
