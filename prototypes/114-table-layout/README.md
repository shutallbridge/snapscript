# Prototype: the table's layout

Throwaway, for [Prototype the table's layout: coding space, canvas space, help spot, page cut-outs](https://github.com/shutallbridge/snapscript/issues/114). Built on the textbook page prototype (`prototype/128-textbook-page`): `vision.py`, `geometry.py`, `tags.js`, `pages.json`, `sheets.js` and the helper scripts are copied from it.

`table.html` is what the projector shows: the table as two **windows**, the **coding space** (left) and the **canvas space** (right).

- **Resizing the windows:** the split is 50/50 by default. Change it in the menu, or with `←→` when the menu is closed. The coding space is always on the left for now.
- **Units:** the app works in its own px, with **1U = 50 px**, whatever the projector's real resolution. On the rig, 1U is about 41 projector px. A 500 px canvas is 10U, which is 300 mm. 16 px text is about 9.6 mm. Real cards are drawn at true size in mm.
- **The sketch** is the p5 canvas element inside the canvas window, sized by the program's `createCanvas` (the current page's, else the mock's 500 × 500). The prototype doesn't run cards, so it reads those numbers out of the program text. `centre the sketch in its window` centres it, or puts it at the window's top-left. If it doesn't fit, a red line says so.
- **Full screen:** `canvas window full screen` shows the canvas window over the whole table, like a browser's full screen. The window layout is kept, just not shown: a window decides which markers belong to it, so cards still count by where the coding space would be. Corners stay on top. Later these toggles could be put on corners.
- **Corners:** each of the four corners can be given an action in the menu. Only `help` exists, and it's on the bottom-left corner. A corner is a dotted quarter circle (3.5U radius) with a title in its centre ("Card Help"). A card whose marker is inside the circle triggers it **at once**, with no countdown. It stays triggered until the card has been gone for 1 s, since `vision.py` takes about 0.85 s a frame.
- **The help doc box** sits along the bottom, beside the corner. It clears the circle by 0.5U and the card by 1U. The card's outline is worked out from its marker's centre and angle and the card's length. There is no marker-to-card table yet, so the length is `card length when unknown` (4U by default), or `CARD_LEN` in `table.html`.
- **The mock program** prints inline, to the right of the printing card, like Quokka.js. When a textbook page is current, its cards replace the mock as plain dashed placeholders. Their real look belongs to [card feedback](https://github.com/shutallbridge/snapscript/issues/129).
- **Stacking**, bottom to top: the windows, then the corners (and the help doc box), then the textbook page cut-outs, then the settings menu.
- **Textbook pages** in view are cut out, plus a margin and a **dim area** around each page (3 mm margin and 2 mm dim area by default, square corners), and a red outline of the paper for debugging (turn it off in the menu).
- **Card markers** get a ring and their ID. Green means the card counts (marker in the coding space). Grey and crossed out means it's ignored.
- **Highlight test:** four 4U slots outlined in red at 0.5, 1, 2 and 3 mm, to look at against `coding space brightness`.

## Settings

The menu is for whoever runs the table (a facilitator). Press `,` to open it. It has two levels: first the sections (**Windows**, **Corners**, **Textbook pages**, **Appearance**, **Rig**), then one section's settings. `↑↓` choose, `Enter` (or `→`) opens a section, `←→` change a setting, `Esc` goes back and then closes, and `,` closes from anywhere. **Reset all settings**, at the bottom of the sections, resets everything after a second `Enter`. Settings are kept in the browser (`localStorage`).

Debug settings are kept out of that menu, behind `.`: marker reads, the red page outline, the status line, `pretend a card is in a corner`, the mock program, the highlight test and the card length when unknown.

Over SSH, without a keyboard, `control.json` can set anything the menu can: `{"rev": 1, "cfg": {"split": 60, "cardU": 3}}`. Changing `rev` reloads the page, but only once the page has already read a `control.json`.

## On a laptop

```sh
python3 -m http.server 8114   # then open http://localhost:8114/table.html
```

Without `vision.py` there are no pages and no card markers. Turn on `pretend a card is in a corner` (in the debug menu, `.`) to see the doc comment.

## On the Pi

As in the textbook page prototype, but in `~/snap-114` on port 8114:

```sh
./pi.sh 'mkdir -p snap-114'
for f in pages.json table.html sheets.js tags.js p5.min.js vision.py geometry.py start-*.sh; do ./pi.sh put $f snap-114/; done
./pi.sh 'cp ~/snap-128/calib.json ~/snap-114/'   # reuse the line-up, if the stand hasn't moved
./pi.sh 'bash ~/snap-114/start-http.sh'
./pi.sh 'bash ~/snap-114/start-chrome.sh'
./pi.sh 'bash ~/snap-114/start-vision.sh rig --aspect 1.5 --table-mm 792 --rule inview'
```

`vision.py` is the textbook page prototype's, plus a `cards` list in `state.json`: every marker that isn't a page or calibration tag, with its centre (`c`) and angle (`a`, radians, along the marker's bottom edge) in projector space.
