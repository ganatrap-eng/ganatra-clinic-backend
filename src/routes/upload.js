const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

// POST /api/upload  (multipart/form-data, field name "photo")
// Already behind the global authenticate middleware in server.js, so only
// logged-in staff can upload. Returns an authenticated URL to fetch it back.
// PRODUCTION NOTE: replace this whole route with a signed-upload-URL endpoint for
// S3 / Cloud Storage / R2 so photos never round-trip through your API server.
router.post("/", upload.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file received (field name should be 'photo')" });
  res.status(201).json({ url: `/api/upload/${req.file.filename}` });
});

// GET /api/upload/:filename — also behind the global authenticate middleware,
// so a photo can only be viewed by someone who's actually logged in, not by
// anyone who happens to have or guess the link.
router.get("/:filename", (req, res) => {
  const filename = path.basename(req.params.filename); // strips any "../" path traversal attempt
  const filePath = path.join(process.cwd(), UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
  res.sendFile(filePath);
});

module.exports = router;
