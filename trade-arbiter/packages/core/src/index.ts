/**
 * Public surface of @trade-arbiter/core. Every contract from Section 4 of
 * the design spec is re-exported from here. Other in-repo packages should
 * import only from this barrel, never from individual files.
 */
export * from './primitives.js';
export * from './context.js';
export * from './events.js';
export * from './intents.js';
export * from './portfolio.js';
export * from './strategy.js';
export * from './adapter.js';
export * from './risk.js';
export * from './bus.js';
export * from './order-manager.js';
export * from './admin.js';
