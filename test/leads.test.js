import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePriority,
  isLeadManagerAuthorized,
  nextActionForStatus,
  saveLead
} from "../functions/_shared/leads.js";

test("marks an event within seven days as urgent", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  assert.equal(calculatePriority("2026-09-25", "4", now), "urgent");
});

test("marks a large group as high priority", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  assert.equal(calculatePriority("2027-01-20", "16", now), "high");
});

test("keeps a future small event at normal priority", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  assert.equal(calculatePriority("2027-01-20", "8", now), "normal");
});

test("changes the recommended action with lead status", () => {
  assert.match(nextActionForStatus("new", "urgent"), /^Urgent:/);
  assert.equal(
    nextActionForStatus("proposal_sent", "normal"),
    "Follow up on the proposal."
  );
  assert.equal(nextActionForStatus("closed", "normal"), "No follow-up needed.");
});

test("requires the exact Lead Manager bearer key", async () => {
  const env = { LEAD_MANAGER_KEY: "correct-private-key" };
  const allowed = new Request("https://example.com/api/leads", {
    headers: { Authorization: "Bearer correct-private-key" }
  });
  const denied = new Request("https://example.com/api/leads", {
    headers: { Authorization: "Bearer incorrect-key" }
  });

  assert.equal(await isLeadManagerAuthorized(allowed, env), true);
  assert.equal(await isLeadManagerAuthorized(denied, env), false);
});

test("saves a normalized new lead without exposing database details", async () => {
  const captured = { sql: "", values: [] };
  const env = {
    DB: {
      prepare(sql) {
        captured.sql = sql;
        return {
          bind(...values) {
            captured.values = values;
            return {
              async run() {
                return { meta: { last_row_id: 42 } };
              }
            };
          }
        };
      }
    }
  };

  const result = await saveLead(env, {
    source: "chatbot",
    name: "Test Guest",
    email: "TEST@EXAMPLE.COM",
    eventDate: "2027-01-20",
    guestCount: "8",
    serviceType: "Private Chef",
    location: "Boca Raton"
  });

  assert.deepEqual(result, { stored: true, id: 42 });
  assert.match(captured.sql, /INSERT INTO leads/);
  assert.equal(captured.values[0], "chatbot");
  assert.equal(captured.values[5], "Test Guest");
  assert.equal(captured.values[6], "test@example.com");
  assert.equal(captured.values[4], "normal");
});
