# @church/i18n

The UI and server message catalog (Paraglide JS). Locales `en` (base) and `pt-BR`. Import `m` from `@church/i18n/messages` and `getLocale`, `setLocale`, `locales`, `isLocale`, `overwriteGetLocale` from `@church/i18n/runtime`. Never import it in `packages/core` or `apps/server/src/domain`: localize in the HTTP layer only.

`messages/*.json` compile into the git-ignored `src/paraglide/` on `bun install` (`postinstall`) and before `typecheck`, `test:unit` and `build`. Run `bun run compile` here after editing a catalog. A wrong key or param name fails `tsc`.

## Add a key

1. Add it to `messages/en.json` **and** `messages/pt-BR.json`. pt-BR words come from `CONTEXT.md`.
2. Name it snake_case with an area prefix: `common_*` for shared words, `error_<code>` for server error codes, `error_validation_<reason>`, `auth_error_<code>`, and `<area>_<thing>` for a screen.
3. Params are `{name}` in the text. Only their names are type-checked (values are untyped), so pass strings or numbers deliberately.

## Plurals: always give `=0`

pt-BR treats 0 as `one` ("0 pessoa necessária"). Every plural that can be 0 gets an exact `=0` case in both catalogs:

```json
"people_needed": [
  {
    "declarations": ["input count", "local countPlural = count: plural"],
    "selectors": ["countPlural"],
    "match": {
      "countPlural=0": "Nenhuma pessoa necessária",
      "countPlural=one": "{count} pessoa necessária",
      "countPlural=*": "{count} pessoas necessárias"
    }
  }
]
```

## Locale and the `?lang=` override

Locale resolves as: the locale cookie → `appConfig.defaultLocale` (`pt-BR`) → `en`. Opening any page with `?lang=en` (or `?lang=pt-BR`) writes the cookie; the web strips the parameter before routing. Cookie and parameter names live in `@church/app-config`.

## Parity check

`bun run validate:i18n-parity` fails when a key or a message's param names differ between `en.json` and `pt-BR.json`. It runs from `bun run lint` and `bun run validate:affected`.
