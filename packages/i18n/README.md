# @church/i18n

The UI and server message catalog (Paraglide JS). Locales `en` (base) and `pt-BR`. Import `m` from `@church/i18n/messages` and `getLocale`, `setLocale`, `locales`, `isLocale`, `overwriteGetLocale` from `@church/i18n/runtime`. Never import it in `packages/core` or `apps/server/src/domain`: localize in the HTTP layer only.

`messages/*.json` compile into the git-ignored `src/paraglide/` on `bun install` (`postinstall`) and before `dev`, `typecheck`, `test:unit` and `build`. Dev startup compiles the current catalog before launching the servers, including after a pull that adds message keys. Run `bun run compile` here after editing a catalog. A wrong key or param name fails `tsc`.

## Add a key

1. Add it to `messages/en.json` **and** `messages/pt-BR.json`. pt-BR words come from `CONTEXT.md`.
2. Name it snake_case with an area prefix: `common_*` for shared words, `error_<code>` for server error codes, `error_validation_<reason>`, `auth_error_<code>`, and `<area>_<thing>` for a screen.
3. Params are `{name}` in the text. Only their names are type-checked (values are untyped), so pass strings or numbers deliberately.

## Plurals: a `_one`/`_other` pair

Messages are plain strings; the catalog has no plural selectors (`declarations`, `match`), and
`validate:i18n-parity` rejects a message that is not a string. A countable message is two keys,
`<key>_one` and `<key>_other`, in both catalogs:

```json
"prepare_publish_gaps_one": "{count} vaga ainda precisa de pessoas. Publicar mesmo assim?",
"prepare_publish_gaps_other": "{count} vagas ainda precisam de pessoas. Publicar mesmo assim?"
```

The web picks one with `pluralMessage` (`apps/web/src/shared/utils/plural.ts`): `_one` when
`count` is 1, `_other` for every other count, 0 included. The server picks the same way with
`count === 1` (`apps/server/src/infrastructure/services/email-templates.ts`). When 0 needs its own
wording ("Nenhuma pessoa"), add a separate key and choose it before calling `pluralMessage`.

## Locale and the `?lang=` override

Locale resolves as: the locale cookie → `appConfig.defaultLocale` (`pt-BR`) → `en`. Opening any page with `?lang=en` (or `?lang=pt-BR`) writes the cookie; the web strips the parameter before routing. Cookie and parameter names live in `@church/app-config`.

## Parity check

`bun run validate:i18n-parity` fails when a key or a message's param names differ between `en.json` and `pt-BR.json`. It runs from `bun run lint` and `bun run validate:affected`.
