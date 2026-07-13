const express = require("express");
const { pool } = require("../db");
const { requirePermission } = require("../middleware/permissions");
const { logAccess } = require("../middleware/audit");
const { fyRange, fyOf, assetDepForFY, assetWDVAsOf } = require("../utils/depreciation");
const router = express.Router();

const EXPENSE_CATEGORIES = [
  "Nursing Staff Salary", "Electricity / Light Bill", "Housekeeping Expenses",
  "Rent", "Medicine Bills", "Repair & Maintenance", "Miscellaneous Expenses", "Staff Welfare",
];

async function sumBetween(table, dateCol, amountCol, start, end) {
  const r = await pool.query(`SELECT COALESCE(SUM(${amountCol}),0) AS total FROM ${table} WHERE ${dateCol} BETWEEN $1 AND $2`, [start, end]);
  return Number(r.rows[0].total);
}
async function sumUpTo(table, dateCol, amountCol, end, extraWhere = "") {
  const r = await pool.query(`SELECT COALESCE(SUM(${amountCol}),0) AS total FROM ${table} WHERE ${dateCol} <= $1 ${extraWhere}`, [end]);
  return Number(r.rows[0].total);
}

// GET /api/statements/income?fy=2025-26  OR  ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/income", requirePermission("statements", "view"), logAccess("statements"), async (req, res) => {
  const fy = req.query.fy;
  const customRange = req.query.from && req.query.to;
  if (!fy && !customRange) return res.status(400).json({ error: "fy or from/to query params are required" });
  const { start, end } = customRange ? { start: req.query.from, end: req.query.to } : fyRange(fy);

  const incomeCollection = await sumBetween("collections", "collection_date", "amount_due", start, end);
  const incomeReferral = await sumBetween("referrals", "referral_date", "amount", start, end);
  const incomeGift = await sumBetween("gifts", "gift_date", "amount", start, end);
  const totalIncome = incomeCollection + incomeReferral + incomeGift;

  const catR = await pool.query(
    `SELECT category, COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date BETWEEN $1 AND $2 GROUP BY category`,
    [start, end]
  );
  const catTotals = Object.fromEntries(catR.rows.map((r) => [r.category, Number(r.total)]));
  const doctorFees = await sumBetween("doctor_pays", "pay_date", "amount", start, end);

  const assetsR = await pool.query("SELECT * FROM fixed_assets");
  const depreciationFY = customRange ? fyOf(end) : fy;
  const depreciation = assetsR.rows.reduce((s, a) => s + assetDepForFY(a, depreciationFY).dep, 0);

  const expenseRows = [
    { name: "Doctor Fees (Shift Pay)", amount: doctorFees },
    ...EXPENSE_CATEGORIES.map((c) => ({ name: c, amount: catTotals[c] || 0 })),
    { name: "Depreciation", amount: depreciation },
  ];
  const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);

  res.json({
    fy, period: { start, end },
    income: { patientCollection: incomeCollection, referral: incomeReferral, gift: incomeGift, total: totalIncome },
    expenses: expenseRows, totalExpense,
    netProfit: totalIncome - totalExpense,
  });
});

