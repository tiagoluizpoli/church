# Research: How phone-scan check-in apps reach the label printer

Issue: #1086 (follows #1074, `docs/research/silent-label-printing.md`). Researched 2026-11-23.
Status: research only. Route letters A-E refer to the routes in `silent-label-printing.md`.

## 0. Summary

None of the products found prints from the parent's phone to the printer, and none has its cloud reach a church printer directly. Each has a vendor component on site that is signed in to the vendor cloud, holds the printer connection, and prints when the cloud tells it that a check-in happened. That component is a native station app (My Kids, Planning Center), a vendor hardware hub (KidCheck), or a Windows print proxy service (Rock RMS).

| Product | What sits on site | Printers (vendor-listed) | Printer link | Parent action that prints | Closest route |
|---|---|---|---|---|---|
| My Kids (DB1, Brazil) | Android tablet or Windows PC running the My Kids staff app (inferred from the equipment list) | Brother QL-800, QL-810W; Zebra ZD220 | USB (OTG cable to Android tablet), or Wi-Fi on QL-810W | Parent scans a QR with the phone; label "is automatically printed" | Native station app listening to the cloud: route E pattern, with the vendor's own app as the agent (C/D done natively) |
| Planning Center Check-Ins | Check-Ins app on iOS, Android, Mac or Windows ("station"), online | Brother, Zebra, Dymo, Citizen (per device type) | USB, Wi-Fi, Bluetooth; "print to another station" relays through a second station | Parent pre-checks in the Church Center app, then the station scans the parent's QR | Station prints to its own printer (C/D natively); "print to another station" is a cloud relay (E) |
| KidCheck | ExpressHub / PrintHub (vendor hardware), or Mac/Windows PC running the KidCheck Client, or Check-In Station Pro | Brother QL-800 sold; DYMO also mentioned | Printers attached to the hub or client computer; tablets pick a printer from that list | Parent checks in on the KidCheck app, taps submit on arrival; hub "recognizes" it and prints | Vendor appliance as print server and cloud agent (B + E) |
| Rock RMS (open source, added for comparison) | Cloud Print Proxy service on a Windows PC per network | Label printers on the LAN (models not read) | Proxy relays to LAN printers | Kiosk or app check-in with server-side printing | Cloud relay with self-hosted agent (E, no third party) |

What this means for us: the "phone scan, sticker prints" experience at the test church depends on a device in each room that runs vendor software and is logged in. A browser-only app needs the same thing: a page or helper left open on a machine by each printer (routes C, D, A) or a small on-site agent (B/E). Section 5 compares them.

## 1. My Kids (appmykids.com.br)

