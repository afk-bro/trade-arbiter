/**
 * Typed envelope for the JSONL audit log. Every line written by the engine's
 * audit writer is one `AuditRecord`. The engine derives `kind` and `payload`
 * from the event class that caused the record; consumers can narrow with
 * `AuditRecord<'fill', FillEvent>` etc.
 *
 * Added in Plan 2 — purely additive to Plan 1's shipped surface.
 */
import type { RunId, Timestamp } from './primitives.js';

export type AuditKind =
  | 'market'
  | 'intent'
  | 'decision'
  | 'request'
  | 'order'
  | 'fill'
  | 'pnl'
  | 'snapshot';

/**
 * Runtime list of every AuditKind in declaration order. Used by the engine's
 * audit writer to validate the `kind` field before serialization.
 */
export const AUDIT_KINDS = [
  'market',
  'intent',
  'decision',
  'request',
  'order',
  'fill',
  'pnl',
  'snapshot',
] as const satisfies readonly AuditKind[];

/**
 * One line of the JSONL audit log.
 *
 * - `eventId`: the engine's ULID-shaped identifier for the triggering event.
 * - `runId`: identifies the run this record belongs to.
 * - `ts`: engine timestamp when the record was created.
 * - `kind`: the discriminator, one of `AuditKind`.
 * - `payload`: the untyped event body — consumers narrow via the generic
 *   parameters (e.g., `AuditRecord<'fill', FillEvent>`).
 */
export interface AuditRecord<K extends AuditKind = AuditKind, P = unknown> {
  readonly eventId: string;
  readonly ts: Timestamp;
  readonly runId: RunId;
  readonly kind: K;
  readonly payload: P;
}
