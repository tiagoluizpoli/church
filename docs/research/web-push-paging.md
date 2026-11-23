# Web push on phones: permission, install, vibration and silent-mode limits

Research for issue #1073 (map #1072, Kids check-in and parent paging). Researched 2026-11-23.

## Verdict

Web push can wake a phone and show a notification. It **cannot** force sound or vibration through the silent switch or Do Not Disturb on either platform. That override belongs to the user's OS settings, and on iOS it needs a native-app entitlement. Do not promise parents "your phone will always buzz".

## Evidence

Each row says how well the source was read. "Verified" means the fetched primary text states it. "Unverified" means the page fetch returned only a title or nothing useful, so the claim comes from prior knowledge and must be re-checked before it is relied on.

### Permission

- Notification permission should be requested from a user interaction such as a button click. MDN shows the call inside a click handler and says to respect `denied` and not re-prompt. Verified. <https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static>
- iOS requires the request to follow direct user interaction, such as tapping a subscribe button. Verified. <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/> (2023-02-16)
- Secure context (HTTPS) is required. Verified (MDN link above).
- The Push API says permission is requested via `subscribe()`. The Notifications spec has no user-activation wording; the gesture rule is browser policy and WebKit documentation. Verified. <https://www.w3.org/TR/push-api/>, <https://notifications.spec.whatwg.org/>
- Once `denied`, the page cannot re-prompt. The user must change it in browser or OS settings. This follows from MDN's `denied` semantics. Verified.

### iOS and iPadOS install and version floor

- Web Push on iPhone needs iOS/iPadOS **16.4** or later. Verified (WebKit post above).
- It works only for a web app added to the Home Screen, with a manifest `display` of `standalone` or `fullscreen`. A plain Safari tab does not receive push. Verified.
- Delivery goes through Apple Push Notification service, with no Apple developer membership needed. Servers should allow `*.push.apple.com`. Verified.
- Safari requires `userVisibleOnly: true`. A push that does not show a notification gets the subscription revoked. Silent push is not allowed. Verified. <https://webkit.org/blog/16535/meet-declarative-web-push/> (2025-03-27). Declarative Web Push, which shows a notification without a service worker, is testable from iOS 18.4.
- Notifications integrate with Focus, so the user decides when they arrive. Verified (WebKit 2023 post).
- Apple Developer page on web push (`sending-web-push-notifications-in-web-apps-and-browsers`): fetch returned the title only. Unverified.

### Urgency, TTL and delivery

- TTL is mandatory. After expiry the push service must not deliver. TTL 0 means deliver now if the device is reachable, otherwise drop. Verified. RFC 8030 section 5.2, <https://www.rfc-editor.org/rfc/rfc8030>
- Urgency values are `very-low`, `low`, `normal` (default) and `high`. RFC 8030 section 5.3 describes them as power and network hints (high is for low battery, such as incoming calls). They are not a bypass of the user's sound settings. Verified.
- A `201` from the push service "does not indicate that the message was delivered". Services are not obliged to store messages indefinitely. There is no delivery guarantee, only at-least-once after acknowledgement. Verified (RFC 8030 sections 6.2, 7.2).
- A `Topic` header replaces a pending message with the same topic, which suits "latest page only". `404` or `410` means drop the subscription; `429` means back off. Verified. <https://web.dev/articles/push-notifications-web-push-protocol>
- Android normal priority may be delayed in Doze. High priority is attempted immediately but may be deprioritised when it produces no user-visible notification. Verified for FCM generally; the page does not address web push and does not say how the web `Urgency` header maps to FCM priority. <https://firebase.google.com/docs/cloud-messaging/android-message-priority>
- Chrome rate limits: MDN says Chrome has no quota and Firefox has a quota that notification-producing messages are exempt from. Verified. <https://developer.mozilla.org/en-US/docs/Web/API/Push_API>

### Vibration, sound and silent mode

