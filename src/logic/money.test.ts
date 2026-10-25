import { describe, expect, it } from 'vitest';
import { centsToInput, formatEuro, formatSigned, parseEuro } from './money';

describe('money', () => {
  it('formatteert in Belgisch formaat', () => {
    expect(formatEuro(3000)).toBe('€ 30,00');
    expect(formatEuro(1250)).toBe('€ 12,50');
    expect(formatEuro(123456)).toBe('€ 1.234,56');
    expect(formatEuro(-7000)).toMatch(/^-\s?€ 70,00$|^€ -70,00$/);
    expect(formatSigned(7000)).toBe('+€ 70,00');
  });

  it('leest invoer zonder floats', () => {
    expect(parseEuro('30')).toBe(3000);
    expect(parseEuro('12,5')).toBe(1250);
    expect(parseEuro('12,50')).toBe(1250);
    expect(parseEuro('12.05')).toBe(1205);
    expect(parseEuro('€ 0,01')).toBe(1);
    expect(parseEuro('0,1')).toBe(10);
    expect(parseEuro('15,')).toBe(1500);
    expect(parseEuro('')).toBeNull();
    expect(parseEuro('abc')).toBeNull();
    expect(parseEuro('1,234')).toBeNull();
    expect(parseEuro('-5')).toBeNull();
  });

  it('zet centen terug naar invoertekst', () => {
    expect(centsToInput(3000)).toBe('30');
    expect(centsToInput(1250)).toBe('12,50');
    expect(centsToInput(5)).toBe('0,05');
  });
});
