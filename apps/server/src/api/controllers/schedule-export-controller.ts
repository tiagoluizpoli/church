import { z } from 'zod';
import { ChurchId, CycleId, MinistryId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type {
  IScheduleExportReader,
  ScheduleExport,
} from '../../domain/contracts/application/schedule-export-reader';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import { denyMinistryManagement } from '../auth/ministry-management-access';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  type ScheduleExportFileQuery,
  scheduleExportDataSchema,
  scheduleExportFileQuerySchema,
  scheduleExportFileSchema,
} from '../dtos/schedule-export.dto';
import {
  attachmentDisposition,
  scheduleExportFileName,
  scheduleExportRenderPayload,
} from '../utils/schedule-export-render';
import type {
  ScheduleExportControllerDependencies,
  ScheduleExportRequestInput,
  ScheduleExportRouteParams,
} from './schedule-export-controller.types';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

const paramsSchema = z.object({
  ministryId: z.string(),
  cycleId: z.string(),
});

/**
 * A Ministry's Schedule for one Cycle as export data and files (#1243), for
 * the Ministry's leaders and ChurchAdmins. Files are rendered per request and
 * never stored: they hold people's names.
 */
export class ScheduleExportController implements FastifyController {
  readonly prefix = '/export';

  private readonly scheduleExportReader: IScheduleExportReader;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: IAuthorityGuard;

  constructor({
    scheduleExportReader,
    activeChurchResolver,
    authorityGuard,
  }: ScheduleExportControllerDependencies) {
    this.scheduleExportReader = scheduleExportReader;
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
      createActiveChurchPreValidation({
        resolver: this.activeChurchResolver,
      }),
    );
    const errors = {
      401: errorResponseSchema,
      403: errorResponseSchema,
      404: errorResponseSchema,
    };

    app.get(
      '/ministries/:ministryId/cycles/:cycleId/data',
      {
        schema: {
          tags: ['export'],
          operationId: 'getScheduleExportData',
          summary: "A Ministry's Schedule for one Cycle as export data",
          description:
            "The whole Cycle as one ordered tree of facts (parts → Events → time blocks → Shifts → Sectors → people), Church-local days and HH:mm times, with the draft, unsent-changes, single Sector/Role and duplicate-name facts. Only Events and blocks the Ministry serves; hidden cancelled scopes are left out. Never ready-made text. For the Ministry's leaders and ChurchAdmins; 404 when the Ministry has no Schedule in the Cycle.",
          params: paramsSchema,
          response: { 200: scheduleExportDataSchema, ...errors },
        },
      },
      async (request, reply) => {
        const exported = await this.read({ request, reply });
        if (!exported) return;
        return reply.send(exported.data);
      },
    );

    app.get(
      '/ministries/:ministryId/cycles/:cycleId/file',
      {
        schema: {
          tags: ['export'],
          operationId: 'getScheduleExportFile',
          summary: "Download a Ministry's Schedule for one Cycle",
          description:
            'The whole Cycle as an A4 landscape text PDF table, fixed text in the locale-cookie language, named "Escala - <Ministry> - <Cycle>". Same access and 404 as the data.',
          params: paramsSchema,
          querystring: scheduleExportFileQuerySchema,
          response: { 200: scheduleExportFileSchema, ...errors },
        },
      },
      async (request, reply) => {
        const exported = await this.read({ request, reply });
        if (!exported) return;
        const { format } = request.query as ScheduleExportFileQuery;
        const { locale } = request;
        const file = await this.scheduleExportReader.renderFile({
          exported,
          format,
          payload: scheduleExportRenderPayload({
            data: exported.data,
            locale,
          }),
        });
        const name = `${scheduleExportFileName({ data: exported.data, locale })}.${format}`;
        return reply
          .type('application/pdf')
          .header('Content-Disposition', attachmentDisposition({ name }))
          .header('Cache-Control', 'private, no-store')
          .send(Buffer.from(file));
      },
    );
  }

  /** The export, or null once the refusal was sent. */
  private async read({
    request,
    reply,
  }: ScheduleExportRequestInput): Promise<ScheduleExport | null> {
    const params = request.params as ScheduleExportRouteParams;
    const ministryId = MinistryId.from(params.ministryId);
    if (
      await denyMinistryManagement({
        authorityGuard: this.authorityGuard,
        request,
        reply,
        ministryId,
      })
    ) {
      return null;
    }
    return this.scheduleExportReader.read({
      churchId: ChurchId.from(request.churchId),
      ministryId,
      cycleId: CycleId.from(params.cycleId),
    });
  }
}
