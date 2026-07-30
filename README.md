# [JSON Against Humanity](https://jah.firer.at/)

[![CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](http://creativecommons.org/licenses/by-nc-sa/4.0/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/FireRat666/json-against-humanity/issues)

Finally, [Cards Against Humanity](https://cardsagainsthumanity.com/) compiled and organized as clean plain text and structured JSON. 

This repository contains tools and datasets for the complete Cards Against Humanity card corpus, aggregating over **64,000+ unique cards** across **420+ official and fan-made packs**.

Check out the web interface demo at [jah.firer.at](https://jah.firer.at/) to browse, search, filter, combine, and export packs!

---

## Key Features

* **Aggregated Card Corpus**: Consolidates official sets, discontinued expansions, limited holiday releases, PAX promo decks, third-party commercial cards, and fan expansions side-by-side.
* **Intelligent Deduplication**: Automatically deduplicates card text globally and inside individual packs, meaning the data loads cleanly into relational databases (like SQLite or Postgres) with unique relational constraints.
* **Text Normalization**: Exotic unicode characters, quote marks, and spaces are normalized and cleaned up.
* **Optimized Formats**: Includes both flat-file JSON formats (`full.json`) and a highly-optimized indexed format (`compact.json`) that saves bandwidth by referencing a shared card pool.
* **Active Sheets Builder**: Includes a Node.js utility to fetch, parse, validate, and build the card datasets directly from public Google Spreadsheets.

---

## File Formats

### 1. Compact JSON (`cah-all-compact.json`)
Optimized for minimum file size and web deployment. It uses a shared pool of unique white, black (prompt), and mechanic cards. Individual packs reference these cards by their index positions in the global arrays.

```json
{
  "white": [
    "Being black.",
    "Irritable Bowel Syndrome.",
    "A room full of nightmares."
  ],
  "black": [
    { "text": "Next from J.K. Rowling: Harry Potter and the chamber of _.", "pick": 1 }
  ],
  "mechanic": [
    "The Ultimate TRUMP Card"
  ],
  "packs": [
    {
      "name": "Babies Against Parenthood",
      "official": false,
      "sheetName": "Fan Expansions",
      "white": [2],
      "black": [0],
      "mechanic": [0],
      "code": "BAP",
      "author": "John Doe",
      "language": "en"
    }
  ]
}
```

### 2. Full JSON (`cah-all-full.json`)
A straightforward format where every pack object is fully self-contained. Card text is fully duplicated inside each pack, making it extremely easy to parse in simple client scripts.

```json
[
  {
    "name": "Cards Against Humanity: Main Deck (All Versions)",
    "official": true,
    "white": [
      { "text": "Being black.", "pack": 0 }
    ],
    "black": [
      { "text": "Next from J.K. Rowling: Harry Potter and the chamber of _.", "pick": 1, "pack": 0 }
    ]
  }
]
```

### 3. Plaintext (`cah-all-compact.txt`)
Ideal for grep queries or simple text processing. White cards and black cards are separated by a divider, with one card printed per line:

```text
White, answer cards.
Another white card on this line.
----------
I love it when my _ are in plaintext.
```

---

## Card Extraction & Sheets Parser

The card database is compiled from the community's Google Sheets (like the [Card Listing Spreadsheet](https://docs.google.com/spreadsheets/d/1Pp04v9plwiJwg8u-DrCHd4Fsf9ro3NhxOvISwc0bC4Y/) and the [ManyDecks spreadsheet](https://docs.google.com/spreadsheets/d/1EYPJRGekPVCwpslVGg-AA_pz_LnNjTocSAgqxO2ZlX0/)).

You can run the script under `tools/update-from-sheets.mjs` to fetch sheet columns, validate card counts against the Index, deduplicate records, and rebuild `cah-all-compact.json`.

### Prerequisites
* [Node.js](https://nodejs.org/) (v16+)

### Setup Google OAuth Credentials
The script uses OAuth 2.0 to access the Google Sheets API:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project and enable the **Google Sheets API**.
3. Create credentials: click **+ Create Credentials** → **OAuth client ID** (Application type: **Desktop app**).
4. Download the client secret JSON file, rename it to `credentials.json`, and place it in the project root as `tools/credentials.json`. (This file is ignored by git).

### Pull and Process Decks
To build the dataset:
```bash
npm install
npm run update-cards
```
* **First Run**: The script will launch a browser window asking you to authenticate with Google. Once authorized, it will save `tools/token.json` so you do not need to authenticate again.
* **Caching**: Sheet data is cached under `temp_sheet_data/` to make subsequent runs much faster. To force a complete fetch from the API, delete the `temp_sheet_data/` directory.
* **Deduplication Warnings**: During compilation, any duplicate cards found within a single pack are automatically skipped. The compiler prints out a warning detailing the exact cell coordinates (e.g. `cell=Etsy!G3182`), making it easy to identify and clean up the spreadsheet.

---

## Web Integration

A lightweight helper library is provided under `web/CAHDeck.js` to parse the compact indexed JSON format and reconstitute it in client-side Javascript.

The website itself (code in `web/site.js`) is an example implementation of:
1. Fetching and loading `cah-all-compact.json`.
2. Rendering available card packs and allowing users to select/deselect them.
3. Combining the selected decks in-memory.
4. Exporting combined card collections to plain text or JSON files.

---

## Legal & Creative Commons Licensing

This project is free, open-source, and provided under the CC BY-NC-SA 4.0 license.

Cards Against Humanity® is distributed under a [Creative Commons BY-NC-SA 4.0 license](https://creativecommons.org/licenses/by-nc-sa/4.0/). You can copy, modify, and redistribute their content as long as you:
1. Make your work available **completely for free**.
2. Share it under the same Creative Commons license (CC BY-NC-SA 4.0).
3. Provide attribution to Cards Against Humanity.

If you have questions, feedback, or need to report any issues, please [open a GitHub issue](https://github.com/FireRat666/Json-Against-Humanity/issues).
