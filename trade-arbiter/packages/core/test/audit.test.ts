/**
 * Compile-check tests for the audit record contract. Asserts the discriminator
 * list and the generic envelope shape.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AuditKind, AuditRecord } from '../src/audit.js';
import { AUDIT_KINDS } from '../src/audit.js';

test('AUDIT_KINDS contains every expected discriminator', () => {
  assert.deepEqual(AUDIT_KINDS, [
    'market',
    'intent',
    'decision',
    'request',
    'order',
    'fill',
    'pnl',
    'snapshot',
  ]);
});

test('AuditRecord compile shape — unconstrained payload', () => {
  const rec: AuditRecord = {
    eventId: '00000000000000000000000001',
    ts: 1_700_000_000_000,
    runId: '00000000000000000000000000',
    kind: 'market',
    payload: { anything: 'goes' },
  };
  void rec;
});

test('AuditRecord compile shape — narrowed kind + typed payload', () => {
  const rec: AuditRecord<'fill', { avgPrice: number }> = {
    eventId: '00000000000000000000000002',
    ts: 1_700_000_000_500,
    runId: '00000000000000000000000000',
    kind: 'fill',
    payload: { avgPrice: 100.5 },
  };
  void rec;
});

test('AuditKind union is exhaustive', () => {
  const all: AuditKind[] = [
    'market',
    'intent',
    'decision',
    'request',
    'order',
    'fill',
    'pnl',
    'snapshot',
  ];
  void all;
});
