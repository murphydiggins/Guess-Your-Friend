const STORAGE_KEY = "friend-who.games.v1";
const SESSION_KEY = "friend-who.player.v1";
const MAX_ROSTER = 20;
const MIN_ROSTER = 2;
const PHOTO_MAX_SIZE = 520;
const PHOTO_QUALITY = 0.62;
const SUPABASE_TABLE = "friend_who_games";
const SYNC_POLL_MS = 2000;

const demoPeople = [
  ["Maya", "teal", ["glasses", "curly hair", "blue shirt"]],
  ["Jordan", "rose", ["beard", "hat", "brown hair"]],
  ["Priya", "gold", ["glasses", "black hair", "green shirt"]],
  ["Nate", "mint", ["beard", "red shirt", "short hair"]],
  ["Sam", "coral", ["blonde hair", "earrings", "striped shirt"]],
  ["Avery", "sky", ["hat", "long hair", "yellow shirt"]],
  ["Quinn", "lavender", ["glasses", "gray hoodie", "short hair"]],
  ["Riley", "lime", ["brown hair", "blue shirt", "smiling"]],
  ["Taylor", "peach", ["beard", "black shirt", "short hair"]],
  ["Morgan", "navy", ["curly hair", "earrings", "pink shirt"]],
  ["Casey", "brick", ["blonde hair", "hat", "white shirt"]],
  ["Jamie", "green", ["glasses", "long hair", "orange shirt"]]
];

const colors = {
  teal: "#49aab2",
  rose: "#e6827f",
  gold: "#e8b442",
  mint: "#7bb98f",
  coral: "#ee9472",
  sky: "#88b7dc",
  lavender: "#b39ad9",
  lime: "#a8c66c",
  peach: "#f0b487",
  navy: "#71869b",
  brick: "#c86d58",
  green: "#73ad7a"
};

const state = {
  mode: "home",
  activeCode: null,
  playerId: null,
  draftRoster: [],
  toastTimer: null,
  busy: false,
  games: {},
  backend: "local",
  supabase: null,
  realtimeChannel: null,
  pollTimer: null,
  isPolling: false,
  gameVersions: {}
};

const app = document.querySelector("#app");
const homeTemplate = document.querySelector("#homeTemplate");

init();

async function init() {
  state.draftRoster = makeBlankRoster(MIN_ROSTER);
  await setupBackend();
  const url = new URL(window.location.href);
  const code = normalizeCode(url.searchParams.get("code") || "");
  const urlPlayerId = url.searchParams.get("player");
  const storedPlayerId = urlPlayerId || (code ? null : sessionStorage.getItem(SESSION_KEY));

  if (code) await fetchGame(code);

  if (code && getGame(code)) {
    state.activeCode = code;
    state.playerId = storedPlayerId;
    state.mode = storedPlayerId && getPlayer(getGame(code), storedPlayerId) ? "lobby" : "join";
    subscribeToGame(code);
    startRoomPolling(code);
  }

  document.querySelector("#homeButton").addEventListener("click", () => {
    state.mode = "home";
    state.activeCode = null;
    stopRoomPolling();
    setUrlState(null);
    render();
  });

  document.querySelector("#resetButton").addEventListener("click", () => {
    if (confirm("Clear saved demo games from this browser?")) {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      state.activeCode = null;
      state.playerId = null;
      state.mode = "home";
      stopRoomPolling();
      setUrlState(null);
      render();
      toast("Saved games cleared");
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && state.backend === "local") {
      state.games = loadLocalGames();
      render();
    }
  });

  render();
}

function render() {
  const game = state.activeCode ? getGame(state.activeCode) : null;
  if (state.activeCode && state.backend === "supabase" && !state.pollTimer) {
    startRoomPolling(state.activeCode);
  }

  if (game?.started && state.mode !== "join") {
    state.mode = "game";
  }

  if (state.mode === "create") return renderCreate();
  if (state.mode === "join") return renderJoin();
  if (state.mode === "lobby") return renderLobby();
  if (state.mode === "game") return renderGame();
  renderHome();
}

function renderHome() {
  app.innerHTML = "";
  app.append(homeTemplate.content.cloneNode(true));

  document.querySelector("[data-action='show-create']").addEventListener("click", () => {
    state.mode = "create";
    render();
  });

  document.querySelector("[data-action='show-join']").addEventListener("click", () => {
    state.mode = "join";
    render();
  });

  const games = Object.values(loadGames()).sort((a, b) => b.createdAt - a.createdAt);
  const quickPanel = document.querySelector("#quickPanel");

  quickPanel.innerHTML = `
    <div class="screen-header">
      <div>
        <h2>Saved rooms</h2>
        <p>${state.backend === "supabase" ? "Rooms are synced through Supabase so invite codes work across devices." : "Rooms are saved locally until Supabase is configured."}</p>
      </div>
      <button class="secondary-button" data-action="show-create" type="button">New room</button>
    </div>
    ${
      games.length
        ? `<div class="roster-preview">${games
            .slice(0, 6)
            .map(
              (game) => `
                <button class="roster-card" data-open-game="${game.code}" type="button">
                  <div class="avatar">${game.roster.slice(0, 1).map(personImage).join("")}</div>
                  <strong>${escapeHtml(game.title)} - ${game.code}</strong>
                </button>`
            )
            .join("")}</div>`
        : `<div class="empty-state">No saved rooms yet. Create a custom board or load the demo roster to start fast.</div>`
    }
  `;

  quickPanel.querySelector("[data-action='show-create']").addEventListener("click", () => {
    state.mode = "create";
    render();
  });

  quickPanel.querySelectorAll("[data-open-game]").forEach((button) => {
    button.addEventListener("click", () => openGame(button.dataset.openGame));
  });
}

