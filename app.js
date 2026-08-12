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

// Edit popup
const editSheet = document.getElementById('editSheet');
const editName = document.getElementById('editName');
const editAmountEl = document.getElementById('editAmount');
const editMinus = document.getElementById('editMinus');
const editPlus = document.getElementById('editPlus');
const editCancel = document.getElementById('editCancel');
const editSaveBtn = document.getElementById('editSaveBtn');

// Confirm popup
const confirmSheet = document.getElementById('confirmSheet');
const confirmText = document.getElementById('confirmText');
const confirmCancel = document.getElementById('confirmCancel');
const confirmOk = document.getElementById('confirmOk');

// --- Supabase setup (falls back to local-only if not configured) -----------
const configured =
  typeof window.SUPABASE_URL === 'string' &&
  !window.SUPABASE_URL.includes('YOUR-PROJECT') &&
  typeof window.SUPABASE_ANON_KEY === 'string' &&
  !window.SUPABASE_ANON_KEY.includes('YOUR-ANON-KEY');

const supabase = configured
  ? createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

/** @type {{id: string, text: string, amount: number, created_at?: string}[]} */
let items = loadLocal(ITEMS_KEY);
/** @type {{id: string, name: string, ingredients: {text:string, amount:number}[], created_at?: string}[]} */
let recipes = loadLocal(RECIPES_KEY).map(normRecipe);
/** ingredients being typed while creating a new recipe: {text, amount}[] */
let draft = [];

// --- Helpers ---------------------------------------------------------------
function loadLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}
function saveItems() { localStorage.setItem(ITEMS_KEY, JSON.stringify(items)); }
function saveRecipes() { localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes)); }

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Normalize an ingredient that might be a plain string (older data) or {text, amount}
function normIng(x) {
  if (typeof x === 'string') return { text: x, amount: 1 };
  return { text: String(x.text ?? ''), amount: Math.max(1, parseInt(x.amount, 10) || 1) };
}
function normRecipe(r) {
  return { ...r, ingredients: (r.ingredients || []).map(normIng) };
}

let statusTimer = null;
function setStatus(text, autoClear) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.opacity = text ? '1' : '0';
  clearTimeout(statusTimer);
  if (text && autoClear) statusTimer = setTimeout(() => setStatus(''), 2200);
}

// --- Generic editable + swipeable row --------------------------------------
// Row shows [name (+qty badge if >1)] [🗑]. Tap name → onEdit(li). Trash or
// swipe-right → onDelete(li). Returns the <li>.
function makeRow(text, amount, { onEdit, onDelete }) {
  const li = document.createElement('li');
  li.className = 'row';

  const item = document.createElement('div');
  item.className = 'item';

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'item-main';
  if (amount > 1) {
    const qty = document.createElement('span');
    qty.className = 'item-qty';
    qty.textContent = amount;
    main.appendChild(qty);
  }
  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = text;
  main.appendChild(name);

  const trash = document.createElement('button');
  trash.type = 'button';
  trash.className = 'item-trash';
  trash.setAttribute('aria-label', 'Verwijder');
  trash.textContent = '🗑';

  item.appendChild(main);
  item.appendChild(trash);
  li.appendChild(item);

  // Swipe handling on the whole item surface
  let startX = 0, startY = 0, dx = 0, dragging = false, decided = false, didSwipe = false;

  item.addEventListener('pointerdown', (e) => {
    if (e.target === trash) return; // let the trash button handle its own tap
    startX = e.clientX; startY = e.clientY; dx = 0;
    dragging = true; decided = false; didSwipe = false;
    item.classList.add('dragging');
  });
  item.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const mX = e.clientX - startX, mY = e.clientY - startY;
    if (!decided) {
      if (Math.abs(mX) < 6 && Math.abs(mY) < 6) return;
      if (Math.abs(mY) > Math.abs(mX)) { dragging = false; item.classList.remove('dragging'); return; }
      decided = true; didSwipe = true;
      item.setPointerCapture(e.pointerId);
    }
    dx = Math.max(0, mX);
    item.style.transform = `translateX(${dx}px)`;
  });
  function end() {
    if (!dragging) return;
    dragging = false;
    item.classList.remove('dragging');
    const threshold = item.offsetWidth * 0.4;
    if (dx > threshold) {
      item.classList.add('settling');
      item.style.transform = `translateX(${item.offsetWidth + 40}px)`;
      item.addEventListener('transitionend', () => onDelete(li), { once: true });
    } else {
      item.classList.add('settling');
      item.style.transform = 'translateX(0)';
      item.addEventListener('transitionend', () => item.classList.remove('settling'), { once: true });
    }
  }
  item.addEventListener('pointerup', end);
  item.addEventListener('pointercancel', end);

  main.addEventListener('click', () => {
    if (didSwipe) { didSwipe = false; return; } // ignore the click that ends a swipe
    onEdit(li);
  });
  trash.addEventListener('click', (e) => { e.stopPropagation(); onDelete(li); });

  return li;
}

