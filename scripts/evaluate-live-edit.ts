// Creates a dedicated QA deck. Existing user presentations are never edited.
import {app, BrowserWindow, ipcMain} from 'electron';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {GoogleAuth} from '../src/main/google/oauth';
import {SlidesClient} from '../src/main/google/slides-client';
import {LiveEditor as LiveService, textRequests} from '../src/main/live-edit';
import {TextRefiner} from '../src/main/text-refiner';
import {ClaudeRunner} from '../src/main/claude-runner';
import {SlipperMcpServer, type McpHandlers} from '../src/main/mcp-server';
import type {LivePage} from '../src/shared/live-edit';
import type {TextOption} from '../src/shared/text-refinement';

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  if (process.env.SLIPPER_EVAL_REPLAY_TEXT) {
    const fixture = JSON.parse(readFileSync(process.env.SLIPPER_EVAL_REPLAY_TEXT, 'utf8')) as {source: string; options: TextOption[]; reject: string[]};
    let refiner: TextRefiner;
    const mcp = new SlipperMcpServer({submitTextRefinementReview: r => refiner.submitReview(r)} as McpHandlers);
    await mcp.start(); const runner = new ClaudeRunner(mcp.url, mcp.token);
    refiner = new TextRefiner({cancelAll: () => runner.cancelAll(), run: async (prompt, settings, tool, progress, timeout) => {
      if (tool !== 'submit_text_refinement') return runner.run(prompt, settings, tool, progress, timeout);
      const requestId = /requestId "([^"]+)"/.exec(prompt)![1]!;
      assert.deepEqual(await refiner.submit({requestId, options: fixture.options}), []);
      return {ok: true, seconds: 0, models: []};
    }});
    try {
      const result = await refiner.refine({snapshotId: 'fixture', elementId: 'text', text: fixture.source, direction: '条件を残して短く'}, {elements: [{id: 'text', text: fixture.source}]} as LivePage, null);
      assert.equal(result.ok, true, result.message);
      for (const rejected of fixture.reject) assert.ok(!result.options!.some(o => o.text === rejected), 'Known meaning error passed review');
      const output = resolve(process.env.SLIPPER_LIVE_EDIT_OUTPUT ?? '/tmp/slipper-live-edit-eval'); mkdirSync(output, {recursive: true});
      writeFileSync(resolve(output, 'text-review-replay.json'), JSON.stringify(result, null, 2));
      console.log('PASS Real AI review rejects the observed sequence reversal and keeps valid alternatives');
    } finally { runner.dispose(); mcp.stop(); }
    app.quit(); return;
  }
  if (process.env.SLIPPER_EVAL_GOOGLE !== '1') throw new Error('Set SLIPPER_EVAL_GOOGLE=1 to create a dedicated QA deck');
  const output = resolve(process.env.SLIPPER_LIVE_EDIT_OUTPUT ?? '/tmp/slipper-live-edit-eval');
  mkdirSync(output, {recursive: true});
  const auth = new GoogleAuth(resolve(homedir(), 'Library/Application Support/slipper'));
  const slides = new SlidesClient(auth), service = new LiveService(slides);
  const headers = {Authorization: `Bearer ${await auth.accessToken()}`, 'Content-Type': 'application/json'};
  let deck = process.env.SLIPPER_LIVE_EDIT_DECK;
  if (deck) {
    assert.ok((await slides.presentation(deck)).title.startsWith('Slipper QA — collaborative editing '), 'Only this evaluation’s dedicated QA deck may be reused');
    if ((await slides.structure(deck)).slides.some(s => s.id === 'live_page')) await slides.batchUpdate(deck, [{deleteObject: {objectId: 'live_page'}}]);
  } else {
    const response = await fetch('https://slides.googleapis.com/v1/presentations', {method: 'POST', headers, body: JSON.stringify({title: `Slipper QA — collaborative editing ${new Date().toISOString()}`})});
    if (!response.ok) throw new Error(`Could not create QA deck: ${response.status}`);
    deck = (await response.json() as {presentationId: string}).presentationId;
  }
  const manifest = {url: `https://docs.google.com/presentation/d/${deck}/edit`, checks: [] as string[], ai: 'not run'};
  const save = () => writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2)); save();
  const check = (name: string) => { manifest.checks.push(name); save(); console.log('PASS', name); };
  const shape = (id: string, x: number, y: number, w: number, h: number, text: string, fontSize: number) => [
    {createShape: {objectId: id, shapeType: 'TEXT_BOX', elementProperties: {pageObjectId: 'live_page', size: {width: {magnitude: w, unit: 'PT'}, height: {magnitude: h, unit: 'PT'}}, transform: {scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: 'PT'}}}},
    {insertText: {objectId: id, text}},
    {updateTextStyle: {objectId: id, textRange: {type: 'ALL'}, style: {fontSize: {magnitude: fontSize, unit: 'PT'}, fontFamily: 'Arial'}, fields: 'fontSize,fontFamily'}}
  ];
  await slides.batchUpdate(deck, [{createSlide: {objectId: 'live_page', slideLayoutReference: {predefinedLayout: 'BLANK'}}},
    ...shape('live_title', 40, 40, 640, 60, '小さく試し、根拠を持って判断する', 27),
    ...shape('live_body', 40, 135, 410, 100, '30人を対象に2週間試行する。効果と運用負荷を確認してから、全面導入の採否を判断する。', 20),
    ...shape('live_note', 470, 145, 200, 80, 'Google Slidesでも\n一緒に編集できます', 16)]);
  const base = (await service.read(deck, 'live_page'))!;
  const body = base.elements.find(e => e.id === 'live_body')!;
  const externalText = '40人を対象に2週間試行する。効果と運用負荷を確認してから、全面導入の採否を判断する。';
  await slides.batchUpdate(deck, textRequests(body.id, body.text!, externalText));
  const moved = await service.apply({snapshotId: base.snapshotId, patches: [{id: body.id, box: {...body.box, y: body.box.y + 24}}]});
  assert.equal(moved.ok, true, moved.message);
  assert.equal(moved.page!.elements.find(e => e.id === body.id)!.text, externalText);
  check('Native move preserves concurrent text changes and object ID');
  const undo = await service.undo(moved.undoId!); assert.equal(undo.ok, true, undo.message);
  assert.equal(undo.page!.elements.find(e => e.id === body.id)!.text, externalText);
  check('Undo preserves text written by the other editor');
  const baseline = (await service.read(deck, 'live_page'))!;
  await slides.batchUpdate(deck, textRequests(body.id, externalText, externalText.replace('40人', '50人')));
  const conflicted = await service.apply({snapshotId: baseline.snapshotId, patches: [{id: body.id, text: '40人で2週間試行し、効果と運用負荷を確認してから全面導入を判断する。'}]});
  assert.equal(conflicted.ok, false); assert.equal(conflicted.conflicts![0]!.field, 'text');
  check('Conflicting text is returned for comparison without overwriting');
  const stale = await slides.editingPage(deck, 'live_page');
  await slides.batchUpdate(deck, [{updateTextStyle: {objectId: 'live_note', textRange: {type: 'ALL'}, style: {bold: true}, fields: 'bold'}}]);
  await assert.rejects(slides.batchUpdate(deck, [{insertText: {objectId: body.id, insertionIndex: 0, text: 'SHOULD NOT WRITE'}}], stale.revisionId));
  check('Google rejects writes based on an obsolete revision');

  let runner: ClaudeRunner | undefined, refiner: TextRefiner | undefined, mcp: SlipperMcpServer | undefined;
  if (process.env.SLIPPER_EVAL_LIVE === '1') {
    mcp = new SlipperMcpServer({submitTextRefinement: r => refiner!.submit(r), submitTextRefinementReview: r => refiner!.submitReview(r)} as McpHandlers);
    await mcp.start(); runner = new ClaudeRunner(mcp.url, mcp.token); refiner = new TextRefiner(runner);
  }
  ipcMain.handle('readLivePage', async (_e, p) => { try { return {ok: true, page: await service.read(p.presentationId, p.pageId, p.knownVersion)}; } catch (e) { return {ok: false, message: String(e)}; } });
  ipcMain.handle('loadLiveDraft', (_e, presentationId, pageId) => ({ok: true, draft: service.loadDraft(presentationId, pageId)}));
  ipcMain.handle('saveLiveDraft', (_e, snapshotId, patches) => { service.saveDraft(snapshotId, patches); return {ok: true}; });
  ipcMain.handle('applyLiveEdit', (_e, p) => service.apply(p));
  ipcMain.handle('undoLiveEdit', (_e, id) => service.undo(id));
  ipcMain.handle('cancelLiveRefinement', () => refiner?.cancel());
  ipcMain.handle('refineLiveText', async (_e, p) => {
    assert.ok(refiner, 'SLIPPER_EVAL_LIVE=1 is required');
    const result = await refiner.refine(p, service.context(p.snapshotId)!, {audience: '施策の採否を決める責任者', message: '全面導入前に試す理由と実施条件を判断する'});
    manifest.ai = result.ok ? 'passed' : result.message; save();
    writeFileSync(resolve(output, 'text-options.json'), JSON.stringify(result, null, 2));
    return result;
  });
  const win = new BrowserWindow({show: false, width: 560, height: 1100, useContentSize: true, webPreferences: {sandbox: true, contextIsolation: true, preload: resolve(__dirname, 'preload.cjs'), backgroundThrottling: false}});
  await win.loadFile(resolve(__dirname, 'index.html'), {query: {deck}});
  const js = (code: string) => win.webContents.executeJavaScript(code);
  const waitFor = async (expression: string, timeout = 15000) => {
    const start = Date.now();
    while (!(await js(expression))) { if (Date.now() - start > timeout) throw new Error(`UI timed out: ${expression}`); await new Promise(r => setTimeout(r, 100)); }
  };
  const click = (text: string) => js(`[...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(text)}).click()`);
  const setText = (value: string) => js(`(() => { const t = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, ${JSON.stringify(value)}); t.dispatchEvent(new Event('input', {bubbles: true})); })()`);
  const shot = async (name: string) => {
    await js('document.fonts.ready');
    writeFileSync(resolve(output, `${name}.png`), (await win.webContents.capturePage({x: 0, y: 0, width: 560, height: 1100}, {stayHidden: true})).toPNG());
  };
  await waitFor('document.querySelectorAll(".live-hit").length === 3');
  await js('[...document.querySelectorAll(".live-hit")].find(b => b.getAttribute("aria-label").includes("50人")).click()');
  await waitFor('!!document.querySelector("textarea")');
  await shot('01-edit');
  const editedText = '50人で2週間試行し、効果と運用負荷を確認してから全面導入を判断する。';
  await setText(editedText);
  await waitFor('!!document.querySelector(".live-diff")');
  await slides.batchUpdate(deck, textRequests(body.id, externalText.replace('40人', '50人'), externalText.replace('40人', '60人')));
  await click('同じページに反映');
  await waitFor('!!document.querySelector(".live-conflicts")');
  await js('document.querySelector(".live-conflicts").scrollIntoView({block: "center"})');
  await shot('02-conflict');
  await js('document.querySelector(".live-compare > div:first-child button").click()');
  await click('選んだ内容で下書きを更新');
  await waitFor('!document.querySelector(".live-conflicts")');
  assert.ok((await js('document.querySelector("textarea").value')).includes('60人'));
  check('UI resolves a conflict and retains the chosen Google text');
  const finalText = '60人で2週間試行し、効果と運用負荷を確認してから全面導入を判断する。';
  await setText(finalText); await click('同じページに反映');
  await waitFor('[...document.querySelectorAll("button")].some(b => b.textContent === "直前の反映を取り消す")');
  assert.equal((await service.read(deck, 'live_page'))!.elements.find(e => e.id === body.id)!.text, finalText);
  check('UI text edit reaches the original Google Slides object');
  if (refiner) {
    await click('この文章の別案を見る');
    await waitFor('document.querySelectorAll(".text-options article").length >= 1', 160000);
    await js('document.querySelector(".text-options").scrollIntoView({block: "center"})'); await shot('03-ai-options');
    await click('この文章を下書きに使う'); await waitFor('!!document.querySelector(".live-diff")');
    assert.equal((await service.read(deck, 'live_page'))!.elements.find(e => e.id === body.id)!.text, finalText);
    check('Real AI options enter the draft without writing to the shared deck');
  }
  assert.equal(await js('document.documentElement.scrollWidth > innerWidth'), false);
  check('Editor has no horizontal overflow at 560px');
  const image = await slides.thumbnail(deck, 'live_page'); writeFileSync(resolve(output, 'google.png'), Buffer.from(image.split(',')[1]!, 'base64'));
  console.log(manifest.url);
  win.destroy(); runner?.dispose(); mcp?.stop(); app.quit();
}).catch(e => { console.error(e); app.exit(1); });
