/**
 * CAHDeck — merged into canvas.js so a single external script covers all logic.
 * This avoids CSP issues with inline scripts on archive.org and eliminates
 * the risk of CAHDeck.js not being captured/sequenced correctly by archivers.
 * The standalone CAHDeck.js file is kept for library users but is no longer
 * loaded by index.html.
 */
class CAHDeck {
  _hydrateCompact(json) {
    let packs = [];
    for (let pack of json.packs) {
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
 * END OF MERGED CAHDeck
 */

let cardSprites = [];
function updateCard(card) {
  if (card.atRest) {
    return;
  }
  card.x += (card.tx - card.x) / card.steps;
  card.y += (card.ty - card.y) / card.steps;
  card.rot += (card.trot - card.rot) / card.steps;
  // Ignore the Achilles Paradox at the end
  if (Math.abs(card.tx - card.x) < 2) {
    card.atRest = true;
  }
}

const cardWidth = 200,
  cardHeight = 300,
  cardPadding = 20,
  fontSize = 18;
const cardOffsetX = cardWidth / 2,
  cardOffsetY = cardHeight / 2,
  lineHeight = fontSize * 1.15;
function drawCard(card) {
  c.save();
  c.translate(card.x, card.y);
  c.rotate(card.rot);
  c.fillStyle = card.black ? "#000" : "#fff";
  c.fillRect(-cardOffsetX, -cardOffsetY, cardWidth, cardHeight);
  // Text
  c.fillStyle = card.black ? "#fff" : "#000";
  for (let i = 0; i < card.text.length; i++) {
    c.fillText(
      card.text[i],
      -cardOffsetX + cardPadding,
      -cardOffsetY + cardPadding + lineHeight * i
    );
  }
  c.restore();
}

// Split the text into lines that will fit on the card
function wrap(text) {
  let words = text.split(" ");
  let lines = [];
  let prev = words[0];
  let curr = words[0];
  for (let i = 1; i < words.length; i++) {
    curr += " " + words[i];
    let tm = c.measureText(curr);
    if (tm.width > cardWidth - cardPadding * 2 - 5) {
      lines.push(prev);
      curr = words[i];
    }
    prev = curr;
  }
  lines.push(curr);
  return lines;
}

/**
 * Make a new card object
 *
 * Starts off the leftside of the screen,
 * should pass thru the button.
 */
function makeCard(card, cx, cy) {
  let tx = (Math.random() * 0.7 + 0.3) * a.width;
  let ty = Math.random() * a.height;
  let angle = Math.atan2(ty - cy, tx - cx);
  let x = -200;
  return {
    steps: 10 + (Math.random() * 4 - 2),
    black: typeof card.pick != "undefined",
    text: wrap(card.text.replace(/_/g, "_____")),
    tx,
    ty,
    x,
    y: ty - (tx - x) * Math.sin(angle),
    rot: Math.random() * -Math.PI,
    trot: ((Math.random() * 2 - 1) * Math.PI) / 4,
  };
}

let loadedPacks = {};
function shuffle(arr) {
  arr.sort((a, b) => Math.random() * 2 - 1); // Random number instead of comparison
}
function addCards(btn) {
  let index = btn.dataset.pack;
  if (typeof loadDecks[index] == "undefined") {
    loadedPacks[index] = deck.getPack(index);
  }
  let pack = loadedPacks[index];
  shuffle(pack.white);
  shuffle(pack.black);
  let cards = pack.white.slice(0, 12);
  cards.push(...pack.black.slice(0, 4));
  let box = btn.getBoundingClientRect();
  let cx = box.left + box.width / 2;
  let cy = box.top + box.height / 2;
  cardSprites.push(...cards.map((card) => makeCard(card, cx, cy)));
  if (cardSprites.length > 200) {
    cardSprites = cardSprites.slice(50);
  }
}

function bindPackBtns(context) {
  context.querySelectorAll(".deck-btn").forEach((btn) => {
    btn.addEventListener(
      "click",
      function btnClick() {
        addCards(btn);
      },
      false
    );
  });
}

let deck;
function loadDecks(_deck) {
  deck = _deck;
  let packs = deck.listPacks();
  packs.forEach((p, i) => p.index = i);
  packs = packs.sort((a, b) => {
    if (a.abbr == "Base") {
      return -1;
    }
    if (b.abbr == "Base") {
      return 1;
    }
    if (a.official != b.official) {
      return a.official ? -1 : 1;
    }
    if (a.official) {
      return b.counts.total - a.counts.total;
    }
    return a.name < b.name ? -1 : 1;
  });

  let html = "";
  for (let pack of packs) {
    html += `<li class="deck" role="none">
      <button class="deck-btn" data-pack="${pack.index}">
        ${pack.name}
      </button>
    </li>`;
  }

  let packsEl = document.getElementById("pack-list");
  packsEl.innerHTML = html;
  bindPackBtns(packsEl);
  loop();
}

CAHDeck.fromCompact("https://raw.githubusercontent.com/FireRat666/json-against-humanity/latest/cah-all-compact.json").then(loadDecks);

let a, c;
function initCanvas() {
  a = document.getElementById("a");
  a.width = a.offsetWidth;
  a.height = a.offsetHeight;
  c = a.getContext("2d");
  c.textAlign = "left";
  c.textBaseline = "top";
  c.font = `500 ${fontSize}px Inter`;
}
function update() {
  for (let i = 0; i < cardSprites.length; i++) {
    updateCard(cardSprites[i]);
  }
}
function render() {
  c.clearRect(0, 0, a.width, a.height);
  for (let i = 0; i < cardSprites.length; i++) {
    drawCard(cardSprites[i]);
  }
}

/**
 * GameLoop borrowed from Kontra.js
 * https://github.com/straker/kontra/blob/master/src/gameLoop.js
 */
const fps = 30;
let accumulator = 0;
let delta = 1e3 / fps; // delta between performance.now timings (in ms)
let step = 1 / fps;
let rAF, now, dt;
const performance = window.performance || Date;
let last = performance.now();
function loop() {
  rAF = requestAnimationFrame(loop);

  now = performance.now();
  dt = now - last;
  last = now;

  // prevent updating the game with a very large dt if the game were to lose focus
  // and then regain focus later
  if (dt > 1e3) {
    return;
  }

  accumulator += dt;

  while (accumulator >= delta) {
    update();

    accumulator -= delta;
  }

  render();
}

initCanvas();
