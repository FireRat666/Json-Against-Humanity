/**
 * CAHDeck — merged into site.js so a single external script covers all logic.
 * This avoids CSP issues with inline scripts on archive.org and eliminates
 * the risk of CAHDeck.js not being captured/sequenced correctly by archivers.
 * The standalone CAHDeck.js file is kept for library users but is no longer
 * loaded by index.html.
 */
class CAHDeck {
  _hydrateCompact(json) {
    let packs = [];
    const sourcePacks = Array.isArray(json.packs) ? json.packs : Object.values(json.packs);
    for (let pack of sourcePacks) {
      pack.white = pack.white.map((index) =>
        Object.assign(
          {},
          { text: json.white[index] },
          { pack: packs.length }
        )
      );
      pack.black = pack.black.map((index) =>
        Object.assign(
          {},
          json.black[index],
          { pack: packs.length }
        )
      );
      packs.push(pack);
    }
    return packs;
  }

  async _loadDeck() {
    if (typeof this.compactSrc != "undefined") {
      let json = await fetch(this.compactSrc).then((data) => data.json());
      // Snapshot pool sizes and pack index arrays BEFORE _hydrateCompact mutates json.packs.
      // _hydrateCompact replaces each pack's white/black index arrays with hydrated card objects,
      // so we must copy the raw integer indices now for correct deduplication later.
      this.rawPoolSize = { white: json.white.length, black: json.black.length };
      this.rawPackIndices = json.packs.map(p => ({
        white: Array.from(p.white || []),
        black: Array.from(p.black || []),
      }));
      this.deck = this._hydrateCompact(json);
    } else if (typeof this.fullSrc != "undefined") {
      this.deck = await fetch(this.fullSrc).then((data) => data.json());
    } else {
      throw Error(
        "No source specified, please use CAHDeck.fromCompact(src) or CAHDeck.fromFull(src) to make your objects."
      );
    }
  }

  static async fromCompact(compactSrc) {
    let n = new CAHDeck();
    n.compactSrc = compactSrc;
    await n._loadDeck();
    return n;
  }

  static fromCompactJson(json) {
    let n = new CAHDeck();
    n._loadDeckFromJson(json);
    return n;
  }

  _loadDeckFromJson(json) {
    this.rawPoolSize = { white: json.white.length, black: json.black.length };
    this.rawPackIndices = json.packs.map(p => ({
      white: Array.from(p.white || []),
      black: Array.from(p.black || []),
    }));
    this.deck = this._hydrateCompact(json);
  }

  static async fromFull(fullSrc) {
    let n = new CAHDeck();
    n.fullSrc = fullSrc;
    await n._loadDeck();
    return n;
  }

  listPacks() {
    let packs = [];
    let id = 0;
    for (let { name, official, description, white, black, sheetName } of this.deck) {
      let pack = {
        id,
        name,
        official,
        description,
        sheetName,
        counts: {
          white: white.length,
          black: black.length,
          total: white.length + black.length,
        },
      };
      packs.push(pack);
      id += 1;
    }
    return packs;
  }

  /**
   * Returns the total number of unique cards in the entire database pool.
   * These are the deduplicated counts across ALL packs.
   */
  getPoolCounts() {
    if (this.rawPoolSize) {
      return {
        white: this.rawPoolSize.white,
        black: this.rawPoolSize.black,
        total: this.rawPoolSize.white + this.rawPoolSize.black,
      };
    }
    // Fallback for full.json format (no shared pool)
    const packs = this.deck;
    return {
      white: new Set(packs.flatMap(p => p.white.map(c => c.text))).size,
      black: new Set(packs.flatMap(p => p.black.map(c => c.text))).size,
      total: 0,
    };
  }

  /**
   * Returns unique card counts for a selection of pack indexes.
   * Uses Sets of pool indices (integers) so shared cards are counted only once.
   * @param {number[]} indexes Array of pack IDs (numeric)
   */
  getUniqueCountsForSelection(indexes) {
    const whiteSet = new Set();
    const blackSet = new Set();
    if (this.rawPackIndices) {
      // compact format: rawPackIndices[id] holds the original integer index arrays
      for (const id of indexes) {
        const pack = this.rawPackIndices[id];
        if (!pack) continue;
        pack.white.forEach(i => whiteSet.add(i));
        pack.black.forEach(i => blackSet.add(i));
      }
    } else {
      // full.json fallback: deduplicate by text
      for (const id of indexes) {
        const pack = this.deck[id];
        if (!pack) continue;
        pack.white.forEach(c => whiteSet.add(c.text));
        pack.black.forEach(c => blackSet.add(c.text));
      }
    }
    return {
      white: whiteSet.size,
      black: blackSet.size,
      total: whiteSet.size + blackSet.size,
    };
  }