function renderCreate() {
  app.innerHTML = `
    <section class="screen">
      <div class="screen-header">
        <div>
          <p class="eyebrow">Create private game</p>
          <h2>Build the face board.</h2>
          <p>Import multiple photos at once from your phone, then edit the names before creating the room.</p>
        </div>
        <button class="secondary-button" data-action="home" type="button">Back</button>
      </div>

      <div class="form-grid">
        <form class="panel form-card" id="createForm">
          <div class="field-group">
            <label for="gameTitle">Game name</label>
            <input id="gameTitle" name="gameTitle" autocomplete="off" value="Saturday Face-Off" required />
          </div>
          <div class="field-group">
            <label for="hostName">Your name</label>
            <input id="hostName" name="hostName" autocomplete="name" placeholder="Host player" required />
          </div>

          <div class="upload-toolbar">
            <span class="counter-pill" id="rosterCounter"></span>
            <div class="template-actions">
              <button class="primary-button" data-action="camera-roll" type="button">Import multiple photos</button>
              <button class="secondary-button" data-action="demo-roster" type="button">Use demo board</button>
              <button class="secondary-button" data-action="add-person" type="button">Add person</button>
            </div>
          </div>
          <input class="hidden" id="cameraRollInput" type="file" accept="image/*,.heic,.heif" multiple />

          <div class="people-editor" id="peopleEditor"></div>

          <div class="form-actions" style="margin-top: 16px">
            <button class="primary-button" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Creating..." : "Create room"}</button>
            <button class="ghost-button" data-action="clear-roster" type="button">Clear roster</button>
          </div>
        </form>

        <aside class="panel form-card">
          <h3>Fast setup</h3>
          <ul class="tip-list" style="margin-top: 14px">
            <li>Tap Import multiple photos to choose several camera roll photos in one pass.</li>
            <li>Names are guessed from filenames, so edit any that look weird.</li>
            <li>Two or more players can join with the same code.</li>
            <li>The host starts once everyone is in the lobby.</li>
          </ul>
        </aside>
      </div>
    </section>
  `;

  bindBackButtons();
  renderPeopleEditor();

  document.querySelector("[data-action='camera-roll']").addEventListener("click", () => {
    document.querySelector("#cameraRollInput").click();
  });

  document.querySelector("#cameraRollInput").addEventListener("change", async (event) => {
    await importCameraRollPhotos(Array.from(event.target.files || []));
    event.target.value = "";
  });

  document.querySelector("[data-action='demo-roster']").addEventListener("click", () => {
    state.draftRoster = demoPeople.map(([name, color, tags], index) => ({
      id: makeId("person"),
      name,
      photo: avatarSvg(name, color, index),
      tags
    }));
    renderPeopleEditor();
  });

  document.querySelector("[data-action='add-person']").addEventListener("click", () => {
    if (state.draftRoster.length >= MAX_ROSTER) {
      toast("Maximum board size is 20 people");
      return;
    }
    state.draftRoster.push(blankPerson());
    renderPeopleEditor();
  });

  document.querySelector("[data-action='clear-roster']").addEventListener("click", () => {
    state.draftRoster = makeBlankRoster(MIN_ROSTER);
    renderPeopleEditor();
  });

  document.querySelector("#createForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await createGame(new FormData(event.currentTarget));
  });
}

function renderPeopleEditor() {
  const editor = document.querySelector("#peopleEditor");
  const counter = document.querySelector("#rosterCounter");
  if (!editor || !counter) return;

  const readyCount = validRoster(state.draftRoster).length;
  counter.textContent = `${readyCount}/${MIN_ROSTER} ready - ${state.draftRoster.length}/${MAX_ROSTER} slots`;

  editor.innerHTML = state.draftRoster
    .map(
      (person, index) => `
        <div class="person-row" data-person-row="${person.id}">
          <label class="photo-slot" title="Upload photo">
            ${person.photo ? `<img src="${person.photo}" alt="" />` : `<span>Photo</span>`}
            <input data-photo-index="${index}" type="file" accept="image/*,.heic,.heif" multiple aria-label="Upload photo for person ${index + 1}" />
          </label>
          <input data-name-index="${index}" value="${escapeAttr(person.name)}" placeholder="Person ${index + 1} name" aria-label="Person ${index + 1} name" />
          <button class="small-icon-button" data-remove-index="${index}" type="button" title="Remove person" aria-label="Remove person">x</button>
        </div>`
    )
    .join("");

  editor.querySelectorAll("[data-name-index]").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.draftRoster[Number(event.target.dataset.nameIndex)].name = event.target.value;
      const ready = validRoster(state.draftRoster).length;
      counter.textContent = `${ready}/${MIN_ROSTER} ready - ${state.draftRoster.length}/${MAX_ROSTER} slots`;
    });
  });

  editor.querySelectorAll("[data-photo-index]").forEach((input) => {
    input.addEventListener("change", async (event) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;

      if (files.length > 1) {
        await importCameraRollPhotos(files);
        event.target.value = "";
        return;
      }

      const file = files[0];
      try {
        toast("Optimizing photo...");
        const dataUrl = await compressImage(file);
        state.draftRoster[Number(event.target.dataset.photoIndex)].photo = dataUrl;
        renderPeopleEditor();
      } catch {
        toast("Could not load that photo");
      }
      event.target.value = "";
    });
  });

  editor.querySelectorAll("[data-remove-index]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.draftRoster.length <= MIN_ROSTER) {
        toast("Keep at least 2 slots");
        return;
      }
      state.draftRoster.splice(Number(button.dataset.removeIndex), 1);
      renderPeopleEditor();
    });
  });
}

