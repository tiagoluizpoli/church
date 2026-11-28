# Research: can a phone Share send an image to WhatsApp as a document

Status: research only, no code changed. Ticket: [#1238](https://github.com/tiagoluizpoli/church/issues/1238).
Background: [#1112](https://github.com/tiagoluizpoli/church/issues/1112) measured that WhatsApp shrinks a
photo to 1600 px on its longest side and re-encodes it as JPEG, while a document arrives unchanged.

## Answer

- A web page cannot ask WhatsApp to treat a shared file as a document. The Web Share API carries only the
  files, and the share target decides what they mean. Android passes the file's MIME type to the app.
  iOS passes a file URL whose type comes from the file name's extension.
- A PNG shared with `navigator.share({ files })` reaches WhatsApp as an image. Every way we found to make
  it look like something else is either blocked by the browser (ZIP) or gives the recipient a broken file
  (PNG bytes with a `.pdf` name or `application/pdf` type). What WhatsApp then does with a shared image
  (photo flow, shrunk, with the HD choice) is **unverified from primary sources**. WhatsApp does not
  document it, so it needs one phone test per OS (see the end of this note).
- **A real PDF is the way to get a document.** `application/pdf` / `.pdf` is on Chromium's Web Share
  allowlist, and WhatsApp sends PDFs as documents (2 GB limit) with an in-app PDF preview. A PDF skips
  photo compression because WhatsApp handles it as a document, not as media. The first-page thumbnail in
  the chat bubble is **unverified** (WhatsApp's help pages do not mention it).

## 1. What the Web Share spec lets the page say

The W3C Web Share spec ([w3c.github.io/web-share](https://w3c.github.io/web-share/)) defines `files` as
just "Files to be shared". It has no member for "send as document" or for any delivery hint. In the
spec's own words:

- "The meaning of each member of the payload is at the discretion of the share target."
- "the user agent SHOULD map the members of ShareData onto equivalent concepts in the target."
- The user agent may reject files it considers hostile, and `share()` rejects with `NotAllowedError` "If
  a file type is being blocked due to security considerations". The spec does not list the blocked types.

MDN ([Navigator.share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)) gives the list of
"usually shareable" types: PDF, some audio, images (PNG, JPEG, WebP, ...), some text and video types. It has
**no ZIP and no `application/octet-stream`**, and it says to check `navigator.canShare()` before sharing.

## 2. Android (Chrome)

Source: Chromium
[`ShareServiceImpl.java`](https://chromium.googlesource.com/chromium/src/+/main/components/browser_ui/webshare/android/java/src/org/chromium/components/browser_ui/webshare/ShareServiceImpl.java),
[`SharedFileCollator.java`](https://chromium.googlesource.com/chromium/src/+/main/components/browser_ui/webshare/android/java/src/org/chromium/components/browser_ui/webshare/SharedFileCollator.java),
[`FILE_TYPES.md`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webshare/FILE_TYPES.md).

- Chrome refuses a share unless **both** the file name's extension is in `PERMITTED_EXTENSIONS` **and**
  the blob's MIME type is in `PERMITTED_MIME_TYPES`. The two checks are separate: Chrome does not check
  that the name, the MIME type and the bytes agree. Neither list has `zip`. The `pdf` /
  `application/pdf` pair is on both. Limits: 10 files, 50 MB each.
- Chrome writes each file under its given name, gets a content URI for it, and sets the share intent's
  type to the files' common MIME type (`setFileContentType(commonMimeType(files))`). One PNG gives
  `image/png`. PNG plus PDF gives `*/*`.
- On Android the receiving app chooses its handling from the intent's action and MIME type
  ([Receive simple data](https://developer.android.com/training/sharing/receive): "It's then up to you to
  handle the content appropriately"). The sender has no standard extra that means "as a document".

So for an `image/png` intent, the page's only lever is the MIME type. Changing it to `application/pdf`
makes WhatsApp see a "PDF" that is really a PNG, which the recipient cannot open. That is not a fix.

**Unverified:** WhatsApp's Android intent filters and whether an `image/*` share opens the photo composer
(shrink, HD toggle) or the document flow. Also unverified: whether a mixed `*/*` share (PNG plus PDF) makes
WhatsApp send the PNG as a document. WhatsApp's manifest is not public documentation.

## 3. iOS (Safari and every iOS browser, which all use WebKit)

Source: WebKit
[`WKShareSheet.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/Cocoa/WKShareSheet.mm).

- WebKit writes each shared file to a temporary directory under its sanitized name and hands the
  **file URLs** to the system share sheet.
- The type identifier for each item comes from the URL. When the URL has no type, WebKit uses
  `UTType typeWithFilenameExtension:` on the **file name's extension** and falls back to `public.data`.
  The page's `File.type` is not what iOS sees. The extension is.
- A `.png` therefore arrives in WhatsApp's share extension as `public.png`, an image.

WhatsApp's iPhone help page ([How to send media](https://faq.whatsapp.com/iphone/chats/how-to-send-media/))
says media shared into WhatsApp "directly from other iPhone apps" cannot be edited before sending. This
implies the share-in path treats images as media, but the page does not say whether they are compressed
the same way. **Unverified.**

## 4. Wrapping options

| Wrapper | Allowed by the browser | How WhatsApp gets it | Verdict |
|---|---|---|---|
| PNG, `image/png` | yes | image (likely photo flow, unverified) | shrinks big images |
| PNG renamed / retyped `.pdf` | Android: yes (checks are separate). iOS: typed by extension | "PDF" that is really PNG bytes | broken for the recipient |
| ZIP | **no** (not on Chromium's allowlist, not on MDN's list) | - | blocked |
| Real PDF (`application/pdf`, `.pdf`) | yes | document | **works**: unchanged, 2 GB limit |
| PNG inside a real PDF | yes | document | works; the recipient opens a PDF, not an image |

## 5. How WhatsApp handles a shared PDF

From WhatsApp's help pages ([Web/Desktop](https://faq.whatsapp.com/453914586839706/?cms_platform=web&locale=en_US),
[iPhone](https://faq.whatsapp.com/iphone/chats/how-to-send-media/)):

- "The maximum allowed document size is 2 GB."
- "Click a PDF in your chat to open it in full-screen preview." "PDF preview and editing is powered by Adobe
  Acrobat." (the Web/Desktop page)
- Media "are usually compressed when shared" ("geralmente são comprimidos"), and HD is a media-quality
  option. The pages describe no compression for documents. #1112 measured documents arriving unchanged.
- **Unverified:** the first-page thumbnail on the chat bubble on Android and iPhone. The help pages do not
  describe it.

## 6. What to test on a phone to close the unverified parts

Use a test page that shares (a) a 2248×3066 PNG, (b) the same schedule as a PDF, and (c) both together.
Share each to WhatsApp from Chrome on Android and from Safari on iOS. Record whether it arrives as a photo
or a document, its received pixel size, and whether the PDF shows a first-page thumbnail.

## Sources

- W3C Web Share API: https://w3c.github.io/web-share/
- MDN `Navigator.share()`: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
- Chromium Android share: `ShareServiceImpl.java`, `SharedFileCollator.java`, `FILE_TYPES.md` (links above)
- Chromium desktop share allowlist: https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/webshare/share_service_impl.cc
- WebKit `WKShareSheet.mm` (link above)
- Android, Receive simple data: https://developer.android.com/training/sharing/receive
- WhatsApp help: How to send media (iPhone, Web), About HD photos and videos: https://faq.whatsapp.com/759301289012856/
