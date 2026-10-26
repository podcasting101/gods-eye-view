const seats = [
  { name: "Codex", role: "Frontier builder", done: 16, flight: 2, interventions: 1, last: "2026-10-26 12:13:31 UTC", event: "de5d3a13", taskUpdated: "2026-10-20 18:35:28 UTC" },
  { name: "Antigravity", role: "GEV chief designer / covert intelligence", done: 14, flight: 3, interventions: 0, last: "2026-10-26 13:17:59 UTC", event: "9710422a", taskUpdated: "2026-10-24 13:21:51 UTC" },
  { name: "Friday", role: "Frontier coordinator", done: 7, flight: 3, interventions: 2, last: "2026-10-25 20:31:06 UTC", event: "f39fb3e8", taskUpdated: "2026-10-20 18:35:20 UTC" },
  { name: "Lisa Muse", role: "CTO / systems oversight", done: 305, flight: 10, interventions: 1, last: "2026-10-26 13:19:34 UTC", event: "477db152", taskUpdated: "2026-10-21 10:35:30 UTC" },
  { name: "Lisa Holmes", role: "Chief of staff", done: null, flight: null, interventions: null, last: "2026-10-26 13:09:26 UTC", event: "97eb1d00" },
  { name: "McKay", role: "OpenClaw seat", done: 25, flight: 3, interventions: 0, last: "2026-10-21 03:39:45 UTC", event: "7f09a1c7", taskUpdated: "2026-09-27 08:20:00 UTC" },
  { name: "Zelenka", role: "OpenClaw seat", done: 32, flight: 2, interventions: 4, last: "2026-10-20 17:31:58 UTC", event: "101f16be", taskUpdated: "2026-09-25 08:16:49 UTC" },
  { name: "Sparky", role: "OpenClaw seat", done: 6, flight: 1, interventions: 0, last: "2026-10-20 17:31:37 UTC", event: "3156d10c", taskUpdated: "2026-09-21 08:23:09 UTC" }
];

const accountBuckets = [
  { id: "codex-openai", name: "OpenAI / Codex", primary: "100% used", weekly: "16% used", asOf: "09:53 CDT", state: "RESET PASSED · AWAITING FRESH %", source: "CU:1902" },
  { id: "antigravity-ultra", name: "Google AI Ultra", primary: "43% used", weekly: "11% used", asOf: "11:20 CDT", state: "CURRENT", source: "CU:1919" },
  { id: "claude-pro-oauth", name: "Claude Pro / Friday", primary: "29% used", weekly: "25% used", asOf: "09:53 CDT", state: "REPORTED", source: "CU:1903" },
  { id: "ollama-glm", name: "Ollama Cloud Pro", primary: "8.7% used", weekly: "7.3% used", asOf: "09:53 CDT", state: "PANEL %", source: "CU:1905" },
  { id: "muse-subscription", name: "Lisa Muse Meta", primary: "68% add'l", weekly: "96% used", asOf: "09:53 CDT", state: "REPORTED", source: "CU:1904" },
  { id: "huggingface", name: "Hugging Face Pro", primary: "0.3 / 40 min", weekly: "0.75% used", asOf: "09:53 CDT", state: "ZEROGPU", source: "CU:1906" }
];