async function importCameraRollPhotos(files) {
  const imageFiles = files.filter(isLikelyImageFile);
  if (!imageFiles.length) {
    toast("Choose photos from your camera roll");
    return;
  }

  const existingPeople = state.draftRoster.filter((person) => person.photo || person.name.trim());
  const availableSlots = MAX_ROSTER - existingPeople.length;
  const selected = imageFiles.slice(0, availableSlots);
  if (!selected.length) {
    toast("Maximum board size is 20 people");
    return;
  }

  toast(`Importing ${selected.length} photo${selected.length === 1 ? "" : "s"}...`);

  const importedPeople = [];
  let failedCount = 0;

  for (const file of selected) {
    try {
      const dataUrl = await compressImage(file);
      importedPeople.push({
        id: makeId("person"),
        name: nameFromFile(file.name) || `Person ${existingPeople.length + importedPeople.length + 1}`,
        photo: dataUrl,
        tags: []
      });
    } catch {
      failedCount += 1;
    }
  }

  state.draftRoster = [...existingPeople, ...importedPeople];
  while (state.draftRoster.length < MIN_ROSTER) {
    state.draftRoster.push(blankPerson());
  }

  renderPeopleEditor();
  if (!importedPeople.length) {
    toast("Could not import those photos");
  } else if (failedCount) {
    toast(`Imported ${importedPeople.length}; ${failedCount} failed`);
  } else if (imageFiles.length > selected.length) {
    toast(`Imported ${selected.length}; board limit is 20`);
  } else {
    toast(`Imported ${importedPeople.length} photo${importedPeople.length === 1 ? "" : "s"}`);
  }
}

function nameFromFile(filename) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  if (!base) return "";
  return base
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function isLikelyImageFile(file) {
  return file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name) || !file.type;
}

function renderJoin() {
  const codeFromUrl = state.activeCode || normalizeCode(new URL(window.location.href).searchParams.get("code") || "");
  app.innerHTML = `
    <section class="screen">
      <div class="screen-header">
        <div>
          <p class="eyebrow">Join private game</p>
          <h2>Enter the room code.</h2>
          <p>Use the invite link or paste the six-character code from the host.</p>
        </div>
        <button class="secondary-button" data-action="home" type="button">Back</button>
      </div>

      <form class="panel form-card" id="joinForm" style="max-width: 620px">
        <div class="field-group">
          <label for="joinCode">Room code</label>
          <input id="joinCode" name="joinCode" value="${escapeAttr(codeFromUrl)}" autocomplete="off" maxlength="6" required />
        </div>
        <div class="field-group">
          <label for="playerName">Your name</label>
          <input id="playerName" name="playerName" autocomplete="name" required />
        </div>
        <div class="form-actions">
          <button class="primary-button" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Joining..." : "Join lobby"}</button>
        </div>
      </form>
    </section>
  `;

  bindBackButtons();
  document.querySelector("#joinForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await joinGame(new FormData(event.currentTarget));
  });
}

function renderLobby() {
  const game = getGame(state.activeCode);
  if (!game) {
    state.mode = "join";
    return render();
  }

  const player = getPlayer(game, state.playerId);
  if (!player) {
    state.mode = "join";
    return render();
  }

  const isHost = game.hostId === player.id;
  const invite = makeInviteLink(game.code);

  app.innerHTML = `
    <section class="screen">
      <div class="screen-header">
        <div>
          <p class="eyebrow">Lobby</p>
          <h2>${escapeHtml(game.title)}</h2>
          <p>${game.roster.length} people on the board - ${game.players.length} players joined</p>
        </div>
        <span class="status-pill">${isHost ? "Host" : "Guest"} - ${escapeHtml(player.name)}</span>
      </div>

      <div class="lobby-grid">
        <div class="panel form-card">
          <div class="invite-box">
            <label>Game code</label>
            <div class="code-row">
              <span class="game-code">${game.code}</span>
              <button class="secondary-button" data-action="copy-code" type="button">Copy code</button>
              <button class="secondary-button" data-action="copy-link" type="button">Copy invite</button>
            </div>
            <input value="${escapeAttr(invite)}" readonly aria-label="Invite link" />
          </div>

          <div class="lobby-actions" style="margin-top: 16px">
            ${
              isHost
                ? `<button class="primary-button" data-action="start-game" type="button" ${game.players.length < 2 ? "disabled" : ""}>Start game</button>`
                : `<span class="counter-pill">Waiting for host</span>`
            }
            <button class="secondary-button" data-action="join-another" type="button">Join as another player</button>
          </div>

          <div class="instruction-card">
            <h3>How to play</h3>
            <ol>
              <li>Share the code or invite link with the other player.</li>
              <li>When everyone has joined, the host taps Start game.</li>
              <li>Each player gets a secret person from this board.</li>
              <li>Take turns asking one yes/no question at a time.</li>
              <li>Swipe right or tap faces to put down people you eliminated.</li>
              <li>Use Final guess only when you are sure.</li>
            </ol>
          </div>

          <h3 style="margin-top: 22px">Players</h3>
          <div class="player-list" style="margin-top: 10px">
            ${game.players
              .map(
                (item) => `
                  <div class="player-item">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span class="status-pill">${item.id === game.hostId ? "Host" : "Ready"}</span>
                  </div>`
              )
              .join("")}
          </div>
        </div>

        <div class="panel form-card">
          <h3>Board preview</h3>
          <div class="roster-preview" style="margin-top: 12px">
            ${game.roster.map(renderRosterCard).join("")}
          </div>
        </div>
      </div>
    </section>
  `;

  document.querySelector("[data-action='copy-code']").addEventListener("click", () => copyText(game.code));
  document.querySelector("[data-action='copy-link']").addEventListener("click", () => copyText(invite));
  document.querySelector("[data-action='join-another']").addEventListener("click", () => {
    state.playerId = null;
    sessionStorage.removeItem(SESSION_KEY);
    setUrlState(game.code);
    state.mode = "join";
    render();
  });

  const startButton = document.querySelector("[data-action='start-game']");
  if (startButton) {
    startButton.addEventListener("click", () => startGame(game.code));
  }
}

