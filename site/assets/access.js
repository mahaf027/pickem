import { API_BASE_URL } from "./config.js";
import { apiConfigured, saveSession } from "./app.js";

const poolForm = document.querySelector("[data-pool-form]");
const accountPanel = document.querySelector("[data-account-panel]");
const accountForm = document.querySelector("[data-account-form]");
const modeButtons = document.querySelectorAll("[data-mode]");
const accountTitle = document.querySelector("[data-account-title]");
const submitLabel = document.querySelector("[data-account-submit]");
const poolError = document.querySelector("[data-pool-error]");
const accountError = document.querySelector("[data-account-error]");
const setupNotice = document.querySelector("[data-setup-notice]");

let poolToken = sessionStorage.getItem("pickem.poolToken");
let mode = "login";

if (!apiConfigured()) {
  setupNotice.hidden = false;
  setupNotice.textContent = "Backend setup is not complete. The site owner needs to add the Worker URL in assets/config.js.";
  poolForm.querySelector("button").disabled = true;
}

if (poolToken) showAccountPanel();

poolForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(poolForm, true);
  poolError.hidden = true;
  try {
    const password = new FormData(poolForm).get("poolPassword");
    const response = await fetch(`${API_BASE_URL}/api/pool/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not enter the pool.");
    poolToken = payload.poolToken;
    sessionStorage.setItem("pickem.poolToken", poolToken);
    showAccountPanel();
  } catch (error) {
    poolError.textContent = error.message;
    poolError.hidden = false;
  } finally {
    setBusy(poolForm, false);
  }
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    mode = button.dataset.mode;
    modeButtons.forEach((item) => item.setAttribute("aria-selected", String(item === button)));
    accountTitle.textContent = mode === "register" ? "Create your account" : "Welcome back";
    submitLabel.textContent = mode === "register" ? "Create account" : "Sign in";
    accountError.hidden = true;
  });
});

accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(accountForm, true);
  accountError.hidden = true;
  const values = Object.fromEntries(new FormData(accountForm));
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Pool-Token": poolToken },
      body: JSON.stringify(values)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Account request failed.");
    saveSession(payload);
    const next = new URLSearchParams(location.search).get("next") || "";
    location.replace(`../${next}`);
  } catch (error) {
    if (/pool access/i.test(error.message)) {
      sessionStorage.removeItem("pickem.poolToken");
      poolToken = null;
      accountPanel.hidden = true;
      poolForm.hidden = false;
    }
    accountError.textContent = error.message;
    accountError.hidden = false;
  } finally {
    setBusy(accountForm, false);
  }
});

function showAccountPanel() {
  poolForm.hidden = true;
  accountPanel.hidden = false;
  accountPanel.querySelector("input")?.focus();
}

function setBusy(form, busy) {
  const button = form.querySelector("button[type='submit']");
  button.disabled = busy;
  form.setAttribute("aria-busy", String(busy));
}
