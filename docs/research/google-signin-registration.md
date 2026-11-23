# Research: Google sign-in and low-friction registration with our auth stack

Status: research only, no code changed, no decision taken. Issue: [#1077](https://github.com/tiagoluizpoli/church/issues/1077) (under map #1072, Kids check-in and parent paging).

Better Auth version in this repo: catalog pin `1.7.7` (`package.json:14`; installed under `node_modules/.bun/better-auth@1.7.7+...`). The older survey `.plan/research/better-auth-1.5.5-invitation-and-signup-gating.md` was written against 1.5.5; its invitation and gating findings are not repeated here. Doc claims below come from the official docs (main branch, not version-pinned) and, where marked "installed", were checked in the 1.7.7 `dist/`.

## 1. How registration works today

- **Public sign-up is closed.** `packages/auth/src/index.ts` sets `emailAndPassword.enabled: true` and `disabledPaths: ['/sign-up/email', '/organization/update-member-role', '/organization/update', '/organization/check-slug']`. The `organization` plugin has `allowUserToCreateOrganization: false`; Churches come only from the Platform Operator (`CONTEXT.md`, Church Provisioning).
- **The only door to a new User is invitation redemption.** `DbRedemptionManager.redeemNewUser` (`apps/server/src/application/db-redemption-manager.ts:286`) verifies an emailed one-time code (`invitation-verification-code.ts`), then in one transaction `admitNewPerson` creates the User through the server-side `auth.api.signUpEmail` (`apps/server/src/infrastructure/services/better-auth-redemption-identity-gateway.ts`, `createAccount`), accepts the Church Invitation (`acceptInvitation`), applies any paired Ministry Invitation and sets the active Church. Mailbox ownership is proven by the code, not by Better Auth's verified-email gate (`requireEmailVerificationOnInvitation: false`, with the reason in `packages/auth/src/index.ts`). A User created through this path is therefore a password User only.
- **Existing Users** accept while signed in (`acceptExistingMember`, `acceptChurchInvitation`); an email already registered yields `EMAIL_ALREADY_REGISTERED` (`classifyIdentityFailure`, `isEmailRegistered`). `isInvitationAddressedToUser` enforces that the signed-in identity is the addressed one and logs an identity mismatch otherwise.
- **Domain.** `CONTEXT.md`: "Every Person has exactly one User"; a User is the login identity, never shown on screen; a Church Invitation is "an email-addressed invitation ... creating or connecting their User identity as needed" and its _Avoid_ list names "Sign-up link, magic link". There is no Person table: Person is the concept, `user` is the row (`packages/db/src/schema/auth.ts`, `email` is `NOT NULL UNIQUE`). `volunteer.userId` has a unique index on active profiles (`packages/db/src/schema/core.ts:88`). Church access is Better Auth `member.role` (ADR 0009, `docs/adr/0009-authorization-rules-only-gatekeeper-over-module-facts.md`); an invitation's email is the addressing key (ADR 0008 treats an invitation as a transactional email to an address, not a Notification).
- **Web.** Routes: `apps/web/src/routes/login.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `invitations/church/$invitationId.tsx` (new-user redemption), `app/invitations/church/$invitationId.review.tsx` (signed-in review).

## 2. What Better Auth offers (official docs)

### 2.1 Google as a social provider
Source: https://www.better-auth.com/docs/authentication/google
- Config is `socialProviders.google: { clientId, clientSecret }`; `clientId` may be an array (web/iOS/Android; only widens ID-token audience checks). Options: `prompt: "select_account"`, `accessType: "offline"`, `hd` (Workspace domain restriction), `includeGrantedScopes`.
- Callback route `/api/auth/callback/google` must be registered in Google Cloud Console; `baseURL` must be set or `redirect_uri_mismatch` follows. This repo already sets `baseURL: env.BETTER_AUTH_URL`.
- Direct ID-token sign-in (`signIn.social({ provider, idToken })`) and One Tap exist (One Tap plugin; installed under `better-auth/dist/plugins/one-tap`).
- The Google page does not discuss `email_verified`; that logic lives in the linking code (2.2).

### 2.2 Account linking and same-email behaviour
Source: https://www.better-auth.com/docs/concepts/users-accounts (Account Linking)
- Linking is enabled by default. A social sign-in whose email matches an existing User links automatically only if the provider reports the email verified or the provider is in `account.accountLinking.trustedProviders` (which the docs flag as takeover risk).
- `disableImplicitLinking: true` rejects same-email social sign-ins with `account_not_linked`; new users can still sign up and a signed-in user can still link explicitly (`linkSocial`).
- `allowDifferentEmails` lets a user link a provider account with another email; `updateUserInfoOnLink` copies name/image only, never email or `emailVerified`.
- Credentials can be added to a social-only User via `auth.api.setPassword` (server only) or the reset-password flow; `unlinkAccount` refuses to remove the last account unless `allowUnlinkingAll`.
- Installed 1.7.7 confirms the gate: `node_modules/.bun/better-auth@1.7.7+.../dist/oauth2/link-account.mjs:139` refuses to link when the provider is untrusted and the email is unverified, or when linking is disabled, or when `disableImplicitLinking` is set; lines 188 and 236 flip a local `emailVerified` to true when the provider verified the same email.

### 2.3 Controlling who may sign up via social
Source: https://www.better-auth.com/docs/concepts/oauth
- Provider options `disableSignUp` (no new users) and `disableImplicitSignUp` (a new user only when sign-in passes `requestSignUp: true`). `user.validateUserInfo` can reject an OAuth identity before a User is created, an account linked or a returning user signed in. `mapProfileToUser` and `overrideUserInfoOnSignIn` shape profile fields; `additionalData` on `signIn.social` reaches hooks but is client-supplied and must be validated.
- Consequence for us: `disabledPaths` currently blocks only `/sign-up/email`. The social routes (`/sign-in/social`, `/callback/google`) are separate paths, so enabling the provider opens a second public door unless it is gated with `disableSignUp`/`validateUserInfo`/a hook. (The earlier survey section 2 covers the hook options in 1.5.5; recheck on 1.7.7 if used.)

### 2.4 Magic link
Source: https://www.better-auth.com/docs/plugins/magic-link
- Plugin `magicLink({ sendMagicLink({ email, token, url, metadata }, ctx), expiresIn (default 300 s), disableSignUp, storeToken })`; `allowedAttempts` is deprecated (single use). Clicking the link authenticates and creates a User if the email is unknown, unless `disableSignUp`. `newUserCallbackURL` and `errorCallbackURL` route the outcomes.
- For a pre-existing account whose email was never confirmed, the docs say the link removes any existing password and revokes its sessions.
- Installed: `dist/plugins/magic-link/index.mjs:185` creates the new User with `emailVerified: true`; line 196 handles an existing unverified User.
- Fit: this is the same proof (mailbox control) that our emailed redemption code already gives, as a link instead of a typed code. Our glossary currently forbids calling a Church Invitation a magic link, so this would be a vocabulary decision, not only a code one.

### 2.5 Passkeys
Source: https://www.better-auth.com/docs/plugins/passkey
- Separate package `@better-auth/passkey` (server `passkey` from `@better-auth/passkey`, client from `@better-auth/passkey/client`); it is not in 1.7.7's `dist/plugins` and is not a dependency today.
- Default registration requires an authenticated session; `registration.requireSession: false` plus `registration.resolveUser` enables passkey-first onboarding, optionally `createSession`. Options: `rpID` (registrable parent domain of the auth server origin), `rpName`, `origin`, `authenticatorSelection` (`residentKey`, `userVerification`, attachment). Conditional UI/autofill needs `autocomplete="username webauthn"` and `authClient.signIn.passkey({ autoFill: true })`; it depends on browser support (docs list no versions).
- The docs describe passkeys as a credential on an existing User, not an identity source; there is no email ownership proof in a passkey itself.

## 3. Mapping onto our model (what changes, no recommendation)

| Option | Creates a User? | Proves email? | Touches "one User per Person" | Touches invitation-first |
| --- | --- | --- | --- | --- |
| Google, new person via invitation | Would be a second creation path beside `signUpEmail` in `admitNewPerson` | Google asserts `email_verified`; our code step would be redundant for that address | Holds if the Google account is created for the invited, addressed email | Holds only if the callback is bound to the invitation (the Google email must equal the addressed email) |
| Google, existing User, same email | No, links an `account` row | Implicit link needs provider-verified or trusted provider | Holds: one User, extra `account` row | Unchanged |
| Google, existing User, different email | Link only via `allowDifferentEmails` | n/a | Holds (still one User) but the Google email and invitation email diverge | Redemption identity check (`isInvitationAddressedToUser`) matches on the User's email, so it stays strict |
| Google, no invitation at all | Yes unless gated | Yes | Creates a User with no Church Membership | Breaks invitation-first unless gated |
| Magic link | Yes unless `disableSignUp` | Yes (link) | Holds if only ever used for invited/existing emails | Same gating need |
| Passkey | No (needs a User, or custom `resolveUser`) | No | Holds, it is a credential | Unchanged, additive after first sign-in |

Points the model must settle (not answered by the docs):
1. **Where the Google identity attaches.** Better Auth stores it in `account` (provider id plus provider account id) under the same `user`; the invariant stays true structurally. The question is whether a Google email may differ from the Person's invited email, and which email the Church sees (User email is the unique key and the invitation addressing key).
2. **Gating of new Users.** With only `emailAndPassword`, `/sign-up/email` is the one public path, and it is closed. Adding Google or magic link opens `/sign-in/social`, `/callback/:id`, `/sign-in/magic-link` unless each has `disableSignUp` or a `validateUserInfo`/hook that requires a pending Church Invitation for that email. The redemption transaction (`admitNewPerson`) would need an alternative identity step that takes a provider-verified identity instead of a password; today it takes `password` and `code`.
3. **Account takeover surface.** `trustedProviders` is the knob; leaving it default means Google links only when `email_verified` is true. An existing password User whose email never went through verification is linkable by a verified Google claim (installed `link-account.mjs:188`), and a magic link on an unverified existing account removes its password (docs).
4. **Existing password Users.** Adding Google leaves password login in place; `setPassword` lets a Google-only User add one later. A Google-only User has no password to use with `verifyPassword` (`better-auth-redemption-identity-gateway.ts`, "layer 3" proof), so any server action that re-checks a password needs another proof for them.
5. **Glossary and ADR.** `CONTEXT.md` Church Invitation _Avoid_ "Sign-up link, magic link" and the Person/User entries would need a decision if a Google or link sign-in becomes a redemption path; ADR 0009 is unaffected (roles stay on `member.role`).

## 4. Friction notes (pt-BR, mobile)

Not primary-source facts beyond the docs cited; flagged as consideration, not measured here.
- **Google:** one tap on Android where a Google account is signed in; redirect flow leaves our origin, so the redirect URI per worktree/dev domain (`http://` on mobile in dev, see dev domain notes) must be registered in Google Cloud Console. Our cookies use `SameSite=Lax` over HTTP and `None; Secure` over HTTPS (`packages/auth/src/index.ts`); a redirect return is a top-level navigation, which Lax allows.
- **Magic link:** needs a mail app switch on the phone; default life is 5 minutes (`expiresIn` 300 s) versus our verification code policy (`appConfig`, see `invitation-verification-code-manager.ts`). Link prefetch by mail scanners can consume a single-use token (single attempt, per docs); the docs do not address scanners.
- **Passkey:** best repeat-login friction once registered, but registration needs an existing session (or the custom `resolveUser` path) and `rpID` tied to the domain, so each environment's host (and the dev domain `tiago-pc.dev.home.arpa`) has its own credential set.
- **Language:** Better Auth's own pages are not used here; our screens (`apps/web/src/routes/login.tsx`) are ours, so pt-BR copy is ours. Google's consent and account-picker language follow the Google account, not our i18n.

## 5. Not verified

- No live test of Google, magic link or passkey against 1.7.7; claims are docs plus reading the installed `dist/`.
- Passkey 1.7.7 compatibility of `@better-auth/passkey` (package not installed; its own version pairing was not checked).
- Whether `validateUserInfo`/`databaseHooks.user.create.before` can read the pending Church Invitation for the email in 1.7.7 (documented option exists; the exact hook context was not verified).
- How the Kids check-in parent-paging use case (#1072) treats parents: whether they are Church Members, Persons without Membership, or something new. The glossary has no such concept yet, which bounds the answer to "who may self-register".
