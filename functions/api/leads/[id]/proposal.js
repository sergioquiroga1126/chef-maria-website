import {
  cleanLeadValue,
  isLeadManagerAuthorized,
  jsonResponse,
  nextActionForStatus
} from "../../../_shared/leads.js";
import { calculateProposalTotals } from "../../../../proposal-calculator.js";

function proposalResponse(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    leadId: row.lead_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at || null,
    status: row.status,
    title: row.title,
    guestCount: row.guest_count,
    pricePerGuest: row.price_per_guest_cents / 100,
    foodSubtotal: row.food_subtotal_cents / 100,
    serverCount: row.server_count,
    serverHours: row.server_hours,
    serverHourlyRate: row.server_hourly_rate_cents / 100,
    staffingSubtotal: row.staffing_subtotal_cents / 100,
    additionalLabel: row.additional_label,
    additionalAmount: row.additional_amount_cents / 100,
    total: row.total_cents / 100,
    menu: row.menu,
    clientNotes: row.client_notes,
    internalNotes: row.internal_notes
  };
}

function parseLeadId(params) {
  const id = Number.parseInt(String(params.id || ""), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function authorizeAndFindLead(request, env, params) {
  if (!(await isLeadManagerAuthorized(request, env))) {
    return {
      response: jsonResponse(
        { ok: false, error: "Unauthorized." },
        401,
        { "WWW-Authenticate": "Bearer" }
      )
    };
  }

  if (!env.DB) {
    return {
      response: jsonResponse(
        { ok: false, error: "The Lead Manager database is not configured." },
        503
      )
    };
  }

  const leadId = parseLeadId(params);

  if (!leadId) {
    return {
      response: jsonResponse(
        { ok: false, error: "Invalid lead ID." },
        400
      )
    };
  }

  const lead = await env.DB.prepare(
    `SELECT * FROM leads WHERE id = ?`
  )
    .bind(leadId)
    .first();

  if (!lead) {
    return {
      response: jsonResponse(
        { ok: false, error: "Lead not found." },
        404
      )
    };
  }

  return { leadId, lead };
}

export async function onRequestGet({ request, env, params }) {
  try {
    const authorization = await authorizeAndFindLead(request, env, params);

    if (authorization.response) {
      return authorization.response;
    }

    const proposal = await env.DB.prepare(
      `SELECT * FROM proposals WHERE lead_id = ?`
    )
      .bind(authorization.leadId)
      .first();

    return jsonResponse({
      ok: true,
      lead: authorization.lead,
      proposal: proposalResponse(proposal)
    });
  } catch (error) {
    console.error("Proposal lookup failed.", error);
    return jsonResponse(
      { ok: false, error: "The proposal could not be loaded." },
      500
    );
  }
}

export async function onRequestPut({ request, env, params }) {
  try {
    const authorization = await authorizeAndFindLead(request, env, params);

    if (authorization.response) {
      return authorization.response;
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        { ok: false, error: "Invalid request." },
        400
      );
    }

    let totals;

    try {
      totals = calculateProposalTotals({
        guestCount: body.guestCount,
        pricePerGuest: body.pricePerGuest,
        serverCount: body.serverCount,
        serverHours: body.serverHours,
        serverHourlyRate: body.serverHourlyRate,
        additionalAmount: body.additionalAmount
      });
    } catch (error) {
      return jsonResponse(
        { ok: false, error: error.message || "Invalid proposal totals." },
        400
      );
    }

    const now = new Date().toISOString();
    const title =
      cleanLeadValue(body.title, 160) ||
      `Chef Maria Proposal for ${authorization.lead.name}`;
    const additionalLabel = cleanLeadValue(body.additionalLabel, 100);
    const menu = cleanLeadValue(body.menu, 4000);
    const clientNotes = cleanLeadValue(body.clientNotes, 4000);
    const internalNotes = cleanLeadValue(body.internalNotes, 2000);

    await env.DB.prepare(
      `INSERT INTO proposals (
        lead_id,
        created_at,
        updated_at,
        status,
        title,
        guest_count,
        price_per_guest_cents,
        food_subtotal_cents,
        server_count,
        server_hours,
        server_hourly_rate_cents,
        staffing_subtotal_cents,
        additional_label,
        additional_amount_cents,
        total_cents,
        menu,
        client_notes,
        internal_notes
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(lead_id) DO UPDATE SET
        updated_at = excluded.updated_at,
        status = 'draft',
        title = excluded.title,
        guest_count = excluded.guest_count,
        price_per_guest_cents = excluded.price_per_guest_cents,
        food_subtotal_cents = excluded.food_subtotal_cents,
        server_count = excluded.server_count,
        server_hours = excluded.server_hours,
        server_hourly_rate_cents = excluded.server_hourly_rate_cents,
        staffing_subtotal_cents = excluded.staffing_subtotal_cents,
        additional_label = excluded.additional_label,
        additional_amount_cents = excluded.additional_amount_cents,
        total_cents = excluded.total_cents,
        menu = excluded.menu,
        client_notes = excluded.client_notes,
        internal_notes = excluded.internal_notes`
    )
      .bind(
        authorization.leadId,
        now,
        now,
        title,
        totals.guestCount,
        totals.pricePerGuestCents,
        totals.foodSubtotalCents,
        totals.serverCount,
        totals.serverHours,
        totals.serverHourlyRateCents,
        totals.staffingSubtotalCents,
        additionalLabel,
        totals.additionalAmountCents,
        totals.totalCents,
        menu,
        clientNotes,
        internalNotes
      )
      .run();

    await env.DB.prepare(
      `UPDATE leads
       SET next_action = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(
        "Review and approve the draft proposal.",
        now,
        authorization.leadId
      )
      .run();

    const proposal = await env.DB.prepare(
      `SELECT * FROM proposals WHERE lead_id = ?`
    )
      .bind(authorization.leadId)
      .first();

    return jsonResponse({
      ok: true,
      proposal: proposalResponse(proposal)
    });
  } catch (error) {
    console.error("Proposal save failed.", error);
    return jsonResponse(
      { ok: false, error: "The proposal could not be saved." },
      500
    );
  }
}

export async function onRequestPost({ request, env, params }) {
  try {
    const authorization = await authorizeAndFindLead(request, env, params);

    if (authorization.response) {
      return authorization.response;
    }

    if (!env.RESEND_API_KEY) {
      return jsonResponse(
        { ok: false, error: "Proposal email service is not configured." },
        503
      );
    }

    const lead = authorization.lead;
    const customerEmail = cleanLeadValue(lead.email, 150).toLowerCase();

    if (!customerEmail) {
      return jsonResponse(
        { ok: false, error: "This lead does not have an email address." },
        400
      );
    }

    const proposal = await env.DB.prepare(
      `SELECT * FROM proposals WHERE lead_id = ?`
    )
      .bind(authorization.leadId)
      .first();

    if (!proposal) {
      return jsonResponse(
        { ok: false, error: "Save the proposal before sending it." },
        404
      );
    }

    const money = (cents) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
      }).format((Number(cents) || 0) / 100);

    const subject =
      proposal.title ||
      `Chef Maria Proposal for ${lead.name || "Your Event"}`;

    const emailText = [
      `Hello ${lead.name || ""},`,
      "",
      "Thank you for considering Chef Maria for your event.",
      "",
      `Event: ${lead.event_type || lead.service_type || "Private event"}`,
      `Date: ${[lead.event_date, lead.event_time].filter(Boolean).join(" · ") || "To be confirmed"}`,
      `Location: ${lead.location || "South Florida"}`,
      `Guests: ${proposal.guest_count}`,
      "",
      "Proposed Menu:",
      proposal.menu || "Menu to be finalized with Chef Maria.",
      "",
      `Price: ${money(proposal.price_per_guest_cents)} per guest`,
      proposal.staffing_subtotal_cents > 0
        ? `Staffing: ${money(proposal.staffing_subtotal_cents)}`
        : null,
      proposal.additional_amount_cents > 0
        ? `${proposal.additional_label || "Additional"}: ${money(proposal.additional_amount_cents)}`
        : null,
      `Estimated Total: ${money(proposal.total_cents)}`,
      "",
      proposal.client_notes || "",
      "",
      "Please let us know if you would like any adjustments.",
      "",
      "Best,",
      "Chef Maria",
      "cucinadiverona@gmail.com"
    ]
      .filter((line) => line !== null)
      .join("\n");

    const resendResponse = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "Chef Maria <bookings@mariaprivatechef.com>",
          to: [customerEmail],
          bcc: ["cucinadiverona@gmail.com"],
          reply_to: "cucinadiverona@gmail.com",
          subject,
          text: emailText
        })
      }
    );

    if (!resendResponse.ok) {
      const resendError = await resendResponse.text();
      console.error("Proposal Resend error:", resendError);

      return jsonResponse(
        { ok: false, error: "The proposal email could not be sent." },
        502
      );
    }

    const now = new Date();
    const updatedAt = now.toISOString();
    const followUp = new Date(now);
    let businessDays = 0;

    while (businessDays < 3) {
      followUp.setUTCDate(followUp.getUTCDate() + 1);
      const day = followUp.getUTCDay();

      if (day !== 0 && day !== 6) {
        businessDays += 1;
      }
    }

    const followUpAt = followUp.toISOString().slice(0, 10);

    try {
      await env.DB.prepare(
        `UPDATE proposals
         SET status = 'sent',
             updated_at = ?,
             sent_at = ?
         WHERE lead_id = ?`
      )
        .bind(updatedAt, updatedAt, authorization.leadId)
        .run();

      await env.DB.prepare(
        `UPDATE leads
         SET status = 'proposal_sent',
             follow_up_at = ?,
             next_action = ?,
             updated_at = ?
         WHERE id = ?`
      )
        .bind(
          followUpAt,
          nextActionForStatus("proposal_sent", lead.priority),
          updatedAt,
          authorization.leadId
        )
        .run();
    } catch (updateError) {
      console.error("Proposal sent but status update failed:", updateError);
    }

    return jsonResponse({
      ok: true,
      message: "Proposal sent from Chef Maria.",
      to: customerEmail,
      followUpAt
    });
  } catch (error) {
    console.error("Proposal email failed.", error);

    return jsonResponse(
      { ok: false, error: "The proposal email could not be sent." },
      500
    );
  }
}
