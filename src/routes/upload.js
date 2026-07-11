const express = require("express");
const multer = require("multer");
const path = require("path");
const { randomUUID } = require("crypto");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || "uploads"),
  filename: (req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

// POST /api/upload  (multipart/form-data, field name "photo")
// Returns a relative URL — mount /uploads as static in server.js so it's fetchable.
// PRODUCTION NOTE: replace this whole route with a signed-upload-URL endpoint for
// S3 / Cloud Storage / R2 so photos never round-trip through your API server.
router.post("/", upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file received (field name should be 'photo')" });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

module.exports = router;
