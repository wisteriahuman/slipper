// Spike: can an Electron app host a real, editable Google Slides next to our own panel?
// Questions: (1) Google sign-in and editing work inside the app, (2) the current slide is readable
// from the URL, (3) the Google page stays isolated from the app's privileges.
const {app, BaseWindow, WebContentsView, session, shell, ipcMain} = require('electron');
const path = require('node:path');
const cookieImport = require('./cookie-import');

// Same approach as Orca (MIT): look like plain Chrome everywhere, and like Firefox on Google's
// sign-in hosts, because Google refuses sign-in from browsers it detects as embedded.
const AUTH_HOSTS = new Set(['accounts.google.com', 'accounts.youtube.com']);
const isAuth = url => { try { return AUTH_HOSTS.has(new URL(url).hostname); } catch { return false; } };
const FIREFOX_UA = `Mozilla/5.0 (${process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10.15' : 'Windows NT 10.0; Win64; x64'}; rv:140.0) Gecko/20100101 Firefox/140.0`;
if (process.env.SLIPPER_DEBUG_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.SLIPPER_DEBUG_PORT);
app.userAgentFallback = app.userAgentFallback.replace(/\s+Electron\/\S+/, '').replace(/(\)\s+)(?:[^)\s]+\s+)*?(Chrome\/)/, '$1$2');
const CHROME_UA = app.userAgentFallback;

const START_URL = process.env.SLIPPER_START_URL || 'https://docs.google.com/presentation/u/0/';
const PANEL_WIDTH = 380;

// Presentation and slide come from the editor URL: /presentation/d/<id>/edit#slide=id.<pageId>
function parseSlidesUrl(url) {
  try {
    const u = new URL(url);
    const presentation = u.pathname.match(/\/presentation\/d\/([\w-]+)/)?.[1] ?? null;
    const slide = decodeURIComponent(u.hash).match(/slide=id\.([\w-]+)/)?.[1] ?? null;
    return {url, host: u.hostname, presentation, slide};
  } catch { return {url, host: null, presentation: null, slide: null}; }
}

app.whenReady().then(() => {
  const google = session.fromPartition('persist:google');
  google.setUserAgent(CHROME_UA);
  google.webRequest.onBeforeSendHeaders((details, done) => {
    const headers = details.requestHeaders;
    if (isAuth(details.url) || (details.resourceType !== 'mainFrame' && isAuth(details.referrer))) {
      for (const key of Object.keys(headers)) if (key.toLowerCase().startsWith('sec-ch-ua')) delete headers[key];
      headers['User-Agent'] = FIREFOX_UA;
    }
    done({requestHeaders: headers});
  });
  // The Google page gets no app privileges: deny camera, notifications, etc. Clipboard is needed for editing.
  google.setPermissionRequestHandler((_wc, permission, allow) => allow(permission.startsWith('clipboard')));

  const win = new BaseWindow({width: 1500, height: 920, title: 'Slipper spike'});
  const slides = new WebContentsView({webPreferences: {session: google, sandbox: true, contextIsolation: true, nodeIntegration: false}});
  const panel = new WebContentsView({webPreferences: {preload: path.join(__dirname, 'panel-preload.js'), sandbox: true, contextIsolation: true}});
  win.contentView.addChildView(slides);
  win.contentView.addChildView(panel);
  const layout = () => {
    const {width, height} = win.getContentBounds();
    slides.setBounds({x: 0, y: 0, width: width - PANEL_WIDTH, height});
    panel.setBounds({x: width - PANEL_WIDTH, y: 0, width: PANEL_WIDTH, height});
  };
  layout(); win.on('resize', layout);

  const wc = slides.webContents;
  const send = (channel, payload) => panel.webContents.send(channel, payload);
  // Like Orca: the page's own navigator.userAgent must match the request headers, including
  // mid-redirect. webContents.setUserAgent only affects the next navigation, so we override
  // through the DevTools protocol, which also drops navigator.userAgentData (Firefox has none).
  wc.debugger.attach('1.3');
  let currentUA = null;
  const syncUserAgent = url => {
    const ua = isAuth(url) ? FIREFOX_UA : CHROME_UA;
    if (ua === currentUA) return;
    currentUA = ua;
    wc.debugger.sendCommand('Emulation.setUserAgentOverride', {userAgent: ua}).catch(err => send('slides:log', `UA切替失敗: ${err.message}`));
  };
  wc.on('did-start-navigation', (details) => { if (details.isMainFrame) syncUserAgent(details.url); });
  wc.on('will-redirect', (details) => { if (details.isMainFrame) syncUserAgent(details.url); });
  const report = () => send('slides:location', {...parseSlidesUrl(wc.getURL()), ua: currentUA === FIREFOX_UA ? 'Firefox' : 'Chrome'});
  wc.on('did-navigate', (_e, url) => { console.log('[slides] navigate', url.split('?')[0], currentUA === FIREFOX_UA ? 'UA=Firefox' : 'UA=Chrome'); report(); });
  wc.on('did-navigate-in-page', report);
  wc.on('did-fail-load', (_e, code, desc, url) => send('slides:log', `読み込み失敗 ${code} ${desc} ${url}`));
  // Popups (e.g. "open in new tab", help links) go to the system browser instead of new app windows.
  wc.setWindowOpenHandler(({url}) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return {action: 'deny'}; });

  ipcMain.handle('panel:probe', async () => {
    // Read-only checks from the app side: is the editor loaded and signed in?
    const url = wc.getURL();
    const signedIn = (await google.cookies.get({domain: '.google.com', name: 'SID'})).length > 0;
    return {...parseSlidesUrl(url), signedIn, navigatorUA: await wc.executeJavaScript('navigator.userAgent')};
  });
  ipcMain.handle('panel:browsers', () => cookieImport.available());
  // Only counts come back to the panel; cookie values never leave the main process.
  ipcMain.handle('panel:import-cookies', async (_e, browserId) => {
    try {
      const result = await cookieImport.importGoogleCookies(browserId, google);
      wc.loadURL(START_URL);
      return {ok: true, ...result};
    } catch (err) { return {ok: false, reason: err.message}; }
  });
  ipcMain.handle('panel:go', (_e, url) => { if (/^https:\/\/docs\.google\.com\//.test(url)) wc.loadURL(url); });

  panel.webContents.loadFile(path.join(__dirname, 'panel.html'));
  syncUserAgent(START_URL);
  wc.loadURL(START_URL);
  if (process.env.SLIPPER_DEBUG_PORT) console.log('[spike] remote debugging on', process.env.SLIPPER_DEBUG_PORT);
});
app.on('window-all-closed', () => app.quit());
