const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");
const router = express.Router();

router.get("/", requirePermission("doctorPay", "view"), logAccess("doctorPay"), async (req, res) => {
  const r = await pool.query(
    `SELECT dp.*, d.name AS doctor_name, d.shift FROM doctor_pays dp
     JOIN doctors d ON d.id = dp.doctor_id ORDER BY dp.pay_date DESC`
  );
  res.json(r.rows);
});

router.post("/", requirePermission("doctorPay", "write"), logAccess("doctorPay"), async (req, res) => {
  const { doctorId, date, amount } = req.body;
  if (!doctorId || !date || !amount) return res.status(400).json({ error: "doctorId, date, and amount are required" });
  const r = await pool.query(
    `INSERT INTO doctor_pays (doctor_id, pay_date, amount) VALUES ($1,$2,$3) RETURNING *`,
    [doctorId, date, Number(amount)]
  );
  res.status(201).json(r.rows[0]);
});

router.put("/:id", requirePermission("doctorPay", "edit"), logAccess("doctorPay"), async (req, res) => {
  const { doctorId, date, amount } = req.body;
  if (!doctorId || !date || !amount) return res.status(400).json({ error: "doctorId, date, and amount are required" });
  const r = await pool.query(
    `UPDATE doctor_pays SET doctor_id=$1, pay_date=$2, amount=$3 WHERE id=$4 RETURNING *`,
    [doctorId, date, Number(amount), req.params.id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: "Pay entry not found" });
  res.json(r.rows[0]);
});

router.delete("/:id", requirePermission("doctorPay", "delete"), logAccess("doctorPay"), async (req, res) => {
  await pool.query("DELETE FROM doctor_pays WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

// GET /api/doctor-pays/daily-net?from=&to=  — collection minus doctor pay minus other expenses, per day
router.get("/daily-net", requirePermission("doctorPay", "view"), logAccess("doctorPay"), async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: "from and to query params are required" });
  const r = await pool.query(
    `WITH days AS (SELECT generate_series($1::date, $2::date, interval '1 day')::date AS d),
     coll AS (SELECT collection_date AS d, SUM(amount_due) AS amt FROM collections GROUP BY 1),
     pay AS (SELECT pay_date AS d, SUM(amount) AS amt FROM doctor_pays GROUP BY 1),
     exp AS (SELECT expense_date AS d, SUM(amount) AS amt FROM expenses GROUP BY 1)
     SELECT days.d AS date,
            COALESCE(coll.amt,0) AS collection,
            COALESCE(pay.amt,0) AS doctor_pay,
            COALESCE(exp.amt,0) AS other_expense,
            COALESCE(coll.amt,0) - COALESCE(pay.amt,0) - COALESCE(exp.amt,0) AS net
     FROM days
     LEFT JOIN coll ON coll.d = days.d
     LEFT JOIN pay ON pay.d = days.d
     LEFT JOIN exp ON exp.d = days.d
     ORDER BY days.d`,
    [from, to]
  );
  res.json(r.rows);
});

module.exports = router;
