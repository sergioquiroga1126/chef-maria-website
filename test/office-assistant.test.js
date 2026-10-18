import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBookedEventChecklist,
  buildOfficeReplyDraft
} from "../office-assistant.js";

test("reply draft uses provided inquiry details without claiming availability or booking", () => {
  const draft = buildOfficeReplyDraft({
    name: "Roxanna Stein",
    event_type: "Birthday dinner",
    event_date: "2026-10-29",
    event_time: "6:00 PM",
    guest_count: 8,
    location: "Lighthouse Point",
    cuisine: "Italian",
    dietary_restrictions: "No nuts"
  });

  assert.match(draft, /^Hi Roxanna,/);
  assert.match(draft, /Birthday dinner on 2026-10-29 at 6:00 PM for 8 guests in Lighthouse Point/);
  assert.match(draft, /No nuts/);
  assert.match(draft, /not yet a confirmed booking/);
  assert.doesNotMatch(draft, /we are available|your booking is confirmed/i);
});

test("reply draft handles missing client details without inventing them", () => {
  const draft = buildOfficeReplyDraft({});

  assert.match(draft, /^Hi there,/);
  assert.match(draft, /Please let us know about any allergies or dietary restrictions/);
  assert.doesNotMatch(draft, /undefined|null/);
});

test("booked event checklist is suggested and returned as a fresh list", () => {
  const first = buildBookedEventChecklist();
  const second = buildBookedEventChecklist();

  assert.equal(first.length, 5);
  assert.match(first[0], /event date/);
  assert.match(first[2], /dietary restrictions/);
  first.pop();
  assert.equal(second.length, 5);
});
