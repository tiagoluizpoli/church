# Journeys: setting up and running Kids check-in

Issue: #1092 (map #1072). Settled 2026-11-25 by grilling. Terms as in `CONTEXT.md` (**Kids**, **Tag output**, **Virtual printer**). Screen text in quotes is example copy: plain pt-BR, never glossary phrasing.
Service-day roles and screens are in [`volunteer-journeys.md`](volunteer-journeys.md) (#1091, **V**n); Guardian side in [`guardian-journeys.md`](guardian-journeys.md) (#1090, **D**n). Printing references: [`printer-emulators.md`](printer-emulators.md) (#1099).

## 0. Decisions made in this ticket

| # | Decision |
|---|---|
| S1 | A Church may turn check-in on for **several Ministries**. Their Rooms form one pool (placement by age, points serve any of them), and a Kids leader of any of them acts across all of the Church's check-in. |
| S2 | Only a **ChurchAdmin** turns check-in on or off, in that Ministry's Settings tab. |
| S3 | **Turning off** is blocked while a Check-in in that Ministry's Rooms is open ("há 3 crianças com check-in aberto"). After: its Rooms are plain Sectors again but keep their Room settings (turning on restores them); points serving only those Rooms stop working; history stays. |
| S4 | **"Configurar Kids" checklist**, never a block: check-in on, at least one Room, a point serving each Room, a published Shift at each Room; each gap links to its fix ("Nenhum ponto atende o Berçário"). The same for every Church; it is the onboarding. |
| S5 | **Check-in point QR** is a stable URL for the point's life, no rotation in v1 (the code alone lets nobody in). "Imprimir cartaz": A4 poster with point name, QR, three plain steps, via the browser print dialog. An archived point's URL shows "Este ponto não está mais ativo". |
| S6 | Each point has a **Tag output**. v1: the **Virtual printer** ("Impressora virtual"), a page opened on any device at the point where tags appear at label size, with print via the dialog. No page open → Check-in goes on, "sem etiqueta" (V10). The **printing module** (last spec) replaces it per point; its agent reaches printers by network address + label language (never a vendor SDK or USB), and is tested end to end against `ippeveprinter` or a port-9100 listener (#1099), a dev/test tool, not a product feature. |
| S7 | **"Crianças"** (Kids leaders): DataTable of Children in Families linked to this Church, server-side search by Child or Guardian name. Child page: Room placement, Pickup restriction, this Church's attendance. Family data read-only. Exists so a restriction or placement can be set on a weekday, before the Child is next checked in. |
| S8 | **"Visitantes"** (Kids leaders): Guardian contacts with Children, last Check-in, "apagado em 12 dias". Delete early on request; no extend, no edit (only the desk creates them). |
| S9 | **Sign-up pause**: ChurchAdmin "Cadastro aberto" switch (default on) beside the Church sign-up link and its poster in Church settings. Paused → link and Check-in point sign-up say "Cadastro pausado, fale com a igreja"; sign-in still works. |
| S10 | **Defaults**: Room lead time 30 min; Call unanswered after 2 min; drop-off window 30 min (from check-in at one point to arrival at the next, at the start of the service); Wrap-up time 30 min (after the last Shift ends); Guardian tag only for Guardians without the app (desk check-ins always, D18); big-screen Sector unset ("avise a projeção por outro meio"). |
| S11 | **Where setup lives**: Room fields (is a Room, age range, lead time, max Children, Children per volunteer) on the Sector, in its Ministry's Structure tab. New Church-level **"Kids"** nav area: checklist, Check-in points (name, Rooms served in order, poster, Tag output), Kids settings (Call unanswered after, drop-off window, Guardian tag), Crianças, Visitantes, live view. |
| S12 | **Who edits**: ChurchAdmin only: check-in on/off, big-screen Sector, sign-up link and pause. Any Kids leader: Room fields, points, Kids settings, Crianças, Visitantes. Wrap-up time: that Ministry's leaders and ChurchAdmins (first leader-editable field of Ministry settings, or moved to Structure). |
| S13 | **Scheduling unchanged** for a check-in Ministry, apart from the Wrap-up overlap warning (V5). Children per volunteer shows coverage only on the live view; it never suggests people needed. |
| S14 | **Un-Rooming / archiving a Room**: blocked while a Child is checked in there. Otherwise its Room placements are removed and listed on the checklist ("3 crianças tinham sala fixa no Berçário"); points stop listing it. |
| S15 | **Archiving a point**: blocked while a Check-in made there is open (its Retirada is the door, V11). |
| S16 | **Settings changed mid-service** apply to what starts after: new Check-ins, Calls, placements. Running ones keep their value (a Call's countdown, a placed Child). A Room's lead time change opens or closes it at once. |

## 1. Turning Kids on (ChurchAdmin, then Kids leaders)

1. ChurchAdmin: Ministry › Settings › "Check-in do Kids" on (S2). Its leaders are now Kids leaders (V1); the "Kids" nav area appears for them and ChurchAdmins (S11).
2. "Configurar Kids" checklist (S4) shows what is missing.
3. Kids leader: Ministry › Structure › a Sector › "É uma sala": age range (optional; none = reached only by a Move), lead time, max Children, Children per volunteer (S11).
4. Kids › Pontos de check-in › "Novo ponto": name ("Kids 0-4"), Rooms served in order (D17 uses the order), Tag output = Virtual printer (S6). "Imprimir cartaz" (S5).
5. Kids › Configurações: defaults shown (S10), editable by Kids leaders.
6. ChurchAdmin: Church settings: big-screen Sector (V17), sign-up link + poster, "Cadastro aberto" (S9).
7. Scheduling as today: Shifts with requirements at the Room Sectors, published (S13). Checklist goes green.
- Wrong: a Ministry turned on with no Rooms or points → checklist only; Guardians scanning nothing just never reach it. Room with no published Shift → never opens; checklist names it; a leader may still open it by hand on the day.

## 2. Between services (Kids leaders)

- **Weekday restriction or placement** (S7): Crianças › search › Child › "Restrição de retirada" (after seeing the court order) or "Sala fixa".
- **Visitors** (S8): Visitantes; delete on request.
- **Changing setup** (S16): edits apply forward. Archive a Room (S14) or point (S15) only when nothing open depends on it.
- **Turning off** (S3).

## 3. Service day: the Virtual printer

Team on duty opens the point's Virtual printer page on any device at the point (a desk laptop, a tablet). Each Check-in at that point shows its tags there; "Imprimir" uses the normal print dialog to whatever printer that device has. No page open → "sem etiqueta" on the Room list; "produzir etiqueta" later (V9, V10).

## 4. Test Church vs a future paying Church

Nothing in setup names hardware or screen software: tags go through a point's Tag output (Virtual printer until a real printer is plugged in), the big screen through a Sector's assigned person (V17), the checklist is the onboarding. This church's printers (#1085) only choose the first real printer adapter.

## 5. What this hands to later tickets

- **Prototype: Kids setup and settings screens** (#1095): Ministry check-in switch + turn-off block, Sector "É uma sala" fields, Configurar Kids checklist, Pontos de check-in list/form/poster, Virtual printer page, Kids settings, Crianças + Child page, Visitantes, Church settings sign-up pause, big-screen Sector picker.
- **Spec decomposition** (map fog): typed settings (Church Kids settings, Ministry Wrap-up time, Room fields), the Virtual printer as the first Tag output with the seam for the printing module, the printing module last (address + label language, emulator-tested).
- **Printing module** (map fog): S6 constraints; #1085 facts.
