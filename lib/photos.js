const multer = require('multer');
const db = require('../db');

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];

// Photos are kept in memory, then saved into Postgres (Render's disk is wiped on every deploy).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.includes(file.mimetype)),
});

async function savePhotos(ownerType, ownerId, files = [], kind = 'upload') {
  for (const f of files) {
    await db.query(
      `INSERT INTO nl_photos (owner_type, owner_id, kind, filename, mime, bytes, data) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [ownerType, ownerId, kind, f.originalname, f.mimetype, f.size, f.buffer]);
  }
}

async function listPhotos(ownerType, ownerId) {
  const { rows } = await db.query(
    `SELECT id, kind, filename, bytes FROM nl_photos WHERE owner_type=$1 AND owner_id=$2 ORDER BY kind, id`, [ownerType, ownerId]);
  return rows;
}

module.exports = { upload, savePhotos, listPhotos };
