import {
  cleanLeadValue,
  isLeadManagerAuthorized,
  jsonResponse,
  LEAD_STATUSES,
  nextActionForStatus
} from "../../_shared/leads.js";

export async function onRequestPatch({ request, env, params }) {
  if (!(await isLeadManagerAuthorized(request, env))) {
    return jsonResponse(
      { ok: false, error: "Unauthorized." },
      401,
      { "WWW-Authenticate": "Bearer" }
    );
  }

  if (!env.DB) {
    return jsonResponse(
      {
        ok: false,
        error: "The Lead Manager database is not configured."
      },
      503
    );
  }

  const id = Number.parseInt(String(params.id || ""), 10);

  if (!Number.isInteger(id) || id < 1) {
    return jsonResponse(
      { ok: false, error: "Invalid lead ID." },
      400
    );
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

  try {
    const existing = await env.DB.prepare(
      `SELECT id, status, priority, notes, follow_up_at
       FROM leads
       WHERE id = ?`
    )
      .bind(id)
      .first();

    if (!existing) {
      return jsonResponse(
        { ok: false, error: "Lead not found." },
        404
      );
    }

    const status = body.status === undefined
      ? existing.status
      : cleanLeadValue(body.status, 30);

    if (!LEAD_STATUSES.includes(status)) {
      return jsonResponse(
        { ok: false, error: "Invalid lead status." },
        400
      );
    }

    const notes = body.notes === undefined
      ? existing.notes
      : cleanLeadValue(body.notes, 2000);

    const followUpAt = body.followUpAt === undefined
      ? existing.follow_up_at
      : cleanLeadValue(body.followUpAt, 10);

    if (followUpAt && !/^\d{4}-\d{2}-\d{2}$/.test(followUpAt)) {
      return jsonResponse(
        { ok: false, error: "Invalid follow-up date." },
        400
      );
    }

    const updatedAt = new Date().toISOString();
    const nextAction = nextActionForStatus(status, existing.priority);

    await env.DB.prepare(
      `UPDATE leads
       SET status = ?,
           notes = ?,
           follow_up_at = ?,
           next_action = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(status, notes, followUpAt, nextAction, updatedAt, id)
      .run();

    const lead = await env.DB.prepare(
      `SELECT * FROM leads WHERE id = ?`
    )
      .bind(id)
      .first();

    return jsonResponse({ ok: true, lead });
  } catch (error) {
    console.error("Lead Manager update failed.", error);
    return jsonResponse(
      { ok: false, error: "The lead could not be updated." },
      500
    );
  }
}

export function onRequestGet() {
  return jsonResponse(
    { ok: false, error: "Method not allowed." },
    405,
    { Allow: "PATCH" }
  );
}

export function onRequestDelete() {
  return jsonResponse(
    { ok: false, error: "Lead deletion is disabled." },
    405,
    { Allow: "PATCH" }
  );
}
