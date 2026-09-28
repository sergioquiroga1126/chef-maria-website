export const PROPOSAL_PRICING_GUIDANCE = {
  "Private Chef": {
    minimum: 65,
    maximum: 75,
    suggested: 65,
    description: "$65 per guest is the standard starting point; use $75 when the menu includes an appetizer and dessert."
  },
  "Full-Service Catering": {
    minimum: 55,
    maximum: null,
    suggested: 55,
    description: "Large-group food pricing typically starts near $55 per guest. Add service staff separately."
  },
  "Drop-off Catering": {
    minimum: 35,
    maximum: 50,
    suggested: 45,
    description: "Drop-off service typically ranges from $35 to $50 per guest, depending on the menu."
  },
  "Cooking Class": {
    minimum: null,
    maximum: null,
    suggested: null,
    description: "Enter a custom per-person rate after Chef Maria reviews the class format and menu."
  }
};

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function moneyToCents(value) {
  const number = finiteNumber(value, 0);

  if (number < 0 || number > 1_000_000) {
    throw new RangeError("Money values must be between 0 and 1,000,000.");
  }

  return Math.round(number * 100);
}

export function calculateProposalTotals(input = {}) {
  const guestCount = Math.trunc(finiteNumber(input.guestCount, 0));
  const serverCount = Math.trunc(finiteNumber(input.serverCount, 0));
  let serverHours = finiteNumber(input.serverHours, 0);

  if (guestCount < 1 || guestCount > 1000) {
    throw new RangeError("Guest count must be between 1 and 1000.");
  }

  if (serverCount < 0 || serverCount > 50) {
    throw new RangeError("Server count must be between 0 and 50.");
  }

  if (serverCount > 0) {
    serverHours = Math.max(4, serverHours);
  } else {
    serverHours = 0;
  }

  if (serverHours < 0 || serverHours > 24) {
    throw new RangeError("Server hours must be between 0 and 24.");
  }

  const pricePerGuestCents = moneyToCents(input.pricePerGuest);
  const serverHourlyRateCents = moneyToCents(input.serverHourlyRate);
  const additionalAmountCents = moneyToCents(input.additionalAmount);
  const foodSubtotalCents = guestCount * pricePerGuestCents;
  const staffingSubtotalCents = Math.round(
    serverCount * serverHours * serverHourlyRateCents
  );
  const totalCents =
    foodSubtotalCents + staffingSubtotalCents + additionalAmountCents;

  return {
    guestCount,
    pricePerGuestCents,
    foodSubtotalCents,
    serverCount,
    serverHours,
    serverHourlyRateCents,
    staffingSubtotalCents,
    additionalAmountCents,
    totalCents
  };
}

export function pricingGuidanceFor(serviceType) {
  return PROPOSAL_PRICING_GUIDANCE[serviceType] || {
    minimum: null,
    maximum: null,
    suggested: null,
    description: "Enter a custom rate after Chef Maria reviews the inquiry."
  };
}
