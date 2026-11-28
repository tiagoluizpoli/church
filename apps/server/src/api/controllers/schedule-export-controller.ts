import { NotFoundError } from '@church/core';
import { m } from '@church/i18n/messages';
import { z } from 'zod';
import { ChurchId, CycleId, MinistryId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type {
  IScheduleExportReader,
  ScheduleExport,
  ScheduleExportLayout,
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
import type { ScheduleExportMedia } from '../utils/schedule-export-render.types';
import type {
  ScheduleExportControllerDependencies,
  ScheduleExportFilePart,
  ScheduleExportLayoutInput,
  ScheduleExportPartInput,
  ScheduleExportRequestInput,
  ScheduleExportRouteParams,
} from './schedule-export-controller.types';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

/** The PDF prints A4 pages; the table PNG is one page as tall as the grid. */
const MEDIA = { pdf: 'print', png: 'image' } as const;

/** Cards are PNG only: the PDF is always the table. */
function layoutOf({
  format,
  layout,
}: ScheduleExportLayoutInput): ScheduleExportLayout {
  return format === 'png' ? layout : 'grid';
}

/** What the template lays out: the cards, or the table as the format prints it. */
function mediaOf({
  format,
  layout,
}: ScheduleExportLayoutInput): ScheduleExportMedia {
  return layout === 'cards' ? 'cards' : MEDIA[format];
}
const CONTENT_TYPE = { pdf: 'application/pdf', png: 'image/png' } as const;

const paramsSchema = z.object({
  ministryId: z.string(),
  cycleId: z.string(),
});

const ministryParamsSchema = z.object({ ministryId: z.string() });

/**
 * What one file holds: the PDF every part, each starting on a new page; a
 * PNG only its 1-based part. Throws `NotFoundError` past the last part.
 */
function filePart({
  data,
  format,
  part,
}: ScheduleExportPartInput): ScheduleExportFilePart {
  if (format === 'pdf') return { data };
  const chosen = data.parts[part - 1];
  if (!chosen) throw new NotFoundError('Export part');
  return { data: { ...data, parts: [chosen] }, part: chosen };
}

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
        const ministryId = await this.allowedMinistry({ request, reply });
        if (!ministryId) return;
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
            "The Cycle, or its inclusive `from`/`to` days (an Event belongs by its Church-local start day), as one ordered tree of facts (parts → Events → time blocks → Shifts → Sectors → people), Church-local days and HH:mm times, with the draft, unsent-changes, single Sector/Role and duplicate-name facts. `split` gives the parts in order: Event groups as saved with the catch-all last, Monday-to-Sunday weeks kept inside the range by date, Sectors or Roles alphabetical, each holding only its own spots. Only Events and blocks the Ministry serves; hidden cancelled scopes are left out. Never ready-made text. For the Ministry's leaders and ChurchAdmins; 404 `EXPORT_SCHEDULE_NOT_FOUND` when the Ministry has no Schedule in the Cycle; 400 `INVALID_DATE_RANGE` when `from` is after `to`; 422 `EXPORT_RANGE_OUTSIDE_CYCLE` when either reaches past the Cycle.",
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
            'The Cycle or its `from`/`to` days as an A4 landscape text PDF table (`pdf`, whatever the layout), every `split` part starting on a new page; one part\'s (the 1-based `part`) whole grid in one PNG never cut by size (`png`); or with `layout=cards` the part\'s card image `page`: 1080 px wide, cut at most 1600 px tall only between cards, a taller card being an image of its own. Fixed text in the locale-cookie language, named "Escala - <Ministry> - <Cycle>", plus " - <part>" for a PNG of a split and " - parte N de M" when the part\'s cards make several images. `page` is 1-based, default 1; the PDF is one file. 404 past the last part or page, so a client reads every file in order until then. Same access, range, split and errors as the data.',
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
        const query = request.query as ScheduleExportFileQuery;
        const { format, part, page } = query;
        // The PDF holds every page in its one file.
        if (format === 'pdf' && page > 1)
          throw new NotFoundError('Export file');
        const { locale } = request;
        const chosen = filePart({ data: exported.data, format, part });
        const layout = layoutOf(query);
        const payload = scheduleExportRenderPayload({
          data: chosen.data,
          locale,
          media: mediaOf({ format, layout }),
        });
        const suffixes: string[] = [];
        if (layout === 'cards') {
          const count = await this.scheduleExportReader.countPages({
            exported,
            payload,
            layout,
          });
          if (page > count) throw new NotFoundError('Export file');
          if (count > 1) {
            suffixes.push(
              m.export_file_part(
                { part: String(page), count: String(count) },
                { locale },
              ),
            );
          }
        }
        const file = await this.scheduleExportReader.renderFile({
          exported,
          format,
          page,
          layout,
          payload,
        });
        // Typst writes nothing for a page past the last.
        if (file.byteLength === 0) throw new NotFoundError('Export file');
        const name = `${scheduleExportFileName({ ...chosen, locale, suffixes })}.${format}`;
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
            'Page `page` of the file `format` and `layout` name, for the Cycle or its `from`/`to` days and `split`, rendered as SVG from the same template and payload as the file: an A4 page of the PDF, its pages running through every part, the one page of the table image of `part`, or card image `page` of `part`. Fixed text in the locale-cookie language. 404 past the last page or part; otherwise the same access, range and errors as the data.',
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
        const query = request.query as ScheduleExportPreviewQuery;
        const { format, part, page } = query;
        const { data } = filePart({ data: exported.data, format, part });
        const layout = layoutOf(query);
        const svg = await this.scheduleExportReader.renderFile({
          exported,
          format: 'svg',
          page,
          layout,
          payload: scheduleExportRenderPayload({
            data,
            locale: request.locale,
            media: mediaOf({ format, layout }),
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

  /** The route's Ministry when the caller may export it, or null once the refusal was sent. */
  private async allowedMinistry({
    request,
    reply,
  }: ScheduleExportRequestInput): Promise<MinistryId | null> {
    const ministryId = MinistryId.from(
      (request.params as ScheduleExportRouteParams).ministryId,
    );
    const denied = await denyMinistryManagement({
      authorityGuard: this.authorityGuard,
      request,
      reply,
      ministryId,
    });
    return denied ? null : ministryId;
  }

  /** The export, or null once the refusal was sent. */
  private async read({
    request,
    reply,
  }: ScheduleExportRequestInput): Promise<ScheduleExport | null> {
    const params = request.params as ScheduleExportRouteParams;
    const { from, to, split } = request.query as ScheduleExportRangeQuery;
    const ministryId = await this.allowedMinistry({ request, reply });
    if (!ministryId) return null;
    return this.scheduleExportReader.read({
      churchId: ChurchId.from(request.churchId),
      ministryId,
      cycleId: CycleId.from(params.cycleId),
      from,
      to,
      split,
    });
  }
}
