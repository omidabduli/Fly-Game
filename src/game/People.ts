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

/** The regulars at the table, and Frau Meyer from the food counter. */
export const PEOPLE: Record<PersonId, PersonDef> = {
  juergen: {
    id: 'juergen',
    name: 'Jürgen',
    shooAfter: [2.5, 4.5],
    lines: {
      idle: ['Moin!', 'Currywurst ist Kulturgut.', 'Mahlzeit!', 'Rot-weiß, bitte!', 'Lebenslang Grün-Weiß!', 'Früher war mehr Soße.'],
      flyOnMe: ['Ey! Die sitzt auf meiner Glatze!', 'Weg da, du Biest!', 'Kitzelt!'],
      flyOnFood: ['Finger weg von meiner Currywurst!', 'Das ist MEINE Wurst!', 'Kusch!'],
      nearMiss: ['Alter Schwede!', 'Pass doch auf!', 'Holla die Waldfee!', 'Nicht so doll!'],
      swatterOverMe: ['Äh… hallo?', 'Nicht mich hauen!', 'Ich bin keine Fliege!'],
      hurt: ['AUA!', 'Meine Glatze!!', 'Ich hab Rücken… und jetzt auch Kopf!'],
      mineBroken: ['Meine Currywurst!! 😭', 'Die war noch warm!', 'Das zahlst du!', 'Mein Spezi!'],
      otherBroken: ['Hahaha!', 'Oha.', 'Das gibt Ärger!'],
      kill: ['Jawoll!', 'TOOOR! Äh… Treffer!', 'Weltklasse!'],
      bigDamage: ['Wer bezahlt das eigentlich?', 'Das kommt in die Zeitung!'],
      newFly: ['Da! Noch eine!', 'Nicht schon wieder…'],
    },
  },
  schmidt: {
    id: 'schmidt',
    name: 'Frau Dr. Schmidt',
    shooAfter: [1.5, 2.8],
    lines: {
      idle: ['Das kommt in die Klausur.', 'Die Mensa war früher besser.', 'Mahlzeit, Herr Kollege.', 'Ich korrigiere gerade.', 'Sprechstunde ist Donnerstag.'],
      flyOnMe: ['Also wirklich!', 'Husch, husch!', 'Unerhört!'],
      flyOnFood: ['Nicht auf meinen Käsekuchen!', 'Das ist unhygienisch!'],
      nearMiss: ['Ruhe bitte!', 'Das ist eine Mensa, kein Zirkus!', 'Unerhört!', 'Ich muss doch sehr bitten!'],
      swatterOverMe: ['Denken Sie nicht mal dran.', 'Ich warne Sie!'],
      hurt: ['AUA! Meine Brille!', 'Ich schreibe eine Beschwerde!', 'Das hat Konsequenzen!'],
      mineBroken: ['Meine Klausuren!!', 'Der Kaffee war frisch!', 'Mein Käsekuchen!', 'Durchgefallen! Sie!'],
      otherBroken: ['Typisch.', 'Ich rufe den Hausmeister.', 'Wo ist das Beschwerdeformular?'],
      kill: ['Sehr gut. Eins Komma null.', 'Ordnung muss sein.', 'Bestanden!'],
      bigDamage: ['Das geht an die Uni-Leitung!', 'Ich fülle ein Formular aus. Drei.'],
      newFly: ['Schon wieder eine Fliege. Unerhört.', 'Hat hier niemand ein Fenster zu gemacht?'],
    },
  },
  lukas: {
    id: 'lukas',
    name: 'Lukas',
    shooAfter: [3, 5.5],
    lines: {
      idle: ['Digga, morgen Klausur…', 'Hat jemand WLAN?', 'Eduroam ist wieder down.', 'Ich schreib meine Bachelorarbeit. Irgendwann.', 'Noch eine Mate…'],
      flyOnMe: ['Digga, eine Fliege!', 'Ey, lass mich!', 'Bro, runter da!'],
      flyOnFood: ['Nicht meine Brezel!', 'Ey, das ist meine!'],
      nearMiss: ['Digga!', 'Krass!', 'Bruder, chill!', 'Voll knapp!'],
      swatterOverMe: ['Bro… nein.', 'Ich hab nix gemacht!'],
      hurt: ['AUA, Digga!', 'Mein Kopf!', 'Ey, geht’s noch?!'],
      mineBroken: ['MEIN LAPTOP!!', 'Meine Bachelorarbeit!! 😱', 'Hast du ein Backup?!', 'Meine Mate!'],
      otherBroken: ['Krass, hab ich gefilmt!', 'Das geht viral!', 'Oof.'],
      kill: ['Ehrenmann!', 'Läuft bei dir!', 'Wie krass!'],
      bigDamage: ['Das kommt auf Insta.', 'Digga, das wird teuer.'],
      newFly: ['Runde zwei, Digga!', 'Da ist sie!'],
    },
  },
  mia: {
    id: 'mia',
    name: 'Mia',
    shooAfter: null, // she likes the fly
    lines: {
      idle: ['Ist das bio?', 'Moin moin!', 'Regnet’s draußen? Ach, Bremen.', 'Ich poste das mal.', 'Die Schorle ist lecker.'],
      flyOnMe: ['Oh! Hallo, kleine Fliege!', 'Die mag mich! 🥰'],
      flyOnFood: ['Nimm ruhig, ist vegan.', 'Teilen ist schön!'],
      nearMiss: ['Lass die arme Fliege leben!', 'Tierquäler!', 'Die Fliege hat auch Rechte!'],
      swatterOverMe: ['Nicht hauen!', 'Hallo?! Ich sitz hier!'],
      hurt: ['AUA! Spinnst du?!', 'Ey, geht’s noch?!', 'Meine Mütze!'],
      mineBroken: ['Mein Handy!!', 'Das Display!!', 'Mein Salat!'],
      otherBroken: ['Oh nein…', 'Das arme Fenster!'],
      kill: ['Nein! Die arme Fliege! 😢', 'RIP, kleine Fliege.', 'Ich bin enttäuscht.'],
      bigDamage: ['Das ist so unnachhaltig!', 'Wer räumt das auf?'],
      newFly: ['Oh, eine neue Freundin!', 'Hallo, Fliege!'],
    },
  },
  meyer: {
    id: 'meyer',
    name: 'Frau Meyer',
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

/** Little scripted conversations between the diners. */
const DIALOGUES: [PersonId, string][][] = [
  [['juergen', 'Werder gewinnt am Samstag!'], ['lukas', 'Digga… nie im Leben.'], ['juergen', 'Lebenslang Grün-Weiß!']],
  [['mia', 'Ist das etwa Currywurst? 🤢'], ['juergen', 'Das ist Kulturgut, junge Dame!']],
  [['schmidt', 'Lukas? Sie waren nicht in meiner Vorlesung.'], ['lukas', 'Äh… Eduroam war down.'], ['schmidt', 'Die Vorlesung war im Hörsaal.']],
  [['meyer', 'Essen zwei ist aus!'], ['juergen', 'Schon wieder?!']],
  [['mia', 'Regnet es draußen?'], ['juergen', 'Wir sind in Bremen. Natürlich.']],
  [['juergen', 'Moin!'], ['meyer', 'Moin moin!'], ['schmidt', 'Einmal Moin reicht.']],
  [['lukas', 'Hat jemand eine Mensakarte für mich?'], ['schmidt', 'Nein.']],
  [['mia', 'Wusstet ihr, Fliegen schmecken mit den Füßen?'], ['juergen', 'Beim Essen? Igitt.']],
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
  private queue: { p: PersonState; text: string; prio: number; at: number; mood?: Mood }[] = [];
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
  say(p: PersonState, text: string, prio: number): boolean {
    if (p.bubble && p.bubble.prio > prio && p.bubble.t < p.bubble.life * 0.7) return false;
    if (!p.bubble && prio < 2 && this.visibleBubbles() >= 2) return false;
    p.bubble = { text, t: 0, life: Math.min(3.8, 1.5 + text.length * 0.045), prio };
    return true;
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
      if (this.say(q.p, q.text, q.prio) && q.mood) this.setMood(q.p, q.mood, 2);
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

    // idle chatter and little conversations
    this.idleNext -= dt;
    if (this.idleNext <= 0) {
      this.idleNext = range(9, 18);
      if (this.visibleBubbles() === 0 && w.fly.alive) {
        if (Math.random() < 0.45) {
          const d = DIALOGUES[this.dialogueIndex++ % DIALOGUES.length];
          d.forEach(([id, text], i) => this.queue.push({ p: this.get(id), text, prio: 0, at: this.time + i * 2.4 }));
          this.idleNext += d.length * 2.4;
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
