---
version: alpha
name: Emey Crochet Store
description: A small handmade crochet boutique with a practical reservation and fulfillment workspace.
colors:
  primary: '#30251f'
  background: '#fffaf5'
  soft: '#f4eae2'
  accent: '#7b4e3a'
  rose: '#a65f58'
  border: '#e6d9d0'
typography:
  sans:
    fontFamily: "'DM Sans', Arial, sans-serif"
  display:
    fontFamily: "'Playfair Display', Georgia, serif"
rounded:
  DEFAULT: '12px'
  control: '8px'
  panel: '20px'
spacing:
  page-max: '1240px'
  gutter: '20px'
components:
  button: {}
  field: {}
  status: {}
  panel: {}
---

# Emey design context

## Overview

The creative reference is a maker's yarn sample book: tactile product photography,
warm paper surfaces, brown ink and restrained serif headings. Keep the existing
boutique identity. The operational signature is an order reference followed by
two plainly labelled status strips: fulfillment and payment.

Hybrid register: home/shop/product routes express the maker's work; checkout,
account and admin routes prioritize accurate choices, readable totals and recovery.
Audience: customers buying handmade pieces and the small store team fulfilling
them, often on a phone. English is the existing UI language; delivery markets
remain owner-configured rather than inferred from locale or phone country code.
Dates follow the user's browser locale; persisted times are UTC epoch milliseconds.

Anti-references: generic enterprise dashboards, decorative charts, artificial
scarcity, and a new palette imposed on existing screens. Admin controls must not
look like marketing offers.

## Colors and runtime mapping

`src/styles.scss` owns runtime tokens. The frontmatter mirrors its existing values:
primary → `--ink`, background → `--cream`, soft → `--soft`, accent → `--brown`,
rose → `--rose`, border → `--line`. Components consume these variables directly;
there is no generated theme adapter or parallel token system. Existing muted text
needs contrast review for small text; new important text uses ink/brown.

## Typography

Display headings use `--serif`; forms and transactional data use `--sans`. Product
names and full amounts remain readable. Order references wrap rather than truncate.
Sentence case describes real actions. No new font download is introduced.

## Layout

Shared `.shell`: maximum 1240px, 20px side gutters. Existing cart transforms from
two columns to one at 820px. New commerce forms use natural document scrolling;
order rows collapse at 640px. Shared commerce layouts live in
`src/app/features/commerce.scss`, not duplicate screen-specific stylesheets.

Catalog photos now use square aspect-ratio boxes; hero/collection/detail photos
retain portrait 4:5 frames. Intrinsic dimensions and responsive width candidates
reserve geometry without fixed pixel photo heights. Catalog metadata reserves six
rem and actions three rem so viewport-deferred cards match their skeletons. Titles
use two lines with the full name in the link title and product page. Skeletons use
the same shared card stylesheet, existing soft/cream tokens and reduced-motion rule.
The empty router outlet reserves a viewport while its lazy view loads, keeping the
footer below the fold; loaded page layouts retain their existing minimum height.

## Elevation, shapes and motion

Use subtle structural borders and white/cream surfaces; new operational panels do
not introduce shadows or gradients. Controls use 8px radii, rows 12px, panels 20px;
reuse existing pill `.btn` actions. Existing reduced-motion stylesheet rules own
motion behavior. Busy states preserve controls and entered values.

## Components and states

Buttons: shared `.btn.primary` / `.btn.ghost`; existing focus-visible outline is
global. Disabled states retain labels; asynchronous actions expose text status.
Forms: native Angular template forms; OS-owned native select popups are intentional
for these short zone/payment/status/variant lists. No custom listbox geometry.
Textareas have sufficient height, no resize handle, and progressive auto-growth.
Errors are inline `role=alert`; confirmations use `role=status`; missing data and
load failures have distinct, actionable states. Native validation bubbles are off
on new forms. No blocking native alerts/confirm dialogs.

Order details show the immutable item/price/delivery snapshot. Payment and
fulfillment labels never rely on color. No drag interaction is required.
Settings navigation prompts before discarding unsaved changes. See UX-CONTRACT.md
for data recovery and security behavior.

## Admin workspace direction

The overview keeps the warm paper/brown ink palette and existing typography.
A single dark order-value panel anchors otherwise quiet white metric panels;
compact brown daily bars and fulfilment meters communicate actual loaded ledger
activity. Headings name operations plainly; avoid fabricated traffic, revenue or
percentage trends. The data scope stays beside date/currency controls.

AdminNavComponent owns responsive, wrapping route navigation. AppDialogComponent
owns product editing and discard confirmations with a native top-layer dialog,
cream surface, 20px radius (14px on phones), sticky title/Close header, bounded
viewport height and internal scrolling. It consumes existing global tokens and
focus styles; no overlay library or new font is introduced. See UX-CONTRACT.md
for focus, busy, recovery, loaded-data and role-navigation contracts.
