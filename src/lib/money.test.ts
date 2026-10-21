import { addDecimals, formatUnits, formatUsd, parseAmount, usdValue, validateClaim } from './money';

describe('parseAmount', () => {
  it('parses into smallest units', () => {
    expect(parseAmount('0.5', 6)).toEqual({ ok: true, units: 500000n });
    expect(parseAmount('12', 2)).toEqual({ ok: true, units: 1200n });
    expect(parseAmount('0.00000001', 8)).toEqual({ ok: true, units: 1n });
  });

  it('accepts a comma decimal separator and surrounding spaces', () => {
    expect(parseAmount(' 1,25 ', 2)).toEqual({ ok: true, units: 125n });
  });

  it('rejects formats the API rejects', () => {
    for (const bad of ['.5', '1.', '05', '1e-3', '-1', '1.2.3', 'abc', '']) {
      expect(parseAmount(bad, 8).ok).toBe(false);
    }
  });

  it('rejects more decimals than the asset allows', () => {
    expect(parseAmount('0.1234567', 6)).toEqual({ ok: false, error: 'At most 6 decimal places' });
  });

  it('handles values beyond float precision exactly', () => {
    const r = parseAmount('90071992547.40993123', 8);
    expect(r).toEqual({ ok: true, units: 9007199254740993123n });
  });
});

describe('formatUnits', () => {
  it('produces the canonical wire format', () => {
    expect(formatUnits(500000n, 6)).toBe('0.5');
    expect(formatUnits(1200n, 2)).toBe('12');
    expect(formatUnits(1n, 8)).toBe('0.00000001');
    expect(formatUnits(0n, 6)).toBe('0');
    expect(formatUnits(-981n, 2)).toBe('-9.81');
  });

  it('round-trips with parseAmount', () => {
    for (const s of ['0.5', '12', '820.413207', '0.000001']) {
      const r = parseAmount(s, 6);
      expect(r.ok && formatUnits(r.units, 6)).toBe(s);
    }
  });
});

describe('validateClaim', () => {
  // ETH-like: 18 decimals is common, use 8 here to keep numbers readable
  const rules = { decimals: 8, minAmount: 1000000n /* 0.01 */, fee: 120000n /* 0.0012 */, available: 50000000n /* 0.5 */ };

  it('computes fee and receive amount', () => {
    expect(validateClaim('0.5', rules)).toEqual({ ok: true, amount: 50000000n, fee: 120000n, receive: 49880000n });
  });

  it('accepts exactly the minimum and exactly available (Max)', () => {
    expect(validateClaim('0.01', rules).ok).toBe(true);
    expect(validateClaim(formatUnits(rules.available, 8), rules).ok).toBe(true);
  });

  it('rejects below minimum, above available and zero', () => {
    expect(validateClaim('0.0099', rules)).toEqual({ ok: false, error: 'Minimum is 0.01' });
    expect(validateClaim('0.50000001', rules)).toEqual({ ok: false, error: 'Only 0.5 available' });
    expect(validateClaim('0', rules)).toEqual({ ok: false, error: 'Amount must be greater than 0' });
  });

  it('rejects amounts that would not cover the fee', () => {
    const r = validateClaim('0.001', { ...rules, minAmount: 0n });
    expect(r.ok).toBe(false);
  });
});

describe('USD totals', () => {
  it('multiplies exactly and rounds half-up once at the end', () => {
    // 820.413207 USDT * 1.0002 = 820.5772896414
    expect(formatUsd(usdValue(820413207n, 6, '1.0002'))).toBe('$820.58');
  });

  it('sums mixed scales without float drift', () => {
    // 0.1 + 0.2 at different scales; floats would give 0.30000000000000004
    const sum = addDecimals([usdValue(10n, 2, '1'), usdValue(2000n, 4, '1')]);
    expect(formatUsd(sum)).toBe('$0.30');
    // three items of $0.005 each: rounding per item would give $0.03, exact sum is $0.015 -> $0.02
    const third = usdValue(5n, 3, '1');
    expect(formatUsd(addDecimals([third, third, third]))).toBe('$0.02');
  });

  it('formats thousands separators', () => {
    expect(formatUsd(usdValue(123456789n, 2, '1'))).toBe('$1,234,567.89');
  });
});
