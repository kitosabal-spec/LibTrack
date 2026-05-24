const express = require('express');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'library.sqlite');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(ROOT));

const db = new DatabaseSync(DB_FILE);

function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

const tableMap = {
  books: {
    table: 'books',
    columns: ['id', 'acqNo', 'acquiredDate', 'materialType', 'author', 'title', 'pubYear', 'category', 'copies', 'borrowed'],
    numberColumns: ['copies', 'borrowed'],
  },
  students: {
    table: 'students',
    columns: ['id', 'sid', 'name', 'course', 'sec'],
    numberColumns: [],
  },
  borrows: {
    table: 'borrows',
    columns: ['id', 'sid', 'sname', 'acqNo', 'title', 'author', 'bdate', 'btime', 'due', 'ret', 'fee'],
    numberColumns: ['fee'],
  },
  borrow_requests: {
    table: 'borrow_requests',
    columns: ['id', 'sid', 'sname', 'course', 'sec', 'acqNo', 'title', 'author', 'requestDate', 'requestTime', 'due', 'status', 'reviewedDate', 'reviewedTime', 'note'],
    numberColumns: [],
  },
  return_requests: {
    table: 'return_requests',
    columns: ['id', 'borrowId', 'sid', 'sname', 'acqNo', 'title', 'author', 'bdate', 'btime', 'due', 'requestDate', 'requestTime', 'fee', 'status', 'reviewedDate', 'reviewedTime', 'note'],
    numberColumns: ['fee'],
  },
  log: {
    table: 'log_entries',
    columns: ['id', 'sid', 'name', 'course', 'sec', 'tin', 'date'],
    numberColumns: [],
  },
  returns: {
    table: 'returns',
    columns: ['id', 'sid', 'sname', 'acqNo', 'title', 'author', 'bdate', 'btime', 'due', 'ret', 'fee'],
    numberColumns: ['fee'],
  },
  closed_days: {
    table: 'closed_days',
    columns: ['id', 'date', 'label'],
    numberColumns: [],
  },
};

function today() {
  return new Date().toISOString().split('T')[0];
}

function normalizeRows(key, rows) {
  const cfg = tableMap[key];
  return rows.map((row) => {
    const clean = {};
    cfg.columns.forEach((col) => {
      clean[col] = cfg.numberColumns.includes(col) ? Number(row[col] || 0) : (row[col] ?? '');
    });
    return clean;
  });
}

async function initDatabase() {
  await run(`CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    acqNo TEXT UNIQUE,
    acquiredDate TEXT,
    materialType TEXT,
    author TEXT,
    title TEXT,
    pubYear TEXT,
    category TEXT,
    copies INTEGER DEFAULT 1,
    borrowed INTEGER DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    sid TEXT UNIQUE,
    name TEXT,
    course TEXT,
    sec TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS borrows (
    id TEXT PRIMARY KEY,
    sid TEXT,
    sname TEXT,
    acqNo TEXT,
    title TEXT,
    author TEXT,
    bdate TEXT,
    btime TEXT,
    due TEXT,
    ret TEXT,
    fee INTEGER DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS borrow_requests (
    id TEXT PRIMARY KEY,
    sid TEXT,
    sname TEXT,
    course TEXT,
    sec TEXT,
    acqNo TEXT,
    title TEXT,
    author TEXT,
    requestDate TEXT,
    requestTime TEXT,
    due TEXT,
    status TEXT DEFAULT 'pending',
    reviewedDate TEXT,
    reviewedTime TEXT,
    note TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS return_requests (
    id TEXT PRIMARY KEY,
    borrowId TEXT,
    sid TEXT,
    sname TEXT,
    acqNo TEXT,
    title TEXT,
    author TEXT,
    bdate TEXT,
    btime TEXT,
    due TEXT,
    requestDate TEXT,
    requestTime TEXT,
    fee INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    reviewedDate TEXT,
    reviewedTime TEXT,
    note TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS log_entries (
    id TEXT PRIMARY KEY,
    sid TEXT,
    name TEXT,
    course TEXT,
    sec TEXT,
    tin TEXT,
    date TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS returns (
    id TEXT PRIMARY KEY,
    sid TEXT,
    sname TEXT,
    acqNo TEXT,
    title TEXT,
    author TEXT,
    bdate TEXT,
    btime TEXT,
    due TEXT,
    ret TEXT,
    fee INTEGER DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS closed_days (
    id TEXT PRIMARY KEY,
    date TEXT UNIQUE,
    label TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  const adminUser = await get('SELECT value FROM settings WHERE key = ?', ['admin_user']);
  if (!adminUser) {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['admin_user', 'admin']);
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['admin_pass', 'sti2024']);
  }
  const recoveryPass = await get('SELECT value FROM settings WHERE key = ?', ['recovery_pass']);
  if (!recoveryPass) {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['recovery_pass', 'sti-recover']); //Recovery Password
  }

}

async function readCollection(key) {
  const cfg = tableMap[key];
  const orderColumn = cfg.columns.includes('date') ? 'date DESC' : 'rowid DESC';
  const rows = await all(`SELECT ${cfg.columns.join(', ')} FROM ${cfg.table} ORDER BY ${orderColumn}`);
  return normalizeRows(key, rows);
}

async function replaceCollection(key, rows) {
  const cfg = tableMap[key];
  if (!cfg) throw new Error('Unknown collection.');
  if (!Array.isArray(rows)) throw new Error('Expected an array.');

  await run('BEGIN TRANSACTION');
  try {
    await run(`DELETE FROM ${cfg.table}`);
    const placeholders = cfg.columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${cfg.table} (${cfg.columns.join(', ')}) VALUES (${placeholders})`;
    for (const row of rows) {
      const values = cfg.columns.map((col) => cfg.numberColumns.includes(col) ? Number(row[col] || 0) : (row[col] ?? ''));
      await run(sql, values);
    }
    await run('COMMIT');
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }
}

