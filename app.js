const state = {
  decks: [],
  cards: [],
  filtered: [],
  index: 0,
  showingAnswer: false,
  activeDeck: "",
  activeTag: "",
  progress: {}
};

const els = {
  fileInput: document.getElementById("file-input"),
  reloadButton: document.getElementById("reload-button"),
  deckList: document.getElementById("deck-list"),
  tagList: document.getElementById("tag-list"),
  tagSearch: document.getElementById("tag-search"),
  deckTitle: document.getElementById("deck-title"),
  deckMeta: document.getElementById("deck-meta"),
  progressFill: document.getElementById("progress-fill"),
  card: document.getElementById("card"),
  cardKicker: document.getElementById("card-kicker"),
  cardContent: document.getElementById("card-content"),
  prevButton: document.getElementById("prev-button"),
  nextButton: document.getElementById("next-button"),
  flipButton: document.getElementById("flip-button"),
  shuffleButton: document.getElementById("shuffle-button"),
  resetButton: document.getElementById("reset-button")
};

function cardId(card) {
  return `${card.front}::${card.back}::${card.tags.join(" ")}`;
}

function loadProgress() {
  try {
    state.progress = JSON.parse(localStorage.getItem("deckfile-progress") || "{}");
  } catch {
    state.progress = {};
  }
}

function saveProgress() {
  localStorage.setItem("deckfile-progress", JSON.stringify(state.progress));
}

function sanitizeHTML(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script, iframe, object, embed, style").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return template.innerHTML;
}

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) return null;

  if (trimmed.includes("\t")) {
    const parts = trimmed.split("\t").map((part) => part.trim());
    return parts.length >= 2 ? parts : null;
  }

  if (trimmed.includes(" | ")) {
    return trimmed.split(" | ").map((part) => part.trim());
  }

  if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
    return trimmed.slice(1, -1).split("|").map((part) => part.trim());
  }

  return null;
}

function parseCards(markdown, deckName) {
  const cards = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let currentSection = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      currentSection = heading[1].trim();
      continue;
    }

    const parts = splitMarkdownRow(line);
    if (!parts) continue;

    const first = parts[0].replace(/<[^>]*>/g, "").trim().toLowerCase();
    if (["问题", "question", "front", "正面"].includes(first)) continue;

    const front = parts[0] || "";
    const back = parts[1] || "";
    const tags = (parts[2] || currentSection || deckName)
      .split(/\s+/)
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (!front || !back) continue;
    cards.push({ front, back, tags, deck: deckName });
  }

  return cards;
}

async function loadRepositoryDecks() {
  try {
    const response = await fetch("cards/index.json", { cache: "no-store" });
    if (!response.ok) throw new Error("missing index");
    const manifest = await response.json();
    const decks = [];

    for (const deck of manifest.decks || []) {
      const cardResponse = await fetch(`cards/${deck.file}`, { cache: "no-store" });
      if (!cardResponse.ok) continue;
      const text = await cardResponse.text();
      decks.push({
        name: deck.name || deck.file,
        file: deck.file,
        cards: parseCards(text, deck.name || deck.file)
      });
    }

    state.decks = decks.filter((deck) => deck.cards.length);
    renderDeckList();
    if (state.decks.length) selectDeck(state.decks[0].name);
  } catch {
    renderDeckList();
    renderCard();
  }
}

async function importFiles(files) {
  const imported = [];
  for (const file of files) {
    const text = await file.text();
    const cards = parseCards(text, file.name.replace(/\.(md|markdown|txt|tsv)$/i, ""));
    if (cards.length) imported.push({ name: file.name, file: file.name, cards });
  }
  state.decks = [...imported, ...state.decks.filter((deck) => !imported.some((item) => item.name === deck.name))];
  renderDeckList();
  if (imported.length) selectDeck(imported[0].name);
}

function selectDeck(name) {
  const deck = state.decks.find((item) => item.name === name);
  if (!deck) return;
  state.activeDeck = name;
  state.activeTag = "";
  state.cards = deck.cards;
  state.index = 0;
  state.showingAnswer = false;
  applyFilter();
  renderDeckList();
  renderTags();
}

function applyFilter() {
  state.filtered = state.activeTag
    ? state.cards.filter((card) => card.tags.includes(state.activeTag))
    : [...state.cards];
  if (state.index >= state.filtered.length) state.index = 0;
  state.showingAnswer = false;
  renderCard();
}

