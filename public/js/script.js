// ================================================================
//  STI College Naga Library System - script.js (clean rebuild)
// ================================================================

/* DATA STORE - now loaded from Express + SQLite */
const COLLECTION_NAMES = ['books', 'students', 'borrows', 'log', 'returns', 'closed_days'];
const syncTimers = {};

const DB = {
  cache: Object.fromEntries(COLLECTION_NAMES.map(k => [k, []])),
  ready: false,
  get: k => DB.cache[k] || [],
  set: (k, v) => {
    DB.cache[k] = Array.isArray(v) ? v : [];
    if (DB.ready && COLLECTION_NAMES.includes(k)) queueSync(k);
  },
};

async function apiJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function loadDatabase() {
  const data = await apiJson('/api/data');
  COLLECTION_NAMES.forEach(k => { DB.cache[k] = Array.isArray(data[k]) ? data[k] : []; });
  DB.ready = true;
}

function queueSync(key) {
  clearTimeout(syncTimers[key]);
  syncTimers[key] = setTimeout(() => syncCollection(key), 120);
}

async function syncCollection(key) {
  try {
    await apiJson(`/api/sync/${encodeURIComponent(key)}`, {
      method: 'POST',
      body: JSON.stringify(DB.cache[key] || []),
    });
  } catch (err) {
    console.error(err);
    if (typeof toast === 'function') toast('Database save failed. Check if the server is running.', 'error', 'fa-database');
  }
}
/* HELPERS */
const $   = id  => document.getElementById(id);
const val = id  => ($( id )?.value || '').trim();
const esc = s   => String(s).replace(/'/g, "\\'");
const today = () => new Date().toISOString().split('T')[0];
const nowTime = () => new Date().toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', hour12:true });
const nowDateTime = () => new Date().toLocaleString('en-PH', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:true });
const borrowStamp = b => [b.bdate, b.btime].filter(Boolean).join(' ');
const normalizeAcq = s => String(s || '').trim().toUpperCase();
const acqLabel = b => b.acqNo || b.id || '-';
const findBookByAcq = acq => DB.get('books').find(b => normalizeAcq(b.acqNo) === normalizeAcq(acq));
const findStudentBySid = sid => DB.get('students').find(s => String(s.sid || '').toLowerCase() === String(sid || '').trim().toLowerCase());
const nextAcqNo = books => {
  let n = 1;
  const used = new Set(books.map(b => normalizeAcq(b.acqNo)));
  while (used.has(`ACQ-${String(n).padStart(4, '0')}`)) n++;
  return `ACQ-${String(n).padStart(4, '0')}`;
};
const initials  = n => n.trim().split(' ').map(w => w[0] || '').join('').substring(0,2).toUpperCase();
const LATE_FEE_PER_DAY = 10;
const BORROW_DAYS = 2;
const parseDate = s => {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const closedDays = () => DB.get('closed_days');
const isWeekend = d => [0, 6].includes(d.getDay());
const isAdminClosedDay = d => closedDays().some(x => x.date === dateKey(d));
const isCountedDay = d => !isWeekend(d) && !isAdminClosedDay(d);
const addCountedDays = (start, days) => {
  const d = parseDate(start);
  if (!d) return today();
  let count = 0;
  while (count < days) {
    d.setDate(d.getDate() + 1);
    if (isCountedDay(d)) count++;
  }
  return dateKey(d);
};
const countCountedDaysBetween = (from, to) => {
  const d = parseDate(from);
  const end = parseDate(to);
  if (!d || !end || end <= d) return 0;
  let count = 0;
  while (d < end) {
    d.setDate(d.getDate() + 1);
    if (d <= end && isCountedDay(d)) count++;
  }
  return count;
};
const lateDays = (due, returned = today()) => countCountedDaysBetween(due, returned);
const lateFee = days => days * LATE_FEE_PER_DAY;
const isOverdue = d => lateDays(d) > 0;

/* THEME */
const THEME_KEY = 'sti_libtrack_theme';

function preferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  updateThemeButtons(next);
}

