/**
 * Engine event envelope and market data payloads.
 * Sections 4.3 and 4.4 of the design spec.
 */
import type { RunContext } from './context.js';
import type { Side, Symbol, Timestamp, Venue } from './primitives.js';

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
  type: MarketEventType;
  venue: Venue;
  symbol: Symbol;
  tsExchange: Timestamp;
  tsReceived: Timestamp;
  /** Venue sequence number, when the venue provides one. */
  seq?: number;
  /** Venue-normalized mid, when derivable. */
  mid?: number;
}

export interface QuoteEvent extends BaseMarketEvent {
  type: 'quote';
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
}

export interface TradeEvent extends BaseMarketEvent {
  type: 'trade';
  price: number;
  size: number;
  side: Side;
}

export interface OrderBookEvent extends BaseMarketEvent {
  type: 'orderbook';
  /** Each entry is `[price, size]`. Sorted high-to-low for bids, low-to-high for asks. */
  bids: ReadonlyArray<readonly [number, number]>;
  asks: ReadonlyArray<readonly [number, number]>;
}

export interface CandleEvent extends BaseMarketEvent {
  type: 'candle';
  interval: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * The full MarketEvent discriminated union. Strategies switch on `type` to
 * narrow to a concrete event. `funding` and `oracle` payloads are not defined
 * in v1 — their interfaces will be added when the strategies that need them
 * are ported. Until then, the discriminator is reserved.
 */
export type MarketEvent = QuoteEvent | TradeEvent | OrderBookEvent | CandleEvent;
