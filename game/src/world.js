// Skyline Courier — the flight model. One fixed-step simulation over a seeded
// valley: throttle and stick discipline set speed, pitch, bank and heading;
// rings, fuel, wind and the terrain turn a sortie into decisions.
import { FUEL, LIVES, MISSIONS, PLANE, RINGS, STEP } from './config.js';
import { makeNoise } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_CRASH = 2;
export const EVENT_LANDED = 4;
export const EVENT_WIN = 8;
export const EVENT_FUEL = 16;
export const EVENT_TIMEOUT = 32;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function createWorld(random) {
  // Seeded valley: rolling hills, a river that meanders across it, and two
  // mountain ridges on the horizon. The same seed always builds the same valley.
  const hillZ = makeNoise(random, 24, 0, 1);
  const hillX = makeNoise(random, 24, 0, 1);
  const ridgeFar = makeNoise(random, 18, 0.18, 0.62);
  const ridgeNear = makeNoise(random, 18, 0.08, 0.38);
  const gustNoise = makeNoise(random, 32, -1, 1);
  const riverBase = makeNoise(random, 16, -1, 1);

  function groundAt(x, z) {
    const hills = 10 + 24 * hillZ(z * 0.0016) + 16 * hillX(x * 0.005 + z * 0.0006);
    // Flatten the runway corridor so a landing is possible: a long, gentle
    // approach valley, not a cliff — the ground eases down over 1.6 km.
    const dz = Math.abs(z - state.runwayZ);
    const corridor = (1 - smoothstep(36, 90, Math.abs(x))) * (1 - smoothstep(900, 1600, dz));
    return hills * (1 - corridor);
  }
  function riverX(z) {
    return 150 * riverBase(z * 0.0011) + 60 * Math.sin(z * 0.0007);
  }
  function gustAt(z) {
    return 6 * gustNoise(z * 0.004);
  }

  const state = {
    missionIndex: 0,
    mission: MISSIONS[0],
    level: 1,
    time: 0,
    score: 0,
    lives: LIVES,
    fuel: FUEL.max,
    rings: [],
    nextRing: 0,
    runwayZ: 0,
    plane: {
      x: 0, y: 90, z: 0,
      heading: 0, pitch: 0, roll: 0,
      speed: PLANE.cruiseSpeed, throttle: 0.55, vspeed: 0,
    },
    wind: 0,
    status: 'flying',
    message: '',
    messageTime: 0,
    lastRingScore: 0,
    landedQuality: 0,
    invulnerable: 0,
    fuelEmptyAnnounced: false,
  };

  function buildRings() {
    const mission = state.mission;
    const rings = [];
    const radius = Math.max(RINGS.minRadius, RINGS.radius - RINGS.radiusPerLevel * (state.level - 1));
    state.runwayZ = 480 + mission.rings * RINGS.spacing + 650;
    for (let i = 0; i < mission.rings; i += 1) {
      // Slalom gates sit further apart: a 210 m swing between gates is not
      // flyable at cruise speed, so the slalom runs wider and gentler.
      const spacing = mission.kind === 'slalom' ? 560 : RINGS.spacing;
      const z = 480 + i * spacing;
      let x;
      let y;
      if (mission.kind === 'slalom') {
        x = (i % 2 === 0 ? -1 : 1) * 80;
        y = 62 + 18 * Math.sin(i * 1.1);
      } else if (mission.kind === 'landing') {
        x = 70 * Math.sin(i * 1.2);
        y = 95 - i * 14;
      } else {
        x = 95 * Math.sin(i * 0.9);
        y = 68 + 26 * Math.sin(i * 1.3);
      }
      // Never bury a ring in a hill: keep it clear of the terrain below it.
      y = Math.max(y, groundAt(x, z) + 28);
      rings.push({ x, y, z, radius, passed: false, centre: false });
    }
    state.rings = rings;
    state.nextRing = 0;
  }

  function reset(missionIndex) {
    state.missionIndex = missionIndex;
    state.mission = MISSIONS[missionIndex];
    state.level = 1;
    state.time = 0;
    state.score = 0;
    state.lives = LIVES;
    state.fuel = FUEL.max;
    state.plane = {
      x: 0, y: 90, z: 0,
      heading: 0, pitch: 0, roll: 0,
      speed: PLANE.cruiseSpeed, throttle: 0.55, vspeed: 0,
    };
    state.status = 'flying';
    state.message = `${state.mission.name} — ${state.mission.goal}`;
    state.messageTime = 5;
    state.lastRingScore = 0;
    state.landedQuality = 0;
    state.invulnerable = 0;
    state.fuelEmptyAnnounced = false;
    buildRings();
  }

  function respawn() {
    const p = state.plane;
    p.y = Math.max(p.y, groundAt(p.x, p.z) + 70);
    p.pitch = 0;
    p.roll = 0;
    p.speed = PLANE.cruiseSpeed;
    p.throttle = 0.55;
    p.vspeed = 0;
    state.fuel = Math.max(state.fuel, FUEL.respawn);
    state.invulnerable = 2.5;
    state.status = 'flying';
  }

  function crash(reason) {
    state.lives -= 1;
    state.message = reason;
    state.messageTime = 3;
    if (state.lives <= 0) {
      state.status = 'over';
      return EVENT_CRASH;
    }
    state.status = 'crashed';
    return EVENT_CRASH;
  }

  function step(dt, stick) {
    if (state.status !== 'flying') return EVENT_NONE;
    const p = state.plane;
    state.time += dt;
    if (state.messageTime > 0) state.messageTime -= dt;
    if (state.invulnerable > 0) state.invulnerable -= dt;

    // Wind gust along this stretch of valley, pushing the plane sideways.
    state.wind = gustAt(p.z);
    p.x += state.wind * dt * 0.6;

    // Throttle: stick moves it, fuel starvation pins it shut.
    if (state.fuel > 0) {
      p.throttle = clamp(p.throttle + stick.throttle * 0.55 * dt, 0, 1);
    } else {
      p.throttle = 0;
      if (!state.fuelEmptyAnnounced) {
        state.fuelEmptyAnnounced = true;
        state.message = 'FUEL EMPTY — gliding. Find a ring!';
        state.messageTime = 4;
        return EVENT_FUEL;
      }
    }
    const targetSpeed = PLANE.minSpeed + p.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
    p.speed += clamp(targetSpeed - p.speed, -PLANE.throttleRate * dt, PLANE.throttleRate * dt);

    // Pitch and roll: sticks move them, the plane gently self-levels.
    p.pitch = clamp(p.pitch + stick.pitch * PLANE.pitchRate * dt, -28, 34);
    if (stick.pitch === 0) p.pitch += (0 - p.pitch) * 0.35 * dt;
    p.roll = clamp(p.roll + stick.roll * PLANE.rollRate * dt, -62, 62);
    if (stick.roll === 0) p.roll += (0 - p.roll) * 0.9 * dt;
    p.heading += p.roll * PLANE.turnRate * dt;

    // Climb follows pitch; slow flight sinks.
    const sink = p.speed < 58 ? (58 - p.speed) * 0.35 : 0;
    p.vspeed = p.pitch * PLANE.climbPerPitch - sink;
    p.y += p.vspeed * dt;
    const headingRad = (p.heading * Math.PI) / 180;
    p.z += p.speed * Math.cos(headingRad) * dt;
    p.x += p.speed * Math.sin(headingRad) * dt;
    // The valley walls push back: beyond them the air turns you home.
    if (Math.abs(p.x) > 420) {
      p.x = 420 * Math.sign(p.x);
      p.heading += (p.x > 0 ? -1 : 1) * 22 * dt;
    }
    if (p.y > 420) { p.y = 420; p.pitch = Math.min(p.pitch, 0); }

    // Fuel: throttle-hungry, rings refill.
    state.fuel = Math.max(0, state.fuel - FUEL.drain * (0.35 + p.throttle) * dt);

    // Slalom clock.
    let events = EVENT_NONE;
    if (state.mission.timeLimit > 0) {
      const left = state.mission.timeLimit - state.time;
      if (left <= 0) {
        state.status = 'over';
        state.message = 'TIME UP';
        state.messageTime = 4;
        return EVENT_TIMEOUT;
      }
    }

    // Ring crossings: crossing a ring's plane scores by how centred the pass was.
    const ring = state.rings[state.nextRing];
    if (ring && p.z >= ring.z) {
      const dx = p.x - ring.x;
      const dy = p.y - ring.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= ring.radius) {
        const centred = dist <= ring.radius * 0.3;
        const gained = RINGS.points + (centred ? RINGS.centreBonus : 0);
        ring.passed = true;
        ring.centre = centred;
        state.score += gained;
        state.lastRingScore = gained;
        state.fuel = Math.min(FUEL.max, state.fuel + FUEL.ringRefill);
        state.message = centred ? `PERFECT PASS +${gained}` : `RING +${gained} — fuel +${FUEL.ringRefill}`;
        state.messageTime = 2.2;
        state.nextRing += 1;
        state.level = Math.min(12, 1 + Math.floor(state.nextRing / 4));
        events |= EVENT_RING;
        if (state.nextRing >= state.rings.length) {
          if (state.mission.kind === 'landing') {
            state.message = 'RINGS CLEAR — line up for the runway!';
            state.messageTime = 4;
          } else {
            state.status = 'won';
            state.score += state.mission.kind === 'slalom'
              ? Math.max(0, Math.round((state.mission.timeLimit - state.time) * 10))
              : 250;
            state.message = 'MISSION COMPLETE';
            state.messageTime = 5;
            return events | EVENT_WIN;
          }
        }
      } else {
        // Missed the ring: it stays behind, no second chance.
        ring.passed = false;
        state.message = 'RING MISSED';
        state.messageTime = 1.6;
        state.nextRing += 1;
        if (state.nextRing >= state.rings.length && state.mission.kind !== 'landing') {
          state.status = state.score > 0 ? 'won' : 'over';
          state.message = state.status === 'won' ? 'MISSION COMPLETE' : 'NO RINGS — SORTIE OVER';
          return events | EVENT_WIN;
        }
      }
    }

    // Landing: on the runway, slow and level, a soft touchdown scores.
    const ground = groundAt(p.x, p.z);
    if (state.mission.kind === 'landing' && state.nextRing >= state.rings.length) {
      const onRunway = Math.abs(p.x) < 26 && Math.abs(p.z - state.runwayZ) < 300;
      if (onRunway && p.y <= ground + PLANE.groundClearance + 1) {
        const vs = Math.abs(p.vspeed);
        if (vs <= PLANE.hardTouchdown && Math.abs(p.roll) < 18 && p.speed < 95) {
          const quality = vs <= PLANE.softTouchdown ? 500 : 200;
          state.landedQuality = quality;
          state.score += quality;
          state.status = 'landed';
          state.message = vs <= PLANE.softTouchdown ? 'BUTTER-SMOOTH LANDING!' : 'LANDED — a bit firm';
          state.messageTime = 5;
          return events | EVENT_LANDED;
        }
        return crash('TOO HARD — the runway wins this time');
      }
    }

    // Terrain: the ground is not a suggestion.
    if (p.y <= ground + PLANE.groundClearance && state.invulnerable <= 0) {
      return crash(p.y <= ground + 0.5 ? 'TERRAIN STRIKE' : 'CLIPPED THE GROUND');
    }
    if (p.y <= ground + PLANE.groundClearance && state.invulnerable > 0) {
      p.y = ground + PLANE.groundClearance + 1;
      p.pitch = 6;
      p.vspeed = 0;
    }
    return events;
  }

  reset(0);

  return {
    state,
    reset,
    respawn,
    step,
    groundAt,
    riverX,
    ridgeFar,
    ridgeNear,
    STEP,
  };
}
