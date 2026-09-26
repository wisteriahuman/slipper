import {build} from 'esbuild';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
await build({entryPoints:['scripts/evaluate-generation.ts'],outfile:'node_modules/.cache/slipper-evaluation.cjs',bundle:true,platform:'node',format:'cjs',external:['electron'],jsx:'automatic',alias:{'@shared':'./src/shared'}});
const child = spawn(require('electron'), ['node_modules/.cache/slipper-evaluation.cjs'], {stdio:'inherit', env:process.env});
child.on('error', e => { console.error(e); process.exitCode=1; });
child.on('exit', code => { process.exitCode=code ?? 1; });
