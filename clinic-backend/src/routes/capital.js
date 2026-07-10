const express = require("express");
const { pool } = require("../db");
const router = express.Router();

router.get("/", async (req, res) => {
  const r = await pool.query("SELECT * FROM capital_transactions ORDER BY txn_date DESC");
  res.json(r.rows);
});

router.post("/", async (req, res) => {
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

router.delete("/:id", async (req, res) => {
  await pool.query("DELETE FROM capital_transactions WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
