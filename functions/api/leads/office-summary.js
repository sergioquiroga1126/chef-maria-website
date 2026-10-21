import {
  isLeadManagerAuthorized,
  jsonResponse
} from "../../_shared/leads.js";
import { buildBookedEventChecklist } from "../../../office-assistant.js";

const BUSINESS_TIME_ZONE = "America/New_York";
const ACTIVE_STATUSES = new Set([
  "new",
  "contacted",
  "proposal_sent",
  "booked"
]);

function businessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseDate(value) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) match = [match[0], match[3], match[1].padStart(2, "0"), match[2].padStart(2, "0")];
  }

  if (!match) {
    const namedDate = new Date(text + " 00:00:00 UTC");
    if (!Number.isNaN(namedDate.getTime()) && /^[A-Za-z]+\s+\d{1,2},\s+\d{4}$/.test(text)) {
      return namedDate;
    }
  }

  if (!match) return null;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === `${match[1]}-${match[2]}-${match[3]}`
    ? date
    : null;
}

function dayNumber(value) {
  const date = parseDate(value);
  return date ? Math.floor(date.getTime() / 86_400_000) : null;
}

function daysBetween(fromDate, toDate) {
  const from = dayNumber(fromDate);
  const to = dayNumber(toDate);
  return from === null || to === null ? null : to - from;
}

function requiredDetails(lead) {
  const missing = [];
  if (!lead.event_date) missing.push("event date");
  if (!lead.event_time) missing.push("event time");
  if (!lead.guest_count) missing.push("guest count");
  if (!lead.location) missing.push("location");
  if (!lead.service_type) missing.push("service type");
  return missing;
}

export function buildOfficeSummary(leads = [], now = new Date()) {
  const today = businessDate(now);
  const tasks = [];

  for (const lead of leads) {
    if (!ACTIVE_STATUSES.has(lead.status)) continue;

    const eventDays = daysBetween(today, lead.event_date);
    const followUpDays = daysBetween(lead.follow_up_at, today);

    // Do not surface routine office tasks for events that have already passed.
    if (eventDays !== null && eventDays < 0) continue;

    const baseTask = {
      leadId: lead.id,
      clientName: lead.name || "Unnamed inquiry",
      eventDate: lead.event_date || "",
      status: lead.status,
      priority: lead.priority || "normal"
    };

    if (lead.status === "new") {
      tasks.push({
        ...baseTask,
        type: "new_inquiry",
        dueDate: lead.follow_up_at || today,
        title: "Review new inquiry and prepare a reply",
        detail: lead.event_date ? `Event date: ${lead.event_date}` : "Event date has not been provided."
      });
    }

    if (lead.follow_up_at && followUpDays !== null && followUpDays >= 0) {
      tasks.push({
        ...baseTask,
        type: "follow_up",
        dueDate: lead.follow_up_at,
        title: lead.status === "proposal_sent" ? "Follow up on proposal" : "Follow up with client",
        detail: followUpDays === 0 ? "Follow-up is due today." : `Follow-up is ${followUpDays} day${followUpDays === 1 ? "" : "s"} overdue.`
      });
    }

    if (lead.status === "booked" && (eventDays === null || (eventDays >= 0 && eventDays <= 14))) {
      const missing = requiredDetails(lead);
      tasks.push({
        ...baseTask,
        type: "event_prep",
        dueDate: lead.event_date || today,
        title: missing.length
          ? "Review booked event details"
          : "Confirm menu, staffing, and event details",
        detail: missing.length
          ? `Still needed: ${missing.join(", ")}.`
          : eventDays === null
            ? "Event date needs review."
            : `Event is ${eventDays === 0 ? "today" : `in ${eventDays} day${eventDays === 1 ? "" : "s"}`}.`,
        checklist: buildBookedEventChecklist()
      });
    }
  }

  const order = { urgent: 0, high: 1, normal: 2 };
  tasks.sort((a, b) => {
    const priorityDifference = (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
    if (priorityDifference) return priorityDifference;
    return String(a.dueDate).localeCompare(String(b.dueDate));
  });

  return {
    ok: true,
    mode: "read_only",
    businessDate: today,
    generatedAt: now.toISOString(),
    counts: {
      newInquiries: leads.filter((lead) => lead.status === "new").length,
      overdueFollowUps: tasks.filter((task) => task.type === "follow_up" && task.dueDate < today).length,
      followUpsDueToday: tasks.filter((task) => task.type === "follow_up" && task.dueDate === today).length,
      upcomingBookedEvents: tasks.filter((task) => task.type === "event_prep").length
    },
    tasks
  };
}

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
      { ok: false, error: "The Lead Manager database is not configured." },
      503
    );
  }

  try {
    const result = await env.DB.prepare(
      `SELECT id, name, status, priority, event_date, event_time,
              guest_count, service_type, location, follow_up_at
       FROM leads
       WHERE status != 'closed'
       ORDER BY event_date ASC, follow_up_at ASC
       LIMIT 200`
    ).all();

    return jsonResponse(buildOfficeSummary(result.results || []));
  } catch (error) {
    console.error("Office summary query failed.", error);
    return jsonResponse(
      { ok: false, error: "The office brief could not be prepared." },
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
