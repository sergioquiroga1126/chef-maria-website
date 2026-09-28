import { onRequestPost as generateProposal } from "../api/leads/[id]/agent.js";
import { calculateProposalTotals } from "../../proposal-calculator.js";

/**
 * Generate and save a draft for a newly received lead.
 * Never overwrite an existing proposal or send customer emails.
 */
export async function processNewLead(env, leadId) {
  if (!env.DB || !env.OPENAI_API_KEY || !env.LEAD_MANAGER_KEY) {
    console.warn("Automatic proposal processing is not configured.");
    return;
  }

  try {
    // Never replace a proposal that already exists.
    const existing = await env.DB.prepare(
      "SELECT id FROM proposals WHERE lead_id = ?"
    ).bind(leadId).first();

    if (existing) return;

    // Reuse our existing AI generator and its business rules.
    const request = new Request(
      "https://internal.example/api/leads/" + leadId + "/agent",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.LEAD_MANAGER_KEY}`
        }
      }
    );

    const response = await generateProposal({
      request,
      env,
      params: { id: String(leadId) }
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "AI generation failed.");
    }

    const lead = await env.DB.prepare(
      "SELECT * FROM leads WHERE id = ?"
    ).bind(leadId).first();

    if (!lead) return;

    const proposal = result.proposal;

    // The customer's recorded guest count is authoritative.
    proposal.guestCount = Number(lead.guest_count);

    const totals = calculateProposalTotals(proposal);

    const reviewNotes = [
      proposal.internalNotes,
      ...(result.warnings || []).map(item => `WARNING: ${item}`),
      ...(result.missingInformation || []).map(
        item => `MISSING: ${item}`
      )
    ].filter(Boolean).join("\n");

    const now = new Date().toISOString();

    // INSERT OR IGNORE protects proposals created while AI was running.
    const saved = await env.DB.prepare(`
      INSERT OR IGNORE INTO proposals (
        lead_id, created_at, updated_at, status, title,
        guest_count, price_per_guest_cents, food_subtotal_cents,
        server_count, server_hours, server_hourly_rate_cents,
        staffing_subtotal_cents, additional_label,
        additional_amount_cents, total_cents, menu,
        client_notes, internal_notes
      ) VALUES (
        ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).bind(
      leadId,
      now,
      now,
      proposal.title,
      totals.guestCount,
      totals.pricePerGuestCents,
      totals.foodSubtotalCents,
      totals.serverCount,
      totals.serverHours,
      totals.serverHourlyRateCents,
      totals.staffingSubtotalCents,
      proposal.additionalLabel || "",
      totals.additionalAmountCents,
      totals.totalCents,
      proposal.menu || "",
      proposal.clientNotes || "",
      reviewNotes
    ).run();

    if (saved.meta?.changes === 1) {
      await env.DB.prepare(`
        UPDATE leads
        SET next_action = ?, updated_at = ?
        WHERE id = ? AND status = 'new'
      `).bind(
        "Review the automatically generated proposal draft.",
        now,
        leadId
      ).run();
    }

    console.log("Automatic proposal processing completed:", leadId);
  } catch (error) {
    console.error("Automatic proposal processing failed:", error);

    // Preserve the original inquiry even when AI generation fails.
    await env.DB.prepare(`
      UPDATE leads
      SET next_action = ?
      WHERE id = ? AND status = 'new'
        AND NOT EXISTS (
          SELECT 1 FROM proposals WHERE lead_id = ?
        )
    `).bind(
      "AI draft unavailable. Prepare this proposal manually.",
      leadId,
      leadId
    ).run().catch(console.error);
  }
}