app.get('/api/health', async (req, res) => {
  const result = await get('SELECT COUNT(*) AS books FROM books');
  res.json({ ok: true, database: 'library.sqlite', books: result.books });
});

app.get('/api/data', async (req, res, next) => {
  try {
    const data = {};
    for (const key of Object.keys(tableMap)) {
      data[key] = await readCollection(key);
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
});

app.post('/api/sync/:collection', async (req, res, next) => {
  try {
    const key = req.params.collection;
    if (!tableMap[key]) return res.status(404).json({ error: 'Unknown collection.' });
    const rows = Array.isArray(req.body) ? req.body : req.body.data;
    await replaceCollection(key, rows || []);
    res.json({ ok: true, collection: key, count: (rows || []).length });
  } catch (err) {
    next(err);
  }
});

app.post('/api/login', async (req, res, next) => {
  try {
    const { user, pass } = req.body;
    const adminUser = await get('SELECT value FROM settings WHERE key = ?', ['admin_user']);
    const adminPass = await get('SELECT value FROM settings WHERE key = ?', ['admin_pass']);
    if (user === adminUser.value && pass === adminPass.value) {
      return res.json({ ok: true, user });
    }
    res.status(401).json({ error: 'Incorrect username or password.' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/change-password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const adminPass = await get('SELECT value FROM settings WHERE key = ?', ['admin_pass']);
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing password.' });
    if (currentPassword !== adminPass?.value) return res.status(401).json({ error: 'Current password is incorrect.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    await run('UPDATE settings SET value = ? WHERE key = ?', [newPassword, 'admin_pass']);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/recover-password', async (req, res, next) => {
  try {
    const { recoveryPassword, newPassword } = req.body;
    const savedRecovery = await get('SELECT value FROM settings WHERE key = ?', ['recovery_pass']);
    if (!recoveryPassword || !newPassword) return res.status(400).json({ error: 'Missing recovery password or new password.' });
    const typedRecovery = String(recoveryPassword).trim();
    const currentRecovery = String(savedRecovery?.value || '').trim();
    if (typedRecovery !== currentRecovery) return res.status(401).json({ error: 'Recovery password is incorrect. Use sti-recover.' });
    const nextPassword = String(newPassword).trim();
    if (nextPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    await run('UPDATE settings SET value = ? WHERE key = ?', [nextPassword, 'admin_pass']);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/change-recovery-password', async (req, res, next) => {
  try {
    const { currentRecoveryPassword, newRecoveryPassword } = req.body;
    const savedRecovery = await get('SELECT value FROM settings WHERE key = ?', ['recovery_pass']);
    const currentRecovery = String(currentRecoveryPassword || '').trim();
    const nextRecovery = String(newRecoveryPassword || '').trim();
    if (!currentRecovery || !nextRecovery) return res.status(400).json({ error: 'Missing recovery password.' });
    if (currentRecovery !== String(savedRecovery?.value || '').trim()) return res.status(401).json({ error: 'Current recovery password is incorrect.' });
    if (nextRecovery.length < 6) return res.status(400).json({ error: 'New recovery password must be at least 6 characters.' });
    await run('UPDATE settings SET value = ? WHERE key = ?', [nextRecovery, 'recovery_pass']);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error.' });
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`STI LibTrack running at http://localhost:${PORT}`);
      console.log(`SQLite database: ${DB_FILE}`);
    });
  })
  .catch((err) => {
    console.error('Database startup failed:', err);
    throw err;
  });
