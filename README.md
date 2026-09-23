# Fly Escape Lab

Try to swat a fruit fly that sees you coming.

**Play it here:** https://omidabduli.github.io/Fly-Game/ (works on desktop and phones)

It's a browser game about a fruit fly that is really hard to catch. The fly has a simplified
version of the escape reflex real fruit flies use: it notices when something is getting bigger in
its field of view, guesses where the swatter is going to be, and jumps out of the way. Most of
the time you'll miss, often by just a few millimetres.

The fly model is loosely based on published research on *Drosophila* escape behaviour, but it's a
game and not a biological simulation. The ~99% escape rate (on Hard) is something I tuned for, not a
measured number.

## Game modes

Pick one on the title screen (or in the menu, which brings in a new fly):

| Mode | Fly | Synthetic attackers catch it |
|---|---|---|
| 🐌 Easy | Sleepy fly: slower reflexes, weaker jumps, lands close by | ~41% of serious attacks |
| 🪰 Medium | Alert fly: quick, but makes mistakes | ~12% |
| 🥷 Hard | Ninja fly: the full escape reflex, with adaptive difficulty | ~1% |

It's the same fly brain in every mode. Easy and Medium only scale its reaction delays, looming
thresholds, take-off strength and prediction noise ([`src/game/DifficultyModes.ts`](src/game/DifficultyModes.ts)).
Only Hard uses the adaptive controller. Real players on a phone aim less precisely than the
synthetic attackers, so expect lower rates.

## The Mensa

The game is set at lunchtime in a university Mensa in Bremen. Across the table sit Jürgen
(Currywurst, Werder scarf, bald), Frau Dr. Schmidt (coffee, cheesecake, a stack of exams to mark),
Lukas (laptop, Mate, Brezel, exam tomorrow) and Mia (salad, Apfelschorle, yellow Friesennerz), and
Frau Meyer runs the food counter.

The people are more than decoration:

- their eyes follow the fly and the swatter
- they complain when you swing near them, and say "AUA!" when you hit them
- they wave the fly off their food after a few seconds, so it won't sit still for long (except
  Mia, who likes the fly)
- they chat with each other, and cheer when you finally get the fly (Mia mourns it)

Mia's phone lights up with messages, and they get more worried the more damage you cause.
All the dialogue is in German. The logic is in [`src/game/People.ts`](src/game/People.ts) and the
drawing is in [`src/render/PeopleRenderer.ts`](src/render/PeopleRenderer.ts).

## The damage bill

The swatter breaks whatever it lands on: plates, glasses, the Mate bottle, Lukas's laptop, Mia's
phone, the menu screen, the sneeze guard, the window, the clock, the ficus and the Bremen Town
Musicians poster. Most things break in stages, each with a price in euros, and hitting a person
costs *Schmerzensgeld*. The HUD shows the running total. When you catch the fly you get an
itemised German receipt instead of the survival time, stamped from *SAUBER* (0 €) to
*TOTALSCHADEN*. Everything is cleaned up for the next fly.

Breaking things is purely cosmetic for the simulation. Everything on the table stays within a few
millimetres of the tabletop, so plates and glasses break instead of shielding the fly. Real cover
only comes from the sneeze guard over the food counter and from people's heads. Damage is tracked in
[`src/game/DamageSystem.ts`](src/game/DamageSystem.ts) and painted by
[`SceneRenderer`](src/render/SceneRenderer.ts).

## Controls

- **Mouse:** move to aim, click to swat. Arrow keys / WASD and Space work too.
- **Touch:** drag to aim, tap to swat. The swatter hits wherever you tap.
- The dashed outline shows where the swatter will land.
- After a close call a replay button appears in the top bar.
- On phones the game vibrates on hits and breaks (Android, and iPhone with iOS 18 or later).
  It can be turned off in the menu.
- Keys: `B` brain view, `L` lab mode, `R` replay the last close call, `M` mute,
  `D` debug overlay (or add `?debug` to the URL), `Esc` menu.

On iPhone you can use "Add to Home Screen" in Safari to play it full screen. All sounds are generated
with the Web Audio API, so they follow the ring/silent switch: flip it off silent to hear them.

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
5. After escaping it flies around, picks a spot to land (the Currywurst, a glass rim, a bald head, ...) and
   goes back to walking and cleaning itself.

Physics runs at a fixed 1000 steps per second, independent of the frame rate. Hits are checked
with a swept collision test between the swatter head and the fly, so fast swings can't pass
through it. The fly can't teleport, and the difficulty only changes between attacks.

All the tunable numbers are in [`src/config/params.ts`](src/config/params.ts). Each one is marked
as measured (from a paper), a model assumption, or gameplay tuning, and the in-game Science page
lists them with references.

## Benchmark

`npm run benchmark` runs 10,000 simulated attacks. The simulated attackers only use the controls a
player has (move the aim point, press swat). Results with the current parameters, in the Mensa, for
Hard (the unmodified fly):

| | |
|---|---|
| Fly escapes | 98.8% |
| Hits | 1.2% (92 of 7,613 serious attacks) |
| Near misses (under 20 mm) | 29% |
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
