require("dotenv").config();
const express = require("express");
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

const app = express();
const corsOrigins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
const allowAllOrigins = corsOrigins.length === 0 || corsOrigins.includes("*");
app.use(cors({ origin: allowAllOrigins ? true : corsOrigins }));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(path.join(process.cwd(), process.env.UPLOAD_DIR || "uploads")));

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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Ganatra Clinic API listening on port ${port}`));
