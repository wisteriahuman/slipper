// End-to-end check of library assets on the Google side: real rasterization of bundled SVGs, temporary
// hosting through Drive, near-use credit, and the credits page (create, then merge on a second adoption).
// Explicit opt-in: creates one QA presentation; temporary Drive files are deleted.
import {app} from 'electron';
import {mkdirSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve, dirname} from 'node:path';
import {GoogleAuth} from '../../src/main/google/oauth';
import {SlidesClient} from '../../src/main/google/slides-client';
import {DriveClient} from '../../src/main/google/drive-client';
import {imageKey, planSequence} from '../../src/main/google/convert';
import {Library} from '../../src/main/library';
import {Store} from '../../src/main/store';
import {rasterize, shrink} from '../../src/main/rasterize';
import {creditPageRequests, creditsText, CREDITS_PAGE} from '../../src/main/credits';
import type {SlideElement} from '../../src/shared/element';

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  if (process.env.SLIPPER_SPIKE_GOOGLE !== '1') throw new Error('Set SLIPPER_SPIKE_GOOGLE=1');
  const output = resolve(process.env.SLIPPER_SPIKE_OUTPUT ?? '/tmp/slipper-library-spike');
  mkdirSync(output, {recursive: true});
  const auth = new GoogleAuth(resolve(homedir(), 'Library/Application Support/slipper'));
  if (!auth.hasClient() || !auth.isConnected()) throw new Error('Existing Slipper Google connection is required');
  const library = new Library({store: new Store(':memory:'), dataDir: output, lucideDir: dirname(require.resolve('lucide-static/package.json')), peepsDir: resolve('resources/library/open-peeps'), rasterize, shrink});
  const icon = await library.asPoolAsset(library.search('calendar')[0]!);
  const person = await library.asPoolAsset(library.search('困惑')[0]!);
  // A made-up credit to exercise the credit paths; bundled assets need none.
  person.source.library = {...person.source.library!, credit: 'Open Peeps by Pablo Stanley (CC0)', nearUse: true};
  for (const [n, a] of Object.entries({icon, person})) writeFileSync(resolve(output, `${n}.png`), Buffer.from(a.previewUrl.split(',')[1]!, 'base64'));
  console.log('icon', icon.description, icon.w, icon.h, 'person', person.description, person.w, person.h);

  const res = await fetch('https://slides.googleapis.com/v1/presentations', {method: 'POST', headers: {Authorization: `Bearer ${await auth.accessToken()}`, 'Content-Type': 'application/json'}, body: JSON.stringify({title: `Slipper QA — library ${new Date().toISOString()}`})});
  const {presentationId} = await res.json() as {presentationId: string};
  const url = `https://docs.google.com/presentation/d/${presentationId}/edit`;
  writeFileSync(resolve(output, 'result.json'), JSON.stringify({url}, null, 2));
  const slides = new SlidesClient(auth), drive = new DriveClient(auth);
  await slides.batchUpdate(presentationId, [{createSlide: {objectId: 'qa_source', slideLayoutReference: {predefinedLayout: 'BLANK'}}}]);
  const presentation = await slides.presentation(presentationId), page = await slides.page(presentationId, 'qa_source');

  const adopt = async (prefix: string, elements: SlideElement[], assets: typeof icon[]) => {
    const near = assets.filter(a => a.source.library?.nearUse).map(a => a.source.library!.credit!);
    const frame = near.length ? [...elements, {id: 'credit', type: 'text' as const, text: near.join(' ／ '), x: 16, y: 514, w: 928, h: 22, size: 12, color: 'DARK1', invented: false}] : elements;
    const t = Date.now();
    const plan = await drive.withPublicImages(assets.map(a => ({dataUrl: a.previewUrl, name: `${a.id}.png`})), async urls => {
      const p = planSequence({page, size: presentation.size, frames: [frame], idPrefix: prefix, poolImages: Object.fromEntries(assets.map((a, i) => [a.id, urls[i]!]))});
      await slides.batchUpdate(presentationId, p.requests); return p;
    });
    const credits = assets.flatMap(a => a.source.library?.credit ? [`${a.source.library.title}：${a.source.library.credit}`] : []);
    const has = (await slides.structure(presentationId)).slides.some(s => s.id === CREDITS_PAGE);
    const existing = has ? creditsText(await slides.page(presentationId, CREDITS_PAGE)) : null;
    const req = creditPageRequests({existing, lines: credits, size: presentation.size});
    if (req.length) await slides.batchUpdate(presentationId, req);
    console.log(prefix, 'adopted in', Date.now() - t, 'ms; credits page', has ? 'updated' : 'created', req.length ? '' : '(no change)');
    writeFileSync(resolve(output, `${prefix}.png`), Buffer.from((await slides.thumbnail(presentationId, plan.newPageIds[0]!)).split(',')[1]!, 'base64'));
  };
  await adopt('qa_one', [
    {id: 't', type: 'text', text: '予約はいつでも', x: 64, y: 60, w: 600, h: 70, size: 40, bold: true, invented: false},
    {id: 'i', type: 'asset', assetId: icon.id, x: 700, y: 50, w: 96, h: 96, invented: false},
    {id: 'p', type: 'asset', assetId: person.id, x: 380, y: 170, w: 240, h: Math.round(240 * person.h / person.w) > 330 ? 330 : Math.round(240 * person.h / person.w), invented: false}
  ], [icon, person]);
  // Second adoption with a new credit: the page must merge, keeping the first line.
  person.source.library = {...person.source.library!, title: '別の人物', credit: 'Second credit line', nearUse: false};
  await adopt('qa_two', [{id: 'p', type: 'asset', assetId: person.id, x: 360, y: 100, w: 240, h: 324, invented: false}], [person]);
  // Recolored icon on a dark panel: the color is baked into the PNG that Google receives.
  const light = await library.recolor(icon.svg!, '#ffffff');
  const tc = Date.now();
  const colored = await drive.withPublicImages([{dataUrl: light, name: 'icon-light.png'}], async ([u]) => {
    const p = planSequence({page, size: presentation.size, idPrefix: 'qa_color', poolImages: {[imageKey(icon.id, 'LIGHT1')]: u!}, frames: [[
      {id: 'panel', type: 'shape', shape: 'roundRect', fill: 'DARK1', x: 180, y: 190, w: 600, h: 160, invented: false},
      {id: 'i', type: 'asset', assetId: icon.id, color: 'LIGHT1', x: 220, y: 222, w: 96, h: 96, invented: false},
      {id: 't', type: 'text', text: '予約を確定', x: 340, y: 235, w: 420, h: 70, size: 40, bold: true, color: 'LIGHT1', invented: false}]]});
    await slides.batchUpdate(presentationId, p.requests); return p;
  });
  console.log('qa_color adopted in', Date.now() - tc, 'ms');
  writeFileSync(resolve(output, 'qa_color.png'), Buffer.from((await slides.thumbnail(presentationId, colored.newPageIds[0]!)).split(',')[1]!, 'base64'));
  const final = creditsText(await slides.page(presentationId, CREDITS_PAGE));
  console.log('credits text:', JSON.stringify(final));
  writeFileSync(resolve(output, 'credits.png'), Buffer.from((await slides.thumbnail(presentationId, CREDITS_PAGE)).split(',')[1]!, 'base64'));
  console.log(url); app.quit();
}).catch(e => { console.error(e); app.exit(1); });
