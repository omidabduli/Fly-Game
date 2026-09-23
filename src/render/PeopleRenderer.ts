import { type PersonId, TABLE_Y } from '../environment/Scene';
import type { DamageSystem } from '../game/DamageSystem';
import type { PeopleSystem, PersonState } from '../game/People';
import type { Camera } from './Camera';
import { drawBubble } from './RoomFx';

type Ctx = CanvasRenderingContext2D;

interface Look {
  skin: string;
  hair: string;
  shirt: string;
  shirtDark: string;
  /** colour of the morsel on the fork */
  bite: string;
}

const LOOKS: Record<PersonId, Look> = {
  juergen: { skin: '#f0c4a0', hair: '#8f8478', shirt: '#1e8a4a', shirtDark: '#166a38', bite: '#9c4a26' },
  schmidt: { skin: '#f4d3bc', hair: '#cdb68d', shirt: '#34466a', shirtDark: '#26344f', bite: '#f4e1a6' },
  lukas: { skin: '#dcae88', hair: '#3f2c20', shirt: '#737a86', shirtDark: '#5a616c', bite: '#a4581f' },
  mia: { skin: '#f6d8c2', hair: '#b1532a', shirt: '#f2c230', shirtDark: '#d4a71c', bite: '#62b155' },
  meyer: { skin: '#f0bf9d', hair: '#6b5446', shirt: '#fafafa', shirtDark: '#dfe3e5', bite: '#e8b44a' },
};

const HAND_R = 5.2;

const easeInOut = (u: number) => u * u * (3 - 2 * u);

/**
 * Draws the people in the Mensa. Bodies are drawn between the background and
 * the table, forearms and hands on top of the table (so they can hold forks,
 * type and clap), and speech bubbles last, in screen space.
 */
