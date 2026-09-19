const MAX_TEXT_LENGTH = 2000;

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "proposal_sent",
  "booked",
  "closed"
];

export function cleanLeadValue(value, maximum = MAX_TEXT_LENGTH) {
  return String(value || "").trim().slice(0, maximum);
}

function parseEventDate(value) {
  const text = cleanLeadValue(value, 50);

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    );
  }

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (match) {
    return new Date(
      Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2]))
    );
  }

  const parsed = new Date(text);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function calculatePriority(eventDate, guestCount, now = new Date()) {
  const event = parseEventDate(eventDate);
  const guests = Number.parseInt(guestCount || "0", 10);

  if (event) {
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const eventDay = new Date(
      Date.UTC(event.getUTCFullYear(), event.getUTCMonth(), event.getUTCDate())
    );
    const daysUntilEvent = Math.ceil(
      (eventDay.getTime() - today.getTime()) / 86_400_000
    );

    if (daysUntilEvent >= 0 && daysUntilEvent <= 7) {
      return "urgent";
    }

    if (daysUntilEvent >= 0 && daysUntilEvent <= 14) {
      return "high";
    }
  }

  if (Number.isFinite(guests) && guests > 10) {
    return "high";
  }

  return "normal";
}

export function nextActionForStatus(status, priority = "normal") {
  const prefix = priority === "urgent" ? "Urgent: " : "";

  const actions = {
    new: `${prefix}Review the inquiry and contact the client.`,
    contacted: "Prepare the menu and price proposal.",
    proposal_sent: "Follow up on the proposal.",
    booked: "Confirm the final menu, staffing, and event details.",
    closed: "No follow-up needed."
  };

  return actions[status] || actions.new;
}

function tomorrowDate(now = new Date()) {
  const tomorrow = new Date(now.getTime() + 86_400_000);
  return tomorrow.toISOString().slice(0, 10);
}

export async function saveLead(env, input) {
  if (!env?.DB) {
    console.warn("Lead Manager database is not configured.");
    return { stored: false, reason: "database_not_configured" };
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const guestCount = cleanLeadValue(input.guestCount, 20);
  const eventDate = cleanLeadValue(input.eventDate, 50);
  const priority = calculatePriority(eventDate, guestCount, now);
  const status = "new";
  const nextAction = nextActionForStatus(status, priority);

  try {
    const result = await env.DB.prepare(
      `INSERT INTO leads (
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        cleanLeadValue(input.source, 30) || "website",
        createdAt,
        createdAt,
        status,
        priority,
        cleanLeadValue(input.name, 100),
        cleanLeadValue(input.email, 150).toLowerCase(),
        cleanLeadValue(input.phone, 40),
        eventDate,
        cleanLeadValue(input.eventTime, 30),
        guestCount,
        cleanLeadValue(input.serviceType, 80),
        cleanLeadValue(input.eventType, 100),
        cleanLeadValue(input.location, 150),
        cleanLeadValue(input.cuisine, 100),
        cleanLeadValue(input.menuPreferences),
        cleanLeadValue(input.dietaryRestrictions, 500),
        cleanLeadValue(input.message),
        nextAction,
        tomorrowDate(now),
        "",
        "sent"
      )
      .run();

    return {
      stored: true,
      id: result?.meta?.last_row_id || null
    };
  } catch (error) {
    console.error("Lead Manager database insert failed.", error);
    return { stored: false, reason: "database_error" };
  }
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export async function isLeadManagerAuthorized(request, env) {
  const expected = cleanLeadValue(env?.LEAD_MANAGER_KEY, 500);
  const authorization = request.headers.get("Authorization") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? cleanLeadValue(authorization.slice(7), 500)
    : "";

  if (!expected || !supplied) {
    return false;
  }

  const [expectedHash, suppliedHash] = await Promise.all([
    sha256(expected),
    sha256(supplied)
  ]);

  let difference = 0;

  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= expectedHash[index] ^ suppliedHash[index];
  }

  return difference === 0;
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}
