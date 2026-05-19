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