  getPack(index) {
    return this.deck[index];
  }

  getPacks(indexes) {
    if (typeof indexes == "undefined") {
      indexes = Object.keys(this.deck);
    }
    let white = [];
    let black = [];
    for (let pack of indexes) {
      if (typeof this.deck[pack] != "undefined") {
        white.push(...this.deck[pack].white);
        black.push(...this.deck[pack].black);
      }
    }
    return { white, black };
  }
}

/**
 * UTILITIES
 */
function comma(number) {
  return Number(number).toLocaleString();
}

function esc(text) {
  return text.replace(/\n/g, "\\n");
}

/**
 * STATE MANAGEMENT
 */
let deck;
let PACKLIST = [];
let selectedDecks = new Set();
let tallyEl;

function tallySelected() {
  if (!tallyEl) tallyEl = document.getElementById("checkout-count");
  let totalInstances = 0;
  for (let index of selectedDecks) {
    if (PACKLIST[index]) totalInstances += PACKLIST[index].counts.total;
  }

  if (totalInstances === 0) {
    tallyEl.innerHTML = "f-ckin' nothin'";
    return;
  }

  // Compute unique counts using pool indices (deduplicates cards shared between packs)
  const ids = Array.from(selectedDecks).map(Number);
  const unique = deck ? deck.getUniqueCountsForSelection(ids) : null;

  if (unique) {
    const uniqueStr = comma(unique.total);
    const totalStr  = comma(totalInstances);
    if (unique.total === totalInstances) {
      // No duplicates across selected packs — just show the count cleanly
      tallyEl.innerHTML = `<strong>${uniqueStr}</strong> unique cards`;
    } else {
      tallyEl.innerHTML =
        `<strong>${uniqueStr}</strong> unique / <span class="tally-total">${totalStr} total</span> cards`;
    }
  } else {
    if (totalInstances === 1)  tallyEl.innerHTML = "1 card";
    else if (totalInstances === 69) tallyEl.innerHTML = "69 cards. Nice";
    else tallyEl.innerHTML = `${comma(totalInstances)} cards`;
  }
}

/**
 * UI RENDERING
 */
function cardCounts(_deck) {
  const packs = _deck.listPacks();
  const totalInstances = packs.reduce((sum, p) => sum + p.counts.total, 0);
  const official = packs.filter(p => p.official);
  const officialInstances = official.reduce((sum, p) => sum + p.counts.total, 0);
  const fanInstances = totalInstances - officialInstances;

  // Unique counts come from the shared pool (deduplicated across all packs)
  const pool = _deck.getPoolCounts();

  const html = `
    <p>There are <strong>${comma(totalInstances)}</strong> cards available
       (<strong>${comma(pool.total)}</strong> unique) from <strong>${comma(packs.length)}</strong> packs.</p>
    <ul>
      <li><strong>${comma(officialInstances)}</strong> official cards from ${official.length} products.</li>
      <li><strong>${comma(fanInstances)}</strong> fan-made cards from around the world.</li>
    </ul>
    <p class="unique-note">The unique count removes duplicates that appear in multiple packs:
       <strong>${comma(pool.white)}</strong> unique response cards
       and <strong>${comma(pool.black)}</strong> unique prompt cards.</p>
  `;
  document.getElementById("card-counts").innerHTML = html;
}

function renderDecks(packs) {
  const deckListEl = document.getElementById("deck-list");
  // Group by sheetName
  const grouped = packs.reduce((acc, p) => {
    const sheet = p.sheetName || "Other Decks";
    if (!acc[sheet]) acc[sheet] = [];
    acc[sheet].push(p);
    return acc;
  }, {});

  let html = '';
  Object.keys(grouped).sort().forEach(sheet => {
    html += `
      <div class="group-header">
        <span>${sheet}</span>
        <div class="group-header-actions">
          <button class="group-header-btn" data-sheet="${sheet}">Select All</button>
        </div>
      </div>
      <ul class="deck-list">`;
    
    grouped[sheet].sort((a, b) => a.name.localeCompare(b.name)).forEach(pack => {
      const isChecked = selectedDecks.has(pack.id.toString()) || pack.official;
      if (isChecked) selectedDecks.add(pack.id.toString());
      
      html += `
        <li class="deck">
          <button class="deck-btn ${pack.official ? "is-official" : ""} ${isChecked ? "is-checked" : ""}" 
                  data-pack="${pack.id}" 
                  data-name="${pack.name.toLowerCase()}"
                  data-sheet="${pack.sheetName || "Other Decks"}">
            ${pack.name}
          </button>
        </li>
      `;
      PACKLIST[pack.id] = pack;
    });
    html += '</ul>';
  });

  deckListEl.innerHTML = html;
  renderSheetBulkControls(Object.keys(grouped).sort());
  bindPackBtns(deckListEl);
  bindSheetBtns();
  syncBulkStates();
  tallySelected();
}

