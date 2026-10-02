const DATA_URL = "data/omikuji.json";
const SYNONYMS_URL = "data/synonyms.json";
const CHANGELOG_URL = "updates/changelog.json";
const PAGE_SIZE = 200;

const state = {
  entries: [],
  filtered: [],
  query: "",
  favoritesOnly: false,
  sort: "addedDesc",
  shown: PAGE_SIZE,
  exactPrice: "",
  loadError: ""
};

const els = {
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  results: document.querySelector("#results"),
  resultsTitle: document.querySelector("#resultsTitle"),
  resultsMeta: document.querySelector("#resultsMeta"),
  emptyState: document.querySelector("#emptyState"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyCopy: document.querySelector("#emptyCopy"),
  prefecture: document.querySelector("#prefectureFilter"),
  motif: document.querySelector("#motifFilter"),
  material: document.querySelector("#materialFilter"),
  status: document.querySelector("#statusFilter"),
  maxPrice: document.querySelector("#maxPriceFilter"),
  sort: document.querySelector("#sortSelect"),
  activeFilters: document.querySelector("#activeFilters"),
  detailModal: document.querySelector("#detailModal"),
  modalContent: document.querySelector("#modalContent"),
  favoritesNavBtn: document.querySelector("#favoritesNavBtn"),
  clearFiltersBtn: document.querySelector("#clearFiltersBtn"),
  loadMoreBtn: document.querySelector("#loadMoreBtn"),
  shareSearchBtn: document.querySelector("#shareSearchBtn"),
  dataUpdated: document.querySelector("#dataUpdated")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  readUrlIntoState();

  try {
    const [dataResponse, synonymsResponse] = await Promise.all([
      fetch(DATA_URL, { cache: "no-store" }),
      fetch(SYNONYMS_URL, { cache: "no-store" })
    ]);
    if (!dataResponse.ok) throw new Error(`Database HTTP ${dataResponse.status}`);
    if (!synonymsResponse.ok) throw new Error(`Synonyms HTTP ${synonymsResponse.status}`);

    state.entries = await dataResponse.json();
    if (!Array.isArray(state.entries)) throw new Error("Database is not an array");
    state.entries.forEach((entry, index) => {
      entry._addedIndex = index;
    });
    state.synonyms = await synonymsResponse.json();
    populateFilters();
    applyUrlToControls();
    applyFilters();
  } catch (error) {
    console.error(error);
    state.loadError = "資料庫載入失敗。請確認 data/omikuji.json 存在且為 JSON 陣列。";
    els.resultsMeta.textContent = "資料庫載入失敗";
    showEmpty("未能載入資料庫", state.loadError);
  }

  loadChangelog();
}

function bindEvents() {
  els.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = els.searchInput.value.trim();
    state.favoritesOnly = false;
    state.exactPrice = "";
    state.shown = PAGE_SIZE;
    applyFilters();
  });

  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim();
    state.favoritesOnly = false;
    state.exactPrice = "";
    state.shown = PAGE_SIZE;
    applyFilters();
  });

  [els.prefecture, els.motif, els.material, els.status, els.maxPrice, els.sort]
    .forEach(el => el.addEventListener("change", () => {
      if (el === els.sort) state.sort = el.value;
      state.shown = PAGE_SIZE;
      applyFilters();
    }));

  els.maxPrice.addEventListener("input", () => {
    state.shown = PAGE_SIZE;
    applyFilters();
  });

  els.clearFiltersBtn.addEventListener("click", clearFilters);

  els.favoritesNavBtn.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    state.shown = PAGE_SIZE;
    applyFilters();
  });

  els.loadMoreBtn.addEventListener("click", () => {
    state.shown += PAGE_SIZE;
    render();
    writeUrl();
  });

  els.shareSearchBtn.addEventListener("click", async () => {
    writeUrl();
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast("已複製目前搜尋網址");
    } catch {
      toast(url);
    }
  });

  document.addEventListener("click", (event) => {
    const quick = event.target.closest("[data-query]");
    if (quick) {
      event.preventDefault();
      els.searchInput.value = quick.dataset.query || "";
      state.query = quick.dataset.query || "";
      state.favoritesOnly = false;
      state.exactPrice = "";
      state.shown = PAGE_SIZE;
      els.motif.value = "";
      els.material.value = "";
      els.prefecture.value = "";
      els.status.value = "";
      els.maxPrice.value = "";
      applyFilters();
      document.querySelector(".results-area")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const tag = event.target.closest("[data-filter-kind]");
    if (tag) {
      event.preventDefault();
      event.stopPropagation();
      applyTagFilter(tag.dataset.filterKind, tag.dataset.filterValue || "");
      return;
    }

    const favoriteButton = event.target.closest("[data-favorite-id]");
    if (favoriteButton) {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(favoriteButton.dataset.favoriteId);
      return;
    }

    if (event.target.closest("a")) return;

    const cardButton = event.target.closest("[data-entry-id]");
    if (cardButton) openDetail(cardButton.dataset.entryId);

    if (event.target.closest("[data-close-modal]")) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  window.addEventListener("popstate", () => {
    readUrlIntoState();
    applyUrlToControls();
    state.shown = PAGE_SIZE;
    if (state.entries.length || !state.loadError) applyFilters();
  });
}

function populateFilters() {
  const prefs = unique(state.entries.map(e => e.prefecture).filter(Boolean));
  fillSelect(els.prefecture, prefs, comparePrefecture);
  fillSelect(els.motif, unique(state.entries.flatMap(e => e.motif || [])));
  fillSelect(els.material, unique(state.entries.map(e => e.material).filter(Boolean)));
}

function comparePrefecture(a, b) {
  const order = (state.synonyms?.prefectures || []).map(p => p.name_ja);
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
}

function fillSelect(select, values, compare) {
  const current = select.value;
  while (select.options.length > 1) select.remove(1);
  values.sort(compare || ((a, b) => String(a).localeCompare(String(b), "ja")));
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = motifLabel(value);
    select.appendChild(option);
  }
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

function motifLabel(value) {
  const zh = {
    "うさぎ": "うさぎ／兔",
    "ねこ": "ねこ／貓",
    "きつね": "きつね／狐",
    "へび": "へび／蛇",
    "龍": "龍",
    "牛": "牛",
    "いぬ": "いぬ／犬",
    "かえる": "かえる／蛙",
    "かめ": "かめ／龜",
    "鯛": "鯛",
    "鳥": "鳥"
  };
  return zh[value] || value;
}

function applyFilters() {
  const parsedQuery = parseQuery(state.query);
  const typedMax = Number(els.maxPrice.value);
  const maxPrice = typedMax || parsedQuery.maxPrice;

  let list = state.entries.filter(entry => {
    if (state.favoritesOnly && !getFavorites().has(entry.id)) return false;
    if (els.prefecture.value && entry.prefecture !== els.prefecture.value) return false;
    if (els.motif.value && !(entry.motif || []).includes(els.motif.value)) return false;
    if (els.material.value && entry.material !== els.material.value) return false;
    if (els.status.value && entry.status !== els.status.value) return false;
    if (state.exactPrice && entry.price !== state.exactPrice) return false;
    if (maxPrice) {
      const price = parsePrice(entry.price);
      if (price && price > maxPrice) return false;
    }

    return parsedQuery.terms.every(term => {
      const expanded = expandSearchTerm(term).split(" ").filter(Boolean);
      const text = searchableText(entry);
      return expanded.some(token => text.includes(token));
    });
  });

  list.sort(getSortFunction());
  state.filtered = list;
  render();
  writeUrl();
}

function parseQuery(raw) {
  const normalized = normalize(raw);
  if (!normalized) return { terms: [], maxPrice: 0 };

  const priceMatch = normalized.match(/(?:¥|￥|jpy)?\s*(\d[\d,]*)\s*円?\s*(?:以下|以内|まで|under|below|less than)/i);
  const maxPrice = priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : 0;

  const withoutPrice = normalized
    .replace(/(?:¥|￥|jpy)?\s*\d[\d,]*\s*円?\s*(?:以下|以内|まで|under|below|less than)/ig, " ")
    .trim();

  const terms = withoutPrice.split(/\s+/).filter(Boolean);
  const statusMap = state.synonyms?.special_terms || {};
  const kept = [];

  for (const term of terms) {
    let consumed = false;
    for (const [status, words] of Object.entries(statusMap)) {
      if (status === "price_under") continue;
      if ((words || []).some(word => normalize(word) === term)) {
        if (!els.status.value) els.status.value = status;
        consumed = true;
        break;
      }
    }
    if (!consumed) kept.push(term);
  }

  return { terms: kept, maxPrice };
}

function expandSearchTerm(term) {
  const normalizedTerm = normalize(term);
  if (!state.synonyms) return normalizedTerm;

  const groups = state.synonyms.motif_groups || [];
  for (const group of groups) {
    for (const item of group.items || []) {
      const synonyms = item.synonyms || [];
      if (synonyms.some(s => normalize(s) === normalizedTerm)) {
        return synonyms.map(normalize).join(" ");
      }
    }
  }

  const prefecture = (state.synonyms.prefectures || []).find(p =>
    normalize(p.name_ja) === normalizedTerm ||
    normalize(p.name_ja.replace(/[都道府県]$/, "")) === normalizedTerm ||
    normalize(p.romaji) === normalizedTerm
  );
  if (prefecture) return normalize(prefecture.name_ja);

  return normalizedTerm;
}

function searchableText(entry) {
  const parts = [
    entry.name_jp,
    entry.shrine_temple_jp,
    entry.institution_type,
    entry.prefecture,
    entry.city,
    entry.address,
    entry.material,
    entry.price,
    entry.notes,
    entry.status,
    statusLabel(entry.status).text,
    ...(entry.motif || []),
    ...(entry.search_terms || [])
  ];
  return normalize(parts.filter(Boolean).join(" "));
}

function getSortFunction() {
  const added = entry => Number.isFinite(entry._addedIndex) ? entry._addedIndex : 0;
  const updated = entry => String(entry.last_verified_date || entry.data_retrieved_date || "");
  if (state.sort === "addedAsc") {
    return (a, b) => added(a) - added(b);
  }
  if (state.sort === "updated") {
    return (a, b) => updated(b).localeCompare(updated(a)) || added(b) - added(a);
  }
  if (state.sort === "priceDesc") {
    return (a, b) => (parsePrice(b.price) || -1) - (parsePrice(a.price) || -1);
  }
  if (state.sort === "priceAsc") {
    return (a, b) => (parsePrice(a.price) || Infinity) - (parsePrice(b.price) || Infinity);
  }
  return (a, b) => added(b) - added(a);
}

function render() {
  els.results.innerHTML = "";
  els.favoritesNavBtn.setAttribute("aria-pressed", String(state.favoritesOnly));
  els.favoritesNavBtn.classList.toggle("is-on", state.favoritesOnly);

  const hasData = state.entries.length > 0;
  const none = state.filtered.length === 0;
  els.emptyState.hidden = !none;

  if (!hasData && !state.loadError) {
    els.resultsTitle.textContent = "全部御神籤";
    els.resultsMeta.textContent = "資料庫尚未收錄任何項目";
    showEmpty(
      "資料庫還沒有紀錄",
      "目前 data/omikuji.json 是空的。收錄時請留下來源網址；不知道的欄位留空，不要推測。"
    );
  } else if (none && state.favoritesOnly) {
    els.resultsTitle.textContent = "我的最愛";
    els.resultsMeta.textContent = "共 0 項";
    showEmpty("還沒有收藏", "在卡片右上角按 ♡ 即可加入。收藏只存在這台瀏覽器。");
  } else if (none) {
    els.resultsTitle.textContent = "搜尋結果";
    els.resultsMeta.textContent = "共 0 項";
    showEmpty("找不到符合條件的御神籤", "可以嘗試移除部分篩選，或使用較短的關鍵字。");
  } else {
    els.resultsTitle.textContent = state.favoritesOnly ? "我的最愛" : (hasActiveQuery() ? "搜尋結果" : "全部御神籤");
    const shown = Math.min(state.shown, state.filtered.length);
    const total = state.entries.length;
    els.resultsMeta.textContent = shown < state.filtered.length
      ? `顯示 ${shown} / ${state.filtered.length} 項 · 資料庫共 ${total} 項`
      : `共 ${state.filtered.length} 項 · 資料庫共 ${total} 項`;
  }

  renderActiveFilters();

  for (const entry of state.filtered.slice(0, state.shown)) {
    els.results.appendChild(createCard(entry));
  }

  const more = state.filtered.length > state.shown;
  els.loadMoreBtn.hidden = !more;
  if (more) els.loadMoreBtn.textContent = `顯示更多（還有 ${state.filtered.length - state.shown} 項）`;
}

function hasActiveQuery() {
  return Boolean(
    state.query || state.favoritesOnly || els.prefecture.value || els.motif.value ||
    els.material.value || els.status.value || els.maxPrice.value || state.exactPrice
  );
}

function showEmpty(title, copy) {
  els.emptyState.hidden = false;
  els.emptyTitle.textContent = title;
  els.emptyCopy.textContent = copy;
}

function renderActiveFilters() {
  const chips = [];
  if (state.query) chips.push(`關鍵字：${state.query}`);
  if (els.prefecture.value) chips.push(els.prefecture.value);
  if (els.motif.value) chips.push(motifLabel(els.motif.value));
  if (els.material.value) chips.push(els.material.value);
  if (els.status.value) chips.push(statusLabel(els.status.value).text);
  if (els.maxPrice.value) chips.push(`${els.maxPrice.value}円以下`);
  if (state.exactPrice) chips.push(state.exactPrice);
  if (state.favoritesOnly) chips.push("只看最愛");
  els.activeFilters.innerHTML = chips.map(text => `<span class="filter-chip">${escapeHtml(text)}</span>`).join("");
}

function createCard(entry) {
  const article = document.createElement("article");
  article.className = "card";

  const image = Array.isArray(entry.images) && entry.images[0] ? entry.images[0] : "";
  const status = statusLabel(entry.status);
  const favorite = getFavorites().has(entry.id);

  article.innerHTML = `
    <button class="favorite-btn ${favorite ? "is-collected" : ""}"
      type="button" data-favorite-id="${escapeAttr(entry.id)}"
      aria-label="${favorite ? "取消收藏" : "加入收藏"}">${favorite ? "♥" : "♡"}</button>
    <button class="card-main" type="button" data-entry-id="${escapeAttr(entry.id)}">
      <div class="card-image">
        ${image
          ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(entry.name_jp || "御神籤")}" referrerpolicy="no-referrer">`
          : `<span class="image-placeholder">⛩</span>`}
      </div>
      <h3 class="card-title">${escapeHtml(entry.name_jp || "未命名御神籤")}</h3>
      <p class="card-subtitle">${escapeHtml(entry.shrine_temple_jp || "")}${entry.prefecture ? " · " + escapeHtml(entry.prefecture) : ""}</p>
      <p class="card-address">${escapeHtml(placeLine(entry))}</p>
      <span class="status ${status.className}">${status.text}</span>
      <span class="verified">${escapeHtml(verifiedLine(entry))}</span>
    </button>
    <div class="tags">
      ${(entry.motif || []).slice(0, 4).map(m => tagButton("motif", m, motifLabel(m))).join("")}
      ${entry.material ? tagButton("material", entry.material, entry.material) : ""}
      ${entry.price ? tagButton("price", entry.price, entry.price) : ""}
    </div>
    ${entry.source_url ? `<p class="card-source-line"><a class="card-source" href="${escapeAttr(entry.source_url)}" target="_blank" rel="noopener noreferrer">來源網站</a><span class="source-plain">${escapeHtml(entry.source_url)}</span></p>` : ""}
  `;

  article.querySelectorAll("img").forEach(img => {
    img.addEventListener("error", () => {
      const box = img.parentElement;
      img.remove();
      if (box && !box.querySelector(".image-placeholder")) {
        box.insertAdjacentHTML("beforeend", "<span class=\"image-placeholder\">⛩</span>");
      }
    });
  });

  return article;
}

function tagButton(kind, value, label) {
  return `<button type="button" class="tag" data-filter-kind="${escapeAttr(kind)}" data-filter-value="${escapeAttr(value)}">${escapeHtml(label)}</button>`;
}

function applyTagFilter(kind, value) {
  state.shown = PAGE_SIZE;
  state.favoritesOnly = false;
  state.query = "";
  state.exactPrice = "";
  els.searchInput.value = "";
  if (kind === "motif") {
    els.motif.value = value;
    els.material.value = "";
  } else if (kind === "material") {
    els.material.value = value;
    els.motif.value = "";
  } else if (kind === "price") {
    state.exactPrice = value;
    els.motif.value = "";
    els.material.value = "";
  }
  applyFilters();
  document.querySelector(".results-area")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function placeLine(entry) {
  if (entry.address) return entry.address;
  return [entry.prefecture, entry.city].filter(Boolean).join("") || "地址未記載";
}

function verifiedLine(entry) {
  if (entry.last_verified_date) return `核實：${entry.last_verified_date}`;
  if (entry.data_retrieved_date) return `收錄：${entry.data_retrieved_date} · 未再核實現貨`;
  return "未核實";
}

function openDetail(id) {
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;

  const image = Array.isArray(entry.images) && entry.images[0] ? entry.images[0] : "";
  const maps = entry.google_maps_url || "";

  els.modalContent.innerHTML = `
    ${image ? `<img class="detail-image" src="${escapeAttr(image)}" alt="${escapeAttr(entry.name_jp || "御神籤")}" referrerpolicy="no-referrer">` : ""}
    <div class="detail-header">
      <h2 id="modalTitle">${escapeHtml(entry.name_jp || "未命名御神籤")}</h2>
      <p class="detail-jp">${escapeHtml(entry.shrine_temple_jp || "")}</p>
    </div>

    <dl class="detail-grid">
      ${detailItem("都道府縣", entry.prefecture)}
      ${detailItem("市區町村", entry.city)}
      ${detailItem("地址", entry.address)}
      ${detailItem("造型／題材", (entry.motif || []).map(motifLabel).join("、"))}
      ${detailItem("材質", entry.material)}
      ${detailItem("價格", entry.price)}
      ${detailItem("狀態", statusLabel(entry.status).text)}
      ${detailItem("最後核實", entry.last_verified_date)}
    </dl>

    ${maps ? `<a class="map-btn" href="${escapeAttr(maps)}" target="_blank" rel="noopener">在 Google 地圖開啟</a>` : ""}

    <section class="detail-section">
      <h3>備註</h3>
      <p>${escapeHtml(entry.notes || "—")}</p>
    </section>

    <section class="detail-section">
      <h3>資料來源</h3>
      ${entry.source_url
        ? `<p><a class="source-link" href="${escapeAttr(entry.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(entry.source_title || "來源")}</a></p><p class="source-plain">${escapeHtml(entry.source_url)}</p>`
        : "<p>—</p>"}
      ${(entry.official_url || "").trim()
        ? `<a class="source-link" href="${escapeAttr(entry.official_url)}" target="_blank" rel="noopener">官方網站</a>`
        : ""}
      <p class="verified">來源頁不等于神社仍在授予。請以官方或現場為準。</p>
    </section>

    <dl class="detail-grid">
      ${detailItem("來源刊載日期", entry.source_published_date)}
      ${detailItem("資料取得日期", entry.data_retrieved_date)}
    </dl>

    ${entry.version_notes ? `
      <section class="detail-section">
        <h3>版本／歷史備註</h3>
        <p>${escapeHtml(entry.version_notes)}</p>
      </section>` : ""}
  `;

  els.detailModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  els.detailModal.hidden = true;
  document.body.style.overflow = "";
}

function detailItem(label, value) {
  return `<div class="detail-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "—")}</dd></div>`;
}

function statusLabel(status) {
  if (status === "current_confirmed") return { text: "現在確認", className: "status-current" };
  if (status === "previously_confirmed") return { text: "曾確認／目前未核實", className: "status-previous" };
  if (status === "discontinued") return { text: "已停止", className: "status-discontinued" };
  return { text: "資料不足", className: "" };
}

function clearFilters() {
  state.query = "";
  state.favoritesOnly = false;
  state.sort = "name";
  state.exactPrice = "";
  state.shown = PAGE_SIZE;
  els.searchInput.value = "";
  els.prefecture.value = "";
  els.motif.value = "";
  els.material.value = "";
  els.status.value = "";
  els.maxPrice.value = "";
  els.sort.value = "name";
  applyFilters();
}

function getFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem("omikujiFavorites") || "[]"));
  } catch {
    return new Set();
  }
}

