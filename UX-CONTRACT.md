# Emey operational interaction contract

## Canonical UI Map

| Capability     | Canonical owner                              | Source of truth   | Allowed variants                   | Verification                         |
| -------------- | -------------------------------------------- | ----------------- | ---------------------------------- | ------------------------------------ |
| Select/Listbox | Native select + FormsModule                  | This contract     | OS popup                           | Template compilation + browser smoke |
| Form           | Angular template forms + Worker validation   | COMMERCE.md       | Review, save, reserve              | Worker tests + template compilation  |
| Scrollbar      | Global stylesheet                            | DESIGN.md         | Document scrolling                 | Narrow viewport smoke                |
| Toast          | Inline message live regions                  | Global stylesheet | Alert, status                      | Template compilation + browser smoke |
| CRUD           | CommerceService + existing AdminStoreService | COMMERCE.md       | Versioned save, refresh, load more | Worker tests + browser smoke         |

- Select/Listbox: native HTML select, Angular FormsModule; OS popup geometry accepted.
- Date: DatePipe read-only display; no new date picker in this release.
- Form: Angular template forms, `CommerceService` and Worker schema validation.
- Scrollbar: document scrolling via `src/styles.scss`; no nested fixed-height panels.
- Toast: existing inline `.message` blocks, alert/status live regions; no toast library.
- CRUD: route links and `CommerceService`; product editing retains AdminStoreService.
- Table Selection: not applicable; single order detail selection only.
- Textarea: global resize-none, sufficient height, progressive `field-sizing` support.

## Checkout journey

The local bag stores only product/variant IDs, quantities and cent-price snapshots
under `emey-cart-v3:guest` or a UID-scoped device key. Each selection is capped at
ten units and the bag at fifteen selections. Product display/availability comes
from a validated live query bounded to the bag's distinct IDs; absence from a
browse page does not indicate unavailability. Unavailable lines remain removable. Persistence
errors leave the in-memory bag usable and show an inline status. The old v2 guest
bag is migrated by extracting only allowed fields; no image bytes are retained.
Signing in restores that member's device-local bag; signing out restores the guest
bag. These scopes are separate, with no automatic merge or Firestore cart sync.

Guest and member: bag → delivery/contact/payment → server-reviewed total → security
check → atomic reservation → recorded reference/private status link → optional
WhatsApp conversation. The bag clears only after the server returns an order.
Member profile details load once; token verification and verified email determine
discount eligibility. Changing inputs invalidates the reviewed quote. New prices
or delivery configuration require another review; no silent total increase.

Session storage holds the pending request including contact details and a private
random checkout key solely for recovery from uncertain responses. This is a
deliberate, session-scoped security design: no localStorage persistence, no telemetry
of contact/key data. Shared-device customers should close the browser session.
Successful checkout removes pending recovery. Clearing recovery requires an
explicit warning and does not cancel a server order.

Recovery now records the originating cart owner. A delayed success may clear only
that owner's bag; recovery created before owner tracking does not automatically
clear any bag. Identity changes invalidate reviewed quotes. Runtime decoding of
malformed responses fails closed and preserves uncertain-response recovery.

Private status URLs use a fragment token, never a query-string secret. The token is
sent in a JSON POST only to the configured Worker; referrer policy is no-referrer.
No third-party analytics on order status. Summary excludes contact details and
private server fields. No background polling; refresh is explicit. Signed-in users
may access their own history; guest orders are not claimed by matching email.

## Admin workflow

Catalog lists use the bounded query/cursor contract in CATALOG.md. Shop owns a
twelve-row pager, home an independent eight-row preview and admin a twenty-five-row
pager, each with one lookahead document. Load more preserves loaded rows and shows
a disabled busy action; failed append retains rows/cursor for retry. Filter changes
hide stale rows immediately and restart paging; the UI says pieces loaded rather
than implying a complete total. Browse pages refresh explicitly; detail and cart
retain bounded live listeners. Search is labelled case-sensitive name prefix and
forces name order; it no longer promises substring/color/description search.
Existing featured URLs mean Name: A to Z; new-arrival choices filter the flag.
Admin saves refresh its page from the beginning. See CATALOG.md for schema mapping,
malformed-record handling, mutation limits, and maindb index rollout prerequisites.

Settings open → load → edit → save → remain with success feedback. Disabled example
configuration is seeded only by an explicit admin action. A version conflict asks
for reload. Navigation with changes offers keep editing or discard. Browser reload
uses the standard beforeunload mechanism when settings are dirty.

Orders load 25 at a time; optional fulfillment filtering applies only to loaded
rows and says so. Select row → detail → update payment/fulfillment with evidence
note → server validation → replace that row. Stale versions fail; refresh reloads.
Cancellation releases reserved stock once, but never sends money automatically.
Expiry wins over an admin action on an overdue unpaid/unconfirmed hold.

## Boundaries and verification

Hosted product media uses the shared ImageKit transform/srcset pipes, account
endpoint and low-resolution backdrop/fallback directive. Local assets and legacy
data images pass through; they do not receive fictitious responsive variants.
Cards are square, with fixed metadata/action geometry shared by placeholders.
Native `sizes` follows the actual home/shop breakpoints; detail, gallery, bag and
admin thumbnails request their own bounded candidate widths. Gallery/variant
selection applies the same pipeline to every selected source.

Home category DOM, each catalog card and the detail gallery instantiate on
viewport entry. Product cards and the gallery are standalone deferred chunks.
Image failure removes srcset and shows a dimensionally stable local fallback.
Deferred-code failure preserves the placeholder footprint and offers a page
reload; a Firestore refresh cannot retry a rejected JavaScript import. Price,
inventory, Auth, checkout and route paths remain governed by existing contracts.

Native form semantics and keyboard controls are canonical. New screens expose
loading/error/empty states and do not use native confirm/alert. No drag-only action.
Do not record purchases from WhatsApp clicks. No invented sales metrics.
Worker tests exercise calculation, stock races, expiry, retry, access isolation,
payment transitions and authorization. Build/typecheck compile the real templates.
Browser smoke tests are separate from live integration verification; do not infer
real IAM, indexes, Turnstile or cron health from local unit tests.
