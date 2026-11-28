import { NotFoundError } from '@church/core';
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
  type ScheduleExportCyclesQuery,
  type ScheduleExportFileQuery,
  type ScheduleExportPreviewQuery,
  type ScheduleExportRangeQuery,
  scheduleExportCyclesQuerySchema,
  scheduleExportCyclesSchema,
  scheduleExportDataSchema,
  scheduleExportFileQuerySchema,
  scheduleExportFileSchema,
  scheduleExportPreviewQuerySchema,
  scheduleExportPreviewSchema,
  scheduleExportRangeQuerySchema,
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

/** The PDF prints A4 pages; the table PNG is one page as tall as the grid. */
const MEDIA = { pdf: 'print', png: 'image' } as const;
const CONTENT_TYPE = { pdf: 'application/pdf', png: 'image/png' } as const;

const paramsSchema = z.object({
  ministryId: z.string(),
  cycleId: z.string(),
});

const ministryParamsSchema = z.object({ ministryId: z.string() });

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
    const rangeErrors = {
      400: errorResponseSchema,
      422: errorResponseSchema,
    };

    app.get(
      '/ministries/:ministryId/cycles',
      {
        schema: {
          tags: ['export'],
          operationId: 'listScheduleExportCycles',
          summary: 'The Cycles a Ministry has a Schedule in',
          description:
            "Newest first, for the export's Cycle picker; `isCurrent` marks the one running on the Church's today. `q` keeps the Cycles where every word is found in the name, a date (DD/MM/YYYY or YYYY-MM-DD) or a month covered with its year, in the locale-cookie language, ignoring case and accents. For the Ministry's leaders and ChurchAdmins.",
          params: ministryParamsSchema,
          querystring: scheduleExportCyclesQuerySchema,
          response: { 200: scheduleExportCyclesSchema, ...errors },
        },
      },
      async (request, reply) => {
        const ministryId = MinistryId.from(
          (request.params as ScheduleExportRouteParams).ministryId,
        );
        if (
          await denyMinistryManagement({
            authorityGuard: this.authorityGuard,
            request,
            reply,
            ministryId,
          })
        ) {
          return;
        }
        const { q } = request.query as ScheduleExportCyclesQuery;
        const cycles = await this.scheduleExportReader.listCycles({
          churchId: ChurchId.from(request.churchId),
          ministryId,
          q,
          locale: request.locale,
        });
        return reply.send({ cycles });
      },
    );

    app.get(
      '/ministries/:ministryId/cycles/:cycleId/data',
      {
        schema: {
          tags: ['export'],
          operationId: 'getScheduleExportData',
          summary: "A Ministry's Schedule for one Cycle as export data",
          description:
            "The Cycle, or its inclusive `from`/`to` days (an Event belongs by its Church-local start day), as one ordered tree of facts (parts → Events → time blocks → Shifts → Sectors → people), Church-local days and HH:mm times, with the draft, unsent-changes, single Sector/Role and duplicate-name facts. Only Events and blocks the Ministry serves; hidden cancelled scopes are left out. Never ready-made text. For the Ministry's leaders and ChurchAdmins; 404 `EXPORT_SCHEDULE_NOT_FOUND` when the Ministry has no Schedule in the Cycle; 400 `INVALID_DATE_RANGE` when `from` is after `to`; 422 `EXPORT_RANGE_OUTSIDE_CYCLE` when either reaches past the Cycle.",
          params: paramsSchema,
          querystring: scheduleExportRangeQuerySchema,
          response: {
            200: scheduleExportDataSchema,
            ...errors,
            ...rangeErrors,
          },
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
            'The Cycle or its `from`/`to` days as an A4 landscape text PDF table (`pdf`) or as the whole grid in one PNG, never cut by size (`png`), fixed text in the locale-cookie language, named "Escala - <Ministry> - <Cycle>". Same access, range and errors as the data.',
          params: paramsSchema,
          querystring: scheduleExportFileQuerySchema,
          response: {
            200: scheduleExportFileSchema,
            ...errors,
            ...rangeErrors,
          },
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
            media: MEDIA[format],
          }),
        });
        const name = `${scheduleExportFileName({ data: exported.data, locale })}.${format}`;
        return reply
          .type(CONTENT_TYPE[format])
          .header('Content-Disposition', attachmentDisposition({ name }))
          .header('Cache-Control', 'private, no-store')
          .send(Buffer.from(file));
      },
    );

    app.get(
      '/ministries/:ministryId/cycles/:cycleId/preview',
      {
        schema: {
          tags: ['export'],
          operationId: 'getScheduleExportPreview',
          summary: "One SVG page of a Ministry's Schedule export",
          description:
            'Page `page` of the file `format` names, for the Cycle or its `from`/`to` days, rendered as SVG from the same template and payload as the file: an A4 page of the PDF, or the one page of the table image. Fixed text in the locale-cookie language. 404 past the last page; otherwise the same access, range and errors as the data.',
          params: paramsSchema,
          querystring: scheduleExportPreviewQuerySchema,
          response: {
            200: scheduleExportPreviewSchema,
            ...errors,
            ...rangeErrors,
          },
        },
      },
      async (request, reply) => {
        const exported = await this.read({ request, reply });
        if (!exported) return;
        const { format, page } = request.query as ScheduleExportPreviewQuery;
        const svg = await this.scheduleExportReader.renderFile({
          exported,
          format: 'svg',
          page,
          payload: scheduleExportRenderPayload({
            data: exported.data,
            locale: request.locale,
            media: MEDIA[format],
          }),
        });
        // Typst writes nothing for a page past the last.
        if (svg.byteLength === 0) throw new NotFoundError('Preview page');
        return reply
          .type('image/svg+xml')
          .header('Cache-Control', 'private, no-store')
          .send(Buffer.from(svg));
      },
    );
  }

  /** The export, or null once the refusal was sent. */
  private async read({
    request,
    reply,
  }: ScheduleExportRequestInput): Promise<ScheduleExport | null> {
    const params = request.params as ScheduleExportRouteParams;
    const { from, to } = request.query as ScheduleExportRangeQuery;
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
      from,
      to,
    });
  }
}
