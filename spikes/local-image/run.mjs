import {build} from 'esbuild';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync} from 'node:fs';
const require = createRequire(import.meta.url);
await build({entryPoints:['spikes/local-image/spike.ts'],outfile:'node_modules/.cache/slipper-local-image-spike.cjs',bundle:true,platform:'node',format:'cjs',external:['electron'],alias:{'@shared':'./src/shared'}});
// Match the app name before Electron initializes its macOS safeStorage service.
mkdirSync('node_modules/.cache/slipper-local-image',{recursive:true});
writeFileSync('node_modules/.cache/slipper-local-image/package.json',JSON.stringify({name:'slipper',version:'0.1.0',main:'../slipper-local-image-spike.cjs'}));
const child = spawn(require('electron'), ['node_modules/.cache/slipper-local-image'], {stdio:'inherit', env:process.env});
child.on('exit', code => {process.exitCode=code ?? 1;});
