// Ridge Runner — boot and the one loop. Input is read every frame, the
// world advances in fixed 1/60 s steps, and the renderer paints what is
// there. The game moves between four screens: title, play, paused and
// the end panel (landed or crashed).
//
// ?seed=N fixes the world. ?shot=cover|rings|landing|cockpit (with
// &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot. ?view=cockpit
// flies the live game from the cockpit.
import * as THREE from 'three';
import { DAMAGE, GAME_TITLE, PALETTE, RUNWAY, SCORE, STEP } from './config.js';
import { createRandom } from './random.js';
import { buildTerrain } from './terrain.js';
import { buildAircraft, updateAircraftVisual } from './aircraft.js';
import {
  EVENT_BOUNCE,
  EVENT_CRASHED,
  EVENT_FIELD,
  EVENT_TOUCHDOWN,
  createFlightState,
  stepFlight,
} from './flight.js';
import {
  STAGE_DONE,
  aimRingMeshes,
  buildRingMeshes,
  checkRingPass,
  createMissionState,
  createRingCourse,
  updateRingVisuals,
} from './missions.js';
import { createHud } from './hud.js';
import {
  ACTION_CONFIRM,
  ACTION_PAUSE,
  ACTION_RESTART,
  attachClickStart,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { CAMERA_CHASE, CAMERA_COCKPIT, createRenderer } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const BEST_KEY = 'ridge-runner-best';
const SPAWN = { x: -100, y: 1.35, z: 0, heading: Math.PI / 2 };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const status = document.getElementById('status');

// World: one seeded random builds the terrain, the town, the trees and
// the ring course, in that order.
const random = createRandom(seed);
const terrain = buildTerrain(random, seed);
const world = { heightAt: terrain.heightAt };
const rings = createRingCourse(random);
const ringGroup = buildRingMeshes(rings);
aimRingMeshes(rings);

let view;
let scene;
try {
  view = createRenderer(canvas);
  scene = view.scene;
} catch (error) {
  window.__gameError = String(error);
  throw error;
}
scene.add(terrain.group);
scene.add(ringGroup);
const aircraftParts = buildAircraft();
scene.add(aircraftParts.group);

let flight = createFlightState(SPAWN);
let mission = createMissionState(rings);
const hud = createHud(document);
const input = createInput();
const audio = createAudio();

let screen = 'title';
let cameraMode = params.get('view') === 'cockpit' ? CAMERA_COCKPIT : CAMERA_CHASE;
let best = readBest();
let time = 0;

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

/**
 * Fresh sortie, same objects: the screenshot stager holds references to
 * these, so reset mutates them in place instead of replacing them.
 */
function reset() {
  Object.assign(flight, createFlightState(SPAWN));
  rings.forEach((ring) => {
    ring.passed = false;
    if (ring.mesh) {
      ring.mesh.material.color.setHex(PALETTE.ringIdle);
      ring.mesh.material.emissive.setHex(PALETTE.ringIdle);
      ring.mesh.material.emissiveIntensity = 0.55;
    }
  });
  Object.assign(mission, createMissionState(rings));
}

function startGame() {
  reset();
  screen = 'play';
  audio.unlock();
  hud.showScreen('');
  hud.announce(`${GAME_TITLE}. Fly the rings, then land on runway 27.`);
}

function endGame(landed, detail) {
  screen = landed ? 'landed' : 'crashed';
  if (mission.score > best) {
    best = mission.score;
    saveBest(best);
  }
  hud.showScreen(screen, detail);
}

function onTouchdown() {
  let gained = SCORE.landing;
  if (Math.abs(flight.pos.z - RUNWAY.z) <= 3) gained += SCORE.centrelineBonus;
  mission.score += gained;
  mission.stage = STAGE_DONE;
  audio.landing();
  hud.showMessage(`LANDED! +${gained}`, time + 3);
  hud.announce(`Landed. Score ${mission.score}.`);
  endGame(
    true,
    `Score ${mission.score} · Rings ${mission.ringsPassed}/${mission.rings.length} · ` +
      `Time ${flight.time.toFixed(0)}s · Best ${best}`,
  );
}

function onCrash() {
  audio.crash();
  hud.announce(`Crashed. ${flight.crashReason}`);
  endGame(
    false,
    `${flight.crashReason} — Score ${mission.score} · ` +
      `Rings ${mission.ringsPassed}/${mission.rings.length} · Best ${best}`,
  );
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_RESTART) {
    if (screen !== 'title') startGame();
    return;
  }
  if (actions & ACTION_CONFIRM) {
    if (screen === 'title' || screen === 'landed' || screen === 'crashed') startGame();
    else if (screen === 'paused') {
      screen = 'play';
      hud.showScreen('');
      hud.announce('Playing.');
    }
  } else if (actions & ACTION_PAUSE) {
    if (screen === 'play') {
      screen = 'paused';
      hud.showScreen('paused');
      hud.announce('Paused.');
    } else if (screen === 'paused') {
      screen = 'play';
      hud.showScreen('');
      hud.announce('Playing.');
    }
  }
}

