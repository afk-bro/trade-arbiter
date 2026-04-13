/**
 * Admin service contracts.
 * Section 4.13 of the design spec.
 *
 * The AdminService is the engine's in-process control surface. Both the
 * trade-arbiter CLI and the dashboard server are clients of this service
 * via a Unix socket transport. Implementation lives in the engine package
 * and lands in Plan 6.
 *
 * All mutating commands (pause_strategy, resume_strategy, kill,
 * reset_kill_switch, arm_live, disarm_live) are serialized onto the
 * EventQueue as control events, so they are observed in deterministic
 * order relative to market/fill/order events. Read-only commands
 * (health, list_runs, show_run) bypass the queue.
 */
import type { RunId, StrategyId, Timestamp } from './primitives.js';

/**
 * The full v1 admin command surface. Adding new commands extends this
 * union; the transport, framing, and socket permission model do not
 * change. Every mutating command carries enough context for the
 * receiving controller to route it without further lookup.
 */
export type AdminCommand =
  | { readonly kind: 'health' }
  | { readonly kind: 'list_runs' }
  | { readonly kind: 'show_run'; readonly runId: RunId }
  | { readonly kind: 'pause_strategy'; readonly runId: RunId; readonly strategyId: StrategyId }
  | { readonly kind: 'resume_strategy'; readonly runId: RunId; readonly strategyId: StrategyId }
  | { readonly kind: 'kill'; readonly reason: string }
  | { readonly kind: 'reset_kill_switch'; readonly reason: string }
  | {
      readonly kind: 'arm_live';
      readonly runId: RunId;
      readonly strategyId: StrategyId;
      /** Must equal `strategyId` — protects against fat-fingered dashboard clicks. */
      readonly confirmation: string;
    }
  | { readonly kind: 'disarm_live'; readonly runId: RunId; readonly strategyId: StrategyId };

/** Discriminator string of every AdminCommand variant. */
export type AdminCommandKind = AdminCommand['kind'];

export interface AdminResponse<T = unknown> {
  readonly ok: boolean;
  readonly ts: Timestamp;
  readonly data?: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

export interface AdminService {
  start(): Promise<void>;
  stop(): Promise<void>;
  handle(cmd: AdminCommand): Promise<AdminResponse>;
}

/**
 * Pluggable transport for the admin service. v1 ships
 * UnixSocketAdminTransport; future transports (TCP, gRPC, HTTP) speak the
 * same command/response shapes.
 */
export interface AdminTransport {
  bind(service: AdminService): Promise<void>;
  close(): Promise<void>;
}
