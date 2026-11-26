// Ridge Runner — tuning constants. One place for every number the flight
// model, the missions and the HUD agree on, so a tweak here moves the whole
// game together.
export const GAME_TITLE = 'RIDGE RUNNER';

export const STEP = 1 / 60;

// World size in metres. The terrain is a square centred on the origin.
export const WORLD_SIZE = 1200;

// Runway 27: a flat strip along the X axis, centred on the origin.
// Landing means flying west (heading 270) onto it.
export const RUNWAY = {
  x: 0,
  z: 0,
  length: 240,
  width: 20,
  headingDeg: 270,
  // Touchdown zone centre (a little past the eastern threshold).
  touchdownX: 60,
};

// Flight envelope.
export const FLIGHT = {
  minSpeed: 18, // below this the wing stops flying and the nose drops
  baseSpeed: 25, // speed at idle throttle
  maxSpeed: 88, // full throttle, level flight
  accel: 7, // m/s^2 toward the throttle's target speed
  maxPitch: 0.38, // radians of climb/descent the stick commands
  maxBank: 0.95, // radians of roll the stick commands
  pitchRate: 1.6, // rad/s the pitch chases its target
  bankRate: 2.2, // rad/s the bank chases its target
  turnFactor: 1.0, // bank turns into heading at the full textbook rate:
  // at full throttle turns are wide, so slowing down to turn tight is
  // a real decision. (0.62 was tried first and measured unflyable:
  // the autopilot could not close a 90-degree course change inside
  // one 200 m leg, 26 Nov 2026.)
  stallSink: 0.9, // extra m/s of sink per m/s under minSpeed
  overspeed: 88, // above this the airframe takes damage
};

// Fuel: percent. Drains with throttle; empty means the engine quits.
export const FUEL = {
  start: 100,
  baseDrain: 0.15, // %/s at idle
  throttleDrain: 0.55, // extra %/s at full throttle
  lowWarning: 25,
};

// Damage: percent. 100 means the airframe fails.
export const DAMAGE = {
  ringScrape: 15, // clipping a ring's rim on the way through
  hardBounce: 25, // a firm touchdown that is not a crash
  overspeedRate: 3, // %/s above FLIGHT.overspeed
};

// Rings: radius in metres; a pass counts inside passRadius of the centre
// as the plane crosses the ring's plane, a scrape between pass and rim.
export const RING = {
  radius: 9,
  passRadius: 7.5,
  rimRadius: 11,
};

// Scoring.
export const SCORE = {
  ring: 100,
  smoothRingBonus: 25, // passing a ring nearly level
  landing: 250,
  centrelineBonus: 50, // landing within 3 m of the centreline
};

// Landing window: touch the runway inside these limits and it counts.
export const LANDING = {
  // A firm landing is survivable: 5 m/s down is a hard arrival, not
  // a crash. (3.0 m/s was tuned too tight — with binary pitch keys
  // the band of pitch that lands inside it is a ~0.05 s tap, which
  // no human flies reliably, and the autopilot's descent pulses kept
  // landing in it by luck. 26 Nov 2026.)
  maxDescent: 5.0, // m/s of sink at touchdown
  bounceDescent: 7.0, // up to this is a hard bounce, not a crash
  maxSpeed: 46, // m/s at touchdown
  maxBank: 0.28, // radians of bank at touchdown
  maxOffset: 7, // metres off the centreline at touchdown
};

// Colours: one style for sky, terrain, town and aircraft.
export const PALETTE = {
  sky: 0x8ec3e8,
  fog: 0x9fc8e8,
  grass: 0x6da34a,
  grassDry: 0x9aa854,
  rock: 0x8a8d90,
  snow: 0xe8eef2,
  sand: 0xd8c98f,
  water: 0x3a7bd5,
  asphalt: 0x33373d,
  paintWhite: 0xf2f2ee,
  paintAmber: 0xffb020,
  townRoof: 0xa8543c,
  townWall: 0xd8cdb4,
  tree: 0x3f7a34,
  trunk: 0x6b4a2f,
  cloud: 0xffffff,
  aircraftBody: 0xd84a2f,
  aircraftWing: 0xf2ede2,
  aircraftTrim: 0x2456a8,
  ringNext: 0xff8c1a,
  ringDone: 0x2fd35f,
  ringIdle: 0x8fa8bf,
};

// HUD colours.
export const HUD = {
  cyan: '#7ff3ff',
  amber: '#ffc857',
  red: '#ff5d5d',
  green: '#5dffa0',
  panel: 'rgba(8, 18, 30, 0.62)',
};
