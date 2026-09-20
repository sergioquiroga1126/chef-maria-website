import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateProposalTotals,
  moneyToCents,
  pricingGuidanceFor
} from "../proposal-calculator.js";

test("calculates food, staffing, additional charges, and the proposal total", () => {
  const totals = calculateProposalTotals({
    guestCount: 20,
    pricePerGuest: 55,
    serverCount: 2,
    serverHours: 5,
    serverHourlyRate: 40,
    additionalAmount: 75
  });

  assert.equal(totals.foodSubtotalCents, 110_000);
  assert.equal(totals.staffingSubtotalCents, 40_000);
  assert.equal(totals.additionalAmountCents, 7_500);
  assert.equal(totals.totalCents, 157_500);
});

test("enforces the four-hour minimum when a server is included", () => {
  const totals = calculateProposalTotals({
    guestCount: 12,
    pricePerGuest: 55,
    serverCount: 1,
    serverHours: 2,
    serverHourlyRate: 40
  });

  assert.equal(totals.serverHours, 4);
  assert.equal(totals.staffingSubtotalCents, 16_000);
});

test("rejects invalid guest and money values", () => {
  assert.throws(
    () => calculateProposalTotals({ guestCount: 0, pricePerGuest: 65 }),
    /Guest count/
  );
  assert.throws(() => moneyToCents(-1), /Money values/);
});

test("returns Chef Maria's configured pricing guidance", () => {
  assert.equal(pricingGuidanceFor("Private Chef").suggested, 65);
  assert.equal(pricingGuidanceFor("Full-Service Catering").suggested, 55);
  assert.deepEqual(
    [
      pricingGuidanceFor("Drop-off Catering").minimum,
      pricingGuidanceFor("Drop-off Catering").maximum
    ],
    [35, 50]
  );
});
