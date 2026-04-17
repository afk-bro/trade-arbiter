/**
 * Deterministic number → string conversion for the JSONL audit log.
 * Integers render without a decimal point. Floats render with exactly 12
 * decimal places and no exponent. Negative zero collapses to positive
 * zero. NaN/Infinity throw — they have no place in a deterministic audit
 * stream.
 *
 * See Plan 2 spec section "Determinism contract > Floating-point formatting".
 */
const DECIMAL_DIGITS = 12;

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`formatNumber requires a finite value; got ${n}`);
  }
  if (Object.is(n, -0)) {
    return '0';
  }
  if (Number.isInteger(n)) {
    return n.toString(10);
  }
  return n.toFixed(DECIMAL_DIGITS);
}
