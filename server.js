const express = require('express');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = 3000;
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

  const bookCount = await get('SELECT COUNT(*) AS count FROM books');
  if (bookCount.count === 0) {
    await seedDatabase();
  }
}

async function seedDatabase() {
  const t = today();
  const books = [
    { id:'B001', acqNo:'ACQ-0001', title:'Introduction to Programming', author:'John Zelle', category:'Technology', copies:3, borrowed:1, acquiredDate:t, materialType:'Book', pubYear:'2024' },
    { id:'B002', acqNo:'ACQ-0002', title:'Discrete Mathematics', author:'Kenneth Rosen', category:'Mathematics', copies:2, borrowed:0, acquiredDate:t, materialType:'Book', pubYear:'2024' },
    { id:'B003', acqNo:'ACQ-0003', title:'Data Structures and Algorithms', author:'Thomas Cormen', category:'Technology', copies:4, borrowed:2, acquiredDate:t, materialType:'Book', pubYear:'2024' },
    { id:'B004', acqNo:'ACQ-0004', title:'Philippine History', author:'Teodoro Agoncillo', category:'History', copies:3, borrowed:1, acquiredDate:t, materialType:'Book', pubYear:'2024' },
    { id:'B005', acqNo:'ACQ-0005', title:'Noli Me Tangere', author:'Jose Rizal', category:'Literature', copies:5, borrowed:0, acquiredDate:t, materialType:'Book', pubYear:'2024' },
    { id:'B006', acqNo:'ACQ-0006', title:'General Chemistry', author:'Zumdahl & Zumdahl', category:'Science', copies:2, borrowed:1, acquiredDate:t, materialType:'Book', pubYear:'2024' },
    { id:'B007', acqNo:'ACQ-0007', title:'El Filibusterismo', author:'Jose Rizal', category:'Literature', copies:4, borrowed:0, acquiredDate:t, materialType:'Book', pubYear:'2024' },
    { id:'B008', acqNo:'ACQ-0008', title:'Calculus: Early Transcendentals', author:'James Stewart', category:'Mathematics', copies:3, borrowed:1, acquiredDate:t, materialType:'Book', pubYear:'2024' },
    { id:'B009', acqNo:'ACQ-0009', title:'Web Development with JavaScript', author:'Jon Duckett', category:'Technology', copies:2, borrowed:0, acquiredDate:t, materialType:'Book', pubYear:'2024' },
    { id:'B010', acqNo:'ACQ-0010', title:'Fundamentals of Nursing', author:'Potter & Perry', category:'Science', copies:3, borrowed:2, acquiredDate:t, materialType:'Book', pubYear:'2024' },
  ];

  const students = [
    { id:'S001', sid:'2024-00101', name:'Maria Santos', course:'BSIT', sec:'2A' },
    { id:'S002', sid:'2024-00102', name:'Juan Reyes', course:'BSCS', sec:'3B' },
    { id:'S003', sid:'2024-00103', name:'Ana Cruz', course:'BSBA', sec:'1C' },
    { id:'S004', sid:'2024-00104', name:'Carlo Dela Torre', course:'BSN', sec:'2B' },
    { id:'S005', sid:'2024-00105', name:'Lisa Mendoza', course:'BSIT', sec:'1A' },
    { id:'S006', sid:'2024-00106', name:'Mark Aquino', course:'BSCS', sec:'2A' },
    { id:'S007', sid:'2024-00107', name:'Rhea Villanueva', course:'BSBA', sec:'3A' },
    { id:'S008', sid:'2024-00108', name:'Nico Bautista', course:'BSIT', sec:'1B' },
  ];

  const borrows = [
    { id:'BR001', sid:'2024-00101', sname:'Maria Santos', acqNo:'ACQ-0001', title:'Introduction to Programming', author:'John Zelle', bdate:t, btime:'08:30 AM', due:t, ret:'', fee:0 },
    { id:'BR002', sid:'2024-00102', sname:'Juan Reyes', acqNo:'ACQ-0003', title:'Data Structures and Algorithms', author:'Thomas Cormen', bdate:t, btime:'09:15 AM', due:t, ret:'', fee:0 },
  ];

  const logRows = [
    { id:'L001', sid:'2024-00101', name:'Maria Santos', course:'BSIT', sec:'2A', tin:'08:15 AM', date:t },
    { id:'L002', sid:'2024-00102', name:'Juan Reyes', course:'BSCS', sec:'3B', tin:'09:00 AM', date:t },
  ];

  await replaceCollection('books', books);
  await replaceCollection('students', students);
  await replaceCollection('borrows', borrows);
  await replaceCollection('log', logRows);
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
    if (currentPassword !== adminPass.value) return res.status(401).json({ error: 'Current password is incorrect.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    await run('UPDATE settings SET value = ? WHERE key = ?', [newPassword, 'admin_pass']);
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

