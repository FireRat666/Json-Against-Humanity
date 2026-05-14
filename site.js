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
    html += `<div class="group-header">${sheet}</div><ul class="deck-list">`;
    grouped[sheet].sort((a, b) => a.name.localeCompare(b.name)).forEach(pack => {
      const isChecked = selectedDecks.has(pack.id.toString()) || pack.official;
      if (isChecked) selectedDecks.add(pack.id.toString());
      
      html += `
        <li class="deck">
          <button class="deck-btn ${pack.official ? "is-official" : ""} ${isChecked ? "is-checked" : ""}" 
                  data-pack="${pack.id}" 
                  data-name="${pack.name.toLowerCase()}"
                  data-sheet="${pack.sheetName || ""}">
            ${pack.name}
          </button>
        </li>
      `;
      PACKLIST[pack.id] = pack;
    });
    html += '</ul>';
  });

  deckListEl.innerHTML = html;
  bindPackBtns(deckListEl);
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
  setupDownloads();
  setupTheme();
});

