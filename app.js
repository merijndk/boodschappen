'use strict';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ITEMS_KEY = 'boodschappen.items';
const RECIPES_KEY = 'boodschappen.recipes';

// Shopping list
const form = document.getElementById('form');
const input = document.getElementById('newItem');
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const statusEl = document.getElementById('status');

// Recipe modal
const bookBtn = document.getElementById('bookBtn');
const modal = document.getElementById('recipeModal');
const listView = modal.querySelector('[data-view="list"]');
const newView = modal.querySelector('[data-view="new"]');
const recipeClose = document.getElementById('recipeClose');
const recipeNewBtn = document.getElementById('recipeNewBtn');
const recipeBack = document.getElementById('recipeBack');
const recipeSave = document.getElementById('recipeSave');
const recipeListEl = document.getElementById('recipeList');
const recipeEmptyEl = document.getElementById('recipeEmpty');
const recipeNameInput = document.getElementById('recipeName');
const ingredientForm = document.getElementById('ingredientForm');
const ingredientInput = document.getElementById('ingredientInput');
const ingredientListEl = document.getElementById('ingredientList');

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
let items = loadLocal(ITEMS_KEY);
/** @type {{id: string, name: string, ingredients: string[], created_at?: string}[]} */
let recipes = loadLocal(RECIPES_KEY);
/** ingredients being typed while creating a new recipe */
let draft = [];

// --- Helpers ---------------------------------------------------------------
function loadLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}
function saveItems() {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}
function saveRecipes() {
  localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

let statusTimer = null;
function setStatus(text, autoClear) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.opacity = text ? '1' : '0';
  clearTimeout(statusTimer);
  if (text && autoClear) statusTimer = setTimeout(() => setStatus(''), 2200);
}

