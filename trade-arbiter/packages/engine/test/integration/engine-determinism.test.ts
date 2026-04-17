/**
 * Plan 2 acceptance gate. Build a fake DataFeed, fake Strategy, fake
 * ExecutionAdapter; push 10 MarketEvents through; verify:
 *   1. A deterministic sequence of bus events is emitted.
 *   2. Two runs with the same inputs produce byte-identical JSONL logs.
 *   3. PnlEvent fires on every FillEvent.
 *   4. PnlSnapshot fires at the configured interval.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type {
  DataFeed,
  ExecutionAdapter,
  FillEvent,
  MarketEvent,
  MarketEventType,
  OrderEvent,
  OrderIntent,
  OrderRequest,
  RunContext,
  Strategy,
  StrategyContext,
  Symbol,
} from '@trade-arbiter/core';
import { Engine } from '../../src/index.js';

const ctx: RunContext = {
  runId: '00000000000000000000000000',
  strategyId: 'pipeline-test',
  configHash: 'hash',
  mode: 'backtest_l1',
};

class FakeFeed implements DataFeed {
  readonly venue = 'hyperliquid';
  readonly mode = 'backtest_l1';
  private onEv: ((ev: MarketEvent) => void) | null = null;
  private readonly events: MarketEvent[];

  constructor(events: MarketEvent[]) {
    this.events = events;
  }

  subscribe(_symbols: Symbol[], _types: MarketEventType[]): void {}

  onEvent(cb: (ev: MarketEvent) => void): void {
    this.onEv = cb;
  }

  async start(): Promise<void> {
    for (const ev of this.events) {
      this.onEv?.(ev);
    }
  }

  async stop(): Promise<void> {}
}

class FakeAdapter implements ExecutionAdapter {
  readonly venue = 'hyperliquid';
  readonly mode = 'backtest_l1';
  private onF: ((f: FillEvent) => void) | null = null;
  private seq = 0;

  async connect(): Promise<void> {}

  async submit(req: OrderRequest): Promise<{ requestId: string }> {
    this.seq += 1;
    const fill: FillEvent = {
      fillId: `fake-fill-${this.seq}`,
      intentId: req.intentId,
      requestId: req.requestId,
      ctx: req.ctx,
      venue: req.venue,
      symbol: req.symbol,
      tsExchange: req.tsCreated + 1,
      tsReceived: req.tsCreated + 1,
      status: 'filled',
      filledSize: req.sizeApproved,
      remainingSize: 0,
      avgPrice: 100,
      feesPaid: 0,
    };
    this.onF?.(fill);
    return { requestId: req.requestId };
  }

  async cancel(): Promise<void> {}
  onFill(cb: (f: FillEvent) => void): void { this.onF = cb; }
  onOrderEvent(_cb: (oe: OrderEvent) => void): void {}
  async disconnect(): Promise<void> {}
}

function pipelineStrategy(openIdx: number, closeIdx: number): Strategy {
  let n = 0;
  let sctx: StrategyContext | null = null;
  return {
    id: 'pipeline-test',
    async init(c: StrategyContext): Promise<void> {
      sctx = c;
    },
    onMarketEvent(ev: MarketEvent): void {
      if (sctx === null) return;
      n += 1;
      if (n === openIdx) {
        const intent: OrderIntent = {
          intentId: 'open-1',
          ctx,
          tsCreated: ev.tsExchange,
          venue: 'hyperliquid',
          symbol: 'HYPE-PERP',
          side: 'buy',
          sizeRequested: 1,
          timeInForce: 'GTC',
          reason: 'open',
        };
        sctx.emit(intent);
      }
      if (n === closeIdx) {
        const intent: OrderIntent = {
          intentId: 'close-1',
          ctx,
          tsCreated: ev.tsExchange,
          venue: 'hyperliquid',
          symbol: 'HYPE-PERP',
          side: 'sell',
          sizeRequested: 1,
          timeInForce: 'GTC',
          reason: 'close',
        };
        sctx.emit(intent);
      }
    },
    onFillEvent(): void {
      // no-op; pipeline strategy doesn't react to fills
    },
    async shutdown(): Promise<void> {},
  };
}

function makeEvents(count: number): MarketEvent[] {
  const out: MarketEvent[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      type: 'quote',
      venue: 'hyperliquid',
      symbol: 'HYPE-PERP',
      tsExchange: (i + 1) * 10,
      tsReceived: (i + 1) * 10,
      bid: 100,
      ask: 100.1,
      bidSize: 10,
      askSize: 10,
    });
  }
  return out;
}

async function runOnce(): Promise<string> {
  const engine = new Engine({
    ctx,
    initialCash: 1000,
    currency: 'USDC',
    pnlSnapshotIntervalMs: 50,
    rules: [],
    feed: new FakeFeed(makeEvents(10)),
    strategy: pipelineStrategy(3, 7),
    adapter: new FakeAdapter(),
  });
  await engine.run();
  return engine.audit.flushToString();
}

test('Plan 2 acceptance: two runs produce byte-identical JSONL', async () => {
  const a = await runOnce();
  const b = await runOnce();
  assert.equal(a, b);
  assert.ok(a.length > 0);
});

test('Plan 2 acceptance: JSONL contains fills, pnls, and snapshots', async () => {
  const log = await runOnce();
  const lines = log.split('\n').filter((l) => l.length > 0);
  const kinds = lines.map((l) => (JSON.parse(l).kind as string));
  const count = (k: string) => kinds.filter((x) => x === k).length;
  assert.equal(count('fill'), 2, `expected 2 fills, got ${count('fill')}`);
  assert.equal(count('pnl'), 2, `expected 2 pnl events, got ${count('pnl')}`);
  assert.ok(count('snapshot') >= 1, `expected >=1 snapshot, got ${count('snapshot')}`);
});

test('Plan 2 acceptance: every market event appears in the audit log', async () => {
  const log = await runOnce();
  const lines = log.split('\n').filter((l) => l.length > 0);
  const markets = lines.filter((l) => JSON.parse(l).kind === 'market');
  assert.equal(markets.length, 10);
});
