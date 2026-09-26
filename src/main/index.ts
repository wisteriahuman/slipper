import {renderVariant} from './variant-preview';
import path from 'node:path';
import {app, BaseWindow, dialog, ipcMain, shell, WebContentsView} from 'electron';
import type {AdoptInput} from '@shared/ipc';
import type {ColorMeaning} from '@shared/palette';
import {Controller} from './controller';
import {availableBrowsers, importGoogleCookies} from './cookie-import';
import {GoogleAuth} from './google/oauth';
import {SlidesClient} from './google/slides-client';
import {DriveClient} from './google/drive-client';
import {SlipperMcpServer} from './mcp-server';
import {createSlidesView} from './slides-view';
import {Store} from './store';

const PANEL_WIDTH = 560;
// Lets development tools inspect both views over the DevTools protocol.
if (process.env.SLIPPER_DEBUG_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.SLIPPER_DEBUG_PORT);

app.whenReady().then(async () => {
  const dataDir = app.getPath('userData');
  const store = new Store(path.join(dataDir, 'slipper.db'));
  const auth = new GoogleAuth(dataDir);
  // The slides view is created after the controller but used by it only through this callback.
  let openPresentation = (_id: string) => {};
  const controller = new Controller({store, auth, renderVariant, slides: new SlidesClient(auth), drive: new DriveClient(auth), browsers: availableBrowsers(), openPresentation: id => openPresentation(id)});
  const slides = createSlidesView((p, page) => controller.onLocation(p, page));
  openPresentation = id => slides.openPresentation(id);

  const mcp = new SlipperMcpServer({submitVariantReview: r => controller.submitVariantReview(r),submitProposalPlan: p => controller.submitProposalPlan(p), previewVariant: v => controller.previewVariant(v), currentPage: d => controller.currentPageForConversation(d), submitVariant: v => controller.submitVariant(v), submitStoryline: s => controller.submitStoryline(s),
    submitDeckReading: r => controller.submitDeckReading(r), submitPageReading: r => controller.submitPageReading(r),
    pageImages: id => controller.pageImages(id)});
  await mcp.start(Number(process.env.SLIPPER_MCP_PORT ?? 0));
  controller.attachMcp(mcp.url, mcp.token);
  controller.setSignedIn(await slides.isSignedIn());

  const win = new BaseWindow({width: 1600, height: 960, minWidth: 1100, minHeight: 640, title: 'Slipper'});
  const panel = new WebContentsView({webPreferences: {preload: path.join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true}});
  win.contentView.addChildView(slides.view);
  win.contentView.addChildView(panel);
  const layout = () => {
    const {width, height} = win.getContentBounds();
    slides.view.setBounds({x: 0, y: 0, width: width - PANEL_WIDTH, height});
    panel.setBounds({x: width - PANEL_WIDTH, y: 0, width: PANEL_WIDTH, height});
  };
  layout();
  win.on('resize', layout);
  if (process.env.ELECTRON_RENDERER_URL) void panel.webContents.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void panel.webContents.loadFile(path.join(__dirname, '../renderer/index.html'));

  const push = controller.subscribe(state => { if (!panel.webContents.isDestroyed()) panel.webContents.send('state', state); });
  const ok = (message: string) => ({ok: true, message});
  const fail = (e: unknown) => ({ok: false, message: (e as Error).message});
  // Only the panel may call these.
  const handle = (channel: string, fn: (...args: never[]) => unknown) =>
    ipcMain.handle(channel, (event, ...args) => event.sender === panel.webContents ? (fn as (...a: unknown[]) => unknown)(...args) : undefined);

  handle('getState', () => controller.getState());
  handle('importCookies', async (browserId: string) => {
    try {
      const r = await importGoogleCookies(browserId, slides.session);
      slides.reload();
      controller.setSignedIn(await slides.isSignedIn());
      return ok(`${r.browser} から ${r.imported} 件を取り込みました`);
    } catch (e) { return fail(e); }
  });
  handle('chooseGoogleClient', async () => {
    const picked = await dialog.showOpenDialog({title: 'OAuth クライアントの JSON を選ぶ', filters: [{name: 'JSON', extensions: ['json']}], properties: ['openFile']});
    if (picked.canceled || !picked.filePaths[0]) return {ok: false, message: '選択をやめました'};
    try { auth.saveClient(picked.filePaths[0]); controller.refreshGoogle(); return ok('OAuth クライアントを設定しました'); } catch (e) { return fail(e); }
  });
  handle('connectGoogle', async () => {
    try { await auth.connect(); controller.refreshGoogle(); return ok('Google に接続しました'); } catch (e) { return fail(e); }
  });
  handle('saveBrief', (input: {audience: string; message: string; context?: string; subject?: string; colors: ColorMeaning[]}) => controller.saveBrief(input));
  handle('requestVariants', (input: {direction: string; deep: boolean}) => controller.requestVariants(input));
  handle('cancelRequests', () => controller.cancelRequests());
  handle('requestStorylines', (input: {direction: string; deep: boolean}) => controller.requestStorylines(input));
  handle('adoptStoryline', (id: string) => controller.adoptStoryline(id));
  handle('openPresentation', (id: string) => { if (/^[\w-]+$/.test(id)) controller.openPresentation(id); });
  handle('refreshStoryboardImages', () => controller.refreshStoryboardImages());
  handle('rereadDeck', () => controller.rereadDeck());
  // Source links in the panel open in the system browser; only https URLs are allowed.
  handle('openExternal', (url: string) => { if (/^https:\/\//.test(url)) void shell.openExternal(url); });
  handle('adopt', (input: AdoptInput) => controller.adopt(input));
  handle('dismissNotice', (i: number) => controller.dismissNotice(i));
  handle('showPage', (pageId: string) => { if (/^[\w-]+$/.test(pageId)) slides.showPage(pageId); });

  app.on('before-quit', () => { push(); mcp.stop(); controller.dispose(); store.close(); });
});

app.on('window-all-closed', () => app.quit());
