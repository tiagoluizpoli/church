# Journeys: volunteers and leaders on a service day

Issue: #1091 (map #1072). Settled 2026-11-25 by grilling. Terms as in `CONTEXT.md` (**Kids**, **Wrap-up time**). Screen text in quotes is example copy: plain pt-BR, never glossary phrasing.
Hand-offs to the Guardian side are marked **← G §n**, pointing at sections of [`guardian-journeys.md`](guardian-journeys.md) (#1090). Printing is a module: "a tag is produced at point X" never names a printer.

## 0. Decisions made in this ticket

| # | Decision |
|---|---|
| V1 | **Kids leader** = a `leader` of a Ministry with check-in turned on, or any ChurchAdmin. TeamLeaders get nothing extra. |
| V2 | **Kids team on duty** = everyone with an Assignment in the running Shift of that Ministry, at any Sector, plus the Kids leaders. All of them do desk work. Those assigned to a Room are its room's people. A desk is just a duty Sector such as "Recepção Kids"; no desk flag. |
| V3 | **Leaders on duty** (who Kids alerts reach): Kids leaders with an Assignment in the running Shift; none assigned → every Kids leader. |
| V4 | **Access window.** A volunteer sees Kids data from the Room's lead time until the Ministry's Wrap-up time ends, never outside it. Kids leaders always see their Church's current and past Check-ins. Per Child the room's people see: name, age, photo, consented Care notes and stamps, Tag note, Guardians with photos, Call status. Guardian phone numbers only for a Guardian contact (tap to ring) or once a Call is Unanswered. |
| V5 | **Wrap-up time** (Ministry setting, generic, not Kids-only): how long its people keep working after the last Shift of the EventTimeBlock ends. For Kids: at the last Shift's end the Room stops taking check-ins but pickup goes on; the last Shift's team keeps access; when Wrap-up time ends, still-open Check-ins become unclosed (Kids alert, and D11 on the Guardian side). Scheduling: a Wrap-up time running into another Assignment of the same person only **warns** whichever leader assigns second, in either direction; never blocks. |
| V6 | Entry points: Home card for the team on duty during their window ("Você está no Berçário · 12 crianças" → **Lista da sala**, **Retirada**; a non-Room Sector gets "Check-in no balcão" + Retirada). Kids leader: Home card "Kids agora" → live view (§4). |
| V7 | **No receipt step at drop-off.** The Check-in already means the Child is there; it shows on the Room list at once. |
| V8 | **Desk check-in**: search Families linked to this Church by Guardian or Child name, pick Children, pick the Guardian present (the maker, D18), Guardian tag always produced. The device remembers its Check-in point per service. Not linked / no account → visitor path (Guardian contact). The desk never makes a Family Link. |
| V9 | **Tags:** a Child tag may be produced again any time by the team on duty, same content. A Guardian tag is **never** reissued (same code = a found paper still works; new code = the other Guardian's offline copy breaks). Lost Guardian tag = lost code: app, or a leader's Release override. |
| V10 | **Point down.** Tag not produced → Check-in goes on, Child marked "sem etiqueta" on the Room list, handwritten tag (name + Call number), "produzir etiqueta" stays available. App unreachable → paper, nothing back-entered; Guardians' offline Pickup codes still show. **No offline desk mode in v1.** |
| V11 | **Retirada belongs to the point**: the people of every Room a point serves share its door and may release any of those Rooms' Children. Children in a Room of another point show "na sala Y · ponto Kids 5-13", no button. Release is per Child; the Check-in closes at the last release; a Child still Awaiting drop-off then leaves the Check-in (never dropped off). |
| V12 | **Restriction / mismatch at the door.** The door lists Guardians + Authorised adults with photos; a restricted Guardian shows red "não pode retirar a Ana · chame a liderança" (no reason), and their own app hides that Child's Pickup code. No match or restricted → refuse, tap "Chamar liderança" (Kids alert). |
| V13 | **Kids alert**: one stream for leaders on duty: Child with no Room, unclosed Check-in, "Chamar liderança". Push + top of the live view, listed until a leader resolves it with a note. Unanswered Calls stay with the Room (call again / big screen) and only show on the live view. |
| V14 | **No Room fits**: the Child stays at the point; the team there Moves it into any open Room, which resolves the alert; a leader may also open a Room by hand or set a Room placement. Until then it heads that point's Retirada screen as "sem sala". |
| V15 | **Unclosed Check-in**: never auto-closed. A leader closes it with a reason ("retirado sem registro", "confirmado com o responsável por telefone", "outro" + note), recorded. No "encerrar culto" action: Rooms close by themselves. |
| V16 | **Staffing a running Shift**: a Kids leader adds/removes any Volunteer of the Ministry to a Room, Role not checked; recorded as the running-Shift exception; access at once. A non-Volunteer needs a Ministry Invitation first. |
| V17 | **Big screen (for now):** a ChurchAdmin picks the **big-screen Sector** (e.g. Mídia › Projeção). "Mostrar na tela" sends a silent push to whoever is assigned there in a running Shift: "Mostrar na tela: 247 · Ana", then "Pode tirar: 247" when the Call is resolved or a Guardian answers "Estou indo". They also get a "Tela" page in their own app (open numbers, "há 2 min", optional "já está na tela"). The volunteer sees "enviado para Carlos (Projeção)"; nobody assigned → "avise a projeção por outro meio". A shared login is ruled out; an anonymous board dropped; **Stations** (#1098) may later add another place the same person acts, changing nothing here. |
| V18 | Names: **Room list** / "Lista da sala" (who is in this Room now, plus "a caminho"); **Retirada** (the point's pickup screen, a screen name only). "Roster" is not used. |

## 1. Before the doors open

1. Room opens at its lead time before the first Shift (or a leader opens it by hand). The team on duty sees its Home card (V6).
2. Leader checks the live view: Rooms open, volunteers per Room vs Children per volunteer. Short-staffed → staffs the running Shift (V16).
3. Desk device: picks its Check-in point once (V8).

## 2. Desk (Kids team on duty)

**2a. Family that cannot scan** (no phone, no signal, no battery) ← G §1b, §3. V8 steps; tags produced at this point; Children of Rooms this point doesn't serve: the desk may check any Child into any Room at any point.
**2b. Visitor Family** ← G §6. Guardian contact (name + phone) + Children (name + birth date); no consent, Care notes, photo; Guardian tag with Pickup code, Call number, claim code QR.
**2c. Reprint** (V9). **2d. Point down** (V10).
- Wrong: Family restricted for a Child here → that Child disabled, "fale com a liderança do Kids". Family linked but Guardian not present → no desk check-in for a Guardian who isn't there.

## 3. Room and door (room's people)

**3a. Drop-off** ← G §3.7. No tap (V7); put on the Child tag; "sem etiqueta" → handwrite (V10). Awaiting drop-off Child arriving from another point: checked in when the Guardian scans here ← G §3.6.
**3b. Lista da sala** (V18): Children (name, age, Call number, stamps, "sem etiqueta", Call status), "a caminho" lines; tap a Child for V4 details.
**3c. Move**: pick another open Room; walk the Child there; Notice to Guardians ← G §4.
**3d. Call** ← G §4: pick a reason, send; follow its status on the Child ("Estou indo" / "Não posso ir" / no answer). Unanswered (Church setting, default 2 min) or every Guardian can't come → **call again** or **mostrar na tela** (V17); Guardian contact → tap-to-ring number. Resolve with an optional note.
**3e. Retirada** ← G §5 (V11, V12): scan or type the Pickup code (or the Guardian tag) → Children of this Check-in, Guardians + Authorised adults ("conferir documento") with photos → check face/name/ID → "Entregar Ana" per Child.
- Wrong: no code at all → "Chamar liderança" → Release override (§4). A Guardian who left the Family isn't on the list → refuse. Restricted / no match → V12.

## 4. Kids leader

- **Live view** (V6): Kids alerts first; per open Room "Berçário · 28/25 crianças · 3 voluntários" (over capacity highlighted, never blocking); open and Unanswered Calls; "a caminho" count; tap a Room → its Lista da sala.
- **No Room fits** (V14). **Over capacity**: measure only; Move Children or add people (V16).
- **Release override** ← G §5: check the adult against the Family's Guardians (photo, name, ID; Guardian contact: name + phone), record to whom and why.
- **Pickup restriction / Room placement**: set from the Child at this Church.
- **After the service** (V5, V15): at the last Shift's end Rooms stop taking check-ins; pickup continues through Wrap-up time; then each still-open Check-in becomes a Kids alert, closed by a leader with a reason. ← G D11.

## 5. Big screen (whoever is assigned at the big-screen Sector)

V17: silent phone push "Mostrar na tela: 247 · Ana" → type into ProPresenter (by hand; automation stays in the map's fog) → "Pode tirar: 247" → remove. "Tela" page to catch up.

## 6. What this hands to later tickets

- **Prototype: volunteer and leader service-day screens** (#1094): Home cards, Lista da sala, Child detail, Move, Call + follow-up, Retirada (scan, list, per-Child release, restriction banner, "Chamar liderança"), desk check-in + visitor form + point picker, Release override, live view, Kids alerts + resolve, unclosed close-with-reason, running-Shift staffing, Tela page.
- **Journeys: setting up and running Kids check-in** (#1092): Kids leader / ChurchAdmin settings this ticket assumes: Wrap-up time (Ministry), big-screen Sector (Church), Room lead time/age/capacity, Check-in points and the Rooms they serve, Call unanswered-after, drop-off window.
- **Scheduling** (spec decomposition): the Wrap-up time overlap warning in the assign flow, both directions.
- **On-site** (#1085): check a silent push reaches the projection operator's phone in the booth.
- **Out of scope**: Stations (#1098); car announcements / parking (the owner's own future effort).
