# Project working instructions

- At the start of every task, read the external project guide at
  `../emey-crochet-store-notes/PROJECT_MEMORY.md`, resolved from this repository.
  It contains the current state, code map, deployment workflow, and known limits.
- Before finishing each task, update that guide with changes, decisions,
  verification results, and outstanding work. Keep current facts concise; replace
  stale status rather than accumulating contradictory notes. Never record secrets.
- If the guide is unavailable on another machine, use README.md and the current
  source to reconstruct it in the same sibling location; continue useful work.
- Use the native Firebase SDK through FirebaseService; do not reintroduce AngularFire.
- Keep ImageKit/Cloudflare/Firebase on their free plans. Store image URLs in
  Firestore; do not reintroduce image bytes or run legacy seeds against the migrated catalog.
- Edit this source checkout, not the managed VM deployment/seed copies. Firebase
  credentials belong to each machine/profile. Distinguish local checks, user-reported
  results, and independently verified live changes.
- Do not push changes unless the user requests it.
