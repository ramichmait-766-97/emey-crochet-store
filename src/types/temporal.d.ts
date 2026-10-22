/**
 * Type bridge for Firebase Firestore 12.19.x.
 *
 * Firestore exposes Timestamp.fromInstant()/toInstant() with Temporal.Instant,
 * while TypeScript's standard ES2022 DOM libraries do not yet declare the
 * global Temporal namespace. The application does not call those APIs; this
 * declaration only satisfies Firestore's public .d.ts surface without
 * weakening skipLibCheck or project strictness.
 */
declare namespace Temporal {
  interface Instant {
    readonly epochNanoseconds: bigint;
    toString(options?: unknown): string;
  }
}
