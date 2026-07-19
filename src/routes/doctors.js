const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");
const router = express.Router();

router.get("/", requirePermission("doctorPay", "view"), logAccess("doctorPay"), async (req, res) => {
  const r = await pool.query("SELECT * FROM doctors WHERE active = true ORDER BY name");
  res.json(r.rows);
});

router.post("/", requirePermission("doctorPay", "write"), logAccess("doctorPay"), async (req, res) => {
  const { name, shift, payType, rate, registrationNo, qualifications, specialization } = req.body;
  if (!name || !["Morning", "Evening"].includes(shift) || !["Daily", "Monthly"].includes(payType)) {
    return res.status(400).json({ error: "name, a valid shift, and a valid pay type are required" });
  }
  const r = await pool.query(
    `INSERT INTO doctors (name, shift, pay_type, rate, registration_no, qualifications, specialization) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [name, shift, payType, Number(rate) || 0, registrationNo || null, qualifications || null, specialization || null]
  );
  res.status(201).json(r.rows[0]);
});

router.put("/:id", requirePermission("doctorPay", "edit"), logAccess("doctorPay"), async (req, res) => {
  const { name, shift, payType, rate, registrationNo, qualifications, specialization } = req.body;
  if (!name || !["Morning", "Evening"].includes(shift) || !["Daily", "Monthly"].includes(payType)) {
    return res.status(400).json({ error: "name, a valid shift, and a valid pay type are required" });
  }
  const r = await pool.query(
    `UPDATE doctors SET name=$1, shift=$2, pay_type=$3, rate=$4, registration_no=$5, qualifications=$6, specialization=$7 WHERE id=$8 AND active=true RETURNING *`,
    [name, shift, payType, Number(rate) || 0, registrationNo || null, qualifications || null, specialization || null, req.params.id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: "Doctor not found" });
  res.json(r.rows[0]);
});

router.delete("/:id", requirePermission("doctorPay", "delete"), logAccess("doctorPay"), async (req, res) => {
  await pool.query("UPDATE doctors SET active = false WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
