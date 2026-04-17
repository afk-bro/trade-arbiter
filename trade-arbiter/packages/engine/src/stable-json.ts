/**
 * Deterministic JSON serializer. Sorts object keys alphabetically at every
 * nesting level; delegates number formatting to the fixed-precision formatter.
 * No extraneous whitespace. `undefined` values are dropped from objects;
 * `undefined` in arrays serializes as `null` (parity with JSON.stringify).
 *
 * See Plan 2 spec section "Determinism contract > JSONL serialization".
 */
import { formatNumber } from './format-number.js';

export function stableStringify(value: unknown): string {
  return serialize(value);
}

function serialize(v: unknown): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'string':
      return JSON.stringify(v);
    case 'number':
      return formatNumber(v);
    case 'boolean':
      return v ? 'true' : 'false';
    case 'undefined':
      return 'null';
    case 'object':
      if (Array.isArray(v)) {
        const parts = v.map((el) => (el === undefined ? 'null' : serialize(el)));
        return `[${parts.join(',')}]`;
      }
      return serializeObject(v as Record<string, unknown>);
    default:
      throw new Error(`stableStringify: unsupported value type ${typeof v}`);
  }
}

function serializeObject(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k])}`);
  return `{${entries.join(',')}}`;
}
