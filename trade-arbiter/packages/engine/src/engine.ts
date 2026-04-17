/**
 * Engine orchestrator. Constructor takes a DataFeed, Strategy,
 * ExecutionAdapter, and RiskRule list plus static config (cash, currency,
 * snapshot interval, run context). `run()` starts the feed and drains until
 * the feed stops.
 *
 * Event topic names: 'market', 'intent', 'decision', 'request', 'order',
 * 'fill', 'pnl', 'snapshot'. These match the AuditKind union so audit
 * records can be emitted 1:1 with bus events.
 *
 * Note: `PnlSnapshot.type` is 'pnl_snapshot' but its bus topic and
 * AuditKind are both 'snapshot'. A JSONL consumer doing
 * `record.kind === record.payload.type` will fail for snapshot records —
 * the payload discriminator and the routing key are decoupled by design.
 */
import type {
  DataFeed,
  EngineEvent,
  ExecutionAdapter,
  FillEvent,
  MarketEvent,
  OrderEvent,
  OrderIntent,
  OrderRequest,
  PnlSnapshot,
  RiskRule,
  RiskState,
  RunContext,
  Strategy,
  StrategyContext,
  Timestamp,
} from '@trade-arbiter/core';
import { BacktestClock } from './backtest-clock.js';
import { InMemoryEventBus } from './event-bus.js';
import { InMemoryEventQueue } from './event-queue.js';
import { createIdGen, type IdGen } from './id-gen.js';
import { DefaultOrderManager } from './order-manager.js';
import { DefaultRiskManager } from './risk-manager.js';
import { PortfolioUpdater } from './portfolio-updater.js';
import { PnlSnapshotter } from './pnl-snapshotter.js';
import { JsonlAuditWriter } from './audit-writer.js';

export interface EngineConfig {
  readonly ctx: RunContext;
  readonly initialCash: number;
  readonly currency: string;
  readonly pnlSnapshotIntervalMs: number;
  readonly rules: ReadonlyArray<RiskRule>;
  readonly feed: DataFeed;
  readonly strategy: Strategy;
  readonly adapter: ExecutionAdapter;
}

export class Engine {
  private readonly queue = new InMemoryEventQueue();
  private readonly bus: InMemoryEventBus;
  private readonly clock: BacktestClock;
  private readonly ids: IdGen;
  private readonly orders = new DefaultOrderManager();
  private readonly portfolio: PortfolioUpdater;
  private readonly risk: DefaultRiskManager;
  private readonly snapshotter: PnlSnapshotter;
  /**
   * Accumulates AuditRecord lines during run(). Call `flushToString()` after
   * `run()` resolves. Calling it mid-run returns the buffer so far and resets
   * it; subsequent writes continue into the fresh buffer, so any later flush
   * will not include records from before the mid-run call.
   */
  readonly audit = new JsonlAuditWriter();
  private done = false;

  constructor(private readonly cfg: EngineConfig) {
    this.bus = new InMemoryEventBus(this.queue);
    this.clock = new BacktestClock(cfg.ctx.mode, 0);
    this.ids = createIdGen(cfg.ctx.mode);
    this.portfolio = new PortfolioUpdater(cfg.initialCash, cfg.currency);
    const riskState: RiskState = {
      killSwitch: { active: false, triggeredBy: null, reason: '', triggeredAt: null },
      dayStartTs: 0,
      realizedPnlToday: 0,
      consecutiveLosses: 0,
      circuitBreakerTrippedAt: null,
      strategyExposureUsd: new Map(),
      venueExposureUsd: new Map(),
    };
    this.risk = new DefaultRiskManager(cfg.rules, riskState, this.ids, () => this.clock.now());
    this.snapshotter = new PnlSnapshotter(this.portfolio, cfg.ctx.strategyId, cfg.pnlSnapshotIntervalMs, 0);

    this.wire();
  }

