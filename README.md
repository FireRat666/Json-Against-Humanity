[![CC BY-NC-SA 4.0][cc-by-nc-sa-shield]][cc-by-nc-sa]

[cc-by-nc-sa]: http://creativecommons.org/licenses/by-nc-sa/4.0/
[cc-by-nc-sa-shield]: https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg

# JSON Against Humanity

Finally, [Cards Against Humanity](https://cardsagainsthumanity.com/) as plain text and JSON.

## FAQ

### How many cards are there?

There are 83,330 cards available (63,752 unique) from 422 packs.

- That's all 22,597 official cards from 123 products.
- Plus 60,733 even worse cards from fans around the world

The unique count removes duplicates that appear in multiple packs: 
- 49,071 unique response cards and 14,681 unique prompt cards.

### Wha— where the heck did you find all those cards??

The primary source is this [Card Listing Spreadsheet](https://docs.google.com/spreadsheet/ccc?key=1Pp04v9plwiJwg8u-DrCHd4Fsf9ro3NhxOvISwc0bC4Y&usp=sharing#gid=55). Previous sources included [Hangouts Against Humanity](https://github.com/samurailink3/hangouts-against-humanity), [Pretend You're Xyzzy](http://pyx-3.pretendyoure.xyz/zy/viewcards.jsp), and contributions from viewers like you.

### What font is CAH?

Cards Against Humanity® cards are printed in [Helvetica® Neue](https://www.myfonts.com/fonts/linotype/neue-helvetica/). It's not free. For this site, we use [Inter Medium](https://rsms.me/inter/). You're looking at it now.

### Who maintains this?

[FireRat](https://firer.at/), Feel free to [open an issue](https://github.com/FireRat666/json-against-humanity/issues) if you have questions or feedback.

## File formats

### Plaintext

Simple and easy to read. One card per line.

```
White, answer cards.
Putting a new card on each line.
Adding a divider after the white cards.
----------
I love it when my _ are in plaintext.
```

### full.json

```json
[
  {
    "name": "The Base Set",
    "official": true,
    "white": [ { "text": "Answer...", "pack": 0 } ],
    "black": [ { "text": "_Prompt_ cards\nwith _ for blanks!", "pick": 1, "pack": {pack index} } ]
  },
  { "white": [ { "pack": 1 }, ... ], ... },
  { "white": [ { "pack": 2 }, ... ], ... }
]
```

### compact.json

Optimized for file size. Uses a shared pool of cards and references them by index.

```json
{
  "white": ["Answer cards in plain text, formatted with **Markdown**"],
  "black": [
    { "text": "_Prompt_ cards\nformatted with _.", "pick": 1 },
    { "text": "I want a _ **and** _ sandwich! No corners!", "pick": 2 }
  ],
  "packs": {
    "abbreviation": {
      "name": "The Base Set",
      "official": true,
      "white": [0, 1, 2, "indexes for every white card in this pack"],
      "black": [0, 1, 2, "indexes for every black card in this pack"]
    }
  }
}
```

## Integration

Chris Hallberg wrote a small library to handle the compact format: [CAHDeck.js](https://github.com/FireRat666/json-against-humanity/blob/latest/web/CAHDeck.js).

This website itself is a demonstration of ingesting from compact.json, listing decks, combining selected decks, and exporting files [site.js](https://github.com/FireRat666/json-against-humanity/blob/latest/web/site.js).

## Fine Print

This project is free, open-source, and provided as-is.

### Is this legal?

Yes. Cards Against Humanity® is distributed under a [Creative Commons BY-NC-SA 4.0 license](https://creativecommons.org/licenses/by-nc-sa/4.0/). I think their website puts it best:

> We give you permission to use the Cards Against Humanity® writing under a limited Creative Commons BY-NC-SA 4.0 license. That means you can use our writing if (and only if) you do all of these things:
>
> 1.  Make your work available totally for free.
> 2.  Share your work with others under the same Creative Commons license that we use.
> 3.  Give us credit in your project.

If you have questions or paperwork that says otherwise, contact me, we can work this out.
