import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '@trade-arbiter/core';

test('public surface exports all runtime constants', () => {
  assert.ok(Array.isArray(core.MODES), 'MODES exported');
  assert.equal(core.MODES.length, 4);
  assert.ok(Array.isArray(core.VENUES), 'VENUES exported');
  assert.equal(core.VENUES.length, 4);
  assert.ok(Array.isArray(core.MARKET_EVENT_TYPES), 'MARKET_EVENT_TYPES exported');
  assert.equal(core.MARKET_EVENT_TYPES.length, 6);
  assert.ok(Array.isArray(core.ORDER_STATUSES), 'ORDER_STATUSES exported');
  assert.equal(core.ORDER_STATUSES.length, 7);
  assert.ok(Array.isArray(core.FILL_STATUSES), 'FILL_STATUSES exported');
  assert.equal(core.FILL_STATUSES.length, 5);
});

test('public surface accepts a synthetic intent → request → fill round trip', () => {
  const ctx: core.RunContext = {
    runId: 'r1',
    strategyId: 's1',
    configHash: 'h1',
    mode: 'backtest_l1',
  };

  const intent: core.OrderIntent = {
    intentId: 'i1',
    ctx,
    tsCreated: 0,
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    side: 'buy',
    sizeRequested: 5,
    timeInForce: 'GTC',
    reason: 'test',
  };

  const request: core.OrderRequest = {
    ...intent,
    requestId: 'req1',
    sizeApproved: 5,
    riskDecisionId: 'd1',
  };

  const fill: core.FillEvent = {
    fillId: 'f1',
    intentId: intent.intentId,
    requestId: request.requestId,
    ctx,
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    tsExchange: 1,
    tsReceived: 2,
    status: 'filled',
    filledSize: 5,
    remainingSize: 0,
    avgPrice: 0.48,
    feesPaid: 0.001,
  };

  assert.equal(fill.intentId, intent.intentId);
  assert.equal(fill.requestId, request.requestId);
  assert.equal(request.sizeApproved, intent.sizeRequested);
});

test('public surface exposes every interface as a named type', () => {
  // This test exists to lock in that future barrel changes don't accidentally
  // drop a name. The body is type-level only; the runtime body is trivial.
  type Surface = {
    // primitives
    Timestamp: core.Timestamp;
    RunId: core.RunId;
    StrategyId: core.StrategyId;
    ConfigHash: core.ConfigHash;
    Mode: core.Mode;
    Venue: core.Venue;
    Side: core.Side;
    OutcomeToken: core.OutcomeToken;
    // context
    RunContext: core.RunContext;
    EngineClock: core.EngineClock;
    // events
    EngineEvent: core.EngineEvent<unknown>;
    MarketEventType: core.MarketEventType;
    BaseMarketEvent: core.BaseMarketEvent;
    CandleEvent: core.CandleEvent;
    MarketEvent: core.MarketEvent;
    OrderBookEvent: core.OrderBookEvent;
    PnlEvent: core.PnlEvent;
    PnlSnapshot: core.PnlSnapshot;
    QuoteEvent: core.QuoteEvent;
    TradeEvent: core.TradeEvent;
    // intents
    StrategySignalMeta: core.StrategySignalMeta;
    OrderIntent: core.OrderIntent;
    OrderRequest: core.OrderRequest;
    OrderStatus: core.OrderStatus;
    OrderEvent: core.OrderEvent;
    FillStatus: core.FillStatus;
    FillEvent: core.FillEvent;
    // portfolio
    PositionState: core.PositionState;
    PortfolioState: core.PortfolioState;
    // strategy
    Logger: core.Logger;
    StrategyContext: core.StrategyContext;
    Strategy: core.Strategy;
    // adapter
    ExecutionAdapter: core.ExecutionAdapter;
    DataFeed: core.DataFeed;
    // risk
    RiskCheck: core.RiskCheck;
    RiskRule: core.RiskRule;
    RiskDecision: core.RiskDecision;
    KillSwitchState: core.KillSwitchState;
    RiskState: core.RiskState;
    RiskManager: core.RiskManager;
    // bus
    EventQueue: core.EventQueue;
    EventBus: core.EventBus;
    // order-manager
    OrderLineage: core.OrderLineage;
    OrderManager: core.OrderManager;
    // admin
    AdminCommand: core.AdminCommand;
    AdminCommandKind: core.AdminCommandKind;
    AdminResponse: core.AdminResponse;
    AdminService: core.AdminService;
    AdminTransport: core.AdminTransport;
  };
  // Use the type to prevent unused-locals lint from removing it.
  const _surface = null as unknown as Surface;
  void _surface;
  assert.ok(true);
});
