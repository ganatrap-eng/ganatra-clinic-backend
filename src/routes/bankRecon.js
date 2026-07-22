const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");
const router = express.Router();

// GET /api/bank-recon?from=&to=&status=all|matched|unmatched
router.get("/", requirePermission("bankRecon", "view"), logAccess("bankRecon"), async (req, res) => {
  const { from, to, status } = req.query;
  const where = [];
  const params = [];
  if (from && to) { params.push(from, to); where.push(`entry_date BETWEEN $${params.length - 1} AND $${params.length}`); }
  if (status === "matched") where.push("(matched_collection_id IS NOT NULL OR matched_expense_id IS NOT NULL OR matched_doctor_pay_id IS NOT NULL)");
  if (status === "unmatched") where.push("(matched_collection_id IS NULL AND matched_expense_id IS NULL AND matched_doctor_pay_id IS NULL)");
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const r = await pool.query(
    `SELECT bsl.*,
            c.patient_name AS matched_collection_label, c.amount_collected AS matched_collection_amount,
            e.category AS matched_expense_label, e.amount AS matched_expense_amount,
            d.name AS matched_doctor_pay_label, dp.amount AS matched_doctor_pay_amount
     FROM bank_statement_lines bsl
     LEFT JOIN collections c ON c.id = bsl.matched_collection_id
     LEFT JOIN expenses e ON e.id = bsl.matched_expense_id
     LEFT JOIN doctor_pays dp ON dp.id = bsl.matched_doctor_pay_id
     LEFT JOIN doctors d ON d.id = dp.doctor_id
     ${whereSql}
     ORDER BY bsl.entry_date DESC, bsl.created_at DESC`,
    params
  );
  res.json(r.rows);
});

// GET /api/bank-recon/candidates?kind=collections|expenses|doctorPay&from=&to=
// Unmatched records from the target table, for the matching UI to search against.
router.get("/candidates", requirePermission("bankRecon", "view"), logAccess("bankRecon"), async (req, res) => {
  const { kind, from, to } = req.query;
  if (!["collections", "expenses", "doctorPay"].includes(kind)) return res.status(400).json({ error: "kind must be collections, expenses, or doctorPay" });
  const params = [];
  let dateWhere = "";
  if (from && to) { params.push(from, to); }

  if (kind === "collections") {
    dateWhere = params.length ? "c.collection_date BETWEEN $1 AND $2 AND" : "";
    const r = await pool.query(
      `SELECT c.id, c.collection_date AS date, c.patient_name, c.amount_collected AS amount, c.mode
       FROM collections c
       WHERE ${dateWhere} c.mode IN ('UPI','Card')
         AND NOT EXISTS (SELECT 1 FROM bank_statement_lines b WHERE b.matched_collection_id = c.id)
       ORDER BY c.collection_date DESC LIMIT 200`,
      params
    );
    return res.json(r.rows);
  }
  if (kind === "expenses") {
    dateWhere = params.length ? "e.expense_date BETWEEN $1 AND $2 AND" : "";
    const r = await pool.query(
      `SELECT e.id, e.expense_date AS date, e.category, e.narration, e.amount
       FROM expenses e
       WHERE ${dateWhere} NOT EXISTS (SELECT 1 FROM bank_statement_lines b WHERE b.matched_expense_id = e.id)
       ORDER BY e.expense_date DESC LIMIT 200`,
      params
    );
    return res.json(r.rows);
  }
  dateWhere = params.length ? "dp.pay_date BETWEEN $1 AND $2 AND" : "";
  const r = await pool.query(
    `SELECT dp.id, dp.pay_date AS date, d.name AS doctor_name, (dp.amount - dp.tds_amount) AS amount
     FROM doctor_pays dp JOIN doctors d ON d.id = dp.doctor_id
     WHERE ${dateWhere} NOT EXISTS (SELECT 1 FROM bank_statement_lines b WHERE b.matched_doctor_pay_id = dp.id)
     ORDER BY dp.pay_date DESC LIMIT 200`,
    params
  );
  res.json(r.rows);
});

router.post("/", requirePermission("bankRecon", "write"), logAccess("bankRecon"), async (req, res) => {
  const { date, description, amount, type } = req.body;
  if (!date || !amount || !["Credit", "Debit"].includes(type)) {
    return res.status(400).json({ error: "date, amount, and a valid type (Credit/Debit) are required" });
  }
  const r = await pool.query(
    `INSERT INTO bank_statement_lines (entry_date, description, amount, txn_type, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [date, description || null, Number(amount), type, req.user.sub]
  );
  res.status(201).json(r.rows[0]);
});

router.put("/:id", requirePermission("bankRecon", "edit"), logAccess("bankRecon"), async (req, res) => {
  const { date, description, amount, type } = req.body;
  if (!date || !amount || !["Credit", "Debit"].includes(type)) {
    return res.status(400).json({ error: "date, amount, and a valid type (Credit/Debit) are required" });
  }
  const r = await pool.query(
    `UPDATE bank_statement_lines SET entry_date=$1, description=$2, amount=$3, txn_type=$4 WHERE id=$5 RETURNING *`,
    [date, description || null, Number(amount), type, req.params.id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: "Statement line not found" });
  res.json(r.rows[0]);
});

// PUT /:id/match  { kind: "collections"|"expenses"|"doctorPay", targetId }
router.put("/:id/match", requirePermission("bankRecon", "edit"), logAccess("bankRecon"), async (req, res) => {
  const { kind, targetId } = req.body;
  const columnByKind = { collections: "matched_collection_id", expenses: "matched_expense_id", doctorPay: "matched_doctor_pay_id" };
  const targetCol = columnByKind[kind];
  if (!targetCol || !targetId) return res.status(400).json({ error: "kind (collections/expenses/doctorPay) and targetId are required" });
  // A line can only ever be matched to one thing — clear the other two
  // columns and set the chosen one, each column assigned exactly once.
  const setClause = Object.values(columnByKind).map((c) => (c === targetCol ? `${c} = $1` : `${c} = NULL`)).join(", ");
  const r = await pool.query(
    `UPDATE bank_statement_lines SET ${setClause} WHERE id = $2 RETURNING *`,
    [targetId, req.params.id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: "Statement line not found" });
  res.json(r.rows[0]);
});

router.put("/:id/unmatch", requirePermission("bankRecon", "edit"), logAccess("bankRecon"), async (req, res) => {
  const r = await pool.query(
    `UPDATE bank_statement_lines SET matched_collection_id = NULL, matched_expense_id = NULL, matched_doctor_pay_id = NULL WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: "Statement line not found" });
  res.json(r.rows[0]);
});

router.delete("/:id", requirePermission("bankRecon", "delete"), logAccess("bankRecon"), async (req, res) => {
  await pool.query("DELETE FROM bank_statement_lines WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
