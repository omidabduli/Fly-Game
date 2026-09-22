# Fly Escape Lab

Try to swat a fruit fly that sees you coming.

**Play it here:** https://omidabduli.github.io/Fly-Game/ (works on desktop and phones)

It's a browser game about a fruit fly that is really hard to catch. The fly has a simplified
version of the escape reflex real fruit flies use: it notices when something is getting bigger in
its field of view, guesses where the swatter is going to be, and jumps out of the way. Most of
the time you'll miss, often by just a few millimetres.

The fly model is loosely based on published research on *Drosophila* escape behaviour, but it's a
game and not a biological simulation. The ~99% escape rate is something I tuned for, not a
measured number.

## Controls

- **Mouse:** move to aim, click to swat. Arrow keys / WASD and Space work too.
- **Touch:** drag to aim, tap to swat. The swatter hits wherever you tap.
- The dashed outline shows where the swatter will land.
- Keys: `B` brain view, `L` lab mode, `R` replay the last close call, `M` mute,
  `D` debug overlay (or add `?debug` to the URL), `Esc` menu.

On iPhone you can use "Add to Home Screen" in Safari to play it full screen.

## Things to try

- **Replay:** after a close call you can watch the last half second in slow motion, with the
  fly's reaction timeline (when it noticed the swatter, when it jumped, when it got clear).
- **Brain view:** shows the four stages (vision, looming detection, escape neuron, motor)
  lighting up while you attack.
- **Lab mode:** slow down the fly's reactions, make it half blind, turn off prediction and so on,
  then try again. It can also simulate a few hundred attacks in the background to compare the
  normal and the modified fly.
- Stats and achievements are saved in your browser (localStorage). There is no server.

## How the fly works

1. It sees the swatter with a ~15 ms delay and some noise, and works out the angular size, how
   fast that size grows (looming) and a rough time-to-contact.
2. Two looming detectors, modelled on the LC4 and LPLC2 neurons, feed a leaky integrator that
   stands in for the Giant Fiber. When that crosses a threshold the fly commits to an escape.
   Something that only moves sideways makes it alert but can't trigger a jump.
3. Before the legs push off there is a random decision delay plus a motor delay, so the reaction
   time is usually 20-70 ms. It's slower while grooming or landing.
4. It predicts where the swatter will be, tries a bunch of take-off directions with its own flight
   model and picks the best one. Now and then it picks something unexpected, and very rarely it
   messes up.
5. After escaping it flies around, picks a spot to land (fruit, the cup rim, the window, ...) and
   goes back to walking and cleaning itself.

Physics runs at a fixed 1000 steps per second, independent of the frame rate. Hits are checked
with a swept collision test between the swatter head and the fly, so fast swings can't pass
through it. The fly can't teleport, and the difficulty only changes between attacks.

All the tunable numbers are in [`src/config/params.ts`](src/config/params.ts). Each one is marked
as measured (from a paper), a model assumption, or gameplay tuning, and the in-game Science page
lists them with references.

## Benchmark

`npm run benchmark` runs 10,000 simulated attacks. The simulated attackers only use the controls a
player has (move the aim point, press swat). Results with the current parameters:

| | |
|---|---|
| Fly escapes | 98.8% |
| Hits | 1.2% (65 of 5,520 serious attacks) |
| Near misses (under 20 mm) | 28% |
| Average miss distance | 26 mm |
| Average reaction time | 30 ms |

`npm run benchmark -- --quick` does a shorter run, which is what CI uses.

## Running it locally

Needs Node 22.12+ (CI uses Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # output goes to dist/
```

The simulation code doesn't use the DOM, so the same code runs in the game, in a web worker for
lab mode, in the tests and in the benchmark.

## Deploying

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which
runs the tests, builds the site and publishes it to GitHub Pages (set Settings → Pages → Source to
"GitHub Actions"). Asset paths are relative, so it works under any repo name.

## Connectome data

Each stage of the escape pathway sits behind a small interface in
[`src/neuroscience/types.ts`](src/neuroscience/types.ts), so one could be swapped for a model built
from real connectome data. [`public/data/escape-circuit.json`](public/data/escape-circuit.json) is
currently just a hand-written sketch, not FlyWire data. `npm run connectome:preprocess` can turn a
FlyWire/Codex CSV export into that format. Without arguments it runs on the included fake sample
data. If you use the real dataset, check its terms of use and cite the FlyWire papers below.

## References

- Card & Dickinson 2008, J Exp Biol: take-off speeds, escape vs voluntary take-offs
- Card & Dickinson 2008, Curr Biol: flies plan their jumps away from looming objects
- von Reyn et al. 2014: short vs long take-offs
- von Reyn et al. 2017, Ache et al. 2019, Klapoetke et al. 2017: LC4, LPLC2 and the Giant Fiber
- Muijres et al. 2014: evasive banked turns in flight
- Fry et al. 2003: flight saccades
- Mendes et al. 2013: walking speed
- Dorkenwald et al. 2024, Schlegel et al. 2024: the FlyWire connectome

Full citations with links are on the Science page in the game.
