const STORAGE_KEY = "chefMariaLeadManagerKey";
const STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  proposal_sent: "Proposal Sent",
  booked: "Booked",
  closed: "Closed"
};

const loginPanel = document.getElementById("login-panel");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("login-form");
const accessKeyInput = document.getElementById("access-key");
const loginMessage = document.getElementById("login-message");
const dashboardMessage = document.getElementById("dashboard-message");
const leadList = document.getElementById("lead-list");
const searchInput = document.getElementById("search-input");
const statusFilter = document.getElementById("status-filter");
const refreshButton = document.getElementById("refresh-button");
const logoutButton = document.getElementById("logout-button");

let accessKey = sessionStorage.getItem(STORAGE_KEY) || "";
let searchTimer;

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined && text !== null) {
    element.textContent = String(text);
  }

  return element;
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${accessKey}`);

  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
    cache: "no-store"
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = { ok: false, error: "Unexpected server response." };
  }

  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    throw error;
  }

  return data;
}

function lockDashboard(message = "") {
  accessKey = "";
  sessionStorage.removeItem(STORAGE_KEY);
  dashboard.hidden = true;
  loginPanel.hidden = false;
  accessKeyInput.value = "";
  loginMessage.textContent = message;
  accessKeyInput.focus();
}

function openDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  loginMessage.textContent = "";
}

function formatCreatedAt(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function addDetail(container, label, value, options = {}) {
  if (!value) {
    return;
  }

  const detail = createElement("div", `detail${options.wide ? " wide" : ""}`);
  detail.append(createElement("span", "detail-label", label));

  const valueElement = createElement("p", "detail-value");

  if (options.linkType === "email") {
    const link = createElement("a", "", value);
    link.href = `mailto:${value}`;
    valueElement.append(link);
  } else if (options.linkType === "phone") {
    const link = createElement("a", "", value);
    link.href = `tel:${String(value).replace(/[^+\d]/g, "")}`;
    valueElement.append(link);
  } else {
    valueElement.textContent = value;
  }

  detail.append(valueElement);
  container.append(detail);
}

function createStatusSelect(currentStatus) {
  const select = createElement("select");

  Object.entries(STATUS_LABELS).forEach(([value, label]) => {
    const option = createElement("option", "", label);
    option.value = value;
    option.selected = value === currentStatus;
    select.append(option);
  });

  return select;
}

function createLeadCard(lead) {
  const card = createElement(
    "article",
    `lead-card priority-${lead.priority || "normal"}`
  );
  card.dataset.leadId = lead.id;

  const topLine = createElement("div", "lead-topline");
  const titleBlock = createElement("div");
  titleBlock.append(createElement("h2", "lead-name", lead.name || "Unnamed lead"));
  titleBlock.append(
    createElement(
      "p",
      "lead-subtitle",
      `${lead.source === "chatbot" ? "Chef Maria AI" : "Website form"} · Received ${formatCreatedAt(lead.created_at)}`
    )
  );

  const badges = createElement("div", "badges");
  const priorityLabel = lead.priority === "normal"
    ? "Normal priority"
    : `${lead.priority} priority`;
  badges.append(createElement("span", `badge ${lead.priority || "normal"}`, priorityLabel));
  badges.append(createElement("span", "badge", STATUS_LABELS[lead.status] || lead.status));
  topLine.append(titleBlock, badges);

  const details = createElement("div", "lead-details");
  addDetail(details, "Email", lead.email, { linkType: "email" });
  addDetail(details, "Phone", lead.phone, { linkType: "phone" });
  addDetail(details, "Event date", lead.event_date);
  addDetail(details, "Event time", lead.event_time);
  addDetail(details, "Guests", lead.guest_count);
  addDetail(details, "Service", lead.service_type);
  addDetail(details, "Event", lead.event_type);
  addDetail(details, "Location", lead.location);
  addDetail(details, "Cuisine", lead.cuisine);
  addDetail(details, "Menu", lead.menu_preferences, { wide: true });
  addDetail(details, "Dietary restrictions", lead.dietary_restrictions, { wide: true });
  addDetail(details, "Message", lead.message, { wide: true });

  const nextAction = createElement("p", "next-action", lead.next_action || "Review this inquiry.");

  const editor = createElement("div", "lead-editor");

  const statusLabel = createElement("label");
  statusLabel.append(createElement("span", "", "Status"));
  const statusSelect = createStatusSelect(lead.status);
  statusLabel.append(statusSelect);

  const followUpLabel = createElement("label");
  followUpLabel.append(createElement("span", "", "Follow-up date"));
  const followUpInput = createElement("input");
  followUpInput.type = "date";
  followUpInput.value = lead.follow_up_at || "";
  followUpLabel.append(followUpInput);

  const notesLabel = createElement("label");
  notesLabel.append(createElement("span", "", "Private notes"));
  const notesInput = createElement("textarea");
  notesInput.value = lead.notes || "";
  notesInput.placeholder = "Quote details, client preferences, follow-up notes…";
  notesLabel.append(notesInput);

  const saveButton = createElement("button", "save-button", "Save changes");
  saveButton.type = "button";
  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    dashboardMessage.textContent = "";

    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: statusSelect.value,
          followUpAt: followUpInput.value,
          notes: notesInput.value
        })
      });
      dashboardMessage.textContent = `${lead.name}'s lead was updated.`;
      await loadLeads();
    } catch (error) {
      if (error.status === 401) {
        lockDashboard("Your access key was not accepted.");
        return;
      }

      dashboardMessage.textContent = error.message;
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save changes";
    }
  });

  editor.append(statusLabel, followUpLabel, notesLabel, saveButton);
  card.append(topLine, details, nextAction, editor);
  return card;
}

