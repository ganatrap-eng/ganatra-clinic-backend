const { pool } = require("../db");
const { levelAtLeast } = require("../utils/permissions");

/** Admins always pass. Everyone else needs at least `level` on `moduleKey`,
 *  checked against the database (not the JWT) so permission changes apply
 *  immediately without waiting for the token to expire. */
function requirePermission(moduleKey, level) {
  return async (req, res, next) => {
    if (req.user.role === "Admin") return next();
    try {
      const r = await pool.query("SELECT permissions, status FROM users WHERE id = $1", [req.user.sub]);
      const row = r.rows[0];
      if (!row || row.status !== "active") {
        return res.status(403).json({ error: "Your account isn't active yet." });
      }
      if (!levelAtLeast(row.permissions, moduleKey, level)) {
        return res.status(403).json({ error: `You don't have ${level} access to this module.` });
      }
      next();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not verify permissions." });
    }
  };
}

module.exports = { requirePermission };
