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
  deletedCards: {},
  background: "aurora",
  sidebarCollapsed: false,
  sidebarWidth: 320,
  sidebarResizing: false,
  collapsedNodes: {},
  touchStartX: 0,
  touchStartY: 0,
  codeScroll: null,
  suppressNextFlip: false
};

let mathRenderToken = 0;

const els = {
  shell: document.querySelector(".shell"),
  sidebarToggle: document.getElementById("sidebar-toggle"),
  sidebarResizer: document.getElementById("sidebar-resizer"),
  deckList: document.getElementById("deck-list"),
  reviewSummary: document.getElementById("review-summary"),
  modeButtons: document.querySelectorAll("[data-mode]"),
  deckTitle: document.getElementById("deck-title"),
  deckMeta: document.getElementById("deck-meta"),
  progressLabel: document.getElementById("progress-label"),
  progressPercent: document.getElementById("progress-percent"),
  progressFill: document.getElementById("progress-fill"),
  card: document.getElementById("card"),
  cardKicker: document.getElementById("card-kicker"),
  cardContent: document.getElementById("card-content"),
  cardStats: document.getElementById("card-stats"),
  deleteButton: document.getElementById("delete-card-button"),
  prevButton: document.getElementById("prev-button"),
  nextButton: document.getElementById("next-button"),
  flipButton: document.getElementById("flip-button"),
  prevGroupButton: document.getElementById("prev-group-button"),
  nextGroupButton: document.getElementById("next-group-button"),
  shuffleButton: document.getElementById("shuffle-button"),
  resetButton: document.getElementById("reset-button"),
  cardGroup: document.getElementById("card-group"),
  backgroundSwatches: document.querySelectorAll("[data-bg]")
};

