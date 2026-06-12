import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ── Firebase ──
const firebaseConfig = {
  apiKey: "AIzaSyD0rZNSzXjJKVWAx5NyllTlGSh2Sp51ymQ",
  authDomain: "calendario-2026-e87a4.firebaseapp.com",
  databaseURL: "https://calendario-2026-e87a4-default-rtdb.firebaseio.com",
  projectId: "calendario-2026-e87a4",
  storageBucket: "calendario-2026-e87a4.firebasestorage.app",
  messagingSenderId: "797560696833",
  appId: "1:797560696833:web:7d8fafc93962b44cc1d000",
  measurementId: "G-HH72LTL61S"
};
const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);
const auth        = getAuth(firebaseApp);
const provider    = new GoogleAuthProvider();

// ── Constants ──
const START = new Date(2026, 5, 11);
const END   = new Date(2026, 7, 10);
const TODAY = new Date();
TODAY.setHours(0,0,0,0);

const DAY_NAMES   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DAY_SHORT   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── State ──
let dbEvents         = [];
let currentUid       = null;
let unsubSnapshot    = null;
let currentView      = 'month';
let currentWeekStart = getWeekStart(TODAY);
let draggedEvent     = null;

// ── Eventos fijos del Mundial 2026 ──
// Clave de fecha: YYYY-M-D (mes en base 0)
const FIXED_EVENTS = [
  { id: 'f1', date: '2026-5-17', text: '🇨🇴 Colombia vs Uzbekistán — 9:00 p. m.', fixed: true },
  { id: 'f2', date: '2026-5-17', text: '🇵🇹 Portugal vs RD Congo — 12:00 m.',      fixed: true },
  { id: 'f3', date: '2026-5-23', text: '🇨🇴 Colombia vs RD Congo — 9:00 p. m.',    fixed: true },
  { id: 'f4', date: '2026-5-23', text: '🇵🇹 Portugal vs Uzbekistán — 12:00 m.',    fixed: true },
  { id: 'f5', date: '2026-5-27', text: '🇨🇴 Colombia vs Portugal — 6:30 p. m.',    fixed: true },
  { id: 'f6', date: '2026-5-27', text: '🇵🇹 Portugal vs Colombia — 6:30 p. m.',    fixed: true },
];

// ── Helpers ──
function loadEvents(d) {
  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const userEvs  = dbEvents.filter(ev => ev.date === key);
  const fixedEvs = FIXED_EVENTS.filter(ev => ev.date === key);
  return [...fixedEvs, ...userEvs];
}
function sameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0,0,0,0);
  return d;
}

// ══════════════════════════════════════════════════
//  THEME
// ══════════════════════════════════════════════════
function initTheme() {
  applyTheme(localStorage.getItem('cal_theme') || 'dark');
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon  = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (theme === 'light') {
    if (icon)  icon.textContent  = '☀️';
    if (label) label.textContent = 'Modo oscuro';
  } else {
    if (icon)  icon.textContent  = '🌙';
    if (label) label.textContent = 'Modo claro';
  }
  localStorage.setItem('cal_theme', theme);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}
document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
initTheme();

// ══════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════
const loginOverlay = document.getElementById('login-overlay');
const userAvatar   = document.getElementById('user-avatar');
const userName     = document.getElementById('user-name');

document.getElementById('login-btn').addEventListener('click', () => {
  signInWithPopup(auth, provider).catch(err => console.error("Error al iniciar sesión:", err));
});
document.getElementById('logout-btn').addEventListener('click', () => {
  signOut(auth).catch(err => console.error("Error al cerrar sesión:", err));
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUid = user.uid;
    loginOverlay.style.display = 'none';
    userAvatar.src = user.photoURL || '';
    userName.textContent = user.displayName || user.email;
    subscribeToUserEvents(user.uid);
    if (!document.getElementById('months').hasChildNodes()) initCalendar();
  } else {
    currentUid = null;
    loginOverlay.style.display = 'flex';
    if (unsubSnapshot) { unsubSnapshot(); unsubSnapshot = null; }
    dbEvents = [];
  }
});

function subscribeToUserEvents(uid) {
  if (unsubSnapshot) unsubSnapshot();
  unsubSnapshot = onSnapshot(collection(db, "users", uid, "events"), (snap) => {
    dbEvents = [];
    snap.forEach(d => dbEvents.push({ id: d.id, ...d.data() }));
    dbEvents.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    refreshAllDots();
    renderTodayEvents();
    renderUpcomingEvents();
    renderEventList();
    if (currentView === 'week') renderWeekView();
  });
}