function updateThemeButtons(theme) {
  const isDark = theme === 'dark';
  ['theme-toggle', 'admin-theme-toggle', 'settings-theme-toggle'].forEach(id => {
    const toggle = $(id);
    const icon = toggle?.querySelector('i');
    if (!toggle || !icon) return;
    icon.className = `fas ${isDark ? 'fa-sun' : 'fa-moon'}`;
    toggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    toggle.setAttribute('aria-label', toggle.title);
  });
  if ($('drawer-theme-icon')) $('drawer-theme-icon').className = `fas ${isDark ? 'fa-sun' : 'fa-moon'}`;
  if ($('drawer-theme-label')) $('drawer-theme-label').textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

function initTheme() {
  setTheme(preferredTheme());
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(next);
  toast(`${next === 'dark' ? 'Dark' : 'Light'} mode enabled.`, 'info', next === 'dark' ? 'fa-moon' : 'fa-sun');
}

/* SEED DATA */
function seedData() {
  if (DB.get('seeded').length) return;
  DB.set('books', [
    { id:'B001', acqNo:'ACQ-0001', title:'Introduction to Programming',     author:'John Zelle',        category:'Technology',  copies:3, borrowed:1 },
    { id:'B002', acqNo:'ACQ-0002', title:'Discrete Mathematics',            author:'Kenneth Rosen',     category:'Mathematics', copies:2, borrowed:0 },
    { id:'B003', acqNo:'ACQ-0003', title:'Data Structures and Algorithms',  author:'Thomas Cormen',     category:'Technology',  copies:4, borrowed:2 },
    { id:'B004', acqNo:'ACQ-0004', title:'Philippine History',              author:'Teodoro Agoncillo', category:'History',     copies:3, borrowed:1 },
    { id:'B005', acqNo:'ACQ-0005', title:'Noli Me Tangere',                 author:'Jose Rizal',        category:'Literature',  copies:5, borrowed:0 },
    { id:'B006', acqNo:'ACQ-0006', title:'General Chemistry',               author:'Zumdahl & Zumdahl',category:'Science',     copies:2, borrowed:1 },
    { id:'B007', acqNo:'ACQ-0007', title:'El Filibusterismo',               author:'Jose Rizal',        category:'Literature',  copies:4, borrowed:0 },
    { id:'B008', acqNo:'ACQ-0008', title:'Calculus: Early Transcendentals', author:'James Stewart',     category:'Mathematics', copies:3, borrowed:1 },
    { id:'B009', acqNo:'ACQ-0009', title:'Web Development with JavaScript', author:'Jon Duckett',       category:'Technology',  copies:2, borrowed:0 },
    { id:'B010', acqNo:'ACQ-0010', title:'Fundamentals of Nursing',         author:'Potter & Perry',    category:'Science',     copies:3, borrowed:2 },
  ]);
  DB.set('students', [
    { id:'S001', sid:'2024-00101', name:'Maria Santos',     course:'BSIT', sec:'2A' },
    { id:'S002', sid:'2024-00102', name:'Juan Reyes',       course:'BSCS', sec:'3B' },
    { id:'S003', sid:'2024-00103', name:'Ana Cruz',         course:'BSBA', sec:'1C' },
    { id:'S004', sid:'2024-00104', name:'Carlo Dela Torre', course:'BSN',  sec:'2B' },
    { id:'S005', sid:'2024-00105', name:'Lisa Mendoza',     course:'BSIT', sec:'1A' },
    { id:'S006', sid:'2024-00106', name:'Mark Aquino',      course:'BSCS', sec:'2A' },
    { id:'S007', sid:'2024-00107', name:'Rhea Villanueva',  course:'BSBA', sec:'3A' },
    { id:'S008', sid:'2024-00108', name:'Nico Bautista',    course:'BSIT', sec:'1B' },
  ]);
  const t = today();
  DB.set('borrows', [
    { id:'BR001', sid:'2024-00101', sname:'Maria Santos',     title:'Introduction to Programming',    author:'John Zelle',        bdate:'2025-03-10', due:t,            ret:null, fee:0 },
    { id:'BR002', sid:'2024-00102', sname:'Juan Reyes',       title:'Data Structures and Algorithms', author:'Thomas Cormen',     bdate:'2025-03-05', due:'2025-03-12', ret:null, fee:0 },
    { id:'BR003', sid:'2024-00103', sname:'Ana Cruz',         title:'Philippine History',             author:'Teodoro Agoncillo', bdate:'2025-03-08', due:'2025-03-15', ret:null, fee:0 },
    { id:'BR004', sid:'2024-00104', sname:'Carlo Dela Torre', title:'General Chemistry',              author:'Zumdahl & Zumdahl', bdate:'2025-03-14', due:'2025-03-21', ret:null, fee:0 },
    { id:'BR005', sid:'2024-00105', sname:'Lisa Mendoza',     title:'Calculus: Early Transcendentals',author:'James Stewart',     bdate:'2025-03-12', due:'2025-03-19', ret:null, fee:0 },
  ]);
  DB.set('log', [
    { id:'L001', sid:'2024-00101', name:'Maria Santos', course:'BSIT', sec:'2A', tin:'08:15 AM', date:t },
    { id:'L002', sid:'2024-00102', name:'Juan Reyes',   course:'BSCS', sec:'3B', tin:'09:00 AM', date:t },
  ]);
  DB.set('returns', []);
  DB.set('seeded', ['yes']);
}

function ensureBookAcqNumbers() {
  const books = DB.get('books');
  let changed = false;
  books.forEach((book, i) => {
    if (!book.acqNo) {
      book.acqNo = `ACQ-${String(i + 1).padStart(4, '0')}`;
      changed = true;
    } else {
      const clean = normalizeAcq(book.acqNo);
      if (book.acqNo !== clean) {
        book.acqNo = clean;
        changed = true;
      }
    }
    if (!book.acquiredDate) {
      book.acquiredDate = today();
      changed = true;
    }
    if (!book.pubYear) {
      book.pubYear = '';
      changed = true;
    }
    if (book.materialType === 'Research Paper') {
      book.materialType = 'Research Papers';
      changed = true;
    }
    if (!book.materialType) {
      book.materialType = 'Book';
      changed = true;
    }
    if (!book.copies) {
      book.copies = 1;
      changed = true;
    }
  });
  if (changed) DB.set('books', books);
}

function ensureBorrowAcqNumbers() {
  const books = DB.get('books');
  const borrows = DB.get('borrows');
  let changed = false;
  borrows.forEach(rec => {
    if (!rec.acqNo) {
      const book = books.find(b => b.title.toLowerCase() === rec.title.toLowerCase());
      if (book?.acqNo) {
        rec.acqNo = book.acqNo;
        changed = true;
      }
    }
  });
  if (changed) DB.set('borrows', borrows);
}

/* TOAST */
function toast(msg, type='info', icon='fa-info-circle') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="t-ico"><i class="fas ${icon}"></i></div><span>${msg}</span>`;
  $('toasts').appendChild(el);
  setTimeout(() => { el.style.cssText = 'opacity:0;transform:translateX(20px);transition:.3s'; setTimeout(() => el.remove(), 300); }, 3500);
}

/* STATS */
function updateStats() {
  const books = DB.get('books');
  const log   = DB.get('log');
  const bors  = DB.get('borrows');
  const t     = today();
  if ($('stat-books')) $('stat-books').textContent = books.reduce((s,b) => s + Math.max(0, b.copies - (b.borrowed||0)), 0);
  if ($('stat-visits')) $('stat-visits').textContent = log.filter(l => l.date === t).length;
  if ($('stat-borrowed')) $('stat-borrowed').textContent = bors.filter(b => !b.ret).length;
  if ($('stat-overdue')) $('stat-overdue').textContent = bors.filter(b => !b.ret && isOverdue(b.due)).length;
}

/* CLOCK */
function startClock() {
  function tick() {
    const now = new Date();
    const ts  = now.toLocaleTimeString('en-PH',  { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
    const ds  = now.toLocaleDateString('en-PH',  { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    if ($('clock-time')) $('clock-time').textContent = ts;
    if ($('clock-date')) $('clock-date').textContent = ds;
    if ($('bor-date')) $('bor-date').value = nowDateTime();
  }
  tick();
  setInterval(tick, 1000);
}

/* PAGE NAV */
function showPage(id) {
  document.body.classList.remove('admin-mode');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.drawer-item').forEach(n => n.classList.remove('active'));
  $('page-' + id).classList.add('active');
  if ($('nav-' + id)) $('nav-' + id).classList.add('active');
  if ($('dnav-' + id)) $('dnav-' + id).classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'logbook') { renderLogToday(); refreshDateBadge(); }
  if (id === 'borrow')  { renderBorrowBookList(); setDefaultDates(); }
  if (id === 'return')  { renderReturnHistory(); $('ret-date').value = today(); }
}

/* DRAWER */
function toggleDrawer() {
  $('drawer').classList.toggle('open');
  $('drawer-bg').classList.toggle('open');
}

/* LOGBOOK - TIME IN */

function refreshDateBadge() {
  if ($('logbook-date')) $('logbook-date').textContent =
    new Date().toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' });
}

/* Autocomplete helpers */
function closeAC(dropId) {
  const d = $(dropId);
  if (d) d.classList.remove('open');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.ac-wrap')) {
    document.querySelectorAll('.ac-drop').forEach(d => d.classList.remove('open'));
  }
});

function buildAcItem(s, onclick) {
  return `<div class="ac-item" onclick="${onclick}">
    <div class="ac-av">${initials(s.name)}</div>
    <div><div class="ac-name">${s.name}</div><div class="ac-sub">${s.sid} &nbsp;|&nbsp; ${s.course} ${s.sec||''}</div></div>
  </div>`;
}

/* Search students for Time In */
function searchForTimeIn(q) {
  const drop = $('in-drop');
  if (!q.trim()) { drop.classList.remove('open'); return; }
  const fl = q.toLowerCase();
  const matches = DB.get('students').filter(s =>
    s.name.toLowerCase().includes(fl) || s.sid.toLowerCase().includes(fl)
  );
  if (!matches.length) {
    drop.innerHTML = `<div class="ac-none">No student found for "${q}"</div>`;
  } else {
    drop.innerHTML = matches.map(s =>
      buildAcItem(s, `pickStudentForIn('${esc(s.sid)}','${esc(s.name)}','${esc(s.course)}','${esc(s.sec||'')}')`)
    ).join('');
  }
  drop.classList.add('open');
}

function pickStudentForIn(sid, name, course, sec) {
  $('in-id').value      = sid;
  $('in-name').value    = name;
  $('in-course').value  = course;
  $('in-section').value = sec;
  $('in-search').value  = `${name} (${sid})`;
  closeAC('in-drop');
  toast('Student found! Tap Log Time In.', 'info', 'fa-user-check');
}

/* Do Time In */
function doTimeIn() {
  const sid     = val('in-id');

  if (!sid) {
    toast('Please select a registered student.', 'error', 'fa-exclamation-circle');
    return;
  }

  const student = findStudentBySid(sid);
  if (!student) {
    toast('Student is not registered. Ask the librarian to add the student first.', 'error', 'fa-user-lock');
    return;
  }

  const log   = DB.get('log');
  const t     = today();
  if (log.find(l => l.sid === sid && l.date === t)) {
    toast(`${student.name} is already logged today.`, 'error', 'fa-exclamation-circle');
    return;
  }

  const tin = nowTime();
  log.unshift({ id: 'L' + Date.now(), sid: student.sid, name: student.name, course: student.course || '', sec: student.sec || '', tin, date: t });
  DB.set('log', log);

  // Clear form
  ['in-id','in-name','in-course','in-section'].forEach(id => $(id).value = '');
  $('in-search').value   = '';

  renderLogToday();
  updateStats();

  toast(`${student.name} - Time In at ${tin}`, 'success', 'fa-sign-in-alt');
}

/* Render today's log table */
function renderLogToday(filter = '') {
  const tbody = $('tb-log-today');
  const t     = today();
  let rows    = DB.get('log').filter(l => l.date === t);
  if (filter) {
    const f = filter.toLowerCase();
    rows = rows.filter(l => l.name.toLowerCase().includes(f) || l.sid.toLowerCase().includes(f));
  }
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty"><i class="fas fa-clipboard"></i><span>No entries today.</span></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(l => `
    <tr>
      <td><span class="tag">${l.sid}</span></td>
      <td><strong>${l.name}</strong></td>
      <td>${l.course||'-'} ${l.sec||''}</td>
      <td>${l.tin}</td>
    </tr>`
  ).join('');
}
function filterLog(v) { renderLogToday(v); }

/* BORROW */

/* Search students for borrow page */
function searchForBorrow(q) {
  const drop = $('bor-drop');
  if (!q.trim()) { drop.classList.remove('open'); return; }
  const fl = q.toLowerCase();
  const matches = DB.get('students').filter(s =>
    s.name.toLowerCase().includes(fl) || s.sid.toLowerCase().includes(fl)
  );
  if (!matches.length) {
    drop.innerHTML = `<div class="ac-none">No student found</div>`;
  } else {
    drop.innerHTML = matches.map(s =>
      buildAcItem(s, `pickStudentForBorrow('${esc(s.sid)}','${esc(s.name)}')`)
    ).join('');
  }
  drop.classList.add('open');
}

function pickStudentForBorrow(sid, name) {
  $('bor-sid').value    = sid;
  $('bor-name').value   = name;
  $('bor-search').value = `${name} (${sid})`;
  closeAC('bor-drop');
  $('bor-acq').focus();
}

/* Live availability check */
function checkBookAvail(acq) {
  const el = $('avail-box');
  $('bor-title').value = '';
  $('bor-author').value = '';
  if (!acq.trim()) { el.innerHTML = ''; return; }
  const book = findBookByAcq(acq);
  if (!book) {
    el.innerHTML = `<div class="avail-unk"><i class="fas fa-search"></i> No book found with acquisition number ${acq}</div>`;
  } else if (DB.get('borrows').find(b => normalizeAcq(b.acqNo) === normalizeAcq(book.acqNo) && !b.ret)) {
    $('bor-title').value = book.title;
    $('bor-author').value = book.author;
    el.innerHTML = `<div class="avail-no"><i class="fas fa-times-circle"></i> ${book.acqNo} is currently borrowed</div>`;
  } else if (book.borrowed >= book.copies) {
    $('bor-title').value = book.title;
    $('bor-author').value = book.author;
    el.innerHTML = `<div class="avail-no"><i class="fas fa-times-circle"></i> All ${book.copies} copies are currently borrowed</div>`;
  } else {
    $('bor-title').value = book.title;
    $('bor-author').value = book.author;
    el.innerHTML = `<div class="avail-yes"><i class="fas fa-check-circle"></i> ${book.acqNo} available - ${book.title}</div>`;
  }
}

function setDefaultDates() {
  $('bor-date').value   = nowDateTime();
  $('bor-return').value = addCountedDays(today(), BORROW_DAYS);
}

function doBorrow() {
  const sid    = val('bor-sid');
  const acqNo  = normalizeAcq(val('bor-acq'));
  const due    = val('bor-return');
  const bdate  = today();
  const btime  = nowTime();

  if (!sid || !acqNo || !due) {
    toast('Fill in Student ID, Acquisition Number and Return Date.', 'error', 'fa-exclamation-circle');
    return;
  }

  const student = findStudentBySid(sid);
  if (!student) {
    toast('Student is not registered. Ask the librarian to add the student first.', 'error', 'fa-user-lock');
    return;
  }

  const books = DB.get('books');
  const book  = books.find(b => normalizeAcq(b.acqNo) === acqNo);
  if (!book) {
    toast('No book found with that acquisition number.', 'error', 'fa-search');
    return;
  }

  const bors = DB.get('borrows');
  if (bors.find(b => normalizeAcq(b.acqNo) === acqNo && !b.ret)) {
    toast('That acquisition number is already borrowed.', 'error', 'fa-exclamation-circle');
    return;
  }
  if (bors.find(b => b.sid === sid && b.title.toLowerCase() === book.title.toLowerCase() && !b.ret)) {
    toast('This student already has that book borrowed.', 'error', 'fa-exclamation-circle');
    return;
  }

  if (book && book.borrowed >= book.copies) {
    toast('All copies of this book are currently borrowed.', 'error', 'fa-times-circle');
    return;
  }

  if (!confirm(`Confirm borrow?\n\nStudent: ${student.name}\nMaterial: ${book.acqNo} - ${book.title}\nDue date: ${due}`)) return;

  bors.unshift({ id:'BR'+Date.now(), sid: student.sid, sname: student.name, acqNo: book.acqNo, title: book.title, author: book.author, bdate, btime, due, ret:null, fee:0 });
  DB.set('borrows', bors);
  if (book) { book.borrowed = (book.borrowed||0) + 1; DB.set('books', books); }

  ['bor-sid','bor-name','bor-acq','bor-title','bor-author'].forEach(id => $(id).value = '');
  $('bor-search').value  = '';
  $('avail-box').innerHTML = '';
  setDefaultDates();
  renderBorrowBookList();
  updateStats();
  toast(`${book.acqNo} - "${book.title}" borrowed by ${student.name}!`, 'success', 'fa-check-circle');
}

function renderBorrowBookList(filter = '') {
  const tbody = $('tb-borrow-books');
  if (!tbody) return;
  const typeFilter = val('borrow-type-filter');
  let rows = DB.get('books');
  if (!filter) filter = val('borrow-book-search');
  if (typeFilter) {
    rows = rows.filter(b => (b.materialType || 'Book') === typeFilter);
  }
  if (filter) {
    const f = filter.toLowerCase();
    rows = rows.filter(b =>
      String(b.title || '').toLowerCase().includes(f) ||
      String(b.author || '').toLowerCase().includes(f) ||
      String(b.materialType || 'Book').toLowerCase().includes(f) ||
      acqLabel(b).toLowerCase().includes(f)
    );
  }
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><i class="fas fa-book"></i><span>No materials found.</span></div></td></tr>`; return; }
  tbody.innerHTML = rows.map(b => {
    const unavailable = DB.get('borrows').some(x => normalizeAcq(x.acqNo) === normalizeAcq(b.acqNo) && !x.ret) || (b.borrowed || 0) >= (b.copies || 1);
    return `<tr>
      <td><span class="tag">${acqLabel(b)}</span></td>
      <td>${b.materialType || 'Book'}</td>
      <td><strong>${b.title || 'Untitled Acquisition'}</strong></td>
      <td>${b.author || '-'}</td>
      <td>${unavailable?'<span class="badge badge-red"><i class="fas fa-times"></i> Borrowed</span>':'<span class="badge badge-green"><i class="fas fa-check"></i> Available</span>'}</td>
      <td><button class="btn btn-outline btn-sm" style="height:28px;padding:0 10px;font-size:11px" onclick="pickBorrowBook('${esc(acqLabel(b))}')" ${unavailable?'disabled':''}><i class="fas fa-plus"></i></button></td>
    </tr>`;
  }).join('');
}
function filterBorrowBooks(v = '') { renderBorrowBookList(v); }
function pickBorrowBook(acqNo) {
  $('bor-acq').value = acqNo;
  checkBookAvail(acqNo);
  $('bor-acq').focus();
}

