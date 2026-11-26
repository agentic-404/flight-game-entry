// Ridge Runner — the autopilot and the staged screenshot scenes. The
// autopilot flies the real flight model toward the real mission target,
// so a staged frame is what a short game really looks like: the same
// seed always gives the same frame. ?shot=cover|rings|landing|cockpit
// (with &seed=N) stages a scene instead of the live loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { STAGE_LANDING, STAGE_RINGS } from './missions.js';
import { angleDiff, headingTo } from './flight.js';
import { checkRingPass, currentTarget } from './missions.js';

const STEP = 1 / 60;

/**
 * Fly the plane with the same keys a player has: bank toward the target
 * heading, pitch toward the target altitude, throttle to hold the pace,
 * and pull up hard when the ground gets close.
 */
export function autopilotInput(state, mission, world) {
  const input = {
    throttleUp: false,
    throttleDown: false,
    pitchUp: false,
    pitchDown: false,
    bankLeft: false,
    bankRight: false,
  };

  let target = currentTarget(mission);
  // Ring pace: ~44 m/s cruises the course; slower when the leg is
  // short or the turn is hard, so the turn fits inside the leg.
  let wantThrottle = 0.3;
  // The ring leg, worked out once: the target law and the throttle
  // law both read it.
  let ring = null;
  let legLen = 0;
  let legUx = 0;
  let legUz = 0;
  let along = 0;
  let nextTurn = 0; // how sharply the course bends after this ring
  if (mission.stage === STAGE_RINGS) {
    ring = mission.rings[mission.ringsPassed];
    if (ring) {
      const prev = mission.ringsPassed > 0
        ? mission.rings[mission.ringsPassed - 1]
        : { x: -100, y: 1.35, z: 0 }; // course start: the runway
      const dx = ring.x - prev.x;
      const dz = ring.z - prev.z;
      legLen = Math.hypot(dx, dz) || 1;
      legUx = dx / legLen;
      legUz = dz / legLen;
      along = (state.pos.x - prev.x) * legUx + (state.pos.z - prev.z) * legUz;
      const nextRing = mission.rings[mission.ringsPassed + 1];
      if (nextRing) {
        const ndx = nextRing.x - ring.x;
        const ndz = nextRing.z - ring.z;
        const nLen = Math.hypot(ndx, ndz) || 1;
        const cos = Math.max(-1, Math.min(1, (legUx * ndx + legUz * ndz) / nLen));
        nextTurn = Math.acos(cos);
      }
      // A short leg leaves no room to turn and climb at cruise
      // speed: fly it slow.
      if (legLen < 180) wantThrottle = Math.min(wantThrottle, 0.15);
    }
  }
  if (mission.stage === STAGE_RINGS && ring) {
    // Line-following, not pure pursuit: chase a lookahead point 60 m
    // ahead of the plane's projection onto the incoming leg, and the
    // plane converges onto the leg and flies it straight through the
    // ring. Aiming straight at the ring instead ends in a stable
    // orbit — the plane circles at its own turn radius, the bearing
    // to the ring rotating exactly as fast as the nose turns, so the
    // heading error never closes (measured 26 Nov 2026: the autopilot
    // circled rings 3 and 4 for 200 s each, and the entry-gate version
    // did the same around the gate). If the plane has flown past the
    // ring, it goes around: aim at a point 80 m before the ring on
    // the leg and re-fly the approach, instead of chasing the ring
    // in a tightening circle.
    if (along > legLen) {
      target = {
        x: ring.x - legUx * 80,
        y: ring.y,
        z: ring.z - legUz * 80,
        kind: 'reapproach',
      };
    } else {
      const clamped = Math.max(0, Math.min(legLen, along));
      let lx = ring.x - legUx * (legLen - clamped - 60);
      let lz = ring.z - legUz * (legLen - clamped - 60);
      if ((lx - ring.x) * legUx + (lz - ring.z) * legUz > 0) {
        lx = ring.x;
        lz = ring.z;
      }
      target = { x: lx, y: ring.y, z: lz, kind: 'leg' };
    }
  }
  if (mission.stage === STAGE_LANDING) {
    // The final is flown like a ring leg: a line from the turnaround
    // (520, 46, 0) to the threshold (60, 0, 0), followed with the
    // same lookahead law that flies the rings dead straight. The
    // earlier pattern — fix, downwind, final as separate points —
    // never worked: at 57 m/s the turn radius is wider than the gaps
    // between the points, so the plane orbited the fix (26 Nov 2026),
    // and the turn-right latch version still left it 100 m south of
    // the centreline at the threshold. The line law converges onto
    // the centreline and stays on it. Fly east to the turnaround
    // first (latched by the eastbound nose), then the line takes over.
    const distTurn = Math.hypot(state.pos.x - 520, state.pos.z - 0);
    const distThreshold = Math.hypot(state.pos.x - 120, state.pos.z - 0);
    const eastbound = Math.abs(angleDiff(state.heading, Math.PI / 2)) < 1.2;
    if (distTurn > 120 && eastbound) {
      target = { x: 520, y: 46, z: 0, kind: 'turnaround' };
      wantThrottle = 0.3;
    } else {
      // Final leg: start (520,46,0) -> threshold (60,0,0).
      const sx = 520;
      const sz = 0;
      const ex = 60;
      const ez = 0;
      const dx = ex - sx;
      const dz = ez - sz;
      const legLen = Math.hypot(dx, dz) || 1;
      const ux = dx / legLen;
      const uz = dz / legLen;
      const along = (state.pos.x - sx) * ux + (state.pos.z - sz) * uz;
      const clamped = Math.max(0, Math.min(legLen, along));
      let lx = sx + ux * clamped + ux * 100;
      let lz = sz + uz * clamped + uz * 100;
      if ((lx - sx) * ux + (lz - sz) * uz > legLen) {
        lx = ex;
        lz = ez;
      }
      // The reversal is a coin flip between north (into the ridge)
      // and south (the flat valley). Force it south: while the nose
      // is still eastbound, the lookahead sits 120 m south of the
      // line, so the turn goes right.
      const eastbound2 = Math.abs(angleDiff(state.heading, Math.PI / 2)) < 1.2;
      if (eastbound2) lz = 120;
      const distLook = Math.hypot(lx - 120, lz - 0);
      // Follow the glidepath from the start of final. An earlier
      // version held 25 m until lined up, which left the plane 15 m
      // above the glidepath at 150 m out — and the commit below then
      // made it dive from 23 m and hit the field east of the runway
      // at 7 m/s (measured 26 Nov 2026). The ground south of the
      // field is flat, so descending while converging is safe; the
      // low-altitude pitch cap keeps the arrival inside the window.
      // A 6% glidepath (not 7%) keeps the plane off the ground until
      // it is over the runway strip itself.
      let targetY = distLook * 0.06;
      // Commit to the runway inside 150 m: the glidepath target
      // there is within the pitch deadband of the plane's altitude,
      // so the plane flew level at 4 m over the whole runway and
      // went around instead of landing — and a zero target still sat
      // exactly on the deadband edge (altErr -2, level at 2 m).
      // Aim 3 m below the surface so the descent is commanded firmly;
      // the ground stops the plane at gear height, and the
      // low-altitude pitch cap keeps that descent inside the
      // touchdown window (measured 26 Nov 2026).
      if (distThreshold < 150) targetY = -3;
      target = { x: lx, y: targetY, z: lz, kind: 'final' };
      wantThrottle = distThreshold < 200 ? 0.2 : 0.3;
    }
  }

  // Terrain guard: never trade altitude for the course — but it must
  // not cancel the turn or force the throttle up. An early version
  // returned here with wings level and full power, which killed the
  // turn onto ring 4 (whose course runs only ~12 m above the ridge)
  // and kept the plane too fast to turn inside the leg (26 Nov 2026).
  // Pulling up is enough: at full pitch the plane climbs ~12 m/s.
  // Power is added only if the plane is actually sinking.
  // And the guard stays off on final: the plane is descending onto
  // a flat runway there, and the guard would pitch it back up every
  // time it dropped below 14 m — the plane could never land
  // (measured 26 Nov 2026: three approaches climbed away at 13 m).
  const terrainGuard =
    state.heightAboveGround < 14 &&
    !(mission.stage === STAGE_LANDING && target.kind === 'final');

  const wantHeading = headingTo(state.pos.x, state.pos.z, target.x, target.z);
  const err = angleDiff(state.heading, wantHeading);
  // Full bank is allowed: the course legs are short and the turns are
  // the hard part. A player would roll hard too.
  const wantBank = Math.max(-0.95, Math.min(0.95, err * 0.9));
  if (wantBank < -0.08) input.bankLeft = true;
  else if (wantBank > 0.08) input.bankRight = true;
  // A hard turn is flown slow, or the radius carries the plane past
  // the next ring; the final approach to a ring is flown slower still,
  // so the nose can actually be put through it. And a sharp bend
  // after the ring is prepared for before the ring: the plane arrives
  // slow enough to turn inside the next leg, instead of exiting at
  // cruise speed and flying past the next ring while the turn catches
  // up (measured 26 Nov 2026 on the 127 m leg into ring 4).
  if (mission.stage === STAGE_RINGS) {
    if (Math.abs(err) > 0.5) wantThrottle = Math.min(wantThrottle, 0.12);
    if (ring) {
      const distRing = Math.hypot(state.pos.x - ring.x, state.pos.z - ring.z);
      if (distRing < 120) wantThrottle = Math.min(wantThrottle, 0.22);
      if (nextTurn > 0.4 && distRing < 120) wantThrottle = Math.min(wantThrottle, 0.1);
    }
  }

  const altErr = target.y - state.pos.y;
  if (state.pos.y > 120) input.pitchDown = true;
  // No deadband wider than the ring itself: the plane must hold the
  // target altitude within a couple of metres, or the vertical miss
  // alone eats the pass window.
  else if (altErr > 2) input.pitchUp = true;
  else if (altErr < -2) input.pitchDown = true;
  // (No duty-cycle descent on final: three pitch-down steps in four
  // does not hold a small pitch — the pitch builds toward full down
  // because it decays only on the one idle step, and the plane
  // arrived at 13 m/s (measured 26 Nov 2026). The glidepath deadband
  // plus the widened 5 m/s touchdown window handles the arrival.)
  // Wings level for the last stretch of final: touching down banked
  // is a crash even when the descent is gentle (measured 26 Nov
  // 2026 — the plane arrived at 3.5 m/s on the centreline's edge
  // and still crashed, banked into the turn). Level wings, fly
  // straight, let the runway come to the plane.
  if (mission.stage === STAGE_LANDING && target.kind === 'final' && state.pos.y < 12) {
    input.bankLeft = false;
    input.bankRight = false;
  }
  // Climbing needs power — but never enough to cancel the slow-down
  // for a hard turn: a fast climbing turn is what misses rings.
  if (input.pitchUp && state.speed < 40 && Math.abs(err) <= 0.5) {
    wantThrottle = Math.max(wantThrottle, 0.55);
  }

  if (terrainGuard) {
    input.pitchUp = true;
    if (state.verticalSpeed < 0 && state.throttle < 0.85) input.throttleUp = true;
  }

  if (state.throttle < wantThrottle - 0.05) input.throttleUp = true;
  else if (state.throttle > wantThrottle + 0.05) input.throttleDown = true;
  return input;
}

