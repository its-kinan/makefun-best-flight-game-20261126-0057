// Skyline Courier — the renderer. A chase-view pseudo-3D scene painted on one
// canvas: sky, sun and drifting cloud, two mountain ridges, a perspective valley
// floor with a river and a runway, glowing target rings ahead, the aircraft in
// frame with its instruments lit, and a full flight HUD.
import { FIELD, MISSIONS, PALETTE, FONT } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WON = 'won';

const FOCAL = 560;
const HORIZON_BASE = 330;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const clouds = [];
  const cloudRand = createRandom(20261126);
  for (let i = 0; i < 14; i += 1) {
    clouds.push({
      x: (cloudRand() - 0.5) * 1600,
      y: 150 + cloudRand() * 130,
      z: cloudRand() * 2400,
      w: 120 + cloudRand() * 160,
    });
  }

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(FIELD.width * dpr);
    canvas.height = Math.round(FIELD.height * dpr);
    ctx.setTransform(canvas.width / FIELD.width, 0, 0, canvas.height / FIELD.height, 0, 0);
  }
  fit();
  window.addEventListener('resize', fit);

  function project(world, dx, dy, dz) {
    if (dz < 12) return null;
    const p = world.state.plane;
    const horizonY = HORIZON_BASE - p.pitch * 3.2;
    const vanishX = FIELD.width / 2 - p.heading * 6;
    return {
      x: vanishX + (dx * FOCAL) / dz,
      y: horizonY - (dy * FOCAL) / dz,
      s: FOCAL / dz,
    };
  }

  function drawSky(world) {
    const p = world.state.plane;
    const g = ctx.createLinearGradient(0, 0, 0, HORIZON_BASE + 60);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.55, PALETTE.skyMid);
    g.addColorStop(1, PALETTE.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, HORIZON_BASE + 60);
    // Sun, fixed in the sky ahead-left.
    const sunX = 980 - p.heading * 4;
    const sunY = 92 - p.pitch * 1.5;
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    glow.addColorStop(0, 'rgba(255,243,196,0.95)');
    glow.addColorStop(0.35, 'rgba(255,243,196,0.45)');
    glow.addColorStop(1, 'rgba(255,243,196,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 90, sunY - 90, 180, 180);
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawClouds(world) {
    const p = world.state.plane;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const c of clouds) {
      const dz = ((c.z - p.z) % 2400 + 2400) % 2400 + 60;
      if (dz < 500) continue;
      const pr = project(world, c.x - p.x, c.y - p.y + 40, dz);
      if (!pr || pr.y < 100) continue;
      const w = Math.min(c.w * pr.s, 240);
      ctx.beginPath();
      ctx.ellipse(pr.x, pr.y, w, w * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRidge(world, fn, colour, base) {
    const p = world.state.plane;
    const horizonY = HORIZON_BASE - p.pitch * 3.2;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, FIELD.height);
    for (let sx = 0; sx <= FIELD.width; sx += 16) {
      const t = (sx / FIELD.width + p.heading / 240 + p.z * 0.00004) % 1;
      const h = fn(t) * base;
      ctx.lineTo(sx, horizonY - h + 26);
    }
    ctx.lineTo(FIELD.width, FIELD.height);
    ctx.closePath();
    ctx.fill();
  }

  function drawGround(world) {
    const p = world.state.plane;
    const horizonY = HORIZON_BASE - p.pitch * 3.2;
    // Valley floor: perspective bands, near green to far haze.
    let prevY = horizonY;
    let d = 70;
    let band = 0;
    while (prevY < FIELD.height + 4 && band < 26) {
      const nextD = d * 1.42;
      const y = horizonY + (FIELD.height - horizonY) * (1 - 70 / nextD);
      const g = ctx.createLinearGradient(0, prevY, 0, y);
      const near = band % 2 === 0;
      g.addColorStop(0, near ? PALETTE.groundFar : PALETTE.fieldLight);
      g.addColorStop(1, near ? PALETTE.groundNear : PALETTE.fieldDark);
      ctx.fillStyle = g;
      ctx.fillRect(0, prevY, FIELD.width, y - prevY + 1);
      // Converging field seams.
      ctx.strokeStyle = 'rgba(20,40,20,0.18)';
      ctx.lineWidth = 1;
      for (let k = -6; k <= 6; k += 1) {
        const vx = FIELD.width / 2 - p.heading * 6;
        ctx.beginPath();
        ctx.moveTo(vx + k * 60 * (70 / d), prevY);
        ctx.lineTo(vx + k * 60 * (70 / nextD) * 3.2, y);
        ctx.stroke();
      }
      prevY = y;
      d = nextD;
      band += 1;
    }
    // River: a meandering blue ribbon down the valley.
    ctx.fillStyle = PALETTE.river;
    ctx.beginPath();
    let first = true;
    for (let dz = 60; dz < 1400; dz += 60) {
      const rx = world.riverX(p.z + dz) - p.x;
      const pr = project(world, rx, -(p.y - world.groundAt(p.x + rx, p.z + dz)), dz);
      if (!pr) continue;
      const w = Math.min(26 * pr.s + 2, 60);
      if (first) { ctx.moveTo(pr.x - w, pr.y); first = false; }
      else ctx.lineTo(pr.x - w, pr.y);
    }
    for (let dz = 1380; dz >= 60; dz -= 60) {
      const rx = world.riverX(p.z + dz) - p.x;
      const pr = project(world, rx, -(p.y - world.groundAt(p.x + rx, p.z + dz)), dz);
      if (!pr) continue;
      const w = Math.min(26 * pr.s + 2, 60);
      ctx.lineTo(pr.x + w, pr.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawRunway(world) {
    const p = world.state.plane;
    const rz = world.state.runwayZ;
    const dz = rz - p.z;
    if (dz < -320 || dz > 2200) return;
    const corners = [
      project(world, -15 - p.x, -(p.y - 0), dz - 300),
      project(world, 15 - p.x, -(p.y - 0), dz - 300),
      project(world, 15 - p.x, -(p.y - 0), dz + 300),
      project(world, -15 - p.x, -(p.y - 0), dz + 300),
    ];
    if (corners.some((c) => c === null)) return;
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fill();
    // Centre dashes and threshold bars.
    ctx.strokeStyle = PALETTE.runwayMark;
    ctx.lineWidth = Math.max(1, 3 * corners[0].s);
    ctx.beginPath();
    for (let off = -260; off <= 260; off += 65) {
      const a = project(world, 0 - p.x, -(p.y - 0) + 0.4, dz + off);
      const b = project(world, 0 - p.x, -(p.y - 0) + 0.4, dz + off + 34);
      if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    }
    ctx.stroke();
    // Runway label board at the threshold.
    const sign = project(world, 0 - p.x, 26, dz - 320);
    if (sign && dz > 0) {
      ctx.fillStyle = PALETTE.panel;
      ctx.fillRect(sign.x - 34, sign.y - 16, 68, 26);
      ctx.strokeStyle = PALETTE.panelEdge;
      ctx.strokeRect(sign.x - 34, sign.y - 16, 68, 26);
      ctx.fillStyle = PALETTE.hud;
      ctx.font = `700 ${Math.max(11, 15 * sign.s + 6)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('RWY 09', sign.x, sign.y + 3);
    }
  }

  function drawRings(world) {
    const p = world.state.plane;
    const rings = world.state.rings;
    for (let i = world.state.nextRing; i < Math.min(rings.length, world.state.nextRing + 3); i += 1) {
      const r = rings[i];
      const dz = r.z - p.z;
      if (dz < 10 || dz > 2400) continue;
      const pr = project(world, r.x - p.x, r.y - p.y, dz);
      if (!pr) continue;
      const rad = r.radius * pr.s;
      const isNext = i === world.state.nextRing;
      ctx.save();
      ctx.globalAlpha = clamp(1.15 - dz / 2400, 0.25, 1);
      ctx.lineWidth = Math.max(2, rad * 0.16);
      ctx.strokeStyle = isNext ? PALETTE.ring : 'rgba(255,176,32,0.55)';
      ctx.shadowColor = PALETTE.ring;
      ctx.shadowBlur = isNext ? 18 : 6;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, Math.max(3, rad), 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = PALETTE.ringCentre;
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, Math.max(1.5, rad * 0.1), 0, Math.PI * 2);
      ctx.fill();
      if (isNext) {
        ctx.fillStyle = PALETTE.hud;
        ctx.font = `700 15px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`RING ${i + 1}/${rings.length} — ${Math.round(dz)}m`, pr.x, pr.y - rad - 12);
      }
      ctx.restore();
    }
  }

  function drawPlane(world) {
    const p = world.state.plane;
    const cx = FIELD.width / 2;
    const cy = 566;
    const scale = 1 + clamp((p.speed - 78) / 260, -0.12, 0.18);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-p.roll * Math.PI) / 180 * 0.9);
    ctx.scale(scale, scale);
    // Wings.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-150, 6); ctx.lineTo(-34, -6); ctx.lineTo(34, -6); ctx.lineTo(150, 6);
    ctx.lineTo(138, 20); ctx.lineTo(0, 14); ctx.lineTo(-138, 20);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = PALETTE.planeAccent;
    ctx.fillRect(-150, 8, 24, 7);
    ctx.fillRect(126, 8, 24, 7);
    // Nav lights, lit.
    ctx.fillStyle = '#ff5a4e';
    ctx.beginPath(); ctx.arc(-152, 12, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7ee081';
    ctx.beginPath(); ctx.arc(152, 12, 5, 0, Math.PI * 2); ctx.fill();
    // Fuselage, seen from behind and above, nose away.
    const fus = ctx.createLinearGradient(0, -78, 0, 62);
    fus.addColorStop(0, '#f4f8fb');
    fus.addColorStop(1, '#b9c8d4');
    ctx.fillStyle = fus;
    ctx.beginPath();
    ctx.moveTo(0, -84);
    ctx.quadraticCurveTo(20, -60, 22, -18);
    ctx.quadraticCurveTo(24, 30, 16, 62);
    ctx.quadraticCurveTo(0, 72, -16, 62);
    ctx.quadraticCurveTo(-24, 30, -22, -18);
    ctx.quadraticCurveTo(-20, -60, 0, -84);
    ctx.closePath(); ctx.fill();
    // Cockpit glass with lit instruments glinting.
    ctx.fillStyle = '#16283a';
    ctx.beginPath();
    ctx.ellipse(0, -34, 13, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(126,224,129,0.9)';
    ctx.fillRect(-7, -40, 14, 3);
    ctx.fillStyle = 'rgba(255,176,32,0.9)';
    ctx.fillRect(-7, -33, 14, 2);
    // Tail.
    ctx.fillStyle = PALETTE.planeAccent;
    ctx.beginPath();
    ctx.moveTo(-26, 52); ctx.lineTo(0, 30); ctx.lineTo(26, 52); ctx.lineTo(18, 62); ctx.lineTo(-18, 62);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = PALETTE.planeDark;
    ctx.beginPath();
    ctx.moveTo(0, 62); ctx.lineTo(-7, 88); ctx.lineTo(7, 88);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function gauge(x, y, r, label, value, colour) {
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.font = `700 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(value, x, y + 1);
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = `600 9px ${FONT}`;
    ctx.fillText(label, x, y + r - 7);
  }

  function drawHUD(world, screen) {
    const s = world.state;
    const p = s.plane;
    // Top strip.
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, FIELD.width, 58);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = `700 22px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`SPD ${Math.round(p.speed * 1.94)} kt`, 18, 26);
    ctx.fillText(`ALT ${Math.round(p.y * 3.28)} ft`, 210, 26);
    const hdg = ((Math.round(p.heading) % 360) + 360) % 360;
    ctx.fillText(`HDG ${String(hdg).padStart(3, '0')}°`, 420, 26);
    ctx.fillText(`SCORE ${s.score}`, 620, 26);
    ctx.fillText(`RINGS ${s.nextRing}/${s.rings.length}`, 830, 26);
    ctx.textAlign = 'right';
    ctx.fillText(`LIVES ${'●'.repeat(Math.max(0, s.lives))}${'○'.repeat(Math.max(0, 3 - s.lives))}`, FIELD.width - 18, 26);
    // Compass strip.
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 15) {
      const a = ((Math.round((p.heading + d) / 15) * 15) % 360 + 360) % 360;
      const x = FIELD.width / 2 + d * 4;
      ctx.fillText(a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a), x, 50);
    }
    ctx.fillStyle = PALETTE.ring;
    ctx.fillRect(FIELD.width / 2 - 1, 40, 2, 12);
    // Fuel bar + throttle.
    const fuelW = 220;
    ctx.fillStyle = 'rgba(10,22,34,0.72)';
    ctx.fillRect(18, 66, fuelW, 14);
    ctx.fillStyle = s.fuel < 25 ? PALETTE.danger : s.fuel < 50 ? PALETTE.warn : PALETTE.good;
    ctx.fillRect(18, 66, fuelW * (s.fuel / 100), 14);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.strokeRect(18, 66, fuelW, 14);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`FUEL ${Math.round(s.fuel)}%`, 246, 78);
    ctx.fillText(`THR ${Math.round(p.throttle * 100)}%`, 350, 78);
    ctx.fillText(`LVL ${s.level}`, 460, 78);
    if (s.mission.timeLimit > 0) {
      const left = Math.max(0, s.mission.timeLimit - s.time);
      ctx.fillStyle = left < 20 ? PALETTE.danger : PALETTE.hud;
      ctx.fillText(`TIME ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, 540, 78);
    }
    // Wind.
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText(`WIND ${s.wind >= 0 ? '→' : '←'} ${Math.abs(Math.round(s.wind))} kt`, 660, 78);
    // Centre reticle + flight-path marker.
    ctx.strokeStyle = 'rgba(238,244,248,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(FIELD.width / 2, HORIZON_BASE - p.pitch * 3.2, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(FIELD.width / 2 - 22, HORIZON_BASE - p.pitch * 3.2);
    ctx.lineTo(FIELD.width / 2 - 8, HORIZON_BASE - p.pitch * 3.2);
    ctx.moveTo(FIELD.width / 2 + 8, HORIZON_BASE - p.pitch * 3.2);
    ctx.lineTo(FIELD.width / 2 + 22, HORIZON_BASE - p.pitch * 3.2);
    ctx.stroke();
    // Artificial horizon + gauges, bottom-left instrument cluster.
    const gx = 92; const gy = 648;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate((-p.roll * Math.PI) / 180);
    ctx.fillStyle = '#3a6ea5';
    ctx.beginPath(); ctx.arc(0, 0, 34, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#7a5a34';
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.beginPath(); ctx.arc(gx, gy, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = PALETTE.hud;
    ctx.beginPath();
    ctx.moveTo(gx - 18, gy - p.pitch * 0.8); ctx.lineTo(gx + 18, gy - p.pitch * 0.8);
    ctx.lineTo(gx, gy - p.pitch * 0.8 + 8); ctx.closePath(); ctx.fill();
    gauge(180, 648, 30, 'VERT m/s', (p.vspeed >= 0 ? '+' : '') + p.vspeed.toFixed(1), p.vspeed < -8 ? PALETTE.danger : PALETTE.hud);
    gauge(252, 648, 30, 'BANK °', String(Math.round(p.roll)), Math.abs(p.roll) > 45 ? PALETTE.warn : PALETTE.hud);
    // Message line.
    if (s.message && s.messageTime > 0) {
      ctx.fillStyle = PALETTE.panel;
      const w = ctx.measureText(s.message).width + 36;
      ctx.fillRect(FIELD.width / 2 - w / 2 - 18, 96, w + 36, 34);
      ctx.fillStyle = PALETTE.ring;
      ctx.font = `700 17px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(s.message, FIELD.width / 2, 119);
    }
    // Controls reminder, bottom-right.
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('↑↓ pitch · ←→ bank · SHIFT/CTRL throttle · P pause', FIELD.width - 14, 700);
    if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(6,14,22,0.55)';
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.fillStyle = PALETTE.hud;
      ctx.font = `700 44px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', FIELD.width / 2, 340);
      ctx.font = `400 17px ${FONT}`;
      ctx.fillText('Press P or click START to keep flying', FIELD.width / 2, 380);
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(8,18,30,0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  }

  function drawTitle(world, best) {
    panel(240, 92, 800, 536);
    ctx.fillStyle = PALETTE.ring;
    ctx.font = `700 52px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('SKYLINE COURIER', FIELD.width / 2, 158);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = `400 18px ${FONT}`;
    ctx.fillText('Chase-view flight over the valley — rings, fuel, and one good runway.', FIELD.width / 2, 190);
    MISSIONS.forEach((m, i) => {
      const y = 224 + i * 92;
      const selected = world.state.missionIndex === i;
      ctx.fillStyle = selected ? 'rgba(255,176,32,0.18)' : 'rgba(238,244,248,0.06)';
      ctx.fillRect(272, y, 736, 78);
      ctx.strokeStyle = selected ? PALETTE.ring : PALETTE.panelEdge;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(272, y, 736, 78);
      ctx.fillStyle = selected ? PALETTE.ring : PALETTE.hud;
      ctx.font = `700 20px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${m.name}`, 292, y + 30);
      ctx.fillStyle = PALETTE.hudDim;
      ctx.font = `400 14px ${FONT}`;
      ctx.fillText(m.goal, 292, y + 56);
    });
    ctx.fillStyle = PALETTE.hud;
    ctx.font = `400 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('Pick a mission: keys 1–3, or press SPACE to fly the selected one.', FIELD.width / 2, 522);
    ctx.fillText('↑↓ pitch · ←→ bank · SHIFT throttle up · CTRL throttle down · drag to steer', FIELD.width / 2, 548);
    ctx.fillText('Fly through rings to score and refuel. Mind the mountains.', FIELD.width / 2, 574);
    if (best > 0) {
      ctx.fillStyle = PALETTE.ring;
      ctx.font = `700 16px ${FONT}`;
      ctx.fillText(`BEST SCORE ${best}`, FIELD.width / 2, 606);
    }
  }

  function drawEnd(world, best, won) {
    const s = world.state;
    panel(340, 170, 600, 380);
    ctx.textAlign = 'center';
    ctx.fillStyle = won ? PALETTE.good : PALETTE.danger;
    ctx.font = `700 42px ${FONT}`;
    ctx.fillText(s.status === 'landed' ? 'LANDED!' : won ? 'MISSION COMPLETE!' : 'SORTIE OVER', FIELD.width / 2, 238);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = `400 18px ${FONT}`;
    ctx.fillText(s.message || '', FIELD.width / 2, 272);
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(`SCORE ${s.score}`, FIELD.width / 2, 330);
    ctx.font = `400 17px ${FONT}`;
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText(`Rings ${s.nextRing}/${s.rings.length} · Time ${Math.round(s.time)}s · Best ${Math.max(best, s.score)}`, FIELD.width / 2, 366);
    if (s.landedQuality > 0) ctx.fillText(`Landing bonus +${s.landedQuality}`, FIELD.width / 2, 396);
    ctx.fillStyle = PALETTE.ring;
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText('Press SPACE to fly again', FIELD.width / 2, 460);
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = `400 14px ${FONT}`;
    ctx.fillText('Keys 1–3 pick another mission on the title screen.', FIELD.width / 2, 490);
  }

  function draw(world, screen, best) {
    const p = world.state.plane;
    ctx.save();
    // The world rolls gently with the bank; the HUD stays level.
    ctx.translate(FIELD.width / 2, HORIZON_BASE);
    ctx.rotate((-p.roll * Math.PI) / 180 * 0.12);
    ctx.translate(-FIELD.width / 2, -HORIZON_BASE);
    drawSky(world);
    drawClouds(world);
    drawRidge(world, world.ridgeFar, PALETTE.mountainFar, 150);
    drawRidge(world, world.ridgeNear, PALETTE.mountainNear, 90);
    drawGround(world);
    drawRunway(world);
    drawRings(world);
    ctx.restore();
    drawPlane(world);
    if (screen === SCREEN_TITLE) {
      drawHUD(world, screen);
      drawTitle(world, best);
    } else if (screen === SCREEN_OVER || screen === SCREEN_WON) {
      drawHUD(world, screen);
      drawEnd(world, best, screen === SCREEN_WON);
    } else {
      drawHUD(world, screen);
    }
  }

  return { draw, fit };
}
