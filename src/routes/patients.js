const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");

const router = express.Router();

// GET /api/patients/search?q=ramesh patel   (matches name OR mobile number;
// every word in q must appear somewhere in the name, in any order, so
// "patel ramesh" still finds "Ramesh Patel" — never requires a case number)
router.get("/search", requirePermission("cases", "view"), async (req, res) => {
  const raw = (req.query.q || "").trim();
  if (!raw) return res.json([]);
  const words = raw.split(/\s+/).filter(Boolean);
  const nameConditions = words.map((_, i) => `patient_name ILIKE $${i + 1}`).join(" AND ");
  const params = words.map((w) => `%${w}%`);
  params.push(`%${raw}%`);
  const phoneIdx = params.length;
  const r = await pool.query(
    `SELECT DISTINCT patient_name, phone FROM (
       SELECT patient_name, phone FROM cases WHERE (${nameConditions}) OR phone ILIKE $${phoneIdx}
       UNION
       SELECT patient_name, phone FROM collections WHERE (${nameConditions}) OR phone ILIKE $${phoneIdx}
     ) t ORDER BY patient_name LIMIT 20`,
    params
  );
  res.json(r.rows);
});

// GET /api/patients/history?name=&phone=&from=&to=
// Matching is normalized (case-insensitive, whitespace-trimmed on name;
// digits-only on phone) rather than a byte-exact match, so a name typed or
// stored with slightly different casing/spacing/phone formatting across
// different visits still resolves to the same patient's history. It still
// requires the FULL normalized name (and phone) to match — not a partial
// substring — so two different patients who happen to share a name are
// never merged into one person's record.
router.get("/history", requirePermission("cases", "view"), logAccess("cases"), async (req, res) => {
  const { name, phone, from, to } = req.query;
  if (!name) return res.status(400).json({ error: "name query param is required" });
  const phoneVal = phone || "";

  const caseParams = [name, phoneVal];
  let caseWhere = "WHERE LOWER(TRIM(c.patient_name)) = LOWER(TRIM($1)) AND COALESCE(NULLIF(regexp_replace(c.phone,'[^0-9]','','g'),''),'') = COALESCE(NULLIF(regexp_replace($2,'[^0-9]','','g'),''),'')";
  if (from) { caseParams.push(from); caseWhere += ` AND c.case_date >= $${caseParams.length}`; }
  if (to) { caseParams.push(to); caseWhere += ` AND c.case_date <= $${caseParams.length}`; }

  const casesR = await pool.query(
    `SELECT c.*, d.name AS doctor_name FROM cases c LEFT JOIN doctors d ON d.id = c.doctor_id ${caseWhere} ORDER BY c.case_date DESC`,
    caseParams
  );
  const caseIds = casesR.rows.map((c) => c.id);
  let medicines = [];
  let prescriptions = [];
  if (caseIds.length) {
    const m = await pool.query(`SELECT * FROM case_medicines WHERE case_id = ANY($1)`, [caseIds]);
    medicines = m.rows;
    const p = await pool.query(`SELECT * FROM case_prescriptions WHERE case_id = ANY($1) ORDER BY sort_order`, [caseIds]);
    prescriptions = p.rows;
  }
  const cases = casesR.rows.map((c) => ({ ...c, medicines: medicines.filter((m) => m.case_id === c.id), prescriptions: prescriptions.filter((p) => p.case_id === c.id) }));

  const collParams = [name, phoneVal];
  let collWhere = "WHERE LOWER(TRIM(patient_name)) = LOWER(TRIM($1)) AND COALESCE(NULLIF(regexp_replace(phone,'[^0-9]','','g'),''),'') = COALESCE(NULLIF(regexp_replace($2,'[^0-9]','','g'),''),'')";
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