function renderGame() {
  const game = getGame(state.activeCode);
  if (!game) {
    state.mode = "home";
    return render();
  }

  const player = getPlayer(game, state.playerId);
  if (!player) {
    state.mode = "join";
    return render();
  }

  const target = game.roster.find((person) => person.id === game.targets[player.id]);
  const eliminated = new Set(game.eliminations[player.id] || []);
  const currentPlayer = getPlayer(game, game.turnPlayerId);
  const isMyTurn = game.turnPlayerId === player.id;
  const opponent = firstOpponent(game, player.id);
  const pending = game.pendingQuestion;
  const canAsk = isMyTurn && !pending && !game.winnerId;
  const canAnswer = pending && pending.from !== player.id && !game.winnerId;
  const winner = game.winnerId ? getPlayer(game, game.winnerId) : null;
  const status = gameStatusText(game, player, currentPlayer, pending, winner);
  const latestAnswer = latestAnswerEvent(game);

  app.innerHTML = `
    <section class="screen">
      <div class="screen-header">
        <div>
          <p class="eyebrow">Room ${game.code}</p>
          <h2>${escapeHtml(game.title)}</h2>
          <p>${currentPlayer ? `Turn: ${escapeHtml(currentPlayer.name)}` : "Turn order loading"}</p>
        </div>
        <span class="turn-pill ${isMyTurn ? "active" : ""}">${isMyTurn ? "Your turn" : "Opponent turn"}</span>
      </div>

      <div class="turn-status ${status.kind}">
        <strong>${escapeHtml(status.title)}</strong>
        <span>${escapeHtml(status.body)}</span>
      </div>

      ${
        pending
          ? `<div class="top-question-banner">
              <div>
                <small>${escapeHtml(getPlayer(game, pending.from)?.name || "Player")} asked</small>
                <strong>${escapeHtml(pending.text)}</strong>
              </div>
              ${
                canAnswer
                  ? `<div class="chat-actions">
                      <button class="primary-button" data-answer="Yes" type="button">Yes</button>
                      <button class="secondary-button" data-answer="No" type="button">No</button>
                    </div>`
                  : `<span class="counter-pill">${pending.from === player.id ? "Waiting for answer" : "Question pending"}</span>`
              }
            </div>`
          : latestAnswer
            ? `<div class="top-question-banner answered">
                <div>
                  <small>${escapeHtml(latestAnswer.playerName)} answered ${escapeHtml(latestAnswer.answer)}</small>
                  <strong>${escapeHtml(latestAnswer.questionText)}</strong>
                </div>
                <span class="answer-badge">${escapeHtml(latestAnswer.answer)}</span>
              </div>`
          : ""
      }

      ${
        winner
          ? `<div class="result-banner" style="margin-bottom: 18px">
              <h3>${escapeHtml(winner.name)} wins!</h3>
              <div class="game-actions">
                <button class="primary-button" data-action="rematch" type="button">Rematch</button>
                <button class="secondary-button" data-action="back-lobby" type="button">Lobby</button>
              </div>
            </div>`
          : ""
      }

      <div class="game-layout">
        <div class="board-shell">
          <div class="game-meta">
            <div class="target-card">
              <div class="target-avatar">${target ? personImage(target) : ""}</div>
              <div>
                <h3>Your secret person</h3>
                <p>${target ? escapeHtml(target.name) : "Assigned when the game starts."}</p>
              </div>
            </div>
            <button class="secondary-button" data-action="clear-eliminations" type="button">Lift all tiles</button>
          </div>

          <div class="board-grid">
            ${game.roster
              .map(
                (person) => `
                  <button class="face-card ${eliminated.has(person.id) ? "eliminated" : ""}" data-face-id="${person.id}" type="button" aria-pressed="${eliminated.has(person.id)}">
                    <div class="avatar">${personImage(person)}</div>
                    <span class="swipe-hint">Swipe right to put down</span>
                    <span class="face-name">${escapeHtml(person.name)}</span>
                  </button>`
              )
              .join("")}
          </div>
        </div>

        <aside class="side-panel">
          <div class="panel form-card">
            <h3>Ask</h3>
            <div class="question-bank" style="margin-top: 10px">
              ${questionSuggestions(game.roster).map((question) => `<button class="question-chip" data-question="${escapeAttr(question)}" type="button">${escapeHtml(question)}</button>`).join("")}
            </div>
            <form id="questionForm" style="margin-top: 12px">
              <textarea name="question" placeholder="Ask a yes/no question" ${canAsk ? "" : "disabled"}></textarea>
              <div class="chat-actions" style="margin-top: 8px">
                <button class="primary-button" type="submit" ${canAsk ? "" : "disabled"}>Send question</button>
              </div>
            </form>
            ${
              pending
                ? `<div class="empty-state" style="margin-top: 12px">
                    <strong>${escapeHtml(getPlayer(game, pending.from)?.name || "Player")} asked:</strong>
                    <div>${escapeHtml(pending.text)}</div>
                    ${
                      canAnswer
                        ? `<div class="chat-actions" style="margin-top: 10px">
                            <button class="primary-button" data-answer="Yes" type="button">Yes</button>
                            <button class="secondary-button" data-answer="No" type="button">No</button>
                          </div>`
                        : ""
                    }
                  </div>`
                : ""
            }
          </div>

          <div class="panel form-card">
            <h3>Guess</h3>
            <form id="guessForm" style="margin-top: 10px">
              <select name="guess" ${isMyTurn && !pending && !game.winnerId ? "" : "disabled"}>
                ${game.roster.map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`).join("")}
              </select>
              <button class="danger-button" style="width: 100%; margin-top: 8px" type="submit" ${isMyTurn && !pending && !game.winnerId ? "" : "disabled"}>Final guess</button>
            </form>
          </div>

          <div class="panel form-card">
            <h3>Chat</h3>
            <div class="chat-log" style="margin-top: 10px">
              ${
                game.events.length
                  ? game.events
                      .slice(-12)
                      .map(
                        (event) => `
                          <div class="chat-message ${event.playerId === player.id ? "mine" : ""}">
                            <small>${escapeHtml(event.playerName)} - ${event.label}</small>
                            <span>${escapeHtml(event.text)}</span>
                          </div>`
                      )
                      .join("")
                  : `<div class="empty-state">No questions yet.</div>`
              }
            </div>
            <form id="chatForm" style="margin-top: 10px">
              <input name="message" placeholder="Table talk" autocomplete="off" />
              <button class="secondary-button" style="width: 100%; margin-top: 8px" type="submit">Send chat</button>
            </form>
          </div>
        </aside>
      </div>
    </section>
  `;

  document.querySelectorAll("[data-face-id]").forEach((button) => {
    bindFaceCardControls(button, game.code, player.id);
  });

  document.querySelector("[data-action='clear-eliminations']").addEventListener("click", () => {
    mutateGame(game.code, (draft) => {
      draft.eliminations[player.id] = [];
    });
  });

  document.querySelectorAll("[data-question]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector("#questionForm textarea");
      input.value = button.dataset.question;
      input.focus();
    });
  });

  document.querySelector("#questionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = new FormData(event.currentTarget).get("question").trim();
    if (text) sendQuestion(game.code, player.id, text);
  });

  document.querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", () => answerQuestion(game.code, player.id, button.dataset.answer));
  });

  document.querySelector("#guessForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const guess = new FormData(event.currentTarget).get("guess");
    makeGuess(game.code, player.id, guess);
  });

  document.querySelector("#chatForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const message = new FormData(event.currentTarget).get("message").trim();
    if (message) sendChat(game.code, player.id, message);
  });

  document.querySelector("[data-action='rematch']")?.addEventListener("click", () => rematch(game.code));
  document.querySelector("[data-action='back-lobby']")?.addEventListener("click", () => {
    state.mode = "lobby";
    render();
  });
}

function gameStatusText(game, player, currentPlayer, pending, winner) {
  if (winner) {
    return {
      kind: winner.id === player.id ? "won" : "lost",
      title: winner.id === player.id ? "You won!" : `${winner.name} won`,
      body: "Start a rematch from the banner below."
    };
  }

  if (pending?.from === player.id) {
    return {
      kind: "waiting",
      title: "Waiting on their answer",
      body: "Your question is on the table. They need to tap Yes or No."
    };
  }

  if (pending && pending.from !== player.id) {
    return {
      kind: "answer",
      title: "Answer the question",
      body: "Tap Yes or No so the turn can move on."
    };
  }

  if (game.turnPlayerId === player.id) {
    return {
      kind: "active",
      title: "Your turn to ask",
      body: "Ask one yes/no question, or make a final guess if you are ready."
    };
  }

  return {
    kind: "waiting",
    title: "Waiting on the other player",
    body: `${currentPlayer?.name || "The other player"} is choosing a question. Use this time to put down eliminated faces.`
  };
}

function bindFaceCardControls(button, code, playerId) {
  let startX = 0;
  let startY = 0;
  let swiped = false;

  button.addEventListener("click", () => {
    if (swiped) {
      swiped = false;
      return;
    }
    toggleEliminated(code, playerId, button.dataset.faceId);
  });

  button.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      swiped = false;
      button.style.setProperty("--swipe-x", "0px");
      button.classList.add("swiping");
    },
    { passive: true }
  );

  button.addEventListener(
    "touchmove",
    (event) => {
      const touch = event.touches[0];
      const deltaX = Math.max(0, touch.clientX - startX);
      const deltaY = Math.abs(touch.clientY - startY);
      if (deltaX > 8 && deltaX > deltaY) {
        event.preventDefault();
        button.style.setProperty("--swipe-x", `${Math.min(deltaX, 86)}px`);
      }
    },
    { passive: false }
  );

  button.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = Math.abs(touch.clientY - startY);
    button.classList.remove("swiping");
    button.style.setProperty("--swipe-x", "0px");

    if (deltaX > 72 && deltaX > deltaY * 1.3) {
      swiped = true;
      if (button.getAttribute("aria-pressed") !== "true") {
        toggleEliminated(code, playerId, button.dataset.faceId);
      }
      setTimeout(() => {
        swiped = false;
      }, 350);
    }
  });
}

async function createGame(formData) {
  const roster = validRoster(state.draftRoster);
  if (roster.length < MIN_ROSTER) {
    toast("Add at least 2 named photos");
    return;
  }

  const hostName = String(formData.get("hostName") || "").trim();
  const title = String(formData.get("gameTitle") || "").trim();
  if (!hostName || !title) {
    toast("Game name and host name are required");
    return;
  }

  if (state.busy) return;
  state.busy = true;
  renderCreate();

  const playerId = makeId("player");
  const code = uniqueCode();
  const game = {
    code,
    title,
    hostId: playerId,
    createdAt: Date.now(),
    roster,
    players: [{ id: playerId, name: hostName, joinedAt: Date.now(), wins: 0 }],
    started: false,
    turnPlayerId: null,
    targets: {},
    eliminations: { [playerId]: [] },
    pendingQuestion: null,
    winnerId: null,
    events: []
  };

  try {
    await saveGame(game);
  } catch (error) {
    console.error(error);
    state.busy = false;
    renderCreate();
    toast(state.backend === "supabase" ? syncErrorMessage(error, "Could not save room to Supabase") : "Photos are too large. Try fewer photos or smaller images.");
    return;
  }

  state.busy = false;
  state.activeCode = code;
  state.playerId = playerId;
  state.mode = "lobby";
  sessionStorage.setItem(SESSION_KEY, playerId);
  setUrlState(code, playerId);
  subscribeToGame(code);
  startRoomPolling(code);
  render();
}

async function joinGame(formData) {
  const code = normalizeCode(formData.get("joinCode"));
  const name = String(formData.get("playerName") || "").trim();
  if (!name) {
    toast("Enter your player name");
    return;
  }

  if (state.busy) return;
  state.busy = true;
  renderJoin();

  const game = await fetchGame(code);

  if (!game) {
    state.busy = false;
    renderJoin();
    toast("Room code not found");
    return;
  }

  if (game.started) {
    state.busy = false;
    renderJoin();
    toast("That game already started");
    return;
  }

  const playerId = makeId("player");
  try {
    await mutateGame(
      code,
      (draft) => {
        draft.players.push({ id: playerId, name, joinedAt: Date.now(), wins: 0 });
        draft.eliminations[playerId] = [];
      },
      { throwOnError: true }
    );
  } catch (error) {
    console.error(error);
    state.busy = false;
    renderJoin();
    toast(syncErrorMessage(error, "Could not join room"));
    return;
  }

  state.busy = false;
  state.activeCode = code;
  state.playerId = playerId;
  state.mode = "lobby";
  sessionStorage.setItem(SESSION_KEY, playerId);
  setUrlState(code, playerId);
  subscribeToGame(code);
  startRoomPolling(code);
  render();
}

async function startGame(code) {
  const game = await fetchGame(code);
  if (!game || game.players.length < 2) {
    toast("Need at least two players");
    return;
  }

  try {
    await mutateGame(
      code,
      (draft) => {
        const shuffled = shuffle([...draft.roster]);
        draft.players.forEach((player, index) => {
          draft.targets[player.id] = shuffled[index % shuffled.length].id;
          draft.eliminations[player.id] = [];
        });
        draft.started = true;
        draft.turnPlayerId = draft.players[0].id;
        draft.pendingQuestion = null;
        draft.winnerId = null;
        draft.events.unshift(systemEvent(draft.players[0], "Game started", `${draft.players[0].name} asks first.`));
      },
      { throwOnError: true }
    );
  } catch (error) {
    console.error(error);
    toast(syncErrorMessage(error, "Could not start game"));
    return;
  }

  state.mode = "game";
  render();
}

async function sendQuestion(code, playerId, text) {
  await mutateGame(code, (draft) => {
    if (draft.turnPlayerId !== playerId || draft.pendingQuestion || draft.winnerId) return;
    const player = getPlayer(draft, playerId);
    const id = makeId("question");
    draft.pendingQuestion = { id, from: playerId, text, at: Date.now() };
    draft.events.push({
      id,
      playerId,
      playerName: player.name,
      label: "Question",
      text,
      at: Date.now()
    });
  });
}

async function answerQuestion(code, playerId, answer) {
  await mutateGame(code, (draft) => {
    if (!draft.pendingQuestion || draft.pendingQuestion.from === playerId || draft.winnerId) return;
    const player = getPlayer(draft, playerId);
    const question = draft.pendingQuestion;
    draft.events.push({
      id: makeId("answer"),
      playerId,
      playerName: player.name,
      label: "Answer",
      text: answer,
      questionText: question.text,
      questionFrom: question.from,
      answer,
      at: Date.now()
    });
    draft.pendingQuestion = null;
    draft.turnPlayerId = nextPlayerId(draft, draft.turnPlayerId);
  });
}

async function sendChat(code, playerId, text) {
  await mutateGame(code, (draft) => {
    const player = getPlayer(draft, playerId);
    draft.events.push({
      id: makeId("chat"),
      playerId,
      playerName: player.name,
      label: "Chat",
      text,
      at: Date.now()
    });
  });
}

async function makeGuess(code, playerId, guessPersonId) {
  await mutateGame(code, (draft) => {
    if (draft.turnPlayerId !== playerId || draft.pendingQuestion || draft.winnerId) return;
    const player = getPlayer(draft, playerId);
    const opponent = firstOpponent(draft, playerId);
    if (!opponent) return;

    const guessed = draft.roster.find((person) => person.id === guessPersonId);
    const correct = draft.targets[opponent.id] === guessPersonId;
    draft.winnerId = correct ? playerId : opponent.id;
    const winner = getPlayer(draft, draft.winnerId);
    winner.wins = (winner.wins || 0) + 1;
    draft.events.push({
      id: makeId("guess"),
      playerId,
      playerName: player.name,
      label: "Guess",
      text: `${guessed?.name || "Someone"} was ${correct ? "correct" : "wrong"}.`,
      at: Date.now()
    });
  });
}

async function rematch(code) {
  await mutateGame(code, (draft) => {
    const shuffled = shuffle([...draft.roster]);
    draft.players.forEach((player, index) => {
      draft.targets[player.id] = shuffled[index % shuffled.length].id;
      draft.eliminations[player.id] = [];
    });
    draft.started = true;
    draft.turnPlayerId = draft.players[0].id;
    draft.pendingQuestion = null;
    draft.winnerId = null;
    draft.events = [systemEvent(draft.players[0], "Rematch", `${draft.players[0].name} asks first.`)];
  });
}

async function toggleEliminated(code, playerId, personId) {
  await mutateGame(code, (draft) => {
    const existing = new Set(draft.eliminations[playerId] || []);
    if (existing.has(personId)) existing.delete(personId);
    else existing.add(personId);
    draft.eliminations[playerId] = [...existing];
  });
}

async function openGame(code) {
  const game = await fetchGame(code);
  if (!game) {
    toast("Room code not found");
    return;
  }
  state.activeCode = code;
  setUrlState(code);
  const sessionPlayer = sessionStorage.getItem(SESSION_KEY);
  state.playerId = sessionPlayer && getPlayer(game, sessionPlayer) ? sessionPlayer : null;
  if (state.playerId) setUrlState(code, state.playerId);
  state.mode = state.playerId ? (game.started ? "game" : "lobby") : "join";
  subscribeToGame(code);
  startRoomPolling(code);
  render();
}

function validRoster(roster) {
  return roster
    .filter((person) => person.name.trim() && person.photo)
    .slice(0, MAX_ROSTER)
    .map((person) => ({
      id: person.id || makeId("person"),
      name: person.name.trim(),
      photo: person.photo,
      tags: person.tags || []
    }));
}

function blankPerson() {
  return { id: makeId("person"), name: "", photo: "", tags: [] };
}

function makeBlankRoster(count) {
  return Array.from({ length: count }, blankPerson);
}

function renderRosterCard(person) {
  return `
    <div class="roster-card">
      <div class="avatar">${personImage(person)}</div>
      <strong>${escapeHtml(person.name)}</strong>
    </div>
  `;
}

function personImage(person) {
  return `<img src="${person.photo}" alt="${escapeAttr(person.name)}" />`;
}

function questionSuggestions(roster) {
  const tags = new Set(roster.flatMap((person) => person.tags || []));
  const suggestions = [
    "Does your person wear glasses?",
    "Does your person have a hat?",
    "Does your person have facial hair?",
    "Does your person have blonde hair?",
    "Is your person wearing a blue shirt?",
    "Does your person have long hair?"
  ];

  if (tags.has("beard")) suggestions.unshift("Does your person have a beard?");
  if (tags.has("curly hair")) suggestions.unshift("Does your person have curly hair?");
  if (tags.has("earrings")) suggestions.unshift("Does your person wear earrings?");

  return [...new Set(suggestions)].slice(0, 7);
}

function latestAnswerEvent(game) {
  const events = game.events || [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.label !== "Answer") continue;
    const priorQuestion = [...events.slice(0, index)].reverse().find((item) => item.label === "Question");
    return {
      playerName: event.playerName || "Player",
      answer: event.answer || event.text || "",
      questionText: event.questionText || priorQuestion?.text || "Previous question"
    };
  }
  return null;
}

function makeInviteLink(code) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("code", code);
  return url.toString();
}

function setUrlState(code, playerId = null) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("code", code);
  else url.searchParams.delete("code");
  if (playerId) url.searchParams.set("player", playerId);
  else url.searchParams.delete("player");
  window.history.replaceState({}, "", url);
}

async function setupBackend() {
  const config = window.FRIEND_WHO_SUPABASE || {};
  const hasConfig = config.url && config.anonKey && !config.url.includes("YOUR_") && !config.anonKey.includes("YOUR_");
  if (!hasConfig || !window.supabase?.createClient) {
    state.backend = "local";
    state.games = loadLocalGames();
    return;
  }

  try {
    state.supabase = window.supabase.createClient(config.url, config.anonKey);
    state.backend = "supabase";
  } catch (error) {
    console.error(error);
    state.backend = "local";
    state.games = loadLocalGames();
    toast("Supabase unavailable; using local mode");
  }
}

async function fetchGame(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  if (state.backend !== "supabase") return getGame(normalized);

  const { data, error } = await state.supabase
    .from(SUPABASE_TABLE)
    .select("game_state, updated_at")
    .eq("code", normalized)
    .maybeSingle();

  if (error) {
    console.error(error);
    toast("Could not check room code");
    return null;
  }

  if (!data?.game_state) {
    delete state.games[normalized];
    return null;
  }

  state.games[normalized] = normalizeGameState(data.game_state);
  state.gameVersions[normalized] = data.updated_at || "";
  return state.games[normalized];
}

async function fetchGameVersion(code) {
  const normalized = normalizeCode(code);
  if (!normalized || state.backend !== "supabase") return "";

  const { data, error } = await state.supabase
    .from(SUPABASE_TABLE)
    .select("updated_at")
    .eq("code", normalized)
    .maybeSingle();

  if (error) {
    console.error(error);
    return state.gameVersions[normalized] || "";
  }

  return data?.updated_at || "";
}

async function saveGame(game) {
  state.games[game.code] = normalizeGameState(game);
  if (state.backend !== "supabase") {
    saveLocalGames(state.games);
    return;
  }

  const updatedAt = new Date().toISOString();
  const { error } = await state.supabase.from(SUPABASE_TABLE).upsert({
    code: game.code,
    game_state: game,
    updated_at: updatedAt
  });

  if (error) throw error;
  state.gameVersions[game.code] = updatedAt;
}

function subscribeToGame(code) {
  if (state.backend !== "supabase" || !code) return;
  if (state.realtimeChannel) {
    state.supabase.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }

  state.realtimeChannel = state.supabase
    .channel(`friend-who-${code}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: SUPABASE_TABLE,
        filter: `code=eq.${code}`
      },
      (payload) => {
        if (!payload.new?.game_state) return;
        const before = gameSignature(state.games[code], state.playerId);
        state.games[code] = normalizeGameState(payload.new.game_state);
        state.gameVersions[code] = payload.new.updated_at || state.gameVersions[code] || "";
        const after = gameSignature(state.games[code], state.playerId);
        if (state.activeCode === code && before !== after) render();
      }
    )
    .subscribe();
}

