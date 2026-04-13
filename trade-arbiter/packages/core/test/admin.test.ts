import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AdminCommand,
  AdminCommandKind,
  AdminResponse,
  AdminService,
  AdminTransport,
} from '../src/admin.js';

test('AdminCommand union has every v1 command kind', () => {
  const commands: AdminCommand[] = [
    { kind: 'health' },
    { kind: 'list_runs' },
    { kind: 'show_run', runId: 'r1' },
    { kind: 'pause_strategy', runId: 'r1', strategyId: 's1' },
    { kind: 'resume_strategy', runId: 'r1', strategyId: 's1' },
    { kind: 'kill', reason: 'manual' },
    { kind: 'reset_kill_switch', reason: 'investigated' },
    { kind: 'arm_live', runId: 'r1', strategyId: 's1', confirmation: 's1' },
    { kind: 'disarm_live', runId: 'r1', strategyId: 's1' },
  ];
  assert.equal(commands.length, 9);
});

test('AdminCommandKind is a string union derived from AdminCommand', () => {
  const kinds: AdminCommandKind[] = [
    'health',
    'list_runs',
    'show_run',
    'pause_strategy',
    'resume_strategy',
    'kill',
    'reset_kill_switch',
    'arm_live',
    'disarm_live',
  ];
  assert.equal(kinds.length, 9);
});

test('AdminResponse compile shape — success', () => {
  const res: AdminResponse<{ runs: number }> = {
    ok: true,
    ts: 0,
    data: { runs: 3 },
  };
  assert.equal(res.ok, true);
  assert.equal(res.data?.runs, 3);
});

test('AdminResponse compile shape — error', () => {
  const res: AdminResponse = {
    ok: false,
    ts: 0,
    error: { code: 'unknown_command', message: 'no such kind' },
  };
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, 'unknown_command');
});

test('AdminService interface implementable with handler stub', async () => {
  let started = false;
  const service: AdminService = {
    start: async () => { started = true; },
    stop: async () => { started = false; },
    handle: async (cmd) => {
      if (cmd.kind === 'health') {
        return { ok: true, ts: 0, data: { uptime_ms: 0 } };
      }
      return { ok: false, ts: 0, error: { code: 'not_implemented', message: cmd.kind } };
    },
  };
  await service.start();
  const health = await service.handle({ kind: 'health' });
  assert.equal(health.ok, true);
  const unknown = await service.handle({ kind: 'kill', reason: 'test' });
  assert.equal(unknown.ok, false);
  await service.stop();
  assert.equal(started, false);
});

test('AdminTransport interface implementable with stub', async () => {
  let bound: AdminService | null = null;
  const transport: AdminTransport = {
    bind: async (svc) => { bound = svc; },
    close: async () => { bound = null; },
  };
  const fakeSvc: AdminService = {
    start: async () => {},
    stop: async () => {},
    handle: async () => ({ ok: true, ts: 0 }),
  };
  await transport.bind(fakeSvc);
  assert.equal(bound, fakeSvc);
  await transport.close();
  assert.equal(bound, null);
});