/* RETURN */

function lookupStudentBorrows(sid) {
  const sel  = $('ret-book');
  const rows = DB.get('borrows').filter(b => b.sid === sid && !b.ret);
  sel.innerHTML = rows.length
    ? '<option value="">- Select book -</option>' + rows.map(b => `<option value="${b.id}">${acqLabel(b)} - ${b.title} (Due: ${b.due})</option>`).join('')
    : '<option value="">- No active borrows for this ID -</option>';
  $('fee-box').innerHTML = '';
}

function calcLateFee() {
  const bid = val('ret-book');
  const rd  = today();
  if ($('ret-date')) $('ret-date').value = rd;
  if (!bid || !rd) { $('fee-box').innerHTML = ''; return; }
  const rec  = DB.get('borrows').find(b => b.id === bid);
  if (!rec) return;
  const days = lateDays(rec.due, rd);
  const fee  = lateFee(days);
  $('fee-box').innerHTML = fee > 0
    ? `<div class="fee-late"><div class="fee-lbl"><i class="fas fa-calculator"></i> Late Fee</div><div class="fee-big">&#8369;${fee}.00</div><div class="fee-sub">${days} counted day(s) overdue x &#8369;${LATE_FEE_PER_DAY}/day</div></div>`
    : `<div class="fee-ok"><div class="fee-lbl"><i class="fas fa-check-circle"></i> Fee Status</div><div class="fee-big"><i class="fas fa-check"></i> No Late Fee</div><div class="fee-sub">Returned on time - thank you!</div></div>`;
}

