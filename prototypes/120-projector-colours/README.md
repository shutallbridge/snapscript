# Prototype: projector colour test

Throwaway, for [Projector colour test: the 12 colours, in the demo programs](https://github.com/shutallbridge/snapscript/issues/120).

`index.html` runs the four demo programs from [Demo programs in card notation](https://github.com/shutallbridge/snapscript/issues/109) as plain p5.js (1.11.3, vendored), translated line by line from the card programs, plus a colour tester.

## Keys

| Key | Does |
|---|---|
| `1`–`4` | demo program |
| `r` | fixed / responsive |
| `space` | restart the sketch |
| `c` | colour tester (every colour as confetti; `*` marks the six the demos fix) |
| `b` | next background in the tester: midnightblue, black, white |
| `t` | next trio of colours in demos 1, 2 and 4 |
| `h` | show / hide the label |

## On the Pi

```sh
rsync -a prototypes/120-projector-colours/ shutallbridge@ironbridge.local:snap-120/
ssh shutallbridge@ironbridge.local 'cd snap-120 && nohup python3 -m http.server 8120 --bind 127.0.0.1 >/dev/null 2>&1 &'
# then open http://localhost:8120/ fullscreen in Chromium on the projector
```

The page polls `state.json` every half second, so writing it switches the view without a keyboard. Bumping `rev` reloads the page (after an edit).
