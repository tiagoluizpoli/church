# Research: Address lookup and map providers

Status: research only, for the grilling ticket "Church address and location" (#985). Question: [#984](https://github.com/tiagoluizpoli/church/issues/984). Sources were read on 2026-11-21. Prices are USD per 1,000 billable events unless noted.

Assumed scale: about 300 Churches, a few dozen address edits a month, and modest public page views. The ChurchAdmin enters the single address iFood-style: search a place or type a CEP, optionally adjust a pin, or type it manually. A public church page shows the location and links to Google Maps and Waze directions.

Recommendation: see section 8. In short, use Google Places Autocomplete (New) with Essentials fields only, a Maps JavaScript map for the admin pin, the Maps Embed API on the public page, keyless Google Maps and Waze URLs, and ViaCEP with BrasilAPI as fallback for CEP lookup. At this scale it costs about **US$0 a month**, but it needs a Google billing account.

## 1. Google Maps Platform pricing

From [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing). Each SKU has its own free monthly cap, shown first, and then a per-1,000 price for usage from the cap up to 100k:

| SKU | Free per month | Price per 1,000 up to 100k |
|---|---|---|
| Autocomplete Requests (Essentials) | 10,000 | $2.83 |
| Autocomplete Session Usage | Unlimited | — |
| Place Details Essentials (IDs Only) | Unlimited | — |
| Place Details Essentials | 10,000 | $5.00 |
| Place Details Pro | 5,000 | $17.00 |
| Place Details Enterprise | 1,000 | $20.00 |
| Geocoding (Essentials) | 10,000 | $5.00 |
| Dynamic Maps (Maps JavaScript) | 10,000 | $7.00 |
| Static Maps | 10,000 | $2.00 |
| **Maps Embed** | **Unlimited** | — |

**Which fields bill at which tier.** `addressComponents`, `formattedAddress`, `location`, `plusCode`, `postalAddress`, `shortFormattedAddress`, `types` and `viewport` trigger Place Details **Essentials**. `displayName`, `googleMapsUri`, `businessStatus` and `primaryType` trigger **Pro** ([Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details)). The Church already has its own name, so it does not need `displayName`.

**Session tokens** ([session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing)):
- A session starts with the first Autocomplete (New) request that carries a token. It ends with the Place Details (New) call that uses the same token.
- If that closing call asks only for Essentials fields, the first 12 autocomplete requests bill at Autocomplete Requests, and requests 13 and later are free. The details call bills at Place Details Essentials.
- If the closing call asks for any Pro or higher field, every autocomplete request is free, but the details call bills at a higher tier.
- An IDs-only details call is free, but the session's autocomplete requests then bill per request. An abandoned session (no details call) also bills per request. Reusing an ended token bills as if there were no token.

**Widget.** The JavaScript `PlaceAutocompleteElement` manages sessions automatically. It supports `includedRegionCodes`, for example `['br']` ([Place Autocomplete (New) widget](https://developers.google.com/maps/documentation/javascript/place-autocomplete-new)).

**Billing in Brazil.** Prices are listed in USD and converted to local currency on the invoice. Google Cloud bills accounts with a Brazilian billing address in BRL through a local entity, which requires a Tax ID and may add a local surcharge. I did not find a Maps-Platform-specific page confirming the BRL terms; see section 9.

## 2. Google terms: caching, storage, display

From the [Maps Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) (last modified 2026-10-28), the [Maps Platform Terms](https://cloud.google.com/maps-platform/terms) (2026-08-26) and the [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies):

- **Place ID can be stored forever.** The policies page says it "is exempt from the caching restrictions. You can therefore store place ID values indefinitely."
- **Places lat/lng is limited to 30 days.** Service terms §14.3: "Customer may temporarily cache latitude and longitude values from the Places API for up to 30 consecutive calendar days, after which Customer must delete the cached latitude and longitude values."
- **Other Places content must not be stored.** Platform terms say Customer "will not cache Google Maps Content except as expressly permitted". The policies page says not to "copy and save business names, addresses, or user reviews", and to store the place ID and fetch fresh details instead.
- **The Geocoding exception does not fit a public page.** Service terms §6.3.2 allow indefinite caching of Geocoding lat/lng and address, but only "solely to support the direct, End User facing functionality". The cache must also be "logically isolated to the specific End User ... and must not be used across multiple End Users". A public church page shows the data to many users, so this does not cover it.
- **Places content may appear without a map, but not on a non-Google map.** §14.1 allows use "without a corresponding Google Map". §14.2 says it must not be used "in conjunction with a non-Google map". The platform terms add that Customer "will not use the Google Maps Core Services with or near a non-Google Map". So Google autocomplete combined with an OSM, MapLibre or Mapbox map is not allowed. The Places UI Kit (§15.1) is the only Places product exempt from this rule.
- **Attribution.** If content is not shown on a Google map, show the Google Maps logo (16–19 dp tall, unmodified) or the text "Google Maps". A Google map already carries the attribution.

**What this means for the Church data.** Store the `place_id` permanently. The address the ChurchAdmin confirms or edits in the form becomes the Church's own data. The terms do not explicitly cover a raw Google lat/lng that the admin accepted without moving the pin. The conservative reading is to re-fetch `location` by `place_id` at least every 30 days. At about 300 Churches that is about 300 Place Details Essentials calls a month, inside the free 10k.

A pin the admin dropped or dragged is arguably the admin's own content. The terms do not say so, so treat this as an interpretation to confirm in #985 (section 9). Only the Address Validation API terms explicitly allow replacing Google content with "End User data provided through End User confirmation or correction".

## 3. Keyless directions links

- **Google Maps URLs** ([docs](https://developers.google.com/maps/documentation/urls/get-started)) need no API key. The only stated limit is 2,048 characters. Always include `api=1`.
  - Directions: `https://www.google.com/maps/dir/?api=1&destination=<url-encoded address or lat,lng>&destination_place_id=<place_id>&travelmode=driving|walking|bicycling|two-wheeler|transit`. `destination_place_id` requires `destination`.
  - Search: `https://www.google.com/maps/search/?api=1&query=<text>&query_place_id=<place_id>`.
- **Waze** ([deep links](https://developers.google.com/waze/deeplinks)) needs no key.
  - Navigate to a point: `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`.
  - Search: `https://waze.com/ul?q=<url-encoded text>`.
  - Optional: `z=` for zoom (6–8192) and `utm_source=` for attribution.
  - On mobile the link opens the app if it is installed, otherwise the web page. On desktop it opens the web page.
  - Waze has no place-id parameter, so a precise link needs coordinates. Otherwise it falls back to `q=` with the address text.

## 4. Showing the map

- **Admin pin.** A Maps JavaScript dynamic map with a draggable marker. Each load bills Dynamic Maps (10k free a month), and address edits are rare.
- **Public page.** The Maps Embed API iframe is free and unlimited: `https://www.google.com/maps/embed/v1/place?key=KEY&q=place_id:<id>`. `q` can also be an address or lat/lng ([embed docs](https://developers.google.com/maps/documentation/embed/embedding-map)). It needs a key but costs nothing. Static Maps is the alternative if an image is wanted (10k free, then $2).

## 5. Alternatives

**Mapbox** ([pricing](https://www.mapbox.com/pricing))
- Search Box API: 2,500 sessions a month free, then $11.50; or 25k requests free, then $1.70. Introductory-preview SKUs are cheaper.
- Geocoding: temporary results have 100k free; permanent (storable) results cost $5.00 with no free tier.
- GL JS: 50k map loads free. Static Images: 50k free.
- Blocking issues:
  - Search Box docs say "all data returned by the Search Box API endpoints is only available for temporary use", and list supported geographies as only "the United States, Canada, and Europe". Brazil is not listed ([Search Box docs](https://docs.mapbox.com/api/search/search-box/)).
  - Temporary geocoding results "are not allowed to be cached", and "You may only use responses from the Geocoding API in conjunction with a Mapbox map" ([Geocoding docs](https://docs.mapbox.com/api/search/geocoding/)).

**HERE.** here.com pricing pages returned 403, so this is not verified. A search snippet of developers.here.com/plans suggests 5,000 free Autosuggest transactions a month on the Base Plan. Older snapshots show a larger free geocoding allowance. I found no first-party Brazil address-quality statement.

**OSM-based options**
- Nominatim public instance ([usage policy](https://operations.osmfoundation.org/policies/nominatim/)): an absolute maximum of 1 request a second per application, and it requires an identifying User-Agent or Referer. Client-side autocomplete is forbidden ("must not implement such a service on the client side using the API"). The operator may switch the app off at any time. It is unusable for search-as-you-type.
- Photon public instance ([photon.komoot.io](https://photon.komoot.io/)): "be fair - extensive usage will be throttled". No availability guarantee, and the terms may change. Self-hosting means running a Brazil OSM extract.
- LocationIQ ([pricing](https://locationiq.com/pricing)): 5,000 requests a day free at 2 a second. Commercial use requires a visible "Search by LocationIQ.com" backlink. Free accounts may cache responses for 48 hours, though the page also says response data may be stored "forever". The cheapest paid plan with geocoding is $100 a month.
- Brazil address quality: none of these providers publishes a Brazil coverage or quality statement. OSM house-number coverage in Brazil is likely uneven, but I did not verify this against a primary source.
- An OSM map also needs a tile provider, which adds another vendor and its policy.

## 6. CEP lookup

**ViaCEP** ([viacep.com.br](https://viacep.com.br/))
- Free. `GET https://viacep.com.br/ws/{cep}/json/` with 8 digits.
- Returns `cep`, `logradouro`, `complemento`, `unidade`, `bairro`, `localidade`, `uf`, `estado`, `regiao`, `ibge`, `gia`, `ddd` and `siafi`.
- A malformed CEP returns HTTP 400. An unknown CEP returns `{"erro": "true"}`. It returns no lat/lng.
- No numeric limit, no SLA and no formal terms are published. Mass use "poderá automaticamente bloquear seu acesso por tempo indeterminado".

**BrasilAPI** ([README](https://github.com/BrasilAPI/BrasilAPI), [source](https://github.com/BrasilAPI/BrasilAPI/tree/main/pages/api/cep))
- Free. `GET https://brasilapi.com.br/api/cep/v1/{cep}` (also `v2`).
- Uses cep-promise across providers `correios`, `viacep`, `widenet` and `correios-alt`, with a 3-second timeout ([services/cep/cep.js](https://github.com/BrasilAPI/BrasilAPI/blob/main/services/cep/cep.js)).
- v2 adds `location` coordinates from Photon (OSM), with Open-Meteo as fallback ([lib/fetchGeocoordinateFromBrazilLocation.js](https://github.com/BrasilAPI/BrasilAPI/blob/main/lib/fetchGeocoordinateFromBrazilLocation.js)). Those coordinates are street- or CEP-level OSM data, not a rooftop.
- A live call for `01001000` returned `"service":"open-cep"` plus a location.
- Terms are "em beta": no published rate limit or SLA. The README asks for human-like volume and no crawling.

Both are community services with no SLA. Using one as primary and the other as fallback covers a single outage. Manual entry is the final fallback. At a few dozen lookups a month, the volume is far below anything either service would treat as abuse.

## 7. Key restriction and LGPD

**Key restriction** ([API security best practices](https://developers.google.com/maps/api-security-best-practices))
- Browser key: use the Websites (HTTP referrer) restriction with full origins, and restrict it to Maps JavaScript API and Places API (New). Use a separate key for Maps Embed, restricted to Maps Embed API alone.
- Server key (for a `place_id` refresh job): use an IP-address restriction and API restrictions, and keep it out of the source tree.
- Use separate keys per app and separate projects for client and server traffic. Google warns you are "financially responsible for charges caused by abuse of unrestricted API keys". Per-API quota caps in Cloud Console and a billing budget alert limit the damage from a leaked key. Quotas and budgets are standard Cloud Console features, but this page does not detail them.

**LGPD** ([Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm))
- Personal data is "informação relacionada a pessoa natural identificada ou identificável" (Art. 5, I). A Church's address belongs to an organisation, so it is normally not personal data.
- One exception: a small church meeting at a member's home. That address identifies a person, and publishing it on a public page would need a legal basis. The ChurchAdmin should see a clear notice that the address is public.
- Sending CEPs or search text to Google or BrasilAPI involves no member data. If personal data were sent abroad, Art. 33 would govern the international transfer.

## 8. Recommended stack and monthly cost

| Need | Choice |
|---|---|
| Place search | Google `PlaceAutocompleteElement`, `includedRegionCodes: ['br']`, fetching only Essentials fields (`id`, `addressComponents`, `formattedAddress`, `location`), never `displayName` |
| CEP | ViaCEP, with BrasilAPI v1 as fallback, through the backend; then manual entry |
| Admin pin | Maps JavaScript dynamic map with a draggable marker |
| Public map | Maps Embed API, `q=place_id:…` (or the admin's lat/lng when there is no place) |
| Directions | Google Maps URL with `destination` + `destination_place_id`; Waze `ll=…&navigate=yes` |
| Stored | `place_id` (indefinitely), the admin-confirmed address fields, and the pin coordinates with their source (google or admin). Google-sourced coordinates are refreshed by `place_id` at least every 30 days |

Estimated monthly use: about 30 edits × up to 12 autocomplete requests (≤ 360, against 10k free), about 30 + 300 refresh Place Details Essentials calls (≤ 330, against 10k free), and about 100 dynamic map loads (against 10k free). Embed and the deep links are unlimited and free. **Total: US$0 a month**, with roughly 30× headroom before any SKU leaves its free tier. Past that, the first SKU to bill is Place Details Essentials at $5 per 1,000.

An all-OSM stack (Photon or LocationIQ plus a MapLibre map) also costs about $0. It has to be all-or-nothing, because the terms forbid mixing Google search with a non-Google map. It brings weaker or unverified Brazil address quality, public instances with no SLA, and an extra tile vendor. Mapbox is ruled out for search because it does not list Brazil and does not allow storing results.

## 9. Not verified from a primary source

- Whether an admin-accepted or admin-dragged pin counts as end-user content outside Google's 30-day lat/lng limit (§2). The terms are silent.
- HERE's current pricing and free tier: pages returned 403.
- Brazil address-quality data for any provider: none of them publishes it.
- Brazil-specific Maps Platform billing (BRL invoicing, surcharge, tax): seen only on Google Cloud pages, not Maps Platform pages.
- ViaCEP and BrasilAPI rate limits: neither publishes numbers.
