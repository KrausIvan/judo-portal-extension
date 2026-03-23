/**
 * Content script v2.0 – portál rozhodčích (rozhodci.csju.cz)
 * Parsování tabulky, multi-page scrape, Google Calendar + ICS export
 */
(function () {
  "use strict";

  const DELEGATED_ROLE_TEXTS = ["rozhodčí", "technický", "technický (pomocný)"];

  // ── Parsování ───────────────────────────────────────────────────

  function parseDate(dateStr) {
    if (!dateStr) return null;
    const p = dateStr.trim().split(".");
    if (p.length !== 3) return null;
    return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
  }

  function nextDay(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  function isDelegatedRole(cell) {
    if (!cell) return false;
    const text = cell.textContent.trim().toLowerCase();
    if (text === "mám zájem") return false;
    const bg = window.getComputedStyle(cell).backgroundColor;
    if (bg === "rgb(40, 167, 69)" || bg === "rgb(255, 153, 0)" || bg === "rgb(255, 165, 0)") return true;
    if (cell.classList.contains("bg-success") || cell.classList.contains("bg-warning")) return true;
    if (DELEGATED_ROLE_TEXTS.includes(text)) return true;
    return false;
  }

  function scrapeTable() {
    const tournaments = [];
    const table = document.querySelector("table.dataTable, table.table, table");
    if (!table) return tournaments;
    table.querySelectorAll("tbody tr").forEach((row) => {
      const c = row.querySelectorAll("td");
      if (c.length < 5 || !isDelegatedRole(c[3])) return;
      const startDate = parseDate(c[0]?.textContent.trim());
      if (!startDate) return;
      const endRaw = parseDate(c[1]?.textContent.trim());
      const link = c[2]?.querySelector("a");
      tournaments.push({
        name: link ? link.textContent.trim() : c[2]?.textContent.trim() || "Judo turnaj",
        role: c[3].textContent.trim(),
        startDate,
        endDate: endRaw ? nextDay(endRaw) : nextDay(startDate),
        originalStartDate: c[0]?.textContent.trim(),
        originalEndDate: c[1]?.textContent.trim(),
      });
    });
    return tournaments;
  }

  // ── Multi-page ──────────────────────────────────────────────────

  async function scrapeAllPages() {
    let all = scrapeTable();
    const pages = document.querySelectorAll(
      ".paginate_button:not(.previous):not(.next):not(.active), .pagination a:not(.active)"
    );
    const otherPages = Array.from(pages).filter((l) => /^\d+$/.test(l.textContent.trim()) && l.textContent.trim() !== "1");

    for (const pageLink of otherPages) {
      try {
        pageLink.click();
        await waitForTableUpdate();
        const pageTournaments = scrapeTable();
        const keys = new Set(all.map((t) => `${t.name}|${t.startDate}`));
        for (const t of pageTournaments) {
          if (!keys.has(`${t.name}|${t.startDate}`)) { all.push(t); keys.add(`${t.name}|${t.startDate}`); }
        }
      } catch {}
    }

    // Vrať na stránku 1
    const first = document.querySelector(".paginate_button.first, .paginate_button:not(.previous):first-child");
    if (first && otherPages.length > 0) { first.click(); await waitForTableUpdate(); }
    return all;
  }

  function waitForTableUpdate() {
    return new Promise((resolve) => {
      const tbody = document.querySelector("table tbody");
      if (!tbody) { resolve(); return; }
      let done = false;
      const obs = new MutationObserver(() => { if (!done) { done = true; obs.disconnect(); setTimeout(resolve, 250); } });
      obs.observe(tbody, { childList: true, subtree: true });
      setTimeout(() => { if (!done) { done = true; obs.disconnect(); resolve(); } }, 3000);
    });
  }

  // ── ICS generátor ───────────────────────────────────────────────

  function generateICS(tournaments) {
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "PRODID:-//Judo CSJU//Rozhodci Calendar//CS",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Judo turnaje",
    ];
    tournaments.forEach((t) => {
      const uid = `judo-${t.startDate}-${t.name.replace(/[^a-zA-Z0-9]/g, "").substring(0, 30)}@csju.cz`;
      const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      lines.push(
        "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${t.startDate.replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${t.endDate.replace(/-/g, "")}`,
        `SUMMARY:🥋 ${esc(t.name)}`,
        `DESCRIPTION:Role: ${esc(t.role)}\\nExportováno z Portálu rozhodčích ČSJU`,
        "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:Zítra: ${esc(t.name)}`, "END:VALARM",
        "BEGIN:VALARM", "TRIGGER:-P7D", "ACTION:DISPLAY", `DESCRIPTION:Za týden: ${esc(t.name)}`, "END:VALARM",
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  function esc(s) { return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }

  function downloadICS(tournaments) {
    const blob = new Blob([generateICS(tournaments)], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `judo-turnaje-${new Date().toISOString().split("T")[0]}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    showNotification(`📥 ICS stažen (${tournaments.length} turnajů) – otevři soubor a turnaje se přidají do tvého kalendáře.`, "success");
  }

  // ── UI ──────────────────────────────────────────────────────────

  function injectButtons() {
    const csvBtn = document.querySelector('a[href*="csv"], .buttons-csv, .dt-button');
    const container = csvBtn?.closest(".dt-buttons, .buttons-group") ||
      document.querySelector(".dataTables_wrapper .row:first-child, .card-body");
    if (!container || document.getElementById("judo-gcal-btn")) return;

    const btn = document.createElement("button");
    btn.id = "judo-gcal-btn";
    btn.className = "judo-gcal-export-btn";
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        <polyline points="9 16 11 18 15 14"/>
      </svg>
      <span>📅 Uložit do kalendáře</span>`;
    btn.addEventListener("click", handleExport);
    container.appendChild(btn);
  }

  // ── Export modal ────────────────────────────────────────────────

  async function handleExport() {
    const btn = document.getElementById("judo-gcal-btn");
    const orig = btn.innerHTML;
    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="judo-gcal-spinner"></span><span>Načítám všechny stránky…</span>`;
      const tournaments = await scrapeAllPages();
      if (tournaments.length === 0) { showNotification("Žádné delegované turnaje nenalezeny.", "warning"); return; }
      showModal(tournaments);
    } catch (err) {
      showNotification("Chyba: " + err.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }

  function showModal(tournaments) {
    document.getElementById("judo-gcal-modal")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "judo-gcal-modal";
    overlay.className = "judo-gcal-overlay";

    const modal = document.createElement("div");
    modal.className = "judo-gcal-modal";

    const pageCount = document.querySelectorAll(".paginate_button:not(.previous):not(.next)").length || 1;

    modal.innerHTML = `
      <div class="judo-gcal-modal-header">
        <h3>📅 Export turnajů do kalendáře</h3>
        <button class="judo-gcal-close" id="judo-gcal-close">&times;</button>
      </div>
      <div class="judo-gcal-modal-body">
        <p>Nalezeno <strong>${tournaments.length}</strong> delegovaných turnajů${pageCount > 1 ? ` (ze všech ${pageCount} stránek)` : ""}:</p>
        <div class="judo-gcal-list">
          ${tournaments.map((t, i) => `
            <label class="judo-gcal-item">
              <input type="checkbox" checked data-index="${i}" />
              <div class="judo-gcal-item-info">
                <span class="judo-gcal-item-name">${t.name}</span>
                <span class="judo-gcal-item-meta">
                  ${t.originalStartDate}${t.originalEndDate && t.originalEndDate !== t.originalStartDate ? " – " + t.originalEndDate : ""}
                  · <span class="judo-gcal-role judo-gcal-role-${t.role.toLowerCase().includes("technick") ? "tech" : "ref"}">${t.role}</span>
                </span>
              </div>
            </label>`).join("")}
        </div>
        <div class="judo-gcal-select-actions">
          <a href="#" id="judo-gcal-select-all">Vybrat vše</a> · <a href="#" id="judo-gcal-select-none">Zrušit výběr</a>
        </div>
      </div>
      <div class="judo-gcal-modal-footer">
        <div class="judo-gcal-footer-left">
          <button class="judo-gcal-btn-ics" id="judo-gcal-ics">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Stáhnout .ics soubor
          </button>
          <span class="judo-gcal-ics-hint">Pro Apple Calendar, Outlook, Seznam Kalendář…</span>
        </div>
        <div class="judo-gcal-footer-right">
          <button class="judo-gcal-btn-secondary" id="judo-gcal-cancel">Zrušit</button>
          <button class="judo-gcal-btn-primary" id="judo-gcal-confirm">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Google Kalendář
          </button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById("judo-gcal-close").addEventListener("click", close);
    document.getElementById("judo-gcal-cancel").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    document.getElementById("judo-gcal-select-all").addEventListener("click", (e) => {
      e.preventDefault(); modal.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = true));
    });
    document.getElementById("judo-gcal-select-none").addEventListener("click", (e) => {
      e.preventDefault(); modal.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
    });

    function getSelected() {
      return Array.from(modal.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => tournaments[cb.dataset.index]);
    }

    document.getElementById("judo-gcal-ics").addEventListener("click", () => {
      const sel = getSelected();
      if (sel.length === 0) { showNotification("Vyber alespoň jeden turnaj.", "warning"); return; }
      close(); downloadICS(sel);
    });

    document.getElementById("judo-gcal-confirm").addEventListener("click", () => {
      const sel = getSelected();
      if (sel.length === 0) { showNotification("Vyber alespoň jeden turnaj.", "warning"); return; }
      close(); exportToGoogle(sel);
    });
  }

  // ── Google Calendar export ──────────────────────────────────────

  function exportToGoogle(tournaments) {
    showNotification("Ukládám turnaje do kalendáře…", "info");
    chrome.runtime.sendMessage({ action: "CREATE_EVENTS", tournaments }, (response) => {
      if (chrome.runtime.lastError) {
        const m = chrome.runtime.lastError.message || "";
        if (m.includes("OAuth") || m.includes("identity") || m.includes("token")) {
          showNotification("Nejprve se přihlas ke Google – klikni na ikonku 🥋 vpravo nahoře.", "warning");
        } else { showNotification("Něco se pokazilo. Zkus obnovit stránku (F5).", "error"); }
        return;
      }
      if (response?.success) {
        const ok = response.results.filter((r) => r.success).length;
        const skip = response.results.filter((r) => r.skipped).length;
        const fail = response.results.filter((r) => !r.success && !r.skipped);
        if (ok > 0 && fail.length === 0) {
          let msg = `✅ Hotovo! ${ok} ${ok === 1 ? "turnaj uložen" : ok < 5 ? "turnaje uloženy" : "turnajů uloženo"} do kalendáře.`;
          if (skip > 0) msg += ` (${skip} přeskočeno – už tam jsou)`;
          showNotification(msg, "success");
        } else if (ok === 0 && skip > 0) {
          showNotification(`👍 Všech ${skip} turnajů už máš v kalendáři.`, "success");
        } else {
          showNotification(`Uloženo ${ok}, selhalo ${fail.length}: ${fail[0]?.message || "Neznámá chyba"}`, "error");
        }
      } else {
        const e = response?.error || "Neznámá chyba";
        if (e.includes("cancel")) showNotification("Přihlášení zrušeno. Klikni na 🥋 a přihlas se.", "warning");
        else showNotification("Chyba: " + e, "error");
      }
    });
  }

  // ── Notifikace ──────────────────────────────────────────────────

  function showNotification(message, type = "info") {
    document.querySelector(".judo-gcal-notification")?.remove();
    const n = document.createElement("div");
    n.className = `judo-gcal-notification judo-gcal-notif-${type}`;
    n.textContent = message;
    document.body.appendChild(n);
    requestAnimationFrame(() => n.classList.add("judo-gcal-notif-show"));
    setTimeout(() => { n.classList.remove("judo-gcal-notif-show"); setTimeout(() => n.remove(), 300); }, 6000);
  }

  // ── Init ────────────────────────────────────────────────────────

  function init() {
    const check = setInterval(() => {
      if (document.querySelector("table tbody tr")) {
        clearInterval(check);
        injectButtons();
        const wrapper = document.querySelector(".dataTables_wrapper, .table-responsive, main");
        if (wrapper) new MutationObserver(() => injectButtons()).observe(wrapper, { childList: true, subtree: true });
      }
    }, 500);
    setTimeout(() => clearInterval(check), 10000);
  }

  init();
})();