// ══════════════════════════════════════════════════
//  MODAL
// ══════════════════════════════════════════════════
let activeDate = null;
const overlay    = document.getElementById('modal-overlay');
const modalClose = document.getElementById('modal-close');
const dayLabel   = document.getElementById('modal-day-label');
const daySub     = document.getElementById('modal-day-sub');
const eventInput = document.getElementById('event-input');
const eventList  = document.getElementById('event-list');
const addBtn     = document.getElementById('event-add-btn');

function openModal(date) {
  activeDate = date;
  dayLabel.textContent = `${date.getDate()} de ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
  daySub.textContent   = DAY_NAMES[date.getDay()];
  eventInput.value = '';
  renderEventList();
  overlay.classList.add('open');
  setTimeout(() => eventInput.focus(), 50);
}
function closeModal() { overlay.classList.remove('open'); activeDate = null; }

function renderEventList() {
  if (!activeDate) return;
  const evs = loadEvents(activeDate);
  eventList.innerHTML = '';
  if (!evs.length) {
    eventList.innerHTML = '<p class="no-events">Sin eventos. ¡Agrega uno!</p>';
    return;
  }
  evs.forEach(ev => {
    const item = document.createElement('div');
    item.className = ev.fixed ? 'event-item event-item--fixed' : 'event-item';
    if (ev.fixed) {
      item.innerHTML = `
        <div class="event-color-bar event-color-bar--fixed"></div>
        <span class="event-text">${ev.text}</span>
        <span class="event-fixed-badge">⚽ Mundial</span>`;
    } else {
      item.innerHTML = `
        <div class="event-color-bar"></div>
        <span class="event-text">${ev.text}</span>
        <button class="event-delete" data-id="${ev.id}" aria-label="Eliminar">✕</button>`;
    }
    eventList.appendChild(item);
  });
}

async function addEvent() {
  const text = eventInput.value.trim();
  if (!text || !activeDate || !currentUid) return;
  const dateStr = `${activeDate.getFullYear()}-${activeDate.getMonth()}-${activeDate.getDate()}`;
  eventInput.value = '';
  try {
    await addDoc(collection(db, "users", currentUid, "events"), {
      date: dateStr, text, createdAt: serverTimestamp()
    });
    launchConfetti();
  } catch (err) { console.error("Error al añadir evento:", err); }
}

async function deleteEvent(id) {
  if (!currentUid) return;
  try { await deleteDoc(doc(db, "users", currentUid, "events", id)); }
  catch (err) { console.error("Error al eliminar:", err); }
}

async function moveEvent(evData, targetDate) {
  if (!currentUid) return;
  const newKey = `${targetDate.getFullYear()}-${targetDate.getMonth()}-${targetDate.getDate()}`;
  if (newKey === evData.dateStr) return;
  try { await updateDoc(doc(db, "users", currentUid, "events", evData.id), { date: newKey }); }
  catch (err) { console.error("Error al mover evento:", err); }
}

// ── Dots ──
function refreshDots(date) {
  const key  = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const cell = document.querySelector(`.day-cell[data-key="${key}"]`);
  if (!cell) return;
  const dotsEl = cell.querySelector('.cell-dots');
  if (!dotsEl) return;
  dotsEl.innerHTML = loadEvents(date).slice(0,3).map(() => '<span class="cell-dot"></span>').join('');
}
function refreshAllDots() {
  document.querySelectorAll('.day-cell.in-range').forEach(cell => {
    const k = cell.getAttribute('data-key');
    if (!k) return;
    const [y,m,d] = k.split('-').map(Number);
    refreshDots(new Date(y, m, d));
  });
}

// ══════════════════════════════════════════════════
//  WIDGETS
// ══════════════════════════════════════════════════
function renderTodayEvents() {
  const el = document.getElementById('today-events-list');
  if (!el) return;
  el.innerHTML = '';
  const evs = loadEvents(TODAY);
  if (!evs.length) { el.innerHTML = '<p class="today-no-events">No hay eventos para hoy</p>'; return; }
  evs.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'today-event-item';
    item.innerHTML = `<span class="event-text">${ev.text}</span>`;
    el.appendChild(item);
  });
}

function renderUpcomingEvents() {
  const el = document.getElementById('upcoming-events-list');
  if (!el) return;
  el.innerHTML = '';
  const upcoming = [];
  const scan = new Date(TODAY);
  while (scan <= END) {
    loadEvents(scan).forEach(ev => upcoming.push({ date: new Date(scan), text: ev.text }));
    if (upcoming.length >= 4) break;
    scan.setDate(scan.getDate() + 1);
  }
  if (!upcoming.length) { el.innerHTML = '<p class="upcoming-no-events">No hay próximos eventos programados</p>'; return; }
  upcoming.slice(0, 4).forEach(item => {
    const div = document.createElement('div');
    div.className = 'upcoming-event-item';
    div.innerHTML = `
      <div class="upcoming-date-badge">
        <span class="up-day">${item.date.getDate()}</span>
        <span class="up-month">${MONTH_NAMES[item.date.getMonth()].slice(0,3)}</span>
      </div>
      <div class="upcoming-details">
        <span class="upcoming-text">${item.text}</span>
        <span class="upcoming-weekday">${DAY_SHORT[item.date.getDay()]}</span>
      </div>`;
    div.addEventListener('click', () => openModal(item.date));
    el.appendChild(div);
  });
}

// ══════════════════════════════════════════════════
//  VIEW MANAGEMENT
// ══════════════════════════════════════════════════
function setView(view) {
  currentView = view;
  const monthsEl = document.getElementById('months');
  const weekEl   = document.getElementById('week-view');
  const weekNav  = document.getElementById('week-nav');
  const btnM     = document.getElementById('btn-month-view');
  const btnW     = document.getElementById('btn-week-view');

  if (view === 'month') {
    monthsEl.style.display = '';
    weekEl.style.display   = 'none';
    weekNav.style.display  = 'none';
    btnM.classList.add('active');
    btnW.classList.remove('active');
  } else {
    monthsEl.style.display = 'none';
    weekEl.style.display   = '';
    weekNav.style.display  = 'flex';
    btnM.classList.remove('active');
    btnW.classList.add('active');
    renderWeekView();
  }
}

// ══════════════════════════════════════════════════
//  WEEK VIEW
// ══════════════════════════════════════════════════
function renderWeekView() {
  const weekEl = document.getElementById('week-view');
  weekEl.innerHTML = '';

  // Nav label
  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const navLabel = document.getElementById('week-nav-label');
  if (navLabel) {
    navLabel.textContent =
      `${currentWeekStart.getDate()} ${MONTH_NAMES[currentWeekStart.getMonth()].slice(0,3)} – ` +
      `${weekEnd.getDate()} ${MONTH_NAMES[weekEnd.getMonth()].slice(0,3)} ${weekEnd.getFullYear()}`;
  }

  const grid = document.createElement('div');
  grid.className = 'week-grid';

  for (let i = 0; i < 7; i++) {
    const date      = new Date(currentWeekStart);
    date.setDate(date.getDate() + i);
    const isToday   = sameDay(date, TODAY);
    const isEnd     = sameDay(date, END);
    const inRange   = date >= START && date <= END;
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const dateStr   = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    const col = document.createElement('div');
    col.className = 'week-col' +
      (isToday   ? ' week-col-today'   : '') +
      (isEnd     ? ' week-col-end'     : '') +
      (isWeekend ? ' week-col-weekend' : '') +
      (!inRange  ? ' week-col-out'     : '');

    // Header
    const header = document.createElement('div');
    header.className = 'week-col-header';
    header.innerHTML = `
      <span class="week-day-name">${DAY_SHORT[date.getDay()]}</span>
      <span class="week-day-num ${isToday ? 'week-today-num' : ''} ${isEnd ? 'week-end-num' : ''}">${date.getDate()}</span>`;
    col.appendChild(header);

    // Events area
    const eventsDiv = document.createElement('div');
    eventsDiv.className = 'week-events';

    if (inRange) {
      loadEvents(date).forEach(ev => {
        const card = document.createElement('div');
        card.className = 'week-event-card';
        card.draggable = true;
        card.innerHTML = `<span class="week-event-text">${ev.text}</span>`;
        card.dataset.id   = ev.id;
        card.dataset.date = dateStr;

        card.addEventListener('dragstart', e => {
          draggedEvent = { id: ev.id, dateStr };
          e.dataTransfer.effectAllowed = 'move';
          setTimeout(() => card.classList.add('dragging'), 0);
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        eventsDiv.appendChild(card);
      });

      // Add button
      const addBtnEl = document.createElement('button');
      addBtnEl.className = 'week-add-btn';
      addBtnEl.textContent = '+ Agregar';
      addBtnEl.addEventListener('click', () => openModal(date));
      eventsDiv.appendChild(addBtnEl);

      // Drop zone
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over'); });
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drag-over');
        if (draggedEvent) { moveEvent(draggedEvent, date); draggedEvent = null; }
      });
    }

    col.appendChild(eventsDiv);
    grid.appendChild(col);
  }
  weekEl.appendChild(grid);
}

// ══════════════════════════════════════════════════
//  EVENT LISTENERS
// ══════════════════════════════════════════════════
modalClose.addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
addBtn.addEventListener('click', addEvent);
eventInput.addEventListener('keydown', e => { if (e.key === 'Enter') addEvent(); });
eventList.addEventListener('click', e => {
  const btn = e.target.closest('.event-delete');
  if (btn) deleteEvent(btn.dataset.id);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
document.getElementById('manage-today-btn').addEventListener('click', () => openModal(TODAY));
document.getElementById('btn-month-view').addEventListener('click', () => setView('month'));
document.getElementById('btn-week-view').addEventListener('click', () => setView('week'));
document.getElementById('prev-week').addEventListener('click', () => {
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  renderWeekView();
});
document.getElementById('next-week').addEventListener('click', () => {
  currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  renderWeekView();
});

// ══════════════════════════════════════════════════
//  MONTH RENDERER
// ══════════════════════════════════════════════════
function renderMonth(year, month) {
  const block = document.createElement('div');
  block.className = 'month-block';

  const title = document.createElement('div');
  title.className = 'month-title';
  const pills = { 5: 'Inicio', 7: 'Fin' };
  title.innerHTML = `${MONTH_NAMES[month]} ${year}` +
    (pills[month] ? ` <span class="pill">${pills[month]}</span>` : '');
  block.appendChild(title);

  const labelsRow = document.createElement('div');
  labelsRow.className = 'day-labels';
  DAY_SHORT.forEach((d, i) => {
    const lbl = document.createElement('div');
    lbl.className = 'day-label' + (i===0||i===6 ? ' weekend-label' : '');
    lbl.textContent = d;
    labelsRow.appendChild(lbl);
  });
  block.appendChild(labelsRow);

  const grid = document.createElement('div');
  grid.className = 'cal-grid';

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const e = document.createElement('div');
    e.className = 'day-cell empty';
    grid.appendChild(e);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date    = new Date(year, month, d);
    const cell    = document.createElement('div');
    const dateKey = `${year}-${month}-${d}`;
    const isToday   = sameDay(date, TODAY);
    const isEnd     = sameDay(date, END);
    const isWeekend = date.getDay()===0 || date.getDay()===6;
    const inRange   = date >= START && date <= END;

    let cls = 'day-cell';
    if      (isToday)  cls += ' in-range today';
    else if (isEnd)    cls += ' in-range end-date';
    else if (inRange)  cls += ' in-range' + (isWeekend ? ' weekend' : '');
    else               cls += ' out-range';

    cell.className = cls;
    cell.setAttribute('data-key', dateKey);
    cell.setAttribute('aria-label', `${d} de ${MONTH_NAMES[month]} ${year}`);

    const numSpan = document.createElement('span');
    numSpan.textContent = d;
    cell.appendChild(numSpan);

    const dotsEl = document.createElement('div');
    dotsEl.className = 'cell-dots';
    cell.appendChild(dotsEl);

    if (inRange) cell.addEventListener('click', () => openModal(date));
    grid.appendChild(cell);
  }

  block.appendChild(grid);
  return block;
}

function initCalendar() {
  const container = document.getElementById('months');
  container.appendChild(renderMonth(2026, 5));
  container.appendChild(renderMonth(2026, 6));
  container.appendChild(renderMonth(2026, 7));

  document.getElementById('days-left').textContent =
    Math.max(0, Math.ceil((END - TODAY) / 86400000));

  const totalMs   = END - START;
  const elapsedMs = Math.max(0, Math.min(TODAY - START, totalMs));
  const pct       = Math.round((elapsedMs / totalMs) * 100);
  document.getElementById('pct').textContent = pct + '%';
  setTimeout(() => { document.getElementById('progress-fill').style.width = pct + '%'; }, 600);
}

// ══════════════════════════════════════════════════
//  CONFETTI 🎉
// ══════════════════════════════════════════════════
function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#7c7aaa','#b07080','#c8a96e','#5a8f7f','#a06070','#6b9abf','#d4a5c9'];
  const particles = Array.from({ length: 72 }, () => ({
    x:         Math.random() * canvas.width,
    y:         Math.random() * canvas.height * 0.35 - 10,
    r:         Math.random() * 5 + 3,
    color:     colors[Math.floor(Math.random() * colors.length)],
    speed:     Math.random() * 2 + 1.2,
    wobble:    Math.random() * Math.PI * 2,
    wobbleInc: Math.random() * 0.06 + 0.02,
    rotation:  Math.random() * 360,
    rotSpeed:  (Math.random() - 0.5) * 5,
  }));

  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;
    const alpha = frame < 80 ? 1 : Math.max(0, 1 - (frame - 80) / 40);

    particles.forEach(p => {
      p.y        += p.speed;
      p.wobble   += p.wobbleInc;
      p.x        += Math.sin(p.wobble) * 1.2;
      p.rotation += p.rotSpeed;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r, p.r, p.r * 2);
      ctx.restore();
    });

    if (frame < 120) requestAnimationFrame(animate);
    else canvas.remove();
  }
  animate();
}
