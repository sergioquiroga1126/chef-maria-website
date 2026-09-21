import {
  calculateProposalTotals,
  pricingGuidanceFor
} from "./proposal-calculator.js";

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
const proposalDialog = document.getElementById("proposal-dialog");
const proposalForm = document.getElementById("proposal-form");
const proposalDialogTitle = document.getElementById("proposal-dialog-title");
const proposalClientLine = document.getElementById("proposal-client-line");
const proposalCloseButton = document.getElementById("proposal-close");
const proposalMessage = document.getElementById("proposal-message");
const proposalSaveButton = document.getElementById("proposal-save");
const proposalPrintButton = document.getElementById("proposal-print");
const proposalAgentButton = document.getElementById("proposal-agent");

const proposalFields = {
  leadId: document.getElementById("proposal-lead-id"),
  title: document.getElementById("proposal-title"),
  guests: document.getElementById("proposal-guests"),
  pricePerGuest: document.getElementById("proposal-price-per-guest"),
  serverCount: document.getElementById("proposal-server-count"),
  serverHours: document.getElementById("proposal-server-hours"),
  serverRate: document.getElementById("proposal-server-rate"),
  additionalLabel: document.getElementById("proposal-additional-label"),
  additionalAmount: document.getElementById("proposal-additional-amount"),
  menu: document.getElementById("proposal-menu"),
  clientNotes: document.getElementById("proposal-client-notes"),
  internalNotes: document.getElementById("proposal-internal-notes")
};

const proposalOutputs = {
  guidance: document.getElementById("proposal-guidance"),
  foodSubtotal: document.getElementById("proposal-food-subtotal"),
  staffingSubtotal: document.getElementById("proposal-staffing-subtotal"),
  total: document.getElementById("proposal-total")
};

let accessKey = sessionStorage.getItem(STORAGE_KEY) || "";
let searchTimer;
let activeProposalLead = null;

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

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value) || 0);
}

