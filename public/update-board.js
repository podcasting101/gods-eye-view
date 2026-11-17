/**
 * THE UPDATE BOARD (gev-update-board-v1) — Interactive Graph & Primary Receipt Inspector
 * Renders the Master Execution Handoff (2026-10-27) graph from /gev-intel/update-board.json.
 * Invariant: Never trusts seat self-report; missing independent receipt = UNVERIFIED.
 */
(function () {
  "use strict";

  const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

  function assertLoopbackUrl(rawUrl) {
    const parsed = new URL(rawUrl, window.location.origin);
    const host = (parsed.hostname || "").toLowerCase();
    if (!ALLOWED_HOSTS.has(host)) {
      throw new Error("Two-Zone Privacy Firewall blocked non-loopback URL: " + rawUrl);
    }
    return parsed.toString();
  }

  function stateBadgeColor(state) {
    if (state === "UNVERIFIED") return { bg: "#3b1219", border: "#ff4d6d", text: "#ff8fa3" };
    if (state === "NEEDS_IMPROVEMENT") return { bg: "#3b2610", border: "#f59e0b", text: "#fcd34d" };
    if (state === "VERIFIED_SHADOW_ONLY") return { bg: "#0f2e24", border: "#10b981", text: "#6ee7b7" };
    if (state === "VERIFIED") return { bg: "#0f2e24", border: "#22c55e", text: "#86efac" };
    return { bg: "#1e293b", border: "#64748b", text: "#cbd5e1" };
  }

  let boardData = null;
  let activeFilterState = "ALL";
  let activeFilterOwner = "ALL";
  let selectedItemId = null;

  async function initUpdateBoard() {
    const statusEl = document.getElementById("board-load-status");
    try {
      const targetUrl = assertLoopbackUrl("/gev-intel/update-board.json");
      const resp = await fetch(targetUrl, { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      boardData = await resp.json();
      statusEl.textContent =
        "Loaded " +
        boardData.summary.total_items +
        " handoff nodes · Provenance: " +
        boardData.provenance +
        " · Graphiti: " +
        boardData.graphiti_source.entity_web_node_count +
        " entity_web nodes (" +
        boardData.graphiti_source.graph_total_nodes +
        " total / " +
        boardData.graphiti_source.graph_total_edges +
        " edges)";
      renderSummaryKPIs();
      renderOwnerFilterButtons();
      setupModalHandlers();
      renderGraphSVG();
      renderItemsList();
      if (boardData.items && boardData.items.length > 0) {
        selectItem(boardData.items[0].id);
      }
    } catch (err) {
      statusEl.textContent = "ERROR loading /gev-intel/update-board.json: " + err.message;
      statusEl.style.color = "#ff6b6b";
    }
  }

  function renderSummaryKPIs() {
    const s = boardData.summary;
    document.getElementById("kpi-total").textContent = String(s.total_items);
    document.getElementById("kpi-unverified").textContent = String(s.unverified_count);
    document.getElementById("kpi-needs-imp").textContent = String(s.needs_improvement_count);
    document.getElementById("kpi-verified-shadow").textContent = String(s.verified_shadow_only_count);
    document.getElementById("pattern-banner-text").textContent = s.pattern_diagnostic;
  }

  function renderOwnerFilterButtons() {
    const container = document.getElementById("owner-filter-bar");
    container.innerHTML = "";
    const owners = ["ALL"].concat(Object.keys(boardData.summary.open_ends_by_owner || {}));
    owners.forEach((owner) => {
      const btn = document.createElement("button");
      btn.className = "filter-btn" + (activeFilterOwner === owner ? " active" : "");
      const count =
        owner === "ALL"
          ? boardData.summary.total_items
          : boardData.summary.open_ends_by_owner[owner].open_item_count;
      btn.textContent = owner + " (" + count + ")";
      btn.addEventListener("click", () => {
        activeFilterOwner = owner;
        renderOwnerFilterButtons();
        renderGraphSVG();
        renderItemsList();
      });
      container.appendChild(btn);
    });

    document.querySelectorAll("[data-state-filter]").forEach((btn) => {
      const st = btn.getAttribute("data-state-filter");
      btn.classList.toggle("active", st === activeFilterState);
      btn.onclick = () => {
        activeFilterState = st;
        renderOwnerFilterButtons();
        renderGraphSVG();
        renderItemsList();
      };
    });
  }

  function getFilteredItems() {
    if (!boardData || !boardData.items) return [];
    return boardData.items.filter((item) => {
      if (activeFilterState !== "ALL" && item.verification_state !== activeFilterState) return false;
      if (activeFilterOwner !== "ALL" && item.open_end_owner !== activeFilterOwner) return false;
      return true;
    });
  }

  function openGraphModal() {
    const backdrop = document.getElementById("graph-modal-backdrop");
    if (backdrop) {
      backdrop.classList.add("open");
      renderGraphSVG();
    }
  }

  function closeGraphModal() {
    const backdrop = document.getElementById("graph-modal-backdrop");
    if (backdrop) backdrop.classList.remove("open");
  }

  function setupModalHandlers() {
    const openBtn = document.getElementById("open-graph-modal-btn");
    const closeBtn = document.getElementById("close-graph-modal-btn");
    const backdrop = document.getElementById("graph-modal-backdrop");
    const mainSvg = document.getElementById("update-board-svg");
    const modalSvg = document.getElementById("update-board-modal-svg");

    if (openBtn) openBtn.onclick = openGraphModal;
    if (closeBtn) closeBtn.onclick = closeGraphModal;
    if (backdrop) {
      backdrop.addEventListener("click", (ev) => {
        if (ev.target === backdrop) closeGraphModal();
      });
    }
    if (mainSvg) {
      mainSvg.addEventListener("click", (ev) => {
        if (ev.target === mainSvg) openGraphModal();
      });
    }
    document.querySelectorAll("[data-zoom]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const z = parseFloat(btn.getAttribute("data-zoom") || "1");
        if (modalSvg) {
          modalSvg.style.width = Math.round(z * 100) + "%";
          modalSvg.style.minHeight = Math.round(640 * z) + "px";
        }
      });
    });
    window.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closeGraphModal();
    });
  }

  function renderGraphTarget(svg, width, height, rOwnerX, rOwnerY, rItemX, rItemY, fontScale) {
    if (!svg) return;
    svg.innerHTML = "";
    const cx = width / 2;
    const cy = height / 2;

    const items = getFilteredItems();
    const owners = Object.keys(boardData.summary.open_ends_by_owner || {});

    const ownerPos = {};
    owners.forEach((o, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(1, owners.length) - Math.PI / 2;
      ownerPos[o] = {
        x: cx + Math.cos(angle) * rOwnerX,
        y: cy + Math.sin(angle) * rOwnerY,
      };
    });

    const itemPos = {};
    items.forEach((item, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(1, items.length) - Math.PI / 2;
      itemPos[item.id] = {
        x: cx + Math.cos(angle) * rItemX,
        y: cy + Math.sin(angle) * rItemY,
      };
    });

    items.forEach((item) => {
      const pItem = itemPos[item.id];
      const pOwner = ownerPos[item.open_end_owner] || { x: cx, y: cy };
      const col = stateBadgeColor(item.verification_state).border;

      const lineRoot = document.createElementNS("http://www.w3.org/2000/svg", "line");
      lineRoot.setAttribute("x1", String(cx));
      lineRoot.setAttribute("y1", String(cy));
      lineRoot.setAttribute("x2", String(pOwner.x));
      lineRoot.setAttribute("y2", String(pOwner.y));
      lineRoot.setAttribute("stroke", "#334155");
      lineRoot.setAttribute("stroke-width", String(1.5 * fontScale));
      svg.appendChild(lineRoot);

      const lineItem = document.createElementNS("http://www.w3.org/2000/svg", "line");
      lineItem.setAttribute("x1", String(pOwner.x));
      lineItem.setAttribute("y1", String(pOwner.y));
      lineItem.setAttribute("x2", String(pItem.x));
      lineItem.setAttribute("y2", String(pItem.y));
      lineItem.setAttribute("stroke", col);
      lineItem.setAttribute("stroke-width", selectedItemId === item.id ? String(3.2 * fontScale) : String(1.6 * fontScale));
      lineItem.setAttribute("stroke-opacity", selectedItemId === item.id ? "1.0" : "0.7");
      svg.appendChild(lineItem);
    });

    const rootG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    rootG.style.cursor = "pointer";
    rootG.addEventListener("click", (ev) => {
      ev.stopPropagation();
      selectItem("scorecard-master-handoff-document");
    });
    const rootCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    rootCircle.setAttribute("cx", String(cx));
    rootCircle.setAttribute("cy", String(cy));
    rootCircle.setAttribute("r", String(Math.round(34 * fontScale)));
    rootCircle.setAttribute("fill", "#0f172a");
    rootCircle.setAttribute("stroke", "#38bdf8");
    rootCircle.setAttribute("stroke-width", String(3 * fontScale));
    rootG.appendChild(rootCircle);

    const rootLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    rootLabel.setAttribute("x", String(cx));
    rootLabel.setAttribute("y", String(cy - 4 * fontScale));
    rootLabel.setAttribute("text-anchor", "middle");
    rootLabel.setAttribute("fill", "#e0f2fe");
    rootLabel.setAttribute("font-size", String(Math.round(10 * fontScale)));
    rootLabel.setAttribute("font-weight", "700");
    rootLabel.textContent = "MASTER HANDOFF";
    rootG.appendChild(rootLabel);

    const rootSub = document.createElementNS("http://www.w3.org/2000/svg", "text");
    rootSub.setAttribute("x", String(cx));
    rootSub.setAttribute("y", String(cy + 10 * fontScale));
    rootSub.setAttribute("text-anchor", "middle");
    rootSub.setAttribute("fill", "#7dd3fc");
    rootSub.setAttribute("font-size", String(Math.round(9 * fontScale)));
    rootSub.textContent = "24,804 B (a3cbb971…)";
    rootG.appendChild(rootSub);
    svg.appendChild(rootG);

    owners.forEach((owner) => {
      const pos = ownerPos[owner];
      const stats = boardData.summary.open_ends_by_owner[owner];
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.style.cursor = "pointer";
      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        activeFilterOwner = activeFilterOwner === owner ? "ALL" : owner;
        renderOwnerFilterButtons();
        renderGraphSVG();
        renderItemsList();
      });

      const rw = Math.round(126 * fontScale);
      const rh = Math.round(38 * fontScale);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(pos.x - rw / 2));
      rect.setAttribute("y", String(pos.y - rh / 2));
      rect.setAttribute("width", String(rw));
      rect.setAttribute("height", String(rh));
      rect.setAttribute("rx", "8");
      rect.setAttribute("fill", "#1e1b4b");
      rect.setAttribute("stroke", "#818cf8");
      rect.setAttribute("stroke-width", activeFilterOwner === owner ? "3" : "1.8");
      g.appendChild(rect);

      const t1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t1.setAttribute("x", String(pos.x));
      t1.setAttribute("y", String(pos.y - 3 * fontScale));
      t1.setAttribute("text-anchor", "middle");
      t1.setAttribute("fill", "#e0e7ff");
      t1.setAttribute("font-size", String(Math.round(10.5 * fontScale)));
      t1.setAttribute("font-weight", "700");
      t1.textContent = owner;
      g.appendChild(t1);

      const t2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t2.setAttribute("x", String(pos.x));
      t2.setAttribute("y", String(pos.y + 11 * fontScale));
      t2.setAttribute("text-anchor", "middle");
      t2.setAttribute("fill", "#a5b4fc");
      t2.setAttribute("font-size", String(Math.round(9.2 * fontScale)));
      t2.textContent = stats.open_item_count + " open (" + stats.unverified_count + " UNVERIFIED)";
      g.appendChild(t2);
      svg.appendChild(g);
    });

    items.forEach((item) => {
      const pos = itemPos[item.id];
      const colors = stateBadgeColor(item.verification_state);
      const isSelected = selectedItemId === item.id;

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.style.cursor = "pointer";
      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        selectItem(item.id);
      });

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(pos.x));
      circle.setAttribute("cy", String(pos.y));
      circle.setAttribute("r", String(Math.round((isSelected ? 22 : 17) * fontScale)));
      circle.setAttribute("fill", colors.bg);
      circle.setAttribute("stroke", colors.border);
      circle.setAttribute("stroke-width", isSelected ? "3.5" : "2");
      g.appendChild(circle);

      const stText = document.createElementNS("http://www.w3.org/2000/svg", "text");
      stText.setAttribute("x", String(pos.x));
      stText.setAttribute("y", String(pos.y + 3 * fontScale));
      stText.setAttribute("text-anchor", "middle");
      stText.setAttribute("fill", colors.text);
      stText.setAttribute("font-size", String(Math.round(8.2 * fontScale)));
      stText.setAttribute("font-weight", "700");
      stText.textContent = item.verification_state === "UNVERIFIED" ? "UNVER" : item.verification_state.slice(0, 6);
      g.appendChild(stText);

      const maxChars = fontScale > 1.1 ? 46 : 30;
      const titleShort = item.title.length > maxChars ? item.title.slice(0, maxChars - 2) + "…" : item.title;
      const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lbl.setAttribute("x", String(pos.x));
      lbl.setAttribute("y", String(pos.y + Math.round(32 * fontScale)));
      lbl.setAttribute("text-anchor", "middle");
      lbl.setAttribute("fill", isSelected ? "#ffffff" : "#e2e8f0");
      lbl.setAttribute("font-size", String(Math.round(9.8 * fontScale)));
      lbl.setAttribute("font-weight", isSelected ? "700" : "600");
      lbl.textContent = titleShort;
      g.appendChild(lbl);

      svg.appendChild(g);
    });
  }

  function renderGraphSVG() {
    renderGraphTarget(document.getElementById("update-board-svg"), 920, 560, 135, 115, 245, 220, 1.0);
    renderGraphTarget(document.getElementById("update-board-modal-svg"), 1320, 820, 195, 165, 375, 315, 1.32);
  }

  function renderItemsList() {
    const listEl = document.getElementById("items-card-list");
    listEl.innerHTML = "";
    const items = getFilteredItems();
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "item-row-card" + (selectedItemId === item.id ? " selected" : "");
      const colors = stateBadgeColor(item.verification_state);
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <strong style="font-size:13px;color:#f8fafc;">${escapeHtml(item.title)}</strong>
          <span class="ver-badge" style="background:${colors.bg};border:1px solid ${colors.border};color:${colors.text};">
            ${escapeHtml(item.verification_state)}
          </span>
        </div>
        <div style="font-size:11.5px;color:#94a3b8;margin-top:4px;">
          Open End: <strong style="color:#e2e8f0;">${escapeHtml(item.open_end_owner)}</strong>
          · Build: <code>${escapeHtml(item.build_state)}</code>
        </div>
      `;
      card.addEventListener("click", () => selectItem(item.id));
      listEl.appendChild(card);
    });
  }

  function selectItem(itemId) {
    selectedItemId = itemId;
    renderGraphSVG();
    renderItemsList();

    const item = (boardData.items || []).find((x) => x.id === itemId);
    const panel = document.getElementById("receipt-inspector-body");
    const modalBar = document.getElementById("graph-modal-selected-bar");
    if (modalBar && item) {
      modalBar.innerHTML =
        `<strong>Selected:</strong> ${escapeHtml(item.title)} · ` +
        `<strong>State:</strong> <code>${escapeHtml(item.verification_state)}</code> · ` +
        `<strong>Open End:</strong> <span style="color:#38bdf8;font-weight:700;">${escapeHtml(item.open_end_owner)}</span> — ` +
        `<span style="color:#93c5fd;">${escapeHtml(item.open_end_summary)}</span>`;
    }
    if (!item) {
      panel.innerHTML = "<p>Select a node to inspect its primary receipts.</p>";
      return;
    }
    const colors = stateBadgeColor(item.verification_state);

    const artifactsHtml = (item.artifacts || [])
      .map((a) => {
        const st = a.exists ? `SHA-256: ${a.sha256} (${a.size_bytes} B)` : "MISSING ON DISK (UNVERIFIED)";
        return `<li style="margin-bottom:6px;">
          <code>${escapeHtml(a.path)}</code><br/>
          <span style="color:${a.exists ? "#6ee7b7" : "#ff8fa3"};font-size:11px;">${escapeHtml(st)}</span>
        </li>`;
      })
      .join("");

    const testHtml = item.local_test_receipt
      ? `<div class="receipt-box">
          <div><strong>Command:</strong> <code>${escapeHtml(item.local_test_receipt.command)}</code></div>
          <div><strong>Result:</strong> ${escapeHtml(item.local_test_receipt.summary)} (exit=${item.local_test_receipt.exit_code})</div>
          <div style="color:#fcd34d;font-size:11px;margin-top:3px;">
            Invariant: Author self-report accepted = <strong>${String(item.author_self_report_accepted)}</strong>
            (local test alone never flips UNVERIFIED -> VERIFIED without independent reviewer receipt).
          </div>
        </div>`
      : `<div class="receipt-box">No standalone unittest suite attached to this item.</div>`;

    const rev = item.independent_reviewer_receipt;
    const revHtml = rev
      ? `<div class="receipt-box" style="border-color:#10b981;">
          <div><strong>Buzz Event ID:</strong> <code>${escapeHtml(rev.event_id)}</code></div>
          <div><strong>Signer Pubkey:</strong> <code>${escapeHtml(rev.pubkey)}</code> (${escapeHtml(rev.created_at_utc)})</div>
          <div style="font-size:11px;color:#cbd5e1;margin-top:4px;">${escapeHtml(rev.excerpt)}</div>
        </div>`
      : `<div class="receipt-box" style="border-color:#ff4d6d;color:#ff8fa3;">
          <strong>NO INDEPENDENT REVIEWER RECEIPT FOUND</strong> — Node state remains strictly <strong>UNVERIFIED</strong>.
        </div>`;

    const tasksHtml = (item.linked_tasks || [])
      .map(
        (t) =>
          `<li><code>#${t.task_id}</code> [${escapeHtml(t.status)}] owner=<strong>${escapeHtml(
            t.assigned_to
          )}</strong> (updates=${t.task_updates_count}) — ${escapeHtml(t.title)}</li>`
      )
      .join("");

    const graphitiHtml = (item.graphiti_entities || [])
      .map(
        (g) =>
          `<li><strong>${escapeHtml(g.name)}</strong> — id: <code>${escapeHtml(g.id)}</code> · uuid: <code>${escapeHtml(
            g.uuid
          )}</code></li>`
      )
      .join("");

    const cmdsHtml = (item.rerun_verification_commands || [])
      .map((c) => `<pre style="background:#090d16;padding:8px;border-radius:6px;overflow-x:auto;font-size:11px;border:1px solid #1e293b;">${escapeHtml(c)}</pre>`)
      .join("");

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <h3 style="margin:0;font-size:16px;color:#f8fafc;">${escapeHtml(item.title)}</h3>
        <span class="ver-badge" style="background:${colors.bg};border:1px solid ${colors.border};color:${colors.text};font-size:12px;padding:4px 10px;">
          ${escapeHtml(item.verification_state)}
        </span>
      </div>
      <div style="margin-top:8px;font-size:12.5px;color:#cbd5e1;">
        <strong>Open-End Holder:</strong> <span style="color:#38bdf8;font-weight:700;">${escapeHtml(item.open_end_owner)}</span>
        · <strong>Author Lane:</strong> ${escapeHtml(item.author_seat)}
        · <strong>Build State:</strong> <code>${escapeHtml(item.build_state)}</code>
      </div>
      <div style="margin-top:8px;padding:10px;background:#111827;border-left:3px solid ${colors.border};border-radius:4px;font-size:12px;">
        <div><strong>Scorecard / Handoff Baseline:</strong> ${escapeHtml(item.handoff_scorecard_line)}</div>
        <div style="margin-top:5px;color:#93c5fd;"><strong>Primary-Receipt Diagnostic:</strong> ${escapeHtml(item.open_end_summary)}</div>
      </div>

      <h4 class="sec-hdr">1. Independent Reviewer Receipt (Buzz Cryptographic Log)</h4>
      ${revHtml}

      <h4 class="sec-hdr">2. Primary Filesystem Receipts (SHA-256 & Byte Size)</h4>
      <ul style="padding-left:18px;margin:4px 0;font-size:12px;">${artifactsHtml}</ul>

      <h4 class="sec-hdr">3. Executed Unit Test Receipt</h4>
      ${testHtml}

      <h4 class="sec-hdr">4. Live Postgres public.tasks Rows</h4>
      <ul style="padding-left:18px;margin:4px 0;font-size:12px;">${tasksHtml}</ul>

      <h4 class="sec-hdr">5. Resolved Neo4j / Graphiti entity_web Nodes</h4>
      <ul style="padding-left:18px;margin:4px 0;font-size:12px;">${graphitiHtml}</ul>

      <h4 class="sec-hdr">6. Re-Runnable Verification Commands (For Codex / CTO Audit)</h4>
      ${cmdsHtml}
    `;
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  window.addEventListener("DOMContentLoaded", initUpdateBoard);
})();
