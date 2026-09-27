// Question: can an image that only exists on this machine be added to Google Slides?
// createImage needs a publicly reachable URL and copies the image at insertion time, so we compare
// (A) a private Drive file and (B) a Drive file shared by link only while inserting.
// Explicit opt-in: creates one QA presentation and one temporary Drive file, which is deleted at the end.
import {app, BrowserWindow} from 'electron';
import {mkdirSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {GoogleAuth} from '../../src/main/google/oauth';
import {SlidesClient} from '../../src/main/google/slides-client';

type Step = {step: string; ok: boolean; detail: string; ms: number};

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  if (process.env.SLIPPER_SPIKE_GOOGLE !== '1') throw new Error('Set SLIPPER_SPIKE_GOOGLE=1 to create a QA presentation and a temporary Drive file');
  const output = resolve(process.env.SLIPPER_SPIKE_OUTPUT ?? '/tmp/slipper-local-image-spike');
  mkdirSync(output, {recursive: true});
  const auth = new GoogleAuth(resolve(homedir(), 'Library/Application Support/slipper'));
  if (!auth.hasClient() || !auth.isConnected()) throw new Error('Existing Slipper Google connection is required');
  const token = async () => ({Authorization: `Bearer ${await auth.accessToken()}`});
  const steps: Step[] = [];
  const result: {presentationId?: string; url?: string; driveFileId?: string; steps: Step[]} = {steps};
  const save = () => writeFileSync(resolve(output, 'result.json'), JSON.stringify(result, null, 2));
  const step = async (name: string, f: () => Promise<string>) => {
    const t = Date.now();
    try { const detail = await f(); steps.push({step: name, ok: true, detail, ms: Date.now() - t}); return true; }
    catch (e) { steps.push({step: name, ok: false, detail: (e as Error).message, ms: Date.now() - t}); return false; }
    finally { save(); console.log(steps.at(-1)); }
  };

  // A local image: rendered here so nothing is downloaded from elsewhere.
  const win = new BrowserWindow({show: false, width: 640, height: 360, useContentSize: true});
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<body style="margin:0;display:grid;place-items:center;height:360px;background:#e7ece8;font:600 40px sans-serif;color:#2f5d50">Slipper 手元の画像</body>'));
  const png = (await win.webContents.capturePage()).toPNG();
  win.destroy();
  writeFileSync(resolve(output, 'local.png'), png);

  const res = await fetch('https://slides.googleapis.com/v1/presentations', {method: 'POST', headers: {...await token(), 'Content-Type': 'application/json'}, body: JSON.stringify({title: `Slipper QA — local image ${new Date().toISOString()}`})});
  if (!res.ok) throw new Error(`Create QA presentation: ${res.status}`);
  const {presentationId} = await res.json() as {presentationId: string};
  result.presentationId = presentationId; result.url = `https://docs.google.com/presentation/d/${presentationId}/edit`; save();
  const slides = new SlidesClient(auth);
  await slides.batchUpdate(presentationId, [{createSlide: {objectId: 'qa_page_a', slideLayoutReference: {predefinedLayout: 'BLANK'}}}, {createSlide: {objectId: 'qa_page_b', slideLayoutReference: {predefinedLayout: 'BLANK'}}}]);

  const boundary = `slp${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name: 'slipper-spike-local-image.png'})}\r\n--${boundary}\r\nContent-Type: image/png\r\n\r\n`),
    png, Buffer.from(`\r\n--${boundary}--`)]);
  const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {method: 'POST', headers: {...await token(), 'Content-Type': `multipart/related; boundary=${boundary}`}, body});
  const uploaded = await up.json() as {id?: string; error?: {message?: string}};
  if (!up.ok || !uploaded.id) throw new Error(`Upload: ${uploaded.error?.message ?? up.status}`);
  const fileId = uploaded.id; result.driveFileId = fileId; save();
  const imageUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const insert = (page: string, id: string) => slides.batchUpdate(presentationId, [{createImage: {objectId: id, url: imageUrl, elementProperties: {pageObjectId: page,
    size: {width: {magnitude: 4572000, unit: 'EMU'}, height: {magnitude: 2571750, unit: 'EMU'}}, transform: {scaleX: 1, scaleY: 1, translateX: 2286000, translateY: 1285875, unit: 'EMU'}}}}]).then(() => 'inserted');

  await step('A: 非公開のまま追加', () => insert('qa_page_a', 'qa_img_a'));
  let permissionId = '';
  await step('B-1: リンクを知っている人に閲覧を許可', async () => {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=id`, {method: 'POST', headers: {...await token(), 'Content-Type': 'application/json'}, body: JSON.stringify({role: 'reader', type: 'anyone'})});
    const d = await r.json() as {id?: string; error?: {message?: string}};
    if (!r.ok || !d.id) throw new Error(d.error?.message ?? String(r.status));
    permissionId = d.id; return permissionId;
  });
  await step('B-2: 共有中に追加', () => insert('qa_page_b', 'qa_img_b'));
  if (permissionId) await step('B-3: 共有を解除', async () => {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permissionId}`, {method: 'DELETE', headers: await token()});
    if (!r.ok) throw new Error(String(r.status)); return 'removed';
  });
  await step('B-4: ドライブのファイルを削除', async () => {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {method: 'DELETE', headers: await token()});
    if (!r.ok) throw new Error(String(r.status)); return 'deleted';
  });
  await step('B-5: 削除後も資料に画像が残るか', async () => {
    const page = await slides.page(presentationId, 'qa_page_b');
    const image = (page.pageElements ?? []).find(e => e.objectId === 'qa_img_b')?.image as {contentUrl?: string; sourceUrl?: string} | undefined;
    if (!image?.contentUrl) throw new Error('画像要素がない');
    const shot = await slides.thumbnail(presentationId, 'qa_page_b');
    writeFileSync(resolve(output, 'google-b.png'), Buffer.from(shot.split(',')[1]!, 'base64'));
    const r = await fetch(image.contentUrl);
    return `contentUrl ${r.status}; sourceUrl ${image.sourceUrl ?? 'なし'}`;
  });
  console.log(result.url); app.quit();
}).catch(e => { console.error(e); app.exit(1); });
