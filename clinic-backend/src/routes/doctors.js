const express = require("express");
const { pool } = require("../db");
const router = express.Router();

router.get("/", async (req, res) => {
  const r = await pool.query("SELECT * FROM doctors WHERE active = true ORDER BY name");
  res.json(r.rows);
});

router.post("/", async (req, res) => {
  const { name, shift, payType, rate } = req.body;
  if (!name || !["Morning", "Evening"].includes(shift) || !["Daily", "Monthly"].includes(payType)) {
    return res.status(400).json({ error: "name, a valid shift, and a valid pay type are required" });
  }
  const r = await pool.query(
    `INSERT INTO doctors (name, shift, pay_type, rate) VALUES ($1,$2,$3,$4) RETURNING *`,
    [name, shift, payType, Number(rate) || 0]
  );
  res.status(201).json(r.rows[0]);
});

router.delete("/:id", async (req, res) => {
  await pool.query("UPDATE doctors SET active = false WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