function integerFromLeadValue(value, fallback = 1) {
  const parsed = Number.parseInt(String(value || "").replace(/[^\d]/g, ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function proposalValues() {
  return {
    title: proposalFields.title.value.trim(),
    guestCount: proposalFields.guests.value,
    pricePerGuest: proposalFields.pricePerGuest.value,
    serverCount: proposalFields.serverCount.value,
    serverHours: proposalFields.serverHours.value,
    serverHourlyRate: proposalFields.serverRate.value,
    additionalLabel: proposalFields.additionalLabel.value.trim(),
    additionalAmount: proposalFields.additionalAmount.value,
    menu: proposalFields.menu.value.trim(),
    clientNotes: proposalFields.clientNotes.value.trim(),
    internalNotes: proposalFields.internalNotes.value.trim()
  };
}

function calculateVisibleProposal() {
  try {
    const totals = calculateProposalTotals(proposalValues());

    if (totals.serverCount > 0 && Number(proposalFields.serverHours.value) < 4) {
      proposalFields.serverHours.value = String(totals.serverHours);
    }

    proposalOutputs.foodSubtotal.textContent = formatCurrency(
      totals.foodSubtotalCents / 100
    );
    proposalOutputs.staffingSubtotal.textContent = formatCurrency(
      totals.staffingSubtotalCents / 100
    );
    proposalOutputs.total.textContent = formatCurrency(totals.totalCents / 100);
    proposalMessage.textContent = "";
    return totals;
  } catch (error) {
    proposalOutputs.foodSubtotal.textContent = "$0.00";
    proposalOutputs.staffingSubtotal.textContent = "$0.00";
    proposalOutputs.total.textContent = "$0.00";
    proposalMessage.textContent = error.message;
    return null;
  }
}

function proposalGuidanceText(lead) {
  const guidance = pricingGuidanceFor(lead.service_type);
  const rule = lead.service_type === "Private Chef" && integerFromLeadValue(lead.guest_count) > 10
    ? " Private chef service is limited to 10 guests; change this to catering before approval."
    : "";

  return `${lead.service_type || "Custom service"}: ${guidance.description}${rule}`;
}

function defaultProposalForLead(lead) {
  const guidance = pricingGuidanceFor(lead.service_type);
  const guestCount = integerFromLeadValue(lead.guest_count);
  const needsSuggestedServer =
    lead.service_type === "Full-Service Catering" && guestCount > 10;
  const menuParts = [lead.menu_preferences, lead.cuisine]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);

  return {
    title: `${lead.event_type || lead.service_type || "Event"} Proposal — ${lead.name}`,
    guestCount,
    pricePerGuest: guidance.suggested ?? 0,
    serverCount: needsSuggestedServer ? 1 : 0,
    serverHours: needsSuggestedServer ? 4 : 0,
    serverHourlyRate: 40,
    additionalLabel: "",
    additionalAmount: 0,
    menu: menuParts.join("\n\n"),
    clientNotes: "Final menu, pricing, and availability are subject to Chef Maria’s review and approval.",
    internalNotes: ""
  };
}

function fillProposalForm(lead, savedProposal) {
  const proposal = savedProposal || defaultProposalForLead(lead);

  proposalFields.leadId.value = String(lead.id);
  proposalFields.title.value = proposal.title || "";
  proposalFields.guests.value = proposal.guestCount || "";
  proposalFields.pricePerGuest.value = proposal.pricePerGuest ?? 0;
  proposalFields.serverCount.value = proposal.serverCount ?? 0;
  proposalFields.serverHours.value = proposal.serverHours ?? 0;
  proposalFields.serverRate.value = proposal.serverHourlyRate ?? 40;
  proposalFields.additionalLabel.value = proposal.additionalLabel || "";
  proposalFields.additionalAmount.value = proposal.additionalAmount ?? 0;
  proposalFields.menu.value = proposal.menu || "";
  proposalFields.clientNotes.value = proposal.clientNotes || "";
  proposalFields.internalNotes.value = proposal.internalNotes || "";
  proposalDialogTitle.textContent = savedProposal
    ? "Edit Draft Proposal"
    : "Create Proposal";
  proposalClientLine.textContent = [
    lead.name,
    lead.email,
    lead.event_date,
    lead.location
  ].filter(Boolean).join(" · ");
  proposalOutputs.guidance.textContent = proposalGuidanceText(lead);
  calculateVisibleProposal();
  proposalMessage.textContent = savedProposal
    ? `Draft last saved ${formatCreatedAt(savedProposal.updatedAt)}.`
    : "Review every detail before saving this draft.";
}

async function openProposalEditor(lead, button) {
  button.disabled = true;
  button.textContent = "Loading…";
  dashboardMessage.textContent = "Loading proposal draft…";

  try {
    const data = await apiFetch(`/api/leads/${lead.id}/proposal`);
    activeProposalLead = data.lead || lead;
    fillProposalForm(activeProposalLead, data.proposal);
    proposalDialog.showModal();
    dashboardMessage.textContent = "";
  } catch (error) {
    if (error.status === 401) {
      lockDashboard("Your access key was not accepted.");
      return;
    }

    dashboardMessage.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Create Proposal";
  }
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

  const proposalButton = createElement(
    "button",
    "proposal-button",
    "Create Proposal"
  );
  proposalButton.type = "button";
  proposalButton.addEventListener("click", () => {
    openProposalEditor(lead, proposalButton);
  });

  editor.append(
    statusLabel,
    followUpLabel,
    notesLabel,
    saveButton,
    proposalButton
  );
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

proposalForm.addEventListener("input", calculateVisibleProposal);

proposalForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!activeProposalLead || !proposalForm.reportValidity()) {
    return;
  }

  const totals = calculateVisibleProposal();

  if (!totals) {
    return;
  }

  proposalSaveButton.disabled = true;
  proposalSaveButton.textContent = "Saving…";
  proposalMessage.textContent = "Saving private draft…";

  try {
    const data = await apiFetch(
      `/api/leads/${activeProposalLead.id}/proposal`,
      {
        method: "PUT",
        body: JSON.stringify(proposalValues())
      }
    );
    fillProposalForm(activeProposalLead, data.proposal);
    proposalMessage.textContent = "Draft saved privately. It has not been emailed.";
  } catch (error) {
    if (error.status === 401) {
      proposalDialog.close();
      lockDashboard("Your access key was not accepted.");
      return;
    }

    proposalMessage.textContent = error.message;
  } finally {
    proposalSaveButton.disabled = false;
    proposalSaveButton.textContent = "Save Draft";
  }
});

function fillProposalFromAgent(proposal = {}) {
  proposalFields.title.value = proposal.title || proposalFields.title.value;
  proposalFields.guests.value = proposal.guestCount || proposalFields.guests.value;
  proposalFields.pricePerGuest.value = proposal.pricePerGuest ?? proposalFields.pricePerGuest.value;
  proposalFields.serverCount.value = proposal.serverCount ?? 0;
  proposalFields.serverHours.value = proposal.serverHours ?? 0;
  proposalFields.serverRate.value = proposal.serverHourlyRate ?? 40;
  proposalFields.additionalLabel.value = proposal.additionalLabel || "";
  proposalFields.additionalAmount.value = proposal.additionalAmount ?? 0;
  proposalFields.menu.value = proposal.menu || proposalFields.menu.value;
  proposalFields.clientNotes.value = proposal.clientNotes || proposalFields.clientNotes.value;
  proposalFields.internalNotes.value = proposal.internalNotes || proposalFields.internalNotes.value;
  calculateVisibleProposal();
}

