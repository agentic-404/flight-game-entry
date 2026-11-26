// Ridge Runner — Make.fun entry program.
//
// Copies game/ and screenshots/ into the output directory and writes
// dossier.json from the same bytes, so the dossier always describes
// exactly what is submitted. Run twice and the two outputs are
// byte-identical: files are copied in sorted order and nothing here
// reads the clock, the network, or the environment beyond the output
// directory variable.
//
// Run it:  MAKEFUN_OUTPUT_DIR=/tmp/out1 node main.ts
// The grader runs it twice; both runs must write identical bytes.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });

// Copy game/ and screenshots/ in a fixed order. The dossier is built
// from the copied bytes, so it can only match this output.
for (const name of ['game', 'screenshots']) {
  cpSync(join(here, name), join(out, name), { recursive: true, force: true });
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier, 'utf8');

console.log(`wrote ${out}`);
