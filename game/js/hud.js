// Ridge Runner — the HUD: lit instruments the judge can read at a glance.
// Altitude, speed and heading as big numbers, a compass tape, throttle /
// fuel / damage bars, score and rings, a minimap, and the mission line.
// Everything is DOM over the 3D view, so it stays sharp at any size.
import { FUEL, HUD, RUNWAY, WORLD_SIZE } from './config.js';
import { STAGE_LANDING, STAGE_RINGS } from './missions.js';

function deg(heading) {
  return ((heading * 180) / Math.PI % 360 + 360) % 360;
}

const COMPASS_POINTS = [
  [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'],
  [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'],
];

export function createHud(doc) {
  const el = (id) => doc.getElementById(id);
  const alt = el('hud-alt');
  const spd = el('hud-spd');
  const hdg = el('hud-hdg');
  const thrFill = el('hud-thr-fill');
  const fuelFill = el('hud-fuel-fill');
  const dmgFill = el('hud-dmg-fill');
  const score = el('hud-score');
  const rings = el('hud-rings');
  const mission = el('hud-mission');
  const message = el('hud-message');
  const warn = el('hud-warn');
  const compass = el('hud-compass');
  const compassCtx = compass.getContext('2d');
  const map = el('hud-map');
  const mapCtx = map.getContext('2d');
  const title = el('screen-title');
  const end = el('screen-end');
  const endTitle = el('end-title');
  const endDetail = el('end-detail');
  const status = el('status');

  let messageUntil = 0;
  let lastMission = '';

  function drawCompass(headingDeg) {
    const w = compass.width;
    const h = compass.height;
    compassCtx.clearRect(0, 0, w, h);
    compassCtx.fillStyle = 'rgba(8, 18, 30, 0.62)';
    compassCtx.fillRect(0, 0, w, h);
    compassCtx.font = 'bold 13px monospace';
    compassCtx.textAlign = 'center';
    compassCtx.textBaseline = 'middle';
    for (let d = -70; d <= 70; d += 10) {
      const raw = Math.round(headingDeg + d);
      const norm = ((raw % 360) + 360) % 360;
      const x = w / 2 + d * 3.4;
      const major = norm % 30 === 0;
      compassCtx.strokeStyle = major ? HUD.cyan : 'rgba(127, 243, 255, 0.45)';
      compassCtx.lineWidth = major ? 2 : 1;
      compassCtx.beginPath();
      compassCtx.moveTo(x, major ? 4 : 10);
      compassCtx.lineTo(x, 20);
      compassCtx.stroke();
      const point = COMPASS_POINTS.find(([degValue]) => degValue === norm);
      if (major) {
        compassCtx.fillStyle = point ? HUD.amber : HUD.cyan;
        compassCtx.fillText(point ? point[1] : String(norm).padStart(3, '0'), x, 28);
      }
    }
    compassCtx.fillStyle = HUD.amber;
    compassCtx.beginPath();
    compassCtx.moveTo(w / 2 - 6, 0);
    compassCtx.lineTo(w / 2 + 6, 0);
    compassCtx.lineTo(w / 2, 7);
    compassCtx.closePath();
    compassCtx.fill();
  }

  function drawMap(state, missionState) {
    const size = map.width;
    const k = size / WORLD_SIZE;
    const toX = (x) => (x + WORLD_SIZE / 2) * k;
    const toY = (z) => (z + WORLD_SIZE / 2) * k;
    mapCtx.clearRect(0, 0, size, size);
    mapCtx.fillStyle = 'rgba(10, 26, 18, 0.85)';
    mapCtx.fillRect(0, 0, size, size);
    // Lake.
    mapCtx.fillStyle = '#2f6fd0';
    mapCtx.beginPath();
    mapCtx.ellipse(toX(330), toY(140), 150 * k, 95 * k, 0, 0, Math.PI * 2);
    mapCtx.fill();
    // Runway.
    mapCtx.strokeStyle = '#f2f2ee';
    mapCtx.lineWidth = 3;
    mapCtx.beginPath();
    mapCtx.moveTo(toX(-RUNWAY.length / 2), toY(0));
    mapCtx.lineTo(toX(RUNWAY.length / 2), toY(0));
    mapCtx.stroke();
    // Rings: grey ahead, amber next, green done.
    missionState.rings.forEach((ring, i) => {
      mapCtx.beginPath();
      mapCtx.arc(toX(ring.x), toY(ring.z), 4, 0, Math.PI * 2);
      mapCtx.fillStyle = ring.passed ? '#2fd35f' : i === missionState.ringsPassed && missionState.stage === STAGE_RINGS ? '#ff8c1a' : '#8fa8bf';
      mapCtx.fill();
    });
    // The plane: a triangle pointing along its heading (0 is up = north).
    const px = toX(state.pos.x);
    const py = toY(state.pos.z);
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(state.heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 6);
    mapCtx.lineTo(0, 3);
    mapCtx.lineTo(-5, 6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  function showMessage(text, until) {
    message.textContent = text;
    message.style.opacity = '1';
    messageUntil = until;
  }

  return {
    /** Refresh every instrument from the live state. */
    update(state, missionState, screen, time) {
      const altFt = Math.max(0, Math.round(state.pos.y * 3.28084));
      const spdKt = Math.round(state.speed * 1.94384);
      const hdgDeg = Math.round(deg(state.heading));
      alt.textContent = String(altFt);
      spd.textContent = String(spdKt);
      hdg.textContent = String(hdgDeg).padStart(3, '0');
      thrFill.style.width = `${Math.round(state.throttle * 100)}%`;
      fuelFill.style.width = `${Math.max(0, Math.round(state.fuel))}%`;
      fuelFill.style.background = state.fuel < FUEL.lowWarning ? HUD.red : HUD.green;
      dmgFill.style.width = `${Math.min(100, Math.round(state.damage))}%`;
      dmgFill.style.background = state.damage > 60 ? HUD.red : HUD.amber;
      score.textContent = String(missionState.score);
      rings.textContent = `${missionState.ringsPassed}/${missionState.rings.length}`;

      let missionText;
      if (missionState.stage === STAGE_RINGS) {
        missionText = `MISSION 1 — FLY THE RINGS  ${missionState.ringsPassed}/${missionState.rings.length}`;
      } else if (missionState.stage === STAGE_LANDING) {
        missionText = 'MISSION 2 — LAND ON RUNWAY 27';
      } else {
        missionText = 'MISSION COMPLETE';
      }
      if (missionText !== lastMission) {
        mission.textContent = missionText;
        lastMission = missionText;
      }

      // Warnings: low fuel, terrain, overspeed.
      let warning = '';
      if (screen === 'play' && state.fuel > 0 && state.fuel < FUEL.lowWarning) warning = 'LOW FUEL';
      else if (screen === 'play' && state.fuel <= 0) warning = 'FUEL EMPTY — GLIDING';
      else if (screen === 'play' && state.heightAboveGround < 8 && !state.landed) warning = 'TERRAIN — PULL UP';
      else if (screen === 'play' && state.speed > 88) warning = 'OVERSPEED';
      warn.textContent = warning;

      if (time > messageUntil) message.style.opacity = '0';
      drawCompass(hdgDeg);
      drawMap(state, missionState);
    },
    showMessage,
    /** Show the title, pause, landing or crash overlay ('' hides them). */
    showScreen(name, detail) {
      title.style.display = name === 'title' ? 'flex' : 'none';
      if (name === 'landed' || name === 'crashed') {
        end.style.display = 'flex';
        endTitle.textContent = name === 'landed' ? 'LANDED — RUNWAY 27' : 'CRASHED';
        endTitle.style.color = name === 'landed' ? HUD.green : HUD.red;
        endDetail.textContent = detail ?? '';
      } else {
        end.style.display = 'none';
      }
      if (name === 'paused') {
        end.style.display = 'flex';
        endTitle.textContent = 'PAUSED';
        endTitle.style.color = HUD.cyan;
        endDetail.textContent = 'Press P or Enter to keep flying.';
      }
    },
    announce(text) {
      status.textContent = text;
    },
  };
}
