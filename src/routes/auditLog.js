const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");

const router = express.Router();

// GET /api/audit-log?from=YYYY-MM-DD&to=YYYY-MM-DD&module=&user=&action=&userId=&limit=
router.get("/", requirePermission("auditLog", "view"), async (req, res) => {
  const { from, to, module, userId, action, user, limit } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;
  if (from) { conditions.push(`created_at >= $${i++}`); params.push(from); }
  if (to) { conditions.push(`created_at < ($${i++}::date + interval '1 day')`); params.push(to); }
  if (module) { conditions.push(`module = $${i++}`); params.push(module); }
  if (userId) { conditions.push(`user_id = $${i++}`); params.push(userId); }
  if (action) { conditions.push(`action = $${i++}`); params.push(action); }
  if (user) {
    // Every word must appear somewhere in the label, in any order — same
    // forgiving match every other search box in the app uses — applied in
    // SQL so it searches the full date-range match, not just whichever
    // rows happened to fit under the row cap below.
    user.trim().split(/\s+/).filter(Boolean).forEach((w) => { conditions.push(`user_label ILIKE $${i++}`); params.push(`%${w}%`); });
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const cap = Math.min(Number(limit) || 500, 5000);

  const r = await pool.query(
    `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ${cap}`,
    params
  );
  res.json(r.rows);
});

module.exports = router;
