const state = {
  decks: [],
  cards: [],
  filtered: [],
  index: 0,
  showingAnswer: false,
  activeDeck: "",
  activeDeckId: "",
  activeNodeId: "",
  activePathKey: "",
  activePathLabel: "",
  studyMode: "due",
  progress: {},
  background: "aurora",
  touchStartX: 0,
  touchStartY: 0,
  pointerMoved: false,
  suppressNextFlip: false
};

let mathRenderToken = 0;

const els = {
  fileInput: document.getElementById("file-input"),
  reloadButton: document.getElementById("reload-button"),
  deckList: document.getElementById("deck-list"),
  reviewSummary: document.getElementById("review-summary"),
  modeButtons: document.querySelectorAll("[data-mode]"),
  deckTitle: document.getElementById("deck-title"),
  deckMeta: document.getElementById("deck-meta"),
  progressFill: document.getElementById("progress-fill"),
  card: document.getElementById("card"),
  cardKicker: document.getElementById("card-kicker"),
  cardContent: document.getElementById("card-content"),
  cardStats: document.getElementById("card-stats"),
  prevButton: document.getElementById("prev-button"),
  nextButton: document.getElementById("next-button"),
  flipButton: document.getElementById("flip-button"),
  shuffleButton: document.getElementById("shuffle-button"),
  resetButton: document.getElementById("reset-button"),
  cardGroup: document.getElementById("card-group"),
  backgroundSwatches: document.querySelectorAll("[data-bg]")
};

