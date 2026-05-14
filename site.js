function comma(number) {
  return Number(number).toLocaleString();
}
function esc(text) {
  return text.replace(/\n/g, "\\n");
}

let tallyEl;
let selectedDecks = new Set();
function tallySelected() {
  if (typeof tallyEl == "undefined") {
    tallyEl = document.getElementById("checkout-count");
  }
  let sum = 0;
  for (let index of selectedDecks) {
    sum += PACKLIST[index].counts.total;
  }
  switch (sum) {
    case 0:
      tallyEl.innerHTML = "f-ckin' nothin'";
      break;
    case 1:
      tallyEl.innerHTML = "a single, lonesome card";
      break;
    case 69:
      tallyEl.innerHTML = `${comma(sum)} cards. Nice`;
      break;
    default:
      tallyEl.innerHTML = `${comma(sum)} cards`;
  }
}

function syncBulkStates() {
  const bulkBtns = document.querySelectorAll("#bulk-controls .deck-btn");
  const deckList = document.getElementById("deck-list");
  if (!deckList) return;

  const allPacks = deckList.querySelectorAll(".deck-btn");
  const officialPacks = deckList.querySelectorAll(".deck-btn.is-official");

  bulkBtns.forEach(mainBtn => {
    if (mainBtn.id === "select-all") {
      const allChecked = allPacks.length > 0 && Array.from(allPacks).every(btn => btn.classList.contains("is-checked"));
      mainBtn.classList.toggle("is-checked", allChecked);
    } else if (mainBtn.id === "select-official") {
      const allOfficialChecked = officialPacks.length > 0 && Array.from(officialPacks).every(btn => btn.classList.contains("is-checked"));
      mainBtn.classList.toggle("is-checked", allOfficialChecked);
    } else if (mainBtn.dataset.sheet) {
      const sheetPacks = deckList.querySelectorAll(`.deck-btn[data-sheet="${mainBtn.dataset.sheet}"]`);
      const allSheetChecked = sheetPacks.length > 0 && Array.from(sheetPacks).every(btn => btn.classList.contains("is-checked"));
      mainBtn.classList.toggle("is-checked", allSheetChecked);
    }
  });
}

function bindPackBtns(contEl = document) {
  contEl.querySelectorAll(".deck-btn").forEach((btn) => {
    if (
      btn.classList.contains("is-checked") &&
      typeof btn.dataset.pack != "undefined"
    ) {
      selectedDecks.add(btn.dataset.pack);
    }
    btn.addEventListener(
      "click",
      (e) => {
        btn.classList.toggle("is-checked");
        if (typeof btn.dataset.pack != "undefined") {
          if (btn.classList.contains("is-checked")) {
            selectedDecks.add(btn.dataset.pack);
          } else {
            selectedDecks.delete(btn.dataset.pack);
          }
        }
        syncBulkStates();
        tallySelected();
      },
      false
    );
  });
}

function cardCounts(deck) {
  let packs = deck.listPacks();
  let totalCount = packs.reduce((sum, pack) => sum + pack.counts.total, 0);
  let html = `<p>There are ${comma(totalCount)} cards available from ${comma(
    packs.length
  )} different packs and boxes.</p>`;

  let official = packs.filter((pack) => pack.official);
  let officialCount = official.reduce(
    (sum, pack) => sum + pack.counts.total,
    0
  );
  html += `<ul><li>That's all ${comma(officialCount)} official cards from ${
    official.length
  } different products</li>`;

  let fanCount = packs.reduce(
    (sum, pack) => sum + (pack.official ? 0 : pack.counts.total),
    0
  );
  html += `<li>Plus ${comma(
    fanCount
  )} even worse cards from fans around the world</li></ul>`;

  document.getElementById("card-counts").innerHTML = html;
}

let PACKLIST = [];
let allBtn = document.getElementById("select-all");
let officialBtn = document.getElementById("select-official");

