import { type PersonId, type Seat, SEATS } from '../environment/Scene';

export type Mood = 'calm' | 'happy' | 'angry' | 'scared' | 'hurt' | 'disgusted' | 'sad' | 'nervous';

export type LineKind =
  | 'idle'
  | 'flyOnMe'
  | 'flyOnFood'
  | 'nearMiss'
  | 'swatterOverMe'
  | 'hurt'
  | 'mineBroken'
  | 'otherBroken'
  | 'kill'
  | 'bigDamage'
  | 'newFly';

export interface PersonDef {
  id: PersonId;
  name: string;
  /** seconds a fly may sit on them or their food before they shoo it away (null = never) */
  shooAfter: [number, number] | null;
  lines: Record<LineKind, string[]>;
}

/**
 * The diners, and Herr Meyer the cook at the food counter. (The ids are the seat
 * names from the original scene: juergen = Marisol, schmidt = Leila, lukas = Aro,
 * lena = Lena, mia = Nora, meyer = Herr Meyer the cook.)
 */
export const PEOPLE: Record<PersonId, PersonDef> = {
  juergen: {
    id: 'juergen',
    name: 'Marisol',
    shooAfter: [2.5, 4.5],
    lines: {
      idle: ['Mahlzeit, ihr Lieben!', 'Currywurst ist Kulturgut, Schatz.', 'Haha, ich lach mich schlapp!', 'Wer kommt heute Abend mit tanzen?', 'Lachen ist gesund!'],
      flyOnMe: ['Ey! Die sitzt auf mir!', 'Hey, ich bin kein Landeplatz!', 'Weg da, du kleine Nervensäge!'],
      flyOnFood: ['Finger weg von meiner Currywurst!', 'Das ist MEINE Wurst!', 'Kusch, kusch!'],
      nearMiss: ['Boah, pass doch auf!', 'Ey, geht’s noch?!', 'Zielen, Schatz, ZIELEN!', 'Wow, fast hättest du mich erwischt!'],
      swatterOverMe: ['Hey! Nicht auf mich zielen!', 'Ich bin keine Fliege, Schatz!', 'Ich hab Freunde bei der Polizei!'],
      hurt: ['AUA! Spinnst du?!', 'Das war mein Kopf!!', 'Na warte, Freundchen!'],
      mineBroken: ['Meine Currywurst!! 😭', 'Die war noch warm!', 'Das zahlst du, Schatz!', 'Mein Spezi!'],
      otherBroken: ['Hahaha, oh nein!', 'Das gibt Ärger!', 'Ups.'],
      kill: ['Jaaa! Sieg!', 'Nimm das, Fliege!', 'Ich hab’s doch gesagt!'],
      bigDamage: ['Wer bezahlt das eigentlich?!', 'Das wird richtig teuer, Schatz!'],
      newFly: ['Da ist sie wieder!', 'Runde zwei!'],
    },
  },
  schmidt: {
    id: 'schmidt',
    name: 'Leila',
    shooAfter: [1.5, 2.8],
    lines: {
      idle: ['Ich korrigiere gerade. Und gewinne.', 'Mensa-Kaffee, mein alter Rivale.', 'Wetten, ich treff sie schneller?', 'Sprechstunde ist Donnerstag.', 'Das Ergebnis steht: Ich bin besser.'],
      flyOnMe: ['Also wirklich.', 'Ich bin nicht dein Landeplatz.', 'Dramatisch. Aber nein.'],
      flyOnFood: ['Nicht auf meinen Käsekuchen!', 'Das ist ein Skandal!', 'Wie kannst du es wagen?!'],
      nearMiss: ['Ruhig, Champion.', 'Das war knapp. Fast mutig.', 'Meine Tasse wackelt!', 'Ich hätte sie erwischt.'],
      swatterOverMe: ['Denk nicht mal dran.', 'Ich beobachte dich.'],
      hurt: ['AUA! Mein Kopf!', 'Das war Absicht, oder?', 'Das gibt Punktabzug!'],
      mineBroken: ['Meine Klausuren!!', 'Mein Kaffee!!', 'Mein Käsekuchen!', 'Das war das letzte Stück!'],
      otherBroken: ['Typisch.', 'Ich hab’s kommen sehen.', 'Das steht auf der Rechnung.'],
      kill: ['Punkt für dich. Ausnahmsweise.', 'Wow. Respekt.', 'Endlich!'],
      bigDamage: ['Das geht an die Uni-Leitung!', 'Ich fülle ein Formular aus. Drei.'],
      newFly: ['Schon wieder eine. Wie unhöflich.', 'Neue Runde, neues Glück.'],
    },
  },
  lukas: {
    id: 'lukas',
    name: 'Aro',
    shooAfter: [3, 5.5],
    lines: {
      idle: ['Ich hab Zeit. Die Fliege offenbar auch.', 'Die Brezel ist noch warm. Alles gut.', 'Sonne, Mensa, Fliegen. Der Sommer ist komplett.', 'Ich erzähl euch später, wo ich das Hemd gefunden hab.', 'Erst Kaffee, dann Weltrettung.'],
      flyOnMe: ['Na, Kumpel. Falscher Platz.', 'Schöne Landung. Jetzt wieder los.', 'Wir kennen uns nicht gut genug.'],
      flyOnFood: ['Lass die Brezel in Ruhe, Chef.', 'Die ist mit Senf. Kein guter Landeplatz.', 'Ich teil gern. Mit Menschen.'],
      nearMiss: ['Knapp am Ärmel vorbei.', 'Das war fast elegant.', 'Noch ein Versuch, Künstler?'],
      swatterOverMe: ['Über mir ist auch noch Luft.', 'Ganz ruhig, ich bleib sitzen.'],
      hurt: ['Autsch. Das war persönlich.', 'Meine Frisur war schon kompliziert genug.', 'Ich brauch kurz ’ne Sekunde.'],
      mineBroken: ['Meine Brezel! Jetzt ist sie Kunst.', 'Der Kaffee ist auch hin. Stark.', 'Das Hemd hat’s geschafft. Die Tasse nicht.'],
      otherBroken: ['Na, das war ein teurer Witz.', 'Ich hätte die Tasse festgehalten.', 'Ups. Ich sag nichts.'],
      kill: ['Sauber. Respekt.', 'Und Feierabend für die Fliege.', 'Nicht schlecht, ehrlich.'],
      bigDamage: ['Okay, das wird langsam teuer.', 'Da ist dein Mittagessenbudget hin.'],
      newFly: ['Sie hat Verstärkung geholt.', 'Na gut. Noch eine Runde.'],
    },
  },
  lena: {
    id: 'lena',
    name: 'Lena',
    shooAfter: [1.5, 3],
    lines: {
      idle: ['Pizza ist ein Grundrecht.', 'Ich hab gerade Pause. Ausnahmsweise.', 'Hier riecht’s nach Regen.', 'Drei Stunden Schicht, ein Stück Pizza.', 'Essen zwei ist aus. Wirklich.'],
      flyOnMe: ['Nö.', 'Nicht auf mir.', 'Ich hab gesagt: nö.'],
      flyOnFood: ['Meine Pizza. Meine Regeln.', 'Ich arbeite hier. Ich weiß, wo die Fliegen herkommen.', 'Beine weg vom Käse.'],
      nearMiss: ['Ruhig.', 'Achtung, mein Tee!', 'Mit Gefühl, bitte.', 'Fast.'],
      swatterOverMe: ['Ich seh dich.', 'Nein.'],
      hurt: ['Autsch. Danke auch.', 'Das notiere ich.', 'Aua!'],
      mineBroken: ['Meine Pizza!', 'Mein Eistee!', 'Das war meine Pause!'],
      otherBroken: ['Das zahlt jemand.', 'Oh. Ups.', 'Peinlich.'],
      kill: ['Na also.', 'Endlich Ruhe.', 'Gut gemacht.'],
      bigDamage: ['Ich ruf den Hausmeister.', 'Das wird richtig teuer.'],
      newFly: ['Da ist sie wieder.', 'Nicht schon wieder.'],
    },
  },
  mia: {
    id: 'mia',
    name: 'Nora',
    shooAfter: null, // she likes the fly
    lines: {
      idle: ['Ist das bio?', 'Moin moin! Regnet’s draußen? Ach, Bremen.', 'Die Schorle ist lecker.', 'Ich poste das mal.', 'Was ist das da drüben?'],
      flyOnMe: ['Oh! Hallo, kleine Fliege!', 'Iiih! Äh… hi?', 'Die ist ja süß… und eklig.'],
      flyOnFood: ['Nimm ruhig, ist vegan!', 'Teilen ist schön…', 'Mein Salat!'],
      nearMiss: ['Huch!!', 'Ach du meine Güte!', 'Nicht so wild!', 'Lass die arme Fliege leben!'],
      swatterOverMe: ['Nicht hauen!', 'Hallo?! Ich sitz hier!'],
      hurt: ['AUA! Spinnst du?!', 'Ey, geht’s noch?!', 'Das gibt ’nen blauen Fleck!'],
      mineBroken: ['Mein Handy!!', 'Das Display!!', 'Mein Salat!'],
      otherBroken: ['Oh nein…', 'Peinlich, aber irgendwie lustig.'],
      kill: ['Nein! Die arme Fliege! 😢', 'RIP, kleine Fliege.', 'Ich bin… enttäuscht.'],
      bigDamage: ['Das ist so unnachhaltig!', 'Wer räumt das auf?'],
      newFly: ['Oh, eine neue Freundin!', 'Hallo, Fliege!'],
    },
  },
  meyer: {
    id: 'meyer',
    name: 'Herr Meyer',
    shooAfter: [1.5, 3],
    lines: {
      idle: ['Essen zwei ist aus!', 'Wer will noch Pommes?', 'Tabletts zur Rückgabe, bitte!', 'Mensakarte aufladen!', 'Nachschlag gibt’s nicht!'],
      flyOnMe: ['Hier wird nicht rumgeflogen!', 'Kusch!'],
      flyOnFood: ['Nicht an die Ausgabe!', 'Weg von meinem Essen!'],
      nearMiss: ['Vorsicht, hier ist heiß!', 'Nicht in der Küche!'],
      swatterOverMe: ['Wehe!', 'Ich hab eine Kelle!'],
      hurt: ['AUA! Ich hol den Chef!', 'Das melde ich!'],
      mineBroken: ['Mein Spuckschutz!', 'Das zahlen Sie!'],
      otherBroken: ['Wer macht das sauber?!', 'Das zahlen Sie!'],
      kill: ['Na endlich!', 'Das macht dann 3,20 €.'],
      bigDamage: ['Ich ruf den Hausmeister!', 'Hausverbot! HAUSVERBOT!'],
      newFly: ['Nicht schon wieder!', 'Die kam durchs Fenster!'],
    },
  },
};