function cardId(card) {
  if (card.nid) return `${card.deckId || card.deck}::${card.nid}::${card.front}`;
  return `${card.deckId || card.deck}::${card.pathKey || ""}::${card.front}::${card.back}`;
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

function normalizeRecord(record) {
  if (!record) return null;
  return {
    reps: Number(record.reps || 1),
    lapses: Number(record.lapses || 0),
    intervalDays: Number(record.intervalDays || 0),
    lastGrade: record.lastGrade || record.grade || "",
    lastReviewedAt: record.lastReviewedAt || record.updatedAt || "",
    dueAt: record.dueAt || record.updatedAt || ""
  };
}

function cardRecord(card) {
  return normalizeRecord(state.progress[cardId(card)]);
}

function isNew(card) {
  return !cardRecord(card);
}

function isDue(card, now = Date.now()) {
  const record = cardRecord(card);
  if (!record) return true;
  if (!record.dueAt) return true;
  return new Date(record.dueAt).getTime() <= now;
}

function cardStatus(card, now = Date.now()) {
  const record = cardRecord(card);
  if (!record) return "new";
  return isDue(card, now) ? "due" : "scheduled";
}

function formatDateTime(value) {
  if (!value) return "未安排";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未安排";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function reviewCounts(cards) {
  const now = Date.now();
  return cards.reduce((counts, card) => {
    const status = cardStatus(card, now);
    counts.total += 1;
    if (status === "new") counts.new += 1;
    if (status === "due") counts.due += 1;
    if (status === "scheduled") counts.scheduled += 1;
    return counts;
  }, { total: 0, new: 0, due: 0, scheduled: 0 });
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

function extractNid(...values) {
  for (const value of values) {
    const match = String(value || "").match(/\bnidd?\d{6,}\b/i);
    if (match) return match[0];
  }
  return "";
}

function stripNid(value) {
  return String(value || "")
    .replace(/(?:\s*<br\s*\/?>\s*){0,2}\bnidd?\d{6,}\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeHeadingPath(stack) {
  return stack.filter(Boolean).map((item) => item.trim()).filter(Boolean);
}

function parseCards(markdown, deck) {
  const cards = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const headingStack = [];
  const deckName = deck.name;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[0].match(/^#+/)[0].length, 6);
      headingStack[level - 1] = heading[1].trim();
      headingStack.length = level;
      continue;
    }

    const parts = splitMarkdownRow(line);
    if (!parts) continue;

    const first = parts[0].replace(/<[^>]*>/g, "").trim().toLowerCase();
    if (["问题", "question", "front", "正面"].includes(first)) continue;

    const rawFront = parts[0] || "";
    const rawBack = parts[1] || "";
    const rawTags = parts[2] || "";
    const front = stripNid(rawFront);
    const back = stripNid(rawBack);
    const headingPath = normalizeHeadingPath(headingStack);
    const group = headingPath.join(" / ") || "未分组";
    const tags = (rawTags || group || deckName)
      .split(/\s+/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    const nid = extractNid(rawFront, rawBack, rawTags);

    if (!front || !back) continue;
    cards.push({
      front,
      back,
      tags,
      nid,
      deck: deckName,
      deckId: deck.id,
      group,
      path: headingPath,
      pathKey: headingPath.join("\u001f")
    });
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
      const deckItem = {
        id: deck.file,
        name: deckDisplayName(deck),
        file: deck.file,
        cards: []
      };
      deckItem.cards = parseCards(text, deckItem);
      decks.push(deckItem);
    }

    state.decks = decks.filter((deck) => deck.cards.length);
    renderDeckList();
    if (state.decks.length) selectStudyNode(state.decks[0].id);
  } catch {
    renderDeckList();
    renderCard();
  }
}

async function importFiles(files) {
  const imported = [];
  for (const file of files) {
    const text = await file.text();
    const deckItem = {
      id: `local/${file.name}/${file.size}/${file.lastModified}`,
      name: file.name.replace(/\.(md|markdown|txt|tsv)$/i, ""),
      file: `本地/${file.name}`,
      cards: []
    };
    deckItem.cards = parseCards(text, deckItem);
    if (deckItem.cards.length) imported.push(deckItem);
  }
  state.decks = [...imported, ...state.decks.filter((deck) => !imported.some((item) => item.id === deck.id))];
  renderDeckList();
  if (imported.length) selectStudyNode(imported[0].id);
}

function scopeId(deckId, pathKey = "") {
  return pathKey ? `${deckId}#${pathKey}` : deckId;
}

function pathMatches(card, pathKey) {
  return !pathKey || card.pathKey === pathKey || card.pathKey.startsWith(`${pathKey}\u001f`);
}

function cardsForScope(deckId, pathKey = "") {
  const deck = state.decks.find((item) => item.id === deckId);
  if (!deck) return [];
  return deck.cards.filter((card) => pathMatches(card, pathKey));
}

function filteredByStudyMode(cards) {
  if (state.studyMode !== "due") return cards;
  return cards.filter((card) => isNew(card) || isDue(card));
}

function selectStudyNode(deckId, pathKey = "", label = "") {
  const deck = state.decks.find((item) => item.id === deckId);
  if (!deck) return;
  state.activeDeck = deck.name;
  state.activeDeckId = deck.id;
  state.activePathKey = pathKey;
  state.activeNodeId = scopeId(deck.id, pathKey);
  state.activePathLabel = label;
  state.cards = cardsForScope(deck.id, pathKey);
  state.index = 0;
  state.showingAnswer = false;
  applyFilter();
  renderDeckList();
  renderReviewSummary();
}

function applyFilter() {
  state.filtered = filteredByStudyMode(state.cards);
  if (state.index >= state.filtered.length) state.index = 0;
  state.showingAnswer = false;
  renderCard();
  renderReviewSummary();
}

function createTreeNode(label, type, data = {}) {
  return { label, type, children: [], childMap: new Map(), ...data };
}

function childNode(parent, key, label, type, data = {}) {
  if (!parent.childMap.has(key)) {
    const node = createTreeNode(label, type, data);
    parent.childMap.set(key, node);
    parent.children.push(node);
  }
  return parent.childMap.get(key);
}

function buildDeckTree() {
  const root = createTreeNode("root", "root");

  state.decks.forEach((deck) => {
    const segments = (deck.file || deck.name).replace(/\\/g, "/").split("/").filter(Boolean);
    const folders = segments.length > 1 ? segments.slice(0, -1) : [];
    let parent = root;

    folders.forEach((segment) => {
      parent = childNode(parent, `folder:${segment}`, segment, "folder");
    });

    const deckNode = childNode(parent, `deck:${deck.id}`, deck.name, "scope", {
      deckId: deck.id,
      pathKey: "",
      labelPath: ""
    });

    deck.cards.forEach((card) => {
      let scopeParent = deckNode;
      const pathParts = [];

      card.path.forEach((part) => {
        pathParts.push(part);
        const pathKey = pathParts.join("\u001f");
        scopeParent = childNode(scopeParent, `heading:${pathKey}`, part, "scope", {
          deckId: deck.id,
          pathKey,
          labelPath: pathParts.join(" / ")
        });
      });
    });
  });

  return root;
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

  renderTreeNode(buildDeckTree(), els.deckList, 0);
}

function renderTreeNode(node, container, depth) {
  node.children.forEach((child) => {
    if (child.type === "scope") {
      const cards = cardsForScope(child.deckId, child.pathKey);
      const counts = reviewCounts(cards);
      const waiting = counts.new + counts.due;
      const active = scopeId(child.deckId, child.pathKey) === state.activeNodeId;
      const button = document.createElement("button");
      button.className = `deck-item file-node${active ? " active" : ""}`;
      button.style.setProperty("--depth", depth);
      button.innerHTML = `
        <span class="tree-label">${sanitizeHTML(child.label)}</span>
        <small>待 ${waiting} · 新 ${counts.new} · 总 ${counts.total}</small>
      `;
      button.addEventListener("click", () => selectStudyNode(child.deckId, child.pathKey, child.labelPath));
      container.appendChild(button);
      renderTreeNode(child, container, depth + 1);
      return;
    }

    const folder = document.createElement("div");
    folder.className = "tree-folder";
    folder.style.setProperty("--depth", depth);
    folder.textContent = child.label;
    container.appendChild(folder);
    renderTreeNode(child, container, depth + 1);
  });
}

function renderReviewSummary() {
  if (!els.reviewSummary) return;
  const counts = reviewCounts(state.cards);
  const waiting = counts.new + counts.due;
  els.reviewSummary.innerHTML = `
    <div><b>${waiting}</b><span>待复习</span></div>
    <div><b>${counts.new}</b><span>新卡</span></div>
    <div><b>${counts.scheduled}</b><span>已安排</span></div>
  `;
  els.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.studyMode);
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
  const scopeLabel = state.activePathLabel ? ` · ${state.activePathLabel}` : "";
  const modeLabel = state.studyMode === "due" ? "待复习" : "全部";
  els.deckMeta.textContent = `${modeLabel} ${total} cards${scopeLabel}`;
  els.progressFill.style.width = total ? `${((state.index + 1) / total) * 100}%` : "0%";
  els.card.classList.toggle("showing-answer", Boolean(card && state.showingAnswer));

  if (!card) {
    els.cardKicker.textContent = "Front";
    els.cardGroup.textContent = state.studyMode === "due" ? "当前章节没有等待复习的卡片" : "";
    els.cardContent.textContent = state.decks.length ? "切换到“全部”查看已安排的卡片" : "选择或导入 Markdown 文件";
    els.cardStats.textContent = "";
    els.flipButton.textContent = "显示答案";
    return;
  }

  els.cardKicker.textContent = state.showingAnswer ? "Back" : "Front";
  els.cardGroup.textContent = card.group || "";
  els.cardContent.innerHTML = renderCardHTML(card);
  els.cardStats.textContent = renderCardStats(card);
  els.flipButton.textContent = state.showingAnswer ? "显示问题" : "显示答案";
  renderMath();
}

function renderCardStats(card) {
  const record = cardRecord(card);
  if (!record) return "新卡 · 尚未复习";
  const gradeName = { again: "重来", hard: "模糊", good: "记住" }[record.lastGrade] || "已复习";
  return `已复习 ${record.reps} 次 · 上次 ${gradeName} · 下次 ${formatDateTime(record.dueAt)}`;
}

function toggleAnswer() {
  if (!state.filtered.length) return;
  state.showingAnswer = !state.showingAnswer;
  renderCard();
}

function showAnswer() {
  if (!state.filtered.length || state.showingAnswer) return;
  state.showingAnswer = true;
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
  if (!state.showingAnswer) {
    showAnswer();
    return;
  }
  const id = cardId(card);
  const previous = cardRecord(card);
  const now = new Date();
  const intervalDays = nextIntervalDays(grade, previous);
  const dueAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  state.progress[id] = {
    reps: (previous?.reps || 0) + 1,
    lapses: (previous?.lapses || 0) + (grade === "again" ? 1 : 0),
    intervalDays,
    lastGrade: grade,
    lastReviewedAt: now.toISOString(),
    dueAt: dueAt.toISOString()
  };
  saveProgress();
  renderDeckList();
  if (state.studyMode === "due" && grade !== "again") {
    applyFilter();
  } else {
    move(1);
  }
}

function nextIntervalDays(grade, previous) {
  if (grade === "again") return 0;
  if (grade === "hard") return Math.max(1, Math.ceil((previous?.intervalDays || 0.5) * 1.4));
  if (!previous) return 1;
  return Math.max(2, Math.ceil((previous.intervalDays || 1) * 2.4));
}

els.fileInput.addEventListener("change", (event) => importFiles([...event.target.files]));
els.reloadButton.addEventListener("click", loadRepositoryDecks);
els.prevButton.addEventListener("click", () => move(-1));
els.nextButton.addEventListener("click", () => move(1));
els.flipButton.addEventListener("click", toggleAnswer);
els.shuffleButton.addEventListener("click", shuffleCards);
els.resetButton.addEventListener("click", () => {
  state.progress = {};
  saveProgress();
  applyFilter();
  renderDeckList();
});
els.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.studyMode = button.dataset.mode;
    state.index = 0;
    state.showingAnswer = false;
    applyFilter();
    renderDeckList();
  });
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
  showAnswer();
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key === " ") {
    event.preventDefault();
    showAnswer();
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