// --- Generic swipe-to-remove row (touch + mouse via pointer events) --------
// Builds a <li.row><div.item> and calls onRemove(row) when flung right.
function makeSwipeRow(text, id, onRemove) {
  const row = document.createElement('li');
  row.className = 'row';
  row.dataset.id = id;

  const el = document.createElement('div');
  el.className = 'item';
  el.textContent = text;

  let startX = 0, startY = 0, dx = 0, dragging = false, decided = false;

  el.addEventListener('pointerdown', (e) => {
    startX = e.clientX; startY = e.clientY; dx = 0;
    dragging = true; decided = false;
    el.classList.add('dragging');
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const moveX = e.clientX - startX;
    const moveY = e.clientY - startY;
    if (!decided) {
      if (Math.abs(moveX) < 6 && Math.abs(moveY) < 6) return;
      if (Math.abs(moveY) > Math.abs(moveX)) { // vertical scroll — bail
        dragging = false; el.classList.remove('dragging'); return;
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
      el.addEventListener('transitionend', () => onRemove(row), { once: true });
    } else {
      el.classList.add('settling');
      el.style.transform = 'translateX(0)';
      el.addEventListener('transitionend', () => el.classList.remove('settling'), { once: true });
    }
  }
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  row.appendChild(el);
  return row;
}

function animateOut(row, onDone) {
  if (!row || !row.isConnected) { if (onDone) onDone(); return; }
  row.style.transition = 'height 0.2s ease, margin 0.2s ease, opacity 0.2s ease';
  row.style.height = row.offsetHeight + 'px';
  void row.offsetHeight;
  row.style.height = '0';
  row.style.marginBottom = '0';
  row.style.opacity = '0';
  row.addEventListener('transitionend', () => { row.remove(); if (onDone) onDone(); }, { once: true });
}

// =========================================================================
//  SHOPPING LIST
// =========================================================================
function renderList() {
  listEl.innerHTML = '';
  for (const item of items) listEl.appendChild(itemRow(item));
  emptyEl.style.display = items.length ? 'none' : 'block';
}

function itemRow(item) {
  return makeSwipeRow(item.text, item.id, (row) => removeItem(item.id, row));
}

async function addItem(text) {
  const value = text.trim();
  if (!value) return;
  const item = { id: uid(), text: value, created_at: new Date().toISOString() };
  items.unshift(item);
  saveItems();
  listEl.prepend(itemRow(item));
  emptyEl.style.display = 'none';

  if (!supabase) return;
  const { error } = await supabase.from('items').insert({ id: item.id, text: item.text });
  if (error) setStatus('Offline — wordt lokaal bewaard', true);
}

async function removeItem(id, row) {
  items = items.filter((i) => i.id !== id);
  saveItems();
  animateOut(row, () => { if (!items.length) emptyEl.style.display = 'block'; });

  if (!supabase) return;
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) setStatus('Offline — wordt lokaal bewaard', true);
}

async function syncItemsFromServer() {
  if (!supabase) return;
  setStatus('Synchroniseren…');
  const { data, error } = await supabase
    .from('items')
    .select('id, text, created_at')
    .order('created_at', { ascending: false });
  if (error) { setStatus('Offline — lokale lijst', true); return; }
  items = data;
  saveItems();
  renderList();
  setStatus('');
}

// =========================================================================
//  RECIPES
// =========================================================================
function renderRecipes() {
  recipeListEl.innerHTML = '';
  for (const r of recipes) recipeListEl.appendChild(recipeRow(r));
  recipeEmptyEl.style.display = recipes.length ? 'none' : 'block';
}

function recipeRow(recipe) {
  const li = document.createElement('li');
  li.className = 'recipe-row';
  li.dataset.id = recipe.id;

  const tap = document.createElement('button');
  tap.type = 'button';
  tap.className = 'recipe-tap';
  const count = recipe.ingredients.length;
  tap.innerHTML =
    `<span class="r-name"></span>` +
    `<span class="r-sub"></span>`;
  tap.querySelector('.r-name').textContent = recipe.name;
  tap.querySelector('.r-sub').textContent =
    count === 0 ? 'Geen ingrediënten' :
    recipe.ingredients.join(', ');
  tap.addEventListener('click', () => addRecipeToList(recipe));

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'recipe-del';
  del.setAttribute('aria-label', 'Verwijder recept');
  del.textContent = '🗑';
  del.addEventListener('click', () => deleteRecipe(recipe.id, li));

  li.appendChild(tap);
  li.appendChild(del);
  return li;
}

function addRecipeToList(recipe) {
  for (const ing of recipe.ingredients) addItem(ing);
  closeModal();
  setStatus(`Toegevoegd: ${recipe.name}`, true);
}

async function deleteRecipe(id, li) {
  recipes = recipes.filter((r) => r.id !== id);
  saveRecipes();
  if (li) {
    li.style.transition = 'height 0.2s ease, margin 0.2s ease, opacity 0.2s ease';
    li.style.height = li.offsetHeight + 'px';
    void li.offsetHeight;
    li.style.height = '0'; li.style.marginBottom = '0'; li.style.opacity = '0';
    li.addEventListener('transitionend', () => {
      li.remove();
      recipeEmptyEl.style.display = recipes.length ? 'none' : 'block';
    }, { once: true });
  }
  if (!supabase) return;
  await supabase.from('recipes').delete().eq('id', id);
}

async function saveNewRecipe() {
  const name = recipeNameInput.value.trim();
  if (!name) { recipeNameInput.focus(); setStatus(''); return; }
  if (!draft.length) { ingredientInput.focus(); return; }

  const recipe = { id: uid(), name, ingredients: draft.slice(), created_at: new Date().toISOString() };
  recipes.unshift(recipe);
  saveRecipes();
  renderRecipes();
  showListView();

  if (supabase) {
    const { error } = await supabase
      .from('recipes')
      .insert({ id: recipe.id, name: recipe.name, ingredients: recipe.ingredients });
    if (error) setStatus('Offline — recept lokaal bewaard', true);
  }
}

async function syncRecipesFromServer() {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('recipes')
    .select('id, name, ingredients, created_at')
    .order('created_at', { ascending: false });
  if (error) return;
  recipes = data.map((r) => ({ ...r, ingredients: r.ingredients || [] }));
  saveRecipes();
  renderRecipes();
}

// --- Draft ingredient editing (same UX as the shopping list) ---------------
function renderDraft() {
  ingredientListEl.innerHTML = '';
  draft.forEach((text, i) => {
    const idForRow = 'draft-' + i;
    const row = makeSwipeRow(text, idForRow, (r) => {
      const idx = draft.indexOf(text);
      if (idx > -1) draft.splice(idx, 1);
      saveDraftReindex();
      animateOut(r);
    });
    ingredientListEl.appendChild(row);
  });
}
// draft rows are keyed by index; after a splice, simplest is a full re-render
function saveDraftReindex() { /* no-op: draft is the source of truth */ }

function addDraftIngredient(text) {
  const value = text.trim();
  if (!value) return;
  draft.push(value);
  renderDraft();
}

// =========================================================================
//  MODAL NAVIGATION
// =========================================================================
function openModal() {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  showListView();
  syncRecipesFromServer();
}
function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
function showListView() {
  newView.hidden = true;
  listView.hidden = false;
  renderRecipes();
}
function showNewView() {
  draft = [];
  recipeNameInput.value = '';
  ingredientInput.value = '';
  renderDraft();
  listView.hidden = true;
  newView.hidden = false;
  recipeNameInput.focus();
}

// =========================================================================
//  WIRE UP
// =========================================================================
form.addEventListener('submit', (e) => {
  e.preventDefault();
  addItem(input.value);
  input.value = '';
  input.focus();
});

bookBtn.addEventListener('click', openModal);
recipeClose.addEventListener('click', closeModal);
recipeNewBtn.addEventListener('click', showNewView);
recipeBack.addEventListener('click', showListView);
recipeSave.addEventListener('click', saveNewRecipe);

ingredientForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addDraftIngredient(ingredientInput.value);
  ingredientInput.value = '';
  ingredientInput.focus();
});

renderList();
renderRecipes();

if (!configured) {
  setStatus('Local-only — zie SETUP.md om te synchroniseren');
} else {
  syncItemsFromServer();
  syncRecipesFromServer();
  subscribeRealtime();
  window.addEventListener('online', () => { syncItemsFromServer(); syncRecipesFromServer(); });
}

// --- Realtime (shopping list stays live across devices) --------------------
function subscribeRealtime() {
  if (!supabase) return;
  supabase
    .channel('items-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'items' }, (payload) => {
      const it = payload.new;
      if (items.some((i) => i.id === it.id)) return;
      items.unshift({ id: it.id, text: it.text, created_at: it.created_at });
      saveItems();
      listEl.prepend(itemRow(it));
      emptyEl.style.display = 'none';
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'items' }, (payload) => {
      const id = payload.old.id;
      if (!items.some((i) => i.id === id)) return;
      items = items.filter((i) => i.id !== id);
      saveItems();
      const row = listEl.querySelector(`.row[data-id="${id}"]`);
      animateOut(row, () => { if (!items.length) emptyEl.style.display = 'block'; });
    })
    .subscribe();
}

// Register service worker for offline + installability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
