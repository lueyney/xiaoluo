const db = require('../config/database');

async function findByUsername (username) {
  const rows = await db.query(
    `SELECT id, username, display_name, password_hash, role, status, last_login_at
     FROM admin_users
     WHERE username = ? AND status = 1
     LIMIT 1`,
    [username]
  );
  return rows[0] || null;
}

async function findByUsernameIncludingDisabled (username) {
  const rows = await db.query(
    `SELECT id, username, display_name, role, status
     FROM admin_users
     WHERE username = ?
     LIMIT 1`,
    [username]
  );
  return rows[0] || null;
}

async function findById (id) {
  const rows = await db.query(
    `SELECT id, username, display_name, role, status, last_login_at, created_at, updated_at
     FROM admin_users
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function updateLastLogin (id) {
  await db.query(
    `UPDATE admin_users
     SET last_login_at = NOW()
     WHERE id = ?`,
    [id]
  );
}

async function listAdmins () {
  return db.query(
    `SELECT id, username, display_name, role, status, last_login_at, created_at, updated_at
     FROM admin_users
     ORDER BY created_at DESC`
  );
}

async function createAdmin ({ username, displayName, passwordHash, role }) {
  const rows = await db.query(
    `INSERT INTO admin_users (username, display_name, password_hash, role)
     VALUES (?, ?, ?, ?)`,
    [username, displayName, passwordHash, role]
  );
  return rows.insertId;
}

async function updateAdminStatus (id, status) {
  await db.query(
    `UPDATE admin_users
     SET status = ?, updated_at = NOW()
     WHERE id = ?`,
    [status, id]
  );
}

module.exports = {
  findByUsername,
  findByUsernameIncludingDisabled,
  findById,
  updateLastLogin,
  listAdmins,
  createAdmin,
  updateAdminStatus
};
