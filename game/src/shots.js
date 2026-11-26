// The screenshot scenes behind ?shot=start|play|landing|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// a simple autopilot (bank toward the next ring, pitch toward its height, hold
// cruise throttle), so the frame is what a short game really looks like and the
// same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON } from './render.js';

const SAMPLE = 1 / 30;

/** Steer toward a point: PD control on pitch and bank angles, so the stick
 * eases off as the nose reaches the wanted attitude instead of winding up
 * into a dive. A ground-avoidance pull-up overrides everything when low. */
function steerTo(world, tx, ty, tz, gentle, minClear) {
  const s = world.state;
  const p = s.plane;
  const dz = Math.max(1, tz - p.z);
  // Floor the bearing distance: close to the target a metre of lateral error
  // is not a 90-degree turn, and the wings must be level for a touchdown.
  const bearing = (Math.atan2(tx - p.x, Math.max(dz, 150)) * 180) / Math.PI;
  let headingError = bearing - p.heading;
  while (headingError > 180) headingError -= 360;
  while (headingError < -180) headingError += 360;
  const scale = gentle ? 0.55 : 1;
  const wantPitch = Math.max(-18, Math.min(18, (ty - p.y) * 0.6)) * scale;
  const wantRoll = Math.max(-45, Math.min(45, headingError * 1.6)) * scale;
  let pitch = Math.max(-1, Math.min(1, (wantPitch - p.pitch) / 12));
  let roll = Math.max(-1, Math.min(1, (wantRoll - p.roll) / 18));
  // Ground avoidance: pull up hard when low and descending. On final approach
  // the floor is low so the plane can actually reach the runway. A reckless
  // pilot (minClear 0) never pulls up.
  const clearance = p.y - world.groundAt(p.x, p.z);
  if ((minClear ?? 26) > 0 && clearance < (minClear ?? 26) && p.vspeed < 0) pitch = 1;
  return {
    pitch,
    roll,
    throttle: p.speed < 78 ? 0.6 : p.speed > 96 ? -0.4 : 0,
  };
}

/** Steer toward the next ring: bank to its bearing, pitch to its height. A
 * reckless pilot aims below the ring and never pulls up: it is caught out by
 * the terrain, as a hurried player is. */
function autopilot(world, gentle, reckless) {
  const s = world.state;
  const p = s.plane;
  const ring = s.rings[s.nextRing];
  if (!ring) return { pitch: 0, roll: 0, throttle: 0 };
  const ty = reckless ? ring.y - 30 : ring.y;
  return steerTo(world, ring.x, ty, ring.z, gentle, reckless ? 0 : 26);
}

/** Run the world forward with the autopilot until `stop` says enough. */
function fly(world, stop, gentle, reckless) {
  for (let t = 0; t < 9000; t += 1) {
    world.step(STEP, autopilot(world, gentle, reckless));
    if (stop(world)) break;
  }
}

export function stageShot(name, world) {
  if (name === 'landing') {
    world.reset(1);
    fly(world, (w) => w.state.nextRing >= w.state.rings.length, false);
    // Now line up on the runway and descend gently on a glide slope.
    for (let t = 0; t < 60 / STEP; t += 1) {
      const s = world.state;
      const p = s.plane;
      const dz = Math.max(1, world.state.runwayZ - p.z);
      // Terrain-following glide slope: stay above the hills ahead, then ride
      // the slope down to the runway threshold.
      const wantAlt = world.groundAt(0, p.z + 150) + 2 + dz * 0.045;
      const stick = steerTo(world, 0, wantAlt, world.state.runwayZ, false, 1);
      stick.throttle = p.speed < 58 ? 0.5 : p.speed > 72 ? -0.6 : 0;
      world.step(STEP, stick);
      if (s.status !== 'flying') break;
      if (p.z > world.state.runwayZ + 200) break; // overshot: keep the play frame
    }
    return { screen: world.state.status === 'landed' ? SCREEN_WON : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'end') {
    world.reset(0);
    // A hurried pilot: aims low, never pulls up, so it is caught out by the
    // terrain — crashing, respawning and crashing again until its lives run
    // out, exactly as the real game over plays.
    for (let t = 0; t < 9000; t += 1) {
      world.step(STEP, autopilot(world, false, true));
      if (world.state.status === 'crashed') world.respawn();
      if (world.state.status !== 'flying' && world.state.status !== 'crashed') break;
    }
    const over = world.state.status !== 'flying';
    return { screen: over ? (world.state.status === 'won' ? SCREEN_WON : SCREEN_OVER) : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'play') {
    world.reset(0);
    fly(world, (w) => w.state.time >= 24, false);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  // start: title screen over a valley already in gentle flight (short hop, so
  // the first ring sits ahead at a readable distance, not on top of the card).
  world.reset(0);
  for (let i = 0; i < 2.5 / STEP; i += 1) world.step(STEP, autopilot(world, false));
  return { screen: SCREEN_TITLE, best: 0 };
}