function step() {
  const prev = { x: flight.pos.x, y: flight.pos.y, z: flight.pos.z };
  const events = stepFlight(flight, input.held, STEP, world);
  const hit = checkRingPass(mission, prev, flight.pos, flight.bank);
  if (hit === 'ring') {
    audio.ring();
    hud.showMessage(mission.message, time + 2.5);
    hud.announce(mission.message);
  } else if (hit === 'scrape') {
    flight.damage += DAMAGE.ringScrape;
    audio.scrape();
    hud.showMessage('RING RIM! AIRFRAME SCRAPED', time + 2);
  }
  if (events & EVENT_TOUCHDOWN) onTouchdown();
  else if (events & EVENT_BOUNCE) {
    audio.scrape();
    hud.showMessage('HARD TOUCHDOWN — YOU BOUNCED', time + 2);
  } else if (events & EVENT_FIELD) {
    hud.showMessage('ROUGH FIELD LANDING — BACK ON THE GROUND', time + 2.5);
  } else if (events & EVENT_CRASHED) onCrash();
  updateRingVisuals(mission, time);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  time += dt;
  handleActions();
  if (screen === 'play') {
    accumulator += dt;
    while (accumulator >= STEP) {
      step();
      accumulator -= STEP;
    }
  } else if (screen === 'landed') {
    // The rollout keeps going behind the end panel.
    accumulator += dt;
    while (accumulator >= STEP) {
      stepFlight(flight, {}, STEP, world);
      accumulator -= STEP;
    }
  }
  updateAircraftVisual(aircraftParts, flight, dt);
  // The cockpit camera sits just behind the canopy, so the canopy,
  // nose and spinning propeller fill the lower half of the frame
  // (measured 26 Nov 2026 — the cockpit shot was mostly aircraft,
  // not the view ahead). In cockpit mode the airframe is hidden:
  // the pilot's view is the terrain, the ring and the HUD.
  aircraftParts.group.visible = cameraMode !== CAMERA_COCKPIT;
  view.updateCamera(flight, cameraMode, dt);
  hud.update(flight, mission, screen, time);
  audio.setEngine(flight.throttle, flight.speed, screen === 'play' && !flight.crashed);
  view.render(scene);
}

let accumulator = 0;
let last = performance.now();

function resize() {
  view.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

attachClickStart(canvas, () => {
  audio.unlock();
  if (screen === 'title' || screen === 'landed' || screen === 'crashed') startGame();
  else if (screen === 'paused') {
    screen = 'play';
    hud.showScreen('');
  }
});

// Leaving the tab pauses a running game rather than letting it fly unseen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') {
    screen = 'paused';
    hud.showScreen('paused');
    hud.announce('Paused.');
  }
});

// A handle for the screenshot driver and the play-test: the live state.
window.__game = {
  flight,
  mission,
  screen: () => screen,
  start: () => startGame(),
};

if (shot) {
  hud.showScreen('');
  const info = stageShot(shot, { state: flight, mission, world, stepFlight, reset });
  cameraMode = shot === 'cockpit' ? CAMERA_COCKPIT : CAMERA_CHASE;
  if (mission.message) hud.showMessage(mission.message, 1e9);
  let painted = 0;
  function paint() {
    updateAircraftVisual(aircraftParts, flight, STEP);
    aircraftParts.group.visible = cameraMode !== CAMERA_COCKPIT;
    view.updateCamera(flight, cameraMode, 1);
    hud.update(flight, mission, 'play', 0);
    view.render(scene);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      window.__shotInfo = info;
    }
  }
  requestAnimationFrame(paint);
} else {
  hud.showScreen('title');
  hud.announce(`${GAME_TITLE}. Press Enter or click to fly.`);
  requestAnimationFrame(frame);
}