const SIDEBAR_WIDTH = {
  min: 260,
  max: 640,
  defaultValue: 320
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

function loadDeletedCards() {
  try {
    state.deletedCards = JSON.parse(localStorage.getItem("deckfile-deleted-cards") || "{}");
  } catch {
    state.deletedCards = {};
  }
}

function saveDeletedCards() {
  localStorage.setItem("deckfile-deleted-cards", JSON.stringify(state.deletedCards));
}

function isDeletedCard(card) {
  return Boolean(state.deletedCards[cardId(card)]);
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

function loadLayoutState() {
  state.sidebarCollapsed = localStorage.getItem("deckfile-sidebar-collapsed") === "true";
  setSidebarWidth(Number(localStorage.getItem("deckfile-sidebar-width") || SIDEBAR_WIDTH.defaultValue));
  try {
    state.collapsedNodes = JSON.parse(localStorage.getItem("deckfile-collapsed-nodes") || "{}");
  } catch {
    state.collapsedNodes = {};
  }
  applySidebarState();
}

function sidebarWidthMax() {
  if (window.innerWidth <= 860) return SIDEBAR_WIDTH.defaultValue;
  return Math.max(SIDEBAR_WIDTH.min, Math.min(SIDEBAR_WIDTH.max, window.innerWidth - 520));
}

function clampSidebarWidth(value) {
  const numeric = Number(value) || SIDEBAR_WIDTH.defaultValue;
  return Math.min(Math.max(numeric, SIDEBAR_WIDTH.min), sidebarWidthMax());
}

function setSidebarWidth(value, persist = false) {
  const width = Math.round(clampSidebarWidth(value));
  state.sidebarWidth = width;
  document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  els.sidebarResizer?.setAttribute("aria-valuenow", String(width));
  els.sidebarResizer?.setAttribute("aria-valuemax", String(sidebarWidthMax()));
  if (persist) localStorage.setItem("deckfile-sidebar-width", String(width));
}

function applySidebarState() {
  document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  els.sidebarToggle?.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  if (els.sidebarToggle) {
    els.sidebarToggle.textContent = "☰";
    els.sidebarToggle.title = state.sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏";
    els.sidebarToggle.classList.toggle("active", !state.sidebarCollapsed);
  }
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  localStorage.setItem("deckfile-sidebar-collapsed", String(state.sidebarCollapsed));
  applySidebarState();
}

function beginSidebarResize(event) {
  if (window.matchMedia("(max-width: 860px)").matches) return;
  state.sidebarResizing = true;
  document.body.classList.add("sidebar-resizing");
  els.sidebarResizer?.setPointerCapture?.(event.pointerId);
  setSidebarWidth(event.clientX);
  event.preventDefault();
}

function updateSidebarResize(event) {
  if (!state.sidebarResizing) return;
  setSidebarWidth(event.clientX);
}

function endSidebarResize(event) {
  if (!state.sidebarResizing) return;
  state.sidebarResizing = false;
  document.body.classList.remove("sidebar-resizing");
  els.sidebarResizer?.releasePointerCapture?.(event.pointerId);
  setSidebarWidth(state.sidebarWidth, true);
}

function resizeSidebarWithKeyboard(event) {
  const step = event.shiftKey ? 48 : 16;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    setSidebarWidth(state.sidebarWidth - step, true);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    setSidebarWidth(state.sidebarWidth + step, true);
  } else if (event.key === "Home") {
    event.preventDefault();
    setSidebarWidth(SIDEBAR_WIDTH.min, true);
  } else if (event.key === "End") {
    event.preventDefault();
    setSidebarWidth(SIDEBAR_WIDTH.max, true);
  }
}

function saveCollapsedNodes() {
  localStorage.setItem("deckfile-collapsed-nodes", JSON.stringify(state.collapsedNodes));
}

function toggleTreeNode(nodeKey, row, childrenWrap, control) {
  const collapsed = !state.collapsedNodes[nodeKey];
  if (collapsed) {
    state.collapsedNodes[nodeKey] = true;
  } else {
    delete state.collapsedNodes[nodeKey];
  }
  saveCollapsedNodes();

  if (!row || !childrenWrap) {
    renderDeckList();
    return;
  }

  row.classList.toggle("collapsed", collapsed);
  childrenWrap.classList.toggle("collapsed", collapsed);
  childrenWrap.setAttribute("aria-hidden", String(collapsed));
  if (control) {
    control.setAttribute("aria-expanded", String(!collapsed));
    control.title = collapsed ? "展开" : "折叠";
  }
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
    .trim();
}

function escapeHTML(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(text) {
  return escapeHTML(text).replace(/"/g, "&quot;");
}

function normalizeCodeLanguage(value) {
  const key = String(value || "").trim().toLowerCase().replace(/^language-/, "");
  const aliases = {
    "c++": "cpp",
    "c#": "csharp",
    js: "javascript",
    py: "python"
  };
  return (aliases[key] || key).replace(/[^a-z0-9_-]/g, "");
}

function renderInlineCode(text) {
  const source = String(text || "");
  let output = "";
  let index = 0;
  let code = "";
  let inCode = false;
  let mathDelimiter = "";

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    const escaped = index > 0 && source[index - 1] === "\\";

    if (char === "$" && !escaped && !inCode) {
      const delimiter = next === "$" ? "$$" : "$";
      if (!mathDelimiter) {
        mathDelimiter = delimiter;
      } else if (mathDelimiter === delimiter) {
        mathDelimiter = "";
      }
      output += delimiter;
      index += delimiter === "$$" ? 2 : 1;
      continue;
    }

    if (char === "`" && !escaped && !mathDelimiter) {
      if (inCode) {
        output += `<code>${escapeHTML(code)}</code>`;
        code = "";
      }
      inCode = !inCode;
      index += 1;
      continue;
    }

    if (inCode) {
      code += char;
    } else {
      output += char;
    }
    index += 1;
  }

  if (inCode) output += `\`${code}`;
  return output.replace(/\\`/g, "`");
}

function renderInlineLines(lines) {
  return lines
    .map((line) => line.trimEnd())
    .map(renderInlineCode)
    .join("<br>")
    .replace(/(?:<br>){3,}/g, "<br><br>")
    .replace(/^(?:<br>)+|(?:<br>)+$/g, "")
    .trim();
}

function formatMarkdownCell(value) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let textLines = [];
  let codeLines = [];
  let inFence = false;
  let codeLanguage = "";

  const flushText = () => {
    const text = renderInlineLines(textLines);
    if (text) output.push(text);
    textLines = [];
  };

  const flushCode = () => {
    const language = normalizeCodeLanguage(codeLanguage);
    const preAttributes = [`class="code-card"`, `tabindex="0"`];
    if (language) preAttributes.push(`data-lang="${escapeAttribute(codeLanguage.trim())}"`);
    const codeAttribute = language ? ` class="language-${language}"` : "";
    output.push(`<pre ${preAttributes.join(" ")}><code${codeAttribute}>${escapeHTML(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
    codeLanguage = "";
  };

  lines.forEach((line) => {
    const fence = line.match(/^\s*```\s*([^`]*)$/);
    if (fence) {
      if (inFence) {
        flushCode();
        inFence = false;
      } else {
        flushText();
        codeLanguage = fence[1] || "";
        inFence = true;
      }
      return;
    }

    if (inFence) {
      codeLines.push(line);
      return;
    }

    textLines.push(line);
  });

  if (inFence) flushCode();
  flushText();
  return output.join("<br>").trim();
}

function normalizeHeadingPath(stack) {
  return stack.filter(Boolean).map((item) => item.trim()).filter(Boolean);
}

function parseCards(markdown, deck) {
  const cards = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const headingStack = [];
  const deckName = deck.name;
  let pending = null;

  const pushPending = () => {
    if (!pending) return;
    const rawFront = pending.frontLines.join("\n");
    const rawBack = pending.backLines.join("\n");
    const rawTags = pending.tags;
    const front = stripNid(formatMarkdownCell(rawFront));
    const back = stripNid(formatMarkdownCell(rawBack));
    const headingPath = pending.headingPath;
    const group = headingPath.join(" / ") || "未分组";
    const tags = (rawTags || group || deckName)
      .split(/\s+/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    const nid = extractNid(rawFront, rawBack, rawTags);

    if (front && back) {
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
    pending = null;
  };

  const appendPendingLine = (rawLine) => {
    if (!pending) return;
    const line = rawLine.replace(/\s+$/, "");
    pending.backLines.push(line);
    if (/^\s*```/.test(line)) pending.inFence = !pending.inFence;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (pending) appendPendingLine(rawLine);
      continue;
    }

    if (pending?.inFence) {
      appendPendingLine(rawLine);
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      pushPending();
      const level = Math.min(heading[0].match(/^#+/)[0].length, 6);
      headingStack[level - 1] = heading[1].trim();
      headingStack.length = level;
      continue;
    }

    const parts = splitMarkdownRow(line);
    if (!parts) {
      if (pending) appendPendingLine(rawLine);
      continue;
    }

    const first = parts[0].replace(/<[^>]*>/g, "").trim().toLowerCase();
    if (["问题", "question", "front", "正面"].includes(first)) {
      pushPending();
      continue;
    }

    pushPending();
    pending = {
      frontLines: [parts[0] || ""],
      backLines: [parts[1] || ""],
      tags: parts[2] || "",
      headingPath: normalizeHeadingPath(headingStack),
      inFence: false
    };
    if (/^\s*```/.test(parts[1] || "")) pending.inFence = true;
  }

  pushPending();
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
    const firstDeck = state.decks.find((deck) => cardsForScope(deck.id).length);
    if (firstDeck) {
      selectStudyNode(firstDeck.id);
    } else {
      renderCard();
    }
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
  return deck.cards.filter((card) => !isDeletedCard(card) && pathMatches(card, pathKey));
}

function filteredByStudyMode(cards) {
  if (state.studyMode === "new") return cards.filter((card) => isNew(card));
  if (state.studyMode === "due") return cards.filter((card) => isNew(card) || isDue(card));
  return cards;
}

function queueShouldRandomize(mode = state.studyMode) {
  return mode === "due" || mode === "new";
}

function shuffleList(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
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
  applyFilter({ randomize: queueShouldRandomize() });
  renderDeckList();
  renderReviewSummary();
}

function applyFilter(options = {}) {
  const { randomize = false } = options;
  state.filtered = filteredByStudyMode(state.cards);
  if (randomize) shuffleList(state.filtered);
  if (state.index >= state.filtered.length) state.index = 0;
  state.showingAnswer = false;
  renderCard();
  renderReviewSummary();
}

function setStudyMode(mode, options = {}) {
  state.studyMode = mode;
  state.index = 0;
  state.showingAnswer = false;
  applyFilter({ randomize: options.randomize ?? queueShouldRandomize(mode) });
  renderDeckList();
}

function createTreeNode(label, type, data = {}) {
  return { label, type, nodeKey: data.nodeKey || `${type}:${label}`, children: [], childMap: new Map(), ...data };
}

function childNode(parent, key, label, type, data = {}) {
  if (!parent.childMap.has(key)) {
    const node = createTreeNode(label, type, { ...data, nodeKey: `${parent.nodeKey}>${key}` });
    parent.childMap.set(key, node);
    parent.children.push(node);
  }
  return parent.childMap.get(key);
}

function buildDeckTree() {
  const root = createTreeNode("root", "root", { nodeKey: "root" });

  state.decks.forEach((deck) => {
    const visibleCards = deck.cards.filter((card) => !isDeletedCard(card));
    if (!visibleCards.length) return;

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

    visibleCards.forEach((card) => {
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

function collectStudyScopes(node = buildDeckTree(), scopes = []) {
  node.children.forEach((child) => {
    if (child.type === "scope") {
      const cards = cardsForScope(child.deckId, child.pathKey);
      if (cards.length) {
        scopes.push({
          deckId: child.deckId,
          pathKey: child.pathKey,
          labelPath: child.labelPath,
          nodeId: scopeId(child.deckId, child.pathKey)
        });
      }
    }
    collectStudyScopes(child, scopes);
  });
  return scopes;
}

function updateGroupButtons() {
  const canSwitch = collectStudyScopes().length > 1;
  [els.prevGroupButton, els.nextGroupButton].forEach((button) => {
    if (!button) return;
    button.disabled = !canSwitch;
  });
}

function selectAdjacentStudyNode(delta) {
  const scopes = collectStudyScopes();
  if (!scopes.length) return;
  const currentIndex = scopes.findIndex((scope) => scope.nodeId === state.activeNodeId);
  const baseIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex = (baseIndex + delta + scopes.length) % scopes.length;
  const nextScope = scopes[nextIndex];
  selectStudyNode(nextScope.deckId, nextScope.pathKey, nextScope.labelPath);
}

function renderDeckList() {
  els.deckList.innerHTML = "";
  const tree = buildDeckTree();
  if (!tree.children.length) {
    const empty = document.createElement("div");
    empty.className = "deck-item";
    empty.textContent = state.decks.length ? "当前没有可复习的卡片" : "cards/index.json";
    els.deckList.appendChild(empty);
    updateGroupButtons();
    return;
  }

  renderTreeNode(tree, els.deckList, 0);
  updateGroupButtons();
}

function renderTreeNode(node, container, depth) {
  node.children.forEach((child) => {
    const hasChildren = child.children.length > 0;
    const collapsed = Boolean(state.collapsedNodes[child.nodeKey]);
    const branch = document.createElement("div");
    branch.className = `tree-branch ${child.type === "folder" ? "folder-branch" : "scope-branch"}`;
    branch.style.setProperty("--depth", depth);

    const row = document.createElement("div");
    row.className = `tree-row ${child.type === "folder" ? "folder-row" : "scope-row"}${collapsed ? " collapsed" : ""}`;
    row.style.setProperty("--depth", depth);

    const childrenWrap = document.createElement("div");
    childrenWrap.className = `tree-children${collapsed ? " collapsed" : ""}`;
    childrenWrap.setAttribute("aria-hidden", String(collapsed));

    if (child.type === "scope") {
      const cards = cardsForScope(child.deckId, child.pathKey);
      const counts = reviewCounts(cards);
      const waiting = counts.new + counts.due;
      const active = scopeId(child.deckId, child.pathKey) === state.activeNodeId;
      const button = document.createElement("button");
      button.className = `deck-item${active ? " active" : ""}`;
      button.innerHTML = `
        <span class="tree-label">
          <span class="tree-name">${sanitizeHTML(child.label)}</span>
        </span>
        <span class="tree-counts" aria-label="待复习 ${waiting}，新卡 ${counts.new}，总数 ${counts.total}">
          <span class="tree-count waiting">待 ${waiting}</span>
          <span class="tree-count new">新 ${counts.new}</span>
          <span class="tree-count total">总 ${counts.total}</span>
        </span>
      `;
      if (hasChildren) {
        button.setAttribute("aria-expanded", String(!collapsed));
        button.title = collapsed ? "展开并复习此章节" : "折叠并复习此章节";
      }
      button.addEventListener("click", () => {
        if (hasChildren) toggleTreeNode(child.nodeKey, row, childrenWrap, button);
        selectStudyNode(child.deckId, child.pathKey, child.labelPath);
      });
      row.appendChild(button);
      branch.appendChild(row);
      if (hasChildren) {
        renderTreeNode(child, childrenWrap, depth + 1);
        branch.appendChild(childrenWrap);
      }
      container.appendChild(branch);
      return;
    }

    const folder = document.createElement("button");
    folder.className = "tree-folder";
    folder.type = "button";
    folder.innerHTML = `<span class="tree-folder-name">${sanitizeHTML(child.label)}</span>`;
    if (hasChildren) {
      folder.setAttribute("aria-expanded", String(!collapsed));
      folder.title = collapsed ? "展开" : "折叠";
    }
    folder.addEventListener("click", () => {
      if (hasChildren) toggleTreeNode(child.nodeKey, row, childrenWrap, folder);
    });
    row.appendChild(folder);
    branch.appendChild(row);
    if (hasChildren) {
      renderTreeNode(child, childrenWrap, depth + 1);
      branch.appendChild(childrenWrap);
    }
    container.appendChild(branch);
  });
}

function renderReviewSummary() {
  if (!els.reviewSummary) return;
  const counts = reviewCounts(state.cards);
  const waiting = counts.new + counts.due;
  els.reviewSummary.innerHTML = `
    <button class="summary-card${state.studyMode === "due" ? " active" : ""}" type="button" data-summary-mode="due">
      <b>${waiting}</b><span>待复习</span><small>到期+新卡</small>
    </button>
    <button class="summary-card${state.studyMode === "new" ? " active" : ""}" type="button" data-summary-mode="new">
      <b>${counts.new}</b><span>新卡</span><small>随机开始</small>
    </button>
    <button class="summary-card${state.studyMode === "all" ? " active" : ""}" type="button" data-summary-mode="all">
      <b>${counts.total}</b><span>全部</span><small>已安排 ${counts.scheduled}</small>
    </button>
  `;
  els.reviewSummary.querySelectorAll("[data-summary-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setStudyMode(button.dataset.summaryMode, { randomize: queueShouldRandomize(button.dataset.summaryMode) });
    });
  });
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
  const modeLabel = { due: "待复习", new: "新卡", all: "全部" }[state.studyMode] || "全部";
  els.deckMeta.textContent = `${modeLabel} ${total} cards${scopeLabel}`;
  const progressPercent = total ? Math.round(((state.index + 1) / total) * 100) : 0;
  els.progressFill.style.width = `${progressPercent}%`;
  els.progressLabel.textContent = total ? `${state.index + 1} / ${total}` : "0 / 0";
  els.progressPercent.textContent = `${progressPercent}%`;
  els.card.classList.toggle("showing-answer", Boolean(card && state.showingAnswer));

  if (!card) {
    els.cardKicker.textContent = "Front";
    els.cardGroup.textContent = state.studyMode === "all" ? "" : `当前章节没有${modeLabel}卡片`;
    els.cardContent.textContent = state.decks.length ? "切换到“全部”查看已安排的卡片" : "选择 Markdown 卡片";
    els.cardStats.textContent = "";
    els.flipButton.textContent = "显示答案";
    els.deleteButton.hidden = true;
    els.deleteButton.disabled = true;
    return;
  }

  els.deleteButton.hidden = false;
  els.deleteButton.disabled = false;
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

function codeBlockFromEvent(event) {
  const target = event.target;
  return target instanceof Element ? target.closest(".card-content pre") : null;
}

function stopCodeBlockTouch(event) {
  if (codeBlockFromEvent(event)) event.stopPropagation();
}

function beginCodeBlockScroll(event) {
  const block = codeBlockFromEvent(event);
  if (!block || event.pointerType !== "mouse" || event.button !== 0) return;
  event.stopPropagation();
  state.codeScroll = {
    block,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: block.scrollLeft,
    moved: false
  };
  block.classList.add("is-dragging");
  block.setPointerCapture?.(event.pointerId);
}

function updateCodeBlockScroll(event) {
  const active = state.codeScroll;
  if (!active || active.pointerId !== event.pointerId) return;
  event.stopPropagation();

  const dx = event.clientX - active.startX;
  const dy = event.clientY - active.startY;
  if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;

  if (Math.abs(dx) >= Math.abs(dy) * 0.65 || active.moved) {
    active.moved = true;
    active.block.scrollLeft = active.scrollLeft - dx;
    if (event.cancelable) event.preventDefault();
  }
}

function endCodeBlockScroll(event) {
  const active = state.codeScroll;
  if (!active || active.pointerId !== event.pointerId) return;
  event.stopPropagation();
  if (active.moved) suppressFlipOnce();
  active.block.classList.remove("is-dragging");
  active.block.releasePointerCapture?.(event.pointerId);
  state.codeScroll = null;
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
  if ((state.studyMode === "due" && grade !== "again") || state.studyMode === "new") {
    applyFilter({ randomize: queueShouldRandomize() });
  } else {
    move(1);
  }
}

function deleteCurrentCard() {
  const card = state.filtered[state.index];
  if (!card) return;
  const confirmed = window.confirm("确定从复习中删除这张卡片？删除记录只保存在当前浏览器，不会改动 Markdown 文件。");
  if (!confirmed) return;

  const id = cardId(card);
  state.deletedCards[id] = {
    deletedAt: new Date().toISOString(),
    deckId: card.deckId,
    pathKey: card.pathKey || "",
    front: card.front
  };
  delete state.progress[id];
  saveDeletedCards();
  saveProgress();

  state.cards = cardsForScope(state.activeDeckId, state.activePathKey);
  state.filtered = state.filtered.filter((item) => cardId(item) !== id && !isDeletedCard(item));
  if (state.index >= state.filtered.length) state.index = Math.max(0, state.filtered.length - 1);
  state.showingAnswer = false;
  renderDeckList();
  renderCard();
  renderReviewSummary();
}

function nextIntervalDays(grade, previous) {
  if (grade === "again") return 0;
  if (grade === "hard") return Math.max(1, Math.ceil((previous?.intervalDays || 0.5) * 1.4));
  if (!previous) return 1;
  return Math.max(2, Math.ceil((previous.intervalDays || 1) * 2.4));
}

els.sidebarToggle.addEventListener("click", toggleSidebar);
els.sidebarResizer?.addEventListener("pointerdown", beginSidebarResize);
els.sidebarResizer?.addEventListener("keydown", resizeSidebarWithKeyboard);
window.addEventListener("pointermove", updateSidebarResize);
window.addEventListener("pointerup", endSidebarResize);
window.addEventListener("pointercancel", endSidebarResize);
window.addEventListener("resize", () => setSidebarWidth(state.sidebarWidth));
els.prevButton.addEventListener("click", () => move(-1));
els.nextButton.addEventListener("click", () => move(1));
els.flipButton.addEventListener("click", toggleAnswer);
els.deleteButton.addEventListener("click", (event) => {
  event.stopPropagation();
  deleteCurrentCard();
});
els.prevGroupButton?.addEventListener("click", () => selectAdjacentStudyNode(-1));
els.nextGroupButton?.addEventListener("click", () => selectAdjacentStudyNode(1));
els.shuffleButton.addEventListener("click", shuffleCards);
els.resetButton.addEventListener("click", () => {
  state.progress = {};
  saveProgress();
  applyFilter({ randomize: queueShouldRandomize() });
  renderDeckList();
});
els.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setStudyMode(button.dataset.mode, { randomize: queueShouldRandomize(button.dataset.mode) });
  });
});
els.backgroundSwatches.forEach((button) => {
  button.addEventListener("click", () => setBackground(button.dataset.bg));
});
document.querySelectorAll("[data-grade]").forEach((button) => {
  button.addEventListener("click", () => gradeCurrent(button.dataset.grade));
});

els.cardContent.addEventListener("pointerdown", beginCodeBlockScroll);
els.cardContent.addEventListener("pointermove", updateCodeBlockScroll);
els.cardContent.addEventListener("pointerup", endCodeBlockScroll);
els.cardContent.addEventListener("pointercancel", endCodeBlockScroll);
["touchstart", "touchmove", "touchend", "touchcancel"].forEach((eventName) => {
  els.cardContent.addEventListener(eventName, stopCodeBlockTouch, { passive: true });
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
  if (codeBlockFromEvent(event)) return;
  if (event.target.closest("a, button, input, textarea, select, label")) return;
  if (state.suppressNextFlip) {
    state.suppressNextFlip = false;
    return;
  }
  toggleAnswer();
});

document.addEventListener("keydown", (event) => {
  if (codeBlockFromEvent(event)) return;
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
loadDeletedCards();
loadBackground();
loadLayoutState();
loadRepositoryDecks();
