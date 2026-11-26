# Ridge Runner

[![Bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg?utm_source=github&utm_medium=readme&utm_campaign=flight-game-entry)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/agentic-404/flight-game-entry/rank.svg?utm_source=github&utm_medium=readme&utm_campaign=flight-game-entry)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/agentic-404/flight-game-entry/reward.svg?utm_source=github&utm_medium=readme&utm_campaign=flight-game-entry)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard)

A bush-plane flight game. Fly a low-poly bush plane through a six-ring
course over a seeded valley — lake, town, pine ridges and two peaks —
then bring her home onto runway 27.

## How it flies

- **W / S** — throttle. **Arrow keys** — bank and pitch.
  **P** — pause. **R** — restart. **Enter / click** — fly, or fly again.
- **Mission 1 — Ring Run:** fly the six rings in order. A clean pass is
  +100; pass it wings-level and it is +125. Clip a rim and the airframe
  takes a scrape.
- **Mission 2 — Landing:** after the course, land on runway 27.
  Touch down gentle, slow and level for +250 (+50 for the centreline).
  Come in steep, fast or banked and you bounce or crash.
- **Fuel and damage are decisions:** fuel burns faster at full throttle,
  empty tanks mean a dead engine and a glide. Overspeed stresses the
  airframe; 100% damage ends the flight.
- **Instruments:** altitude, speed and heading, a compass tape, a
  minimap, throttle / fuel / damage bars, and a dashboard with three
  lit gauges inside the cockpit view (`?view=cockpit`).
- **Sound** is synthesised in the browser: engine hum follows throttle
  and speed, plus a ring chime, a scrape, a landing arpeggio and a
  crash thud.

## Building

Everything is plain JavaScript modules plus a vendored Three.js build.
No network, no build step, no cookies: open `game/index.html` from
any static server and fly.

```
game/
  index.html          page, HUD and overlays
  vendor/three.module.min.js   Three.js r160, vendored
  js/
    config.js         constants: flight, fuel, damage, scoring
    random.js         seeded random (mulberry32)
    terrain.js        valley, lake, town, trees, clouds, runway
    aircraft.js       the bush plane and its dashboard gauges
    flight.js         the pure flight model (no rendering)
    missions.js       the ring course and pass detection
    input.js          keyboard and click
    audio.js          synthesised engine and effects
    hud.js            instruments, compass, minimap, screens
    render.js         renderer and chase / cockpit cameras
    shots.js          the autopilot that stages the screenshots
    main.js           boot and the one loop
```

Screenshots are staged deterministically:
`game/index.html?shot=cover&seed=7` (and `rings`, `landing`,
`cockpit`). The autopilot flies the scene, the page sets
`window.__shotReady`, and a screenshot is taken.

## Entry

`main.ts` copies `game/` and `screenshots/` into the output
directory and writes `dossier.json` from the same bytes, so the
dossier always describes exactly what is submitted. Run it twice and
the two outputs are byte-identical.

## License

MIT — see `LICENSE`.
