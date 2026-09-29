# Catch the Fly

A fly is loose at lunch in a Bremen canteen. Five people are watching, and everything you smash goes on your bill.

**Play:** https://omidabduli.github.io/Fly-Game/

Move the mouse to aim, click to swat. On a phone, drag and tap. Easy, Medium and Hard change how fast the fly reacts.

## Run it

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

Needs Node 22 or newer.

## Add a character

Put the full-size PNGs in `assets/characters/<name>/`, named `<name>_<pose>.png`. Poses: `neutral`, `talking`, `happy`, `angry`, `blink`, plus optional `scared`, `hurt`, `disgusted`, `laugh`, `shoo1`, `shoo2`, `eat`, `stand_angry`, `stand_cheer`. Then run:

```bash
python3 scripts/optimize_characters.py
```

That writes the small WebP copies the game loads to `public/characters/`. Who sits where is set in `src/render/PeopleRenderer.ts`, and what they say is in `src/game/People.ts`.

## Deploy

Every push to `main` runs the tests and publishes to GitHub Pages.