/**
 * Little scripted conversations. Each line is [who, what, how the others react].
 * The seat ids are the old scene names: juergen = Marisol, schmidt = Leila, lukas = Aro,
 * lena = Lena, mia = Nora, meyer = Herr Meyer the cook.
 */
type Line = [PersonId, string, Mood?];
const DIALOGUES: Line[][] = [
  [['juergen', 'Wer von euch hat gestern den Kuchen geklaut?'], ['schmidt', 'Ich beantworte nur Fragen mit Fußnoten.'], ['lukas', 'Ich war’s nicht. Ich war beim Brezel-Training.'], ['juergen', 'Haha! Brezel-Training!', 'happy']],
  [['mia', 'Habt ihr das gesehen? Die Wolken sind heute lila.'], ['lukas', 'Das ist der Sonnenuntergang im Fenster.'], ['mia', 'Um zwölf Uhr mittags?'], ['lena', 'Bremen halt.']],
  [['schmidt', 'Wetten, dass ich die Fliege vor euch allen erwische?'], ['juergen', 'Wetten, dass nicht?'], ['schmidt', 'Einsatz: ein Kaffee.'], ['lukas', 'Ich nehm die Wette. Ich hab Zeit.']],
  [['lena', 'Herr Meyer, ist Essen zwei wirklich aus?'], ['meyer', 'Seit elf Uhr, meine Liebe.'], ['lena', 'Dann stimmt die Anzeige ja mal.'], ['meyer', 'Das ist neu.', 'happy']],
  [['juergen', 'Nora, dein Salat hat sich bewegt.'], ['mia', 'Was?! Wo?!', 'nervous'], ['juergen', 'Nur ein Scherz, Schatz!', 'happy'], ['mia', 'Das war nicht lustig… ein bisschen.']],
  [['lukas', 'Leila, du hast Rotstift auf der Wange.'], ['schmidt', 'Das ist Korrekturfarbe. Steht mir.'], ['lukas', 'Stimmt. Sehr autoritär.']],
  [['mia', 'Ich hab gelesen, Fliegen schmecken mit den Füßen.'], ['lena', 'Bitte nicht beim Essen.'], ['mia', 'Ich sag ja nur.'], ['juergen', 'Igitt, Nora!', 'disgusted']],
  [['meyer', 'Heute Abend Kohl und Pinkel, wer kommt?'], ['juergen', 'Ich, Herr Meyer! Für die Stimmung!'], ['lukas', 'Ich bring Brezeln mit.'], ['schmidt', 'Ich korrigiere lieber Klausuren.']],
  [['juergen', 'Ich hör da was summen.'], ['mia', 'Das bin nicht ich!', 'nervous'], ['lena', 'Das ist die Fliege. Sie plant was.'], ['schmidt', 'Fliegen planen nicht. Sie improvisieren.']],
  [['lukas', 'Ich hab mein Hemd im Urlaub gekauft. Von einem Mann auf einem Boot.'], ['juergen', 'Das sieht man. Es ist wunderbar.'], ['lukas', 'Danke. Es riecht nach Abenteuer.', 'happy']],
  [['lena', 'Sagt mal, wer bezahlt eigentlich, wenn hier was kaputtgeht?'], ['schmidt', 'Der, der zuschlägt.'], ['mia', 'Also wir nicht?'], ['juergen', 'Wir nicht! Ich schau nur zu.', 'happy']],
  [['schmidt', 'Wem gehört der Eistee?'], ['lena', 'Meiner. Er steht noch. Ich pass auf.'], ['lukas', 'Beschützerinstinkt.'], ['lena', 'Erfahrung.']],
  [['mia', 'Wie viele Fliegen passen auf eine Currywurst?'], ['juergen', 'Eine. Und die hat schon verloren.'], ['mia', 'Das ist gemein!'], ['juergen', 'Das ist Currywurst, Schatz.', 'happy']],
  [['meyer', 'Tabletts bitte zurück!'], ['juergen', 'Gleich, Herr Meyer!'], ['meyer', 'Das sagen alle.'], ['schmidt', 'Meins steht schon am Wagen.'], ['meyer', 'Dann sind Sie die Einzige.']],
  [['lukas', 'Ich hab da so ein Gefühl. Die Fliege beobachtet uns.'], ['mia', 'Sag das nicht!', 'nervous'], ['lena', 'Sie beobachtet dein Essen.'], ['lukas', 'Dann gibt es nur eine Lösung: schneller essen.']],
  [['juergen', 'Wer kommt heute Abend mit tanzen?'], ['mia', 'Ich! Wenn es nicht regnet.'], ['schmidt', 'Ich habe Sprechstunde.'], ['lukas', 'Ich komm mit. Ich tanze langsam.']],
  [['schmidt', 'Vorlesung morgen um acht.'], ['lukas', 'Um acht Uhr existiere ich noch nicht.'], ['schmidt', 'Ich notiere das.'], ['lukas', 'Bitte nicht.', 'happy']],
  [['lena', 'Ich arbeite hier seit fünf Jahren, und jedes Mal wieder Fliegen.'], ['meyer', 'Das ist Tradition, Lena.'], ['lena', 'Ich hasse Tradition.']],
  [['mia', 'Ist der Kaffee eigentlich vegan?'], ['schmidt', 'Kaffee ist eine Bohne, Nora.'], ['mia', 'Und die Milch?'], ['schmidt', 'Dazu habe ich keinen Kommentar.', 'happy']],
  [['lukas', 'Marisol, was ist dein Geheimnis?'], ['juergen', 'Ich lache viel und esse noch mehr!', 'happy'], ['lukas', 'Klingt nach einem Plan.'], ['juergen', 'Ist es auch!']],
  [['meyer', 'Moin zusammen! Alles gut bei euch?'], ['juergen', 'Bestens, Herr Meyer!'], ['schmidt', 'Bis auf die Fliege.'], ['meyer', 'Die hab ich seit Montag im Blick.']],
  [['mia', 'Seht ihr auch das Gesicht in der Wolke da draußen?'], ['lena', 'Nein.'], ['lukas', 'Ich seh eine Brezel.'], ['mia', 'Da! Das ist eine Brezel!', 'happy']],
];

