import { requireSession, wireLogout } from "./app.js";

initialize();

async function initialize() {
  if (!(await requireSession())) return;
  wireLogout();
}
