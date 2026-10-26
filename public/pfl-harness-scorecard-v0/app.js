const seats = [
  { name: "Codex", role: "Frontier builder", done: 16, flight: 2, interventions: 1, last: "2026-10-26 12:13:31 UTC", event: "de5d3a13", taskUpdated: "2026-10-20 18:35:28 UTC", gauges: { weekly: 96, short: 79, reset: "NOV 02" } },
  { name: "Antigravity", role: "GEV chief designer / covert intelligence", done: 15, flight: 2, interventions: 0, last: "2026-10-26 13:31:20 UTC", event: "9710422a", taskUpdated: "2026-10-26 13:30:50 UTC", gauges: { weekly: 92, short: 90, reset: "OCT 31" } },
  { name: "Friday", role: "Frontier coordinator", done: 7, flight: 3, interventions: 2, last: "2026-10-25 20:31:06 UTC", event: "f39fb3e8", taskUpdated: "2026-10-20 18:35:20 UTC" },
  { name: "Lisa Muse", role: "CTO / systems oversight", done: 305, flight: 10, interventions: 1, last: "2026-10-26 13:19:34 UTC", event: "477db152", taskUpdated: "2026-10-21 10:35:30 UTC" },
  { name: "Lisa Holmes", role: "Chief of staff", done: null, flight: null, interventions: null, last: "2026-10-26 13:09:26 UTC", event: "97eb1d00" },
  { name: "McKay", role: "OpenClaw seat", done: 25, flight: 3, interventions: 0, last: "2026-10-21 03:39:45 UTC", event: "7f09a1c7", taskUpdated: "2026-09-27 08:20:00 UTC" },
  { name: "Zelenka", role: "OpenClaw seat", done: 32, flight: 2, interventions: 4, last: "2026-10-20 17:31:58 UTC", event: "101f16be", taskUpdated: "2026-09-25 08:16:49 UTC" },
  { name: "Sparky", role: "OpenClaw seat", done: 6, flight: 1, interventions: 0, last: "2026-10-20 17:31:37 UTC", event: "3156d10c", taskUpdated: "2026-09-21 08:23:09 UTC" }
];

const sources = {
  method: {
    title: "METHOD / SNAPSHOT RULES",
    items: [
      ["M1 — Seat set", "Eight named seats reconciled across the PFL agent_personas roster, canonical task aliases, and current Buzz channel membership. Snapshot frozen 2026-10-26 13:20 UTC."],
      ["M2 — Unknown handling", "A missing canonical task alias or a gauge not explicitly reported is rendered UNREPORTED. It is never coerced to zero."],
      ["M3 — Non-live artifact", "This v0 is a sourced snapshot, not a live database connection. Figures do not change silently after publication."]
    ]
  },
  tasks: {
    title: "TASK LEDGER / AGGREGATION",
    items: [
      ["T1 — Source", "Shared Postgres tasks table, queried 2026-10-26. Done-with-receipts counts completed rows with at least one of: notes, grade_feedback, source_event_id, buzz_thread_root, or matrix_thread_root."],
      ["T2 — In flight", "Statuses: pending, in_progress, pending_review, running."],
      ["T3 — Interventions", "Statuses: blocked, escalated. Aggregates cover seven canonical aliases; Lisa Holmes is UNREPORTED rather than folded into another Lisa identity."]
    ]
  },
  gauge: {
    title: "GAUGE REPORT / CODEX & ANTIGRAVITY",
    items: [
      ["G1 — Codex", "96% weekly remaining (reset Nov 2); 79% five-hour remaining. Source: Paul gauge screenshot + signed Buzz event 477db152."],
      ["G2 — Antigravity", "92% weekly remaining (reset Oct 31, 5d 1h); 90% five-hour remaining (reset 16:57 UTC); 100% Claude/GPT remaining. Source: Paul Google AI Ultra screenshot (media_1793021511252_83382a10.png) + live LanguageServer GetUserStatus RPC + public.compute_usage."],
      ["G3 — Other seats", "No equivalent compute gauge report was supplied at snapshot time; those fields are UNREPORTED."]
    ]
  }
};

const list = document.querySelector("#seat-list");
const metric = (value, label, source = "tasks") => value === null
  ? `<div class="metric"><span class="unreported">UNREPORTED</span><span class="metric-label">${label}</span><button class="row-cite" data-source="method">WHY?</button></div>`
  : `<div class="metric"><span class="metric-value">${String(value).padStart(2, "0")}</span><span class="metric-label">${label}</span><button class="row-cite" data-source="${source}">SOURCE [T1]</button></div>`;

const gaugeView = (seat) => seat.gauges
  ? `<div class="metric gauges"><div class="gauge-stack">
      <div class="gauge"><span class="gauge-name">WEEKLY</span><span class="gauge-track"><span class="gauge-fill" style="width:${seat.gauges.weekly}%"></span></span><span class="gauge-value">${seat.gauges.weekly}%</span></div>
      <div class="gauge"><span class="gauge-name">5-HOUR</span><span class="gauge-track"><span class="gauge-fill" style="width:${seat.gauges.short}%"></span></span><span class="gauge-value">${seat.gauges.short}%</span></div>
      <button class="row-cite" data-source="gauge">RESET ${seat.gauges.reset} · SOURCE [G1]</button>
    </div></div>`
  : `<div class="metric gauges"><span class="unreported">UNREPORTED</span><span class="metric-label">COMPUTE REMAINING</span><button class="row-cite" data-source="gauge">SOURCE [G3]</button></div>`;

list.innerHTML = seats.map((seat, i) => `
  <article class="seat-row" data-attention="${(seat.interventions || 0) > 0}" data-unreported="${seat.gauges ? "false" : "true"}">
    <div class="identity">
      <span class="seat-index">${String(i + 1).padStart(2, "0")}</span>
      <div><div class="seat-name">${seat.name}</div><div class="seat-role">${seat.role}</div><div class="last-heard">LAST HEARD ${seat.last} · BUZZ:${seat.event}</div></div>
    </div>
    ${metric(seat.done, "DONE + RECEIPTS")}
    ${metric(seat.flight, "IN FLIGHT")}
    ${gaugeView(seat)}
    <div class="intervention ${seat.interventions > 0 ? "hot" : ""}">${metric(seat.interventions, "INTERVENTIONS")}</div>
  </article>`).join("");

const dialog = document.querySelector("#source-dialog");
const sourceContent = document.querySelector("#source-content");
function openSource(key) {
  const source = sources[key] || sources.method;
  sourceContent.innerHTML = `<h3 class="source-title">${source.title}</h3>${source.items.map(([id, copy]) => `<div class="source-item"><div class="source-key">${id}</div><p class="source-copy">${copy}</p></div>`).join("")}`;
  dialog.showModal();
}
document.addEventListener("click", (event) => {
  const sourceButton = event.target.closest("[data-source]");
  if (sourceButton) openSource(sourceButton.dataset.source);
  const tab = event.target.closest(".tab");
  if (tab) {
    document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
    const filter = tab.dataset.filter;
    document.querySelectorAll(".seat-row").forEach((row) => {
      row.hidden = filter === "attention" ? row.dataset.attention !== "true" : filter === "unreported" ? row.dataset.unreported !== "true" : false;
    });
  }
});
document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
