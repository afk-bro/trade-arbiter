/**
 * Execution adapter and data feed contracts.
 * Sections 4.8 and 4.9 of the design spec.
 */
import type { MarketEvent, MarketEventType } from './events.js';
import type { FillEvent, OrderEvent, OrderRequest } from './intents.js';
import type { Mode, Symbol, Timestamp, Venue } from './primitives.js';

/**
 * Venue/mode-specific execution backend. Accepts approved OrderRequests and
 * emits FillEvents and OrderEvents via callbacks. The submit() promise
 * resolves only after the request is in flight (handed off to the venue or
 * the simulator's internal book), giving callers an ergonomic await point.
 *
 * `requestId` ownership: assigned by the OrderManager before submit() is
 * called. The adapter accepts and echoes it back. Live adapters that need
 * a venue-native id maintain their own engineRequestId → venueOrderId
 * mapping internally but always surface the engine's requestId on
 * FillEvent and OrderEvent.
 */
export interface ExecutionAdapter {
  readonly venue: Venue;
  readonly mode: Mode;
  connect(): Promise<void>;
  submit(req: OrderRequest): Promise<{ requestId: string }>;
  cancel(requestId: string): Promise<void>;
  onFill(cb: (fill: FillEvent) => void): void;
  onOrderEvent(cb: (ev: OrderEvent) => void): void;
  disconnect(): Promise<void>;
}

/**
 * Source of MarketEvents. Live feeds are WebSocket clients; replay feeds
 * read partitioned Parquet files and drive the BacktestClock.
 */
export interface DataFeed {
  readonly venue: Venue;
  readonly mode: Mode;
  subscribe(symbols: Symbol[], types: MarketEventType[]): void;
  onEvent(cb: (ev: MarketEvent) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Replay only — live feeds throw when called. */
  seek?(ts: Timestamp): Promise<void>;
}
