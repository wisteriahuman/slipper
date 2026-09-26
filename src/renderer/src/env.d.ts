/// <reference types="vite/client" />
import type {PanelApi} from '@shared/ipc';

declare global {
  interface Window { slipper: PanelApi }
}