function animateOut(li, onDone) {
  if (!li || !li.isConnected) { if (onDone) onDone(); return; }
  li.style.transition = 'height 0.2s ease, margin 0.2s ease, opacity 0.2s ease';
  li.style.height = li.offsetHeight + 'px';
  void li.offsetHeight;
  li.style.height = '0';
  li.style.marginBottom = '0';
  li.style.opacity = '0';
  li.addEventListener('transitionend', () => { li.remove(); if (onDone) onDone(); }, { once: true });
}

// --- Edit popup ------------------------------------------------------------
let editValue = 1;
let editOnSave = null;

function openEdit(text, amount, onSave) {
  editValue = Math.max(1, amount || 1);
  editOnSave = onSave;
  editName.value = text;
  editAmountEl.textContent = editValue;
  editSheet.classList.add('open');
  editSheet.setAttribute('aria-hidden', 'false');
  setTimeout(() => { editName.focus(); }, 60);
}
function closeEdit() {
  editSheet.classList.remove('open');
  editSheet.setAttribute('aria-hidden', 'true');
  editOnSave = null;
}
function commitEdit() {
  const t = editName.value.trim();
  if (!t) { editName.focus(); return; }
  const cb = editOnSave;
  const amt = editValue;
  closeEdit();
  if (cb) cb({ text: t, amount: amt });
}
editMinus.addEventListener('click', () => { editValue = Math.max(1, editValue - 1); editAmountEl.textContent = editValue; });
editPlus.addEventListener('click', () => { editValue += 1; editAmountEl.textContent = editValue; });
editCancel.addEventListener('click', closeEdit);
editSaveBtn.addEventListener('click', commitEdit);
editSheet.addEventListener('click', (e) => { if (e.target === editSheet) closeEdit(); });
editName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit(); } });

// --- Confirm popup ---------------------------------------------------------
let confirmOnOk = null;
function openConfirm(message, onOk) {
  confirmText.textContent = message;
  confirmOnOk = onOk;
  confirmSheet.classList.add('open');
  confirmSheet.setAttribute('aria-hidden', 'false');
}
function closeConfirm() {
  confirmSheet.classList.remove('open');
  confirmSheet.setAttribute('aria-hidden', 'true');
  confirmOnOk = null;
}
confirmCancel.addEventListener('click', closeConfirm);
confirmSheet.addEventListener('click', (e) => { if (e.target === confirmSheet) closeConfirm(); });
confirmOk.addEventListener('click', () => {
  const cb = confirmOnOk;
  closeConfirm();
  if (cb) cb();
});

// =========================================================================
//  SHOPPING LIST
// =========================================================================
function renderList() {
  listEl.innerHTML = '';
  for (const item of items) listEl.appendChild(itemRow(item));
  emptyEl.style.display = items.length ? 'none' : 'block';
}

function itemRow(item) {
  const li = makeRow(item.text, item.amount, {
    onEdit: (row) => openEdit(item.text, item.amount, ({ text, amount }) => updateItem(item, text, amount, row)),
    onDelete: (row) => removeItem(item.id, row),
  });
  li.dataset.id = item.id;
  return li;
}

async function addItem(text, amount = 1) {
  const value = text.trim();
  if (!value) return;
  const item = { id: uid(), text: value, amount: Math.max(1, amount || 1), created_at: new Date().toISOString() };
  items.unshift(item);
  saveItems();
  listEl.prepend(itemRow(item));
  emptyEl.style.display = 'none';

  if (!supabase) return;
  const { error } = await supabase.from('items').insert({ id: item.id, text: item.text, amount: item.amount });
  if (error) setStatus('Offline — wordt lokaal bewaard', true);
}

