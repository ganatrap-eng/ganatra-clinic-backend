const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { createOtp, verifyOtp, sendEmailOtp, sendSmsOtp } = require("../utils/otp");
const { fullPermissions, emptyPermissions } = require("../utils/permissions");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

const ADMIN_USER_ID = process.env.ADMIN_BOOTSTRAP_USER_ID || "pratik";
const ADMIN_EMAIL = (process.env.ADMIN_BOOTSTRAP_EMAIL || "ganatra.p@gmail.com").toLowerCase();
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// Slows down guessing attacks against passwords and OTP codes without
// getting in the way of a real person who mistypes once or twice.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts — wait 15 minutes and try again." } });
const registerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many sign-up attempts — wait 15 minutes and try again." } });
const otpVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts — wait 15 minutes and try again." } });
const otpSendLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests — wait 15 minutes and try again." } });

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, userId: user.user_id, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}
function publicUser(user) {
  return { userId: user.user_id, name: user.name, role: user.role, permissions: user.permissions, status: user.status, avatarUrl: user.avatar_url || null, doctorId: user.doctor_id || null };
}

// POST /api/auth/register  { userId, password, name, email?, mobile? }
router.post("/register", registerLimiter, async (req, res) => {
  const { userId, password, name, email, mobile } = req.body;
  if (!userId || !userId.trim()) return res.status(400).json({ error: "Choose a user ID." });
  if (!PASSWORD_RULE.test(password || "")) {
    return res.status(400).json({ error: "Password must be at least 8 characters and include a letter, a number, and a special character." });
  }
  const existing = await pool.query("SELECT 1 FROM users WHERE user_id = $1", [userId]);
  if (existing.rowCount > 0) return res.status(409).json({ error: "That user ID is already registered." });

  const isAdminBootstrap = userId === ADMIN_USER_ID && (email || "").toLowerCase() === ADMIN_EMAIL;
  const passwordHash = await bcrypt.hash(password, 12);

  if (isAdminBootstrap) {
    const r = await pool.query(
      `INSERT INTO users (user_id, password_hash, name, role, email, status, permissions)
       VALUES ($1,$2,$3,'Admin',$4,'pending_otp',$5) RETURNING *`,
      [userId, passwordHash, name || "Dr. Bhavisha Pratik Ganatra", email, JSON.stringify(fullPermissions())]
    );
    const user = r.rows[0];
    const code = await createOtp(pool, user.id, "admin_verify");
    const result = await sendEmailOtp(email, code);
    return res.status(201).json({
      requiresOtp: true, channel: "email", userId: user.user_id,
      message: result.sent
        ? "A verification code was emailed to you."
        : result.deliveryError
          ? "We tried to email your code but delivery failed — the code is shown below and in the server logs."
          : "A code was generated — check below (email delivery isn't connected yet).",
      devCode: result.sent ? undefined : result.devCode,
    });
  }

  if (!mobile || !mobile.trim()) {
    return res.status(400).json({ error: "A mobile number is required so you can reset your password later." });
  }
  const r = await pool.query(
    `INSERT INTO users (user_id, password_hash, name, role, email, mobile, status, permissions)
     VALUES ($1,$2,$3,NULL,$4,$5,'pending_approval',$6) RETURNING *`,
    [userId, passwordHash, name || userId, email || null, mobile, JSON.stringify(emptyPermissions())]
  );
  res.status(201).json({
    requiresOtp: false,
    message: "Registered — an administrator needs to approve your account and set your access before you can log in.",
    userId: r.rows[0].user_id,
  });
});

// POST /api/auth/verify-admin-otp  { userId, code }
router.post("/verify-admin-otp", otpVerifyLimiter, async (req, res) => {
  const { userId, code } = req.body;
  const r = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);
  const user = r.rows[0];
  if (!user || user.status !== "pending_otp") return res.status(400).json({ error: "No pending admin verification for this user ID." });
  const result = await verifyOtp(pool, user.id, "admin_verify", code);
  if (!result.ok) return res.status(400).json({ error: result.reason });
  const updated = await pool.query(
    `UPDATE users SET status = 'active' WHERE id = $1 RETURNING *`, [user.id]
  );
  const u = updated.rows[0];
  res.json({ token: issueToken(u), user: publicUser(u) });
});

