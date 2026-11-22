import { m } from '@church/i18n/messages';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { ChurchId, UserId } from '../../domain/branded-ids';
import { ChurchAddressesRefused } from '../../domain/church-address';
import { LOGO_MAX_BYTES } from '../../domain/church-logo';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IChurchSettingsManager } from '../../domain/contracts/application/church-settings-manager';
import {
  LogoTooLargeError,
  LogoUnsupportedTypeError,
} from '../../domain/errors/church-logo';
import { ChurchSlugTakenError } from '../../domain/errors/church-slug-taken';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  type ChurchSettingsValidationIssue,
  churchAddressRefusalsToFieldErrors,
  churchSettingsFieldError,
  churchSettingsResponseSchema,
  churchSettingsValidationErrorResponseSchema,
  type RestoreChurchLogoBody,
  restoreChurchLogoBodySchema,
  slugAvailabilityQuerySchema,
  slugAvailabilityResponseSchema,
  toChurchSettingsFieldErrors,
  type UpdateChurchSettingsBody,
  updateChurchSettingsBodySchema,
  uploadChurchLogoBodySchema,
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
    app.register(multipart, {
      limits: { fileSize: LOGO_MAX_BYTES, files: 1 },
    });

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
            'The Church Settings of the Active Church (name, slug, website, accent colour, addresses) and the public origin the `…/slug` address is shown under. Empty optional fields are null. ChurchAdmin only.',
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
          const { locale } = request;
          if (error instanceof ChurchAddressesRefused) {
            return reply.code(422).send({
              error: 'VALIDATION_ERROR',
              message: m.common_validation_error({}, { locale }),
              fieldErrors: churchAddressRefusalsToFieldErrors({
                refusals: error.refusals,
                locale,
              }),
            });
          }
          if (!(error instanceof ChurchSlugTakenError)) throw error;
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
    const logoResponses = {
      200: churchSettingsResponseSchema,
      401: errorResponseSchema,
      403: errorResponseSchema,
      409: errorResponseSchema,
    };

    app.put(
      '/logo',
      {
        // The body schema documents the form; the handler reads the multipart stream itself.
        attachValidation: true,
        schema: {
          tags: ['church-settings'],
          operationId: 'uploadChurchLogo',
          summary: 'Upload the Active Church logo',
          description:
            'Applies at once, outside the settings save. PNG, JPEG or WebP by content, at most 5 MB, longest side at least 128 px, ratio within 1:4–4:1; stored as one PNG of at most 512 px under a content-hashed key. Earlier logos stay stored. ChurchAdmin only.',
          consumes: ['multipart/form-data'],
          body: uploadChurchLogoBodySchema,
          response: {
            ...logoResponses,
            413: errorResponseSchema,
            415: errorResponseSchema,
            422: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const file = await request.file().catch(() => undefined);
        if (!file) throw new LogoUnsupportedTypeError();
        const bytes = await file.toBuffer().catch((error: unknown) => {
          if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
            throw new LogoTooLargeError();
          }
          throw error;
        });
        const settings = await this.churchSettingsManager.uploadLogo({
          churchId: ChurchId.from(request.churchId),
          bytes,
        });
        return reply.send(settings);
      },
    );

    app.delete(
      '/logo',
      {
        schema: {
          tags: ['church-settings'],
          operationId: 'removeChurchLogo',
          summary: 'Remove the Active Church logo',
          description:
            'Drops the logo reference at once; the stored image stays, so older emails keep rendering. ChurchAdmin only.',
          response: logoResponses,
        },
      },
      async (request, reply) => {
        const settings = await this.churchSettingsManager.removeLogo({
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(settings);
      },
    );

    app.put(
      '/logo/restore',
      {
        schema: {
          tags: ['church-settings'],
          operationId: 'restoreChurchLogo',
          summary: 'Re-apply an earlier logo of the Active Church',
          description:
            'Undo for a removal: points the Church back at one of its own earlier logo keys. ChurchAdmin only.',
          body: restoreChurchLogoBodySchema,
          response: { ...logoResponses, 422: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const { key } = request.body as RestoreChurchLogoBody;
        const settings = await this.churchSettingsManager.restoreLogo({
          churchId: ChurchId.from(request.churchId),
          key,
        });
        return reply.send(settings);
      },
    );
  }
}
