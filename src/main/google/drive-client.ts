// Copies a presentation in Drive. Used only to build a storyline as a new deck; the original is untouched.
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
}