export interface Bubble {
  text: string;
  t: number;
  life: number;
  prio: number;
}

export interface PersonState {
  def: PersonDef;
  seat: Seat;
  mood: Mood;
  moodT: number;
  /** mood to fall back to when `mood` runs out (scared -> angry) */
  nextMood: Mood;
  bubble: Bubble | null;
  /** where the eyes look (world mm) */
  gazeX: number;
  gazeY: number;
  blinkT: number;
  nextBlink: number;
  /** 0..1 progress of lifting food to the mouth, -1 when not eating */
  bite: number;
  nextBite: number;
  chewT: number;
  /** 0..1, decays: the head jerks back after a close swing */
  flinch: number;
  /** seconds of seeing stars */
  hurtT: number;
  clapT: number;
  shooT: number;
  shooFired: boolean;
  flySince: number | null;
  shooAt: number;
  overSince: number | null;
  lastLine: Partial<Record<LineKind, number>>;
}

export interface PeopleWorld {
  time: number;
  fly: { x: number; y: number; alive: boolean; airborne: boolean; resting: boolean; surfaceId: string | null };
  swatter: { x: number; y: number; active: boolean; striking: boolean };
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const range = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * The people in the Mensa: what they look at, how they feel, what they say,
 * and when they shoo the fly off their food. Pure logic (no drawing), driven
 * by the game from simulation events.
 */
export class PeopleSystem {
  readonly people: PersonState[];
  private readonly byId = new Map<PersonId, PersonState>();
  private time = 0;
  private idleNext = 7;
  private queue: { p: PersonState; text: string; prio: number; at: number; mood?: Mood; force?: boolean; react?: Mood; others?: PersonId[] }[] = [];
  private dialogueIndex = Math.floor(Math.random() * DIALOGUES.length);
  private damageTold = 0;