async function updateItem(item, text, amount, li) {
  item.text = text;
  item.amount = amount;
  saveItems();
  li.replaceWith(itemRow(item));
  if (!supabase) return;
  const { error } = await supabase.from('items').update({ text, amount }).eq('id', item.id);
  if (error) setStatus('Offline — wordt lokaal bewaard', true);
}

async function removeItem(id, li) {
  items = items.filter((i) => i.id !== id);
  saveItems();
  animateOut(li, () => { if (!items.length) emptyEl.style.display = 'block'; });
  if (!supabase) return;
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) setStatus('Offline — wordt lokaal bewaard', true);
}

async function syncItemsFromServer() {
  if (!supabase) return;
  setStatus('Synchroniseren…');
  const { data, error } = await supabase
    .from('items')
    .select('id, text, amount, created_at')
    .order('created_at', { ascending: false });
  if (error) { setStatus('Offline — lokale lijst', true); return; }
  items = data.map((d) => ({ ...d, amount: Math.max(1, d.amount || 1) }));
  saveItems();
  renderList();
  setStatus('');
}

// =========================================================================
//  RECIPES
// =========================================================================
function ingredientSummary(ings) {
  if (!ings.length) return 'Geen ingrediënten';
  return ings.map((i) => (i.amount > 1 ? `${i.amount}× ${i.text}` : i.text)).join(', ');
}

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
  tap.innerHTML = `<span class="r-name"></span><span class="r-sub"></span>`;
  tap.querySelector('.r-name').textContent = recipe.name;
  tap.querySelector('.r-sub').textContent = ingredientSummary(recipe.ingredients);
  tap.addEventListener('click', () => addRecipeToList(recipe));

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'recipe-del';
  del.setAttribute('aria-label', 'Verwijder recept');
  del.textContent = '🗑';
  del.addEventListener('click', () =>
    openConfirm(`"${recipe.name}" verwijderen?`, () => deleteRecipe(recipe.id, li))
  );

  li.appendChild(tap);
  li.appendChild(del);
  return li;
}

function addRecipeToList(recipe) {
  for (const ing of recipe.ingredients) addItem(ing.text, ing.amount);
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
  if (!name) { recipeNameInput.focus(); return; }
  if (!draft.length) { ingredientInput.focus(); return; }

  const recipe = {
    id: uid(),
    name,
    ingredients: draft.map((d) => ({ text: d.text, amount: d.amount })),
    created_at: new Date().toISOString(),
  };
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
  recipes = data.map(normRecipe);
  saveRecipes();
  renderRecipes();
}

// --- Draft ingredient editing (same UX as the shopping list) ---------------
function renderDraft() {
  ingredientListEl.innerHTML = '';
  for (const obj of draft) ingredientListEl.appendChild(draftRow(obj));
}

function draftRow(obj) {
  return makeRow(obj.text, obj.amount, {
    onEdit: (li) => openEdit(obj.text, obj.amount, ({ text, amount }) => {
      obj.text = text; obj.amount = amount;
      li.replaceWith(draftRow(obj));
    }),
    onDelete: (li) => {
      const i = draft.indexOf(obj);
      if (i > -1) draft.splice(i, 1);
      animateOut(li);
    },
  });
}

function addDraftIngredient(text) {
  const value = text.trim();
  if (!value) return;
  const obj = { text: value, amount: 1 };
  draft.push(obj);
  ingredientListEl.appendChild(draftRow(obj));
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
      items.unshift({ id: it.id, text: it.text, amount: Math.max(1, it.amount || 1), created_at: it.created_at });
      saveItems();
      listEl.prepend(itemRow(items[0]));
      emptyEl.style.display = 'none';
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items' }, (payload) => {
      const it = payload.new;
      const idx = items.findIndex((i) => i.id === it.id);
      if (idx === -1) return;
      items[idx] = { ...items[idx], text: it.text, amount: Math.max(1, it.amount || 1) };
      saveItems();
      const li = listEl.querySelector(`.row[data-id="${it.id}"]`);
      const fresh = itemRow(items[idx]);
      fresh.dataset.id = it.id;
      if (li) li.replaceWith(fresh);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'items' }, (payload) => {
      const id = payload.old.id;
      if (!items.some((i) => i.id === id)) return;
      items = items.filter((i) => i.id !== id);
      saveItems();
      const li = listEl.querySelector(`.row[data-id="${id}"]`);
      animateOut(li, () => { if (!items.length) emptyEl.style.display = 'block'; });
    })
    .subscribe();
}

// Register service worker for offline + installability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
