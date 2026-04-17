/**
 * Tests for stable JSON serialization. Every line of the JSONL audit log
 * uses this serializer; byte-identical replay depends on it.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { stableStringify } from '../src/stable-json.js';

test('object keys serialize in alphabetical order', () => {
  assert.equal(stableStringify({ z: 1, a: 2, m: 3 }), '{"a":2,"m":3,"z":1}');
});

test('nested object keys are sorted at every level', () => {
  assert.equal(stableStringify({ outer: { z: 1, a: 2 } }), '{"outer":{"a":2,"z":1}}');
});

test('arrays preserve order; array elements are recursively stabilized', () => {
  assert.equal(
    stableStringify([{ z: 1, a: 2 }, { b: 3 }]),
    '[{"a":2,"z":1},{"b":3}]',
  );
});

test('numbers use the deterministic formatter', () => {
  assert.equal(stableStringify({ x: 1.5 }), '{"x":1.500000000000}');
  assert.equal(stableStringify({ x: 42 }), '{"x":42}');
});

test('strings escape the standard JSON specials', () => {
  assert.equal(
    stableStringify({ s: 'hi "there"\n' }),
    '{"s":"hi \\"there\\"\\n"}',
  );
});

test('booleans and null', () => {
  assert.equal(
    stableStringify({ a: true, b: false, c: null }),
    '{"a":true,"b":false,"c":null}',
  );
});

test('undefined properties are dropped', () => {
  assert.equal(
    stableStringify({ a: 1, b: undefined, c: 3 }),
    '{"a":1,"c":3}',
  );
});

test('no whitespace around separators', () => {
  const out = stableStringify({ a: 1, b: [1, 2] });
  assert.equal(out.includes(' '), false);
  assert.equal(out.includes('\n'), false);
});
