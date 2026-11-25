# Research: Printer emulators the OS sees as a real label printer

Issue: #1099 (map #1072, Kids check-in and parent paging). Researched 2026-11-25.
Status: research only. Follows `silent-label-printing.md` (routes A-E) and `checkin-app-printing.md`. Candidate printers: Brother QL-800/810W (29x90 or 62x100 mm) and Zebra ZD220.

## 0. Summary

No single emulator pretends to be a Brother QL or a Zebra ZD220 to every OS and also shows the label. What exists splits by layer:

- **IPP layer:** `ippeveprinter` (CUPS) is a real IPP Everywhere printer on the network. Any OS print dialog, CUPS queue, Windows IPP class driver or Android Default Print Service can find and print to it, and it keeps each job's bytes on disk. It does not render labels.
- **Raw 9100 + ZPL:** Virtual ZPL Printer (Windows) listens on TCP 9100 like a networked Zebra and shows each label as an image, rendered by the Labelary service.
- **Brother QL raster:** no emulator exists. `brother_ql analyze` turns captured QL raster bytes into PNG files.

Recommendation: build the print agent against a printer address (raw `socket://host:9100` or `ipp://host/ipp/print`) and a label language (ZPL or Brother raster), never against a vendor SDK or USB device. Test today with `ippeveprinter -k` as the IPP target, or a `nc -lk 9100` sink as the raw target, then render the captured bytes: Labelary (or Virtual ZPL Printer) for ZPL, `brother_ql analyze` for QL raster. When the real printer is known, only the address changes. Do not send real child names to the free Labelary API: it has no data-retention commitment. Use made-up names in tests.

| Option | Pretends to be | Receives jobs by | How you see output | Licence / maintenance | Real agent prints to it unchanged? |
|---|---|---|---|---|---|
| `ippeveprinter` (CUPS 2.4) | Generic IPP Everywhere printer; make/model set with `-M`/`-m` | IPP on port 8000-8999 or `-p`; DNS-SD `_print` advert unless `-r off` | Raw job files kept with `-k -d dir`; `-c cmd` runs a command per job (renderer hook); `-D socket://host:9100` forwards to a real printer | Apache-2.0, ships with CUPS (installed here: 2.4.7) | Yes for an IPP agent: same protocol, same job and printer state. Client must declare a format the printer lists in `-f` |
| Virtual ZPL Printer (porrey) | Networked Zebra ZPL printer | Raw TCP, default port 9100; ends a label at `^XZ` | Windows app shows labels as images; regex "filters" to rewrite ZPL | LGPL-3.0, v3.5.x on .NET 10, last push 2026-04 | Yes for a raw-9100 ZPL agent. Windows only. Sends ZPL to Labelary online |
| Labelary API | Not a printer, a ZPL renderer | HTTPS POST of ZPL to `api.labelary.com/v1/printers/{dpmm}/labels/{w}x{h}/{i}` | PNG (default) or PDF, any size in inches, 6/8/12/24 dpmm | Free, no key: 3 req/s, 5,000/day. Paid tiers add zero data retention; on-premise by quote | Renderer only; pair with a 9100 sink or `ippeveprinter -k` |
| `brother_ql analyze` (pklaus/brother_ql) | Not a printer, a QL raster decoder | Reads a captured raster file | Writes `label0001.png`, ... | GPL-3.0; last release 0.9.4 (2019), repo pushed 2026-01; lists QL-800/810W as verified | Renderer only; pair with a 9100 sink. No status replies (see 3) |
| LPrint (Michael Sweet) | IPP Everywhere front for real label printers | IPP in; USB or network out to the printer | The real label | Apache-2.0, v1.4.0 (2026-06); Brother QL driver is experimental | Not an emulator. A candidate print server for the real swap (route B) |
| Plain sink: `nc -lk 9100 > job.bin` | Any raw socket printer | Raw TCP 9100 | Bytes on disk | OS tool | Yes for raw agents that never read status back |

## 1. ippeveprinter