  /** `ownerOf` maps a scene object id to the person it belongs to (their head, body, food ...). */
  constructor(private readonly ownerOf: (objectId: string) => PersonId | null) {
    this.people = SEATS.map((seat) => {
      const p: PersonState = {
        def: PEOPLE[seat.id],
        seat,
        mood: 'calm',
        moodT: 0,
        nextMood: 'calm',
        bubble: null,
        gazeX: seat.x,
        gazeY: 262,
        blinkT: 0,
        nextBlink: range(1, 4),
        bite: -1,
        nextBite: range(1, 5),
        chewT: 0,
        flinch: 0,
        hurtT: 0,
        clapT: 0,
        shooT: 0,
        shooFired: false,
        flySince: null,
        shooAt: 0,
        overSince: null,
        lastLine: {},
      };
      this.byId.set(seat.id, p);
      return p;
    });
  }

  get(id: PersonId): PersonState {
    return this.byId.get(id)!;
  }

  /** New round: everyone calms down. */
  reset(): void {
    this.queue = [];
    this.damageTold = 0;
    for (const p of this.people) {
      p.mood = 'calm';
      p.moodT = 0;
      p.bubble = null;
      p.hurtT = p.clapT = p.shooT = p.flinch = 0;
      p.flySince = null;
    }
  }

