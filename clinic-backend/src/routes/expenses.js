const express = require("express");
const { pool } = require("../db");
const router = express.Router();

const CATEGORIES = [
  "Nursing Staff Salary", "Electricity / Light Bill", "Housekeeping Expenses",
  "Rent", "Medicine Bills", "Repair & Maintenance", "Miscellaneous Expenses", "Staff Welfare",
];

router.get("/", async (req, res) => {
  const { from, to } = req.query;
  const params = [];
  let where = "";
  if (from && to) { params.push(from, to); where = "WHERE expense_date BETWEEN $1 AND $2"; }
  const r = await pool.query(`SELECT * FROM expenses ${where} ORDER BY expense_date DESC`, params);
  res.json(r.rows);
});

router.get("/category-totals", async (req, res) => {
  const { from, to } = req.query;
  const params = [];
  let where = "";
  if (from && to) { params.push(from, to); where = "WHERE expense_date BETWEEN $1 AND $2"; }
  const r = await pool.query(`SELECT category, SUM(amount) AS total FROM expenses ${where} GROUP BY category`, params);
  const totals = Object.fromEntries(r.rows.map((row) => [row.category, Number(row.total)]));
  res.json(CATEGORIES.map((c) => ({ category: c, total: totals[c] || 0 })));
});

router.post("/", async (req, res) => {
  const { date, category, amount, narration, imageUrl } = req.body;
  if (!date || !CATEGORIES.includes(category) || !amount) {
    return res.status(400).json({ error: "date, a valid category, and amount are required" });
  }
  const r = await pool.query(
    `INSERT INTO expenses (expense_date, category, amount, narration, image_url, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [date, category, Number(amount), narration || null, imageUrl || null, req.user.sub]
  );
  res.status(201).json(r.rows[0]);
});

router.delete("/:id", async (req, res) => {
  await pool.query("DELETE FROM expenses WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