Vendor: DB1 Group, Maringá, Paraná (site footer links to db1group.com; Baguete news article, 2018-12-05, https://www.baguete.com.br/noticias/db1-cria-check-in-focado-em-evangelicos). The App Store lists the apps under "Gileade Sistemas Ltda ME" with appmykids.com.br as developer site (https://apps.apple.com/us/app/my-kids-ministry/id1293250651). Apps: My Kids Ministry (staff), My Kids Family (parents), My Kids Totem (kiosk).

No public help centre or FAQ beyond the marketing pages was found. Facts available:

- Flow: "After scanning the QR Code, the label with the child's primary information is automatically printed." The site also says check-in takes about 4 seconds and "the app can run entirely on a phone" (https://appmykids.com.br/en/home-en).
- Labels are optional: "As etiquetas são opcionais: a segurança está no aplicativo." Label shows name, room ("sala") and a security code; checkout is verified in the app (https://appmykids.com.br/ and https://appmykids.com.br/check-in-infantil/).
- QR: My Kids Family 1.55 release note says the two QR codes (app users, visitors) were merged into one "which can be scanned directly using the guardian's phone camera"; parents can request a new QR from support. Version 1.41 (2023-01-02) adds "Broad Cast Checkin" (App Store, https://apps.apple.com/br/app/my-kids-family/id1294433814?l=en-GB). My Kids Ministry 2.17 note: "download and print the QR Code so guardians can register and check their children in from their phones" (App Store page above). So the room QR is a printed code the church downloads from the staff app. What it encodes is not documented. Inference: a church, room or station id that the Family app sends to the cloud.
- Equipment page (https://equipamentos-mykids.lovable.app/, linked from the home page as "impressoras recomendadas e homologadas"):
  - Brother QL-800, "Homologado", USB, Android and Windows, DK-1201 (29x90 mm) or DK-1202 (62x100 mm).
  - Brother QL-810W, "Homologado", USB and Wi-Fi, Android and Windows, same labels.
  - Zebra ZD220, "Homologado", USB, Windows only, 80x20 mm labels or Zebra wristband.
  - Also listed: a 7-12" tablet stand, a USB-C to USB-B cable "for USB-C tablets" and a USB-C OTG adapter "to connect USB printers to Android tablets".
- No iOS printing, no Bluetooth printer and no network-only printer in the list. That points to a staff device (Android tablet or Windows PC) next to each printer, running the My Kids app, which receives the parent's check-in and prints. **Inference, not confirmed by vendor docs.** A 2018 news article says labels can be printed "a partir do smartphone dos pais" or from totems (Baguete, above). That is secondary and older than the current equipment list.
- Offline printer, out of labels, retries: not documented publicly.
- One-time setup: self-service inside the app ("processo de autoimplantação"), access code sent by WhatsApp (https://appmykids.com.br/). Printer pairing steps not published.

Route: a native app on an Android tablet can hold a USB or Wi-Fi connection to a Brother QL and print with no dialog through the vendor SDK. A browser can only do this through routes C or D (`silent-label-printing.md` sections 3-4). Functionally it is route E with My Kids' own app as the on-site agent.

## 2. Planning Center Check-Ins

- Stations run the Check-Ins app on Mac, Windows, Android or iOS and need internet to check in and print, "even when it uses a USB or Bluetooth printer". Recommended setup: "a computer with a hardwired, USB-connected label printer". Supported brands Zebra, Dymo, Brother, Citizen; Dymo works with Mac/Windows only, Citizen with iOS/Android. Brother printers only join 2.4 GHz Wi-Fi. Phones and tablets scan with the camera; QR is advised if only mobile or 2D scanners are used (https://help.planningcenter.com/en/138283-software-and-hardware-for-check-ins.html).
- Parent flow is the opposite of My Kids: the parent pre-checks in the Church Center app, which "generates a QR code, which they can scan at a Check-Ins station to have labels printed". Checking in without scanning ("Allow Complete Check-In") requires removing all labels from the event or location (https://help.planningcenter.com/en/138194-enable-the-church-center-app-for-an-event.html). The Church Center help page confirms the precheck is incomplete until the code is scanned at a station, and a station locked to a location only checks in people pre-checked for it (https://help.planningcenter.com/en/141279-check-in-with-church-center-app.html). So Planning Center does not print from a phone-only check-in.
- Print to another station: for devices that cannot reach a printer, a station can send its labels to another station; the target "must be active in order for it to print", and the error fix is to "open the Check-Ins app on the selected station device" (https://help.planningcenter.com/en/138285-print-to-another-station.html). The hardware page says up to two devices. Jobs are relayed through Planning Center, not over the LAN (inference from "must be active", not stated).
- Zebra on iOS/Android (beta, 2025-12-18): ZD421 on iOS, ZD421d/t and ZQ620 on Android, over Bluetooth or Wi-Fi; Planning Center Zebra templates "are designed to work only with 3x2 labels" (https://www.planningcenter.com/changelog/check-ins/new-zebra-support-for-check-ins-mobile-in-beta).
- Dymo is bridged by a separate Check-Ins printing app on the computer (search snippet of https://help.planningcenter.com/en/set-up-a-dymo-printer.html; not read).
- Printer failure: a mobile "Troubleshoot" flow for Brother, Zebra and Citizen was added 2026-02-17 (https://www.planningcenter.com/changelog/check-ins/new-printer-troubleshooting-for-ios-and-android). Behaviour for offline printer or empty roll not found.
- Route: station app prints directly (C/D natively); print-to-another-station is a vendor relay (E).

## 3. KidCheck

- A tablet only lists a printer if it is "connected to either a KidCheck ExpressHub or a computer"; the computer is Mac or Windows with "the KidCheck Client running in the background". Several printers can share one hub or computer. Parents using Express Check-In on their own device can pick a printer on an ExpressHub "once they are within its Bluetooth range" (https://kidcheck.com/faq/printing-work/).
- Express Check-In: parents start check-in at home or in the car, tap submit on arrival, and the Check-In Station Pro or ExpressHub "recognize[s] the check-in" and prints name badges and guardian receipts to "the associated label printer". No code scan (https://kidcheck.com/express, https://kidcheck.com/feature/express-check-in). The tablet setup page says Express Check-In requires an ExpressHub (https://kidcheck.com/tutorial/mobile-check/). A search snippet says Express Check-In without a licensed hub still works but labels then need a manned station; unverified.
- Hardware: PrintHub 3 (2018) is a Wi-Fi box with an LCD for diagnostics that prints "without a personal computer or printer software" (PRWeb, 2018-09-05, https://www.prweb.com/releases/kidcheck_childrens_check_in_delivers_next_generation_mobile_printing/prweb15716678.htm). The store currently sells the Check-In Station Pro (14" touchscreen with "built-in mobile printing") and Brother QL-800 bundles with DK-2205 labels; "Brother labels are not compatible with DYMO printers" (https://store.kidcheck.com/).
- Each tablet needs a device license (https://kidcheck.com/tutorial/mobile-check/).
- Offline printer or out of labels: not documented in pages read.
- Route: vendor appliance on the LAN as the print server, driven by the cloud (B + E), with Bluetooth as the proximity signal that the parent has arrived.

## 4. Rock RMS (comparison)

- The Cloud Print Proxy is "a small program running on your proxy device that keeps an open line of communication with your Rock server", installed on any Windows check-in device or a small dedicated PC. It relays server-side print jobs to LAN printers. One proxy device per network; several instances on different PCs share load and fail over; with one proxy, "if this device goes down you'll no longer be able to print". The IIS server needs WebSockets (https://community.rockrms.com/documentation/church-management/check-in/printing/set-up-cloud-printing).
- Rock still recommends client printing from the iPad or Windows check-in app when possible (https://community.rockrms.com/documentation/church-management/check-in/printing/intro-to-printing).
- Relevance: the same shape as route E but self-hosted. It is the nearest published design for our off-site server.

## 5. What this implies for a browser-only app

- Every product puts a logged-in vendor component next to the printer. None let the cloud talk to the printer directly, and none print from the parent's phone.
- Room QR at drop-off (My Kids model): the QR only has to identify the room. The parent's authenticated phone posts "check in child X at room R"; the server pushes a print job to whatever is listening for room R. In our stack that listener can be:
  - a browser page left open on a tablet or PC by the printer, receiving jobs over websocket or SSE and printing via route D (WebUSB/Web Serial, Chromium, USB printer), route C (QZ Tray or a vendor helper) or route A (kiosk silent print);
  - or a small agent on site (Raspberry Pi or mini PC) that keeps an outbound connection to the server and sends to the printer over IPP or raw 9100 (route B behind an E-style link, as Rock does). This also gives offline status and a queue.
- My Kids' homologated Brother QL-800 is USB-only and needs Brother's driver or SDK. If the church's printers are QL-800s, the browser routes are WebUSB with Brother raster commands, QZ Tray, or Brother b-PAC on Windows. A QL-810W can also be reached on the network, which opens the on-site agent route.
- Android tablets are the vendor's station device. The desktop helpers in route C (QZ Tray, Brother b-PAC) and the Windows/ChromeOS silent-print policies in route A do not apply there, which leaves WebUSB or a network printer behind an agent. WebUSB support on Android Chrome was not checked here; confirm it on MDN before choosing a route.

## Gaps

- My Kids: no public help docs. Not documented: what the room QR encodes, which device prints (inferred from the equipment list), behaviour when the printer is offline or out of labels, and printer setup steps. Ask the test church or DB1 support which device sits by each printer and what model it is.
- My Kids equipment page is hosted on lovable.app, not the main domain; it is linked from the official home page, but treat it as vendor-provided and possibly changing.
- Planning Center: several un-numbered help URLs returned 404 (touchless check-ins, troubleshoot station alerts); the Dymo and Brother setup pages were seen only as search snippets. How print-to-another-station transports jobs is inferred.
- KidCheck: the ExpressHub product page and its Bluetooth behaviour beyond the FAQ sentence were not found; the "no hub" behaviour is a search snippet only.
- ChurchSuite (QR check-in, Brother QL-810W/820NWB per search snippets) was blocked by a Cloudflare challenge; not included.
- No product documents offline or out-of-labels handling in pages read.
