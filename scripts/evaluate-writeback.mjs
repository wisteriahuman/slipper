import {build} from 'esbuild';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync} from 'node:fs';
const require = createRequire(import.meta.url);
await build({entryPoints:['scripts/evaluate-writeback.ts'],outfile:'node_modules/.cache/slipper-writeback-evaluation.cjs',bundle:true,platform:'node',format:'cjs',external:['electron'],jsx:'automatic',alias:{'@shared':'./src/shared'}});
// Match the app name before Electron initializes its macOS safeStorage service.
mkdirSync('node_modules/.cache/slipper-writeback',{recursive:true});
writeFileSync('node_modules/.cache/slipper-writeback/package.json',JSON.stringify({name:'slipper',version:'0.1.0',main:'../slipper-writeback-evaluation.cjs'}));
const child = spawn(require('electron'), ['node_modules/.cache/slipper-writeback'], {stdio:'inherit', env:process.env});
child.on('error', e => {console.error(e); process.exitCode=1;});
child.on('exit', code => {process.exitCode=code ?? 1;});
