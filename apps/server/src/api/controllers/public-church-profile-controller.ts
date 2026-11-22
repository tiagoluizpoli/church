import type { AppConfig } from '@church/app-config';
import type { z } from 'zod';
import type { IPublicChurchProfileManager } from '../../domain/contracts/application/public-church-profile-manager';
import type { IPublicEventManager } from '../../domain/contracts/application/public-event-manager';
import type { WebShell } from '../../domain/contracts/infrastructure';
import { decodePublicEventCursor } from '../../domain/public-event-cursor';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  publicChurchProfileErrorResponseSchema,
  publicChurchProfileParamsSchema,
  publicChurchProfileResponseSchema,
} from '../dtos/public-church-profile.dto';
import {
  publicEventsQuerystringSchema,
  publicEventsResponseSchema,
  publicEventsToResponse,
} from '../dtos/public-event.dto';
import { renderChurchPageHead } from '../utils/church-page-head';
import { isRateLimited } from '../utils/rate-limit';
import { refuse } from '../utils/refuse';

type PublicChurchProfileParams = z.infer<
  typeof publicChurchProfileParamsSchema
>;

interface ChurchPageInput {
  ip: string;
  slug: string;
}

interface ChurchPageRedirect {
  redirectTo: string;
}

interface ChurchPageShell {
  status: number;
  /** Absent: the unfilled SPA shell. */
  html?: string;
}

type ChurchPageAnswer = ChurchPageRedirect | ChurchPageShell;

interface PublicChurchProfileControllerDependencies {
  publicChurchProfileManager: IPublicChurchProfileManager;
  publicEventManager: IPublicEventManager;
  webShell: WebShell;
  config: AppConfig;
}

/** Sign-in-free reads of the Public Church Profile, rate limited per client IP. */
export class PublicChurchProfileController implements FastifyController {
  readonly prefix = '/public/churches';

  private readonly publicChurchProfileManager: IPublicChurchProfileManager;
  private readonly publicEventManager: IPublicEventManager;
  private readonly webShell: WebShell;
  private readonly rateLimit: AppConfig['publicProfileRateLimit'];
  private readonly appName: AppConfig['appName'];

  constructor({
    publicChurchProfileManager,
    publicEventManager,
    webShell,
    config,
  }: PublicChurchProfileControllerDependencies) {
    this.publicChurchProfileManager = publicChurchProfileManager;
    this.publicEventManager = publicEventManager;
    this.webShell = webShell;
    const { publicProfileRateLimit, appName } = config;
    this.rateLimit = publicProfileRateLimit;
    this.appName = appName;
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.get(
      '/:slug',
      {
        schema: {
          tags: ['public-church-profile'],
          operationId: 'getPublicChurchProfile',
          summary: 'Get a Public Church Profile',
          description:
            'The public identity of the Church a live or old Church Slug names. No session needed. `slug` is always the current one: an old slug answers the current slug so the caller replaces its URL. Unknown slug: 404.',
          params: publicChurchProfileParamsSchema,
          response: {
            200: publicChurchProfileResponseSchema,
            404: publicChurchProfileErrorResponseSchema,
            429: publicChurchProfileErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { windowMs, maxRequests } = this.rateLimit;
        if (
          isRateLimited({
            key: `public-church-profile:${request.ip}`,
            windowMs,
            maxRequests,
          })
        )
          return refuse({ reply, request, code: 'RATE_LIMITED' });
        const { slug } = request.params as PublicChurchProfileParams;
        const profile = await this.publicChurchProfileManager.getProfile({
          slug,
        });
        if (!profile) return refuse({ reply, request, code: 'NOT_FOUND' });
        return reply.send(profile);
      },
    );

    // Caddy sends `/{slug}` here (deployment/Caddyfile): crawlers get real
    // meta tags and a real 301, then the SPA renders from the public API.
    app.get(
      '/:slug/page',
      { schema: { hide: true, params: publicChurchProfileParamsSchema } },
      async (request, reply) => {
        const page = await this.churchPage({
          ip: request.ip,
          ...(request.params as PublicChurchProfileParams),
        });
        if ('redirectTo' in page) {
          // Old printed or shared links keep their tracking parameters.
          const { search } = new URL(request.url, 'http://church.invalid');
          return reply.redirect(`${page.redirectTo}${search}`, 301);
        }
        return reply
          .code(page.status)
          .type('text/html; charset=utf-8')
          .header('Cache-Control', 'no-cache')
          .send(page.html ?? (await this.webShell.readIndexHtml()));
      },
    );

    app.get(
      '/:slug/events',
      {
        schema: {
          tags: ['public-church-profile'],
          operationId: 'listPublicChurchEvents',
          summary: 'List upcoming Public Events of a Church',
          description:
            'Upcoming Public Events of the Church a live or old Church Slug names, 20 per page ordered by start then id. No session needed. Only public blocks are served. Unknown slug: 404.',
          params: publicChurchProfileParamsSchema,
          querystring: publicEventsQuerystringSchema,
          response: {
            200: publicEventsResponseSchema,
            404: publicChurchProfileErrorResponseSchema,
            429: publicChurchProfileErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { windowMs, maxRequests } = this.rateLimit;
        if (
          isRateLimited({
            key: `public-church-events:${request.ip}`,
            windowMs,
            maxRequests,
          })
        )
          return refuse({ reply, request, code: 'RATE_LIMITED' });
        const { slug } = request.params as PublicChurchProfileParams;
        const { cursor } = request.query as z.infer<
          typeof publicEventsQuerystringSchema
        >;
        const result = await this.publicEventManager.listPublicEventsBySlug({
          slug,
          after: cursor ? decodePublicEventCursor({ cursor }) : undefined,
        });
        if (!result) return refuse({ reply, request, code: 'NOT_FOUND' });
        return reply.send(publicEventsToResponse(result));
      },
    );
  }

  /** The `/{slug}` answer: a 301 for an old slug, else a status and the filled head (`html` absent = the unfilled shell). */
  private async churchPage({
    ip,
    slug,
  }: ChurchPageInput): Promise<ChurchPageAnswer> {
    const { windowMs, maxRequests } = this.rateLimit;
    if (
      isRateLimited({ key: `public-church-page:${ip}`, windowMs, maxRequests })
    )
      return { status: 429 };
    const profile = await this.publicChurchProfileManager.getProfile({ slug });
    if (!profile) return { status: 404 };
    if (profile.slug !== slug) return { redirectTo: `/${profile.slug}` };
    return {
      status: 200,
      html: renderChurchPageHead({
        indexHtml: await this.webShell.readIndexHtml(),
        appName: this.appName,
        publicOrigin: this.webShell.publicOrigin,
        church: profile,
      }),
    };
  }
}
