# 21Deep

A five-column solitaire version of blackjack, with a built-in AI advisor, **Alpha21**: a small
neural network trained by self-play that tells you where each card should go.

**▶ Play:** https://erichershman.github.io/21Deep/

## How to play

Cards come off the deck one at a time. Put each one into one of five columns without letting a
column go over 21 (Aces count as 1 or 11). A column clears and scores when it hits a combo. The
game ends when the current card fits nowhere.

| Points | Combo | How |
|---:|---|---|
| 10 | 21 | Three cards totaling 21 |
| 15 | Large 21 | Four or more cards totaling 21 |
| 15 | 6-7-8 / 7-7-7 | Those three cards in one column |
| 5 | 5 under 21 | Five cards totaling 20 or less |
| 21 | Blackjack | Ace + a ten-value card |
| 50 | Double Blackjack | Two Ace + Queen Blackjacks on consecutive cards |
| 50 | Super Blackjack | J♠ + A♠ |
| 100 | Straight | Column totals 16, 17, 18, 19, 20 (any order); clears the board |
| 100 | 5 of a Kind | All five totals equal and ≥ 16; clears the board |
| 200 | Full House | 6-6-3-3-3, 5-5-5-3-3 or 9-9-A-A-A in one column |

When the deck runs out, cleared cards are shuffled back in (+10). A column holding an Ace can
count either way toward a Straight or 5 of a Kind.

## The advisor, two ways

**In the page:** click the robot in the top-right of the board. The best column lights up, and
every legal column shows the expected final score if you play there.

**As a userscript:** install [`userscript/21deep-advisor.user.js`](userscript/21deep-advisor.user.js)
with Tampermonkey or Violentmonkey and reload the game. The same engine then runs from the
outside, like a browser extension would. It reads only what's on screen (card images, score,
draw count), keeps its own count of which cards have come out since the last reshuffle, and
draws its advice in a separate overlay. It never clicks. When it's running, the robot button
steps aside.

## How Alpha21 works

- **A value network** (~44k weights) looks at a position and estimates the game's final score.
  Its inputs are hand-picked features: per column, the total, the ranks, full-house progress and
  what each possible next card would do there; for the deck, which ranks remain and which have
  been discarded; plus the score and the Blackjack chain.
- **Self-play training:** round 1 learned from ~10M positions played by a hand-tuned heuristic
  engine. Round 2 learned from ~7M positions played by the round-1 network. Each position is
  labelled with that game's real final score.
- **Search:** for each legal move, it looks two cards ahead (expectimax over the ranks still in
  the deck, expanding the two most promising moves at each step), then asks the network to
  judge the resulting positions.
- **No peeking:** the advisor sees which cards are still in the deck, never the order they
  will come in.

In simulated games, the network player reached 500 points in about 4 of every 10 games. On
the same deals, the hand-tuned heuristic managed about 1 in 8, and a rollout-search player
about 1 in 5. The things that *didn't* help were just as instructive:

- deeper look-ahead on top of the heuristic engine
- tuning the heuristic's weights further
- steering toward rarer combos

Each of these either cost survival or disappeared in the noise. What paid off was replacing
the hand-written evaluation with a learned one.

## Project layout

```
index.html, styles.css, game.js   the game (no dependencies, no build step)
advisor-ui.js                     robot button: loads engine.js on first use, draws highlights
engine.js                         Alpha21: rules, network, search; pure logic, no DOM
userscript/21deep-advisor.user.js engine.js + a DOM-reading wrapper, as one installable file
tools/                            templates + build scripts for engine.js and the userscript
```

To rebuild the userscript after changing `engine.js` or `tools/userscript.template.js`:

```bash
node tools/build-userscript.js
```

To run locally, serve the folder (the engine is loaded with a `<script>` tag, so `file://`
works too, but a server matches GitHub Pages):

```bash
python -m http.server 8000
```

## Credits

- Card faces: <!-- TODO: confirm the source of assets/cards before publishing -->
- Card back, icons, code: © 2026 Eric Hershman, MIT License

## License

Code is released under the [MIT License](LICENSE).