function updateCounts(counts = {}) {
  document.getElementById("count-total").textContent = counts.total || 0;
  document.getElementById("count-new").textContent = counts.new || 0;
  document.getElementById("count-priority").textContent = counts.priority || 0;
  document.getElementById("count-proposals").textContent = counts.proposals || 0;
  document.getElementById("count-booked").textContent = counts.booked || 0;
}

function renderLeads(leads) {
  leadList.replaceChildren();

  if (!leads.length) {
    leadList.append(
      createElement(
        "div",
        "empty-state",
        "No leads match this view yet. New successful inquiries will appear here automatically."
      )
    );
    return;
  }

  leads.forEach((lead) => leadList.append(createLeadCard(lead)));
}

async function loadLeads() {
  dashboardMessage.textContent = "Loading leads…";
  refreshButton.disabled = true;

  const params = new URLSearchParams();
  const search = searchInput.value.trim();
  const status = statusFilter.value;

  if (search) {
    params.set("search", search);
  }

  if (status) {
    params.set("status", status);
  }

  try {
    const data = await apiFetch(`/api/leads?${params.toString()}`);
    openDashboard();
    updateCounts(data.counts);
    renderLeads(data.leads || []);
    dashboardMessage.textContent = `${(data.leads || []).length} lead${data.leads?.length === 1 ? "" : "s"} shown.`;
  } catch (error) {
    if (error.status === 401) {
      lockDashboard("That access key was not accepted.");
      return;
    }

    openDashboard();
    dashboardMessage.textContent = error.message;
    renderLeads([]);
  } finally {
    refreshButton.disabled = false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accessKey = accessKeyInput.value.trim();

  if (!accessKey) {
    loginMessage.textContent = "Enter the Lead Manager access key.";
    return;
  }

  sessionStorage.setItem(STORAGE_KEY, accessKey);
  loginMessage.textContent = "Checking access…";
  await loadLeads();
});

logoutButton.addEventListener("click", () => lockDashboard());
refreshButton.addEventListener("click", loadLeads);
statusFilter.addEventListener("change", loadLeads);
searchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadLeads, 350);
});

if (accessKey) {
  loadLeads();
} else {
  lockDashboard();
}
