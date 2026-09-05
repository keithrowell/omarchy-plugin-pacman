// Hand-pixelled bitmaps for the eight classic fruit, one letter per native
// pixel. Data only: no Qt, no colour literal anywhere in this file (ADR-0002
// amendment, spec 0004). `.` is transparent; every other character is a key
// of the sprite's own `roles` map, which names a lib/theme.mjs THEME_KEYS
// role (never "mode") for app/render/Sprites.js's drawBitmap to look the
// colour up in the live palette. Drawn as 1x1 native rects, so what is here
// is exactly what the arcade upscale shows — no anti-aliasing to plan for.

export const FRUIT_SPRITES = Object.freeze({
  cherry: Object.freeze({
    rows: Object.freeze([
      ".........gg.",
      ".........gg.",
      "........nn..",
      ".......n.n..",
      "......n.nn..",
      ".....n..n...",
      "....n...n...",
      ".rrnr..rnrr.",
      ".rrrr..rrrr.",
      ".rrrr..rrrr.",
      ".rrrr..rrrr.",
      "............",
    ]),
    roles: Object.freeze({ r: "red", n: "brown", g: "green" }),
  }),

  strawberry: Object.freeze({
    rows: Object.freeze([
      "...gggggg...",
      "..gggggggg..",
      "..rrrrrrrr..",
      "..rrrrrrrr..",
      "..rfrrrfrr..",
      "..rrrfrrr...",
      "...frrrfr...",
      "...rrrrr....",
      "....frfr....",
      "....rrr.....",
      ".....rr.....",
      "............",
    ]),
    roles: Object.freeze({ r: "red", f: "foreground", g: "green" }),
  }),

  orange: Object.freeze({
    rows: Object.freeze([
      ".....nngg...",
      ".....nngg...",
      "....oooo....",
      "..oooooooo..",
      "..oooooooo..",
      ".oooooooooo.",
      ".oooooooooo.",
      ".oooooooooo.",
      ".oooooooooo.",
      "..oooooooo..",
      "..oooooooo..",
      "....oooo....",
    ]),
    roles: Object.freeze({ o: "orange", n: "brown", g: "green" }),
  }),

  apple: Object.freeze({
    rows: Object.freeze([
      ".....n.gg...",
      ".....n.gg...",
      "............",
      "....rrrr....",
      "..rfrrrrrr..",
      "..rrrrrrrr..",
      ".rrrrrrrrrr.",
      ".rrrrrrrrrr.",
      ".rrrrrrrrrr.",
      "..rrrrrrrr..",
      "..rrrrrrrr..",
      "....rrrr....",
    ]),
    roles: Object.freeze({ r: "red", n: "brown", g: "green", f: "foreground" }),
  }),

  melon: Object.freeze({
    rows: Object.freeze([
      "............",
      ".....nn.....",
      ".....nn.....",
      "....glgg....",
      "..lgglgglg..",
      ".glgglgglgg.",
      ".glgglgglgg.",
      ".glgglgglgg.",
      ".glgglgglgg.",
      ".glgglgglgg.",
      "..lgglgglg..",
      "....glgg....",
    ]),
    roles: Object.freeze({ g: "green", l: "bright_green", n: "brown" }),
  }),

  galaxian: Object.freeze({
    rows: Object.freeze([
      "......b......",
      ".....yby.....",
      ".....yby.....",
      "....yybyy....",
      "....yybyy....",
      "...yyybyyy...",
      "...yyybyyy...",
      "..yyyyyyyyy..",
      "..yyyyyyyyy..",
      ".byyyyyyyyyb.",
      "byyyyyyyyyyyb",
      "bryyyyyyyyyrb",
    ]),
    roles: Object.freeze({ y: "yellow", b: "blue", r: "red" }),
  }),

  bell: Object.freeze({
    rows: Object.freeze([
      ".....yyy....",
      ".....yyy....",
      ".....yyy....",
      "....yyyyy...",
      "....yyyyy...",
      "...yyyyyyy..",
      "...yyyyyyy..",
      "..yyyyyyyyy.",
      ".yyyyyyyyyyy",
      ".yyyyyyyyyyy",
      ".....ff.....",
      ".....ff.....",
    ]),
    roles: Object.freeze({ y: "yellow", f: "foreground" }),
  }),

  key: Object.freeze({
    rows: Object.freeze([
      "...ccc....",
      "..f...c...",
      "..c.f.c...",
      "..c...c...",
      "...ccc....",
      "....cc....",
      "....cc....",
      "....cc....",
      "....cccc..",
      "....cc....",
      "....cccc..",
      "..........",
    ]),
    roles: Object.freeze({ c: "cyan", f: "foreground" }),
  }),
});
