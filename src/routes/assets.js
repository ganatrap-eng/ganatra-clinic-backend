const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");
const { assetDepForFY } = require("../utils/depreciation");
const router = express.Router();

router.get("/", requirePermission("assets", "view"), logAccess("assets"), async (req, res) => {
  const r = await pool.query("SELECT * FROM fixed_assets ORDER BY purchase_date DESC");
  res.json(r.rows);
});

// GET /api/assets/depreciation?fy=2025-26
router.get("/depreciation", requirePermission("assets", "view"), logAccess("assets"), async (req, res) => {
  const { fy } = req.query;
  if (!fy) return res.status(400).json({ error: "fy query param is required, e.g. 2025-26" });
  const r = await pool.query("SELECT * FROM fixed_assets ORDER BY purchase_date");
  const rows = r.rows.map((asset) => ({ ...asset, ...assetDepForFY(asset, fy) }));
  const totalDep = rows.filter((x) => x.applicable).reduce((s, x) => s + x.dep, 0);
  res.json({ fy, rows, totalDep });
});

router.post("/", requirePermission("assets", "write"), logAccess("assets"), async (req, res) => {
  const { name, block, rate, purchaseDate, cost } = req.body;
  if (!name || !block || !rate || !purchaseDate || !cost) {
    return res.status(400).json({ error: "name, block, rate, purchaseDate, and cost are required" });
  }
  const r = await pool.query(
    `INSERT INTO fixed_assets (name, block, rate, purchase_date, cost) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, block, Number(rate), purchaseDate, Number(cost)]
  );
  res.status(201).json(r.rows[0]);
});

router.put("/:id", requirePermission("assets", "edit"), logAccess("assets"), async (req, res) => {
  const { name, block, rate, purchaseDate, cost } = req.body;
  if (!name || !block || !rate || !purchaseDate || !cost) {
    return res.status(400).json({ error: "name, block, rate, purchaseDate, and cost are required" });
  }
  const r = await pool.query(
    `UPDATE fixed_assets SET name=$1, block=$2, rate=$3, purchase_date=$4, cost=$5 WHERE id=$6 RETURNING *`,
    [name, block, Number(rate), purchaseDate, Number(cost), req.params.id]
  );
  if (r.rowCount === 0) return res.status(404).json({ error: "Asset not found" });
  res.json(r.rows[0]);
});

router.delete("/:id", requirePermission("assets", "delete"), logAccess("assets"), async (req, res) => {
  await pool.query("DELETE FROM fixed_assets WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