- "A simple Internet Printing Protocol (IPP) server conforming to the IPP Everywhere (PWG 5100.14) specification. It can be used to test client software or act as a very basic print server that runs a command for each job that is printed" (man page, https://www.cups.org/doc/man-ippeveprinter.html).
- Options that matter here: `-k` keeps documents in the spool directory, `-d` sets it, `-f` lists accepted MIME types, `-c` runs a command per document, `-D` sends output to a file, directory or `socket://ADDRESS[:PORT]`, `-r off` disables DNS-SD, `-p` sets the port (same page).
- Tried here (CUPS 2.4.7): `ippeveprinter -r off -p 8633 -k -d spool -f application/vnd.zebra-zpl -m "Virtual ZD220" KidsTest`, then `ipptool -f tag.zpl -d filetype=application/vnd.zebra-zpl ipp://localhost:8633/ipp/print print-job.test` passed and the ZPL was saved byte for byte as `spool/1-untitled.dat`. The same job sent as `application/octet-stream` was rejected ("Unsupported document-format"): the server auto-types the bytes and refuses unknown formats, so the agent must send the exact format.
- Who can print to it: CUPS (`lpadmin -m everywhere` or `-m raw`, see `silent-label-printing.md` section 2); Windows 10 21H2+ through the inbox Microsoft IPP Class Driver for Mopria/IPP printers (Microsoft, https://learn.microsoft.com/en-us/windows-hardware/drivers/print/end-of-servicing-plan-for-third-party-printer-drivers-on-windows); Android 8+ through the Default Print Service (AOSP `BuiltInPrintService`, https://android.googlesource.com/platform/packages/services/BuiltInPrintService). Those dialogs send PDF or PWG Raster, so start it with `-f application/pdf,image/pwg-raster` for OS-dialog tests.

## 2. Zebra (ZPL) route

- Virtual ZPL Printer: "An Ethernet based virtual Zebra Label Printer that can be used to test applications that produce bar code labels. This application uses the Labelary service" (README, https://github.com/porrey/Virtual-ZPL-Printer). Default port 9100 is in `DefaultPrinterConfiguration.cs` in that repo. Installer is MSI/Setup.exe, .NET 10.
- A Windows desk PC can add it as a printer through a Standard TCP/IP port at 127.0.0.1:9100 with the Zebra or Generic/Text driver. **Inference, not tested.** The emulator does not answer `~HS` host status queries in anything I read, so status polling is untested.
- Labelary: free for any use with no key; POST is recommended when "your ZPL contains sensitive information"; zero data retention only on paid and on-premise plans (https://labelary.com/service.html). ZD220 is 203 dpi, so use 8 dpmm.

## 3. Brother QL route

- No Brother or community emulator for QL-800/810W was found. Brother publishes the QL-800/810W/820NWB raster command reference (https://download.brother.com/welcome/docp100278/cv_ql800_eng_raster_101.pdf), which is what an emulator would implement.
- `brother_ql` sends raster over network (`tcp://host:9100`), pyusb or `/dev/usb/lp0`; "the network backend doesn't support reading back the printer state" (https://github.com/pklaus/brother_ql). Its `analyze` command uses `BrotherQLReader`, whose output pattern is `label{counter:04d}.png` (`brother_ql/reader.py`). So a 9100 sink plus `brother_ql analyze` shows what a QL would print.
- The real printer answers a status request with a 32-byte reply (raster reference above). A sink does not. An agent that waits for status (Brother SDK, USB backends) hangs or times out against a sink. **Inference from the protocol.** Keep status reading behind its own interface and fake it in tests.

## 4. Fit with a phone-scan check-in

- The parent's phone never prints (see `checkin-app-printing.md`). The agent on site (browser page or small LAN service) receives the job and talks to the printer. Every option above is reachable from that agent over the LAN, so the flow can be tested end to end on a laptop now.
- A USB-only QL-800 cannot be emulated as a USB device by any tool found. If the church has QL-800s, the USB/WebUSB path (route D) can be tested only against the bytes, not the device, until the hardware arrives.
- A vendor app such as My Kids would not print unchanged to these: it uses Brother's SDK or driver and expects status replies. Our own agent can, if it addresses the printer by host:port and language.

## Gaps

- Virtual ZPL Printer and the Windows TCP/IP port setup not run here (Linux host). Its handling of `~HS` and other status commands not checked.
- `brother_ql analyze` not run against a real captured job; PNG output confirmed from source only.
- Android Default Print Service IPP Everywhere details come from the AOSP repo listing and Mopria FAQ (https://mopria.org/androidfaq), not a source.android.com page.
- No local, offline ZPL renderer was found besides Labelary on-premise (paid).