async function generateProposalDraft() {
  if (!activeProposalLead) {
    return;
  }

  proposalAgentButton.disabled = true;
  proposalAgentButton.textContent = "Analyzingâ€¦";
  proposalMessage.textContent = "Chef Maria AI is preparing a private draftâ€¦";

  try {
    const data = await apiFetch(
      `/api/leads/${activeProposalLead.id}/agent`,
      {
        method: "POST",
        body: JSON.stringify({})
      }
    );

    fillProposalFromAgent(data.proposal || {});

    const notices = [
      ...(data.warnings || []),
      ...(data.missingInformation || []).map(
        (item) => `Missing: ${item}`
      )
    ];

    proposalMessage.textContent = notices.length
      ? `AI draft loaded. Review before saving. ${notices.join(" ")}`
      : "AI draft loaded. Review every detail, then select Save Draft.";
  } catch (error) {
    if (error.status === 401) {
      proposalDialog.close();
      lockDashboard("Your access key was not accepted.");
      return;
    }

    proposalMessage.textContent = error.message;
  } finally {
    proposalAgentButton.disabled = false;
    proposalAgentButton.textContent = "AI Draft Proposal";
  }
}

proposalAgentButton.addEventListener("click", generateProposalDraft);
function setPrintText(id, value) {
  document.getElementById(id).textContent = value || "—";
}

function prepareProposalPrintView() {
  if (!activeProposalLead || !proposalForm.reportValidity()) {
    return false;
  }

  const totals = calculateVisibleProposal();

  if (!totals) {
    return false;
  }

  const values = proposalValues();
  const lead = activeProposalLead;
  const staffRow = document.getElementById("print-staffing-row");
  const additionalRow = document.getElementById("print-additional-row");

  setPrintText("print-client-name", lead.name);
  setPrintText("print-title", values.title);
  setPrintText(
    "print-client-contact",
    [lead.email, lead.phone].filter(Boolean).join(" · ")
  );
  setPrintText("print-event", lead.event_type || lead.service_type);
  setPrintText(
    "print-date-time",
    [lead.event_date, lead.event_time].filter(Boolean).join(" · ")
  );
  setPrintText("print-location", lead.location);
  setPrintText("print-guests", String(totals.guestCount));
  setPrintText("print-menu", values.menu || "Menu to be finalized with Chef Maria.");
  setPrintText(
    "print-food-description",
    `${totals.guestCount} guests × ${formatCurrency(totals.pricePerGuestCents / 100)}`
  );
  setPrintText("print-food-subtotal", formatCurrency(totals.foodSubtotalCents / 100));

  staffRow.hidden = totals.staffingSubtotalCents === 0;
  setPrintText(
    "print-staffing-description",
    `${totals.serverCount} server${totals.serverCount === 1 ? "" : "s"} × ${totals.serverHours} hours × ${formatCurrency(totals.serverHourlyRateCents / 100)}`
  );
  setPrintText(
    "print-staffing-subtotal",
    formatCurrency(totals.staffingSubtotalCents / 100)
  );

  additionalRow.hidden = totals.additionalAmountCents === 0;
  setPrintText(
    "print-additional-description",
    values.additionalLabel || "Additional charge"
  );
  setPrintText(
    "print-additional-amount",
    formatCurrency(totals.additionalAmountCents / 100)
  );
  setPrintText("print-total", formatCurrency(totals.totalCents / 100));
  setPrintText(
    "print-client-notes",
    values.clientNotes || "Final details will be confirmed with Chef Maria."
  );

  return true;
}

proposalPrintButton.addEventListener("click", () => {
  if (prepareProposalPrintView()) {
    window.print();
  }
});

proposalCloseButton.addEventListener("click", () => proposalDialog.close());
proposalDialog.addEventListener("click", (event) => {
  if (event.target === proposalDialog) {
    proposalDialog.close();
  }
});
proposalDialog.addEventListener("close", () => {
  activeProposalLead = null;
  proposalForm.reset();
  proposalMessage.textContent = "";
});

if (accessKey) {
  loadLeads();
} else {
  lockDashboard();
}
