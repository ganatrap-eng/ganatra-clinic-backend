const { pool } = require("../db");

const ACTION_BY_METHOD = { GET: "view", POST: "write", PUT: "edit", DELETE: "delete" };

/** Fire-and-forget insert into audit_log. Shared by the per-route logAccess
 *  middleware below and by call sites that don't have req.user yet — most
 *  importantly login itself, which previously left no audit trail at all:
 *  a user who logged in but only browsed (or only touched routes without
 *  logAccess) would never appear in the User Access Report. */
function recordAccess({ userId, label, module, action, method, path }) {
  pool.query(
    `INSERT INTO audit_log (user_id, user_label, module, action, method, path) VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId, label, module, action, method || null, path || null]
  ).catch((e) => console.error("audit log insert failed", e));
}

/** Records a row in audit_log for every request that reaches this point
 *  (i.e. after permission checks already passed). Fire-and-forget so a
 *  logging hiccup never blocks or fails the actual request. */
function logAccess(moduleKey) {
  return (req, res, next) => {
    const action = ACTION_BY_METHOD[req.method] || "other";
    const label = `${req.user.name || req.user.userId} (${req.user.userId})`;
    recordAccess({ userId: req.user.sub, label, module: moduleKey, action, method: req.method, path: req.originalUrl });
    next();
  };
}

module.exports = { logAccess, recordAccess };
