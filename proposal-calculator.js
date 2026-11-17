export const PROPOSAL_PRICING_GUIDANCE = {
  "Private Chef": {
    minimum: 95,
    maximum: null,
    suggested: 95,
    description: "$95 per guest is the starting price. Veal, fish and seafood menus cost more, and Chef Maria sets that price herself. For more than 8 guests she brings a server at $30 an hour plus tip."
  },
  "Full-Service Catering": {
    minimum: null,
    maximum: null,
    suggested: null,
    description: "Catering pricing depends on what the customer orders. Chef Maria quotes it. Add service staff separately."
  },
  "Drop-off Catering": {
    minimum: null,
    maximum: null,
    suggested: null,
    description: "Drop-off pricing depends on what the customer orders. Chef Maria quotes it."
  },
  "Cooking Class": {
    minimum: null,
    maximum: null,
    suggested: null,
    description: "Chef Maria quotes a per-person rate after she reviews the class format and menu."
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

// Chef Maria's deposit note. The amount changes (usually $100, sometimes more),
// so the sentence carries a blank she fills in before sending.
export const DEPOSIT_NOTE_TEXT =
  "A deposit of $_ reserves your event and is non-refundable. The balance is due at the end of the event.";

// True while a blank amount such as $___ or [amount] is still in the text.
export function hasUnfilledPlaceholder(text) {
  // Catches "$_", "$___", "[amount]" and a leftover underscore beside a number such as "$200_" or "$_100".
  return /\$\s*_|\$\s*[\d,.]+\s*_|\[\s*amount\s*\]/i.test(String(text || ""));
}