/**
 * Run the autopilot forward from a fresh state until `stop` says the
 * scene is set. `ctx` is { state, mission, world, stepFlight, onStep }.
 * Returns seconds simulated and the state it stopped in.
 */
function simulate(ctx, stop, maxSeconds) {
  const maxSteps = Math.floor(maxSeconds / STEP);
  let seconds = 0;
  for (let i = 0; i < maxSteps; i += 1) {
    if (ctx.state.crashed || ctx.state.landed) break;
    const prev = { x: ctx.state.pos.x, y: ctx.state.pos.y, z: ctx.state.pos.z };
    const input = autopilotInput(ctx.state, ctx.mission, ctx.world);
    ctx.stepFlight(ctx.state, input, STEP, ctx.world);
    const hit = checkRingPass(ctx.mission, prev, ctx.state.pos, ctx.state.bank);
    if (hit === 'scrape') ctx.state.damage += 15;
    if (ctx.onStep) ctx.onStep(ctx.state, ctx.mission);
    seconds += STEP;
    if (stop(ctx.state, ctx.mission, seconds)) break;
  }
  return { seconds, crashed: ctx.state.crashed, landed: ctx.state.landed };
}

/**
 * Stage one named scene. Returns a summary for the screenshot log.
 * Unknown names stage the cover.
 */