function renderSheetBulkControls(sheets) {
  const container = document.getElementById("bulk-sheets");
  if (!container) return;
  
  let html = '';
  sheets.forEach(sheet => {
    html += `<button class="sheet-btn" data-sheet="${sheet}" title="${sheet}">${sheet}</button>`;
  });
  container.innerHTML = html;
}

function bindSheetBtns() {
  // Bind buttons in the Bulk Controls section
  document.querySelectorAll(".sheet-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const sheet = btn.dataset.sheet;
      const isChecked = btn.classList.toggle("is-checked");
      bulkToggleSheet(sheet, isChecked);
    });
  });

  // Bind buttons in the Group Headers
  document.querySelectorAll(".group-header-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const sheet = btn.dataset.sheet;
      const isChecked = btn.classList.toggle("is-checked");
      bulkToggleSheet(sheet, isChecked);
    });
  });
}

function bulkToggleSheet(sheet, isChecked) {
  const targets = document.querySelectorAll(`#deck-list .deck-btn[data-sheet="${sheet}"]`);
  targets.forEach(t => {
    t.classList.toggle("is-checked", isChecked);
    if (isChecked) selectedDecks.add(t.dataset.pack);
    else selectedDecks.delete(t.dataset.pack);
  });
  syncBulkStates();
  tallySelected();
}

/**
 * EVENT HANDLERS
 */
function bindPackBtns(container) {
  container.querySelectorAll(".deck-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const isChecked = btn.classList.toggle("is-checked");
      const id = btn.dataset.pack;
      if (isChecked) selectedDecks.add(id);
      else selectedDecks.delete(id);
      
      syncBulkStates();
      tallySelected();
    });
  });
}

function syncBulkStates() {
  const allPacks = document.querySelectorAll("#deck-list .deck-btn");
  const officialPacks = document.querySelectorAll("#deck-list .deck-btn.is-official");
  
  const allChecked = allPacks.length > 0 && Array.from(allPacks).every(b => b.classList.contains("is-checked"));
  const officialChecked = officialPacks.length > 0 && Array.from(officialPacks).every(b => b.classList.contains("is-checked"));

  document.getElementById("select-all").classList.toggle("is-checked", allChecked);
  document.getElementById("select-official").classList.toggle("is-checked", officialChecked);

  // Sync sheet buttons (both in bulk grid and headers)
  const sheets = new Set();
  document.querySelectorAll("#deck-list .deck-btn").forEach(btn => sheets.add(btn.dataset.sheet));
  
  sheets.forEach(sheet => {
    const sheetPacks = document.querySelectorAll(`#deck-list .deck-btn[data-sheet="${sheet}"]`);
    const sheetChecked = sheetPacks.length > 0 && Array.from(sheetPacks).every(b => b.classList.contains("is-checked"));
    
    document.querySelectorAll(`.sheet-btn[data-sheet="${sheet}"], .group-header-btn[data-sheet="${sheet}"]`).forEach(btn => {
      btn.classList.toggle("is-checked", sheetChecked);
      if (btn.classList.contains("group-header-btn")) {
        btn.textContent = sheetChecked ? "Deselect All" : "Select All";
      }
    });
  });
}

function setupBulkControls() {
  const bulkActions = {
    "select-all": ".deck-btn",
    "select-official": ".deck-btn.is-official"
  };

  Object.entries(bulkActions).forEach(([id, query]) => {
    document.getElementById(id).addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const isChecked = btn.classList.toggle("is-checked");
      const targets = document.querySelectorAll(`#deck-list ${query}`);
      
      targets.forEach(t => {
        t.classList.toggle("is-checked", isChecked);
        if (isChecked) selectedDecks.add(t.dataset.pack);
        else selectedDecks.delete(t.dataset.pack);
      });
      
      syncBulkStates();
      tallySelected();
    });
  });
}

