// OAuth for a desktop app: consent in the system browser, loopback redirect, PKCE.
// The refresh token is encrypted with the OS keychain (safeStorage) before it touches disk.
import {createHash, randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {safeStorage, shell} from 'electron';

// drive.file would only reach files picked through Google Picker or created by the app, which excludes
// the deck already open in the embedded editor. To avoid re-picking every deck, we ask for the Slides
// scope (read and edit the user's presentations).
// Drive is needed only to copy a deck when a storyline is turned into a new presentation:
// drive.readonly to read the original, drive.file to work on the copy the app created.
export const SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file'
];

type ClientFile = {installed?: {client_id: string; client_secret: string}};
type Token = {accessToken: string; expiresAt: number; scopes: string[]};

export class GoogleAuth {
  private token: Token | null = null;
  private clientFile: string;
  private refreshFile: string;
  private scopesFile: string;

  constructor(dataDir: string) {
    this.clientFile = path.join(dataDir, 'google-client.json');
    this.refreshFile = path.join(dataDir, 'google-refresh-token.bin');
    this.scopesFile = path.join(dataDir, 'google-scopes.json');
  }

  hasClient = () => fs.existsSync(this.clientFile);
  isConnected = () => fs.existsSync(this.refreshFile);
  // Connections made before a scope was added keep working for Slides but must reconnect for Drive.
  grantedScopes = (): string[] => { try { return JSON.parse(fs.readFileSync(this.scopesFile, 'utf8')); } catch { return []; } };
  hasAllScopes = () => SCOPES.every(s => this.grantedScopes().includes(s));

  // Accepts the JSON downloaded from Google Cloud for a "Desktop app" OAuth client.
  saveClient(sourceFile: string) {
    const parsed = JSON.parse(fs.readFileSync(sourceFile, 'utf8')) as ClientFile;
    if (!parsed.installed?.client_id || !parsed.installed.client_secret) throw new Error('「デスクトップ アプリ」型の OAuth クライアントの JSON を選んでください');
    fs.writeFileSync(this.clientFile, JSON.stringify({installed: parsed.installed}), {mode: 0o600});
  }

  private client() {
    const c = (JSON.parse(fs.readFileSync(this.clientFile, 'utf8')) as ClientFile).installed;
    if (!c) throw new Error('OAuth クライアントが設定されていません');
    return c;
  }

  async connect(): Promise<void> {
    const {client_id, client_secret} = this.client();
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(16).toString('hex');
    const {code, redirectUri} = await new Promise<{code: string; redirectUri: string}>((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const done = (message: string) => { res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}).end(`<p style="font-family:sans-serif">${message}</p>`); server.close(); };
        if (url.searchParams.get('state') !== state) { res.writeHead(400).end(); return; }
        const got = url.searchParams.get('code');
        if (!got) { done('許可されませんでした。Slipper に戻ってください。'); reject(new Error(url.searchParams.get('error') ?? '許可されませんでした')); return; }
        done('Slipper に接続しました。このタブは閉じて構いません。');
        resolve({code: got, redirectUri});
      });
      const timer = setTimeout(() => { server.close(); reject(new Error('Google の許可画面の操作が5分以内に終わりませんでした')); }, 5 * 60_000);
      server.on('close', () => clearTimeout(timer));
      let redirectUri = '';
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        redirectUri = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
        const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        for (const [k, v] of Object.entries({client_id, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '), code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent'})) auth.searchParams.set(k, v);
        void shell.openExternal(auth.toString());
      });
    });
    const token = await this.tokenRequest({client_id, client_secret, code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: 'authorization_code'});
    if (!token.refresh_token) throw new Error('リフレッシュトークンを受け取れませんでした');
    fs.writeFileSync(this.refreshFile, safeStorage.encryptString(token.refresh_token), {mode: 0o600});
    this.remember(token);
  }

  disconnect() { this.token = null; fs.rmSync(this.refreshFile, {force: true}); fs.rmSync(this.scopesFile, {force: true}); }

  async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.accessToken;
    if (!this.isConnected()) throw new Error('Google に接続していません');
    const {client_id, client_secret} = this.client();
    const refresh_token = safeStorage.decryptString(fs.readFileSync(this.refreshFile));
    const token = await this.tokenRequest({client_id, client_secret, refresh_token, grant_type: 'refresh_token'});
    return this.remember(token).accessToken;
  }

  private remember(token: {access_token: string; expires_in: number; scope?: string}): Token {
    const scopes = (token.scope ?? '').split(' ').filter(Boolean);
    this.token = {accessToken: token.access_token, expiresAt: Date.now() + (token.expires_in - 60) * 1000, scopes};
    fs.writeFileSync(this.scopesFile, JSON.stringify(scopes));
    return this.token;
  }

  private async tokenRequest(body: Record<string, string>) {
    const res = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(body)});
    const data = await res.json() as {access_token: string; expires_in: number; refresh_token?: string; scope?: string; error_description?: string; error?: string};
    if (!res.ok) throw new Error(`Google の認証に失敗しました: ${data.error_description ?? data.error ?? res.status}`);
    return data;
  }
}
