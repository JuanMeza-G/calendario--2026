import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Configuration
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

// Initialize Firebase & Firestore
const appApp = initializeApp(firebaseConfig);
const db = getFirestore(appApp);

const START = new Date(2026, 5, 11);
const END   = new Date(2026, 7, 10);
const TODAY = new Date();
TODAY.setHours(0,0,0,0);

const DAY_NAMES   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DAY_SHORT   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── In-Memory Event Cache ──
let dbEvents = [];

// ── Storage Helpers (Firestore adapters) ──
function loadEvents(d) {
  const dateStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  return dbEvents.filter(ev => ev.date === dateStr);
}

function sameDay(a, b) { 
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); 
}

// ── Modal Lógica ──
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

function closeModal() { 
  overlay.classList.remove('open'); 
  activeDate = null; 
}

function renderEventList() {
  if (!activeDate) return;
  const evs = loadEvents(activeDate);
  eventList.innerHTML = '';
  if (!evs.length) {
    eventList.innerHTML = '<p class="no-events">Sin eventos. ¡Agrega uno!</p>';
    return;
  }
  evs.forEach((ev) => {
    const item = document.createElement('div');
    item.className = 'event-item';
    item.innerHTML = `
      <div class="event-color-bar"></div>
      <span class="event-text">${ev.text}</span>
      <button class="event-delete" data-id="${ev.id}" aria-label="Eliminar">✕</button>`;
    eventList.appendChild(item);
  });
}

async function addEvent() {
  const text = eventInput.value.trim();
  if (!text || !activeDate) return;
  
  const dateStr = `${activeDate.getFullYear()}-${activeDate.getMonth()}-${activeDate.getDate()}`;
  eventInput.value = '';
  
  try {
    await addDoc(collection(db, "events"), {
      date: dateStr,
      text: text,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Error al añadir evento a Firestore:", err);
  }
}

async function deleteEvent(id) {
  try {
    await deleteDoc(doc(db, "events", id));
  } catch (err) {
    console.error("Error al eliminar evento de Firestore:", err);
  }
}

function refreshDots(date) {
  const key  = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const cell = document.querySelector(`.day-cell[data-key="${key}"]`);
  if (!cell) return;
  const dotsEl = cell.querySelector('.cell-dots');
  if (!dotsEl) return;
  const evs = loadEvents(date);
  dotsEl.innerHTML = evs.slice(0,3).map(() => '<span class="cell-dot"></span>').join('');
}

function refreshAllDots() {
  document.querySelectorAll('.day-cell.in-range').forEach(cell => {
    const key = cell.getAttribute('data-key');
    if (!key) return;
    const parts = key.split('-').map(Number);
    const date = new Date(parts[0], parts[1], parts[2]);
    refreshDots(date);
  });
}

// ── Today's Events ──
function renderTodayEvents() {
  const listEl = document.getElementById('today-events-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  const evs = loadEvents(TODAY);
  if (!evs.length) {
    listEl.innerHTML = '<p class="today-no-events">No hay eventos para hoy</p>';
    return;
  }
  evs.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'today-event-item';
    item.innerHTML = `<span class="event-text">${ev.text}</span>`;
    listEl.appendChild(item);
  });
}

// ── Upcoming Events ──
function renderUpcomingEvents() {
  const listEl = document.getElementById('upcoming-events-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  
  const upcoming = [];
  const scanDate = new Date(TODAY);
  
  while (scanDate <= END) {
    const evs = loadEvents(scanDate);
    if (evs.length) {
      evs.forEach(ev => {
        upcoming.push({
          date: new Date(scanDate),
          text: ev.text
        });
      });
    }
    if (upcoming.length >= 4) break;
    scanDate.setDate(scanDate.getDate() + 1);
  }
  
  if (!upcoming.length) {
    listEl.innerHTML = '<p class="upcoming-no-events">No hay próximos eventos programados</p>';
    return;
  }
  
  upcoming.slice(0, 4).forEach(item => {
    const dayNum = item.date.getDate();
    const monthName = MONTH_NAMES[item.date.getMonth()].slice(0, 3);
    const dayName = DAY_SHORT[item.date.getDay()];
    
    const el = document.createElement('div');
    el.className = 'upcoming-event-item';
    el.innerHTML = `
      <div class="upcoming-date-badge">
        <span class="up-day">${dayNum}</span>
        <span class="up-month">${monthName}</span>
      </div>
      <div class="upcoming-details">
        <span class="upcoming-text">${item.text}</span>
        <span class="upcoming-weekday">${dayName}</span>
      </div>
    `;
    el.addEventListener('click', () => openModal(item.date));
    listEl.appendChild(el);
  });
}

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

// ── Render months ──
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
    // Will be populated asynchronously via snapshot listener
    cell.appendChild(dotsEl);

    if (inRange) cell.addEventListener('click', () => openModal(date));
    grid.appendChild(cell);
  }

  block.appendChild(grid);
  return block;
}

const container = document.getElementById('months');
container.appendChild(renderMonth(2026, 5));
container.appendChild(renderMonth(2026, 6));
container.appendChild(renderMonth(2026, 7));

// Countdown
document.getElementById('days-left').textContent =
  Math.max(0, Math.ceil((END - TODAY) / 86400000));

// Progress
const totalMs   = END - START;
const elapsedMs = Math.max(0, Math.min(TODAY - START, totalMs));
const pct       = Math.round((elapsedMs / totalMs) * 100);
document.getElementById('pct').textContent = pct + '%';
setTimeout(() => { document.getElementById('progress-fill').style.width = pct + '%'; }, 600);

// ── Real-Time Sync with Firestore ──
onSnapshot(collection(db, "events"), (snapshot) => {
  dbEvents = [];
  snapshot.forEach(docSnapshot => {
    dbEvents.push({
      id: docSnapshot.id,
      ...docSnapshot.data()
    });
  });

  // Sort by createdAt timestamp (safely handling null/missing timestamps from local optimistic writes)
  dbEvents.sort((a, b) => {
    const aTime = a.createdAt?.seconds || Date.now() / 1000;
    const bTime = b.createdAt?.seconds || Date.now() / 1000;
    return aTime - bTime;
  });

  // Refresh UI
  refreshAllDots();
  renderTodayEvents();
  renderUpcomingEvents();
  renderEventList(); // Updates modal list if open
});
