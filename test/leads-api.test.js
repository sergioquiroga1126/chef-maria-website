import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet as listLeads } from "../functions/api/leads.js";
import { onRequestPatch as updateLead } from "../functions/api/leads/[id].js";

const key = "private-dashboard-key";

function authorizedRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${key}`);

  return new Request(url, { ...options, headers });
}

test("rejects lead-list requests without the private key", async () => {
  const response = await listLeads({
    request: new Request("https://example.com/api/leads"),
    env: { LEAD_MANAGER_KEY: key }
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).ok, false);
});

test("returns protected lead data and summary counts", async () => {
  const lead = {
    id: 1,
    name: "Test Guest",
    status: "new",
    priority: "normal"
  };

  const database = {
    prepare(sql) {
      if (/COUNT\(\*\)/.test(sql)) {
        return {
          async first() {
            return {
              total: 1,
              new_count: 1,
              priority_count: 0,
              proposal_count: 0,
              booked_count: 0
            };
          }
        };
      }

      return {
        bind() {
          return {
            async all() {
              return { results: [lead] };
            }
          };
        }
      };
    }
  };

  const response = await listLeads({
    request: authorizedRequest("https://example.com/api/leads"),
    env: { LEAD_MANAGER_KEY: key, DB: database }
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.leads[0].name, "Test Guest");
  assert.equal(data.counts.new, 1);
});

test("updates only the allowed lead-management fields", async () => {
  let updatedValues = [];

  const database = {
    prepare(sql) {
      if (/SELECT id, status/.test(sql)) {
        return {
          bind() {
            return {
              async first() {
                return {
                  id: 3,
                  status: "new",
                  priority: "high",
                  notes: "",
                  follow_up_at: "2026-09-20"
                };
              }
            };
          }
        };
      }

      if (/UPDATE leads/.test(sql)) {
        return {
          bind(...values) {
            updatedValues = values;
            return {
              async run() {
                return { success: true };
              }
            };
          }
        };
      }

      return {
        bind() {
          return {
            async first() {
              return {
                id: 3,
                status: "contacted",
                notes: "Called the client"
              };
            }
          };
        }
      };
    }
  };

  const response = await updateLead({
    request: authorizedRequest("https://example.com/api/leads/3", {
      method: "PATCH",
      body: JSON.stringify({
        status: "contacted",
        followUpAt: "2026-09-22",
        notes: "Called the client",
        priority: "urgent"
      })
    }),
    env: { LEAD_MANAGER_KEY: key, DB: database },
    params: { id: "3" }
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.lead.status, "contacted");
  assert.equal(updatedValues[0], "contacted");
  assert.equal(updatedValues[1], "Called the client");
  assert.equal(updatedValues[2], "2026-09-22");
  assert.match(updatedValues[3], /Prepare the menu/);
  assert.equal(updatedValues.at(-1), 3);
});
