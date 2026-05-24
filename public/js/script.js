// ================================================================
//  STI College Naga Library System - script.js (clean rebuild)
// ================================================================

/* DATA STORE - now loaded from Express + SQLite */
const COLLECTION_NAMES = ['books', 'students', 'borrows', 'borrow_requests', 'return_requests', 'log', 'returns', 'closed_days'];
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
  const students = DB.get('students');
  const t     = today();
  if ($('stat-books')) $('stat-books').textContent = books.reduce((s,b) => s + Math.max(0, b.copies - (b.borrowed||0)), 0);
  if ($('stat-visits')) $('stat-visits').textContent = log.filter(l => l.date === t).length;
  if ($('stat-borrowed')) $('stat-borrowed').textContent = bors.filter(b => !b.ret).length;
  if ($('stat-students')) $('stat-students').textContent = students.length;
  updateRequestBadges();
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
  } else if (hasPendingRequestForAcq(book.acqNo)) {
    $('bor-title').value = book.title;
    $('bor-author').value = book.author;
    el.innerHTML = `<div class="avail-no"><i class="fas fa-clipboard-check"></i> ${book.acqNo} already has a pending borrowing request</div>`;
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

function pendingBorrowRequests() {
  return DB.get('borrow_requests').filter(r => (r.status || 'pending') === 'pending');
}

function updateBorrowRequestBadge() {
  const badge = $('borrow-req-count');
  if (!badge) return;
  const count = pendingBorrowRequests().length;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', count === 0);
  badge.title = `${count} pending borrow request${count === 1 ? '' : 's'}`;
}

function pendingReturnRequests() {
  return DB.get('return_requests').filter(r => (r.status || 'pending') === 'pending');
}

function updateReturnRequestBadge() {
  const badge = $('return-req-count');
  if (!badge) return;
  const count = pendingReturnRequests().length;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('hidden', count === 0);
  badge.title = `${count} pending return request${count === 1 ? '' : 's'}`;
}

function updateRequestBadges() {
  updateBorrowRequestBadge();
  updateReturnRequestBadge();
}

function hasPendingRequestForAcq(acqNo) {
  return pendingBorrowRequests().some(r => normalizeAcq(r.acqNo) === normalizeAcq(acqNo));
}

function hasPendingReturnRequestForBorrow(borrowId) {
  return pendingReturnRequests().some(r => r.borrowId === borrowId);
}

async function doBorrow() {
  const sid    = val('bor-sid');
  const acqNo  = normalizeAcq(val('bor-acq'));
  const due    = val('bor-return');
  const requestDate = today();
  const requestTime = nowTime();

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
  if (hasPendingRequestForAcq(acqNo)) {
    toast('That acquisition number already has a pending request for admin review.', 'error', 'fa-clipboard-check');
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

  if (!await appConfirm(`Student: ${student.name}\nMaterial: ${book.acqNo} - ${book.title}\nRequested due date: ${due}`, { title:'Submit Borrow Request', icon:'fa-paper-plane', highlight:'The librarian must approve this before it becomes an active borrow.' })) return;

  const reqs = DB.get('borrow_requests');
  reqs.unshift({
    id:'RQ'+Date.now(),
    sid: student.sid,
    sname: student.name,
    course: student.course || '',
    sec: student.sec || '',
    acqNo: book.acqNo,
    title: book.title,
    author: book.author,
    requestDate,
    requestTime,
    due,
    status:'pending',
    reviewedDate:'',
    reviewedTime:'',
    note:'',
  });
  DB.set('borrow_requests', reqs);

  ['bor-sid','bor-name','bor-acq','bor-title','bor-author'].forEach(id => $(id).value = '');
  $('bor-search').value  = '';
  $('avail-box').innerHTML = '';
  setDefaultDates();
  renderBorrowBookList();
  updateStats();
  toast(`Borrowing request sent for ${book.acqNo}. Please wait for librarian approval.`, 'success', 'fa-paper-plane');
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
    const pending = hasPendingRequestForAcq(b.acqNo);
    const unavailable = DB.get('borrows').some(x => normalizeAcq(x.acqNo) === normalizeAcq(b.acqNo) && !x.ret) || pending || (b.borrowed || 0) >= (b.copies || 1);
    return `<tr>
      <td><span class="tag">${acqLabel(b)}</span></td>
      <td>${b.materialType || 'Book'}</td>
      <td><strong>${b.title || 'Untitled Acquisition'}</strong></td>
      <td>${b.author || '-'}</td>
      <td>${pending?'<span class="badge badge-amber"><i class="fas fa-clipboard-check"></i> Pending</span>':unavailable?'<span class="badge badge-red"><i class="fas fa-times"></i> Borrowed</span>':'<span class="badge badge-green"><i class="fas fa-check"></i> Available</span>'}</td>
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
  const rows = DB.get('borrows').filter(b => b.sid === sid && !b.ret && !hasPendingReturnRequestForBorrow(b.id));
  sel.innerHTML = rows.length
    ? '<option value="">- Select book -</option>' + rows.map(b => `<option value="${b.id}">${acqLabel(b)} - ${b.title} (Due: ${b.due})</option>`).join('')
    : '<option value="">- No active borrows available for return request -</option>';
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

async function doReturn() {
  const bid = val('ret-book');
  const rd  = today();
  if ($('ret-date')) $('ret-date').value = rd;
  if (!bid || !rd) { toast('Fill in all fields.', 'error', 'fa-exclamation-circle'); return; }
  const bors = DB.get('borrows');
  const rec  = bors.find(b => b.id === bid);
  if (!rec) return;
  if (hasPendingReturnRequestForBorrow(bid)) {
    toast('This borrowed material already has a pending return request.', 'error', 'fa-undo-alt');
    return;
  }
  const days = lateDays(rec.due, rd);
  const fee  = lateFee(days);
  if (!await appConfirm(`Student: ${rec.sname}\nMaterial: ${acqLabel(rec)} - ${rec.title}\nEstimated late fee: PHP ${fee}`, { title:'Submit Return Request', icon:'fa-paper-plane', highlight:'The librarian must approve this before it becomes an official return.' })) return;

  const reqs = DB.get('return_requests');
  reqs.unshift({
    id:'RR'+Date.now(),
    borrowId: rec.id,
    sid: rec.sid,
    sname: rec.sname,
    acqNo: rec.acqNo,
    title: rec.title,
    author: rec.author,
    bdate: rec.bdate,
    btime: rec.btime,
    due: rec.due,
    requestDate: rd,
    requestTime: nowTime(),
    fee,
    status:'pending',
    reviewedDate:'',
    reviewedTime:'',
    note:'',
  });
  DB.set('return_requests', reqs);
  renderReturnHistory();
  renderBorrowBookList();
  updateStats();
  $('fee-box').innerHTML = '';
  $('ret-book').innerHTML = '<option>- Enter Student ID first -</option>';
  $('ret-sid').value  = '';
  $('ret-date').value = today();
  toast('Return request sent. Please wait for librarian approval.', 'success', 'fa-paper-plane');
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

async function adminLogout() {
  if (!await appConfirm('Log out of Admin Dashboard?', { title:'Log Out', icon:'fa-sign-out-alt' })) return;
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
  if (!await appConfirm('Are you sure you want to change the admin password?', { title:'Change Password', icon:'fa-key' })) return;

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
  if (id === 'borrow-requests') renderBorrowRequests();
  if (id === 'return-requests') renderReturnRequests();
  if (id === 'borrow-history') renderAdminBorrows();
  if (id === 'reports')        generateReport();
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
  const pr    = DB.get('borrow_requests').filter(r => (r.status || 'pending') === 'pending').length;
  const tb    = books.reduce((s,b) => s + b.copies, 0);
  $('overview-stats').innerHTML = [
    { n:tb,  l:'Total Books',      i:'fa-book',                 bg:'var(--blue-bg)',  c:'var(--blue)'  },
    { n:tv,  l:"Today's Visitors", i:'fa-users',                bg:'var(--green-bg)', c:'var(--green)' },
    { n:ab,  l:'Active Borrows',   i:'fa-bookmark',             bg:'var(--amber-bg)', c:'var(--amber)' },
    { n:pr,  l:'Pending Requests', i:'fa-clipboard-check',      bg:'var(--blue-bg)',  c:'var(--blue)'  },
    { n:ov,  l:'Overdue',          i:'fa-exclamation-triangle', bg:'var(--red-bg)',   c:'var(--red)'   },
  ].map(s => `<div class="sc"><div class="sc-top"><div class="sc-ico" style="background:${s.bg};color:${s.c}"><i class="fas ${s.i}"></i></div></div><div class="sc-num" style="color:${s.c}">${s.n}</div><div class="sc-lbl">${s.l}</div></div>`).join('');
  const recent = [
    ...log.slice(0,3).map(l  => ({ t:'Visit',  b:'badge-blue',  s:l.name,   tm:l.tin })),
    ...bors.slice(0,3).map(b => ({ t:'Borrow', b:'badge-amber', s:b.sname,  tm:borrowStamp(b) })),
  ];
  $('tb-activity').innerHTML = recent.length
    ? recent.map(r => `<tr><td><span class="badge ${r.b}">${r.t}</span></td><td>${r.s}</td><td>${r.tm}</td></tr>`).join('')
    : `<tr><td colspan="3"><div class="empty"><i class="fas fa-inbox"></i><span>No recent activity.</span></div></td></tr>`;
  renderOverviewAnalytics();
}

function lastDays(count) {
  const days = [];
  const d = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    days.push(dateKey(x));
  }
  return days;
}

function shortDateLabel(date) {
  const d = parseDate(date);
  return d ? d.toLocaleDateString('en-PH', { month:'short', day:'numeric' }) : date;
}

function chartCard(title, icon, body) {
  return `<div class="chart-card"><div class="chart-head"><i class="fas ${icon}"></i> ${title}</div>${body}</div>`;
}

function emptyChart(message) {
  return `<div class="chart-empty">${message}</div>`;
}

function renderBorrowFrequencyChart(days, rows) {
  const counts = days.map(day => ({ day, value: rows.filter(b => b.bdate === day).length }));
  const max = Math.max(1, ...counts.map(x => x.value));
  const w = 360, h = 190, pad = 28, gap = 9;
  const barW = (w - pad * 2 - gap * (counts.length - 1)) / counts.length;
  const bars = counts.map((x, i) => {
    const bh = Math.max(2, (h - 64) * x.value / max);
    const bx = pad + i * (barW + gap);
    const by = h - 34 - bh;
    return `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="4" fill="var(--blue)"></rect><text x="${bx + barW / 2}" y="${h - 16}" text-anchor="middle" class="chart-label">${shortDateLabel(x.day).replace(' ', '\n')}</text><text x="${bx + barW / 2}" y="${by - 5}" text-anchor="middle" class="chart-value">${x.value}</text>`;
  }).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Borrowing frequency bar chart"><line x1="${pad}" y1="${h - 34}" x2="${w - pad}" y2="${h - 34}" stroke="var(--g200)"></line>${bars}</svg>`;
}

function renderAttendanceTrendChart(days, rows) {
  const counts = days.map(day => ({ day, value: rows.filter(l => l.date === day).length }));
  const max = Math.max(1, ...counts.map(x => x.value));
  const w = 360, h = 190, padX = 30, top = 22, bottom = 38;
  const step = (w - padX * 2) / Math.max(1, counts.length - 1);
  const points = counts.map((x, i) => {
    const px = padX + i * step;
    const py = h - bottom - ((h - top - bottom) * x.value / max);
    return { ...x, px, py };
  });
  const line = points.map(p => `${p.px},${p.py}`).join(' ');
  const dots = points.map(p => `<circle cx="${p.px}" cy="${p.py}" r="4" fill="var(--green)"></circle><text x="${p.px}" y="${p.py - 8}" text-anchor="middle" class="chart-value">${p.value}</text><text x="${p.px}" y="${h - 16}" text-anchor="middle" class="chart-label">${shortDateLabel(p.day)}</text>`).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Attendance trend line graph"><line x1="${padX}" y1="${h - bottom}" x2="${w - padX}" y2="${h - bottom}" stroke="var(--g200)"></line><polyline points="${line}" fill="none" stroke="var(--green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>${dots}</svg>`;
}

function renderPopularBooksChart(rows) {
  const colors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed'];
  const counts = rows.reduce((acc, b) => {
    const key = b.title || 'Untitled';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const data = Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  const total = data.reduce((s, x) => s + x.value, 0);
  if (!total) return emptyChart('No borrowing data yet.');
  let offset = 0;
  const radius = 48;
  const circ = 2 * Math.PI * radius;
  const slices = data.map((x, i) => {
    const len = circ * x.value / total;
    const el = `<circle cx="72" cy="72" r="${radius}" fill="none" stroke="${colors[i]}" stroke-width="28" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 72 72)"></circle>`;
    offset += len;
    return el;
  }).join('');
  const legend = data.map((x, i) => `<div class="pie-item"><span class="pie-dot" style="background:${colors[i]}"></span><span class="pie-name">${x.name}</span><strong>${x.value}</strong></div>`).join('');
  return `<div class="pie-wrap"><svg viewBox="0 0 144 144" class="chart-svg" style="height:145px" role="img" aria-label="Popular books pie chart">${slices}<circle cx="72" cy="72" r="31" fill="var(--surface)"></circle><text x="72" y="69" text-anchor="middle" class="chart-value">${total}</text><text x="72" y="83" text-anchor="middle" class="chart-label">borrows</text></svg><div class="pie-legend">${legend}</div></div>`;
}

