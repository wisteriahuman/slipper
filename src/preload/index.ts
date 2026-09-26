// The only bridge between the panel and the app: a fixed set of named calls, no Node access.
import {contextBridge, ipcRenderer} from 'electron';
import type {PanelApi, PanelState} from '@shared/ipc';

const api: PanelApi = {
  getState: () => ipcRenderer.invoke('getState'),
  onState: listener => {
    const handler = (_e: unknown, state: PanelState) => listener(state);
    ipcRenderer.on('state', handler);
    return () => ipcRenderer.off('state', handler);
  },
  importCookies: id => ipcRenderer.invoke('importCookies', id),
  chooseGoogleClient: () => ipcRenderer.invoke('chooseGoogleClient'),
  connectGoogle: () => ipcRenderer.invoke('connectGoogle'),
  saveBrief: input => ipcRenderer.invoke('saveBrief', input),
  requestVariants: input => ipcRenderer.invoke('requestVariants', input),
  requestStorylines: input => ipcRenderer.invoke('requestStorylines', input),
  adoptStoryline: id => ipcRenderer.invoke('adoptStoryline', id),
  openPresentation: id => ipcRenderer.invoke('openPresentation', id),
  refreshStoryboardImages: () => ipcRenderer.invoke('refreshStoryboardImages'),
  rereadDeck: () => ipcRenderer.invoke('rereadDeck'),
  openExternal: url => ipcRenderer.invoke('openExternal', url),
  cancelRequests: () => ipcRenderer.invoke('cancelRequests'),
  adopt: input => ipcRenderer.invoke('adopt', input),
  dismissNotice: i => ipcRenderer.invoke('dismissNotice', i),
  showPage: pageId => ipcRenderer.invoke('showPage', pageId)
};
contextBridge.exposeInMainWorld('slipper', api);
