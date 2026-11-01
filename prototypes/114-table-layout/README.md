# Prototype: the table's layout

Throwaway, for [Prototype the table's layout: coding space, canvas space, help spot, page cut-outs](https://github.com/shutallbridge/snapscript/issues/114). Built on the textbook page prototype (`prototype/128-textbook-page`): `vision.py`, `geometry.py`, `tags.js`, `pages.json`, `sheets.js` and the helper scripts are copied from it.

`table.html` is what the projector shows. It has three layouts, all split left/right into a **coding space** and a **canvas space**:

| Layout | What |
|---|---|
| **A · halves** | A fixed split (width set in the menu). The sketch is centred in the canvas space. The help spot is in the coding space's outer corner, with its doc comment above or below it. |
| **B · hug the canvas** | The canvas space is just the sketch plus 1U, at the table's outer edge, and the coding space gets the rest. A status line and the help spot sit under the sketch. |
| **C · framed window** | Like an IDE's preview pane: the sketch in a window with a title bar, and a help panel under it in the canvas space. A 1U dot grid in the coding space. |

In all three:

- The sketch is drawn at a **fixed size** (`canvas size`, in sketch px), scaled by `sketch px per 1U`. `native` means one sketch pixel per projector pixel (about 41 px per U on the rig). If the sketch doesn't fit, a red line says so.
- A **mock program** in the coding space prints inline, to the right of the printing card, like Quokka.js (`→ hello`, `→ x = 87`). When a textbook page is current, its cards replace the mock as plain dashed placeholders. Their real look is [card feedback](https://github.com/shutallbridge/snapscript/issues/129)'s.
- Every textbook page in view is cut out, plus a margin and a **dim area** around it.
- **Card markers** that `vision.py` sees get a ring. Green means the card counts (marker in the coding space). Grey and crossed out means it's ignored (marker in the canvas space).
- A card whose marker lies on the **help spot** shows a sample doc comment (circle's, for any card, with the card's marker id).
- **Highlight test**: four 4U slots outlined in red at 0.5, 1, 2 and 3 mm. Lay real cards in them and step through `coding space brightness`.

## Settings

Press `,` on the keyboard for the hidden menu: `↑↓` choose a setting, `←→` change it, `,` or `Esc` to close, `0` to reset. With the menu closed, `←→` flip between layouts. Settings are kept in the browser (`localStorage`) across reloads. `?variant=A|B|C` in the URL works too.

Over SSH, without a keyboard, `control.json` can set anything the menu can: `{"rev": 1, "cfg": {"variant": "B", "side": "right"}}`. Bump `rev` to reload the page.

The status line shows the numbers to judge sizes by: 1U in projector px, how big the sketch comes out in mm, and the table text size in mm.

## On a laptop

```sh
python3 -m http.server 8114   # then open http://localhost:8114/table.html
```

Without `vision.py` there are no pages and no card markers. Turn on `pretend a card is on the help spot` to see the doc comment.

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

`vision.py` is the textbook page prototype's, plus a `cards` list in `state.json`: every marker that isn't a page or calibration tag, with its centre in projector space.
