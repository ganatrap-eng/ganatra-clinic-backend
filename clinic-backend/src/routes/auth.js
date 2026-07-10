const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");

const router = express.Router();

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, userId: user.user_id, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

// POST /api/auth/register  { userId, password, name, role }
router.post("/register", async (req, res) => {
  const { userId, password, name, role } = req.body;
  if (!userId || !password || password.length < 6) {
    return res.status(400).json({ error: "User ID and a password of at least 6 characters are required" });
  }
  const allowedRoles = ["Doctor", "Reception", "Nurse", "Admin"];
  const finalRole = allowedRoles.includes(role) ? role : "Reception";

  const existing = await pool.query("SELECT 1 FROM users WHERE user_id = $1", [userId]);
  if (existing.rowCount > 0) return res.status(409).json({ error: "That user ID is already registered" });

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `INSERT INTO users (user_id, password_hash, name, role)
     VALUES ($1, $2, $3, $4) RETURNING id, user_id, name, role`,
    [userId, passwordHash, name || userId, finalRole]
  );
  const user = result.rows[0];
  res.status(201).json({ token: issueToken(user), user: { userId: user.user_id, name: user.name, role: user.role } });
});

// POST /api/auth/login  { userId, password }
router.post("/login", async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) return res.status(400).json({ error: "User ID and password are required" });

  const result = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: "User ID or password is incorrect" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "User ID or password is incorrect" });

  res.json({ token: issueToken(user), user: { userId: user.user_id, name: user.name, role: user.role } });
});

module.exports = router;
