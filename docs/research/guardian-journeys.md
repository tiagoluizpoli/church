# Journeys: Guardian, from first contact to going home

Issue: #1090 (map #1072). Settled 2026-11-24 by grilling. Terms as in `CONTEXT.md` (**Kids**). Screen text in quotes is example copy: plain pt-BR, never glossary phrasing.
Hand-offs to the volunteer/leader side are marked **→ V** (detailed in #1091). Printing is a module: "the Child tag is produced" never names a printer.

## 0. Decisions made in this ticket

| # | Decision |
|---|---|
| D1 | **Kids is personal, not Church-scoped.** The Family area works under any active Church, or none (a Person who left every Church but still has a Family). Calls and Notices go to the Person and show in the bell under any active Church. Fixes the "Family-Linked non-member" gap (inventory §4.1, §5.1). |
| D2 | A Check-in point QR is a URL: the phone's own camera opens the app on that point. Also an in-app "Escanear" button (browser camera) and a typed point code as a last resort. |
| D3 | First contact at a point: only Child name + birth date + Family consent are required. Care notes, stamps, Tag note, Child photo are optional, offered again later. After the Family step the parent returns to that point's check-in with the new Children preselected. |
| D4 | A signed-in Guardian at a Church the Family isn't linked to gets one screen: "Vincular sua família à Igreja B?" (says what B will see) with an unticked "também quero fazer parte da Igreja B"; then check-in continues. |
| D5 | Child picker: Children with an open Check-in shown disabled; one eligible Child is preselected, several are not. Children grouped by Family; picking from two Families makes two Check-ins (two Pickup codes, two Call numbers). |
| D6 | **No Room at drop-off.** A Child checked in here gets no direction (the parent is at the point). An Awaiting drop-off Child: "Leve o João até o ponto Kids 5-13" (the point's Church-given name). The Room appears only afterwards. |
| D7 | Push coaching comes after the confirmation, never blocks it; iOS without Home Screen install shows install steps first. Until push is on, the open Check-in shows a banner: the room can only reach you while the app is open, or on the big screen. |
| D8 | Authorised adult: Guardian adds full name, for this Check-in or until a date; "Enviar código de retirada" shares (WhatsApp) a link showing the open Check-in's Pickup code QR. Standing ones get the button again on each new Check-in; nothing is sent automatically. The door scan lists Guardians and Authorised adults, the latter flagged "conferir documento". |
| D9 | Family invitation to someone with no account: signs up through the inviter's Church (inviter picks if linked to several), with "não é sua igreja? procure a sua" falling back to the Church search. |
| D10 | Name + birth date match ignores desk-registered Children (Guardian contacts can't be asked; claim code handles them). |
| D11 | Forgotten Check-in: stays open in the app; after the service's last Shift in its Room it reads "Check-in não encerrado: a liderança do Kids vai entrar em contato". Guardians cannot close it. **→ V** (leader anomaly). |
| D12 | Guardians see the Family's own history per Child (date, Church, Room, who checked in, who released, Calls). Church reports stay in the map's fog. |
| D13 | Guardian photo optional but **always pushed**, with the reason ("mais rápido e mais seguro na retirada, ajuda a equipe do Kids"): after the first Check-in, on Family page and profile, on the Pickup code screen until added. Never blocks. |
| D14 | Nav item "Família" for every signed-in Person. Home, while any Family Check-in is open: a top card per open Check-in (Call number, Children, Room) with a big "Código de retirada" button. No Family: "Cadastre seus filhos" card. |
| D15 | The open Check-in (Pickup code QR, Call number, Children, meeting spot) is saved on the phone when made, and opens offline with "atualizado às 10:42". Parents run on mobile data; the Church usually offers no wifi to members. |
| D16 | Receiving a Call: push "A Ana precisa de você no Kids" → Call screen; app open on any page → full-screen alert, vibrating where the phone allows (not iOS web). Call screen: Child, meeting spot, reason, "Estou indo" / "Não posso ir"; after "Estou indo": the meeting spot and "a equipe foi avisada". Calls the Guardian muted still land in the bell without interrupting. |
| D17 | **Meeting spot** everywhere a Guardian is told to come: "Venha até o ponto Kids 0-4 · sala Berçário". The point is where the Child was dropped off; after a Move to a Room that point doesn't serve, the point serving the new Room (first in the leader's order). |
| D18 | Desk Check-in for a Guardian with an account (no phone): the Guardian the volunteer picks is the maker; the Check-in shows in every Guardian's app; a Guardian tag is produced whatever the Church setting. **→ V** |
| D19 | **Maker is bound.** The Guardian who made an open Check-in cannot leave the Family until its Children are checked out ("Você fez o check-in da Ana; poderá sair da família depois da retirada"). Any other Guardian may leave any time: off the door's pickup list at once, saved Pickup code wiped, no more Calls/Notices. Unlinking the Family from a Church is blocked while a Check-in there is open. Leaving or being Removed from a Church as a member is always allowed. |
| D20 | Preferences: defaults on the Family page ("Receber chamadas" on; Notices all / only mine / none); a per-Check-in switch on the open Check-in to mute one; locked on for the maker. |
| D21 | Family page (personal): Children (Care notes, stamps, Tag note, photo), Guardians + invitations, Authorised adults, linked Churches (link/unlink), per-Child history, notification defaults; several Families = sections on one page. Profile "Minha conta" (new): name, phone, photo, marketing opt-in, Church Memberships with "sair da igreja". First version; the user may revisit after prototypes. |

## 1. First contact

**1a. Church sign-up link / poster QR / "Cadastre-se" on the Public Church Profile.**
1. Sign-up page of Church X: "Cadastrar com Google" or email + password.
2. Email path: 6-digit code by email. Google path: skips the code.
3. Name (prefilled from Google), mobile phone (mandatory, not verified), unticked WhatsApp/SMS opt-in.
4. Closing: "Ao se cadastrar você passa a fazer parte da Igreja X" + platform terms and privacy notice. Creates the Person and the Church Membership (`member`).
5. Lands on Home; Church X has a check-in Ministry, so the "Cadastre seus filhos" card shows (D14). Family step is offered, not forced.
- Wrong: Google email already has an account → signed in and linked, never duplicated. Code not received → resend. Abandons mid-way → nothing created until the code.

**1b. Check-in point QR while signed out (in the drop-off queue).**
1. Camera opens the point URL → "Entre ou cadastre-se para fazer o check-in" (sign in, or sign up through the point's Church).
2. Sign-up as 1a steps 1-4.
3. Family step (D3): add each Child (name, birth date), the Family consent, highlighted; optional extras skipped with "depois".
4. Name + birth date match against an existing Child (not a desk one, D10) → "Parece que a Ana já está cadastrada por Maria S. Pedir para ela confirmar?" → join request to the existing Guardians; or continue and register separately (never locked out).
5. Back to the point's Child picker with the new Children preselected → §3.
- Wrong: no signal → can't sign up; desk volunteer path (§6) **→ V**.

**1c. Login page "Criar conta"** → Church search (name, city) → 1a for that Church. "Entrar com Google" with an unknown email → "você ainda não tem conta" + Church search.

## 2. Building the Family

**2a. Add a Child** (Family page or the Home card): name, birth date, Family consent. Optional, each under its own consent: Care notes (free text + standard flags), Care stamps and Tag note to print, Child photo.
**2b. Second Guardian.** "Convidar responsável" → share sheet (WhatsApp) or email → single-use link, 7 days, revocable by any Guardian.
- Invitee with an account: opens link → "Entrar na família de Ana e João?" → joins the Family (no Church Membership).
- Invitee without one: signs up through the inviter's Church (D9), or picks their own; then joins the Family.
- Wrong: link expired/revoked/used → "peça um novo convite".
**2c. Join request received** (match from 1b.4): every existing Guardian gets it in the bell; any one approves → the requester joins the Family; declined or ignored → the requester keeps their separately registered Child.
**2d. Link to another Church** from the Family page, or at that Church's point (D4).
**2e. Leave the Family** (D19): blocked only for the maker of an open Check-in.
**2f. Photo push** (D13).

## 3. Service day: check-in

1. Arrive, scan the point (D2). Signed out → §1b. Family not linked here → D4. Restricted at this Church for a Child → that Child disabled with "fale com a liderança do Kids", no reason shown.
2. Child picker (D5). Each Child shows nothing (served here) or "a caminho" (Awaiting drop-off). Room closed for the Child's age → still checked in (anomaly **→ V**), shown to the parent as normal.
3. Confirm. One Check-in per Family: Call number, Pickup code; Child tags produced here for Children served here; Guardian tag produced per Church setting.
4. Confirmation: "Check-in feito · nº 23", Children, "Código de retirada" button, and for each Awaiting drop-off Child "Leve o João até o ponto Kids 5-13" (D6). Offline copy saved (D15).
5. Push coaching card (D7), then the photo push (D13) on first Check-in.
6. Awaiting drop-off: the parent scans the second point → that Child is checked in there, tag produced, same Check-in and Pickup code. Not within the drop-off window → Notice "João saiu do check-in: não foi entregue a tempo".
7. Hand the Child to the room's people at the point **→ V**.
- Re-check-in after checkout: same flow, new Check-in, new Pickup code.
- Child already checked in (other Guardian did it): shown disabled, "já está no Kids, nº 23".

## 4. During the service

- **Open Check-in screen** (Home card / Família): Children, Call number, meeting spot per Child (D17), Pickup code, push banner if off (D7), "Receber chamadas" switch (D20), "Autorizar retirada" (D8).
- **Call** (D16): lock-screen push or full-screen alert → Call screen → "Estou indo" (meeting spot, team told) or "Não posso ir" (team told) **→ V**. Nobody answers within the Church's time → room may call again or the Call number + first name go on the big screen **→ V**. Resolved by a volunteer → Call shows "resolvida" with the note, kept in history.
- **Notice**: a Move ("Ana foi para a sala Sensorial · venha ao ponto Kids 0-4") or Awaiting drop-off expiry, per Notice preference.
- **Guardian with push off and app closed**: no Call reaches them; the big screen is the fallback **→ V**.

## 5. Pickup

1. Walk to the meeting spot. Open "Código de retirada" (works offline, D15); or show the Guardian tag.
2. Volunteer scans: sees Children, the Family's current Guardians (photos where given) and Authorised adults; checks face/name and releases **→ V**.
- **Other Guardian picks up**: same code in their app.
- **Authorised adult**: Guardian sent the link (D8); adult shows the QR + an ID document.
- **Pickup restriction** on this adult at this Church: volunteer refuses; the adult is told only to speak to the Kids leadership **→ V**.
- **Lost code / dead phone / no tag**: a Kids leader's Release override after checking the adult against the Family's Guardians **→ V**. A plain volunteer cannot.
- **Forgotten Check-in** (left without release): D11.
- **Guardian who left the Family** holds an old code: not on the door's list, refused.
3. Released → Check-in closes in every Guardian's app; offline copy removed.

## 6. Visitor family registered at the desk

1. No account (or no phone/signal). Desk volunteer registers a Guardian contact (name + phone) and each Child (name + birth date); no consent, Care notes or photo **→ V**.
2. Check-in as usual; the Guardian tag (always, for a Guardian contact) carries the Pickup code, Call number and a **claim code** QR.
3. During the service: no in-app Call; the room phones them by hand, or shows the Call number on the big screen **→ V**.
4. Pickup with the Guardian tag (§5).
5. Later: claim QR → that Church's sign-up (§1a) → consent given → the new Person replaces the Guardian contact in the Family, Children and Family Link kept. Each visit prints a fresh claim code (30 days).
6. Never claimed: deleted 30 days after the last desk Check-in, attendance anonymised. Returning visitor: registered again or signs up; no search for past visitors.
- Desk Check-in for a Guardian **with** an account: D18.

## 7. Between services

- Family page (D21): edit Children, consents, Care notes; invite/revoke Guardians; Authorised adults (revoke any time; dated ones lapse); link/unlink Churches (D19); per-Child history (D12); notification defaults (D20).
- Profile "Minha conta" (D21): name, phone, photo, opt-in, memberships, "sair da igreja". Leaving or being Removed from a Church leaves the Family and its Links untouched; the Family area keeps working (D1).
- Child ages out of every Room: fog (ageing out) on the map.

## 8. What this hands to later tickets

- **Prototype: Guardian phone screens** (#1093): screens named in D2-D21 and §1-§7: sign-up (Church, point), Family step, Child form with consents, Child picker, confirmation, open Check-in, Pickup code (offline), Call screen + full-screen alert, push/install coaching, Family page, Minha conta, join request, invitation landing, Authorised adult share, claim landing.
- **Journeys: volunteers and leaders on a service day** (#1091): every **→ V** step above.
- **Platform plumbing** (map fog): personal (non-Church) inbox and Kids area (D1), offline Check-in copy in the service worker (D15), full-screen in-app Call alert needs a fast path (push wake or short poll).