- The Notifications standard defines `silent` only. `true` means no sound or vibration. `null` (default) leaves it to platform conventions. It has no `vibrate` option and no way to force sound. Verified. <https://notifications.spec.whatwg.org/>
- `Notification.vibrate` is deprecated, non-standard and "not defined in any specification". Its browser support table was not retrievable. Verified for status only. <https://developer.mozilla.org/en-US/docs/Web/API/Notification/vibrate>
- The Vibration API fetch gave no support, user-activation or silent-mode statement. Do not rely on `navigator.vibrate`: from prior knowledge iOS Safari lacks it, and it needs a visible page, which is useless for a locked phone. Unverified. <https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API>
- Android 8+: sound, vibration and importance belong to a notification channel. After creation the app cannot change them and "the user has complete control". The system "might adjust" alert behaviour. Verified for native apps. <https://developer.android.com/develop/ui/views/notifications/channels>, <https://developer.android.com/develop/ui/views/notifications/build-notification>. A browser, not our site, owns the channels for web notifications, so the site cannot set `IMPORTANCE_HIGH` or a vibration pattern. That inference is not documented in a fetched source.
- Android DND exceptions (message category, person, alarm category, full-screen intent) are native-app notification metadata that the system applies per user settings. A web page cannot set them. Same inference as above.
- iOS interruption levels: Time Sensitive can break through Focus if the user allows it. Critical Alerts play through mute and Focus but need the Apple-granted entitlement `com.apple.developer.usernotifications.critical-alerts` and are for native apps. The Apple pages returned only a title, so this is Unverified and must be re-read at <https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel>. The WebKit 2023 and 2025 posts mention no web equivalent of either level.

### Push service and self-hosting

- The browser, not the site, picks the push service. The site receives an endpoint URL in the subscription (MDN Push API). Chrome uses Google's service, Firefox uses Mozilla's, Safari uses Apple's. The site sends RFC 8030 requests to that endpoint with a VAPID (RFC 8292) JWT: `aud` is the push service origin, `exp` is at most 24 hours ahead. Verified. <https://www.rfc-editor.org/rfc/rfc8292>
- So "self-hosted push service" is not possible for ordinary Chrome or Safari users. Mozilla's `autopush-rs` is open source but serves Firefox. Verified for Firefox only. <https://mozilla-services.github.io/autopush-rs/>
- What we self-host is the **application server**: the code that stores subscriptions, encrypts payloads (RFC 8291) and posts to endpoints. A library such as `web-push` covers this. No third-party push SaaS is required.
- UnifiedPush (self-hostable, Android) was not verified; the fetch returned a redirect only. Treat as not applicable to browsers until checked. <https://unifiedpush.org/users/distributors/>

## What is not possible

1. Overriding the iPhone silent switch, Focus or Do Not Disturb from web push. Only native Critical Alerts do that, and they need an Apple entitlement. Unverified for web (see above), but nothing read suggests a web path.
2. Forcing vibration or sound on Android from a web page. The user and the browser's channel settings decide.
3. Push on iPhone without installing to the Home Screen, or below iOS 16.4.
4. Silent or background-only pushes on Safari. Every push must show a notification.
5. Guaranteed delivery. A `201` means accepted, not delivered. Doze, offline devices and TTL expiry all lose messages.
6. Re-asking after the user blocks notifications.
7. Choosing or self-hosting the push service for Chrome and Safari users.

## What we can honestly promise parents

"If you install the app to your home screen, allow notifications and keep the phone's notification settings for it on, you will normally get an alert within seconds. Whether it makes a sound or buzzes follows your phone's silent and Focus settings."

## Fallback ladder (recommendation, not sourced)

1. Web push with `urgency: high`, a short TTL (minutes: a page older than that is wrong to show), a `topic` per child or page, and `userVisibleOnly: true`.
2. On the check-in confirmation screen, tell the parent to install, allow notifications, and exempt the app from silent and Focus. On Android, link to the app's notification settings. This screen is the only lever we control.
3. If the parent's page is open, show an in-page alert and a sound. Browsers restrict autoplay before a gesture, so unlock on the check-in tap. This is unverified here.
4. SMS or WhatsApp to the parent's phone for pages that were not acknowledged within N seconds. Carrier SMS is not blocked by an app's notification settings, though silent mode still applies. Not researched.
5. Physical pager, or a caregiver walking to find the parent, for pages that are never acknowledged. Acknowledgement should be recorded server side.
6. A native app with Critical Alerts and Android channels only if parents routinely miss pages in practice. That contradicts the no-native-app premise, so it should be a decision, not a default.

## Open items for a follow-up

- Test on real iPhone (16.4+ and current) and a mid-range Android: silent switch, Focus, Doze, battery saver, locked screen.
- Re-read the Apple `UNNotificationInterruptionLevel`, Critical Alerts and web push pages directly.
- Confirm MDN and caniuse support for `navigator.vibrate` and `Notification.vibrate`.
- Check whether Chrome on Android surfaces per-site channel settings, and whether Urgency maps to FCM priority.
- Check whether iOS web apps in the EU keep push support.
