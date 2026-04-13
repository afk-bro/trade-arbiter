import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  EngineEvent,
  MarketEvent,
  MarketEventType,
  BaseMarketEvent,
  QuoteEvent,
  TradeEvent,
  OrderBookEvent,
  CandleEvent,
} from '../src/events.js';
import { MARKET_EVENT_TYPES } from '../src/events.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = {
  runId: 'r1',
  strategyId: 's1',
  configHash: 'h1',
  mode: 'paper',
};

test('MARKET_EVENT_TYPES enumerates every market event kind', () => {
  assert.deepEqual(
    [...MARKET_EVENT_TYPES].sort(),
    ['candle', 'funding', 'oracle', 'orderbook', 'quote', 'trade'],
  );
});

test('MarketEventType type accepts all listed kinds', () => {
  const _types: MarketEventType[] = ['quote', 'trade', 'orderbook', 'candle', 'funding', 'oracle'];
  void _types;
});

test('BaseMarketEvent compile shape with optional seq and mid', () => {
  const base: BaseMarketEvent = {
    type: 'quote',
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    tsExchange: 1,
    tsReceived: 2,
    seq: 100,
    mid: 0.48,
  };
  void base;
});

test('QuoteEvent compile shape', () => {
  const ev: QuoteEvent = {
    type: 'quote',
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    tsExchange: 1,
    tsReceived: 2,
    bid: 0.47,
    ask: 0.49,
    bidSize: 100,
    askSize: 80,
  };
  assert.equal(ev.type, 'quote');
});

test('TradeEvent compile shape', () => {
  const ev: TradeEvent = {
    type: 'trade',
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    tsExchange: 1,
    tsReceived: 2,
    price: 0.48,
    size: 5,
    side: 'buy',
  };
  assert.equal(ev.side, 'buy');
});

test('OrderBookEvent compile shape', () => {
  const ev: OrderBookEvent = {
    type: 'orderbook',
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    tsExchange: 1,
    tsReceived: 2,
    bids: [[0.47, 100], [0.46, 200]],
    asks: [[0.49, 80], [0.50, 120]],
  };
  assert.equal(ev.bids.length, 2);
  assert.equal(ev.asks.length, 2);
});

test('CandleEvent compile shape', () => {
  const ev: CandleEvent = {
    type: 'candle',
    venue: 'binance',
    symbol: 'BTCUSDT',
    tsExchange: 1,
    tsReceived: 2,
    interval: '1m',
    o: 100, h: 110, l: 95, c: 105, v: 1234,
  };
  assert.equal(ev.interval, '1m');
});

test('MarketEvent union accepts every concrete subtype', () => {
  const evs: MarketEvent[] = [
    { type: 'quote', venue: 'polymarket', symbol: 's', tsExchange: 0, tsReceived: 0, bid: 0, ask: 0, bidSize: 0, askSize: 0 },
    { type: 'trade', venue: 'polymarket', symbol: 's', tsExchange: 0, tsReceived: 0, price: 0, size: 0, side: 'buy' },
    { type: 'orderbook', venue: 'polymarket', symbol: 's', tsExchange: 0, tsReceived: 0, bids: [], asks: [] },
    { type: 'candle', venue: 'binance', symbol: 's', tsExchange: 0, tsReceived: 0, interval: '1m', o: 0, h: 0, l: 0, c: 0, v: 0 },
  ];
  assert.equal(evs.length, 4);
});

test('EngineEvent envelope wraps a payload with ctx and ts', () => {
  const ev: EngineEvent<{ message: string }> = {
    eventId: 'e1',
    ctx,
    ts: 0,
    payload: { message: 'hi' },
  };
  assert.equal(ev.payload.message, 'hi');
});
