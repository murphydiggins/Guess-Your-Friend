# Friend Who?

A static web/mobile prototype inspired by the classic face-guessing party game.

## Run

Open `index.html` directly, or serve this folder locally:

```bash
python3 -m http.server 4173
```

Then visit:

```text
http://localhost:4173
```

## Make Room Codes Work Across Devices

The app uses Supabase when `supabase-config.js` has real project values. Without those values, it falls back to local-only browser storage.

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Paste and run everything in `supabase-schema.sql`.
4. In Supabase, open Project Settings, then API.
5. Copy your Project URL and anon public key.
6. Edit `supabase-config.js`:

```js
window.FRIEND_WHO_SUPABASE = {
  url: "https://YOUR-PROJECT.supabase.co",
  anonKey: "YOUR-ANON-PUBLIC-KEY"
};
```

7. Upload the updated files to GitHub and commit them.

After that, room codes and invite links sync through Supabase instead of each player's browser.

## Included

- Create private game rooms
- Upload 2-20 named photos
- Import multiple photos from a mobile camera roll/photo library
- Import many photos at once instead of filling slots one by one
- Demo board for instant playtesting
- Six-character room codes
- Shareable invite links
- Installable mobile web app metadata
- Player-specific URLs for multi-tab testing
- Random secret-person assignment
- Turn-based yes/no question flow
- Top-of-screen question and turn-status banners
- Answer buttons that advance turns
- Interactive face board with elimination toggles
- Swipe-right face elimination on mobile
- Brief lobby instruction card
- Final guess win/loss state
- In-game chat/event history
- Mobile responsive layout
- Supabase-backed room sync when configured

## Prototype Notes

This version stores the whole game state in one Supabase row per room code. That keeps setup simple for a static GitHub Pages app.

For a more production-grade version, split data into separate tables and move images into Supabase Storage:

- Game rows: code, title, host, status, turn, winner
- Roster rows: game code, name, image storage path, detected attributes
- Player rows: game code, display name, target person id
- Events rows: chat, question, answer, guess
- Realtime channel: subscribe by game code
- Storage bucket: uploaded roster images

The suggested question chips are static/demo-attribute based. Real photo attribute detection should be added through a backend vision service before exposing AI-labeled traits to players.