  private wire(): void {
    // Market events: update clock, update portfolio mark, forward to strategy.
    this.bus.subscribe<MarketEvent>('market', (ev) => {
      this.clock.advance(ev.payload.tsExchange);
      const mark = this.deriveMark(ev.payload);
      if (mark !== null) {
        this.portfolio.updateMark(`${ev.payload.venue}:${ev.payload.symbol}:`, mark);
      }
      this.cfg.strategy.onMarketEvent(ev.payload);
      this.audit.write({ eventId: ev.eventId, ts: ev.ts, runId: ev.ctx.runId, kind: 'market', payload: ev.payload });
      this.maybeEmitSnapshot();
    });

    // Intents: approve via risk; on approve, create OrderRequest and submit.
    this.bus.subscribe<OrderIntent>('intent', async (ev) => {
      const decision = this.risk.check(ev.payload, this.snapshotPortfolio());
      this.publish('decision', decision, decision.ts);
      this.audit.write({ eventId: this.ids.next(), ts: decision.ts, runId: ev.ctx.runId, kind: 'decision', payload: decision });
      if (!decision.approved) return;
      const request: OrderRequest = {
        ...ev.payload,
        requestId: this.ids.next(),
        sizeApproved: decision.sizeApproved,
        riskDecisionId: decision.decisionId,
      };
      this.orders.onIntent(ev.payload, request);
      this.publish('request', request, this.clock.now());
      this.audit.write({ eventId: request.requestId, ts: this.clock.now(), runId: ev.ctx.runId, kind: 'request', payload: request });
      await this.cfg.adapter.submit(request);
    });

    // Fills: update portfolio + orders, emit PnlEvent, forward to strategy.
    this.bus.subscribe<FillEvent>('fill', (ev) => {
      const request = this.findRequest(ev.payload.requestId);
      const side = request?.side ?? 'buy';
      this.orders.onFill(ev.payload);
      const pnl = this.portfolio.onFillDirected(ev.payload, side);
      this.cfg.strategy.onFillEvent(ev.payload);
      this.audit.write({ eventId: ev.payload.fillId, ts: ev.payload.tsExchange, runId: ev.ctx.runId, kind: 'fill', payload: ev.payload });
      this.publish('pnl', pnl, ev.payload.tsExchange);
      this.audit.write({ eventId: this.ids.next(), ts: ev.payload.tsExchange, runId: ev.ctx.runId, kind: 'pnl', payload: pnl });
      this.maybeEmitSnapshot();
    });

    // Order lifecycle events.
    this.bus.subscribe<OrderEvent>('order', (ev) => {
      this.orders.onOrderEvent(ev.payload);
      this.cfg.strategy.onOrderEvent?.(ev.payload);
      this.audit.write({ eventId: this.ids.next(), ts: ev.payload.ts, runId: ev.ctx.runId, kind: 'order', payload: ev.payload });
    });

    // Feed → bus.
    this.cfg.feed.onEvent((ev) => {
      this.publish<MarketEvent>('market', ev, ev.tsExchange);
    });
    // Adapter → bus.
    this.cfg.adapter.onFill((fill) => {
      this.publish<FillEvent>('fill', fill, fill.tsExchange);
    });
    this.cfg.adapter.onOrderEvent((oev) => {
      this.publish<OrderEvent>('order', oev, oev.ts);
    });
  }

  private buildStrategyContext(): StrategyContext {
    return {
      clock: this.clock,
      ctx: this.cfg.ctx,
      portfolio: () => this.snapshotPortfolio(),
      config: undefined,
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      emit: (intent: OrderIntent) => {
        this.publish<OrderIntent>('intent', intent, intent.tsCreated);
        this.audit.write({ eventId: intent.intentId, ts: intent.tsCreated, runId: intent.ctx.runId, kind: 'intent', payload: intent });
      },
    };
  }

  private snapshotPortfolio() {
    const p = this.portfolio.getPortfolio(this.clock.now());
    return { ...p, ctx: this.cfg.ctx };
  }

  private publish<T>(type: string, payload: T, ts: Timestamp): void {
    const ev: EngineEvent<T> = {
      eventId: this.ids.next(),
      ctx: this.cfg.ctx,
      ts,
      payload,
    };
    this.bus.publish(type, ev);
  }

  private findRequest(requestId: string): OrderRequest | undefined {
    return this.orders.getOpenOrders().find((r) => r.requestId === requestId);
  }

  private deriveMark(ev: MarketEvent): number | null {
    if (ev.type === 'quote') return (ev.bid + ev.ask) / 2;
    if (ev.type === 'trade') return ev.price;
    if (ev.type === 'candle') return ev.c;
    return null;
  }

  private maybeEmitSnapshot(): void {
    const snap = this.snapshotter.maybeEmit(this.clock.now());
    if (snap === null) return;
    this.publish<PnlSnapshot>('snapshot', snap, this.clock.now());
    this.audit.write({ eventId: this.ids.next(), ts: this.clock.now(), runId: this.cfg.ctx.runId, kind: 'snapshot', payload: snap });
  }

  async run(): Promise<void> {
    if (this.done) throw new Error('Engine already ran; construct a new instance');
    await this.cfg.strategy.init(this.buildStrategyContext());
    await this.cfg.adapter.connect();
    await this.cfg.feed.start();
    await this.queue.run();
    await this.cfg.feed.stop();
    await this.cfg.adapter.disconnect();
    await this.cfg.strategy.shutdown();
    this.done = true;
  }
}
