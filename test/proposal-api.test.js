import assert from "node:assert/strict";
import test from "node:test";

import {
  onRequestGet as getProposal,
  onRequestPut as saveProposal
} from "../functions/api/leads/[id]/proposal.js";

const key = "private-dashboard-key";

function authorizedRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${key}`);
  return new Request(url, { ...options, headers });
}

test("rejects proposal requests without the private Lead Manager key", async () => {
  const response = await getProposal({
    request: new Request("https://example.com/api/leads/1/proposal"),
    env: { LEAD_MANAGER_KEY: key },
    params: { id: "1" }
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).ok, false);
});

test("loads a lead and its private draft proposal", async () => {
  const database = {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (/FROM leads/.test(sql)) {
                return { id: 7, name: "Test Client" };
              }

              return {
                id: 2,
                lead_id: 7,
                created_at: "2026-09-20T18:00:00.000Z",
                updated_at: "2026-09-20T18:10:00.000Z",
                status: "draft",
                title: "Dinner Proposal",
                guest_count: 8,
                price_per_guest_cents: 6500,
                food_subtotal_cents: 52000,
                server_count: 0,
                server_hours: 0,
                server_hourly_rate_cents: 4000,
                staffing_subtotal_cents: 0,
                additional_label: "",
                additional_amount_cents: 0,
                total_cents: 52000,
                menu: "Italian dinner",
                client_notes: "Draft",
                internal_notes: "Private"
              };
            }
          };
        }
      };
    }
  };

  const response = await getProposal({
    request: authorizedRequest("https://example.com/api/leads/7/proposal"),
    env: { LEAD_MANAGER_KEY: key, DB: database },
    params: { id: "7" }
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.lead.name, "Test Client");
  assert.equal(data.proposal.total, 520);
  assert.equal(data.proposal.internalNotes, "Private");
});

test("recalculates totals on the server and saves the proposal as a draft", async () => {
  let insertedValues = [];
  let insertSql = "";

  const database = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (/FROM leads/.test(sql)) {
                return { id: 9, name: "Proposal Client" };
              }

              if (/FROM proposals/.test(sql)) {
                return {
                  id: 4,
                  lead_id: 9,
                  created_at: "2026-09-20T18:00:00.000Z",
                  updated_at: "2026-09-20T18:20:00.000Z",
                  status: "draft",
                  title: "Catering Proposal",
                  guest_count: 20,
                  price_per_guest_cents: 5500,
                  food_subtotal_cents: 110000,
                  server_count: 1,
                  server_hours: 4,
                  server_hourly_rate_cents: 4000,
                  staffing_subtotal_cents: 16000,
                  additional_label: "Travel",
                  additional_amount_cents: 5000,
                  total_cents: 131000,
                  menu: "Buffet",
                  client_notes: "Review",
                  internal_notes: "Private"
                };
              }

              return null;
            },
            async run() {
              if (/INSERT INTO proposals/.test(sql)) {
                insertSql = sql;
                insertedValues = values;
              }
              return { success: true };
            }
          };
        }
      };
    }
  };

  const response = await saveProposal({
    request: authorizedRequest("https://example.com/api/leads/9/proposal", {
      method: "PUT",
      body: JSON.stringify({
        title: "Catering Proposal",
        guestCount: 20,
        pricePerGuest: 55,
        serverCount: 1,
        serverHours: 2,
        serverHourlyRate: 40,
        additionalLabel: "Travel",
        additionalAmount: 50,
        total: 1,
        menu: "Buffet",
        clientNotes: "Review",
        internalNotes: "Private"
      })
    }),
    env: { LEAD_MANAGER_KEY: key, DB: database },
    params: { id: "9" }
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.proposal.total, 1310);
  assert.match(insertSql, /status = 'draft'/);
  assert.equal(insertedValues[6], 110000);
  assert.equal(insertedValues[8], 4);
  assert.equal(insertedValues[10], 16000);
  assert.equal(insertedValues[13], 131000);
});
