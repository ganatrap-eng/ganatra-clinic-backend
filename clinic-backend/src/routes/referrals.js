const express = require("express");
const { pool } = require("../db");
const router = express.Router();

router.get("/", async (req, res) => {
  const r = await pool.query("SELECT * FROM referrals ORDER BY referral_date DESC");
  res.json(r.rows);
});

router.post("/", async (req, res) => {
  const { date, patientName, referralType, referredTo, amount, notes } = req.body;
  if (!date || !patientName || !amount) return res.status(400).json({ error: "date, patientName, and amount are required" });
  const r = await pool.query(
    `INSERT INTO referrals (referral_date, patient_name, referral_type, referred_to, amount, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [date, patientName, referralType || null, referredTo || null, Number(amount), notes || null]
  );
  res.status(201).json(r.rows[0]);
});

router.delete("/:id", async (req, res) => {
  await pool.query("DELETE FROM referrals WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
