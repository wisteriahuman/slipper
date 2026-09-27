import {build} from 'esbuild';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync} from 'node:fs';
const require = createRequire(import.meta.url);
await build({entryPoints:['spikes/library-writeback/spike.ts'],outfile:'node_modules/.cache/slipper-library-spike.cjs',bundle:true,platform:'node',format:'cjs',external:['electron','lucide-static'],alias:{'@shared':'./src/shared'}});
// Match the app name before Electron initializes its macOS safeStorage service.
mkdirSync('node_modules/.cache/slipper-library',{recursive:true});
writeFileSync('node_modules/.cache/slipper-library/package.json',JSON.stringify({name:'slipper',version:'0.1.0',main:'../slipper-library-spike.cjs'}));
const child = spawn(require('electron'), ['node_modules/.cache/slipper-library'], {stdio:'inherit', env:process.env});
child.on('exit', code => {process.exitCode=code ?? 1;});
