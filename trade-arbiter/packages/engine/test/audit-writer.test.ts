/**
 * JsonlAuditWriter writes each AuditRecord as one LF-terminated line of
 * stable JSON. The write interface is synchronous; internally we buffer to
 * a string and expose flushToString() for tests.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AuditRecord } from '@trade-arbiter/core';
import { JsonlAuditWriter } from '../src/audit-writer.js';

test('write appends one line per record in call order', () => {
  const w = new JsonlAuditWriter();
  const a: AuditRecord = {
    eventId: '01',
    ts: 100,
    runId: 'RUN',
    kind: 'market',
    payload: { type: 'quote', b: 2, a: 1 },
  };
  const b: AuditRecord = {
    eventId: '02',
    ts: 200,
    runId: 'RUN',
    kind: 'fill',
    payload: { filledSize: 1 },
  };
  w.write(a);
  w.write(b);
  const out = w.flushToString();
  const lines = out.split('\n');
  assert.equal(lines.length, 3); // two records + trailing empty
  assert.equal(lines[2], '');
});

test('each line is parseable JSON with sorted keys', () => {
  const w = new JsonlAuditWriter();
  w.write({
    eventId: '01',
    ts: 1,
    runId: 'RUN',
    kind: 'pnl',
    payload: { z: 1, a: 2 },
  });
  const line = w.flushToString().split('\n')[0] ?? '';
  // Top-level keys alphabetized: eventId, kind, payload, runId, ts
  assert.ok(line.indexOf('"eventId"') < line.indexOf('"kind"'));
  assert.ok(line.indexOf('"kind"') < line.indexOf('"payload"'));
  assert.ok(line.indexOf('"payload"') < line.indexOf('"runId"'));
  assert.ok(line.indexOf('"runId"') < line.indexOf('"ts"'));
  // Inside payload, 'a' before 'z'.
  assert.ok(line.indexOf('"a":2') < line.indexOf('"z":1'));
});

test('numbers in payload use deterministic formatter', () => {
  const w = new JsonlAuditWriter();
  w.write({
    eventId: '01',
    ts: 1,
    runId: 'RUN',
    kind: 'pnl',
    payload: { x: 1.5, y: 42 },
  });
  const line = w.flushToString().split('\n')[0] ?? '';
  assert.ok(line.includes('"x":1.500000000000'));
  assert.ok(line.includes('"y":42'));
});

test('rejects unknown kind', () => {
  const w = new JsonlAuditWriter();
  assert.throws(
    () => w.write({
      eventId: '01',
      ts: 1,
      runId: 'RUN',
      kind: 'bogus' as 'market',
      payload: {},
    }),
    /kind/,
  );
});

test('flushToString resets the buffer', () => {
  const w = new JsonlAuditWriter();
  w.write({ eventId: '01', ts: 1, runId: 'RUN', kind: 'market', payload: {} });
  const first = w.flushToString();
  const second = w.flushToString();
  assert.ok(first.length > 0);
  assert.equal(second, '');
});
