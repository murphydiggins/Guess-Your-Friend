# Supabase Setup

Follow these steps so room codes work for different phones and computers.

## 1. Create Project

Go to Supabase and create a new project.

## 2. Run SQL

Open Supabase SQL Editor, paste the contents of `supabase-schema.sql`, and run it.

That creates one table:

```text
friend_who_games
```

Each room code stores one JSON game state row.

## 3. Copy API Values

Open Project Settings, then API.

Copy:

- Project URL
- anon public key

## 4. Edit Config

Open `supabase-config.js` and replace the empty strings:

```js
window.FRIEND_WHO_SUPABASE = {
  url: "https://YOUR-PROJECT.supabase.co",
  anonKey: "YOUR-ANON-PUBLIC-KEY"
};
```

## 5. Upload To GitHub

Upload and commit these files:

- `index.html`
- `app.js`
- `supabase-config.js`
- `supabase-schema.sql`
- `README.md`
- `SUPABASE_SETUP.md`

## 6. Test

Create a room on one device, then open the public GitHub Pages link on another device and enter the room code.

If the home screen says rooms are saved locally, the config values are missing or wrong. If it says rooms sync through Supabase, shared room codes are enabled.

## Security Note

This prototype allows anonymous read/write access to the game table so party guests can join without accounts. For a public production app, add stronger room permissions, image storage rules, and cleanup for old rooms.
