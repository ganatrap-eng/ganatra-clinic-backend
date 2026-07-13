const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");
const router = express.Router();

const VALID_TYPES = {
  unsecured_loan: ["Taken", "Repaid"],
  security_deposit: ["Given", "Refunded"],
};

// GET /api/other-balance?category=unsecured_loan|security_deposit
router.get("/", requirePermission("statements", "view"), logAccess("statements"), async (req, res) => {
  const { category } = req.query;
  const params = [];
  let where = "";
  if (category) { params.push(category); where = "WHERE category = $1"; }
  const r = await pool.query(`SELECT * FROM other_balance_items ${where} ORDER BY txn_date DESC`, params);
  res.json(r.rows);
});

router.post("/", requirePermission("statements", "write"), logAccess("statements"), async (req, res) => {
  const { category, txnType, partyName, amount, date, note } = req.body;
  if (!VALID_TYPES[category] || !VALID_TYPES[category].includes(txnType) || !amount || !date) {
    return res.status(400).json({ error: "A valid category, transaction type, amount, and date are required" });
  }
  const r = await pool.query(
    `INSERT INTO other_balance_items (category, txn_type, party_name, amount, txn_date, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [category, txnType, partyName || null, Number(amount), date, note || null]
  );
  res.status(201).json(r.rows[0]);
});

router.put("/:id", requirePermission("statements", "edit"), logAccess("statements"), async (req, res) => {
  const { category, txnType, partyName, amount, date, note } = req.body;
  if (!VALID_TYPES[category] || !VALID_TYPES[category].includes(txnType) || !amount || !date) {
    return res.status(400).json({ error: "A valid category, transaction type, amount, and date are required" });
  }
  const r = await pool.query(
    `UPDATE other_balance_items SET category=$1, txn_type=$2, party_name=$3, amount=$4, txn_date=$5, note=$6 WHERE id=$7 RETURNING *`,
    [category, txnType, partyName || null, Number(amount), date, note || null, req.params.id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: "Entry not found" });
  res.json(r.rows[0]);
});

router.delete("/:id", requirePermission("statements", "delete"), logAccess("statements"), async (req, res) => {
  await pool.query("DELETE FROM other_balance_items WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
