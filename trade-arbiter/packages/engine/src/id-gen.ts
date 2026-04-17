/**
 * Mode-dependent ID factory. Backtest modes use a seeded monotonic counter
 * rendered as a 26-char ULID-shaped string. Paper/live modes throw until
 * Plan 5 (first real adapter) wires a real ULID implementation.
 *
 * See Plan 2 spec section "Determinism contract > ID generation in backtest
 * mode".
 */
import type { Mode } from '@trade-arbiter/core';

export interface IdGen {
  next(): string;
}

const ULID_LEN = 26;

export function createIdGen(mode: Mode): IdGen {
  if (mode === 'backtest_l1' || mode === 'backtest_l2') {
    let n = 0;
    return {
      next(): string {
        n += 1;
        return n.toString(10).padStart(ULID_LEN, '0');
      },
    };
  }
  return {
    next(): string {
      throw new Error(
        `createIdGen: real ULID generation for mode '${mode}' is not implemented in Plan 2; wired in Plan 5`,
      );
    },
  };
}
