'use strict';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STORAGE_KEY = 'boodschappen.items';

const form = document.getElementById('form');
const input = document.getElementById('newItem');
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const statusEl = document.getElementById('status');

// --- Supabase setup (falls back to local-only if not configured) -----------
const configured =
  typeof window.SUPABASE_URL === 'string' &&
  !window.SUPABASE_URL.includes('YOUR-PROJECT') &&
  typeof window.SUPABASE_ANON_KEY === 'string' &&
  !window.SUPABASE_ANON_KEY.includes('YOUR-ANON-KEY');

const supabase = configured
  ? createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

/** @type {{id: string, text: string, created_at?: string}[]} */
let items = loadLocal();

// --- Local cache (offline + instant first paint) ---------------------------
function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function setStatus(text) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.opacity = text ? '1' : '0';
}

// --- Rendering -------------------------------------------------------------
function render() {
  listEl.innerHTML = '';
  for (const item of items) listEl.appendChild(createRow(item));
  emptyEl.style.display = items.length ? 'none' : 'block';
}

function createRow(item) {
  const row = document.createElement('li');
  row.className = 'row';
  row.dataset.id = item.id;

  const el = document.createElement('div');
  el.className = 'item';
  el.textContent = item.text;
  el.dataset.id = item.id;

  attachSwipe(el, row, item.id);
  row.appendChild(el);
  return row;
}

// --- Mutations (optimistic UI + Supabase, with local fallback) -------------
async function addItem(text) {
  const value = text.trim();
  if (!value) return;

  const item = { id: uid(), text: value, created_at: new Date().toISOString() };
  items.unshift(item);
  saveLocal();
  listEl.prepend(createRow(item));
  emptyEl.style.display = 'none';

  if (!supabase) return;
  const { error } = await supabase
    .from('items')
    .insert({ id: item.id, text: item.text });
  if (error) setStatus('Offline — wordt lokaal bewaard');
}

async function removeItem(id, row) {
  items = items.filter((i) => i.id !== id);
  saveLocal();
  animateOut(row);

  if (!supabase) return;
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) setStatus('Offline — wordt lokaal bewaard');
}

function animateOut(row) {
  if (!row || !row.isConnected) return;
  row.style.transition = 'height 0.2s ease, margin 0.2s ease, opacity 0.2s ease';
  row.style.height = row.offsetHeight + 'px';
  void row.offsetHeight; // reflow so the height transition runs
  row.style.height = '0';
  row.style.marginBottom = '0';
  row.style.opacity = '0';
  row.addEventListener(
    'transitionend',
    () => {
      row.remove();
      if (!items.length) emptyEl.style.display = 'block';
    },
    { once: true }
  );
}

// --- Server sync -----------------------------------------------------------
async function syncFromServer() {
  if (!supabase) return;
  setStatus('Synchroniseren…');
  const { data, error } = await supabase
    .from('items')
    .select('id, text, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    setStatus('Offline — lokale lijst');
    return;
  }
  items = data;
  saveLocal();
  render();
  setStatus('');
}

function subscribeRealtime() {
  if (!supabase) return;
  supabase
    .channel('items-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'items' }, (payload) => {
      const it = payload.new;
      if (items.some((i) => i.id === it.id)) return; // already added locally
      items.unshift({ id: it.id, text: it.text, created_at: it.created_at });
      saveLocal();
      listEl.prepend(createRow(it));
      emptyEl.style.display = 'none';
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'items' }, (payload) => {
      const id = payload.old.id;
      if (!items.some((i) => i.id === id)) return; // already removed locally
      items = items.filter((i) => i.id !== id);
      saveLocal();
      const row = listEl.querySelector(`.row[data-id="${id}"]`);
      animateOut(row);
    })
    .subscribe();
}

// --- Swipe-right-to-remove (touch + mouse via pointer events) --------------
function attachSwipe(el, row, id) {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dragging = false;
  let decided = false;

  el.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    dragging = true;
    decided = false;
    el.classList.add('dragging');
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const moveX = e.clientX - startX;
    const moveY = e.clientY - startY;

    if (!decided) {
      if (Math.abs(moveX) < 6 && Math.abs(moveY) < 6) return;
      if (Math.abs(moveY) > Math.abs(moveX)) {
        dragging = false;
        el.classList.remove('dragging');
        return;
      }
      decided = true;
      el.setPointerCapture(e.pointerId);
    }

    dx = Math.max(0, moveX); // right only
    el.style.transform = `translateX(${dx}px)`;
  });

  function end() {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    const threshold = el.offsetWidth * 0.4;
    if (dx > threshold) {
      el.classList.add('settling');
      el.style.transform = `translateX(${el.offsetWidth + 40}px)`;
      el.addEventListener('transitionend', () => removeItem(id, row), { once: true });
    } else {
      el.classList.add('settling');
      el.style.transform = 'translateX(0)';
      el.addEventListener('transitionend', () => el.classList.remove('settling'), { once: true });
    }
  }

  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// --- Wire up ---------------------------------------------------------------
form.addEventListener('submit', (e) => {
  e.preventDefault();
  addItem(input.value);
  input.value = '';
  input.focus();
});

render();

if (!configured) {
  setStatus('Local-only — zie SETUP.md om te synchroniseren');
} else {
  syncFromServer();
  subscribeRealtime();
  window.addEventListener('online', syncFromServer);
}

// Register service worker for offline + installability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
