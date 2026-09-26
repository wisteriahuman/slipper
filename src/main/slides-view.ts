// The left side: the real Google Slides editor, with none of the app's privileges.
import {session as electronSession, shell, WebContentsView} from 'electron';
import {parseSlidesUrl} from '@shared/slides-url';

export const GOOGLE_PARTITION = 'persist:google';
const START_URL = 'https://docs.google.com/presentation/u/0/';

export function createSlidesView(onLocation: (presentationId: string | null, pageId: string | null) => void) {
  const google = electronSession.fromPartition(GOOGLE_PARTITION);
  // Look like plain Chrome: drop the "Electron/x" and app-name tokens from the user agent.
  google.setUserAgent(google.getUserAgent().replace(/\s+Electron\/\S+/, '').replace(/(\)\s+)(?:[^)\s]+\s+)*?(Chrome\/)/, '$1$2'));
  // Clipboard is needed for editing; everything else (camera, notifications, ...) is denied.
  google.setPermissionRequestHandler((_wc, permission, allow) => allow(permission.startsWith('clipboard')));

  const view = new WebContentsView({webPreferences: {session: google, sandbox: true, contextIsolation: true, nodeIntegration: false}});
  const wc = view.webContents;
  // New windows (share dialogs, help links) open in the system browser instead of inside the app.
  wc.setWindowOpenHandler(({url}) => { if (url.startsWith('https://')) void shell.openExternal(url); return {action: 'deny'}; });
  const report = () => { const l = parseSlidesUrl(wc.getURL()); onLocation(l.presentationId, l.pageId); };
  wc.on('did-navigate', report);
  wc.on('did-navigate-in-page', report);
  void wc.loadURL(START_URL);

  return {
    view, session: google,
    reload: () => void wc.loadURL(START_URL),
    // Jump to a page in the open presentation, e.g. the one just added.
    showPage: (pageId: string) => {
      const l = parseSlidesUrl(wc.getURL());
      if (l.presentationId) void wc.loadURL(`https://docs.google.com/presentation/d/${l.presentationId}/edit#slide=id.${pageId}`);
    },
    openPresentation: (presentationId: string) => void wc.loadURL(`https://docs.google.com/presentation/d/${presentationId}/edit`),
    isSignedIn: async () => (await google.cookies.get({domain: '.google.com', name: 'SID'})).length > 0
  };
}