function startRoomPolling(code) {
  const normalized = normalizeCode(code);
  if (state.backend !== "supabase" || !normalized) return;
  stopRoomPolling();
  state.pollTimer = window.setInterval(() => pollRoom(normalized), SYNC_POLL_MS);
  pollRoom(normalized);
}

function stopRoomPolling() {
  if (state.pollTimer) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function pollRoom(code) {
  if (state.isPolling || state.backend !== "supabase" || state.activeCode !== code) return;
  state.isPolling = true;
  const beforeVersion = state.gameVersions[code] || "";
  const before = gameSignature(getGame(code), state.playerId);
  let game = getGame(code);
  try {
    const latestVersion = await fetchGameVersion(code);
    if (!latestVersion || latestVersion === beforeVersion) return;
    game = await fetchGame(code);
  } finally {
    state.isPolling = false;
  }
  const afterVersion = state.gameVersions[code] || "";
  const after = gameSignature(game, state.playerId);

  if ((beforeVersion !== afterVersion || before !== after) && state.activeCode === code) {
    render();
  }
}

function gameSignature(game, playerId = null) {
  if (!game) return "";
  return JSON.stringify({
    players: game.players?.length || 0,
    started: game.started,
    turnPlayerId: game.turnPlayerId,
    targets: game.targets,
    ownEliminations: playerId ? game.eliminations?.[playerId] || [] : game.eliminations,
    pendingQuestion: game.pendingQuestion,
    winnerId: game.winnerId,
    events: game.events?.length || 0,
    lastEvent: game.events?.at?.(-1)?.id || ""
  });
}

function normalizeGameState(game) {
  return {
    ...game,
    players: game.players || [],
    roster: game.roster || [],
    targets: game.targets || {},
    eliminations: game.eliminations || {},
    events: game.events || []
  };
}

function loadLocalGames() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveLocalGames(games) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

function loadGames() {
  return state.games;
}

function getGame(code) {
  return state.games[normalizeCode(code)];
}

async function mutateGame(code, mutator, options = {}) {
  const normalized = normalizeCode(code);
  const game = state.backend === "supabase" ? await fetchGame(normalized) : getGame(normalized);
  if (!game) return;
  mutator(game);
  try {
    await saveGame(game);
    render();
  } catch (error) {
    toast(state.backend === "supabase" ? syncErrorMessage(error, "Could not sync the latest move") : "Could not save the latest move");
    if (options.throwOnError) throw error;
  }
}

function syncErrorMessage(error, fallback) {
  const message = String(error?.message || error?.details || "");
  if (/row-level security|policy/i.test(message)) return "Supabase blocked saving. Run the setup SQL again.";
  if (/too large|payload|request entity/i.test(message)) return "Photos are still too large. Try fewer photos.";
  return fallback;
}

function uniqueCode() {
  const games = loadGames();
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  } while (games[code]);
  return code;
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function getPlayer(game, playerId) {
  return game?.players.find((player) => player.id === playerId);
}

function firstOpponent(game, playerId) {
  return game.players.find((player) => player.id !== playerId);
}

function nextPlayerId(game, currentId) {
  const index = game.players.findIndex((player) => player.id === currentId);
  return game.players[(index + 1) % game.players.length].id;
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function systemEvent(player, label, text) {
  return {
    id: makeId("system"),
    playerId: player.id,
    playerName: "Room",
    label,
    text,
    at: Date.now()
  };
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!isLikelyImageFile(file)) {
      reject(new Error("Not an image"));
      return;
    }

    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, PHOTO_MAX_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch {
    toast(text);
  }
}

function toast(message) {
  clearTimeout(state.toastTimer);
  document.querySelector(".toast")?.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.append(node);
  state.toastTimer = setTimeout(() => node.remove(), 2200);
}

function bindBackButtons() {
  document.querySelectorAll("[data-action='home']").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = "home";
      state.activeCode = null;
      stopRoomPolling();
      setUrlState(null);
      render();
    });
  });
}

