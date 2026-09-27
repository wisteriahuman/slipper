// Copies a presentation in Drive (to build a storyline as a new deck; the original is untouched), and
// hosts local images for the moment Google Slides fetches them.
import {randomUUID} from 'node:crypto';
import type {GoogleAuth} from './oauth';

export class DriveClient {
  constructor(private auth: GoogleAuth) {}

  async copy(fileId: string, name: string): Promise<string> {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?supportsAllDrives=true&fields=id`, {
      method: 'POST', headers: {Authorization: `Bearer ${await this.auth.accessToken()}`, 'Content-Type': 'application/json'}, body: JSON.stringify({name})
    });
    const data = await res.json() as {id?: string; error?: {message?: string}};
    if (res.status === 403) throw new Error('Drive の権限がありません。パネルの「Google に接続し直す」を押してください');
    if (!res.ok || !data.id) throw new Error(`資料を複製できませんでした: ${data.error?.message ?? res.status}`);
    return data.id;
  }

  // Slides' createImage fetches a public URL once and keeps its own copy (verified in spikes/local-image).
  // Each image is uploaded, shared by link only while `use` runs, then deleted.
  async withPublicImages<T>(images: Array<{dataUrl: string; name: string}>, use: (urls: string[]) => Promise<T>): Promise<T> {
    const headers = async () => ({Authorization: `Bearer ${await this.auth.accessToken()}`});
    const ids: string[] = [];
    try {
      const urls: string[] = [];
      for (const image of images) {
        const m = /^data:([^;]+);base64,(.*)$/.exec(image.dataUrl);
        if (!m) throw new Error('素材の画像の形式が不正です');
        const boundary = `slp${randomUUID()}`;
        const body = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name: image.name})}\r\n--${boundary}\r\nContent-Type: ${m[1]}\r\n\r\n`),
          Buffer.from(m[2]!, 'base64'), Buffer.from(`\r\n--${boundary}--`)]);
        const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {method: 'POST', headers: {...await headers(), 'Content-Type': `multipart/related; boundary=${boundary}`}, body});
        const file = await up.json() as {id?: string; error?: {message?: string}};
        if (up.status === 403) throw new Error('Drive の権限がありません。パネルの「Google に接続し直す」を押してください');
        if (!up.ok || !file.id) throw new Error(`素材を一時的にアップロードできませんでした: ${file.error?.message ?? up.status}`);
        ids.push(file.id);
        const share = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {method: 'POST', headers: {...await headers(), 'Content-Type': 'application/json'}, body: JSON.stringify({role: 'reader', type: 'anyone'})});
        if (!share.ok) throw new Error(`素材を Google Slides に渡せませんでした (${share.status})`);
        urls.push(`https://drive.google.com/uc?export=download&id=${file.id}`);
      }
      return await use(urls);
    } finally {
      for (const id of ids) await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, {method: 'DELETE', headers: await headers()}).catch(() => undefined);
    }
  }
}
