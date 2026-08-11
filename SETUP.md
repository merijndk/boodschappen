# Boodschappen — setup

A shared grocery-list PWA. Frontend hosted free on **GitHub Pages**, data stored
in a free **Supabase** database with live sync across all your devices.

The app works right away in **local-only mode** (this device only). Do the two
steps below to turn on the shared database + sync.

---

## Step 1 — Create the database (Supabase, free)

1. Go to <https://supabase.com> → sign in → **New project**.
   Pick any name/password, choose the region closest to you, wait ~2 min.
2. Left sidebar → **SQL Editor** → **New query**.
3. Open [`supabase.sql`](supabase.sql) from this repo, copy all of it, paste, and
   click **Run**. (Creates the `items` + `recipes` tables, opens access, enables
   realtime.) The script is safe to re-run any time — if you set the database up
   before the recipe book existed, just run it again to add the `recipes` table.
4. Left sidebar → **Project Settings** (gear) → **API**. Copy two values:
   - **Project URL** — looks like `https://abcdxyz.supabase.co`
   - **anon public** key — a long `eyJ...` string

## Step 2 — Paste your keys into the app

Edit [`config.js`](config.js) and replace the placeholders:

```js
window.SUPABASE_URL = 'https://abcdxyz.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJ...your-anon-key...';
```

Both values are **safe to commit publicly** — the anon key is meant to live in
the browser. Save the file (and commit/push if it's already on GitHub).

That's it. Reload the app; the status line under the input should stop saying
"local-only". Add an item on one phone and watch it appear on another.

---

## Step 3 — Host it on GitHub Pages

1. Create a repo on GitHub and push this folder to it:

   ```bash
   cd "boodschappen app"
   git init
   git add .
   git commit -m "Boodschappen PWA"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/boodschappen.git
   git push -u origin main
   ```

2. On GitHub: repo → **Settings** → **Pages** → under *Build and deployment*
   set **Source: Deploy from a branch**, **Branch: `main` / `/ (root)`**, Save.
3. Wait ~1 minute. Your app is live at
   `https://YOUR-USERNAME.github.io/boodschappen/` (HTTPS — required for a PWA).

## Step 4 — Add to your home screen

- **iPhone (Safari):** open the URL → Share → **Add to Home Screen**.
- **Android (Chrome):** open the URL → ⋮ menu → **Install app / Add to Home Screen**.

Launches full-screen with its own icon, works offline, and syncs when online.

---

## Notes

- **Open access:** anyone who has your URL can add/remove items. That's the model
  you picked — good enough for groceries. To lock it down later, we can add a
  passphrase or real logins.
- **Offline:** the list is cached on the device, so the app still opens and shows
  your items with no connection. Changes made offline save locally and re-sync
  when you're back online (a change made offline on device A won't reach device B
  until A reconnects).
- **Free tier:** Supabase's free plan is far more than a grocery list needs. Note
  that free projects pause after ~1 week of zero activity; opening the app wakes
  it back up.
