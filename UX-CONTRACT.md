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

Private status URLs use a fragment token, never a query-string secret. The token is
sent in a JSON POST only to the configured Worker; referrer policy is no-referrer.
No third-party analytics on order status. Summary excludes contact details and
private server fields. No background polling; refresh is explicit. Signed-in users
may access their own history; guest orders are not claimed by matching email.

## Admin workflow

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

Native form semantics and keyboard controls are canonical. New screens expose
loading/error/empty states and do not use native confirm/alert. No drag-only action.
Do not record purchases from WhatsApp clicks. No invented sales metrics.
Worker tests exercise calculation, stock races, expiry, retry, access isolation,
payment transitions and authorization. Build/typecheck compile the real templates.
Browser smoke tests are separate from live integration verification; do not infer
real IAM, indexes, Turnstile or cron health from local unit tests.