export class PeopleRenderer {
  /** Heads, shoulders and upper arms (clipped at the table edge / behind the counter). */
  drawBodies(ctx: Ctx, people: PeopleSystem, damage: DamageSystem, time: number): void {
    for (const p of people.people) {
      const s = p.seat;
      ctx.save();
      ctx.beginPath();
      if (s.staff) ctx.rect(s.x - 60, -40, 120, 146);
      else ctx.rect(s.x - 80, -40, 160, TABLE_Y + 40.5);
      ctx.clip();
      const bob = Math.sin(time * 1.6 + s.x) * 0.5 - p.flinch * 3;
      ctx.translate(0, bob);
      this.torso(ctx, p);
      this.head(ctx, p, damage, time);
      ctx.restore();
      if (s.staff) {
        // the sneeze guard is in front of her
        ctx.fillStyle = 'rgba(210,235,245,0.22)';
        ctx.fillRect(s.x - 40, 94, 80, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(s.x - 40, 95, 80, 0.8);
      }
    }
  }

  private torso(ctx: Ctx, p: PersonState): void {
    const s = p.seat;
    const L = LOOKS[s.id];
    const x = s.x;
    const y = s.y;
    const w = s.staff ? 27 : 46;
    const bottom = s.staff ? y + 60 : TABLE_Y + 2;
    // neck
    ctx.fillStyle = L.skin;
    ctx.fillRect(x - 7, y + s.ry - 8, 14, 12);
    ctx.fillStyle = 'rgba(120,70,40,0.18)';
    ctx.fillRect(x - 7, y + s.ry - 2, 14, 3);
    // shirt / jacket
    ctx.beginPath();
    ctx.moveTo(x - 9, y + s.ry - 4);
    ctx.quadraticCurveTo(x - w + 4, y + s.ry, x - w + 1, y + s.ry + 18);
    ctx.lineTo(x - w, bottom);
    ctx.lineTo(x + w, bottom);
    ctx.lineTo(x + w - 1, y + s.ry + 18);
    ctx.quadraticCurveTo(x + w - 4, y + s.ry, x + 9, y + s.ry - 4);
    ctx.closePath();
    ctx.fillStyle = L.shirt;
    ctx.fill();
    // soft side shading
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.18)');
    g.addColorStop(0.3, 'rgba(0,0,0,0)');
    g.addColorStop(0.75, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = g;
    ctx.fill();
    const top = y + s.ry;
    switch (s.id) {
      case 'juergen': {
        // polo collar and a green-and-white striped scarf
        ctx.fillStyle = '#f4f4f0';
        ctx.beginPath();
        ctx.moveTo(x - 10, top - 4);
        ctx.lineTo(x, top + 8);
        ctx.lineTo(x + 10, top - 4);
        ctx.lineTo(x + 4, top + 2);
        ctx.lineTo(x - 4, top + 2);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x - 16, top - 4);
        ctx.quadraticCurveTo(x, top + 8, x + 16, top - 4);
        ctx.lineTo(x + 18, top + 4);
        ctx.quadraticCurveTo(x, top + 16, x - 18, top + 4);
        ctx.closePath();
        ctx.moveTo(x + 6, top + 8);
        ctx.lineTo(x + 16, top + 8);
        ctx.lineTo(x + 18, top + 44);
        ctx.lineTo(x + 8, top + 44);
        ctx.closePath();
        ctx.clip();
        for (let i = -3; i < 12; i++) {
          ctx.fillStyle = i % 2 ? '#f4f4f0' : '#1e8a4a';
          ctx.fillRect(x - 20, top - 6 + i * 4, 40, 4);
        }
        ctx.restore();
        ctx.fillStyle = '#f4f4f0';
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 8 + i * 2.4, top + 44, 1, 4);
        break;
      }
      case 'schmidt': {
        // navy blazer, white blouse, pearls
        ctx.fillStyle = '#f7f5f0';
        ctx.beginPath();
        ctx.moveTo(x - 10, top - 4);
        ctx.lineTo(x + 10, top - 4);
        ctx.lineTo(x + 6, top + 40);
        ctx.lineTo(x - 6, top + 40);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = L.shirtDark;
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x + sgn * 10, top - 4);
          ctx.lineTo(x + sgn * 4, top + 22);
          ctx.lineTo(x + sgn * 16, top + 6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = '#fbf6ea';
        for (let i = -4; i <= 4; i++) {
          ctx.beginPath();
          ctx.arc(x + i * 1.9, top + 1 + Math.abs(i) * -0.5 + 3, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
        // a pen in the breast pocket
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(x - 22, top + 18, 1.4, 8);
        break;
      }
      case 'lukas': {
        // hoodie: hood behind the neck, strings
        ctx.fillStyle = L.shirtDark;
        ctx.beginPath();
        ctx.ellipse(x, top - 2, 18, 7, 0, 0, Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#e8e6e0';
        ctx.lineWidth = 0.8;
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x + sgn * 5, top + 3);
          ctx.lineTo(x + sgn * 6, top + 22);
          ctx.stroke();
        }
        ctx.fillStyle = L.shirtDark;
        ctx.beginPath();
        ctx.roundRect(x - 16, top + 40, 32, 16, 4);
        ctx.fill();
        break;
      }
      case 'mia': {
        // yellow "Friesennerz" raincoat
        ctx.fillStyle = L.shirtDark;
        ctx.beginPath();
        ctx.moveTo(x - 14, top - 5);
        ctx.lineTo(x, top + 10);
        ctx.lineTo(x + 14, top - 5);
        ctx.lineTo(x + 16, top + 2);
        ctx.lineTo(x, top + 16);
        ctx.lineTo(x - 16, top + 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = L.shirtDark;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, top + 14);
        ctx.lineTo(x, TABLE_Y);
        ctx.stroke();
        ctx.fillStyle = '#8a6a10';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(x + 4, top + 22 + i * 12, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'meyer': {
        // white kitchen jacket, double buttons
        ctx.fillStyle = '#c9ced1';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(x - 5, top + 10 + i * 9, 1.2, 0, Math.PI * 2);
          ctx.arc(x + 5, top + 10 + i * 9, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
    }
    if (!p.seat.staff) {
      // upper arms down to the elbows at the table edge
      ctx.lineCap = 'round';
      ctx.strokeStyle = L.shirtDark;
      ctx.lineWidth = 10;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + sgn * (w - 6), top + 16);
        ctx.quadraticCurveTo(x + sgn * (w + 2), top + 50, x + sgn * (w - 2), TABLE_Y - 3);
        ctx.stroke();
      }
    }
  }

  private head(ctx: Ctx, p: PersonState, damage: DamageSystem, time: number): void {
    const s = p.seat;
    const L = LOOKS[s.id];
    const { x, y, rx, ry } = s;
    const hurtStage = damage.stage(s.id);
    // hair behind the head (long hair, bun)
    if (s.id === 'mia') {
      ctx.fillStyle = L.hair;
      ctx.beginPath();
      ctx.ellipse(x, y + 6, rx + 5, ry + 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - rx - 5, y + 4, 2 * rx + 10, 26);
    }
    // ears
    ctx.fillStyle = L.skin;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + sgn * rx, y + 2, 4, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // face
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = L.skin;
    ctx.fill();
    // mood tint
    const tint = p.mood === 'angry' ? 'rgba(230,40,20,0.18)' : p.mood === 'disgusted' ? 'rgba(110,190,60,0.22)' : p.mood === 'hurt' ? 'rgba(230,80,60,0.12)' : null;
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fill();
    }
    // laptop glow on Lukas's face
    if (s.id === 'lukas' && damage.stage('laptop') < 2) {
      ctx.fillStyle = 'rgba(120,170,255,0.13)';
      ctx.beginPath();
      ctx.ellipse(x, y + 8, rx - 2, ry - 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    this.hair(ctx, p, hurtStage);
    this.face(ctx, p, time);
    this.accessories(ctx, p, hurtStage, time);
    this.moodMarks(ctx, p, time);
  }

  private hair(ctx: Ctx, p: PersonState, hurtStage: number): void {
    const s = p.seat;
    const L = LOOKS[s.id];
    const { x, y, rx, ry } = s;
    ctx.fillStyle = L.hair;
    switch (s.id) {
      case 'juergen': {
        // shiny bald top with a thin grey fringe above the ears
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x + sgn * (rx - 1), y + 6);
          ctx.quadraticCurveTo(x + sgn * (rx + 1.5), y - 6, x + sgn * (rx - 6), y - 14);
          ctx.quadraticCurveTo(x + sgn * (rx - 3), y - 4, x + sgn * (rx - 4), y + 6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.ellipse(x - 6, y - ry + 7, 7, 3.5, -0.4, 0, Math.PI * 2);
        ctx.fill();
        if (hurtStage >= 2) {
          // a bump
          ctx.fillStyle = '#e8907a';
          ctx.beginPath();
          ctx.arc(x + 7, y - ry + 3, 5, Math.PI, 0);
          ctx.fill();
        }
        break;
      }
      case 'schmidt': {
        ctx.beginPath();
        ctx.ellipse(x, y - 8, rx + 1, ry - 8, 0, Math.PI, 0);
        ctx.quadraticCurveTo(x + rx + 1, y + 4, x + rx - 2, y + 6);
        ctx.lineTo(x + rx - 5, y - 6);
        ctx.quadraticCurveTo(x, y - 18, x - rx + 5, y - 6);
        ctx.lineTo(x - rx + 2, y + 6);
        ctx.quadraticCurveTo(x - rx - 1, y + 4, x - rx - 1, y - 8);
        ctx.fill();
        // bun with a pencil through it
        ctx.beginPath();
        ctx.arc(x, y - ry - 3, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.arc(x + 2, y - ry - 2, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e9b83a';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x - 12, y - ry - 8);
        ctx.lineTo(x + 10, y - ry + 1);
        ctx.stroke();
        break;
      }
      case 'lukas': {
        ctx.beginPath();
        ctx.moveTo(x - rx - 1, y - 2);
        const spikes = 9;
        for (let i = 0; i <= spikes; i++) {
          const a = Math.PI + (i / spikes) * Math.PI;
          const r = i % 2 ? 1.18 : 1.02;
          ctx.lineTo(x + Math.cos(a) * rx * r, y - 4 + Math.sin(a) * ry * r * 0.9);
        }
        ctx.lineTo(x + rx + 1, y - 2);
        ctx.quadraticCurveTo(x, y - 14, x - rx - 1, y - 2);
        ctx.fill();
        // stubble
        ctx.fillStyle = 'rgba(60,40,30,0.25)';
        ctx.beginPath();
        ctx.ellipse(x, y + 15, 11, 8, 0, 0, Math.PI);
        ctx.fill();
        break;
      }
      case 'mia': {
        // fringe under the beanie
        ctx.beginPath();
        ctx.ellipse(x, y - 10, rx, 9, 0, Math.PI, 0);
        ctx.fill();
        break;
      }
      case 'meyer': {
        ctx.beginPath();
        ctx.ellipse(x, y - 6, rx + 1, ry - 6, 0, Math.PI, 0);
        ctx.fill();
        break;
      }
    }
  }

  private face(ctx: Ctx, p: PersonState, time: number): void {
    const s = p.seat;
    const { x, y } = s;
    const m = p.mood;
    const ex = s.staff ? 5.5 : 8;
    const ey = y - 2;
    const er = s.staff ? 3.2 : 4.4;
    const happy = m === 'happy' || p.clapT > 0;
    // eyes
    for (const sgn of [-1, 1]) {
      const cx = x + sgn * ex;
      if (p.hurtT > 0) {
        // dizzy spirals
        ctx.strokeStyle = '#2b1d14';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 5; a += 0.3) {
          const r = (a / (Math.PI * 5)) * er;
          const aa = a + time * 8 * sgn;
          if (a === 0) ctx.moveTo(cx, ey);
          else ctx.lineTo(cx + Math.cos(aa) * r, ey + Math.sin(aa) * r);
        }
        ctx.stroke();
        continue;
      }
      if (p.blinkT > 0 || happy) {
        ctx.strokeStyle = '#2b1d14';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        if (happy) ctx.arc(cx, ey + 1.5, er * 0.8, Math.PI * 1.1, Math.PI * 1.9);
        else {
          ctx.moveTo(cx - er, ey);
          ctx.lineTo(cx + er, ey);
        }
        ctx.stroke();
        continue;
      }
      const wide = m === 'scared' || m === 'nervous' ? 1.2 : 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx, ey, er * wide, er * 1.15 * wide, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,30,0.35)';
      ctx.lineWidth = 0.35;
      ctx.stroke();
      // pupils follow whatever they look at
      const dx = p.gazeX - cx;
      const dy = p.gazeY - ey;
      const d = Math.hypot(dx, dy) || 1;
      const reach = er * 0.45;
      const pr = (m === 'scared' ? 1.3 : 1.9) * (s.staff ? 0.75 : 1);
      ctx.fillStyle = '#2b1d14';
      ctx.beginPath();
      ctx.arc(cx + (dx / d) * reach, ey + (dy / d) * reach, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(cx + (dx / d) * reach - 0.6, ey + (dy / d) * reach - 0.7, 0.55, 0, Math.PI * 2);
      ctx.fill();
      // angry eyelids
      if (m === 'angry') {
        ctx.fillStyle = LOOKS[s.id].skin;
        ctx.beginPath();
        ctx.moveTo(cx - er - 0.5, ey - er * 1.3);
        ctx.lineTo(cx + er + 0.5, ey - er * 1.3);
        ctx.lineTo(cx + er + 0.5, ey - (sgn > 0 ? er * 0.8 : 0));
        ctx.lineTo(cx - er - 0.5, ey - (sgn > 0 ? 0 : er * 0.8));
        ctx.closePath();
        ctx.fill();
      }
    }
    // eyebrows
    const browCol = s.id === 'juergen' ? '#6b5a4a' : s.id === 'schmidt' ? '#a8905e' : '#3a2a20';
    ctx.strokeStyle = browCol;
    ctx.lineWidth = s.staff ? 1 : 1.5;
    ctx.lineCap = 'round';
    const inner = m === 'angry' ? 3.5 : m === 'scared' || m === 'nervous' || m === 'sad' ? -3 : happy ? -1.5 : 0;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + sgn * (ex - er), ey - er - 3 + inner);
      ctx.lineTo(x + sgn * (ex + er), ey - er - 3.5 - inner * 0.3);
      ctx.stroke();
    }
    // nose
    ctx.strokeStyle = 'rgba(120,70,40,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - 1, y + 1);
    ctx.quadraticCurveTo(x + 3, y + 6, x - 1.5, y + 7);
    ctx.stroke();
    // cheeks
    if (happy || s.id === 'meyer' || m === 'angry') {
      ctx.fillStyle = 'rgba(240,110,100,0.3)';
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(x + sgn * (ex + 3), y + 6, 3.5, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (s.id === 'mia') {
      ctx.fillStyle = 'rgba(160,80,40,0.45)';
      for (const [fx, fy] of [[-10, 4], [-8, 6], [-12, 6], [9, 4], [11, 6], [7, 6]]) ctx.fillRect(x + fx, y + fy, 0.7, 0.7);
    }
    this.mouth(ctx, p, time);
    if (s.id === 'juergen') {
      // the moustache
      ctx.fillStyle = '#6b4f36';
      ctx.beginPath();
      ctx.ellipse(x - 5, y + 10, 6.5, 3, 0.25, 0, Math.PI * 2);
      ctx.ellipse(x + 5, y + 10, 6.5, 3, -0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private mouth(ctx: Ctx, p: PersonState, time: number): void {
    const s = p.seat;
    const x = s.x;
    const y = s.y + (s.staff ? 9 : 14);
    const w = s.staff ? 4 : 6;
    const m = p.mood;
    const talking = p.bubble !== null && p.bubble.t < p.bubble.life - 0.3;
    ctx.strokeStyle = '#6a2e22';
    ctx.fillStyle = '#6a2e22';
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    const open = (rw: number, rh: number) => {
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#5a2019';
      ctx.fill();
      ctx.fillStyle = '#e8746a';
      ctx.beginPath();
      ctx.ellipse(x, y + rh * 0.45, rw * 0.6, rh * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    if (p.hurtT > 0 || m === 'scared') {
      open(w * 0.6, w * 0.7 + (talking ? Math.abs(Math.sin(time * 20)) * 1.5 : 0));
      return;
    }
    if (talking) {
      const k = Math.abs(Math.sin(time * 17));
      if (m === 'happy' || p.clapT > 0) {
        ctx.beginPath();
        ctx.moveTo(x - w, y - 1);
        ctx.quadraticCurveTo(x, y + 4 + k * 3, x + w, y - 1);
        ctx.closePath();
        ctx.fillStyle = '#5a2019';
        ctx.fill();
      } else open(w * (m === 'angry' ? 0.9 : 0.7), 0.8 + k * (m === 'angry' ? 3.5 : 2.5));
      return;
    }
    if (p.chewT > 0) {
      const k = Math.abs(Math.sin(time * 9));
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.55 * (0.7 + k * 0.3), 0.6 + k * 1.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#6a2e22';
      ctx.fill();
      return;
    }
    ctx.beginPath();
    switch (m) {
      case 'happy':
        ctx.moveTo(x - w, y - 1);
        ctx.quadraticCurveTo(x, y + 5, x + w, y - 1);
        ctx.closePath();
        ctx.fillStyle = '#5a2019';
        ctx.fill();
        return;
      case 'angry':
      case 'sad':
        ctx.moveTo(x - w * 0.8, y + 2);
        ctx.quadraticCurveTo(x, y - 2, x + w * 0.8, y + 2);
        break;
      case 'disgusted':
      case 'nervous':
        ctx.moveTo(x - w, y);
        for (let i = 1; i <= 6; i++) ctx.lineTo(x - w + (i * 2 * w) / 6, y + (i % 2 ? 1.2 : -1.2));
        break;
      default:
        ctx.moveTo(x - w * 0.8, y);
        ctx.quadraticCurveTo(x, y + 2.5, x + w * 0.8, y);
    }
    ctx.stroke();
  }

  private accessories(ctx: Ctx, p: PersonState, hurtStage: number, time: number): void {
    const s = p.seat;
    const { x, y, rx, ry } = s;
    switch (s.id) {
      case 'juergen':
        if (hurtStage >= 1) this.plaster(ctx, x - 6, y - ry + 8, 0.5);
        if (hurtStage >= 3) this.plaster(ctx, x + 9, y - ry + 12, -0.6);
        break;
      case 'schmidt': {
        // red glasses (cracked once they have been hit)
        ctx.strokeStyle = '#b3263a';
        ctx.lineWidth = 1.1;
        const tilt = hurtStage >= 1 ? 0.08 : 0;
        ctx.save();
        ctx.translate(x, y - 2);
        ctx.rotate(tilt);
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(sgn * 8, 0, 6, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(-2, -0.5);
        ctx.quadraticCurveTo(0, -2, 2, -0.5);
        ctx.moveTo(-14, -1);
        ctx.lineTo(-rx + 1, -2);
        ctx.moveTo(14, -1);
        ctx.lineTo(rx - 1, -2);
        ctx.stroke();
        if (hurtStage >= 1) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 0.35;
          ctx.beginPath();
          ctx.moveTo(8, 0);
          ctx.lineTo(12, -4);
          ctx.moveTo(8, 0);
          ctx.lineTo(4, 3);
          ctx.moveTo(8, 0);
          ctx.lineTo(11, 4);
          ctx.moveTo(8, 0);
          ctx.lineTo(3, -3);
          ctx.stroke();
        }
        ctx.restore();
        if (hurtStage >= 2) this.plaster(ctx, x - 12, y - ry + 12, 0.4);
        break;
      }
      case 'lukas': {
        // big headphones (one side hanging loose once broken)
        const broken = hurtStage >= 2;
        ctx.strokeStyle = '#1b1b1f';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        if (broken) ctx.arc(x, y - 2, rx + 3, Math.PI * 1.05, Math.PI * 1.6);
        else ctx.arc(x, y - 2, rx + 3, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
        ctx.fillStyle = '#1b1b1f';
        ctx.beginPath();
        ctx.roundRect(x - rx - 6, y - 6, 8, 14, 3);
        if (broken) {
          ctx.save();
          ctx.translate(x + rx + 2, y + 18 + Math.sin(time * 3) * 1.5);
          ctx.rotate(0.5);
          ctx.roundRect(-4, -7, 8, 14, 3);
          ctx.restore();
        } else ctx.roundRect(x + rx - 2, y - 6, 8, 14, 3);
        ctx.fill();
        ctx.fillStyle = '#d23a2a';
        ctx.fillRect(x - rx - 5, y - 2, 1.4, 6);
        if (!broken) ctx.fillRect(x + rx + 3.6, y - 2, 1.4, 6);
        if (hurtStage >= 1) this.plaster(ctx, x + 6, y - ry + 10, -0.5);
        break;
      }
      case 'mia': {
        // teal beanie with a pom-pom (squashed after a hit)
        const flat = hurtStage >= 2;
        ctx.fillStyle = '#2a8f8b';
        ctx.beginPath();
        if (flat) ctx.ellipse(x, y - ry + 8, rx + 3, 7, 0, Math.PI, 0);
        else ctx.ellipse(x, y - ry + 12, rx + 1, ry - 4, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#227370';
        ctx.fillRect(x - rx - 1, y - ry + (flat ? 6 : 10), 2 * rx + 2, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        for (let i = -rx; i < rx; i += 3) ctx.fillRect(x + i, y - ry + (flat ? 6 : 10), 1, 6);
        if (!flat) {
          ctx.fillStyle = '#f2c230';
          ctx.beginPath();
          ctx.arc(x, y - ry - 8, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (hurtStage >= 1) this.plaster(ctx, x - 9, y + 8, 0.3);
        break;
      }
      case 'meyer': {
        // white cap and hairnet
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x - rx - 1, y - 6);
        ctx.lineTo(x - rx + 2, y - ry - 6);
        ctx.lineTo(x + rx - 2, y - ry - 6);
        ctx.lineTo(x + rx + 1, y - 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 0.4;
        ctx.stroke();
        ctx.fillStyle = '#1f8a86';
        ctx.fillRect(x - rx, y - 9, 2 * rx, 2);
        if (hurtStage >= 1) this.plaster(ctx, x + 5, y - 8, -0.4);
        break;
      }
    }
  }

  /** A band-aid ("Pflaster") stuck on after a hit. */
  private plaster(ctx: Ctx, x: number, y: number, a: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    for (const r of [0, Math.PI / 2]) {
      ctx.save();
      ctx.rotate(r);
      ctx.fillStyle = '#e8c49a';
      ctx.beginPath();
      ctx.roundRect(-7, -2.2, 14, 4.4, 2);
      ctx.fill();
      ctx.fillStyle = '#f4e3c8';
      ctx.fillRect(-2.2, -2.2, 4.4, 4.4);
      ctx.restore();
    }
    ctx.restore();
  }

  /** Stars, anger veins, sweat and tears. */
  private moodMarks(ctx: Ctx, p: PersonState, time: number): void {
    const s = p.seat;
    const { x, y, rx, ry } = s;
    if (p.hurtT > 0) {
      for (let i = 0; i < 3; i++) {
        const a = time * 5 + (i / 3) * Math.PI * 2;
        this.star(ctx, x + Math.cos(a) * (rx + 4), y - ry * 0.75 + Math.sin(a) * 5, 2.6, '#ffd84a');
      }
    }
    if (p.mood === 'angry') {
      const vx = x + rx - 3;
      const vy = y - ry + 6;
      ctx.strokeStyle = '#e02a1a';
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.arc(vx + Math.cos(a) * 3.2, vy + Math.sin(a) * 3.2, 2, a + Math.PI * 0.6, a + Math.PI * 1.4);
        ctx.stroke();
      }
    }
    if (p.mood === 'scared' || p.mood === 'nervous') this.drop(ctx, x - rx + 1, y - ry * 0.35 + (time * 6) % 3, '#7cc7ff');
    if (p.mood === 'sad') this.drop(ctx, x - 8, y + 4 + ((time * 8) % 8), '#7cc7ff');
  }

  private star(ctx: Ctx, x: number, y: number, r: number, col: string): void {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drop(ctx: Ctx, x: number, y: number, col: string): void {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y - 3.5);
    ctx.quadraticCurveTo(x + 2.4, y, x, y + 1.6);
    ctx.quadraticCurveTo(x - 2.4, y, x, y - 3.5);
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Arms on the table
  // ---------------------------------------------------------------------------

  /** Forearms and hands (on top of the table): eating, typing, clapping, shooing, holding their head. */
  drawArms(ctx: Ctx, people: PeopleSystem, time: number, fly: { x: number; y: number; alive: boolean }): void {
    for (const p of people.people) {
      if (p.seat.staff) {
        this.ladle(ctx, p, time);
        continue;
      }
      const s = p.seat;
      const L = LOOKS[s.id];
      const x = s.x;
      const y = s.y + Math.sin(time * 1.6 + x) * 0.5 - p.flinch * 3;
      const elbowL: [number, number] = [x - 44, TABLE_Y - 3];
      const elbowR: [number, number] = [x + 44, TABLE_Y - 3];
      let hl: [number, number] = s.id === 'lukas' ? [x - 14, 274] : [x - 30, 250];
      let hr: [number, number] = s.id === 'lukas' ? [x + 14, 274] : [x + 14, 254];
      let morsel = false;
      if (s.id === 'lukas' && p.mood === 'calm' && p.bite < 0) {
        // typing
        hl = [hl[0], hl[1] - Math.max(0, Math.sin(time * 19)) * 1.5];
        hr = [hr[0], hr[1] - Math.max(0, Math.sin(time * 23 + 1)) * 1.5];
      }
      if (p.hurtT > 0) {
        hl = [x - 17, y - 16];
        hr = [x + 17, y - 16];
      } else if (p.clapT > 0) {
        const gap = 2.5 + 6 * Math.abs(Math.sin(time * 13));
        hl = [x - gap, y + 58];
        hr = [x + gap, y + 58];
      } else if (p.shooT > 0) {
        const nearHead = fly.alive && Math.hypot(fly.x - x, fly.y - y) < 60;
        const bx = nearHead ? x + 24 : Math.min(x + 40, Math.max(x - 40, fly.x));
        const by = nearHead ? y + 4 : Math.max(TABLE_Y + 6, fly.y - 10);
        hr = [bx + Math.sin(time * 30) * 9, by + Math.cos(time * 30) * 3];
      } else if (p.flinch > 0.3) {
        hl = [x - 13, y + 24];
        hr = [x + 13, y + 24];
      } else if (p.bite >= 0) {
        const u = easeInOut(Math.sin(Math.PI * p.bite));
        const mouth: [number, number] = [x + 3, y + 16];
        hr = [hr[0] + (mouth[0] - hr[0]) * u, hr[1] + (mouth[1] - hr[1]) * u];
        morsel = p.bite < 0.5;
      }
      for (const [elbow, hand, side] of [
        [elbowL, hl, -1],
        [elbowR, hr, 1],
      ] as const) {
        ctx.lineCap = 'round';
        ctx.strokeStyle = L.shirtDark;
        ctx.lineWidth = 9;
        const wx = elbow[0] + (hand[0] - elbow[0]) * 0.78;
        const wy = elbow[1] + (hand[1] - elbow[1]) * 0.78;
        ctx.beginPath();
        ctx.moveTo(elbow[0], elbow[1]);
        ctx.lineTo(wx, wy);
        ctx.stroke();
        ctx.fillStyle = L.skin;
        ctx.beginPath();
        ctx.arc(hand[0], hand[1], HAND_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,70,40,0.35)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        // fork in the right hand
        if (side > 0 && s.id !== 'lukas' && p.clapT <= 0 && p.hurtT <= 0) {
          ctx.strokeStyle = '#b8bec4';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(hand[0] - 1, hand[1] - 2);
          ctx.lineTo(hand[0] - 5, hand[1] - 10);
          ctx.stroke();
          if (morsel) {
            ctx.fillStyle = L.bite;
            ctx.beginPath();
            ctx.arc(hand[0] - 5.5, hand[1] - 11, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (side > 0 && s.id === 'lukas' && morsel) {
          ctx.fillStyle = L.bite;
          ctx.beginPath();
          ctx.ellipse(hand[0] - 2, hand[1] - 4, 4, 2.4, 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  /** Frau Meyer waves her ladle when she's cross. */
  private ladle(ctx: Ctx, p: PersonState, time: number): void {
    if (p.mood !== 'angry' && p.mood !== 'nervous' && p.shooT <= 0) return;
    const s = p.seat;
    const hx = s.x + 22 + Math.sin(time * 12) * 3;
    const hy = s.y + 6;
    ctx.strokeStyle = '#c9d0d4';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + 6, hy - 22);
    ctx.stroke();
    ctx.fillStyle = '#aeb6bb';
    ctx.beginPath();
    ctx.arc(hx + 7, hy - 25, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = LOOKS.meyer.skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------------------

  /** What they say, in screen space (CSS px). */
  drawBubbles(ctx: Ctx, people: PeopleSystem, cam: Camera, reducedMotion: boolean): void {
    for (const p of people.people) {
      const b = p.bubble;
      if (!b) continue;
      const s = p.seat;
      const x = cam.sx(s.x);
      const y = cam.sy(s.y - s.ry - (s.staff ? 10 : 4));
      if (x < -60 || x > cam.viewW + 60 || y < -40 || y > cam.viewH + 40) continue;
      const u = b.t / b.life;
      const alpha = u < 0.06 ? u / 0.06 : u > 0.85 ? (1 - u) / 0.15 : 1;
      const k = Math.min(1, b.t / 0.18);
      const pop = reducedMotion ? 1 : 0.55 + 0.45 * (1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2);
      drawBubble(ctx, x, Math.max(cam.insetTop + 62, y), [p.def.name, b.text], alpha, pop, cam.viewW);
    }
  }
}
