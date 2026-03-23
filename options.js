const DEFAULT = { eventColor: "10", calendarId: "primary", reminder1: 1440, reminder2: 10080, addEmoji: true };
const els = {};

document.addEventListener("DOMContentLoaded", () => {
  ["calendarId", "reminder1", "reminder2", "addEmoji"].forEach((id) => { els[id] = document.getElementById(id); });
  loadSettings();

  document.querySelectorAll(".color-opt").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".color-opt").forEach((e) => e.classList.remove("active"));
      el.classList.add("active");
    });
  });

  document.getElementById("btnSave").addEventListener("click", saveSettings);
  document.getElementById("btnReset").addEventListener("click", () => { if (confirm("Obnovit výchozí nastavení?")) applyToUI(DEFAULT); });
});

function loadSettings() {
  chrome.storage.sync.get("settings", (data) => applyToUI({ ...DEFAULT, ...(data.settings || {}) }));
}

function applyToUI(s) {
  document.querySelectorAll(".color-opt").forEach((el) => el.classList.toggle("active", el.dataset.value === s.eventColor));
  els.calendarId.value = s.calendarId || "primary";
  els.reminder1.value = s.reminder1;
  els.reminder2.value = s.reminder2;
  els.addEmoji.checked = s.addEmoji;
}

function saveSettings() {
  const active = document.querySelector(".color-opt.active");
  const settings = {
    eventColor: active?.dataset.value || "10",
    calendarId: els.calendarId.value || "primary",
    reminder1: parseInt(els.reminder1.value) || 0,
    reminder2: parseInt(els.reminder2.value) || 0,
    addEmoji: els.addEmoji.checked,
  };
  chrome.runtime.sendMessage({ action: "SAVE_SETTINGS", settings }, () => {
    const msg = document.getElementById("savedMsg");
    msg.classList.add("show");
    setTimeout(() => msg.classList.remove("show"), 2500);
  });
}
