import assert from "node:assert/strict";
import test from "node:test";
import { calculateElectricityTiers, decimalMilli, formatMilli, lineAmount, totalRoundedItems } from "./invoice-itemized.calculator.js";

const tiers = [
  { electricityTariffTierId: 1n, tierNo: 1, lowerKwh: "0.000", upperKwh: "10.000", unitPrice: 100n },
  { electricityTariffTierId: 2n, tierNo: 2, lowerKwh: "10.000", upperKwh: "20.000", unitPrice: 200n },
  { electricityTariffTierId: 3n, tierNo: 3, lowerKwh: "20.000", upperKwh: null, unitPrice: 300n },
];

test("decimal-safe quantity preserves three fractional digits and rejects malformed input", () => {
  assert.equal(decimalMilli("10.025"), 10025n);
  assert.equal(formatMilli(10025n), "10.025");
  assert.throws(() => decimalMilli("1.0000"));
});

test("electricity is progressively divided over tiers, including exact boundary and zero use", () => {
  const rows = calculateElectricityTiers("25.000", tiers);
  assert.deepEqual(rows.map(({ quantity, amount }) => [quantity, amount]), [["10.000", 1000n], ["10.000", 2000n], ["5.000", 1500n]]);
  assert.deepEqual(calculateElectricityTiers("10.000", tiers).map((row) => row.quantity), ["10.000", "0.000", "0.000"]);
  assert.deepEqual(calculateElectricityTiers("0", tiers).map((row) => row.amount), [0n, 0n, 0n]);
});

test("line amounts use VND half-up per line and total is sum of rounded lines", () => {
  assert.equal(lineAmount(500n, 1n), 1n);
  assert.equal(lineAmount(499n, 1n), 0n);
  assert.equal(totalRoundedItems([{ amount: 1n }, { amount: 1n }] as any), 2n);
});

test("malformed or gapped electricity tiers fail closed", () => {
  assert.throws(() => calculateElectricityTiers("5", []));
  assert.throws(() => calculateElectricityTiers("5", [tiers[0], { ...tiers[1], lowerKwh: "11.000" }, tiers[2]]));
  assert.throws(() => calculateElectricityTiers("5", [tiers[0], { ...tiers[1], unitPrice: -1n }, tiers[2]]));
});