// POST /api/auth/login  { userId, password }
router.post("/login", loginLimiter, async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) return res.status(400).json({ error: "User ID and password are required" });

  const result = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: "User ID or password is incorrect" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "User ID or password is incorrect" });

  if (user.status === "pending_otp") return res.status(403).json({ error: "Verify your admin email code before logging in." });
  if (user.status === "pending_approval") return res.status(403).json({ error: "Your account is awaiting administrator approval." });

  res.json({ token: issueToken(user), user: publicUser(user) });
});

// POST /api/auth/forgot-userid  { mobile } — sends an OTP to that mobile if a registered account uses it
router.post("/forgot-userid", otpSendLimiter, async (req, res) => {
  const { mobile } = req.body;
  if (!mobile || !mobile.trim()) return res.status(400).json({ error: "Enter your registered mobile number." });
  const r = await pool.query("SELECT * FROM users WHERE mobile = $1", [mobile.trim()]);
  const user = r.rows[0];
  if (!user) {
    return res.json({ message: "If that mobile number is registered, a code has been sent." });
  }
  const code = await createOtp(pool, user.id, "userid_recovery");
  const result = await sendSmsOtp(mobile.trim(), code);
  res.json({
    message: result.sent
      ? "A code was texted to that number."
      : result.deliveryError
        ? "We tried to text your code but delivery failed — the code is shown below and in the server logs."
        : "A code was generated — check below (SMS delivery isn't connected yet).",
    devCode: result.sent ? undefined : result.devCode,
  });
});

// POST /api/auth/verify-userid-otp  { mobile, code } — reveals the User ID once the code is confirmed
router.post("/verify-userid-otp", otpVerifyLimiter, async (req, res) => {
  const { mobile, code } = req.body;
  const r = await pool.query("SELECT * FROM users WHERE mobile = $1", [(mobile || "").trim()]);
  const user = r.rows[0];
  if (!user) return res.status(400).json({ error: "Invalid request." });
  const result = await verifyOtp(pool, user.id, "userid_recovery", code);
  if (!result.ok) return res.status(400).json({ error: result.reason });
  res.json({ userId: user.user_id });
});

// POST /api/auth/forgot-password  { userId }  — sends an SMS OTP to the registered mobile
router.post("/forgot-password", otpSendLimiter, async (req, res) => {
  const { userId } = req.body;
  const r = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);
  const user = r.rows[0];
  // Always respond the same way whether or not the user exists, so this
  // endpoint can't be used to find out which user IDs are registered.
  if (!user || !user.mobile) {
    return res.json({ message: "If that account exists and has a mobile number on file, a code has been sent." });
  }
  const code = await createOtp(pool, user.id, "password_reset");
  const result = await sendSmsOtp(user.mobile, code);
  res.json({
    message: result.sent
      ? "A code was texted to your registered mobile number."
      : result.deliveryError
        ? "We tried to text your code but delivery failed — the code is shown below and in the server logs."
        : "A code was generated — check below (SMS delivery isn't connected yet).",
    devCode: result.sent ? undefined : result.devCode,
  });
});

// POST /api/auth/reset-password  { userId, code, newPassword }
router.post("/reset-password", otpVerifyLimiter, async (req, res) => {
  const { userId, code, newPassword } = req.body;
  if (!PASSWORD_RULE.test(newPassword || "")) {
    return res.status(400).json({ error: "Password must be at least 8 characters and include a letter, a number, and a special character." });
  }
  const r = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);
  const user = r.rows[0];
  if (!user) return res.status(400).json({ error: "Invalid request." });
  const result = await verifyOtp(pool, user.id, "password_reset", code);
  if (!result.ok) return res.status(400).json({ error: result.reason });
  const hash = await bcrypt.hash(newPassword, 12);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, user.id]);
  res.json({ message: "Password updated — you can log in now." });
});

// PUT /api/auth/me/avatar  { imageUrl }
// Deliberately has no :id in the URL and never reads one from the body —
// req.user.sub (set by the authenticate middleware from the verified JWT)
// is the ONLY thing that decides whose row gets updated. This is what makes
// it structurally impossible for one logged-in user to overwrite another's
// avatar, even by tampering with the request.
router.put("/me/avatar", authenticate, async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.startsWith("/api/upload/")) {
    return res.status(400).json({ error: "A valid uploaded image URL is required." });
  }
  const r = await pool.query("UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING avatar_url", [imageUrl, req.user.sub]);
  res.json({ avatarUrl: r.rows[0].avatar_url });
});

module.exports = router;