function doReturn() {
  const bid = val('ret-book');
  const rd  = today();
  if ($('ret-date')) $('ret-date').value = rd;
  if (!bid || !rd) { toast('Fill in all fields.', 'error', 'fa-exclamation-circle'); return; }
  const bors = DB.get('borrows');
  const rec  = bors.find(b => b.id === bid);
  if (!rec) return;
  const days = lateDays(rec.due, rd);
  const fee  = lateFee(days);
  if (!confirm(`Confirm return?\n\nStudent: ${rec.sname}\nMaterial: ${acqLabel(rec)} - ${rec.title}\nLate fee: PHP ${fee}`)) return;

  rec.ret = rd; rec.fee = fee;
  DB.set('borrows', bors);
  const books = DB.get('books');
  const book  = books.find(b => normalizeAcq(b.acqNo) === normalizeAcq(rec.acqNo)) || books.find(b => b.title.toLowerCase() === rec.title.toLowerCase());
  if (book && book.borrowed > 0) { book.borrowed--; DB.set('books', books); }
  const rets = DB.get('returns');
  rets.unshift({ ...rec });
  DB.set('returns', rets);
  renderReturnHistory();
  renderBorrowBookList();
  updateStats();
  $('fee-box').innerHTML = '';
  $('ret-book').innerHTML = '<option>- Enter Student ID first -</option>';
  $('ret-sid').value  = '';
  $('ret-date').value = today();
  toast(fee > 0 ? `Book returned. Late fee: PHP ${fee}.` : 'Book returned! No late fee.', fee > 0 ? 'error' : 'success', fee > 0 ? 'fa-exclamation-triangle' : 'fa-check-circle');
}

