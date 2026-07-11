const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");
const router = express.Router();

router.get("/", requirePermission("gifts", "view"), logAccess("gifts"), async (req, res) => {
  const r = await pool.query(
    `SELECT g.*, d.name AS doctor_name FROM gifts g LEFT JOIN doctors d ON d.id = g.doctor_id ORDER BY gift_date DESC`
  );
  res.json(r.rows);
});

router.post("/", requirePermission("gifts", "write"), logAccess("gifts"), async (req, res) => {
  const { date, repName, company, gift, doctorId, amount } = req.body;
  if (!date || !repName) return res.status(400).json({ error: "date and repName are required" });
  const r = await pool.query(
    `INSERT INTO gifts (gift_date, rep_name, company, gift_description, doctor_id, amount) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [date, repName, company || null, gift || null, doctorId || null, Number(amount) || 0]
  );
  res.status(201).json(r.rows[0]);
});

router.delete("/:id", requirePermission("gifts", "delete"), logAccess("gifts"), async (req, res) => {
  await pool.query("DELETE FROM gifts WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
