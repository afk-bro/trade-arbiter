/**
 * PnlSnapshotter emits a PnlSnapshot whenever the engine clock has advanced
 * past the previous snapshot time by at least `intervalMs`. Pure function
 * of (now, lastEmittedTs, interval) — no timers.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PortfolioUpdater } from '../src/portfolio-updater.js';
import { PnlSnapshotter } from '../src/pnl-snapshotter.js';

test('first tick after interval boundary emits a snapshot', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  const s = new PnlSnapshotter(pu, 'strat', 1000, 0);
  assert.equal(s.maybeEmit(500), null);
  const snap = s.maybeEmit(1000);
  assert.ok(snap !== null);
  assert.equal(snap?.type, 'pnl_snapshot');
});

test('repeated calls before next interval return null', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  const s = new PnlSnapshotter(pu, 'strat', 1000, 0);
  assert.ok(s.maybeEmit(1000) !== null);
  assert.equal(s.maybeEmit(1500), null);
  assert.ok(s.maybeEmit(2000) !== null);
});

test('snapshot carries empty positions initially', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  const s = new PnlSnapshotter(pu, 'strat', 1000, 0);
  const snap = s.maybeEmit(1000);
  assert.equal(snap?.positions.length, 0);
  assert.equal(snap?.realizedCumulative, 0);
  assert.equal(snap?.unrealizedTotal, 0);
});
