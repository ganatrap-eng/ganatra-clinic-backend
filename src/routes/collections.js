const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");
const router = express.Router();

router.get("/", requirePermission("collections", "view"), logAccess("collections"), async (req, res) => {
  const { from, to } = req.query;
  const params = [];
  let where = "";
  if (from && to) { params.push(from, to); where = "WHERE collection_date BETWEEN $1 AND $2"; }
  const r = await pool.query(`SELECT * FROM collections ${where} ORDER BY collection_date DESC`, params);
  res.json(r.rows);
});

// GET /api/collections/rollup?period=daily|weekly|monthly&from=&to=
router.get("/rollup", requirePermission("collections", "view"), logAccess("collections"), async (req, res) => {
  const { period = "daily", from, to } = req.query;
  const bucket = { daily: "day", weekly: "week", monthly: "month" }[period] || "day";
  const params = [];
  let where = "";
  if (from && to) { params.push(from, to); where = "WHERE collection_date BETWEEN $1 AND $2"; }
  const r = await pool.query(
    `SELECT date_trunc('${bucket}', collection_date) AS period,
            SUM(amount_due) AS due, SUM(amount_collected) AS collected
     FROM collections ${where}
     GROUP BY period ORDER BY period DESC`,
    params
  );
  res.json(r.rows);
});

router.post("/", requirePermission("collections", "write"), logAccess("collections"), async (req, res) => {
  const { caseId, caseNo, patientName, phone, date, amountDue, amountCollected, mode, imageUrl } = req.body;
  if (!patientName || !date || amountDue === undefined) {
    return res.status(400).json({ error: "patientName, date, and amountDue are required" });
  }
  const r = await pool.query(
    `INSERT INTO collections (case_id, case_no, patient_name, phone, collection_date, amount_due, amount_collected, mode, image_url, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [caseId || null, caseNo || null, patientName, phone || null, date, Number(amountDue), Number(amountCollected) || 0, mode || "Cash", imageUrl || null, req.user.sub]
  );
  res.status(201).json(r.rows[0]);
});

router.put("/:id", requirePermission("collections", "edit"), logAccess("collections"), async (req, res) => {
  const { caseId, caseNo, patientName, phone, date, amountDue, amountCollected, mode, imageUrl } = req.body;
  if (!patientName || !date || amountDue === undefined) {
    return res.status(400).json({ error: "patientName, date, and amountDue are required" });
  }
  const r = await pool.query(
    `UPDATE collections SET case_id=$1, case_no=$2, patient_name=$3, phone=$4, collection_date=$5,
       amount_due=$6, amount_collected=$7, mode=$8, image_url=$9
     WHERE id = $10 RETURNING *`,
    [caseId || null, caseNo || null, patientName, phone || null, date, Number(amountDue), Number(amountCollected) || 0, mode || "Cash", imageUrl || null, req.params.id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: "Collection entry not found" });
  res.json(r.rows[0]);
});

router.delete("/:id", requirePermission("collections", "delete"), logAccess("collections"), async (req, res) => {
  await pool.query("DELETE FROM collections WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