function renderOverviewAnalytics() {
  const wrap = $('overview-analytics');
  if (!wrap) return;
  const days = lastDays(7);
  const bors = DB.get('borrows');
  const log = DB.get('log');
  wrap.innerHTML = [
    chartCard('Borrowing Frequency', 'fa-chart-column', renderBorrowFrequencyChart(days, bors)),
    chartCard('Attendance Trends', 'fa-chart-line', renderAttendanceTrendChart(days, log)),
    chartCard('Popular Books', 'fa-chart-pie', renderPopularBooksChart(bors)),
  ].join('');
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
async function openEditBook(id) {
  const b = DB.get('books').find(x => x.id === id); if (!b) return;
  if (!await appConfirm(`Edit "${b.title}"?`, { title:'Edit Acquisition', icon:'fa-edit' })) return;
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
async function deleteBook(id) {
  const book = DB.get('books').find(b => b.id === id);
  if (!await appConfirm(`Delete ${book ? `"${book.title}"` : 'this book'}?`, { title:'Delete Acquisition', icon:'fa-trash', okText:'Delete', okClass:'btn-danger' })) return;
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
async function openEditStudent(id) {
  const s = DB.get('students').find(x => x.id === id); if (!s) return;
  if (!await appConfirm(`Edit ${s.name}?`, { title:'Edit Student', icon:'fa-edit' })) return;
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
async function deleteStudent(id) {
  const student = DB.get('students').find(s => s.id === id);
  if (!await appConfirm(`Remove ${student ? student.name : 'this student'}?`, { title:'Remove Student', icon:'fa-user-times', okText:'Remove', okClass:'btn-danger' })) return;
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

function requestStatusBadge(status) {
  const s = status || 'pending';
  if (s === 'approved') return '<span class="badge badge-green"><i class="fas fa-check"></i> Approved</span>';
  if (s === 'rejected') return '<span class="badge badge-red"><i class="fas fa-times"></i> Rejected</span>';
  return '<span class="badge badge-amber"><i class="fas fa-clock"></i> Pending</span>';
}

function renderBorrowRequests(filter = '') {
  const tbody = $('tb-borrow-requests');
  if (!tbody) return;
  let rows = DB.get('borrow_requests').slice().sort((a, b) => {
    const rank = r => (r.status || 'pending') === 'pending' ? 0 : 1;
    return rank(a) - rank(b) || `${b.requestDate} ${b.requestTime}`.localeCompare(`${a.requestDate} ${a.requestTime}`);
  });
  if (filter) {
    const f = filter.toLowerCase();
    rows = rows.filter(r =>
      String(r.sid || '').toLowerCase().includes(f) ||
      String(r.sname || '').toLowerCase().includes(f) ||
      String(r.title || '').toLowerCase().includes(f) ||
      acqLabel(r).toLowerCase().includes(f)
    );
  }
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><i class="fas fa-clipboard-check"></i><span>No borrowing requests.</span></div></td></tr>`;
    updateBorrowRequestBadge();
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const pending = (r.status || 'pending') === 'pending';
    return `<tr>
      <td>${r.requestDate || '-'}<br><small style="color:var(--g500)">${r.requestTime || ''}</small></td>
      <td><span class="tag">${r.sid}</span><br>${r.sname}<br><small style="color:var(--g500)">${r.course || '-'} ${r.sec || ''}</small></td>
      <td><span class="tag">${acqLabel(r)}</span></td>
      <td>${r.title}<br><small style="color:var(--g500)">${r.author || '-'}</small></td>
      <td>${r.due || '-'}</td>
      <td>${requestStatusBadge(r.status)}${r.note ? `<br><small style="color:var(--g500)">${r.note}</small>` : ''}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${pending ? `<button class="btn btn-outline btn-icon" onclick="openEditBorrowRequest('${r.id}')" title="Edit" aria-label="Edit"><i class="fas fa-edit"></i></button><button class="btn btn-success btn-icon" onclick="approveBorrowRequest('${r.id}')" title="Confirm" aria-label="Confirm"><i class="fas fa-check"></i></button><button class="btn btn-danger btn-icon" onclick="rejectBorrowRequest('${r.id}')" title="Reject" aria-label="Reject"><i class="fas fa-times"></i></button>` : '<span style="color:var(--g400);font-size:12px">Reviewed</span>'}
      </td>
    </tr>`;
  }).join('');
  updateBorrowRequestBadge();
}
function filterBorrowRequests(v) { renderBorrowRequests(v); }

function openEditBorrowRequest(id) {
  const req = DB.get('borrow_requests').find(r => r.id === id);
  if (!req || (req.status || 'pending') !== 'pending') return;
  $('edit-request-id').value = req.id;
  $('rq-sid').value = req.sid || '';
  $('rq-name').value = req.sname || '';
  $('rq-acq').value = acqLabel(req);
  $('rq-due').value = req.due || today();
  $('rq-title').value = req.title || '';
  $('rq-author').value = req.author || '';
  $('rq-note').value = req.note || '';
  $('rq-book-status').innerHTML = '';
  openOverlay('modal-borrow-request');
}

function checkEditRequestBook(acq) {
  const status = $('rq-book-status');
  if (!status) return null;
  $('rq-title').value = '';
  $('rq-author').value = '';
  if (!acq.trim()) {
    status.innerHTML = '';
    return null;
  }
  const book = findBookByAcq(acq);
  if (!book) {
    status.innerHTML = `<div class="avail-unk"><i class="fas fa-search"></i> No material found with acquisition number ${acq}</div>`;
    return null;
  }
  $('rq-title').value = book.title || '';
  $('rq-author').value = book.author || '';
  const currentId = val('edit-request-id');
  const borrowed = DB.get('borrows').some(b => normalizeAcq(b.acqNo) === normalizeAcq(book.acqNo) && !b.ret);
  const pendingOther = pendingBorrowRequests().some(r => r.id !== currentId && normalizeAcq(r.acqNo) === normalizeAcq(book.acqNo));
  if (borrowed) {
    status.innerHTML = `<div class="avail-no"><i class="fas fa-times-circle"></i> ${book.acqNo} is currently borrowed</div>`;
  } else if (pendingOther) {
    status.innerHTML = `<div class="avail-no"><i class="fas fa-clipboard-check"></i> ${book.acqNo} already has another pending request</div>`;
  } else {
    status.innerHTML = `<div class="avail-yes"><i class="fas fa-check-circle"></i> ${book.acqNo} is available for this request</div>`;
  }
  return { book, borrowed, pendingOther };
}

function saveBorrowRequestEdit() {
  const id = val('edit-request-id');
  const acqNo = normalizeAcq(val('rq-acq'));
  const due = val('rq-due');
  if (!id || !acqNo || !due) {
    toast('Fill in acquisition number and due date.', 'error', 'fa-exclamation-circle');
    return;
  }
  const reqs = DB.get('borrow_requests');
  const req = reqs.find(r => r.id === id);
  if (!req || (req.status || 'pending') !== 'pending') return;
  const check = checkEditRequestBook(acqNo);
  if (!check?.book) {
    toast('No material found with that acquisition number.', 'error', 'fa-search');
    return;
  }
  if (check.borrowed || check.pendingOther) {
    toast('This material is not available for this request.', 'error', 'fa-exclamation-circle');
    return;
  }
  req.acqNo = check.book.acqNo;
  req.title = check.book.title || '';
  req.author = check.book.author || '';
  req.due = due;
  req.note = val('rq-note');
  DB.set('borrow_requests', reqs);
  closeOverlay('modal-borrow-request');
  renderBorrowRequests();
  renderBorrowBookList();
  updateStats();
  toast('Borrow request updated.', 'success', 'fa-save');
}

async function approveBorrowRequest(id) {
  const reqs = DB.get('borrow_requests');
  const req = reqs.find(r => r.id === id);
  if (!req || (req.status || 'pending') !== 'pending') return;

  const books = DB.get('books');
  const book = books.find(b => normalizeAcq(b.acqNo) === normalizeAcq(req.acqNo));
  if (!book) {
    toast('Cannot approve: acquisition number no longer exists.', 'error', 'fa-search');
    return;
  }

  const bors = DB.get('borrows');
  if (bors.some(b => normalizeAcq(b.acqNo) === normalizeAcq(req.acqNo) && !b.ret)) {
    toast('Cannot approve: this acquisition number is already borrowed.', 'error', 'fa-exclamation-circle');
    return;
  }
  if (bors.some(b => b.sid === req.sid && normalizeAcq(b.acqNo) === normalizeAcq(req.acqNo) && !b.ret)) {
    toast('Cannot approve: this student already has this material.', 'error', 'fa-exclamation-circle');
    return;
  }
  if ((book.borrowed || 0) >= (book.copies || 1)) {
    toast('Cannot approve: all copies are already borrowed.', 'error', 'fa-times-circle');
    return;
  }
  if (!await appConfirm(`Approve borrowing request?\n\nStudent: ${req.sname}\nMaterial: ${acqLabel(req)} - ${req.title}\nDue date: ${req.due}`, { title:'Approve Borrow Request', icon:'fa-check-circle', okText:'Approve', okClass:'btn-success' })) return;

  const reviewedDate = today();
  const reviewedTime = nowTime();
  bors.unshift({ id:'BR'+Date.now(), sid:req.sid, sname:req.sname, acqNo:req.acqNo, title:req.title, author:req.author, bdate:reviewedDate, btime:reviewedTime, due:req.due, ret:null, fee:0 });
  req.status = 'approved';
  req.reviewedDate = reviewedDate;
  req.reviewedTime = reviewedTime;
  req.note = 'Approved by librarian';
  book.borrowed = (book.borrowed || 0) + 1;

  DB.set('borrows', bors);
  DB.set('borrow_requests', reqs);
  DB.set('books', books);
  renderBorrowRequests();
  renderAdminBorrows();
  renderBorrowBookList();
  updateStats();
  toast('Borrowing request approved.', 'success', 'fa-check-circle');
}

async function rejectBorrowRequest(id) {
  const reqs = DB.get('borrow_requests');
  const req = reqs.find(r => r.id === id);
  if (!req || (req.status || 'pending') !== 'pending') return;
  const reason = await appPrompt(`Reason for rejecting ${req.sname}'s request?`, 'Request rejected by librarian', { title:'Reject Borrow Request', icon:'fa-times-circle', okText:'Reject', okClass:'btn-danger' });
  if (reason === null) return;
  req.status = 'rejected';
  req.reviewedDate = today();
  req.reviewedTime = nowTime();
  req.note = reason.trim() || 'Request rejected by librarian';
  DB.set('borrow_requests', reqs);
  renderBorrowRequests();
  renderBorrowBookList();
  updateStats();
  toast('Borrowing request rejected.', 'info', 'fa-times-circle');
}

function renderReturnRequests(filter = '') {
  const tbody = $('tb-return-requests');
  if (!tbody) return;
  let rows = DB.get('return_requests').slice().sort((a, b) => {
    const rank = r => (r.status || 'pending') === 'pending' ? 0 : 1;
    return rank(a) - rank(b) || `${b.requestDate} ${b.requestTime}`.localeCompare(`${a.requestDate} ${a.requestTime}`);
  });
  if (filter) {
    const f = filter.toLowerCase();
    rows = rows.filter(r =>
      String(r.sid || '').toLowerCase().includes(f) ||
      String(r.sname || '').toLowerCase().includes(f) ||
      String(r.title || '').toLowerCase().includes(f) ||
      acqLabel(r).toLowerCase().includes(f)
    );
  }
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><i class="fas fa-undo-alt"></i><span>No return requests.</span></div></td></tr>`;
    updateRequestBadges();
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const pending = (r.status || 'pending') === 'pending';
    return `<tr>
      <td>${r.requestDate || '-'}<br><small style="color:var(--g500)">${r.requestTime || ''}</small></td>
      <td><span class="tag">${r.sid}</span><br>${r.sname}</td>
      <td><span class="tag">${acqLabel(r)}</span></td>
      <td>${r.title}<br><small style="color:var(--g500)">${r.author || '-'}</small></td>
      <td>${r.due || '-'}</td>
      <td>${Number(r.fee || 0) > 0 ? `<span class="badge badge-red">&#8369;${r.fee}</span>` : '<span class="badge badge-green">&#8369;0</span>'}</td>
      <td>${requestStatusBadge(r.status)}${r.note ? `<br><small style="color:var(--g500)">${r.note}</small>` : ''}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${pending ? `<button class="btn btn-success btn-icon" onclick="approveReturnRequest('${r.id}')" title="Confirm" aria-label="Confirm"><i class="fas fa-check"></i></button><button class="btn btn-danger btn-icon" onclick="rejectReturnRequest('${r.id}')" title="Reject" aria-label="Reject"><i class="fas fa-times"></i></button>` : '<span style="color:var(--g400);font-size:12px">Reviewed</span>'}
      </td>
    </tr>`;
  }).join('');
  updateRequestBadges();
}
function filterReturnRequests(v) { renderReturnRequests(v); }

async function approveReturnRequest(id) {
  const reqs = DB.get('return_requests');
  const req = reqs.find(r => r.id === id);
  if (!req || (req.status || 'pending') !== 'pending') return;
  const bors = DB.get('borrows');
  const rec = bors.find(b => b.id === req.borrowId && !b.ret);
  if (!rec) {
    toast('Cannot approve: active borrow record was not found.', 'error', 'fa-search');
    return;
  }
  const reviewedDate = today();
  const reviewedTime = nowTime();
  const days = lateDays(rec.due, reviewedDate);
  const fee = lateFee(days);
  if (!await appConfirm(`Approve return request?\n\nStudent: ${req.sname}\nMaterial: ${acqLabel(req)} - ${req.title}\nLate fee: PHP ${fee}`, { title:'Approve Return Request', icon:'fa-check-circle', okText:'Approve', okClass:'btn-success' })) return;

  rec.ret = reviewedDate;
  rec.fee = fee;
  req.status = 'approved';
  req.reviewedDate = reviewedDate;
  req.reviewedTime = reviewedTime;
  req.fee = fee;
  req.note = 'Approved by librarian';

  const books = DB.get('books');
  const book = books.find(b => normalizeAcq(b.acqNo) === normalizeAcq(rec.acqNo)) || books.find(b => b.title.toLowerCase() === rec.title.toLowerCase());
  if (book && book.borrowed > 0) book.borrowed--;
  const rets = DB.get('returns');
  rets.unshift({ ...rec });

  DB.set('borrows', bors);
  DB.set('return_requests', reqs);
  DB.set('books', books);
  DB.set('returns', rets);
  renderReturnRequests();
  renderAdminBorrows();
  renderReturnHistory();
  renderBorrowBookList();
  updateStats();
  toast(fee > 0 ? `Return approved. Late fee: PHP ${fee}.` : 'Return approved. No late fee.', fee > 0 ? 'error' : 'success', fee > 0 ? 'fa-exclamation-triangle' : 'fa-check-circle');
}

async function rejectReturnRequest(id) {
  const reqs = DB.get('return_requests');
  const req = reqs.find(r => r.id === id);
  if (!req || (req.status || 'pending') !== 'pending') return;
  const reason = await appPrompt(`Reason for rejecting ${req.sname}'s return request?`, 'Return request rejected by librarian', { title:'Reject Return Request', icon:'fa-times-circle', okText:'Reject', okClass:'btn-danger' });
  if (reason === null) return;
  req.status = 'rejected';
  req.reviewedDate = today();
  req.reviewedTime = nowTime();
  req.note = reason.trim() || 'Return request rejected by librarian';
  DB.set('return_requests', reqs);
  renderReturnRequests();
  updateStats();
  toast('Return request rejected.', 'info', 'fa-times-circle');
}

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

async function deleteClosedDay(id) {
  const day = closedDays().find(d => d.id === id);
  if (!await appConfirm(`Delete ${day ? day.date : 'this closed day'}?`, { title:'Delete Closed Day', icon:'fa-calendar-times', okText:'Delete', okClass:'btn-danger' })) return;
  DB.set('closed_days', closedDays().filter(d => d.id !== id));
  renderClosedDays();
  renderBorrowBookList();
  updateStats();
  toast('Closed day removed.', 'info', 'fa-trash');
}

let currentReport = null;

function reportCell(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function reportMoney(value) {
  return `PHP ${Number(value || 0).toFixed(2)}`;
}

function inDateRange(date, from, to) {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function reportRangeText(from, to) {
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return 'All dates';
}

function reportStatus(b) {
  if (b.ret) return 'Returned';
  return isOverdue(b.due) ? 'Overdue' : 'Active';
}

function buildReport(type, from = '', to = '') {
  const bors = DB.get('borrows');
  const logs = DB.get('log');
  const returns = DB.get('returns').length ? DB.get('returns') : bors.filter(b => b.ret);
  const base = { type, from, to, range: reportRangeText(from, to), generated: new Date().toLocaleString('en-PH') };

  if (type === 'attendance') {
    const rows = logs.filter(l => inDateRange(l.date, from, to)).sort((a, b) => `${b.date} ${b.tin}`.localeCompare(`${a.date} ${a.tin}`));
    return {
      ...base,
      title: 'Attendance Logs',
      icon: 'fa-user-check',
      filename: `attendance-logs-${today()}.xls`,
      stats: [{ label:'Attendance Records', value:rows.length }, { label:'Unique Students', value:new Set(rows.map(r => r.sid)).size }],
      columns: [
        { label:'Date', value:r => r.date },
        { label:'Student ID', value:r => r.sid },
        { label:'Name', value:r => r.name },
        { label:'Course/Sec', value:r => `${r.course || '-'} ${r.sec || ''}`.trim() },
        { label:'Time In', value:r => r.tin },
      ],
      rows,
    };
  }

  if (type === 'overdue') {
    const rows = bors.filter(b => !b.ret && isOverdue(b.due) && inDateRange(b.due, from, to)).sort((a, b) => a.due.localeCompare(b.due));
    return {
      ...base,
      title: 'Overdue Items',
      icon: 'fa-exclamation-triangle',
      filename: `overdue-items-${today()}.xls`,
      stats: [{ label:'Overdue Items', value:rows.length }, { label:'Estimated Fines', value:reportMoney(rows.reduce((s, r) => s + lateFee(lateDays(r.due)), 0)) }],
      columns: [
        { label:'Student ID', value:r => r.sid },
        { label:'Student Name', value:r => r.sname },
        { label:'Acq. No.', value:r => acqLabel(r) },
        { label:'Book Title', value:r => r.title },
        { label:'Borrowed', value:r => borrowStamp(r) },
        { label:'Due Date', value:r => r.due },
        { label:'Counted Days Late', value:r => lateDays(r.due) },
        { label:'Estimated Fine', value:r => reportMoney(lateFee(lateDays(r.due))) },
      ],
      rows,
    };
  }

  if (type === 'fines') {
    const rows = returns.filter(r => Number(r.fee || 0) > 0 && inDateRange(r.ret, from, to)).sort((a, b) => String(b.ret || '').localeCompare(String(a.ret || '')));
    return {
      ...base,
      title: 'Fine Collections',
      icon: 'fa-coins',
      filename: `fine-collections-${today()}.xls`,
      stats: [{ label:'Paid Fine Records', value:rows.length }, { label:'Total Fines Collected', value:reportMoney(rows.reduce((s, r) => s + Number(r.fee || 0), 0)) }],
      columns: [
        { label:'Return Date', value:r => r.ret },
        { label:'Student ID', value:r => r.sid },
        { label:'Student Name', value:r => r.sname },
        { label:'Acq. No.', value:r => acqLabel(r) },
        { label:'Book Title', value:r => r.title },
        { label:'Due Date', value:r => r.due },
        { label:'Fine Collected', value:r => reportMoney(r.fee) },
      ],
      rows,
    };
  }

  const rows = bors.filter(b => inDateRange(b.bdate, from, to)).sort((a, b) => `${b.bdate} ${b.btime}`.localeCompare(`${a.bdate} ${a.btime}`));
  return {
    ...base,
    title: 'Borrowing History',
    icon: 'fa-exchange-alt',
    filename: `borrowing-history-${today()}.xls`,
    stats: [{ label:'Borrow Records', value:rows.length }, { label:'Returned', value:rows.filter(r => r.ret).length }, { label:'Active', value:rows.filter(r => !r.ret).length }],
    columns: [
      { label:'Student ID', value:r => r.sid },
      { label:'Student Name', value:r => r.sname },
      { label:'Acq. No.', value:r => acqLabel(r) },
      { label:'Book Title', value:r => r.title },
      { label:'Author', value:r => r.author || '-' },
      { label:'Borrowed', value:r => borrowStamp(r) },
      { label:'Due Date', value:r => r.due },
      { label:'Returned', value:r => r.ret || '-' },
      { label:'Fine', value:r => reportMoney(r.fee) },
      { label:'Status', value:reportStatus },
    ],
    rows,
  };
}

function reportTableHtml(report, forPrint = false) {
  const empty = `<tr><td colspan="${report.columns.length}"><div class="empty"><i class="fas fa-inbox"></i><span>No records found for this date range.</span></div></td></tr>`;
  const rows = report.rows.length
    ? report.rows.map(row => `<tr>${report.columns.map(col => `<td>${reportCell(col.value(row))}</td>`).join('')}</tr>`).join('')
    : empty;
  const summary = report.stats.map(s => `<div class="report-stat"><strong>${reportCell(s.value)}</strong><span>${reportCell(s.label)}</span></div>`).join('');
  const actions = forPrint ? '' : `<div class="report-actions"><button class="btn btn-outline btn-sm" onclick="printCurrentReport()"><i class="fas fa-print"></i> Print</button><button class="btn btn-success btn-sm" onclick="exportCurrentReport()"><i class="fas fa-file-excel"></i> Export</button></div>`;
  return `<div id="printable-report"><div class="report-summary">${summary}</div><div class="tbl-wrap"><div class="tbl-bar"><h3><i class="fas ${report.icon}"></i> ${reportCell(report.title)} <small style="font-weight:600;color:var(--g500)">(${reportCell(report.range)})</small></h3>${actions}<span class="badge badge-blue">${report.rows.length} records</span></div><div class="tbl-scroll"><table><thead><tr>${report.columns.map(col => `<th>${reportCell(col.label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div><p style="font-size:12px;color:var(--g400);text-align:center;margin-top:12px">Generated on ${reportCell(report.generated)}</p></div>`;
}

function downloadExcelReport(report) {
  if (!report.rows.length) {
    toast('No records to export.', 'error', 'fa-file-excel');
    return;
  }
  const table = `<table><thead><tr>${report.columns.map(c => `<th>${reportCell(c.label)}</th>`).join('')}</tr></thead><tbody>${report.rows.map(row => `<tr>${report.columns.map(c => `<td>${reportCell(c.value(row))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:6px}th{background:#e8f1ff;font-weight:bold}</style></head><body><h2>${reportCell(report.title)}</h2><p>Date Range: ${reportCell(report.range)}</p><p>Generated: ${reportCell(report.generated)}</p>${table}</body></html>`;
  const blob = new Blob([html], { type:'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = report.filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
  toast('Report exported to Excel.', 'success', 'fa-file-excel');
}

function generateReport(type = val('report-type') || 'borrowing') {
  const from = val('report-from');
  const to = val('report-to');
  if (from && to && from > to) {
    toast('The start date must be before the end date.', 'error', 'fa-calendar-times');
    return;
  }
  if ($('report-type')) $('report-type').value = type;
  currentReport = buildReport(type, from, to);
  $('rpt-out').innerHTML = reportTableHtml(currentReport);
  toast('Report generated!', 'success', 'fa-file-alt');
}

function exportCurrentReport() {
  if (!currentReport) generateReport();
  if (currentReport) downloadExcelReport(currentReport);
}

function printCurrentReport() {
  if (!currentReport) generateReport();
  if (!currentReport) return;
  const printWindow = window.open('', '_blank', 'width=1100,height=700');
  if (!printWindow) {
    toast('Allow popups to print this report.', 'error', 'fa-print');
    return;
  }
  printWindow.document.write(`<!doctype html><html><head><title>${reportCell(currentReport.title)}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:24px}h1{font-size:22px;margin:0 0 4px}p{font-size:12px;color:#555}.report-summary{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.report-stat{border:1px solid #ccc;padding:10px;min-width:120px}.report-stat strong{display:block;font-size:20px}.report-stat span{font-size:10px;text-transform:uppercase;color:#555}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#eee}.tbl-bar{display:block}.badge,.report-actions,.empty i{display:none}</style></head><body><h1>${reportCell(currentReport.title)}</h1><p>Date Range: ${reportCell(currentReport.range)} | Generated: ${reportCell(currentReport.generated)}</p>${reportTableHtml(currentReport, true)}<script>window.onload=function(){window.print();window.close();}<\/script></body></html>`);
  printWindow.document.close();
}

function attendanceReportRows() {
  return buildReport('attendance').rows;
}

function exportAttendanceExcel() {
  downloadExcelReport(buildReport('attendance'));
}

function genReport(type) {
  const map = { daily:'attendance', borrowed:'borrowing', all:'borrowing' };
  generateReport(map[type] || type || 'borrowing');
}

function appConfirm(message, options = {}) {
  return new Promise(resolve => {
    const modal = $('modal-confirm');
    const ok = $('confirm-ok');
    const cancel = $('confirm-cancel');
    const inputWrap = $('confirm-input-wrap');
    const input = $('confirm-input');
    const highlight = $('confirm-highlight');
    $('confirm-title').textContent = options.title || 'Confirm Action';
    $('confirm-message').textContent = message;
    highlight.textContent = options.highlight || '';
    highlight.classList.toggle('hidden', !options.highlight);
    $('confirm-icon').innerHTML = `<i class="fas ${options.icon || 'fa-question'}"></i>`;
    ok.textContent = options.okText || 'Confirm';
    ok.className = `btn ${options.okClass || 'btn-primary'} btn-sm`;
    cancel.textContent = options.cancelText || 'Cancel';
    inputWrap.classList.add('hidden');
    input.value = '';

    const done = value => {
      ok.onclick = null;
      cancel.onclick = null;
      modal.onclick = null;
      closeOverlay('modal-confirm');
      resolve(value);
    };

    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    modal.onclick = e => { if (e.target === modal) done(false); };
    openOverlay('modal-confirm');
  });
}

function appPrompt(message, defaultValue = '', options = {}) {
  return new Promise(resolve => {
    const modal = $('modal-confirm');
    const ok = $('confirm-ok');
    const cancel = $('confirm-cancel');
    const inputWrap = $('confirm-input-wrap');
    const input = $('confirm-input');
    const highlight = $('confirm-highlight');
    $('confirm-title').textContent = options.title || 'Add Note';
    $('confirm-message').textContent = message;
    highlight.textContent = options.highlight || '';
    highlight.classList.toggle('hidden', !options.highlight);
    $('confirm-icon').innerHTML = `<i class="fas ${options.icon || 'fa-pen'}"></i>`;
    ok.textContent = options.okText || 'Save';
    ok.className = `btn ${options.okClass || 'btn-primary'} btn-sm`;
    cancel.textContent = options.cancelText || 'Cancel';
    inputWrap.classList.remove('hidden');
    input.value = defaultValue;

    const done = value => {
      ok.onclick = null;
      cancel.onclick = null;
      modal.onclick = null;
      input.onkeydown = null;
      closeOverlay('modal-confirm');
      resolve(value);
    };

    ok.onclick = () => done(input.value);
    cancel.onclick = () => done(null);
    modal.onclick = e => { if (e.target === modal) done(null); };
    input.onkeydown = e => {
      if (e.key === 'Enter') done(input.value);
      if (e.key === 'Escape') done(null);
    };
    openOverlay('modal-confirm');
    setTimeout(() => input.focus(), 80);
  });
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
