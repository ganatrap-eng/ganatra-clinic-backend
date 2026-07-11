const { pool } = require("../db");

const ACTION_BY_METHOD = { GET: "view", POST: "write", PUT: "edit", DELETE: "delete" };

/** Records a row in audit_log for every request that reaches this point
 *  (i.e. after permission checks already passed). Fire-and-forget so a
 *  logging hiccup never blocks or fails the actual request. */
function logAccess(moduleKey) {
  return (req, res, next) => {
    const action = ACTION_BY_METHOD[req.method] || "other";
    const label = `${req.user.name || req.user.userId} (${req.user.userId})`;
    pool.query(
      `INSERT INTO audit_log (user_id, user_label, module, action, method, path) VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.user.sub, label, moduleKey, action, req.method, req.originalUrl]
    ).catch((e) => console.error("audit log insert failed", e));
    next();
  };
}

module.exports = { logAccess };