function setupCollapsibles() {
  const toggles = [
    { btnId: "toggle-sheets", targetId: "bulk-sheets" },
    { btnId: "toggle-decks", targetId: "deck-selection-content" }
  ];

  toggles.forEach(({ btnId, targetId }) => {
    const btn = document.getElementById(btnId);
    const target = document.getElementById(targetId);
    if (!btn || !target) return;

    btn.addEventListener("click", () => {
      // Toggle a general collapsed class
      const isCollapsed = target.classList.toggle("is-collapsed");
      // If it was collapsed by mobile default, we should also remove that class to ensure it shows up
      if (target.classList.contains("is-collapsed-mobile")) {
        target.classList.remove("is-collapsed-mobile");
      }
      
      updateToggleUI(btn, isCollapsed);
    });
  });

  // Initial state for mobile
  if (window.innerWidth <= 991) {
    const deckTarget = document.getElementById("deck-selection-content");
    const deckBtn = document.getElementById("toggle-decks");
    if (deckTarget && deckBtn) {
      deckTarget.classList.add("is-collapsed-mobile");
      updateToggleUI(deckBtn, true);
    }
  }
}

function updateToggleUI(btn, isCollapsed) {
  const label = btn.querySelector(".toggle-label");
  const icon = btn.querySelector("i");
  if (!label || !icon) return;
  
  if (isCollapsed) {
    label.textContent = "Show";
    icon.className = "fas fa-chevron-down";
    btn.classList.remove("is-active");
  } else {
    label.textContent = "Hide";
    icon.className = "fas fa-chevron-up";
    btn.classList.add("is-active");
  }
}

function setupSearch() {
  const searchInput = document.getElementById("deck-search");
  searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const items = document.querySelectorAll("#deck-list .deck");
    const headers = document.querySelectorAll("#deck-list .group-header");
    
    items.forEach(item => {
      const btn = item.querySelector(".deck-btn");
      const name = btn.dataset.name;
      const sheet = btn.dataset.sheet.toLowerCase();
      const visible = name.includes(term) || sheet.includes(term);
      item.classList.toggle("hidden", !visible);
    });

    // Hide headers if no items in group are visible
    headers.forEach(header => {
      let next = header.nextElementSibling;
      let hasVisible = false;
      while (next && next.tagName === "UL") {
        if (Array.from(next.children).some(li => !li.classList.contains("hidden"))) {
          hasVisible = true;
          break;
        }
        next = next.nextElementSibling;
      }
      header.classList.toggle("hidden", !hasVisible);
    });
  });
}

/**
 * DOWNLOAD LOGIC
 */
let downloadLink;
function download(filename, text) {
  if (!downloadLink) downloadLink = document.getElementById("download-link");
  downloadLink.setAttribute("href", "data:text/json;charset=utf-8," + encodeURIComponent(text));
  downloadLink.setAttribute("download", filename);
  downloadLink.click();
}

function setupDownloads() {
  // Download Plaintext
  document.getElementById("download-text").addEventListener("click", () => {
    const packs = deck.getPacks(Array.from(selectedDecks));
    const text = packs.white.map(c => esc(c.text)).join("\n") + 
                 "\n----------\n" + 
                 packs.black.map(c => esc(c.text)).join("\n");
    download("cah-cards-plain.txt", text);
  });

  // Download Full JSON
  document.getElementById("download-full").addEventListener("click", () => {
    const json = Array.from(selectedDecks).map(id => {
      const pack = JSON.parse(JSON.stringify(deck.getPack(id)));
      pack.white.forEach(c => c.pack = id);
      pack.black.forEach(c => c.pack = id);
      return pack;
    });
    download("cah-cards-full.json", JSON.stringify(json)); // Removed null, 2 For Pretty Printing
  });

  // Download Compact JSON
  document.getElementById("download-compact").addEventListener("click", () => {
    const selected = Array.from(selectedDecks);
    const packs = deck.getPacks(selected);
    const white = [];
    const black = [];
    const metadata = {};

    selected.forEach(id => {
      metadata[id] = { ...PACKLIST[id], white: [], black: [] };
      delete metadata[id].counts;
    });

    packs.white.forEach(c => {
      let idx = white.indexOf(esc(c.text));
      if (idx === -1) {
        idx = white.length;
        white.push(esc(c.text));
      }
      metadata[c.pack].white.push(idx);
    });

    packs.black.forEach(c => {
      const text = esc(c.text);
      let idx = black.findIndex(b => b.text === text);
      if (idx === -1) {
        idx = black.length;
        black.push({ text, pick: c.pick });
      }
      metadata[c.pack].black.push(idx);
    });

    download("cah-cards-compact.json", JSON.stringify({ white, black, packs: metadata }));
  });
}

