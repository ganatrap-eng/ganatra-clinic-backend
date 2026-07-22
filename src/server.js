require("dotenv").config();
const express = require("express");
require("express-async-errors"); // must load before any router is created — patches Express to catch rejected promises in every async route automatically, so a database error never crashes the whole server, just that one request
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const path = require("path");

const { authenticate } = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const settingsRoutes = require("./routes/settings");
const doctorsRoutes = require("./routes/doctors");
const casesRoutes = require("./routes/cases");
const collectionsRoutes = require("./routes/collections");
const doctorPaysRoutes = require("./routes/doctorPays");
const referralsRoutes = require("./routes/referrals");
const giftsRoutes = require("./routes/gifts");
const expensesRoutes = require("./routes/expenses");
const assetsRoutes = require("./routes/assets");
const capitalRoutes = require("./routes/capital");
const statementsRoutes = require("./routes/statements");
const uploadRoutes = require("./routes/upload");
const adminRoutes = require("./routes/admin");
const auditLogRoutes = require("./routes/auditLog");
const patientsRoutes = require("./routes/patients");
const otherBalanceRoutes = require("./routes/otherBalance");
const patientMasterRoutes = require("./routes/patientMaster");
const bankReconRoutes = require("./routes/bankRecon");

const app = express();
app.set("trust proxy", 1); // Render sits behind a reverse proxy — without this, every visitor looks like the same IP to express-rate-limit, making the rate limits useless
app.use(helmet()); // standard security headers: removes the "X-Powered-By: Express" fingerprint, blocks MIME-sniffing, sets sensible defaults for the rest
const corsOrigins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
const allowAllOrigins = corsOrigins.length === 0 || corsOrigins.includes("*");
if (allowAllOrigins) {
  console.warn("[security] CORS_ORIGIN is not restricted — any website can call this API from a browser. Set it to your exact frontend URL once you're ready to lock this down.");
}
app.use(cors({ origin: allowAllOrigins ? true : corsOrigins }));
app.use(express.json({ limit: "2mb" }));
// A generous ceiling across the whole API — this isn't meant to affect real
// usage (a clinic's normal traffic is nowhere near this), just to blunt any
// scraping or automated-abuse attempt, even from a valid logged-in session.
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests — please slow down and try again shortly." } }));
// Uploaded photos are no longer served from a public static folder — see
// GET /api/upload/:filename below, which requires a valid login.

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Public
app.use("/api/auth", authRoutes);

// Everything below requires a valid login
app.use("/api", authenticate);
app.use("/api/settings", settingsRoutes);
app.use("/api/doctors", doctorsRoutes);
app.use("/api/cases", casesRoutes);
app.use("/api/collections", collectionsRoutes);
app.use("/api/doctor-pays", doctorPaysRoutes);
app.use("/api/referrals", referralsRoutes);
app.use("/api/gifts", giftsRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/assets", assetsRoutes);
app.use("/api/capital", capitalRoutes);
app.use("/api/statements", statementsRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/audit-log", auditLogRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/other-balance", otherBalanceRoutes);
app.use("/api/patient-master", patientMasterRoutes);
app.use("/api/bank-recon", bankReconRoutes);

// Anything that reaches here matched no route — respond with plain JSON,
// never Express's default HTML error page (which can hint at framework
// internals in some configurations).
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  // Full detail (including any file paths, table/column names, or stack
  // trace) goes only to Render's server logs — never to the client. This
  // is deliberate: a crash should never hand an attacker a map of the
  // system.
  console.error(err);
  if (err.message === "Only image files are allowed") {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === "23503") {
    // foreign_key_violation — e.g. trying to delete something another record still points to
    return res.status(409).json({ error: "This record is still linked to other data and can't be deleted directly. Remove or reassign the linked records first." });
  }
  if (err.code === "23505") {
    // unique_violation
    return res.status(409).json({ error: "That already exists — check for a duplicate entry." });
  }
  if (err.code === "23514") {
    // check_violation — a value didn't match a database rule (e.g. an allowed list)
    return res.status(400).json({ error: "That value isn't allowed for this field. Double-check what you entered." });
  }
  res.status(500).json({ error: "Something went wrong on the server" });
});

const { runMigrations } = require("./migrate");

const port = process.env.PORT || 4000;
runMigrations()
  .catch((e) => console.error("Migration runner failed:", e))
  .finally(() => {
    app.listen(port, () => console.log(`Clinic ERP API listening on port ${port}`));
  });