  private setMood(p: PersonState, m: Mood, secs: number, then: Mood = 'calm'): void {
    p.mood = m;
    p.moodT = secs;
    p.nextMood = then;
  }

  private visibleBubbles(): number {
    let n = 0;
    for (const p of this.people) if (p.bubble) n++;
    return n;
  }

  /** Say a line; `prio` decides who gets to talk when several want to (0 idle … 3 pain). */
  say(p: PersonState, text: string, prio: number, force = false): boolean {
    if (p.bubble && p.bubble.prio > prio && p.bubble.t < p.bubble.life * 0.7) return false;
    if (!force && !p.bubble && prio < 2 && this.visibleBubbles() >= 2) return false;
    p.bubble = { text, t: 0, life: this.bubbleLife(text), prio };
    return true;
  }

  /** How long a line stays up (and how long it takes to say). */
  private bubbleLife(text: string): number {
    return Math.min(4.2, 1.6 + text.length * 0.05);
  }

  private line(p: PersonState, kind: LineKind, prio: number, cooldown = 0): boolean {
    const last = p.lastLine[kind] ?? -Infinity;
    if (this.time - last < cooldown) return false;
    const lines = p.def.lines[kind];
    if (!lines.length) return false;
    if (!this.say(p, pick(lines), prio)) return false;
    p.lastLine[kind] = this.time;
    return true;
  }