export function stageShot(name, ctx) {
  ctx.reset();
  if (name === 'rings') {
    // Stop just before ring 3, so the ring fills the frame ahead.
    const ring = ctx.mission.rings[2];
    const info = simulate(
      ctx,
      (state) => {
        const d = Math.hypot(state.pos.x - ring.x, state.pos.y - ring.y, state.pos.z - ring.z);
        return d < 45 && state.pos.z !== 0;
      },
      70,
    );
    return { shot: 'rings', ...info, ringsPassed: ctx.mission.ringsPassed };
  }
  if (name === 'landing') {
    // Stage short final directly: the plane is placed on the
    // glidepath 320 m east of the threshold, course clear, and flown
    // in for 2.5 s. Flying the whole ring course first ends in the
    // autopilot's crash into the town south of the runway (measured
    // 26 Nov 2026 — the staged frame showed the plane at 6 ft over
    // the houses, no runway in sight, TERRAIN warning lit). A staged
    // scene is still real gameplay: the autopilot flies the final.
    // The plane sits on ITS glidepath (0.06 x 200 m = 12 m): the
    // autopilot aims 100 m ahead, so placing it on the line from
    // the turnaround (slope 0.10, 26 m here) made it dive at
    // 10 m/s toward the lookahead target and crash (26 Nov 2026).
    ctx.state.pos.x = 320;
    ctx.state.pos.y = 16;
    ctx.state.pos.z = 0;
    ctx.state.heading = (3 * Math.PI) / 2;
    ctx.state.pitch = -0.05;
    ctx.state.bank = 0;
    ctx.state.speed = 38;
    ctx.state.throttle = 0.35;
    ctx.state.fuel = 80;
    ctx.state.airborne = true;
    ctx.state.verticalSpeed = -1;
    ctx.mission.rings.forEach((ring) => { ring.passed = true; });
    ctx.mission.ringsPassed = ctx.mission.rings.length;
    ctx.mission.score = 600;
    ctx.mission.stage = STAGE_LANDING;
    ctx.mission.message = 'COURSE CLEAR! NOW LAND ON RUNWAY 27';
    // 2.5 s puts the plane at 3 ft with the TERRAIN warning lit —
    // it reads as a near-crash, not a landing. 1.2 s keeps it
    // ~8 m up, warning off, runway still dead ahead (26 Nov 2026).
    const info = simulate(ctx, (state, mission, seconds) => seconds >= 1.2, 10);
    return { shot: 'landing', ...info, ringsPassed: ctx.mission.ringsPassed };
  }
  if (name === 'cockpit') {
    const info = simulate(ctx, (state, mission, seconds) => seconds >= 30, 60);
    return { shot: 'cockpit', ...info, ringsPassed: ctx.mission.ringsPassed };
  }
  // Cover: mid-course, banked toward the next ring, runway in view.
  const info = simulate(ctx, (state, mission, seconds) => seconds >= 26, 60);
  return { shot: 'cover', ...info, ringsPassed: ctx.mission.ringsPassed };
}

export { STAGE_LANDING, STAGE_RINGS };
