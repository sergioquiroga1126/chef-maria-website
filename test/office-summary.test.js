import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOfficeSummary,
  onRequestGet as getOfficeSummary,
  onRequestPost as postOfficeSummary
} from "../functions/api/leads/office-summary.js";

const key = "private-dashboard-key";
const fixedNow = new Date("2026-10-17T13:00:00.000Z");

function authorizedRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${key}`);
  return new Request(url, { ...options, headers });
}

test("office brief prioritizes new inquiries, overdue follow-ups, and booked events", () => {
  const summary = buildOfficeSummary([
    {
      id: 1, name: "New Client", status: "new", priority: "urgent",
      event_date: "2026-10-25", follow_up_at: "2026-10-16"
    },
    {
      id: 2, name: "Booked Client", status: "booked", priority: "high",
      event_date: "2026-10-20", event_time: "7:00 PM", guest_count: "8",
      service_type: "Private Chef", location: "Boca Raton", follow_up_at: ""
    },
    {
      id: 3, name: "Needs Details", status: "booked", priority: "normal",
      event_date: "", event_time: "", guest_count: "", service_type: "",
      location: "", follow_up_at: ""
    },
    { id: 4, name: "Closed Client", status: "closed", follow_up_at: "2026-10-10" }
  ], fixedNow);

  assert.equal(summary.ok, true);
  assert.equal(summary.mode, "read_only");
  assert.equal(summary.businessDate, "2026-10-17");
  assert.deepEqual(summary.counts, {
    newInquiries: 1,
    overdueFollowUps: 1,
    followUpsDueToday: 0,
    upcomingBookedEvents: 2
  });
  assert.equal(summary.tasks.some((task) => task.clientName === "Closed Client"), false);
  assert.match(summary.tasks.find((task) => task.type === "event_prep" && task.leadId === 3).detail, /event date, event time, guest count, location, service type/);
  assert.equal(summary.tasks.find((task) => task.type === "event_prep" && task.leadId === 2).checklist.length, 5);
  assert.equal(summary.tasks[0].clientName, "New Client");
});

test("office brief endpoint requires the lead-manager key and only reads data", async () => {
  let selected = false;
  let wroteData = false;
  const database = {
    prepare(sql) {
      assert.match(sql, /^\s*SELECT/i);
      selected = true;
      return {
        async all() {
          return { results: [{ id: 1, name: "Test Client", status: "new", priority: "normal", follow_up_at: "" }] };
        },
        async run() {
          wroteData = true;
        }
      };
    }
  };

  const unauthorized = await getOfficeSummary({
    request: new Request("https://example.com/api/leads/office-summary"),
    env: { LEAD_MANAGER_KEY: key, DB: database }
  });
  assert.equal(unauthorized.status, 401);

  const response = await getOfficeSummary({
    request: authorizedRequest("https://example.com/api/leads/office-summary"),
    env: { LEAD_MANAGER_KEY: key, DB: database }
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.mode, "read_only");
  assert.equal(data.tasks[0].clientName, "Test Client");
  assert.equal(selected, true);
  assert.equal(wroteData, false);
});

test("office brief endpoint rejects writes", async () => {
  const response = await postOfficeSummary();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET");
});


test("office brief excludes past events even when follow-up is overdue", () => {
  const summary = buildOfficeSummary([
    { id: 10, name: "Past Event Client", status: "new", priority: "urgent", event_date: "2026-10-10", follow_up_at: "2026-10-11" },
    { id: 11, name: "Future Event Client", status: "new", priority: "normal", event_date: "2026-10-25", follow_up_at: "" }
  ], fixedNow);

  assert.equal(summary.tasks.some((task) => task.clientName === "Past Event Client"), false);
  assert.equal(summary.tasks.some((task) => task.clientName === "Future Event Client"), true);
});


test("office brief excludes past events written with month names", () => {
  const summary = buildOfficeSummary([
    { id: 12, name: "Named Past Event", status: "new", priority: "urgent", event_date: "October 10, 2026", follow_up_at: "2026-10-19" }
  ], fixedNow);

  assert.equal(summary.tasks.some((task) => task.clientName === "Named Past Event"), false);
});
