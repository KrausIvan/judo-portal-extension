/**
 * Background Service Worker v2.0
 * OAuth + Google Calendar API + Settings
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

const DEFAULT_SETTINGS = {
  eventColor: "10",       // basil (zelená)
  calendarId: "primary",
  reminder1: 1440,        // 1 den
  reminder2: 10080,       // 1 týden
  addEmoji: true,
};

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("settings", (data) => {
      resolve({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
    });
  });
}

// ── Message handler ───────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    CREATE_EVENTS: () =>
      handleCreateEvents(message.tournaments).then((r) => ({ success: true, results: r })),
    CHECK_AUTH: () =>
      getAuthToken(false).then((t) => ({ authenticated: !!t })).catch(() => ({ authenticated: false })),
    SIGN_OUT: () =>
      handleSignOut().then(() => ({ success: true })),
    GET_USER_INFO: () => getUserInfo(),
    GET_SETTINGS: () => getSettings().then((s) => ({ settings: s })),
    SAVE_SETTINGS: () =>
      new Promise((resolve) => {
        chrome.storage.sync.set({ settings: message.settings }, () => resolve({ success: true }));
      }),
  };

  const handler = handlers[message.action];
  if (handler) {
    handler()
      .then((r) => sendResponse(r))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ── OAuth ─────────────────────────────────────────────────────────

async function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(token);
    });
  });
}

async function getUserInfo() {
  try {
    const token = await getAuthToken(false);
    if (!token) return { email: null };
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { const d = await res.json(); return { email: d.email, name: d.name }; }
  } catch {}
  return { email: null };
}

async function handleSignOut() {
  const token = await getAuthToken(false);
  if (token) {
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
    await new Promise((res) => chrome.identity.removeCachedAuthToken({ token }, res));
  }
}

// ── Vytváření událostí ────────────────────────────────────────────

async function handleCreateEvents(tournaments) {
  let token = await getAuthToken(true);
  if (!token) throw new Error("Nepodařilo se přihlásit ke Google účtu.");

  const settings = await getSettings();
  const calId = encodeURIComponent(settings.calendarId);
  const existing = await fetchExistingEvents(token, tournaments, calId);
  const results = [];

  for (const t of tournaments) {
    try {
      const nameLower = t.name.toLowerCase();
      const isDup = existing.some((ev) => {
        if (!ev.summary) return false;
        const sLower = ev.summary.toLowerCase();
        const nameMatch = sLower.includes(nameLower) || nameLower.includes(sLower.replace("🥋 ", "").trim());
        const evDate = ev.start?.date || ev.start?.dateTime?.substring(0, 10);
        return nameMatch && evDate === t.startDate;
      });

      if (isDup) {
        results.push({ name: t.name, success: false, skipped: true });
        continue;
      }

      const event = buildEvent(t, settings);
      const res = await fetch(`${CALENDAR_API}/calendars/${calId}/events`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try { errMsg = (await res.json()).error?.message || errMsg; } catch {}

        if (res.status === 401) {
          await new Promise((r) => chrome.identity.removeCachedAuthToken({ token }, r));
          token = await getAuthToken(true);
          const retry = await fetch(`${CALENDAR_API}/calendars/${calId}/events`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(event),
          });
          if (retry.ok) { results.push({ name: t.name, success: true }); continue; }
        }
        results.push({ name: t.name, success: false, message: errMsg });
        continue;
      }

      results.push({ name: t.name, success: true });
    } catch (err) {
      results.push({ name: t.name, success: false, message: err.message });
    }
  }

  const ok = results.filter((r) => r.success).length;
  chrome.storage.local.set({ lastExport: { date: new Date().toISOString(), count: ok, total: results.length } });
  return results;
}

function buildEvent(t, settings) {
  const summary = settings.addEmoji ? `🥋 ${t.name}` : t.name;
  const description = [
    `Role: ${t.role}`,
    `Datum: ${t.originalStartDate}${t.originalEndDate ? " – " + t.originalEndDate : ""}`,
    "", "📌 Exportováno z Portálu rozhodčích ČSJU", "https://rozhodci.csju.cz/backend",
  ].join("\n");

  const reminders = { useDefault: false, overrides: [] };
  if (settings.reminder1 > 0) reminders.overrides.push({ method: "popup", minutes: settings.reminder1 });
  if (settings.reminder2 > 0) reminders.overrides.push({ method: "popup", minutes: settings.reminder2 });
  if (reminders.overrides.length === 0) reminders.useDefault = true;

  return { summary, description, start: { date: t.startDate }, end: { date: t.endDate }, reminders, colorId: settings.eventColor, transparency: "opaque" };
}

async function fetchExistingEvents(token, tournaments, calId) {
  if (tournaments.length === 0) return [];
  const dates = tournaments.map((t) => t.startDate).sort();
  const last = new Date(dates[dates.length - 1] + "T00:00:00");
  last.setDate(last.getDate() + 7);

  const url = new URL(`${CALENDAR_API}/calendars/${calId}/events`);
  url.searchParams.set("timeMin", dates[0] + "T00:00:00Z");
  url.searchParams.set("timeMax", last.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("maxResults", "250");

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).items || [];
  } catch (err) {
    if (err.message.includes("HTTP")) throw new Error(`Calendar API nefunguje (${err.message}).`);
    return [];
  }
}
