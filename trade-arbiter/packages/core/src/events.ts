/**
 * Engine event envelope and market data payloads.
 * Sections 4.3 and 4.4 of the design spec.
 */
import type { RunContext } from './context.js';
import type { Side, StrategyId, Symbol, Timestamp, Venue } from './primitives.js';

/**
 * Generic envelope wrapping every payload that flows on the bus / queue.
 * `eventId` is a ULID, globally unique within a run; `ts` is the engine
 * timestamp at the moment the event was enqueued.
 */
export interface EngineEvent<T> {
  readonly eventId: string;
  readonly ctx: RunContext;
  readonly ts: Timestamp;
  readonly payload: T;
}

/** Discriminator for the MarketEvent union. */
export type MarketEventType =
  | 'quote'
  | 'trade'
  | 'orderbook'
  | 'candle'
  | 'funding'
  | 'oracle';

/**
 * Runtime list of every MarketEventType.
 *
 * NOTE: `'funding'` and `'oracle'` are reserved discriminators with no payload
 * interface in v1 — they are present here so adapter routing tables built from
 * this array include them when those types are wired up. Iterators over this
 * array will see kinds that the `MarketEvent` union does not yet cover.
 */
export const MARKET_EVENT_TYPES = [
  'quote',
  'trade',
  'orderbook',
  'candle',
  'funding',
  'oracle',
] as const satisfies readonly MarketEventType[];

/**
 * Fields common to every MarketEvent. `tsExchange` is authoritative for
 * deterministic ordering; `tsReceived` is the local receipt time and is only
 * useful for measuring feed lag.
 */
export interface BaseMarketEvent {
  readonly type: MarketEventType;
  readonly venue: Venue;
  readonly symbol: Symbol;
  readonly tsExchange: Timestamp;
  readonly tsReceived: Timestamp;
  /** Venue sequence number, when the venue provides one. */
  readonly seq?: number;
  /** Venue-normalized mid, when derivable. */
  readonly mid?: number;
}

export interface QuoteEvent extends BaseMarketEvent {
  readonly type: 'quote';
  readonly bid: number;
  readonly ask: number;
  readonly bidSize: number;
  readonly askSize: number;
}

export interface TradeEvent extends BaseMarketEvent {
  readonly type: 'trade';
  readonly price: number;
  readonly size: number;
  readonly side: Side;
}

export interface OrderBookEvent extends BaseMarketEvent {
  readonly type: 'orderbook';
  /** Each entry is `[price, size]`. Sorted high-to-low for bids, low-to-high for asks. */
  readonly bids: ReadonlyArray<readonly [number, number]>;
  readonly asks: ReadonlyArray<readonly [number, number]>;
}

export interface CandleEvent extends BaseMarketEvent {
  readonly type: 'candle';
  readonly interval: string;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
}

/**
 * The full MarketEvent discriminated union. Strategies switch on `type` to
 * narrow to a concrete event. `funding` and `oracle` payloads are not defined
 * in v1 — their interfaces will be added when the strategies that need them
 * are ported. Until then, the discriminator is reserved.
 */
export type MarketEvent = QuoteEvent | TradeEvent | OrderBookEvent | CandleEvent;

/**
 * Realized + unrealized P&L state emitted on every fill and on every
 * snapshot tick. `triggeredBy` distinguishes fill-driven from periodic
 * emissions. `currency` is venue-native (e.g., 'USDC' for Hyperliquid perps).
 * Not a variant of the `MarketEvent` union — PnlEvent flows on the bus
 * under its own event-type key.
 */
export interface PnlEvent {
  readonly type: 'pnl';
  readonly strategyId: StrategyId;
  readonly symbol: Symbol;
  readonly realizedDelta: number;
  readonly realizedCumulative: number;
  readonly unrealizedMark: number;
  readonly currency: string;
  readonly triggeredBy: 'fill' | 'snapshot';
}