  private later(p: PersonState, kind: LineKind, prio: number, delay: number, mood?: Mood): void {
    this.queue.push({ p, text: pick(p.def.lines[kind]), prio, at: this.time + delay, mood });
  }

  /** Per frame. Returns the person who is shooing the fly away right now (the game makes it take off). */
  update(dt: number, w: PeopleWorld): PersonId | null {
    this.time = w.time;
    let shoo: PersonId | null = null;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (q.at > this.time) continue;
      this.queue.splice(i, 1);
      if (this.say(q.p, q.text, q.prio, q.force)) {
        if (q.mood) this.setMood(q.p, q.mood, 2);
        // the others laugh, wince or look worried
        if (q.react) for (const id of q.others ?? []) if (this.get(id).mood === 'calm') this.setMood(this.get(id), q.react, 1.6);
      }
    }
    for (const p of this.people) {
      const s = p.seat;
      // speech bubble
      if (p.bubble) {
        p.bubble.t += dt;
        if (p.bubble.t >= p.bubble.life) p.bubble = null;
      }
      // mood
      if (p.moodT > 0) {
        p.moodT -= dt;
        if (p.moodT <= 0) {
          p.mood = p.nextMood;
          p.moodT = p.nextMood === 'calm' ? 0 : 2.5;
          p.nextMood = 'calm';
        }
      }
      p.flinch = Math.max(0, p.flinch - dt * 2.5);
      p.hurtT = Math.max(0, p.hurtT - dt);
      p.clapT = Math.max(0, p.clapT - dt);
      // blinking
      if (p.blinkT > 0) p.blinkT -= dt;
      else if ((p.nextBlink -= dt) <= 0) {
        p.blinkT = 0.13;
        p.nextBlink = range(2, 5.5);
      }
      // eating
      const busy = p.hurtT > 0 || p.clapT > 0 || p.shooT > 0 || p.mood === 'scared' || p.mood === 'angry';
      if (p.bite >= 0) {
        p.bite += dt / 1.3;
        if (p.bite >= 1) {
          p.bite = -1;
          p.chewT = range(1.2, 2.2);
          p.nextBite = range(3, 7);
        }
      } else if (p.chewT > 0) p.chewT -= dt;
      else if (!busy && !s.staff && (p.nextBite -= dt) <= 0) p.bite = 0;

      // what they look at
      const f = w.fly;
      const dFly = Math.hypot(f.x - s.x, f.y - s.y);
      const mine = f.surfaceId !== null && this.ownerOf(f.surfaceId) === s.id;
      let gx = s.staff ? s.x - 30 : s.x + (s.id === 'lukas' ? 0 : -8);
      let gy = s.staff ? 112 : s.id === 'lukas' ? 230 : 262;
      const dSw = Math.hypot(w.swatter.x - s.x, w.swatter.y - s.y);
      if (f.alive && (mine || (f.airborne && dFly < 220) || dFly < 70)) {
        gx = f.x;
        gy = f.y;
      } else if (w.swatter.active && (w.swatter.striking || dSw < 90)) {
        gx = w.swatter.x;
        gy = w.swatter.y;
      }
      const k = Math.min(1, dt * 10);
      p.gazeX += (gx - p.gazeX) * k;
      p.gazeY += (gy - p.gazeY) * k;

      // the fly sits on them or their food
      if (f.alive && f.resting && mine) {
        if (p.flySince === null) {
          p.flySince = this.time;
          const onBody = f.surfaceId === `${s.id}-head` || f.surfaceId === `${s.id}-body`;
          if (Math.random() < 0.65) this.line(p, onBody ? 'flyOnMe' : 'flyOnFood', 1, 4);
          if (!onBody && s.id !== 'mia' && Math.random() < 0.5) this.setMood(p, 'disgusted', 1.5);
          const d = p.def.shooAfter;
          p.shooAt = d ? this.time + range(d[0], d[1]) : Infinity;
        } else if (this.time >= p.shooAt && p.shooT <= 0) {
          p.shooT = 0.8;
          p.shooFired = false;
          this.setMood(p, 'angry', 1.4);
        }
      } else p.flySince = null;
      if (p.shooT > 0) {
        p.shooT -= dt;
        if (!p.shooFired && p.shooT < 0.5) {
          p.shooFired = true;
          if (f.alive && f.resting && mine) shoo = s.id;
        }
      }

      // the swatter hovering over their head
      if (w.swatter.active && !w.swatter.striking && dSw < 55 && f.alive) {
        p.overSince ??= this.time;
        if (this.time - p.overSince > 1.1 && this.line(p, 'swatterOverMe', 1, 9)) this.setMood(p, 'nervous', 2);
      } else p.overSince = null;
    }

