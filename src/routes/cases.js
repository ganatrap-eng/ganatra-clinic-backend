const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");
const router = express.Router();

const VALID_MODES = ["Cash", "UPI", "Card", "Other"];

// GET /api/cases?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/", requirePermission("cases", "view"), logAccess("cases"), async (req, res) => {
  const { from, to } = req.query;
  const params = [];
  let where = "";
  if (from && to) { params.push(from, to); where = "WHERE c.case_date BETWEEN $1 AND $2"; }

  const cases = await pool.query(
    `SELECT c.*, d.name AS doctor_name
     FROM cases c LEFT JOIN doctors d ON d.id = c.doctor_id
     ${where} ORDER BY c.case_date DESC`,
    params
  );
  const ids = cases.rows.map((c) => c.id);
  let medicines = [];
  let prescriptions = [];
  if (ids.length) {
    const m = await pool.query(`SELECT * FROM case_medicines WHERE case_id = ANY($1)`, [ids]);
    medicines = m.rows;
    const p = await pool.query(`SELECT * FROM case_prescriptions WHERE case_id = ANY($1) ORDER BY sort_order`, [ids]);
    prescriptions = p.rows;
  }
  const withMeds = cases.rows.map((c) => ({
    ...c,
    medicines: medicines.filter((m) => m.case_id === c.id),
    prescriptions: prescriptions.filter((p) => p.case_id === c.id),
  }));
  res.json(withMeds);
});

