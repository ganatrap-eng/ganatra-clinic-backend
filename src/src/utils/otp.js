const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const OTP_TTL_MINUTES = 10;
// If real SMTP/Twilio credentials aren't set, OTPs are returned in the API
// response and logged to the server console instead of actually being sent —
// this keeps the whole flow testable before you've connected a real
// email/SMS provider. Set DEMO_OTP_MODE=false once real credentials are in.
const DEMO_OTP_MODE = process.env.DEMO_OTP_MODE !== "false";

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

async function createOtp(pool, userId, purpose) {
  const code = generateCode();
  const hash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  await pool.query(
    `INSERT INTO otps (user_id, purpose, code_hash, expires_at) VALUES ($1,$2,$3,$4)`,
    [userId, purpose, hash, expiresAt]
  );
  return code;
}

async function verifyOtp(pool, userId, purpose, code) {
  const r = await pool.query(
    `SELECT * FROM otps WHERE user_id=$1 AND purpose=$2 AND consumed=false
     ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose]
  );
  const row = r.rows[0];
  if (!row) return { ok: false, reason: "No OTP was requested." };
  if (new Date(row.expires_at) < new Date()) return { ok: false, reason: "That code has expired — request a new one." };
  const match = await bcrypt.compare(code, row.code_hash);
  if (!match) return { ok: false, reason: "Incorrect code." };
  await pool.query(`UPDATE otps SET consumed = true WHERE id = $1`, [row.id]);
  return { ok: true };
}

async function sendEmailOtp(email, code) {
  if (DEMO_OTP_MODE || !process.env.SMTP_HOST) {
    console.log(`[DEMO MODE] Email OTP for ${email}: ${code}`);
    return { sent: false, devCode: code };
  }
  const nodemailer = require("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: "Your Ganatra Clinic verification code",
    text: `Your verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
  });
  return { sent: true };
}

async function sendSmsOtp(mobile, code) {
  if (DEMO_OTP_MODE || !process.env.TWILIO_ACCOUNT_SID) {
    console.log(`[DEMO MODE] SMS OTP for ${mobile}: ${code}`);
    return { sent: false, devCode: code };
  }
  const twilio = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await twilio.messages.create({
    from: process.env.TWILIO_FROM_NUMBER,
    to: mobile,
    body: `Your Ganatra Clinic verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
  });
  return { sent: true };
}

module.exports = { createOtp, verifyOtp, sendEmailOtp, sendSmsOtp, DEMO_OTP_MODE };
