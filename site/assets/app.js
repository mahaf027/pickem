import { API_BASE_URL } from "./config.js";

const TOKEN_KEY = "pickem.session";
const USER_KEY = "pickem.user";

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = new Date().getFullYear();
});

export function apiConfigured() {
  return Boolean(API_BASE_URL && !API_BASE_URL.includes("REPLACE"));
}

export async function api(path, options = {}) {
  if (!apiConfigured()) {
    throw new Error("The API URL has not been configured yet. See DEPLOYMENT.md.");
  }
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set("Content-Type", "application/json");
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && token) {
    clearSession();
    redirectToAccess();
    throw new Error(payload.error || "Your session has expired.");
  }
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

export function saveSession(payload) {
  localStorage.setItem(TOKEN_KEY, payload.token);
  localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function currentUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

export async function requireSession() {
  if (!localStorage.getItem(TOKEN_KEY)) {
    redirectToAccess();
    return false;
  }
  try {
    const { user } = await api("/api/me");
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    document.querySelectorAll("[data-username]").forEach((element) => {
      element.textContent = user.username;
    });
    document.documentElement.classList.remove("auth-pending");
    return true;
  } catch (error) {
    // api() handles expired sessions and redirects to access. For connection
    // failures, reveal the page so its normal error treatment can be shown.
    document.documentElement.classList.remove("auth-pending");
    showPageError(error.message);
    return false;
  }
}

export function redirectToAccess() {
  const root = document.body.dataset.root || "./";
  const page = location.pathname.match(/\/(picks|player)\/$/)?.[1];
  const current = page ? `${page}/${location.search}` : "";
  location.replace(`${root}access/?next=${encodeURIComponent(current)}`);
}

export function wireLogout() {
  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", async () => {
      try { await api("/api/auth/logout", { method: "POST" }); } catch { /* Session is cleared either way. */ }
      clearSession();
      redirectToAccess();
    });
  });
}

const LOGO_FILES = {
  ARI: "Arizona_Cardinals.png", ATL: "Atlanta_Falcons.png", BAL: "Baltimore_Ravens.png",
  BUF: "Buffalo_Bills.png", CAR: "Carolina_Panthers.png", CHI: "Chicago_Bears.png",
  CIN: "Cincinnati_Bengals.png", CLE: "Cleveland_Browns.png", DAL: "Dallas_Cowboys.png",
  DEN: "Denver_Broncos.png", DET: "Detroit_Lions.png", GB: "Green_Bay_Packers_transparent.png",
  HOU: "Houston_Texans.png", IND: "Indianapolis_Colts.png", JAX: "Jacksonville_Jaguars.png",
  KC: "Kansas_City_Chiefs.png", LV: "Las_Vegas_Raiders.png", LAC: "Los_Angeles_Chargers.png",
  LAR: "Los_Angeles_Rams.png", MIA: "Miami_Dolphins.png", MIN: "Minnesota_Vikings.png",
  NE: "New_England_Patriots.png", NO: "New_Orleans_Saints_transparent.png", NYG: "New_York_Giants.png",
  NYJ: "New_York_Jets.png", PHI: "Philadelphia_Eagles.png", PIT: "Pittsburgh_Steelers_transparent.png",
  SEA: "Seattle_Seahawks.png", SF: "San_Francisco_49ers.png", TB: "Tampa_Bay_Buccaneers_transparent.png",
  TEN: "Tennessee_Titans.png", WSH: "Washington_Commanders.png", W: "Washington_Commanders.png"
};

export function logoUrl(abbreviation) {
  const root = document.body.dataset.root || "./";
  const file = LOGO_FILES[abbreviation] || LOGO_FILES[abbreviation?.replace("WAS", "WSH")];
  return file ? `${root}assets/nfl_team_logos/${file}` : "";
}

export function formatKickoff(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

export function showPageError(message) {
  const target = document.querySelector("[data-page-error]");
  if (!target) return;
  target.textContent = message;
  target.hidden = false;
}