function deckCheckboxes(deck) {
  let packs = deck.listPacks();
  packs = packs.sort((a, b) => {
    if (a.name == "CAH Base Set") return -1;
    if (b.name == "CAH Base Set") return 1;
    // Sort by sheetName primarily
    const aSheet = a.sheetName || "";
    const bSheet = b.sheetName || "";
    if (aSheet !== bSheet) {
      return aSheet.localeCompare(bSheet);
    }
    // Then sort by name secondarily
    return a.name.localeCompare(b.name);
  });

  // Identify unique sheets for bulk controls
  const uniqueSheets = [...new Set(packs.map(p => p.sheetName).filter(Boolean))].sort();
  const bulkList = document.querySelector("#bulk-controls .deck-list");
  
  // Clear existing sheet buttons if any (to avoid duplicates)
  bulkList.querySelectorAll(".sheet-btn").forEach(btn => btn.parentElement.remove());
  
  uniqueSheets.forEach(sheet => {
    const li = document.createElement("li");
    li.className = "deck";
    li.innerHTML = `<button class="deck-btn sheet-btn" data-sheet="${sheet}">
      <i class="far fa-fw"></i> Select ${sheet}
    </button>`;
    bulkList.appendChild(li);
  });

  let html = '<ul class="deck-list">';
  for (let pack of packs) {
    html += `<li class="deck">
      <button class="deck-btn${
        pack.official ? " is-official is-checked" : ""
      }" data-pack="${pack.id}" data-sheet="${pack.sheetName || ""}">${pack.name}</button>
    </li>`;
    PACKLIST[pack.id] = pack;
  }

  let decksEl = document.getElementById("deck-list");
  decksEl.innerHTML = html + "</ul>";
  bindPackBtns(decksEl);

  function setupBulkControls() {
    const allBtns = decksEl.querySelectorAll(".deck-btn");
    const bulkBtns = document.querySelectorAll("#bulk-controls .deck-btn");

    bulkBtns.forEach(mainBtn => {
      mainBtn.addEventListener("click", () => {
        const isChecked = mainBtn.classList.toggle("is-checked");
        
        let query = "";
        if (mainBtn.id === "select-all") query = ".deck-btn";
        else if (mainBtn.id === "select-official") query = ".deck-btn.is-official";
        else if (mainBtn.dataset.sheet) query = `.deck-btn[data-sheet="${mainBtn.dataset.sheet}"]`;

        if (query) {
          const targets = decksEl.querySelectorAll(query);
          targets.forEach(btn => {
            if (isChecked) {
              selectedDecks.add(btn.dataset.pack);
              btn.classList.add("is-checked");
            } else {
              selectedDecks.delete(btn.dataset.pack);
              btn.classList.remove("is-checked");
            }
          });
        }
        syncBulkStates();
        tallySelected();
      });
    });
  }

  setupBulkControls();

  let mobileDeckToggle = document.querySelector(".mobile-toggle");
  mobileDeckToggle.addEventListener(
    "click",
    function toggleMobileMenu() {
      mobileDeckToggle.classList.toggle("is-open");
      decksEl.classList.toggle("not-visually-hidden");
    },
    false
  );

  syncBulkStates();
  tallySelected();
}

let downloadLink;
function download(filename, text) {
  if (typeof downloadLink == "undefined") {
    downloadLink = document.getElementById("download-link");
  }
  downloadLink.setAttribute(
    "href",
    "data:text/json;charset=utf-8," + encodeURIComponent(text)
  );
  downloadLink.setAttribute("download", filename);
  downloadLink.click();
}
document.getElementById("download-compact").addEventListener(
  "click",
  function () {
    let selected = Array.from(selectedDecks);
    selected.sort(
      (a, b) => PACKLIST[b].counts.total - PACKLIST[a].counts.total
    );
    let packs = deck.getPacks(selected);
    let indexes = {};
    for (let abbr of selectedDecks) {
      indexes[abbr] = { white: [], black: [] };
    }
    let white = [];
    packs.white.forEach((c) => {
      let index = white.indexOf(esc(c.text));
      if (index === -1) {
        indexes[c.pack].white.push(white.length);
        white.push(esc(c.text));
      } else {
        indexes[c.pack].white.push(index);
      }
    });
    let black = [];
    let blackHashes = [];
    packs.black.forEach((c) => {
      let index = blackHashes.indexOf(c.text);
      if (index === -1) {
        indexes[c.pack].black.push(black.length);
        blackHashes.push(c.text);
        black.push({ text: esc(c.text), pick: c.pick });
      } else {
        indexes[c.pack].black.push(index);
      }
    });
    let metadata = {};
    for (let abbr of selectedDecks) {
      metadata[abbr] = Object.assign({}, PACKLIST[abbr], {
        white: indexes[abbr].white,
        black: indexes[abbr].black,
      });
      delete metadata[abbr].counts;
    }
    download(
      "cah-cards-compact.json",
      JSON.stringify({ white, black, metadata })
    );
  },
  false
);
document.getElementById("download-full").addEventListener(
  "click",
  function () {
    let json = [];
    for (let id of selectedDecks) {
      let pack = deck.getPack(id);
      pack.white.forEach(card => card.pack = json.length);
      pack.black.forEach(card => card.pack = json.length);
      json.push(pack);
    }
    download("cah-cards-full.json", JSON.stringify(json));
  },
  false
);
document.getElementById("download-text").addEventListener(
  "click",
  function () {
    let packs = deck.getPacks(Array.from(selectedDecks));
    let text =
      packs.white.map((c) => esc(c.text)).join("\n") +
      "\n----------\n" +
      packs.black.map((c) => esc(c.text)).join("\n");
    download("cah-cards-plain.txt", text);
  },
  false
);

let deck;
CAHDeck.fromCompact("https://raw.githubusercontent.com/FireRat666/json-against-humanity/latest/cah-all-compact.json").then((_deck) => {
  deck = _deck;
  cardCounts(_deck);
  deckCheckboxes(_deck);
});

// Theme Toggle Logic
const themeToggle = document.getElementById("theme-toggle");
if (themeToggle) {
  const icon = themeToggle.querySelector("i");
  
  themeToggle.addEventListener("click", () => {
    const isCurrentlyLight = document.body.classList.toggle("light-theme");
    if (isCurrentlyLight) {
      icon.classList.replace("fa-moon", "fa-sun");
    } else {
      icon.classList.replace("fa-sun", "fa-moon");
    }
  });
}
