const BOOKED_EVENT_CHECKLIST = Object.freeze([
  "Verify the event date, event time, and arrival schedule with Chef Maria.",
  "Confirm the guest count, location, service format, and access details.",
  "Review the final menu and all allergies or dietary restrictions.",
  "Confirm chef and server staffing and arrival times.",
  "Review the proposal, deposit, and remaining payment details."
]);

function clean(value) {
  return String(value || "").trim();
}

export function buildOfficeReplyDraft(lead = {}) {
  const name = clean(lead.name);
  const firstName = name ? name.split(/\s+/)[0] : "there";
  const eventDetails = [
    clean(lead.event_type) || "event",
    lead.event_date ? `on ${clean(lead.event_date)}` : "",
    lead.event_time ? `at ${clean(lead.event_time)}` : "",
    lead.guest_count ? `for ${clean(lead.guest_count)} guests` : "",
    lead.location ? `in ${clean(lead.location)}` : ""
  ].filter(Boolean).join(" ");
  const dietary = clean(lead.dietary_restrictions);
  const dietaryLine = dietary
    ? `I’ve noted the dietary information you shared: ${dietary}. We’ll review it with the menu.`
    : "Please let us know about any allergies or dietary restrictions.";
  const preferences = clean(lead.menu_preferences || lead.cuisine);
  const preferencesLine = preferences
    ? `I’ve also noted your menu preferences: ${preferences}.`
    : "If you have a cuisine or menu preference, feel free to share it.";

  return [
    `Hi ${firstName},`,
    "",
    `Thank you for reaching out to Chef Maria${eventDetails ? ` about your ${eventDetails} inquiry` : ""}. We’ve received your request and will review the details and availability. This is not yet a confirmed booking.`,
    "",
    preferencesLine,
    dietaryLine,
    "",
    "We’ll follow up after reviewing your request.",
    "",
    "Best,",
    "Chef Maria"
  ].join("\n");
}

export function buildBookedEventChecklist() {
  return [...BOOKED_EVENT_CHECKLIST];
}
