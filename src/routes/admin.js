const express = require("express");
const { pool } = require("../db");
const { requireRole } = require("../middleware/auth");
const { MODULES, LEVELS } = require("../utils/permissions");
const { logAccess } = require("../middleware/audit");

const router = express.Router();
router.use(requireRole("Admin"));

// GET /api/admin/users — everyone, including pending
router.get("/users", async (req, res) => {
  const r = await pool.query(
    `SELECT id, user_id, name, role, email, mobile, status, permissions, doctor_id, created_at
     FROM users ORDER BY (status = 'pending_approval') DESC, created_at DESC`
  );
  res.json(r.rows);
});

// PUT /api/admin/users/:id/permissions  { role, permissions, doctorId, activate }
router.put("/users/:id/permissions", logAccess("admin"), async (req, res) => {
  const { role, permissions, doctorId, activate } = req.body;
  if (permissions) {
    for (const m of MODULES) {
      const p = permissions[m];
      if (!p || !LEVELS.includes(p.level)) {
        return res.status(400).json({ error: `Invalid permission level for ${m}.` });
      }
    }
  }
  if (doctorId) {
    const dr = await pool.query("SELECT 1 FROM doctors WHERE id = $1", [doctorId]);
    if (dr.rowCount === 0) return res.status(400).json({ error: "That doctor profile doesn't exist." });
  }
  const fields = [];
  const values = [];
  let i = 1;
  if (role !== undefined) { fields.push(`role = $${i++}`); values.push(role); }
  if (permissions !== undefined) { fields.push(`permissions = $${i++}`); values.push(JSON.stringify(permissions)); }
  if (doctorId !== undefined) { fields.push(`doctor_id = $${i++}`); values.push(doctorId || null); }
  if (activate) { fields.push(`status = 'active'`); }
  if (fields.length === 0) return res.status(400).json({ error: "Nothing to update." });
  values.push(req.params.id);
  const r = await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = $${i} RETURNING id, user_id, name, role, status, permissions, doctor_id`, values);
  if (r.rowCount === 0) return res.status(404).json({ error: "User not found." });
  res.json(r.rows[0]);
});

// PUT /api/admin/users/:id/deactivate
router.put("/users/:id/deactivate", logAccess("admin"), async (req, res) => {
  if (req.params.id === req.user.sub) return res.status(400).json({ error: "You can't deactivate your own account." });
  await pool.query(`UPDATE users SET status = 'pending_approval' WHERE id = $1`, [req.params.id]);
  res.status(204).end();
});

module.exports = router;
