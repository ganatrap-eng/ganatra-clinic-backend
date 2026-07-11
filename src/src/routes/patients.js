const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");

const router = express.Router();

// GET /api/patients/search?q=ramesh   (matches name OR mobile number)
router.get("/search", requirePermission("cases", "view"), async (req, res) => {
  const q = `%${(req.query.q || "").trim()}%`;
  if (!q || q === "%%") return res.json([]);
  const r = await pool.query(
    `SELECT DISTINCT patient_name, phone FROM (
       SELECT patient_name, phone FROM cases WHERE patient_name ILIKE $1 OR phone ILIKE $1
       UNION
       SELECT patient_name, phone FROM collections WHERE patient_name ILIKE $1 OR phone ILIKE $1
     ) t ORDER BY patient_name LIMIT 20`,
    [q]
  );
  res.json(r.rows);
});

// GET /api/patients/history?name=&phone=&from=&to=
router.get("/history", requirePermission("cases", "view"), logAccess("cases"), async (req, res) => {
  const { name, phone, from, to } = req.query;
  if (!name) return res.status(400).json({ error: "name query param is required" });
  const phoneVal = phone || "";

  const caseParams = [name, phoneVal];
  let caseWhere = "WHERE c.patient_name = $1 AND COALESCE(c.phone,'') = $2";
  if (from) { caseParams.push(from); caseWhere += ` AND c.case_date >= $${caseParams.length}`; }
  if (to) { caseParams.push(to); caseWhere += ` AND c.case_date <= $${caseParams.length}`; }

  const casesR = await pool.query(
    `SELECT c.*, d.name AS doctor_name FROM cases c LEFT JOIN doctors d ON d.id = c.doctor_id ${caseWhere} ORDER BY c.case_date DESC`,
    caseParams
  );
  const caseIds = casesR.rows.map((c) => c.id);
  let medicines = [];
  if (caseIds.length) {
    const m = await pool.query(`SELECT * FROM case_medicines WHERE case_id = ANY($1)`, [caseIds]);
    medicines = m.rows;
  }
  const cases = casesR.rows.map((c) => ({ ...c, medicines: medicines.filter((m) => m.case_id === c.id) }));

  const collParams = [name, phoneVal];
  let collWhere = "WHERE patient_name = $1 AND COALESCE(phone,'') = $2";
  if (from) { collParams.push(from); collWhere += ` AND collection_date >= $${collParams.length}`; }
  if (to) { collParams.push(to); collWhere += ` AND collection_date <= $${collParams.length}`; }
  const collectionsR = await pool.query(
    `SELECT * FROM collections ${collWhere} ORDER BY collection_date DESC`,
    collParams
  );

  res.json({
    patient: { name, phone: phoneVal },
    cases,
    collections: collectionsR.rows,
  });
});

module.exports = router;
