const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");

const router = express.Router();

// GET /api/audit-log?from=YYYY-MM-DD&to=YYYY-MM-DD&module=&userId=&limit=
router.get("/", requirePermission("auditLog", "view"), async (req, res) => {
  const { from, to, module, userId, limit } = req.query;
  const conditions = [];
  const params = [];
  let i = 1;
  if (from) { conditions.push(`created_at >= $${i++}`); params.push(from); }
  if (to) { conditions.push(`created_at < ($${i++}::date + interval '1 day')`); params.push(to); }
  if (module) { conditions.push(`module = $${i++}`); params.push(module); }
  if (userId) { conditions.push(`user_id = $${i++}`); params.push(userId); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const cap = Math.min(Number(limit) || 500, 5000);

  const r = await pool.query(
    `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ${cap}`,
    params
  );
  res.json(r.rows);
});

module.exports = router;
