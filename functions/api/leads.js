import {
  isLeadManagerAuthorized,
  jsonResponse,
  LEAD_STATUSES
} from "../_shared/leads.js";

const SELECT_COLUMNS = `
  id,
  source,
  created_at,
  updated_at,
  status,
  priority,
  name,
  email,
  phone,
  event_date,
  event_time,
  guest_count,
  service_type,
  event_type,
  location,
  cuisine,
  menu_preferences,
  dietary_restrictions,
  message,
  next_action,
  follow_up_at,
  notes,
  email_delivery_status
`;

export async function onRequestGet({ request, env }) {
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

  const url = new URL(request.url);
  const requestedStatus = (url.searchParams.get("status") || "").trim();
  const search = (url.searchParams.get("search") || "").trim().slice(0, 100);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "100", 10);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 200)
    : 100;

  if (requestedStatus && !LEAD_STATUSES.includes(requestedStatus)) {
    return jsonResponse(
      { ok: false, error: "Invalid lead status." },
      400
    );
  }

  const conditions = [];
  const bindings = [];

  if (requestedStatus) {
    conditions.push("status = ?");
    bindings.push(requestedStatus);
  }

  if (search) {
    conditions.push(`(
      name LIKE ? OR
      email LIKE ? OR
      phone LIKE ? OR
      location LIKE ? OR
      service_type LIKE ? OR
      event_type LIKE ?
    )`);
    const pattern = `%${search}%`;
    bindings.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  try {
    const statement = env.DB.prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM leads
       ${where}
       ORDER BY
         CASE priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           ELSE 3
         END,
         CASE WHEN event_date = '' THEN 1 ELSE 0 END,
         event_date ASC,
         created_at DESC
       LIMIT ?`
    ).bind(...bindings, limit);

    const [leadResult, countResult] = await Promise.all([
      statement.all(),
      env.DB.prepare(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
          SUM(CASE WHEN priority IN ('high', 'urgent') AND status != 'closed' THEN 1 ELSE 0 END) AS priority_count,
          SUM(CASE WHEN status = 'proposal_sent' THEN 1 ELSE 0 END) AS proposal_count,
          SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END) AS booked_count
        FROM leads`
      ).first()
    ]);

    return jsonResponse({
      ok: true,
      leads: leadResult.results || [],
      counts: {
        total: Number(countResult?.total || 0),
        new: Number(countResult?.new_count || 0),
        priority: Number(countResult?.priority_count || 0),
        proposals: Number(countResult?.proposal_count || 0),
        booked: Number(countResult?.booked_count || 0)
      }
    });
  } catch (error) {
    console.error("Lead Manager list query failed.", error);
    return jsonResponse(
      { ok: false, error: "The leads could not be loaded." },
      500
    );
  }
}

export function onRequestPost() {
  return jsonResponse(
    { ok: false, error: "Method not allowed." },
    405,
    { Allow: "GET" }
  );
}
