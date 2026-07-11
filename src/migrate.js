const fs = require("fs");
const path = require("path");
const { pool } = require("./db");

/** Runs every .sql file in /sql, in filename order, on every server boot.
 *  Every migration in this project uses IF NOT EXISTS / ADD COLUMN IF NOT
 *  EXISTS guards, so re-running an already-applied file is a harmless no-op.
 *  This means deploying new code is enough to also apply new migrations —
 *  no manual Shell step required. */
async function runMigrations() {
  const dir = path.join(__dirname, "..", "sql");
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  } catch (e) {
    console.error("No sql/ directory found, skipping migrations:", e.message);
    return;
  }
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    try {
      await pool.query(sql);
      console.log(`[migrate] applied ${file}`);
    } catch (e) {
      console.error(`[migrate] ${file} reported an error (often harmless if already applied): ${e.message}`);
    }
  }
}

module.exports = { runMigrations };
