const MODULES = ["cases", "collections", "doctorPay", "referrals", "gifts", "expenses", "assets", "statements", "auditLog"];
const LEVELS = ["none", "view", "write", "edit", "delete"];

function emptyPermissions() {
  const p = {};
  MODULES.forEach((m) => { p[m] = { level: "none", export: false }; });
  return p;
}
function fullPermissions() {
  const p = {};
  MODULES.forEach((m) => { p[m] = { level: "delete", export: true }; });
  return p;
}
function levelAtLeast(perms, moduleKey, required) {
  const level = perms?.[moduleKey]?.level || "none";
  return LEVELS.indexOf(level) >= LEVELS.indexOf(required);
}

module.exports = { MODULES, LEVELS, emptyPermissions, fullPermissions, levelAtLeast };