/**
 * THEME LOGIC
 */
function setupTheme() {
  const themeToggle = document.getElementById("theme-toggle");
  const icon = themeToggle.querySelector("i");
  themeToggle.addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light-theme");
    icon.className = isLight ? "fas fa-sun" : "fas fa-moon";
    localStorage.setItem("theme", isLight ? "light" : "dark");
  });

  if (localStorage.getItem("theme") === "light") {
    document.body.classList.add("light-theme");
    icon.className = "fas fa-sun";
  }
}

/**
 * DECK COMBINING & TOGGLE LOGIC
 */
const CAH_URL = "https://raw.githubusercontent.com/FireRat666/json-against-humanity/latest/cah-all-compact.json";
const MD_URL = "https://raw.githubusercontent.com/FireRat666/json-against-humanity/latest/md-all-compact.json";

let cahJsonData = null;
let mdJsonData = null;

function combineDecks(cahJson, mdJson) {
  const combined = {
    white: [...cahJson.white],
    black: [...cahJson.black],
    mechanic: [...(cahJson.mechanic || [])],
    packs: []
  };

  const cahPacks = Array.isArray(cahJson.packs) ? cahJson.packs : Object.values(cahJson.packs);
  cahPacks.forEach(p => {
    combined.packs.push({
      ...p,
      white: [...p.white],
      black: [...p.black],
      mechanic: p.mechanic ? [...p.mechanic] : []
    });
  });

  const whiteOffset = cahJson.white.length;
  const blackOffset = cahJson.black.length;
  const mechanicOffset = (cahJson.mechanic || []).length;

  const mdPacks = Array.isArray(mdJson.packs) ? mdJson.packs : Object.values(mdJson.packs);
  mdPacks.forEach(p => {
    combined.packs.push({
      ...p,
      white: p.white.map(idx => idx + whiteOffset),
      black: p.black.map(idx => idx + blackOffset),
      mechanic: (p.mechanic || []).map(idx => idx + mechanicOffset)
    });
  });

  combined.white.push(...mdJson.white);
  combined.black.push(...mdJson.black);
  if (mdJson.mechanic) {
    combined.mechanic.push(...mdJson.mechanic);
  }

  return combined;
}

function setupSourceSelectors() {
  const mdCheckbox = document.getElementById("source-manydecks");
  const mdLabelText = document.getElementById("manydecks-label-text");
  if (!mdCheckbox) return;

  mdCheckbox.addEventListener("change", async () => {
    mdCheckbox.disabled = true;
    if (mdCheckbox.checked) {
      mdLabelText.textContent = "Loading ManyDecks... (24MB)";
      try {
        if (!mdJsonData) {
          const res = await fetch(MD_URL);
          if (!res.ok) throw new Error("Network response was not ok");
          mdJsonData = await res.json();
        }
        
        const combinedJson = combineDecks(cahJsonData, mdJsonData);
        deck = CAHDeck.fromCompactJson(combinedJson);
      } catch (err) {
        console.error("Failed to load md-all-compact.json", err);
        alert("Failed to load ManyDecks. Please check your connection and try again.");
        mdCheckbox.checked = false;
        deck = CAHDeck.fromCompactJson(cahJsonData);
      } finally {
        mdLabelText.textContent = "ManyDecks (md-all-compact)";
        mdCheckbox.disabled = false;
      }
    } else {
      deck = CAHDeck.fromCompactJson(cahJsonData);
      // Clean up selected decks
      const mainPacksCount = cahJsonData.packs.length;
      const newSelectedDecks = new Set();
      selectedDecks.forEach(idStr => {
        const id = parseInt(idStr, 10);
        if (id < mainPacksCount) {
          newSelectedDecks.add(idStr);
        }
      });
      selectedDecks = newSelectedDecks;
      mdCheckbox.disabled = false;
    }

    cardCounts(deck);
    renderDecks(deck.listPacks());
  });
}

/**
 * INITIALIZATION
 */
fetch(CAH_URL)
  .then(res => res.json())
  .then(json => {
    cahJsonData = json;
    deck = CAHDeck.fromCompactJson(json);
    cardCounts(deck);
    renderDecks(deck.listPacks());
    setupBulkControls();
    setupSearch();
    setupCollapsibles();
    setupDownloads();
    setupTheme();
    setupSourceSelectors();
  })
  .catch(err => {
    console.error("Failed to initialize cards deck:", err);
  });

