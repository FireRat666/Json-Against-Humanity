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
  let sum = 0;
  for (let index of selectedDecks) {
    if (PACKLIST[index]) sum += PACKLIST[index].counts.total;
  }
  
  if (sum === 0) tallyEl.innerHTML = "f-ckin' nothin'";
  else if (sum === 1) tallyEl.innerHTML = "1 card";
  else if (sum === 69) tallyEl.innerHTML = "69 cards. Nice";
  else tallyEl.innerHTML = `${comma(sum)} cards`;
}

/**
 * UI RENDERING
 */
function cardCounts(_deck) {
  const packs = _deck.listPacks();
  const totalCount = packs.reduce((sum, p) => sum + p.counts.total, 0);
  const official = packs.filter(p => p.official);
  const officialCount = official.reduce((sum, p) => sum + p.counts.total, 0);
  const fanCount = totalCount - officialCount;

  const html = `
    <p>There are <strong>${comma(totalCount)}</strong> cards available from <strong>${comma(packs.length)}</strong> packs.</p>
    <ul>
      <li><strong>${comma(officialCount)}</strong> official cards from ${official.length} products.</li>
      <li><strong>${comma(fanCount)}</strong> fan-made cards from around the world.</li>
    </ul>
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
    download("cah-cards-full.json", JSON.stringify(json, null, 2));
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
 * INITIALIZATION
 */
const DATA_URL = "https://raw.githubusercontent.com/FireRat666/json-against-humanity/latest/cah-all-compact.json";

CAHDeck.fromCompact(DATA_URL).then(_deck => {
  deck = _deck;
  cardCounts(_deck);
  renderDecks(_deck.listPacks());
  setupBulkControls();
  setupSearch();
  setupCollapsibles();
  setupDownloads();
  setupTheme();
});

