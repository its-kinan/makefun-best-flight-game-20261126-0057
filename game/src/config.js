// Skyline Courier — tuning numbers, palette and mission definitions in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLANE = {
  /** Forward speed range in metres per second. */
  minSpeed: 42,
  cruiseSpeed: 78,
  maxSpeed: 128,
  /** Throttle changes speed by this many m/s per second. */
  throttleRate: 26,
  /** Pitch in degrees per second at full stick. */
  pitchRate: 26,
  /** Roll in degrees per second at full stick. */
  rollRate: 70,
  /** Heading turns with bank: degrees per second per degree of bank. */
  turnRate: 0.55,
  /** Climb rate follows pitch: m/s per degree of pitch. */
  climbPerPitch: 1.9,
  /** Safe touchdown vertical speed (m/s); harder than this is damage. */
  softTouchdown: 6,
  hardTouchdown: 11,
  /** Terrain clearance below which a scrape counts as a crash. */
  groundClearance: 2,
};

export const FUEL = {
  max: 100,
  /** Drain per second at cruise throttle, scaled by throttle. */
  drain: 1.15,
  /** Fuel a ring gives back. */
  ringRefill: 14,
  /** Fuel on respawn after a crash. */
  respawn: 55,
};

export const LIVES = 3;

/** Ring course geometry. Rings sit ahead of the plane on the flight path. */
export const RINGS = {
  radius: 26,
  /** Radius shrinks this much per level (difficulty ramp). */
  radiusPerLevel: 2,
  minRadius: 15,
  /** Distance between successive rings, in metres. */
  spacing: 420,
  /** Points for flying clean through a ring. */
  points: 100,
  /** Bonus for a centred pass (within 30% of the radius). */
  centreBonus: 50,
};

/** Mission catalogue: three sorties with different goals over the same valley. */
export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUN',
    short: 'Rings',
    goal: 'Fly through all 12 rings before your fuel runs out. Rings refill fuel.',
    rings: 12,
    timeLimit: 0,
    kind: 'rings',
  },
  {
    id: 'landing',
    name: 'PRECISION LANDING',
    short: 'Landing',
    goal: 'Thread 4 rings, then land on the runway. Soft touchdown scores big.',
    rings: 4,
    timeLimit: 0,
    kind: 'landing',
  },
  {
    id: 'slalom',
    name: 'SLALOM SPRINT',
    short: 'Slalom',
    goal: 'Weave 14 slalom gates against the clock. Fast and clean wins.',
    rings: 14,
    timeLimit: 150,
    kind: 'slalom',
  },
];

export const PALETTE = {
  skyTop: '#1d4e89',
  skyMid: '#7db8e8',
  skyLow: '#cfe8f7',
  sun: '#fff3c4',
  mountainFar: '#7d9cc4',
  mountainNear: '#4f7396',
  groundFar: '#6f9e5f',
  groundNear: '#4c7d43',
  fieldLight: '#8fb573',
  fieldDark: '#5d8a4e',
  river: '#4f8fc4',
  runway: '#3a3f46',
  runwayMark: '#f5f0dc',
  ring: '#ffb020',
  ringCentre: '#ffe9a8',
  planeBody: '#e8eef4',
  planeAccent: '#e5533d',
  planeDark: '#2b3542',
  hud: '#eef4f8',
  hudDim: '#a9c4d6',
  warn: '#ffb020',
  danger: '#ff5a4e',
  good: '#7ee081',
  panel: 'rgba(10, 22, 34, 0.72)',
  panelEdge: 'rgba(238, 244, 248, 0.35)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'skyline-courier.best';