    // idle chatter and little conversations: everyone takes a turn, one after the other
    this.idleNext -= dt;
    if (this.idleNext <= 0) {
      this.idleNext = range(6, 11);
      if (this.visibleBubbles() === 0 && w.fly.alive) {
        if (Math.random() < 0.75) {
          const d = DIALOGUES[this.dialogueIndex++ % DIALOGUES.length];
          const ids = new Set(d.map(([id]) => id));
          let at = this.time + 0.2;
          for (const [id, text, react] of d) {
            this.queue.push({ p: this.get(id), text, prio: 0, at, force: true, react, others: [...ids].filter((x) => x !== id) });
            at += this.bubbleLife(text) + 0.45;
          }
          this.idleNext += at - this.time;
        } else this.line(pick(this.people), 'idle', 0);
      }
    }
    return shoo;
  }

  /** The swatter landed at (x, y) on `objectId`. */
  onImpact(x: number, y: number, objectId: string): void {
    const victim = this.ownerOf(objectId);
    for (const p of this.people) {
      const s = p.seat;
      const hitMe = (objectId === `${s.id}-head` || objectId === `${s.id}-body`) && victim === s.id;
      if (hitMe) {
        p.hurtT = 1.8;
        p.flinch = 1;
        p.bite = -1;
        this.setMood(p, 'hurt', 1.8, 'angry');
        this.line(p, 'hurt', 3);
        continue;
      }
      const d = Math.hypot(x - s.x, y - s.y);
      if (d < 95) {
        p.flinch = 1;
        p.bite = -1;
        this.setMood(p, 'scared', 0.7, 'angry');
        if (Math.random() < 0.6) this.line(p, 'nearMiss', 1, 3);
      }
    }
  }

  /** Something broke; its owner (if any) is upset, bystanders comment. */
  onBreak(owner: PersonId | null, personHit: boolean): void {
    if (personHit || !owner) {
      if (!personHit && Math.random() < 0.5) {
        const p = pick(this.people);
        this.later(p, 'otherBroken', 1, 0.5);
      }
      return;
    }
    const p = this.get(owner);
    this.setMood(p, 'angry', 2.5);
    this.line(p, 'mineBroken', 2);
    if (Math.random() < 0.35) {
      const other = pick(this.people.filter((o) => o !== p));
      this.later(other, 'otherBroken', 1, 1.2);
    }
  }

  /** The bill passed another threshold: someone makes a remark. */
  onDamage(total: number): void {
    const steps = [150, 400, 900, 2000];
    const reached = steps.filter((v) => total >= v).length;
    if (reached > this.damageTold) {
      this.damageTold = reached;
      const p = pick(this.people);
      this.later(p, 'bigDamage', 2, 1.4, 'angry');
    }
  }

  /** The fly is dead: applause (well, mostly). */
  onKill(): void {
    this.queue = [];
    this.people.forEach((p, i) => {
      p.bubble = null;
      p.clapT = p.def.id === 'mia' ? 0 : 2.4;
      this.setMood(p, p.def.id === 'mia' ? 'sad' : 'happy', 3);
      this.queue.push({ p, text: pick(p.def.lines.kill), prio: 2, at: this.time + 0.35 + i * 0.35 });
    });
  }

  onNewFly(): void {
    this.later(pick(this.people), 'newFly', 1, 1);
  }
}
