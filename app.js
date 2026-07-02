const state = {
  decks: [],
  cards: [],
  filtered: [],
  index: 0,
  showingAnswer: false,
  activeDeck: "",
  activeDeckId: "",
  activeGroup: "",
  activeTag: "",
  progress: {},
  background: "aurora",
  touchStartX: 0,
  touchStartY: 0,
  suppressNextFlip: false
};

let mathRenderToken = 0;

const els = {
  fileInput: document.getElementById("file-input"),
  reloadButton: document.getElementById("reload-button"),
  deckList: document.getElementById("deck-list"),
  groupList: document.getElementById("group-list"),
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
  resetButton: document.getElementById("reset-button"),
  cardGroup: document.getElementById("card-group"),
  backgroundSwatches: document.querySelectorAll("[data-bg]")
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

function loadBackground() {
  state.background = localStorage.getItem("deckfile-background") || "aurora";
  document.body.dataset.bg = state.background;
  els.backgroundSwatches.forEach((button) => {
    button.classList.toggle("active", button.dataset.bg === state.background);
  });
}

function setBackground(name) {
  state.background = name;
  localStorage.setItem("deckfile-background", name);
  loadBackground();
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

function renderMath() {
  const token = ++mathRenderToken;
  const target = els.cardContent;

  const typeset = () => {
    if (token !== mathRenderToken || !window.MathJax?.typesetPromise) return;
    window.MathJax.typesetClear?.([target]);
    window.MathJax.typesetPromise([target]).catch(() => {});
  };

  if (window.MathJax?.startup?.promise) {
    window.MathJax.startup.promise.then(typeset).catch(() => {});
    return;
  }

  typeset();
}

function splitPipeRow(line) {
  const parts = [];
  let part = "";
  let inCode = false;
  let mathDelimiter = "";

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    const escaped = index > 0 && line[index - 1] === "\\";

    if (char === "`" && !escaped && !mathDelimiter) {
      inCode = !inCode;
      part += char;
      continue;
    }

    if (char === "$" && !escaped && !inCode) {
      const delimiter = next === "$" ? "$$" : "$";
      if (!mathDelimiter) {
        mathDelimiter = delimiter;
      } else if (mathDelimiter === delimiter) {
        mathDelimiter = "";
      }
      part += delimiter;
      if (delimiter === "$$") index += 1;
      continue;
    }

    if (char === "|" && !escaped && !inCode && !mathDelimiter) {
      parts.push(part.trim());
      part = "";
      continue;
    }

    part += char;
  }

  parts.push(part.trim());
  if (parts[0] === "") parts.shift();
  if (parts[parts.length - 1] === "") parts.pop();
  return parts.length >= 2 ? parts : null;
}

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) return null;

  if (trimmed.includes("\t")) {
    const parts = trimmed.split("\t").map((part) => part.trim());
    return parts.length >= 2 ? parts : null;
  }

  if (!trimmed.includes("|")) return null;
  return splitPipeRow(trimmed);
}

function parseCards(markdown, deckName) {
  const cards = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let currentGroup = "未分组";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      currentGroup = heading[1].trim();
      continue;
    }

    const parts = splitMarkdownRow(line);
    if (!parts) continue;

    const first = parts[0].replace(/<[^>]*>/g, "").trim().toLowerCase();
    if (["问题", "question", "front", "正面"].includes(first)) continue;

    const front = parts[0] || "";
    const back = parts[1] || "";
    const tags = (parts[2] || currentGroup || deckName)
      .split(/\s+/)
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (!front || !back) continue;
    cards.push({ front, back, tags, deck: deckName, group: currentGroup });
  }

  return cards;
}

function deckDisplayName(deck) {
  return deck.name || deck.file.replace(/\\/g, "/").split("/").pop() || deck.file;
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
        id: deck.file,
        name: deckDisplayName(deck),
        file: deck.file,
        cards: parseCards(text, deckDisplayName(deck))
      });
    }

    state.decks = decks.filter((deck) => deck.cards.length);
    renderDeckList();
    if (state.decks.length) selectDeck(state.decks[0].id);
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
    if (cards.length) imported.push({ id: `local/${file.name}/${file.size}/${file.lastModified}`, name: file.name, file: `本地/${file.name}`, cards });
  }
  state.decks = [...imported, ...state.decks.filter((deck) => !imported.some((item) => item.id === deck.id))];
  renderDeckList();
  if (imported.length) selectDeck(imported[0].id);
}

function selectDeck(id) {
  const deck = state.decks.find((item) => item.id === id);
  if (!deck) return;
  state.activeDeck = deck.name;
  state.activeDeckId = deck.id;
  state.activeGroup = "";
  state.activeTag = "";
  state.cards = deck.cards;
  state.index = 0;
  state.showingAnswer = false;
  applyFilter();
  renderDeckList();
  renderGroups();
  renderTags();
}

function applyFilter() {
  state.filtered = state.cards.filter((card) => {
    const groupMatch = state.activeGroup ? card.group === state.activeGroup : true;
    const tagMatch = state.activeTag ? card.tags.includes(state.activeTag) : true;
    return groupMatch && tagMatch;
  });
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

  const root = {};
  state.decks.forEach((deck) => {
    const segments = (deck.file || deck.name).replace(/\\/g, "/").split("/").filter(Boolean);
    let node = root;
    segments.forEach((segment, index) => {
      node.children ||= {};
      node.children[segment] ||= { label: segment, children: {} };
      node = node.children[segment];
      if (index === segments.length - 1) node.deck = deck;
    });
  });

  renderTreeNode(root, els.deckList, 0);
}