function toggleFavorite(id) {
  const favorites = getFavorites();
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  localStorage.setItem("omikujiFavorites", JSON.stringify([...favorites]));
  applyFilters();
}

function parsePrice(value) {
  if (!value) return 0;
  const match = String(value).replace(/,/g, "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function unique(values) {
  return [...new Set(values)];
}

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("ja")
    .replace(/[　]/g, " ")
    .replace(/[ぁ-ん]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function readUrlIntoState() {
  const params = new URLSearchParams(location.search);
  state.query = params.get("q") || "";
  state.sort = params.get("sort") || "name";
  state.favoritesOnly = params.get("fav") === "1";
  state._url = {
    pref: params.get("pref") || "",
    motif: params.get("motif") || "",
    material: params.get("material") || "",
    status: params.get("status") || "",
    max: params.get("max") || ""
  };
}

function applyUrlToControls() {
  els.searchInput.value = state.query;
  const allowed = ["addedDesc", "addedAsc", "updated", "priceDesc", "priceAsc"];
  const legacy = { name: "addedDesc", prefecture: "addedDesc", recent: "updated" };
  if (!allowed.includes(state.sort)) state.sort = legacy[state.sort] || "addedDesc";
  els.sort.value = state.sort;
  const url = state._url || {};
  setIfOption(els.prefecture, url.pref);
  setIfOption(els.motif, url.motif);
  setIfOption(els.material, url.material);
  setIfOption(els.status, url.status);
  els.maxPrice.value = url.max || "";
}

function setIfOption(select, value) {
  if (!value) {
    select.value = "";
    return;
  }
  if ([...select.options].some(o => o.value === value)) select.value = value;
}

function writeUrl() {
  if (!els.prefecture) return;
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (els.prefecture.value) params.set("pref", els.prefecture.value);
  if (els.motif.value) params.set("motif", els.motif.value);
  if (els.material.value) params.set("material", els.material.value);
  if (els.status.value) params.set("status", els.status.value);
  if (els.maxPrice.value) params.set("max", els.maxPrice.value);
  if (state.sort && state.sort !== "addedDesc") params.set("sort", state.sort);
  if (state.favoritesOnly) params.set("fav", "1");
  const next = `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash}`;
  if (next !== `${location.pathname}${location.search}${location.hash}`) {
    history.replaceState(null, "", next);
  }
}

async function loadChangelog() {
  try {
    const response = await fetch(CHANGELOG_URL, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    const latest = (data.updates || [])[0];
    if (latest?.date) els.dataUpdated.textContent = `資料更新：${latest.date}　${latest.summary || ""}`;
  } catch {
    /* optional */
  }
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "copy-toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2200);
}
