/**
 * JsonlAuditWriter. Accepts AuditRecords and buffers LF-terminated stable
 * JSON lines. The engine's orchestrator calls `write()` on every bus event;
 * `flushToString()` returns the accumulated buffer and clears it. A file
 * sink (Plan 3's CLI) will wrap this to persist to disk.
 *
 * Validates `kind` against AUDIT_KINDS on every write — the core contract
 * allows any string at the type level because of the generic parameter,
 * but the engine's own audit stream is constrained to the union.
 */
import type { AuditRecord } from '@trade-arbiter/core';
import { AUDIT_KINDS } from '@trade-arbiter/core';
import { stableStringify } from './stable-json.js';

const VALID_KINDS = new Set<string>(AUDIT_KINDS);

export class JsonlAuditWriter {
  private buffer = '';

  write(record: AuditRecord): void {
    if (!VALID_KINDS.has(record.kind)) {
      throw new Error(`JsonlAuditWriter: invalid kind '${record.kind}'`);
    }
    this.buffer += stableStringify(record);
    this.buffer += '\n';
  }

  flushToString(): string {
    const out = this.buffer;
    this.buffer = '';
    return out;
  }
}
