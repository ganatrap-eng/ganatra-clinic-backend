const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");
const router = express.Router();

router.get("/", requirePermission("statements", "view"), logAccess("statements"), async (req, res) => {
  const r = await pool.query("SELECT * FROM capital_transactions ORDER BY txn_date DESC");
  res.json(r.rows);
});

router.post("/", requirePermission("statements", "write"), logAccess("statements"), async (req, res) => {
  const { date, type, amount, note } = req.body;
  if (!date || !["Introduced", "Drawings"].includes(type) || !amount) {
    return res.status(400).json({ error: "date, a valid type (Introduced/Drawings), and amount are required" });
  }
  const r = await pool.query(
    `INSERT INTO capital_transactions (txn_date, txn_type, amount, note) VALUES ($1,$2,$3,$4) RETURNING *`,
    [date, type, Number(amount), note || null]
  );
  res.status(201).json(r.rows[0]);
});

router.put("/:id", requirePermission("statements", "edit"), logAccess("statements"), async (req, res) => {
  const { date, type, amount, note } = req.body;
  if (!date || !["Introduced", "Drawings"].includes(type) || !amount) {
    return res.status(400).json({ error: "date, a valid type (Introduced/Drawings), and amount are required" });
  }
  const r = await pool.query(
    `UPDATE capital_transactions SET txn_date=$1, txn_type=$2, amount=$3, note=$4 WHERE id=$5 RETURNING *`,
    [date, type, Number(amount), note || null, req.params.id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: "Entry not found" });
  res.json(r.rows[0]);
});

router.delete("/:id", requirePermission("statements", "delete"), logAccess("statements"), async (req, res) => {
  await pool.query("DELETE FROM capital_transactions WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