function renderDeckList() {
  els.deckList.innerHTML = "";
  if (!state.decks.length) {
    const empty = document.createElement("div");
    empty.className = "deck-item";
    empty.textContent = "cards/index.json";
    els.deckList.appendChild(empty);
    return;
  }

  state.decks.forEach((deck) => {
    const button = document.createElement("button");
    button.className = `deck-item${deck.name === state.activeDeck ? " active" : ""}`;
    button.innerHTML = `${sanitizeHTML(deck.name)}<small>${deck.cards.length} cards</small>`;
    button.addEventListener("click", () => selectDeck(deck.name));
    els.deckList.appendChild(button);
  });
}

function renderTags() {
  const query = els.tagSearch.value.trim().toLowerCase();
  const counts = new Map();
  state.cards.forEach((card) => {
    card.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });

  els.tagList.innerHTML = "";
  [...counts.entries()]
    .filter(([tag]) => tag.toLowerCase().includes(query))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([tag, count]) => {
      const button = document.createElement("button");
      button.className = `tag-chip${tag === state.activeTag ? " active" : ""}`;
      button.textContent = `${tag} · ${count}`;
      button.addEventListener("click", () => {
        state.activeTag = state.activeTag === tag ? "" : tag;
        state.index = 0;
        applyFilter();
        renderTags();
      });
      els.tagList.appendChild(button);
    });
}

function renderCard() {
  const total = state.filtered.length;
  const card = state.filtered[state.index];
  els.deckTitle.textContent = state.activeDeck || "未加载卡片";
  els.deckMeta.textContent = `${total} cards${state.activeTag ? ` · ${state.activeTag}` : ""}`;
  els.progressFill.style.width = total ? `${((state.index + 1) / total) * 100}%` : "0%";

  if (!card) {
    els.cardKicker.textContent = "Question";
    els.cardContent.textContent = "选择或导入 Markdown 文件";
    els.flipButton.textContent = "显示答案";
    return;
  }

  els.cardKicker.textContent = state.showingAnswer ? "Answer" : "Question";
  els.cardContent.innerHTML = sanitizeHTML(state.showingAnswer ? card.back : card.front);
  els.flipButton.textContent = state.showingAnswer ? "显示问题" : "显示答案";
}

function move(delta) {
  if (!state.filtered.length) return;
  state.index = (state.index + delta + state.filtered.length) % state.filtered.length;
  state.showingAnswer = false;
  renderCard();
}

function shuffleCards() {
  for (let i = state.filtered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.filtered[i], state.filtered[j]] = [state.filtered[j], state.filtered[i]];
  }
  state.index = 0;
  state.showingAnswer = false;
  renderCard();
}

function gradeCurrent(grade) {
  const card = state.filtered[state.index];
  if (!card) return;
  const id = cardId(card);
  state.progress[id] = { grade, updatedAt: new Date().toISOString() };
  saveProgress();
  move(1);
}

els.fileInput.addEventListener("change", (event) => importFiles([...event.target.files]));
els.reloadButton.addEventListener("click", loadRepositoryDecks);
els.tagSearch.addEventListener("input", renderTags);
els.prevButton.addEventListener("click", () => move(-1));
els.nextButton.addEventListener("click", () => move(1));
els.flipButton.addEventListener("click", () => {
  state.showingAnswer = !state.showingAnswer;
  renderCard();
});
els.shuffleButton.addEventListener("click", shuffleCards);
els.resetButton.addEventListener("click", () => {
  state.progress = {};
  saveProgress();
});
document.querySelectorAll("[data-grade]").forEach((button) => {
  button.addEventListener("click", () => gradeCurrent(button.dataset.grade));
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key === " ") {
    event.preventDefault();
    state.showingAnswer = !state.showingAnswer;
    renderCard();
  } else if (event.key === "ArrowRight") {
    move(1);
  } else if (event.key === "ArrowLeft") {
    move(-1);
  } else if (event.key === "1") {
    gradeCurrent("again");
  } else if (event.key === "2") {
    gradeCurrent("hard");
  } else if (event.key === "3") {
    gradeCurrent("good");
  }
});

loadProgress();
loadRepositoryDecks();
