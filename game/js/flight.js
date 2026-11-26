// Ridge Runner — the flight model. Pure maths, no rendering: the same
// step runs in the browser, in the screenshot autopilot and in a Node
// smoke test. Speeds in m/s, angles in radians, heading 0 is north (-Z)
// and grows clockwise, so 90 is east (+X) and 270 is west (-X).
import { DAMAGE, FLIGHT, FUEL, LANDING, RUNWAY } from './config.js';

export const EVENT_NONE = 0;
export const EVENT_TOUCHDOWN = 1;
export const EVENT_BOUNCE = 2;
export const EVENT_CRASHED = 4;
export const EVENT_FIELD = 8;

/** Forward direction for a heading: (sin h, -cos h) on the ground plane. */
export function forwardOf(heading) {
  return { x: Math.sin(heading), z: -Math.cos(heading) };
}

/** Heading from (x1, z1) toward (x2, z2), in the same convention. */
export function headingTo(x1, z1, x2, z2) {
  return Math.atan2(x2 - x1, -(z2 - z1));
}

/** Smallest signed turn from `from` to `to`, in (-PI, PI]. */
export function angleDiff(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function createFlightState(spawn) {
  return {
    pos: { x: spawn.x, y: spawn.y, z: spawn.z },
    heading: spawn.heading,
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    fuel: FUEL.start,
    damage: 0,
    airborne: false, // parked on the runway until fast and pulling up
    crashed: false,
    landed: false,
    crashReason: '',
    verticalSpeed: 0,
    heightAboveGround: spawn.y,
    time: 0,
  };
}

function moveToward(value, target, maxStep) {
  if (value < target) return Math.min(target, value + maxStep);
  if (value > target) return Math.max(target, value - maxStep);
  return value;
}

/**
 * Advance the plane one step. `input` is booleans:
 * throttleUp, throttleDown, pitchUp, pitchDown, bankLeft, bankRight.
 * `world` is { heightAt(x, z) }. Returns an event bitmask.
 */
export function stepFlight(state, input, dt, world) {
  const gear = 1.35; // wheels hang this far below the plane's centre

  // A landed plane rolls out along the runway and brakes to a stop.
  if (state.landed) {
    state.speed = Math.max(0, state.speed - 12 * dt);
    const fwd = forwardOf(state.heading);
    state.pos.x += fwd.x * state.speed * dt;
    state.pos.z += fwd.z * state.speed * dt;
    state.pos.y = world.heightAt(state.pos.x, state.pos.z) + gear;
    state.verticalSpeed = 0;
    state.heightAboveGround = 0;
    state.time += dt;
    return EVENT_NONE;
  }
  if (state.crashed) return EVENT_NONE;
  // Whether the plane was flying when this step began: a lift-off this
  // very step must not count as a touchdown on the same step.
  const wasAirborne = state.airborne;

  // Throttle: W/S, dead when the tanks are dry.
  if (state.fuel <= 0) state.throttle = 0;
  else if (input.throttleUp) state.throttle = Math.min(1, state.throttle + 0.8 * dt);
  else if (input.throttleDown) state.throttle = Math.max(0, state.throttle - 0.8 * dt);

  // Speed chases the throttle's target; dry tanks mean no thrust at all.
  const targetSpeed =
    state.fuel <= 0 ? 0 : FLIGHT.baseSpeed + state.throttle * (FLIGHT.maxSpeed - FLIGHT.baseSpeed);
  state.speed = moveToward(state.speed, targetSpeed, FLIGHT.accel * dt);
  // Low is landing configuration: near the ground the nose-down
  // authority is capped, so a full stick deflection is a firm arrival
  // (at most ~5 m/s down) instead of a 13 m/s dive. Without it,
  // binary pitch keys make a gentle touchdown a ~0.05 s tap, and the
  // autopilot's descent pulses kept arriving at 7-13 m/s (measured
  // 26 Nov 2026). Pitch-up keeps full authority — climbing away from
  // terrain must never be capped.
  const downLimit =
    state.airborne && state.heightAboveGround < 15 ? 0.11 : FLIGHT.maxPitch;
  const pitchTarget = (input.pitchUp ? FLIGHT.maxPitch : 0) + (input.pitchDown ? -downLimit : 0);
  state.pitch = moveToward(state.pitch, pitchTarget, FLIGHT.pitchRate * dt);
  let bankTarget = (input.bankRight ? FLIGHT.maxBank : 0) + (input.bankLeft ? -FLIGHT.maxBank : 0);

  // Soft world edge: beyond the mapped valley the stick turns home.
  if (Math.abs(state.pos.x) > 560 || Math.abs(state.pos.z) > 560) {
    const home = headingTo(state.pos.x, state.pos.z, 0, 0);
    bankTarget = Math.max(-FLIGHT.maxBank, Math.min(FLIGHT.maxBank, angleDiff(state.heading, home) * 0.9));
  }
  state.bank = moveToward(state.bank, bankTarget, FLIGHT.bankRate * dt);

  // A banked wing turns: heading follows the bank, harder at low speed.
  const turnRate = (9.8 * Math.tan(state.bank) / Math.max(state.speed, 20)) * FLIGHT.turnFactor;
  state.heading += turnRate * dt;

  // Horizontal motion always happens; vertical motion only once airborne.
  const fwd = forwardOf(state.heading);
  state.pos.x += fwd.x * state.speed * dt;
  state.pos.z += fwd.z * state.speed * dt;
  const groundY = world.heightAt(state.pos.x, state.pos.z);

  if (!state.airborne) {
    // Rolling: wheels on the ground, lift off when fast and pulling up.
    state.pos.y = groundY + gear;
    state.verticalSpeed = 0;
    if (state.speed >= 30 && state.pitch > 0.08) state.airborne = true;
  } else {
    // Climb, stall sink and the ceiling.
    let climb = state.speed * Math.sin(state.pitch);
    if (state.speed < FLIGHT.minSpeed) climb -= (FLIGHT.minSpeed - state.speed) * FLIGHT.stallSink;
    state.verticalSpeed = climb;
    state.pos.y += climb * dt;
    if (state.pos.y > 320) state.pos.y = 320;
  }

  // Fuel and overspeed wear.
  state.fuel = Math.max(0, state.fuel - (FUEL.baseDrain + state.throttle * FUEL.throttleDrain) * dt);
  if (state.speed > FLIGHT.overspeed) state.damage += DAMAGE.overspeedRate * dt;

  state.heightAboveGround = state.pos.y - groundY;
  state.time += dt;

  // Ground contact (only matters if the plane was flying already).
  if (wasAirborne && state.pos.y <= groundY + gear) {
    const onRunway =
      Math.abs(state.pos.x - RUNWAY.x) < RUNWAY.length / 2 &&
      Math.abs(state.pos.z - RUNWAY.z) < RUNWAY.width / 2;
    const descent = -state.verticalSpeed;
    const level = Math.abs(state.bank) <= LANDING.maxBank;
    if (onRunway) {
      const centred = Math.abs(state.pos.z - RUNWAY.z) <= LANDING.maxOffset;
      if (descent <= LANDING.maxDescent && state.speed <= LANDING.maxSpeed && level && centred) {
        state.landed = true;
        state.pos.y = groundY + gear;
        state.speed = Math.min(state.speed, 12);
        return EVENT_TOUCHDOWN;
      }
      if (descent <= LANDING.bounceDescent && state.speed <= LANDING.maxSpeed + 8 && level) {
        state.damage += DAMAGE.hardBounce;
        state.pos.y = groundY + gear + 3.5;
        state.pitch = 0.2;
        state.verticalSpeed = 4;
        if (state.damage >= 100) {
          state.crashed = true;
          state.crashReason = 'AIRFRAME FAILURE — TOO MUCH DAMAGE';
          return EVENT_CRASHED;
        }
        return EVENT_BOUNCE;
      }
      state.crashed = true;
      state.crashReason =
        descent > LANDING.maxDescent
          ? 'TOO STEEP — YOU SLAMMED THE RUNWAY'
          : state.speed > LANDING.maxSpeed
            ? 'TOO FAST TO LAND'
            : !level
              ? 'WINGS NOT LEVEL ON TOUCHDOWN'
              : 'OFF THE CENTRELINE ON TOUCHDOWN';
      state.pos.y = groundY + gear;
      return EVENT_CRASHED;
    }
    // Off the runway a gentle touchdown rolls out on the field: rough,
    // 10% damage, and the sortie goes on from the ground. A bush
    // plane is built for rough fields, so the field window matches
    // the runway one — a hard arrival on grass is survivable, and
    // the plane can take off again and try the runway (26 Nov 2026).
    if (descent <= LANDING.maxDescent && state.speed <= 40 && level) {
      state.airborne = false;
      state.damage += 10;
      state.pos.y = groundY + gear;
      state.pitch = 0;
      if (state.damage >= 100) {
        state.crashed = true;
        state.crashReason = 'AIRFRAME FAILURE — TOO MUCH DAMAGE';
        return EVENT_CRASHED;
      }
      return EVENT_FIELD;
    }
    state.crashed = true;
    state.crashReason = 'TERRAIN — YOU FLEW INTO THE GROUND';
    state.pos.y = groundY + gear;
    return EVENT_CRASHED;
  }

  if (state.damage >= 100) {
    state.crashed = true;
    state.crashReason = 'AIRFRAME FAILURE — TOO MUCH DAMAGE';
    return EVENT_CRASHED;
  }
  return EVENT_NONE;
}
