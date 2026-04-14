import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES,
  VENUES,
  type Mode,
  type Venue,
  type Side,
  type OutcomeToken,
  type Timestamp,
  type RunId,
  type StrategyId,
  type ConfigHash,
  type Symbol as InstrumentSymbol,
} from '../src/primitives.js';

test('MODES contains the four execution modes in declaration order', () => {
  assert.deepEqual(MODES, ['backtest_l1', 'backtest_l2', 'paper', 'live']);
});

test('VENUES contains all v1+v2 venues', () => {
  assert.deepEqual(
    [...VENUES].sort(),
    ['binance', 'hyperliquid', 'kalshi', 'polymarket'],
  );
});

test('primitive types compile in literal values', () => {
  const ts: Timestamp = 0;
  const runId: RunId = 'r1';
  const strategyId: StrategyId = 's1';
  const configHash: ConfigHash = 'h1';
  const sym: InstrumentSymbol = 'btc-up-15m';
  const side: Side = 'buy';
  const outcomeYes: OutcomeToken = 'YES';
  const outcomeNo: OutcomeToken = 'NO';
  const mode: Mode = 'backtest_l1';
  const venue: Venue = 'polymarket';
  void ts; void runId; void strategyId; void configHash; void sym;
  void side; void outcomeYes; void outcomeNo; void mode; void venue;
});
