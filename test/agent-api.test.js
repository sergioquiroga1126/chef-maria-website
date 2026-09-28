import assert from "node:assert/strict";
import test from "node:test";
import { onRequestPost } from "../functions/api/leads/[id]/agent.js";

const key = "private-dashboard-key";

test("AI proposal keeps customer guest count and filters invented dishes", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      guestCount: 100,
      menuItems: ["Chicken Piccata", "Invented truffle dish"],
      pricePerGuest: 1,
      warnings: []
    }) } }]
  }), { status: 200 });

  try {
    const db = { prepare: () => ({ bind: () => ({ first: async () => ({
      id: 3, name: "Test Client", guest_count: "8 guests", service_type: "Private Chef",
      cuisine: "Italian", dietary_restrictions: "nut allergy"
    }) }) }) };
    const response = await onRequestPost({
      request: new Request("https://example.com/api/leads/3/agent", {
        method: "POST", headers: { Authorization: `Bearer ${key}` }
      }),
      env: { LEAD_MANAGER_KEY: key, DB: db, OPENAI_API_KEY: "test-only" },
      params: { id: "3" }
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.proposal.guestCount, 8);
    assert.equal(result.proposal.pricePerGuest, 65);
    assert.equal(result.proposal.menu, "Chicken Piccata");
    assert.match(result.warnings.join(" "), /removed/);
    assert.match(result.warnings.join(" "), /dietary restrictions/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
