import { describe, expect, it } from 'vitest';

/**
 * v1's password hash, reproduced exactly.
 *
 * This is not used by the application — nothing in `src/` hashes anything any
 * more. It exists so that the plpgsql reimplementation in
 * `supabase/migrations/0001_secure_entries.sql` has something to be checked
 * against, because if the two disagree by one bit then every one of the 304
 * people with an entry is locked out of it the moment that migration runs.
 *
 * The fiddly part is that JavaScript's `<<` and `^` coerce to signed 32-bit
 * while `+` does not, so `(h<<5)+h` can exceed 32 bits before the XOR
 * truncates it again. A "simplification" to `h * 33 ^ c` gives different
 * answers, and would have been an easy and catastrophic mistake.
 */
function legacyHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString();
}

/**
 * The same algorithm written the way the SQL writes it — explicit 32-bit
 * truncation at each step rather than relying on the language's operators.
 * If this matches `legacyHash`, the SQL's approach is sound.
 */
function sqlShapedHash(input: string): string {
  const toInt32 = (n: bigint): bigint => {
    let masked = n & 0xffffffffn;
    if (masked >= 0x80000000n) masked -= 0x100000000n;
    return masked;
  };

  let h = 5381n;
  for (let i = 0; i < input.length; i++) {
    const code = BigInt(input.charCodeAt(i));
    const shifted = toInt32(h * 32n);
    const summed = toInt32(shifted + h);
    h = toInt32(summed ^ code);
  }
  if (h < 0n) h += 0x100000000n;
  return h.toString();
}

/**
 * Verified against the live database on 2026-08-01 by defining the migration's
 * `legacy_djb2` body as a temporary function and comparing outputs. All eight
 * matched, including both non-ASCII cases. The probe was dropped afterwards.
 */
const VECTORS: ReadonlyArray<readonly [string, string]> = [
  ['heimao-admin-2025', '2964268968'],
  ['', '5381'],
  ['a', '177604'],
  ['password', '1569157018'],
  ['Kada', '2089133898'],
  ['Miqo’te', '1002097431'],
  ['hello world 123', '3464928149'],
  ['日本語', '200550002'],
];

describe('legacy djb2', () => {
  it('matches the values the database produces', () => {
    for (const [input, expected] of VECTORS) {
      expect(legacyHash(input), JSON.stringify(input)).toBe(expected);
    }
  });

  it('agrees with the explicitly-truncated form the SQL uses', () => {
    for (const [input] of VECTORS) {
      expect(sqlShapedHash(input), JSON.stringify(input)).toBe(legacyHash(input));
    }
    // And over a wide spread of generated input, where an off-by-one in the
    // 32-bit handling would eventually show up.
    for (let i = 0; i < 2000; i++) {
      const sample = `pw-${i}-${'x'.repeat(i % 37)}-${String.fromCharCode(32 + (i % 90))}`;
      expect(sqlShapedHash(sample), sample).toBe(legacyHash(sample));
    }
  });

  it('always lands inside the unsigned 32-bit range', () => {
    // Which is the whole problem: 4.29 billion possible outputs, unsalted.
    for (let i = 0; i < 500; i++) {
      const value = Number(legacyHash(`sample-${i}`));
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });

  it('is trivially collidable, which is why it is being retired', () => {
    /**
     * Found in seconds by hashing random strings until two agreed. An
     * attacker never needed anyone's real password — any string with the
     * same 32-bit output authenticated exactly as well, and v1 compared the
     * hash in the browser where the target was already visible.
     *
     * Both members of the first two pairs are four characters long.
     */
    const collisions: ReadonlyArray<readonly [string, string]> = [
      ['i2Xm', 'nT9m'],
      ['AlLv', 'AmlW'],
      ['Wne6', '2ZyMKFLfda4'],
    ];

    for (const [left, right] of collisions) {
      expect(left).not.toBe(right);
      expect(legacyHash(left), `${left} vs ${right}`).toBe(legacyHash(right));
    }
  });
});
