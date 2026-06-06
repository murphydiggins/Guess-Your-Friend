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

## Included

- Create private game rooms
- Upload 2-20 named photos
- Demo board for instant playtesting
- Six-character room codes
- Shareable invite links
- Player-specific URLs for multi-tab testing
- Random secret-person assignment
- Turn-based yes/no question flow
- Answer buttons that advance turns
- Interactive face board with elimination toggles
- Final guess win/loss state
- In-game chat/event history
- Mobile responsive layout

## Prototype Notes

This version stores room state and uploaded photos in `localStorage`, which makes it easy to test without accounts or infrastructure. For production, replace the storage functions in `app.js` with Supabase or Firebase:

- Game rows: code, title, host, status, turn, winner
- Roster rows: game code, name, image storage path, detected attributes
- Player rows: game code, display name, target person id
- Events rows: chat, question, answer, guess
- Realtime channel: subscribe by game code
- Storage bucket: uploaded roster images

The suggested question chips are static/demo-attribute based. Real photo attribute detection should be added through a backend vision service before exposing AI-labeled traits to players.