// POST /api/cases  { date, patientName, phone, briefHistory, doctorId, shift, externalPrescription, imageUrl,
//                     medicines: [{name, qty, price}], amountDue?, mode? }
// Creating a case always creates a matching Collections entry in the same
// transaction, so every case has somewhere for its payment to be recorded —
// if amountDue/mode aren't given (the normal single-entry form doesn't ask
// for them), it's created as a "pending" entry: amount due 0, mode blank,
// ready for the front desk to fill in once payment is taken.
router.post("/", requirePermission("cases", "write"), logAccess("cases"), async (req, res) => {
  const { date, patientName, phone, briefHistory, doctorId, shift, externalPrescription, imageUrl, medicines, amountDue, mode,
    vitalsBp, vitalsPulse, vitalsTemp, vitalsWeight, vitalsHeight, diagnosis, clinicalNotes, prescriptions } = req.body;
  if (!date || !patientName) return res.status(400).json({ error: "date and patientName are required" });
  if (mode !== undefined && mode !== null && mode !== "" && !VALID_MODES.includes(mode)) {
    return res.status(400).json({ error: `mode must be one of ${VALID_MODES.join(", ")}` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const countR = await client.query("SELECT COUNT(*)::int AS n FROM cases");
    const caseNo = `CASE-${String(countR.rows[0].n + 1).padStart(4, "0")}`;

    const caseR = await client.query(
      `INSERT INTO cases (case_no, case_date, patient_name, phone, brief_history, doctor_id, shift, external_prescription, image_url, created_by,
         vitals_bp, vitals_pulse, vitals_temp, vitals_weight, vitals_height, diagnosis, clinical_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [caseNo, date, patientName, phone || null, briefHistory || null, doctorId || null, shift || null, externalPrescription || null, imageUrl || null, req.user.sub,
        vitalsBp || null, vitalsPulse ? Number(vitalsPulse) : null, vitalsTemp ? Number(vitalsTemp) : null, vitalsWeight ? Number(vitalsWeight) : null, vitalsHeight ? Number(vitalsHeight) : null, diagnosis || null, clinicalNotes || null]
    );
    const newCase = caseR.rows[0];

    for (const m of medicines || []) {
      if (!m.name) continue;
      await client.query(
        `INSERT INTO case_medicines (case_id, medicine_name, qty, unit_price) VALUES ($1,$2,$3,$4)`,
        [newCase.id, m.name, Number(m.qty) || 0, Number(m.price) || 0]
      );
    }
    let i = 0;
    for (const rx of prescriptions || []) {
      if (!rx.name) continue;
      await client.query(
        `INSERT INTO case_prescriptions (case_id, medicine_name, dosage, frequency, duration, instructions, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [newCase.id, rx.name, rx.dosage || null, rx.frequency || null, rx.duration || null, rx.instructions || null, i++]
      );
    }

    const collR = await client.query(
      `INSERT INTO collections (case_id, case_no, patient_name, phone, collection_date, amount_due, amount_collected, mode, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8) RETURNING *`,
      [newCase.id, caseNo, patientName, phone || null, date, Number(amountDue) || 0, mode || null, req.user.sub]
    );

    await client.query("COMMIT");
    res.status(201).json({ ...newCase, medicines: (medicines || []).filter((m) => m.name), prescriptions: (prescriptions || []).filter((r) => r.name), collection: collR.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not save the case record" });
  } finally {
    client.release();
  }
});

router.put("/:id", requirePermission("cases", "edit"), logAccess("cases"), async (req, res) => {
  const { date, patientName, phone, briefHistory, doctorId, shift, externalPrescription, imageUrl, medicines,
    vitalsBp, vitalsPulse, vitalsTemp, vitalsWeight, vitalsHeight, diagnosis, clinicalNotes, prescriptions } = req.body;
  if (!date || !patientName) return res.status(400).json({ error: "date and patientName are required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const caseR = await client.query(
      `UPDATE cases SET case_date=$1, patient_name=$2, phone=$3, brief_history=$4, doctor_id=$5, shift=$6, external_prescription=$7, image_url=$8,
         vitals_bp=$9, vitals_pulse=$10, vitals_temp=$11, vitals_weight=$12, vitals_height=$13, diagnosis=$14, clinical_notes=$15
       WHERE id=$16 RETURNING *`,
      [date, patientName, phone || null, briefHistory || null, doctorId || null, shift || null, externalPrescription || null, imageUrl || null,
        vitalsBp || null, vitalsPulse ? Number(vitalsPulse) : null, vitalsTemp ? Number(vitalsTemp) : null, vitalsWeight ? Number(vitalsWeight) : null, vitalsHeight ? Number(vitalsHeight) : null, diagnosis || null, clinicalNotes || null, req.params.id]
    );
    if (caseR.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Case not found" }); }
    await client.query("DELETE FROM case_medicines WHERE case_id = $1", [req.params.id]);
    for (const m of medicines || []) {
      if (!m.name) continue;
      await client.query(
        `INSERT INTO case_medicines (case_id, medicine_name, qty, unit_price) VALUES ($1,$2,$3,$4)`,
        [req.params.id, m.name, Number(m.qty) || 0, Number(m.price) || 0]
      );
    }
    await client.query("DELETE FROM case_prescriptions WHERE case_id = $1", [req.params.id]);
    let i = 0;
    for (const rx of prescriptions || []) {
      if (!rx.name) continue;
      await client.query(
        `INSERT INTO case_prescriptions (case_id, medicine_name, dosage, frequency, duration, instructions, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.params.id, rx.name, rx.dosage || null, rx.frequency || null, rx.duration || null, rx.instructions || null, i++]
      );
    }
    // Keep any linked collection entries' name/phone/date in sync with a corrected case record.
    await client.query(
      `UPDATE collections SET patient_name=$1, phone=$2, collection_date=$3, case_no=$4 WHERE case_id=$5`,
      [patientName, phone || null, date, caseR.rows[0].case_no, req.params.id]
    );
    await client.query("COMMIT");
    const doctorR = doctorId ? await pool.query("SELECT name FROM doctors WHERE id = $1", [doctorId]) : { rows: [] };
    res.json({
      ...caseR.rows[0], doctor_name: doctorR.rows[0]?.name || null,
      medicines: (medicines || []).filter((m) => m.name).map((m) => ({ medicine_name: m.name, qty: Number(m.qty) || 0, unit_price: Number(m.price) || 0 })),
      prescriptions: (prescriptions || []).filter((r) => r.name).map((r) => ({ medicine_name: r.name, dosage: r.dosage || null, frequency: r.frequency || null, duration: r.duration || null, instructions: r.instructions || null })),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not update the case record" });
  } finally {
    client.release();
  }
});

router.delete("/:id", requirePermission("cases", "delete"), logAccess("cases"), async (req, res) => {
  await pool.query("DELETE FROM cases WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