function renderReturnHistory() {
  const tbody = $('tb-returns');
  if (!tbody) return;
  const rets  = DB.get('returns');
  if (!rets.length) { tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><i class="fas fa-history"></i><span>No returns yet.</span></div></td></tr>`; return; }
  tbody.innerHTML = rets.map(r => `
    <tr>
      <td><span class="tag">${r.sid}</span><br><small style="color:var(--g500)">${r.sname}</small></td>
      <td><span class="tag">${acqLabel(r)}</span><br>${r.title}</td><td>${r.due}</td><td>${r.ret}</td>
      <td>${r.fee > 0 ? `<span class="badge badge-red">&#8369;${r.fee}</span>` : '<span class="badge badge-green">&#8369;0</span>'}</td>
    </tr>`).join('');
}

/* ADMIN LOGIN */
function openAdminLogin() {
  if (sessionStorage.getItem('sti_admin') === 'yes') { enterAdmin(); return; }
  $('l-user').value = ''; $('l-pass').value = '';
  $('login-err').classList.add('hidden');
  openOverlay('modal-login');
  setTimeout(() => $('l-user').focus(), 200);
}

async function doLogin() {
  const user = $('l-user').value.trim();
  const pass = $('l-pass').value;
  if (!user || !pass) { showLoginErr('Enter username and password.'); return; }
  if (!confirm(`Log in as ${user}?`)) return;

  try {
    await apiJson('/api/login', {
      method: 'POST',
      body: JSON.stringify({ user, pass }),
    });
    closeOverlay('modal-login');
    sessionStorage.setItem('sti_admin', 'yes');
    sessionStorage.setItem('sti_admin_user', user);
    enterAdmin();
    toast(`Welcome, ${user}!`, 'success', 'fa-shield-alt');
  } catch (err) {
    showLoginErr(err.message || 'Incorrect username or password.');
    $('l-pass').value = '';
    const modal = document.querySelector('#modal-login .modal');
    modal.style.animation = 'none';
    modal.offsetHeight;
    modal.style.animation = 'shake .4s ease';
  }
}
function showLoginErr(msg) {
  $('login-err-msg').textContent = msg;
  $('login-err').classList.remove('hidden');
}

function toggleEye() {
  const inp = $('l-pass');
  const ic  = $('eye-btn').querySelector('i');
  inp.type  = inp.type === 'password' ? 'text' : 'password';
  ic.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

function enterAdmin() {
  document.body.classList.add('admin-mode');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  const shell = $('admin-shell');
  shell.classList.remove('hidden');
  shell.classList.add('visible');
  $('admin-uname').textContent = sessionStorage.getItem('sti_admin_user') || 'admin';
  showPanel('overview');
  window.scrollTo(0, 0);
}

function adminLogout() {
  if (!confirm('Log out of Admin Dashboard?')) return;
  sessionStorage.removeItem('sti_admin');
  sessionStorage.removeItem('sti_admin_user');
  document.body.classList.remove('admin-mode');
  const shell = $('admin-shell');
  shell.classList.remove('visible');
  shell.classList.add('hidden');
  showPage('home');
  toast('Logged out.', 'info', 'fa-sign-out-alt');
}

async function changePassword() {
  const cur = $('cp-cur').value;
  const nw  = $('cp-new').value;
  const con = $('cp-con').value;
  if (!cur || !nw || !con)    { toast('Fill in all password fields.', 'error', 'fa-exclamation-circle'); return; }
  if (nw.length < 6)          { toast('New password must be at least 6 characters.', 'error', 'fa-exclamation-circle'); return; }
  if (nw !== con)             { toast('New passwords do not match.', 'error', 'fa-times-circle'); return; }
  if (!confirm('Are you sure you want to change the admin password?')) return;

  try {
    await apiJson('/api/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: cur, newPassword: nw }),
    });
    ['cp-cur','cp-new','cp-con'].forEach(id => $(id).value = '');
    toast('Admin password updated.', 'success', 'fa-key');
  } catch (err) {
    toast(err.message || 'Password update failed.', 'error', 'fa-times-circle');
  }
}

/* ADMIN PANELS */
function showPanel(id) {
  document.querySelectorAll('.a-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.s-item').forEach(m => m.classList.remove('active'));
  $('apanel-' + id).classList.add('active');
  if ($('amenu-' + id))  $('amenu-' + id).classList.add('active');
  if (id === 'overview')       renderOverview();
  if (id === 'books')          renderAdminBooks();
  if (id === 'students')       renderAdminStudents();
  if (id === 'logbook-view')   renderAdminLog();
  if (id === 'borrow-history') renderAdminBorrows();
  if (id === 'closed-days')    renderClosedDays();
}

function renderOverview() {
  const books = DB.get('books');
  const log   = DB.get('log');
  const bors  = DB.get('borrows');
  const t     = today();
  const tv    = log.filter(l => l.date === t).length;
  const ab    = bors.filter(b => !b.ret).length;
  const ov    = bors.filter(b => !b.ret && isOverdue(b.due)).length;
  const tb    = books.reduce((s,b) => s + b.copies, 0);
  $('overview-stats').innerHTML = [
    { n:tb,  l:'Total Books',      i:'fa-book',                 bg:'var(--blue-bg)',  c:'var(--blue)'  },
    { n:tv,  l:"Today's Visitors", i:'fa-users',                bg:'var(--green-bg)', c:'var(--green)' },
    { n:ab,  l:'Active Borrows',   i:'fa-bookmark',             bg:'var(--amber-bg)', c:'var(--amber)' },
    { n:ov,  l:'Overdue',          i:'fa-exclamation-triangle', bg:'var(--red-bg)',   c:'var(--red)'   },
  ].map(s => `<div class="sc"><div class="sc-top"><div class="sc-ico" style="background:${s.bg};color:${s.c}"><i class="fas ${s.i}"></i></div></div><div class="sc-num" style="color:${s.c}">${s.n}</div><div class="sc-lbl">${s.l}</div></div>`).join('');
  const recent = [
    ...log.slice(0,3).map(l  => ({ t:'Visit',  b:'badge-blue',  s:l.name,   tm:l.tin })),
    ...bors.slice(0,3).map(b => ({ t:'Borrow', b:'badge-amber', s:b.sname,  tm:borrowStamp(b) })),
  ];
  $('tb-activity').innerHTML = recent.length
    ? recent.map(r => `<tr><td><span class="badge ${r.b}">${r.t}</span></td><td>${r.s}</td><td>${r.tm}</td></tr>`).join('')
    : `<tr><td colspan="3"><div class="empty"><i class="fas fa-inbox"></i><span>No recent activity.</span></div></td></tr>`;
}

function renderAdminBooks(filter = '') {
  const tbody = $('tb-books');
  const typeFilter = val('book-type-filter');
  let books   = DB.get('books');
  if (!filter) filter = val('book-search');
  if (typeFilter) {
    books = books.filter(b => (b.materialType || 'Book') === typeFilter);
  }
  if (filter) {
    const f = filter.toLowerCase();
    books = books.filter(b =>
      b.title.toLowerCase().includes(f) ||
      b.author.toLowerCase().includes(f) ||
      String(b.materialType || '').toLowerCase().includes(f) ||
      acqLabel(b).toLowerCase().includes(f) ||
      String(b.acquiredDate || '').toLowerCase().includes(f) ||
      String(b.pubYear || '').toLowerCase().includes(f)
    );
  }
  if (!books.length) { tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><i class="fas fa-book"></i><span>No books.</span></div></td></tr>`; return; }
  tbody.innerHTML = books.map(b => {
    const av = b.copies - (b.borrowed||0);
    return `<tr>
      <td><span class="tag">${acqLabel(b)}</span></td><td>${b.materialType || 'Book'}</td><td>${b.acquiredDate || '-'}</td><td>${b.author}</td><td><strong>${b.title}</strong></td><td>${b.pubYear || '-'}</td>
      <td>${av>0?'<span class="badge badge-green"><i class="fas fa-check"></i> Available</span>':'<span class="badge badge-red"><i class="fas fa-times"></i> Borrowed</span>'}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" style="height:28px;padding:0 10px;font-size:11px" onclick="openEditBook('${b.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-danger  btn-sm" style="height:28px;padding:0 10px;font-size:11px" onclick="deleteBook('${b.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}
function filterBooks(v = '') { renderAdminBooks(v); }

function openAddBook() {
  $('book-modal-title').textContent = 'Add New Book';
  $('edit-book-id').value = '';
  ['mb-acq','mb-acquired','mb-title','mb-author','mb-year'].forEach(id => $(id).value = '');
  $('mb-material').value = 'Book';
  $('mb-acquired').value = today();
  openOverlay('modal-book');
}
function openEditBook(id) {
  const b = DB.get('books').find(x => x.id === id); if (!b) return;
  if (!confirm(`Edit "${b.title}"?`)) return;
  $('book-modal-title').textContent = 'Edit Book';
  $('edit-book-id').value = id;
  $('mb-acq').value    = acqLabel(b);
  $('mb-acquired').value = b.acquiredDate || today();
  $('mb-material').value = b.materialType || 'Book';
  $('mb-title').value  = b.title;
  $('mb-author').value = b.author;
  $('mb-year').value   = b.pubYear || '';
  openOverlay('modal-book');
}
function saveBook() {
  const books = DB.get('books'), eid = val('edit-book-id');
  const acqNo = normalizeAcq(val('mb-acq')) || nextAcqNo(books);
  const acquiredDate = val('mb-acquired') || today();
  const materialType = val('mb-material') || 'Book';
  const title = val('mb-title') || 'Untitled Acquisition';
  const author = val('mb-author') || '-';
  const pubYear = val('mb-year');
  if (pubYear && !/^\d{4}$/.test(pubYear)) {
    toast('Published Year must be 4 digits.', 'error', 'fa-exclamation-circle');
    return;
  }
  if (books.find(b => normalizeAcq(b.acqNo) === acqNo && b.id !== eid)) {
    toast('Acquisition number already exists.', 'error', 'fa-exclamation-circle');
    return;
  }
  if (eid) {
    const b = books.find(x => x.id === eid);
    if (b) { b.acqNo = acqNo; b.acquiredDate = acquiredDate; b.materialType = materialType; b.author = author; b.title = title; b.pubYear = pubYear; b.copies = b.copies || 1; }
    toast('Book updated!', 'success', 'fa-save');
  } else {
    books.push({ id:'B'+Date.now(), acqNo, acquiredDate, materialType, author, title, pubYear, category:'General', copies:1, borrowed:0 });
    toast(`${acqNo} - "${title}" added!`, 'success', 'fa-plus');
  }
  DB.set('books', books); closeOverlay('modal-book'); renderAdminBooks(); updateStats();
}
function deleteBook(id) {
  const book = DB.get('books').find(b => b.id === id);
  if (!confirm(`Delete ${book ? `"${book.title}"` : 'this book'}?`)) return;
  DB.set('books', DB.get('books').filter(b => b.id !== id));
  renderAdminBooks(); updateStats(); toast('Book removed.', 'info', 'fa-trash');
}

function renderAdminStudents(filter = '') {
  const tbody = $('tb-students');
  let ss      = DB.get('students');
  if (filter) { const f = filter.toLowerCase(); ss = ss.filter(s => s.name.toLowerCase().includes(f) || s.sid.toLowerCase().includes(f)); }
  if (!ss.length) { tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><i class="fas fa-users"></i><span>No students yet.</span></div></td></tr>`; return; }
  tbody.innerHTML = ss.map(s => `<tr>
    <td><span class="tag">${s.sid}</span></td><td><strong>${s.name}</strong></td><td>${s.course||'-'}</td><td>${s.sec||'-'}</td>
    <td style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" style="height:28px;padding:0 10px;font-size:11px" onclick="openEditStudent('${s.id}')"><i class="fas fa-edit"></i></button>
      <button class="btn btn-danger  btn-sm" style="height:28px;padding:0 10px;font-size:11px" onclick="deleteStudent('${s.id}')"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join('');
}
function filterStudents(v) { renderAdminStudents(v); }

function openAddStudent() {
  $('student-modal-title').textContent = 'Add New Student';
  $('edit-student-id').value = '';
  ['ms-id','ms-name','ms-course','ms-section'].forEach(id => $(id).value = '');
  openOverlay('modal-student');
}
function openEditStudent(id) {
  const s = DB.get('students').find(x => x.id === id); if (!s) return;
  if (!confirm(`Edit ${s.name}?`)) return;
  $('student-modal-title').textContent = 'Edit Student';
  $('edit-student-id').value = id;
  $('ms-id').value      = s.sid;
  $('ms-name').value    = s.name;
  $('ms-course').value  = s.course;
  $('ms-section').value = s.sec||'';
  openOverlay('modal-student');
}
function saveStudent() {
  const sid = val('ms-id'), name = val('ms-name'), course = val('ms-course');
  if (!sid || !name || !course) { toast('Student ID, Name and Course required.', 'error', 'fa-exclamation-circle'); return; }
  const ss  = DB.get('students'), eid = val('edit-student-id');
  if (eid) {
    const s = ss.find(x => x.id === eid);
    if (s) { s.sid = sid; s.name = name; s.course = course; s.sec = val('ms-section'); }
    toast('Student updated!', 'success', 'fa-save');
  } else {
    if (ss.find(s => s.sid === sid)) { toast('Student ID already exists.', 'error', 'fa-exclamation-circle'); return; }
    ss.push({ id:'S'+Date.now(), sid, name, course, sec: val('ms-section') });
    toast(`${name} registered!`, 'success', 'fa-user-plus');
  }
  DB.set('students', ss); closeOverlay('modal-student'); renderAdminStudents();
}
function deleteStudent(id) {
  const student = DB.get('students').find(s => s.id === id);
  if (!confirm(`Remove ${student ? student.name : 'this student'}?`)) return;
  DB.set('students', DB.get('students').filter(s => s.id !== id));
  renderAdminStudents(); toast('Student removed.', 'info', 'fa-trash');
}

function renderAdminLog(filter = '') {
  const tbody = $('tb-log');
  let rows    = DB.get('log');
  if (filter) { const f = filter.toLowerCase(); rows = rows.filter(l => l.name.toLowerCase().includes(f) || l.sid.toLowerCase().includes(f)); }
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><i class="fas fa-clipboard"></i><span>No entries.</span></div></td></tr>`; return; }
  tbody.innerHTML = rows.map(l => `<tr>
    <td>${l.date}</td><td><span class="tag">${l.sid}</span></td><td>${l.name}</td>
    <td>${l.course||'-'} ${l.sec||''}</td><td>${l.tin}</td>
  </tr>`).join('');
}
function filterAdminLog(v) { renderAdminLog(v); }

function renderAdminBorrows(filter = '') {
  const tbody = $('tb-borrows');
  let rows    = DB.get('borrows');
  if (filter) { const f = filter.toLowerCase(); rows = rows.filter(b => b.sname.toLowerCase().includes(f) || b.title.toLowerCase().includes(f) || b.sid.toLowerCase().includes(f) || acqLabel(b).toLowerCase().includes(f)); }
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="10"><div class="empty"><i class="fas fa-exchange-alt"></i><span>No records.</span></div></td></tr>`; return; }
  tbody.innerHTML = rows.map(b => {
    const ov = !b.ret && isOverdue(b.due);
    return `<tr class="${ov?'overdue-row':''}">
      <td><span class="tag">${b.sid}</span></td><td>${b.sname}</td><td><span class="tag">${acqLabel(b)}</span></td><td>${b.title}</td><td>${b.author||'-'}</td>
      <td>${borrowStamp(b)}</td><td>${b.due}</td>
      <td>${b.ret||'<span style="color:var(--g400)">-</span>'}</td>
      <td>${b.fee>0?`<span class="badge badge-red">&#8369;${b.fee}</span>`:'<span class="badge badge-green">&#8369;0</span>'}</td>
      <td>${b.ret?'<span class="badge badge-gray"><i class="fas fa-check"></i> Returned</span>':ov?'<span class="badge badge-red"><i class="fas fa-exclamation-triangle"></i> Overdue</span>':'<span class="badge badge-green"><i class="fas fa-clock"></i> Active</span>'}</td>
    </tr>`;
  }).join('');
}
function filterBorrowHistory(v) { renderAdminBorrows(v); }

function renderClosedDays() {
  const tbody = $('tb-closed-days');
  if (!tbody) return;
  const rows = closedDays().slice().sort((a, b) => a.date.localeCompare(b.date));
  if ($('closed-date')) $('closed-date').value = today();
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty"><i class="fas fa-calendar-check"></i><span>No extra closed days. Weekends are already skipped.</span></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const d = parseDate(r.date);
    const day = d ? d.toLocaleDateString('en-PH', { weekday:'long' }) : '-';
    return `<tr>
      <td>${r.date}</td><td>${day}</td><td>${r.label || 'Closed day'}</td>
      <td><button class="btn btn-danger btn-sm" style="height:28px;padding:0 10px;font-size:11px" onclick="deleteClosedDay('${r.id}')"><i class="fas fa-trash"></i></button></td>
    </tr>`;
  }).join('');
}

function addClosedDay() {
  const date = val('closed-date');
  const label = val('closed-label') || 'Closed day';
  if (!date) { toast('Select a date to exclude.', 'error', 'fa-exclamation-circle'); return; }
  const rows = closedDays();
  if (rows.some(r => r.date === date)) { toast('That date is already listed.', 'error', 'fa-calendar-times'); return; }
  rows.push({ id:'CD' + Date.now(), date, label });
  DB.set('closed_days', rows);
  $('closed-label').value = '';
  renderClosedDays();
  renderBorrowBookList();
  updateStats();
  toast('Closed day added. Future due dates and late fees will skip it.', 'success', 'fa-calendar-plus');
}

function deleteClosedDay(id) {
  const day = closedDays().find(d => d.id === id);
  if (!confirm(`Delete ${day ? day.date : 'this closed day'}?`)) return;
  DB.set('closed_days', closedDays().filter(d => d.id !== id));
  renderClosedDays();
  renderBorrowBookList();
  updateStats();
  toast('Closed day removed.', 'info', 'fa-trash');
}

function genReport(type) {
  const t    = today();
  const log  = DB.get('log');
  const bors = DB.get('borrows');
  const books= DB.get('books');
  const out  = $('rpt-out');
  if (type === 'daily') {
    const tl = log.filter(l => l.date === t);
    out.innerHTML = `<div class="tbl-wrap"><div class="tbl-bar"><h3><i class="fas fa-calendar-day"></i> Daily Visitors - ${t}</h3><span class="badge badge-blue">${tl.length} visitors</span></div><div class="tbl-scroll"><table><thead><tr><th>ID</th><th>Name</th><th>Course</th><th>Time In</th></tr></thead><tbody>${tl.length?tl.map(l=>`<tr><td><span class="tag">${l.sid}</span></td><td>${l.name}</td><td>${l.course||'-'}</td><td>${l.tin}</td></tr>`).join(''):`<tr><td colspan="4"><div class="empty"><i class="fas fa-inbox"></i><span>No visitors today.</span></div></td></tr>`}</tbody></table></div></div>`;
  } else if (type === 'borrowed') {
    const ac = bors.filter(b => !b.ret);
    out.innerHTML = `<div class="tbl-wrap"><div class="tbl-bar"><h3><i class="fas fa-book"></i> Currently Borrowed</h3><span class="badge badge-amber">${ac.length} books</span></div><div class="tbl-scroll"><table><thead><tr><th>Student</th><th>Acq. No.</th><th>Book Title</th><th>Borrowed</th><th>Due</th><th>Status</th></tr></thead><tbody>${ac.length?ac.map(b=>{const ov=isOverdue(b.due);return`<tr class="${ov?'overdue-row':''}"><td>${b.sname}<br><span class="tag">${b.sid}</span></td><td><span class="tag">${acqLabel(b)}</span></td><td>${b.title}</td><td>${borrowStamp(b)}</td><td>${b.due}</td><td>${ov?'<span class="badge badge-red">Overdue</span>':'<span class="badge badge-green">Active</span>'}</td></tr>`}).join(''):`<tr><td colspan="6"><div class="empty"><i class="fas fa-book"></i><span>No active borrows.</span></div></td></tr>`}</tbody></table></div></div>`;
  } else if (type === 'overdue') {
    const ov = bors.filter(b => !b.ret && isOverdue(b.due));
    out.innerHTML = `<div class="tbl-wrap"><div class="tbl-bar"><h3><i class="fas fa-exclamation-triangle"></i> Overdue Books</h3><span class="badge badge-red">${ov.length} overdue</span></div><div class="tbl-scroll"><table><thead><tr><th>Student</th><th>Acq. No.</th><th>Book Title</th><th>Due Date</th><th>Days</th><th>Est. Fee</th></tr></thead><tbody>${ov.length?ov.map(b=>{const d=lateDays(b.due);return`<tr class="overdue-row"><td>${b.sname}<br><span class="tag">${b.sid}</span></td><td><span class="tag">${acqLabel(b)}</span></td><td>${b.title}</td><td>${b.due}</td><td><span class="badge badge-red">${d} counted days</span></td><td><span class="badge badge-red">&#8369;${lateFee(d)}</span></td></tr>`}).join(''):`<tr><td colspan="6"><div class="empty"><i class="fas fa-check-circle" style="color:var(--green)"></i><span style="color:var(--green)">No overdue books!</span></div></td></tr>`}</tbody></table></div></div>`;
  } else {
    const students = DB.get('students');
    out.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px">
      ${[{n:students.length,l:'Registered Students'},{n:log.length,l:'Total Visits'},{n:bors.length,l:'Total Borrows'},{n:bors.filter(b=>b.ret).length,l:'Returned'},{n:bors.filter(b=>!b.ret&&isOverdue(b.due)).length,l:'Overdue',c:'var(--red)'},{n:'&#8369;'+bors.reduce((s,b)=>s+(b.fee||0),0),l:'Fees Collected'}]
        .map(s=>`<div class="tbl-wrap" style="padding:16px;text-align:center"><div style="font-size:26px;font-weight:700;color:${s.c||'var(--blue)'};">${s.n}</div><div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--g500);margin-top:4px">${s.l}</div></div>`).join('')}
    </div><p style="font-size:12px;color:var(--g400);text-align:center">Generated on ${new Date().toLocaleString('en-PH')}</p>`;
  }
  toast('Report generated!', 'success', 'fa-file-alt');
}

/* OVERLAY / MODAL */
function openOverlay(id)  { $(id).classList.add('open'); }
function closeOverlay(id) { $(id).classList.remove('open'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('overlay')) closeOverlay(e.target.id);
});

/* ADD SHAKE STYLE */
const shakeCSS = document.createElement('style');
shakeCSS.textContent = '@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}';
document.head.appendChild(shakeCSS);

/* INIT */
async function initApp() {
  initTheme();
  try {
    await loadDatabase();
    ensureBookAcqNumbers();
    ensureBorrowAcqNumbers();
    updateStats();
    refreshDateBadge();
    setDefaultDates();
    startClock();

    if (sessionStorage.getItem('sti_admin') === 'yes') {
      setTimeout(enterAdmin, 100);
    }
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML('afterbegin', `<div style="background:#fef2f2;color:#991b1b;padding:12px 18px;border-bottom:1px solid #fecaca;font-family:Inter,sans-serif">Cannot connect to the backend. In VS Code terminal, run <b>npm start</b>, then open <b>http://localhost:3000</b>.</div>`);
  }
}

initApp();