// GET /api/statements/balance-sheet?fy=2025-26
router.get("/balance-sheet", requirePermission("statements", "view"), logAccess("statements"), async (req, res) => {
  const fy = req.query.fy;
  if (!fy) return res.status(400).json({ error: "fy query param is required" });
  const { end, start } = fyRange(fy);

  const loanTaken = await sumUpTo("other_balance_items", "txn_date", "amount", end, "AND category='unsecured_loan' AND txn_type='Taken'");
  const loanRepaid = await sumUpTo("other_balance_items", "txn_date", "amount", end, "AND category='unsecured_loan' AND txn_type='Repaid'");
  const depositGiven = await sumUpTo("other_balance_items", "txn_date", "amount", end, "AND category='security_deposit' AND txn_type='Given'");
  const depositRefunded = await sumUpTo("other_balance_items", "txn_date", "amount", end, "AND category='security_deposit' AND txn_type='Refunded'");
  const unsecuredLoan = loanTaken - loanRepaid;
  const securityDeposit = depositGiven - depositRefunded;

  const cashIn = (await sumUpTo("collections", "collection_date", "amount_collected", end))
    + (await sumUpTo("referrals", "referral_date", "amount", end))
    + (await sumUpTo("gifts", "gift_date", "amount", end))
    + (await sumUpTo("capital_transactions", "txn_date", "amount", end, "AND txn_type = 'Introduced'"))
    + loanTaken + depositRefunded;
  const cashOut = (await sumUpTo("expenses", "expense_date", "amount", end))
    + (await sumUpTo("doctor_pays", "pay_date", "amount", end))
    + (await sumUpTo("capital_transactions", "txn_date", "amount", end, "AND txn_type = 'Drawings'"))
    + loanRepaid + depositGiven;
  const assetsR = await pool.query("SELECT * FROM fixed_assets WHERE purchase_date <= $1", [end]);
  const assetsCostToDate = assetsR.rows.reduce((s, a) => s + Number(a.cost), 0);
  const cashBank = cashIn - cashOut - assetsCostToDate;

  const debtors = await sumUpTo("collections", "collection_date", "balance", end);

  const allAssetsR = await pool.query("SELECT * FROM fixed_assets");
  const fixedAssetsNet = allAssetsR.rows.reduce((s, a) => s + assetWDVAsOf(a, end).wdv, 0);
  const totalAssets = cashBank + debtors + fixedAssetsNet + securityDeposit;

  const capIntroduced = await sumUpTo("capital_transactions", "txn_date", "amount", end, "AND txn_type = 'Introduced'");
  const drawings = await sumUpTo("capital_transactions", "txn_date", "amount", end, "AND txn_type = 'Drawings'");
  const cumulativeIncome = (await sumUpTo("collections", "collection_date", "amount_due", end)) + (await sumUpTo("referrals", "referral_date", "amount", end)) + (await sumUpTo("gifts", "gift_date", "amount", end));
  const cumulativeExpense = (await sumUpTo("expenses", "expense_date", "amount", end))
    + (await sumUpTo("doctor_pays", "pay_date", "amount", end))
    + allAssetsR.rows.reduce((s, a) => s + assetWDVAsOf(a, end).cumDep, 0);
  const closingCapital = capIntroduced - drawings + (cumulativeIncome - cumulativeExpense);
  const totalLiabAndCapital = unsecuredLoan + closingCapital;

  res.json({
    fy, asOf: end,
    assets: { cashBank, debtors, fixedAssetsNet, securityDeposit, total: totalAssets },
    liabilities: { unsecuredLoan },
    capital: { closingCapital },
    ties: Math.abs(totalLiabAndCapital - totalAssets) < 1,
  });
});

// GET /api/statements/capital-account?fy=2025-26
router.get("/capital-account", requirePermission("statements", "view"), logAccess("statements"), async (req, res) => {
  const fy = req.query.fy;
  if (!fy) return res.status(400).json({ error: "fy query param is required" });
  const { end } = fyRange(fy);

  const capIntroduced = await sumUpTo("capital_transactions", "txn_date", "amount", end, "AND txn_type = 'Introduced'");
  const drawings = await sumUpTo("capital_transactions", "txn_date", "amount", end, "AND txn_type = 'Drawings'");
  const cumulativeIncome = (await sumUpTo("collections", "collection_date", "amount_due", end)) + (await sumUpTo("referrals", "referral_date", "amount", end)) + (await sumUpTo("gifts", "gift_date", "amount", end));
  const assetsR = await pool.query("SELECT * FROM fixed_assets");
  const cumulativeExpense = (await sumUpTo("expenses", "expense_date", "amount", end))
    + (await sumUpTo("doctor_pays", "pay_date", "amount", end))
    + assetsR.rows.reduce((s, a) => s + assetWDVAsOf(a, end).cumDep, 0);
  const cumulativeNetProfit = cumulativeIncome - cumulativeExpense;
  const closingCapital = capIntroduced - drawings + cumulativeNetProfit;

  res.json({ fy, asOf: end, capIntroduced, drawings, cumulativeNetProfit, closingCapital });
});

module.exports = router;
