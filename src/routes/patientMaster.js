const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");
const router = express.Router();

router.get("/", requirePermission("cases", "view"), logAccess("cases"), async (req, res) => {
  const r = await pool.query("SELECT * FROM patients_master ORDER BY name");
  res.json(r.rows);
});

// GET /api/patient-master/search?q=  (matches name OR mobile) — used to
// auto-fill Case Records as staff type a name or phone number.
router.get("/search", requirePermission("cases", "view"), async (req, res) => {
  const q = `%${(req.query.q || "").trim()}%`;
  if (!q || q === "%%") return res.json([]);
  const r = await pool.query(
    `SELECT * FROM patients_master WHERE name ILIKE $1 OR mobile ILIKE $1 ORDER BY name LIMIT 15`,
    [q]
  );
  res.json(r.rows);
});

router.post("/", requirePermission("cases", "write"), logAccess("cases"), async (req, res) => {
  const { name, mobile, gender, dob, address } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Patient name is required" });
  const r = await pool.query(
    `INSERT INTO patients_master (name, mobile, gender, dob, address) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, mobile || null, gender || null, dob || null, address || null]
  );
  res.status(201).json(r.rows[0]);
});

router.put("/:id", requirePermission("cases", "edit"), logAccess("cases"), async (req, res) => {
  const { name, mobile, gender, dob, address } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Patient name is required" });
  const r = await pool.query(
    `UPDATE patients_master SET name=$1, mobile=$2, gender=$3, dob=$4, address=$5 WHERE id=$6 RETURNING *`,
    [name, mobile || null, gender || null, dob || null, address || null, req.params.id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: "Patient not found" });
  res.json(r.rows[0]);
});

router.delete("/:id", requirePermission("cases", "delete"), logAccess("cases"), async (req, res) => {
  await pool.query("DELETE FROM patients_master WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
