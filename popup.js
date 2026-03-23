document.addEventListener("DOMContentLoaded", () => {
  const screens = { loading: document.getElementById("screenLoading"), welcome: document.getElementById("screenWelcome"), dash: document.getElementById("screenDash") };

  function show(name) { Object.values(screens).forEach((s) => s.classList.remove("active")); screens[name]?.classList.add("active"); }
  function msg(m) { return new Promise((res, rej) => { chrome.runtime.sendMessage(m, (r) => { if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message)); else res(r); }); }); }

  async function checkAuth() {
    show("loading");
    try { const r = await msg({ action: "CHECK_AUTH" }); r?.authenticated ? await showDash() : show("welcome"); }
    catch { show("welcome"); }
  }

  async function showDash() {
    show("dash");
    try {
      const info = await msg({ action: "GET_USER_INFO" });
      if (info?.email) {
        document.getElementById("accountEmail").textContent = info.email;
        document.getElementById("accountAvatar").textContent = info.email.charAt(0).toUpperCase();
      } else { document.getElementById("accountEmail").textContent = "Google účet připojen"; document.getElementById("accountAvatar").textContent = "✓"; }
    } catch { document.getElementById("accountEmail").textContent = "Google účet připojen"; document.getElementById("accountAvatar").textContent = "✓"; }

    chrome.storage.local.get("lastExport", (data) => {
      if (data.lastExport) {
        document.getElementById("statsRow").style.display = "flex";
        document.getElementById("statCount").textContent = data.lastExport.count;
        const d = new Date(data.lastExport.date);
        document.getElementById("statDate").textContent = d.toLocaleDateString("cs-CZ", { day: "numeric", month: "short" });
      }
    });
  }

  document.getElementById("btnLogin").addEventListener("click", async function () {
    const btn = this, err = document.getElementById("loginError");
    btn.disabled = true; btn.textContent = "Přihlašuji…"; err.classList.remove("show");
    try {
      const token = await new Promise((res, rej) => { chrome.identity.getAuthToken({ interactive: true }, (t) => { if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message)); else res(t); }); });
      if (token) await showDash();
    } catch (e) {
      err.textContent = e.message.includes("cancel") ? "Přihlášení bylo zrušeno. Zkus to znovu." : "Přihlášení se nezdařilo: " + e.message;
      err.classList.add("show");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#34A853" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Přihlásit se přes Google`;
    }
  });

  document.getElementById("btnSettings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  document.getElementById("btnDisconnect").addEventListener("click", async () => {
    if (!confirm("Odpojit Google účet? Události v kalendáři zůstanou.")) return;
    try { await msg({ action: "SIGN_OUT" }); chrome.storage.local.remove("lastExport"); show("welcome"); }
    catch (e) { alert("Chyba: " + e.message); }
  });

  checkAuth();
});
