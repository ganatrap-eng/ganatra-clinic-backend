const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");
const router = express.Router();

router.get("/", requirePermission("referrals", "view"), logAccess("referrals"), async (req, res) => {
  const r = await pool.query("SELECT * FROM referrals ORDER BY referral_date DESC");
  res.json(r.rows);
});

router.post("/", requirePermission("referrals", "write"), logAccess("referrals"), async (req, res) => {
  const { date, patientName, referralType, referredTo, amount, notes } = req.body;
  if (!date || !patientName || !amount) return res.status(400).json({ error: "date, patientName, and amount are required" });
  const r = await pool.query(
    `INSERT INTO referrals (referral_date, patient_name, referral_type, referred_to, amount, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [date, patientName, referralType || null, referredTo || null, Number(amount), notes || null]
  );
  res.status(201).json(r.rows[0]);
});

router.put("/:id", requirePermission("referrals", "edit"), logAccess("referrals"), async (req, res) => {
  const { date, patientName, referralType, referredTo, amount, notes } = req.body;
  if (!date || !patientName || !amount) return res.status(400).json({ error: "date, patientName, and amount are required" });
  const r = await pool.query(
    `UPDATE referrals SET referral_date=$1, patient_name=$2, referral_type=$3, referred_to=$4, amount=$5, notes=$6
     WHERE id=$7 RETURNING *`,
    [date, patientName, referralType || null, referredTo || null, Number(amount), notes || null, req.params.id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: "Referral not found" });
  res.json(r.rows[0]);
});

router.delete("/:id", requirePermission("referrals", "delete"), logAccess("referrals"), async (req, res) => {
  await pool.query("DELETE FROM referrals WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