function avatarSvg(name, colorKey, index) {
  const bg = colors[colorKey] || colors.teal;
  const hairColors = ["#2c211f", "#6c412c", "#d7a84f", "#1f2b2f"];
  const shirtColors = ["#f7f4ee", "#0e7c86", "#d95f59", "#e6a532", "#1d2528"];
  const hair = hairColors[index % hairColors.length];
  const shirt = shirtColors[index % shirtColors.length];
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const glasses = index % 3 === 0;
  const beard = index % 4 === 1;
  const hat = index % 5 === 0;
  const earrings = index % 5 === 4;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220">
      <rect width="220" height="220" fill="${bg}"/>
      <circle cx="110" cy="96" r="54" fill="#ffd9b3"/>
      <path d="M56 96c7-42 31-64 73-56 28 5 43 24 47 56-24-23-63-30-120 0z" fill="${hair}"/>
      ${hat ? `<path d="M54 54h92c16 0 30 13 30 30H76c-12 0-22-10-22-22v-8z" fill="#1d2528"/><rect x="48" y="80" width="128" height="15" rx="7" fill="#e6a532"/>` : ""}
      <circle cx="88" cy="98" r="5" fill="#1d2528"/>
      <circle cx="132" cy="98" r="5" fill="#1d2528"/>
      ${glasses ? `<circle cx="88" cy="98" r="16" fill="none" stroke="#1d2528" stroke-width="5"/><circle cx="132" cy="98" r="16" fill="none" stroke="#1d2528" stroke-width="5"/><path d="M104 98h12" stroke="#1d2528" stroke-width="5"/>` : ""}
      <path d="M93 124c13 10 29 10 42 0" fill="none" stroke="#1d2528" stroke-width="6" stroke-linecap="round"/>
      ${beard ? `<path d="M75 122c16 38 64 38 80 0-11 47-69 48-80 0z" fill="${hair}" opacity=".9"/>` : ""}
      ${earrings ? `<circle cx="58" cy="117" r="6" fill="#e6a532"/><circle cx="162" cy="117" r="6" fill="#e6a532"/>` : ""}
      <path d="M45 220c7-47 37-72 65-72s58 25 65 72H45z" fill="${shirt}"/>
      <text x="110" y="196" text-anchor="middle" font-size="28" font-weight="800" font-family="Arial, sans-serif" fill="${shirt === "#1d2528" ? "#fff" : "#1d2528"}">${initials}</text>
    </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
