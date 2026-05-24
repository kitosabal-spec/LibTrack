const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('library.sqlite');

db.exec(`
  CREATE TABLE IF NOT EXISTS return_requests (
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
  )
`);

console.log('return_requests ready');
