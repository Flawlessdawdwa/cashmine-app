// Amounts are never JS numbers. An asset amount is a bigint of the smallest
// unit (10^-decimals), so all claim math is exact integer math.

export type ParseResult =
  | { ok: true; units: bigint }
  | { ok: false; error: string };

// The API's wire format: digits, optional dot + digits, no leading zeros.
const WIRE_FORMAT = /^(0|[1-9]\d*)(\.\d+)?$/;

/** Parse a user-typed or API amount into smallest units. Accepts "," as the decimal separator. */
export function parseAmount(input: string, decimals: number): ParseResult {
  const s = input.trim().replace(',', '.');
  if (s === '') return { ok: false, error: 'Enter an amount' };
  if (!WIRE_FORMAT.test(s)) return { ok: false, error: 'Enter a number like 0.5 or 12' };
  const [whole, frac = ''] = s.split('.');
  if (frac.length > decimals) {
    return { ok: false, error: `At most ${decimals} decimal places` };
  }
  const units = BigInt(whole + frac.padEnd(decimals, '0'));
  return { ok: true, units };
}

/** Parse an amount the API sent us; throws on malformed data instead of guessing. */
export function parseApiAmount(value: string, decimals: number): bigint {
  const r = parseAmount(value, decimals);
  if (!r.ok) throw new Error(`Malformed amount from API: "${value}"`);
  return r.units;
}

/** Format smallest units to the API's canonical string ("0.5", never "0.500000" or ".5"). */
export function formatUnits(units: bigint, decimals: number): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '');
}

export type ClaimRules = {
  decimals: number;
  minAmount: bigint;
  fee: bigint;
  available: bigint;
};

export type ClaimValidation =
  | { ok: true; amount: bigint; fee: bigint; receive: bigint }
  | { ok: false; error: string };

/** Validates against the API rules: min <= amount <= available, decimals, and receive > 0. */
export function validateClaim(input: string, rules: ClaimRules): ClaimValidation {
  const parsed = parseAmount(input, rules.decimals);
  if (!parsed.ok) return parsed;
  const amount = parsed.units;
  const fmt = (u: bigint) => formatUnits(u, rules.decimals);
  if (amount <= 0n) return { ok: false, error: 'Amount must be greater than 0' };
  if (amount < rules.minAmount) return { ok: false, error: `Minimum is ${fmt(rules.minAmount)}` };
  if (amount > rules.available) return { ok: false, error: `Only ${fmt(rules.available)} available` };
  const receive = amount - rules.fee;
  if (receive <= 0n) return { ok: false, error: `Amount must be more than the fee (${fmt(rules.fee)})` };
  return { ok: true, amount, fee: rules.fee, receive };
}

// ---- USD values ----
// Prices have an arbitrary number of decimals, so a USD value is an exact
// decimal (value / 10^scale). We sum exactly and round once, for display.

export type Decimal = { value: bigint; scale: number };

const PRICE_FORMAT = /^\d+(\.\d+)?$/;

export function parseDecimal(s: string): Decimal {
  if (!PRICE_FORMAT.test(s)) throw new Error(`Malformed decimal: "${s}"`);
  const [whole, frac = ''] = s.split('.');
  return { value: BigInt(whole + frac), scale: frac.length };
}

export function usdValue(units: bigint, decimals: number, usdPrice: string): Decimal {
  const price = parseDecimal(usdPrice);
  return { value: units * price.value, scale: decimals + price.scale };
}

export function addDecimals(values: Decimal[]): Decimal {
  const scale = Math.max(0, ...values.map((v) => v.scale));
  let sum = 0n;
  for (const v of values) sum += v.value * 10n ** BigInt(scale - v.scale);
  return { value: sum, scale };
}

/** Round half-up to cents and format as "$1,234.56". */
export function formatUsd(d: Decimal): string {
  const neg = d.value < 0n;
  let abs = neg ? -d.value : d.value;
  let cents: bigint;
  if (d.scale >= 2) {
    const div = 10n ** BigInt(d.scale - 2);
    cents = (abs + div / 2n) / div;
  } else {
    cents = abs * 10n ** BigInt(2 - d.scale);
  }
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (cents % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}$${whole}.${frac}`;
}
