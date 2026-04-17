/**
 * Public surface of @trade-arbiter/engine. Plan 2 exposes the Engine class
 * and the JSONL audit writer (used by Plan 3's CLI to write logs to disk).
 * Helpers like InMemoryEventQueue, DefaultRiskManager, DefaultOrderManager
 * are intentionally not re-exported — callers construct Engine with its
 * dependencies already wired.
 */
export { Engine, type EngineConfig } from './engine.js';
export { JsonlAuditWriter } from './audit-writer.js';