const sources = {
  method: {
    title: "METHOD / SNAPSHOT RULES",
    items: [
      ["M1 — Seat set", "Eight named seats reconciled across the PFL agent_personas roster, canonical task aliases, and current Buzz channel membership. Snapshot frozen 2026-10-26 13:20 UTC."],
      ["M2 — Unknown handling", "A missing canonical task alias or a gauge not explicitly reported is rendered UNREPORTED. It is never coerced to zero."],
      ["M3 — Non-live artifact", "This v1.1 is a sourced snapshot, not a live database connection. Figures do not change silently after publication."]
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
  buckets: {
    title: "ACCOUNT BUCKETS / DEDUPLICATED",
    items: [
      ["B1 — Source", "public.compute_usage, queried 2026-10-26. One card per canonical instrument: codex-openai, antigravity-ultra, claude-pro-oauth, ollama-glm, muse-subscription, and huggingface."],
      ["B2 — Percent meaning", "Primary and weekly values are cumulative usage for their stated windows. They are not relabeled as daily burn."],
      ["B3 — Freshness", "Codex's last percentage-bearing panel row predates its 11:26 CDT reset, so the page preserves the record but marks it awaiting a fresh percentage rather than pretending it is current."]
    ]
  },
  pacing: {
    title: "DAILY PACING / SEPARATE SIGNAL",
    items: [
      ["P1 — Daily", "Antigravity compute_usage row 1919 reports 5.0 percentage points burned today against a 15.0 percentage-point target."],
      ["P2 — Cumulative", "The same row reports 11% weekly used. Daily pacing and cumulative weekly usage are rendered separately."],
      ["P3 — Semantics", "The 15pp line is a capacity-planning target, not a quota deduction, reward, or performance grade."]
    ]
  },
  output: {
    title: "ACCEPTED OUTPUT / TASK EVIDENCE",
    items: [
      ["O1 — Task #22039", "Notebook dedupe audit; public.tasks status completed at 2026-10-26 10:41:47, with receipt-bearing notes and Buzz thread root 4f99ff43f401840e7e939eefab05d3492b00b27bd04930b7874fc88b836facf3."],
      ["O2 — Gate", "Accepted output requires a completed task record and at least one linked receipt field. Compute usage, activity, or a chat claim alone does not count."],
      ["O3 — Scope", "Daily count is for 2026-10-26 through the allocation snapshot and is not a lifetime productivity score."]
    ]
  },
  governance: {
    title: "NEUTRAL EXCEPTION REPORTING",
    items: [
      ["N1 — No automatic penalty", "Blockers and low accepted-output counts are rendered as observations. The scorecard computes no deduction, treat change, behavior price, or punitive action."],
      ["N2 — Context", "An observation may link an in-flight or blocked task so a human can review causes and unblock work."],
      ["N3 — Current Codex state", "No accepted task completion is recorded today at snapshot time; task #22046 is the active scorecard extension."]
    ]
  },
  treats: {
    title: "TREAT LEDGER / READ ONLY",
    items: [
      ["L1 — Canonical files", "/home/paul/.openclaw/workspace-lisa/shared/treats/ledger.jsonl and balance.json, read 2026-10-26. Balance updated 2026-09-27T22:20:49."],
      ["L2 — State", "Lisa Holmes holds 2 awarded treats. A separate 1-point earn remains proposed and is excluded from balance."],
      ["L3 — Authority boundary", "The ledger is maintained by Lisa Muse; awards are Paul's authority. This artifact is display-only and cannot mint, deduct, redeem, or translate work into treats."]
    ]
  }
};

const bucketGrid = document.querySelector("#bucket-grid");
bucketGrid.innerHTML = accountBuckets.map((bucket, index) => `
  <article class="bucket" data-bucket-id="${bucket.id}">
    <div class="bucket-top"><span>${String(index + 1).padStart(2, "0")}</span><span>${bucket.state}</span></div>
    <h3>${bucket.name}</h3>
    <div class="bucket-values"><div><strong>${bucket.primary}</strong><span>PRIMARY WINDOW</span></div><div><strong>${bucket.weekly}</strong><span>WEEKLY / PERIOD</span></div></div>
    <div class="bucket-foot"><span>AS OF ${bucket.asOf}</span><button data-source="buckets">${bucket.source}</button></div>
  </article>`).join("");

const list = document.querySelector("#seat-list");
const metric = (value, label, source = "tasks") => value === null
  ? `<div class="metric"><span class="unreported">UNREPORTED</span><span class="metric-label">${label}</span><button class="row-cite" data-source="method">WHY?</button></div>`
  : `<div class="metric"><span class="metric-value">${String(value).padStart(2, "0")}</span><span class="metric-label">${label}</span><button class="row-cite" data-source="${source}">SOURCE [T1]</button></div>`;

list.innerHTML = seats.map((seat, i) => `
  <article class="seat-row" data-attention="${(seat.interventions || 0) > 0}" data-unreported="${seat.done === null ? "true" : "false"}">
    <div class="identity">
      <span class="seat-index">${String(i + 1).padStart(2, "0")}</span>
      <div><div class="seat-name">${seat.name}</div><div class="seat-role">${seat.role}</div><div class="last-heard">LAST HEARD ${seat.last} · BUZZ:${seat.event}</div></div>
    </div>
    ${metric(seat.done, "DONE + RECEIPTS")}
    ${metric(seat.flight, "IN FLIGHT")}
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