function renderTreeNode(node, container, depth) {
  Object.values(node.children || {}).forEach((child) => {
    if (child.deck) {
      const button = document.createElement("button");
      button.className = `deck-item file-node${child.deck.id === state.activeDeckId ? " active" : ""}`;
      button.style.setProperty("--depth", depth);
      button.innerHTML = `<span class="tree-label">${sanitizeHTML(child.deck.name)}</span><small>${child.deck.cards.length} cards</small>`;
      button.addEventListener("click", () => selectDeck(child.deck.id));
      container.appendChild(button);
    } else {
      const folder = document.createElement("div");
      folder.className = "tree-folder";
      folder.style.setProperty("--depth", depth);
      folder.textContent = child.label;
      container.appendChild(folder);
      renderTreeNode(child, container, depth + 1);
    }
  });
}

function renderGroups() {
  const counts = new Map();
  state.cards.forEach((card) => counts.set(card.group, (counts.get(card.group) || 0) + 1));

  els.groupList.innerHTML = "";
  if (!counts.size) {
    const empty = document.createElement("div");
    empty.className = "muted-line";
    empty.textContent = "未加载";
    els.groupList.appendChild(empty);
    return;
  }

  [...counts.entries()].forEach(([group, count]) => {
    const button = document.createElement("button");
    button.className = `group-chip${group === state.activeGroup ? " active" : ""}`;
    button.textContent = `${group} · ${count}`;
    button.addEventListener("click", () => {
      state.activeGroup = state.activeGroup === group ? "" : group;
      state.index = 0;
      applyFilter();
      renderGroups();
    });
    els.groupList.appendChild(button);
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

function renderCardHTML(card) {
  const front = sanitizeHTML(card.front);
  const back = sanitizeHTML(card.back);

  if (!state.showingAnswer) {
    return `<div class="anki-front">${front}</div>`;
  }

  return `
    <div class="anki-front anki-frontside">${front}</div>
    <hr id="answer" class="answer-divider">
    <div class="anki-back">${back}</div>
  `;
}

function renderCard() {
  const total = state.filtered.length;
  const card = state.filtered[state.index];
  els.deckTitle.textContent = state.activeDeck || "未加载卡片";
  els.deckMeta.textContent = `${total} cards${state.activeGroup ? ` · ${state.activeGroup}` : ""}${state.activeTag ? ` · ${state.activeTag}` : ""}`;
  els.progressFill.style.width = total ? `${((state.index + 1) / total) * 100}%` : "0%";
  els.card.classList.toggle("showing-answer", Boolean(card && state.showingAnswer));

  if (!card) {
    els.cardKicker.textContent = "Front";
    els.cardGroup.textContent = "";
    els.cardContent.textContent = "选择或导入 Markdown 文件";
    els.flipButton.textContent = "显示答案";
    return;
  }

  els.cardKicker.textContent = state.showingAnswer ? "Back" : "Front";
  els.cardGroup.textContent = card.group || "";
  els.cardContent.innerHTML = renderCardHTML(card);
  els.flipButton.textContent = state.showingAnswer ? "显示问题" : "显示答案";
  renderMath();
}

function toggleAnswer() {
  if (!state.filtered.length) return;
  state.showingAnswer = !state.showingAnswer;
  renderCard();
}

function suppressFlipOnce() {
  state.suppressNextFlip = true;
  window.setTimeout(() => {
    state.suppressNextFlip = false;
  }, 350);
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
els.flipButton.addEventListener("click", toggleAnswer);
els.shuffleButton.addEventListener("click", shuffleCards);
els.resetButton.addEventListener("click", () => {
  state.progress = {};
  saveProgress();
});
els.backgroundSwatches.forEach((button) => {
  button.addEventListener("click", () => setBackground(button.dataset.bg));
});
document.querySelectorAll("[data-grade]").forEach((button) => {
  button.addEventListener("click", () => gradeCurrent(button.dataset.grade));
});

els.card.addEventListener("touchstart", (event) => {
  const touch = event.changedTouches[0];
  state.touchStartX = touch.clientX;
  state.touchStartY = touch.clientY;
}, { passive: true });

els.card.addEventListener("touchend", (event) => {
  const touch = event.changedTouches[0];
  const dx = touch.clientX - state.touchStartX;
  const dy = touch.clientY - state.touchStartY;
  if (Math.abs(dx) < 54 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
  suppressFlipOnce();
  move(dx < 0 ? 1 : -1);
}, { passive: true });

els.card.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "mouse") return;
  state.touchStartX = event.clientX;
  state.touchStartY = event.clientY;
});

els.card.addEventListener("pointerup", (event) => {
  if (event.pointerType !== "mouse") return;
  const dx = event.clientX - state.touchStartX;
  const dy = event.clientY - state.touchStartY;
  if (Math.abs(dx) < 90 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
  suppressFlipOnce();
  move(dx < 0 ? 1 : -1);
});

els.card.addEventListener("click", (event) => {
  if (event.target.closest("a, button, input, textarea, select, label")) return;
  if (state.suppressNextFlip) {
    state.suppressNextFlip = false;
    return;
  }
  toggleAnswer();
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key === " ") {
    event.preventDefault();
    toggleAnswer();
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

window.addEventListener("mathjax-ready", renderMath);

loadProgress();
loadBackground();
loadRepositoryDecks();
