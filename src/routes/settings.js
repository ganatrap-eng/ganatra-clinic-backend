const express = require("express");
const { pool } = require("../db");
const { requireRole } = require("../middleware/auth");
const { logAccess } = require("../middleware/audit");
const router = express.Router();

router.get("/", async (req, res) => {
  const r = await pool.query("SELECT * FROM clinic_settings ORDER BY updated_at DESC LIMIT 1");
  res.json(r.rows[0] || {});
});

router.put("/", requireRole("Admin", "Doctor"), logAccess("settings"), async (req, res) => {
  const { clinicName, proprietor, address, phone, email, timings } = req.body;
  const existing = await pool.query("SELECT id FROM clinic_settings LIMIT 1");
  let r;
  if (existing.rowCount) {
    r = await pool.query(
      `UPDATE clinic_settings SET clinic_name=$1, proprietor=$2, address=$3, phone=$4, email=$5, timings=$6, updated_at=now()
       WHERE id=$7 RETURNING *`,
      [clinicName, proprietor, address, phone, email || null, timings || null, existing.rows[0].id]
    );
  } else {
    r = await pool.query(
      `INSERT INTO clinic_settings (clinic_name, proprietor, address, phone, email, timings) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [clinicName, proprietor, address, phone, email || null, timings || null]
    );
  }
  res.json(r.rows[0]);
});

module.exports = router;
