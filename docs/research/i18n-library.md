# Research: i18n library for the web app and server emails

Status: research only, no application code changed. Date: 2026-10-08.
Question: [Choose an i18n library for the web app and server emails](https://github.com/tiagoluizpoli/church/issues/390) (EN + pt-BR, one catalog for UI and emails).

**Recommendation: Paraglide JS (inlang), compiled once from a shared workspace package.**
**Runner-up: Lingui.** Details and the other candidates below.

## 1. Repo constraints (read from the code)

- Web: React + TanStack Router + Vite 6, `<html lang="en">` in `apps/web/index.html`, no i18n library. Vitest has `unit` (node), `component` (jsdom + RTL + MSW) and `integration` projects, `maxWorkers: 2`, and a pinned ambient `TZ=Pacific/Auckland` (`apps/web/vitest.config.ts`). Component tests render components bare, with no app providers.
- Playwright already runs with `use.locale: 'pt-BR'` (`apps/web/playwright.config.ts`). Any detection that reads `navigator.language` or `Accept-Language` would therefore flip an English-asserting E2E suite to pt-BR the moment a library is installed. Tests must pin a locale explicitly.
- Server emails: `ResendEmailSender.composeEmail` (`apps/server/src/infrastructure/services/resend-email-sender.ts`) is a `switch` over `payload.kind` building English template-literal HTML. Payloads carry no locale and no Church Timezone ("times read UTC", per the code comment). Emails are sent from an outbox drainer, so there is no HTTP request to read a locale from: the recipient's language has to travel in the payload or be looked up (a #391 matter).
- Server is Fastify on Node (`tsx` in dev, `tsdown` build, `bun build --compile` option). `packages/*` export TypeScript source directly (`@church/time`: `exports` -> `./src/index.ts`).
- `@church/time` (ADR-0003, `docs/adr/0003-date-time-seam-church-timezone-truth.md`): 24-hour time and `dd/MM/yyyy` are constants; the display functions take no `locale`, and "words stay English until a dedicated i18n pass, which will live inside this same package". Weekday names and "today/tomorrow/in N days" are hardcoded English in `packages/time/src/display.ts`.
- Test-speed rule from the map: do not regress the existing optimizations (worker cap, no value files for unit tests, lane-based E2E). So: no per-test async catalog loading, no provider boilerplate in every component test, no extra build step in the unit lane that needs a network.

## 2. Candidates

Versions and dates from `npm view` and the GitHub API on 2026-10-08.

| | Paraglide JS | Lingui | i18next + react-i18next | FormatJS react-intl | typesafe-i18n |
|---|---|---|---|---|---|
| Version / license | 2.26.0 / MIT | 6.9.0 / MIT | 26.4.2 + 17.0.16 / MIT | 12.1.4 / BSD-3-Clause | 5.27.1 / MIT |
| Last release | pushed 2026-10-09; npm 2026-10-06 | 2026-10-01 | 2026-09-03 / 2026-10-06 | 2026-10-05 | 2026-02-11 |
| Stars (GitHub) | 733 (paraglide-js), 2003 (opral/monorepo) | 5907 | 8639 / 10051 | 14744 | 2478 |
| Type-safe keys | Yes, generated functions | Opt-in, ids only | Opt-in via type augmentation | Opt-in, ids only | Yes |
| Type-safe params | Yes (verified) | No | Yes for `{{var}}` strings in `as const` TS, not JSON | No | Yes |
| Plurals | `Intl.PluralRules` variants | ICU | `Intl.PluralRules`, `_one/_other` keys | ICU | Own syntax |
| Date in explicit IANA zone | Yes, `datetime ... timeZone=$tz` (verified, dynamic) | `i18n.date(v, opts)` (Intl) | `datetime` formatter via `formatParams`; docs do not mention `timeZone` | `timeZone` in config; `formatDate` takes Intl options | Own formatters |
| Server emails (no provider) | `m.key(params, {locale})`, no setup | `setupI18n()` per locale | `i18next.getFixedT(lng)` | `createIntl()` | Yes |
| Marginal runtime (min+gz, hello-world) | ~+4 kB (measured, see 4) | ~+3 kB | ~+18 kB | ~+16 kB | ~1 kB claimed |
| Maintenance | Active, one company (opral) | Active | Very active | Very active | Slowing (see below) |

### Paraglide JS

- Compiler: messages become typed ESM functions, `emitTsDeclarations` for editor types. Source: [README](https://github.com/opral/paraglide-js/blob/main/README.md), [compiling-messages](https://github.com/opral/paraglide-js/blob/main/docs/compiling-messages.md).
- **Verified here** (scratch project, Bun + Node): wrong param name (`m.hello({nme})`) and unknown key (`m.nokey()`) are `tsc` errors; `m.people({count:3},{locale:'pt-BR'})` -> "3 pessoas"; `datetime ... timeZone=$tz` with `tz` passed at call time rendered 19:30 for `America/Sao_Paulo` and a different time for `Pacific/Auckland` from the same instant.
- **Server/emails**: second argument `{locale}` selects the locale per call ([basics](https://github.com/opral/paraglide-js/blob/main/docs/basics.md): "useful for server-side rendering"). An outbox worker needs no middleware or AsyncLocalStorage. For HTTP requests there is `paraglideMiddleware` (AsyncLocalStorage) in [middleware](https://github.com/opral/paraglide-js/blob/main/docs/middleware.md); it is only needed for SSR, not here.
- **Monorepo**: [monorepo.md](https://github.com/opral/paraglide-js/blob/main/docs/monorepo.md) "Pattern 2: Shared i18n Package": one `packages/i18n` with `project.inlang` + `messages/{locale}.json`, compiled once, `exports` `./messages` and `./runtime`; both apps import it. Warning in the doc: all consumers share one locale-detection strategy because it compiles once. That is harmless here because the server passes `{locale}` explicitly. Pattern 1 (each package compiles from one shared project) is the alternative if the web app needs a different strategy.
- **Plurals/formatting**: [variants](https://github.com/opral/paraglide-js/blob/main/docs/variants.md) (`Intl.PluralRules`, exact `=0` via a second selector, offsets, ordinals) and [formatting](https://github.com/opral/paraglide-js/blob/main/docs/formatting.md) (`number`, `datetime`, `relativetime` over `Intl`; the doc itself says "Use an explicit `timeZone` if output must be stable across environments"). Message files can also use ICU-style `{count, plural, one {#} other {#}}` ([file-formats](https://github.com/opral/paraglide-js/blob/main/docs/file-formats.md)); the ICU1 plugin imports ICU plurals.
- **License / self-host**: MIT. The compiler is an npm package. Caveat found: the default `project.inlang/settings.json` references the message-format plugin by a jsDelivr CDN URL, so compile needs network. **Verified workaround**: `npm i @inlang/plugin-message-format` and point `modules` at `./node_modules/@inlang/plugin-message-format/dist/index.js`; compile then succeeded with HTTP(S) proxies pointed at a dead port. Pin it that way (offline-capable CI, no CDN dependency). No SaaS or account is needed; inlang's editor/Sherlock/Fink are optional.
- **TanStack Router**: the only library named on the router's own i18n guide, with client-only and TanStack Start examples ([guide](https://tanstack.com/router/latest/docs/framework/react/guide/internationalization-i18n)). The same guide documents two library-free URL patterns: optional path param `/{-$locale}/...` and the router `rewrite` option (`input`/`output`) for locale prefixes.
- **Test pinning**: `overwriteGetLocale(() => 'pt-BR')` (verified in Node) or `{locale}` per call; a `globalVariable` strategy is documented as intended for tests ([strategy](https://github.com/opral/paraglide-js/blob/main/docs/strategy.md)). No provider, so component tests need no wrapper. The Vite plugin compiles in the Vitest pipeline (Vitest uses Vite), assumption not run here; alternatively commit nothing and run `compile` as a pre-step of the root scripts.
- **Risks**: smaller community than i18next/Lingui (733 stars on the repo); vendor-run, though MIT and reproducible offline; generated code lives in the repo tree (gitignore it, regenerate in `typecheck`/`test` tasks, or commit it); the doc says "Best when keys are known at build time", i.e. no runtime/CMS-driven keys (not needed here); `setLocale` does a full page reload by default (acceptable for a language switch).
- Gotcha found: the English `datetime` example rendered "11:30 AM". ADR-0003 locks 24-hour time, so every `datetime` declaration needs an explicit `hourCycle=h23` (a standard `Intl.DateTimeFormat` option that Paraglide forwards; not run here), or dates keep flowing through `@church/time`.

### Lingui

- Macro/extraction workflow: `t`, `Trans`, `Plural` macros; CLI extracts to PO (default), JSON or CSV; runtime "around 2 kB", no message parser at runtime ([introduction](https://lingui.dev/introduction)). ICU MessageFormat, so plurals are the standard syntax.
- Framework-agnostic `@lingui/core` works on a Node server ([introduction](https://lingui.dev/introduction)); a shared monorepo guide exists (`website/docs/guides/monorepo.md` in the repo).
- Type safety is weaker: the default workflow uses source text as the id; typed ids are opt-in via a `Register` augmentation and cover ids only, not params ([typed-message-ids](https://github.com/lingui/js-lingui/blob/main/website/docs/guides/typed-message-ids.md)).
- Build: needs a macro transform. The Vite plugin's built-in transform is documented for `@vitejs/plugin-react` and Vite 8+/Rolldown, and is off by default; Vite 6/7 is not mentioned ([vite-plugin](https://lingui.dev/ref/vite-plugin)). The repo is on Vite 6, so the SWC or Babel macro plugin is the safe path. Macros also have to run in Vitest and in the server build (tsx/tsdown) for any file that uses them, which is the main extra cost versus Paraglide.
- Tests: wrap in `I18nProvider` and `i18n.activate(locale)` ([testing](https://github.com/lingui/js-lingui/blob/main/website/docs/guides/testing.md)). A shared `render` helper is needed; existing component tests that render bare would need touching.
- Strengths: PO catalogs are translator-tool friendly, descriptive extraction, largest ICU-native community among the type-safe-ish options, MIT. Has a TanStack Start example in its repo.

### i18next + react-i18next

- Most mature and largest ecosystem (10051 stars react-i18next), MIT, very active.
- Types: resources typed via `CustomTypeOptions` augmentation; interpolation variables are inferred only when resources are an `as const` TS file or `.d.ts` interface, "JSON files don't support `as const`", and large resource sets can be slow or run out of memory with the legacy key checks ([typescript](https://www.i18next.com/overview/typescript)). Sharing one catalog between web and server therefore means a TS-source catalog.
- Date formatting: `datetime`/`relativetime`/`number` formatters exist; the formatting page does not document `timeZone`, only links MDN ([formatting](https://www.i18next.com/translation-function/formatting)). Plural keys `_one/_other` use `Intl.PluralRules`.
- Heaviest runtime of the set (~+18 kB gz measured).
- Not named on the TanStack Router i18n guide. Paraglide's own docs say it can compile existing i18next JSON, an easy exit later ([paraglide-vs-react-i18next](https://github.com/opral/paraglide-js/blob/main/docs/paraglide-vs-react-i18next.md), vendor claim).

### FormatJS / react-intl

- BSD-3-Clause, very active (14744 stars). `createIntl()` works without React ([API](https://formatjs.github.io/docs/react-intl/api)). `timeZone` is in `IntlConfig`; `formatDate` takes `Intl.DateTimeFormatOptions`. ICU plurals, extraction CLI.
- Message ids are `string` unless narrowed by global augmentation of `keyof typeof messages`; params unchecked ([docs](https://formatjs.github.io/docs/react-intl/)).
- ~+16 kB gz measured. Needs an `IntlProvider` in every component test. Fits if ICU/translator tooling matters more than types, which it does not here.

### typesafe-i18n

- Excellent type safety and ~1 kB, but the README now reads "Created by Ivan Hofer (1995-2023)", the last release is 2026-02-11 (a provenance fix), and it has 42 open issues. Maintenance is thin and the tooling is its own syntax/generator, so it is the highest long-term risk. Not recommended for a project starting now.

### Others noticed, not pursued

- `use-intl` (next-intl core, MIT): named by TanStack docs for Start, ICU-based, type-safety via augmentation; same shape as react-intl.
- Intlayer: named on the TanStack guide; component-scoped content model that does not suit a shared server catalog.

## 3. Judgment against the criteria

| Criterion | Paraglide | Lingui | i18next | react-intl |
|---|---|---|---|---|
| Typed keys + params | Best, no setup | Ids opt-in, no params | Partial, TS-source catalogs | Ids opt-in, no params |
| One catalog for web and server emails | Shared package, call with `{locale}` | Yes, `setupI18n` per call | Yes | Yes |
| Plurals (pt-BR `one`/`other`; `0` handled) | Yes | Yes (ICU) | Yes | Yes (ICU) |
| Explicit IANA zone in dates | Yes (verified, dynamic) | Via Intl | Undocumented | Yes |
| Bundle cost | Smallest of the full-featured | Small | Largest | Large |
| License / self-host | MIT, offline compile after pinning plugin locally | MIT | MIT | BSD-3 |
| Maintenance health | Active; smaller community | Active | Very active | Very active |
| Test pinning without slowdown | No provider; override locale | Provider wrapper | Provider + init | Provider wrapper |
| Fit with TanStack Router | Only library on its guide | Starter exists | Generic | Generic |
| Build friction on Vite 6 + Vitest + tsx | Plugin or CLI pre-step | Macro transform in all three toolchains | None | None (but extraction step) |

Decisive reasons for Paraglide: (1) compile-time typed keys and params are the only ones that need zero setup and catch both typos and missing params in the email code, where the current `switch` already has structured payloads; (2) a plain function call with `{locale}` suits the outbox-driven emails with no provider or request context; (3) smallest runtime; (4) the only library the TanStack Router guide documents, with the same guide's library-free URL patterns still available; (5) no provider means no churn in the component tests and no async catalog loading to slow them.

Why Lingui is runner-up: standard ICU + PO catalogs and the strongest translator workflow, MIT, tiny runtime. It loses on typed params, on macro transforms having to run in three toolchains (Vite 6, Vitest, the tsx/tsdown server), and on provider wrappers in tests. It is the fallback if the owner prefers ICU/PO catalogs over type-safety or Paraglide's vendor concentration worries them.

## 4. Measurements (reproducible)

`bun build --minify --target=browser` of a hello-world React render versus the same plus each library with two messages (one interpolation, one plural), gzip -9: base 67.7 kB; Paraglide +3.9 kB; Lingui +2.7 kB; react-intl +16.1 kB; i18next + react-i18next +18.5 kB. A hello-world is not a real app: Paraglide's growth is per used message; the others grow with the whole catalog loaded. Source of truth for that claim is the vendor's benchmark, which I did not rerun.

## 5. Notes for neighbouring decisions

For [Language choice and storage](https://github.com/tiagoluizpoli/church/issues/391) (not decided here):

- **Locale in the URL or not.** Options: (a) no URL segment; locale from a cookie/stored user preference, `lang` set on `<html>`; simplest for a logged-in app with no SEO need. (b) URL prefix via the router's `rewrite` or `/{-$locale}/` optional param, with Paraglide's `url` strategy; shareable links carry the language, every `Link` needs the param. (c) hybrid: stored preference decides, URL ignored. The library supports all three; Paraglide's `strategy` is an ordered fallback list (`url`, `cookie`, `localStorage`, `preferredLanguage`, `baseLocale`).
- **Recipient language for emails.** The outbox payload has no locale; a user or invitation language must be stored and put in the payload (invitations go to people who have no account yet, so it must be captured on the invitation).
- **Default language.** The `<html lang>` is `en`, but the users are Brazilian and Playwright already runs as `pt-BR`; choosing `baseLocale` (the fallback and the source-of-truth locale) is part of that decision.
- **Church Timezone vs. person's zone for emails**: the sender has no Church Timezone today; the shared message needs it as a `tz` parameter.

Open point this research exposes (not a new ticket): **ADR-0003 conflict.** It forbids a `locale` parameter on `@church/time` and says the i18n pass lives in that package. Weekday names and "today/tomorrow/in N days" are hardcoded English there. Two ways to reconcile: keep date/time presentation in `@church/time` with the locale passed in (amends ADR-0003's "no locale" rule and the "no locale-derived formatting inside the seam" rule while keeping 24h), or let the catalog own all words and `datetime` formats (with `hourCycle=h23`) and use `@church/time` only for the Church Timezone arithmetic. Needs an owner decision, probably inside the i18n foundation spec.

## 6. What to verify first in the foundation spec

1. Run Paraglide's Vite plugin under Vitest `component` project and the `tsdown` server build (assumed, not run).
2. Confirm `hourCycle=h23` yields `HH:mm` in both locales.
3. Decide generated code policy (gitignore + compile in `typecheck`/`test` tasks vs. committed) and how it plays with `validate:affected` and the E2E lanes.
4. Pin the locale in Playwright (`locale: 'pt-BR'` is already set today, so detection must not read it).
5. Add a lint or CI check that no user-facing string is outside the catalog (nothing in Paraglide enforces this).
