// Copies the user's existing Google sign-in from a Chromium browser into our session.
// Google refuses sign-in inside embedded browsers, but a session created in a real browser works
// (the same approach as Orca's cookie import; verified in spikes/electron-google-slides).
//
// Scope is deliberately narrow: macOS, a fixed list of browsers, google.com cookies only.
// Decrypted values stay in memory and go straight into the Electron session.
import {execFile} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import type {Session} from 'electron';

type Browser = {label: string; root: string; keychainService: string; keychainAccount: string};
const BROWSERS: Record<string, Browser> = {
  arc: {label: 'Arc', root: 'Arc/User Data', keychainService: 'Arc Safe Storage', keychainAccount: 'Arc'},
  chrome: {label: 'Google Chrome', root: 'Google/Chrome', keychainService: 'Chrome Safe Storage', keychainAccount: 'Chrome'}
};
const SUPPORT = path.join(os.homedir(), 'Library/Application Support');
const SAME_SITE: Record<string, 'unspecified' | 'no_restriction' | 'lax' | 'strict'> = {'-1': 'unspecified', 0: 'no_restriction', 1: 'lax', 2: 'strict'};

const isGoogleHost = (host: string) => { const h = host.replace(/^\./, ''); return h === 'google.com' || h.endsWith('.google.com'); };
// Chromium stores times as microseconds since 1601-01-01.
const toUnixSeconds = (micros: bigint) => Number(micros) / 1e6 - 11644473600;

function cookiesPath(b: Browser): string | null {
  const base = path.join(SUPPORT, b.root, 'Default');
  return [path.join(base, 'Network/Cookies'), path.join(base, 'Cookies')].find(p => fs.existsSync(p)) ?? null;
}

export const availableBrowsers = () =>
  Object.entries(BROWSERS).filter(([, b]) => cookiesPath(b)).map(([id, b]) => ({id, label: b.label}));

// Triggers macOS's Keychain prompt; the user decides whether to allow it.
function keychainPassword(b: Browser): Promise<string> {
  return new Promise((resolve, reject) => execFile('security', ['find-generic-password', '-w', '-s', b.keychainService, '-a', b.keychainAccount], (err, stdout) => {
    if (err) reject(new Error('キーチェーンの鍵を読めませんでした（許可されなかった可能性があります）'));
    else resolve(stdout.trim());
  }));
}

function decrypt(encrypted: Buffer, key: Buffer, stripHostDigest: boolean): string | null {
  if (encrypted.subarray(0, 3).toString() !== 'v10') return null;
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '));
  const plain = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);
  // Cookie DB version 24+ prefixes the value with SHA-256(host_key).
  return (stripHostDigest ? plain.subarray(32) : plain).toString('utf8');
}

type Row = {host_key: string; name: string; value: string; encrypted_value: Uint8Array | null; path: string; expires_utc: bigint; is_secure: bigint; is_httponly: bigint; samesite: bigint; top_frame_site_key: string | null};

// The browser keeps its DB open, so read from a snapshot copy and delete it right after.
function readRows(file: string): {version: number; rows: Row[]} {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slipper-cookies-'));
  try {
    const copy = path.join(tmp, 'Cookies');
    fs.copyFileSync(file, copy);
    for (const suffix of ['-wal', '-journal']) if (fs.existsSync(file + suffix)) fs.copyFileSync(file + suffix, copy + suffix);
    // expires_utc exceeds Number.MAX_SAFE_INTEGER, so read integers as BigInt.
    const db = new DatabaseSync(copy, {readOnly: true, readBigInts: true});
    try {
      const version = Number((db.prepare("select value from meta where key = 'version'").get() as {value?: string} | undefined)?.value ?? 0);
      const rows = (db.prepare('select * from cookies').all() as unknown as Row[]).filter(r => isGoogleHost(r.host_key));
      return {version, rows};
    } finally { db.close(); }
  } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
}

export type ImportResult = {browser: string; imported: number; skipped: number; failed: number};

export async function importGoogleCookies(browserId: string, session: Session): Promise<ImportResult> {
  const browser = BROWSERS[browserId];
  if (!browser) throw new Error('対応していないブラウザです');
  const file = cookiesPath(browser);
  if (!file) throw new Error(`${browser.label} のCookieが見つかりません`);
  const {version, rows} = readRows(file);
  const key = crypto.pbkdf2Sync(await keychainPassword(browser), 'saltysalt', 1003, 16, 'sha1');
  const now = Date.now() / 1000;
  const result: ImportResult = {browser: browser.label, imported: 0, skipped: 0, failed: 0};
  for (const r of rows) {
    const expires = Number(r.expires_utc) ? toUnixSeconds(r.expires_utc) : null;
    if ((expires !== null && expires < now) || r.top_frame_site_key) { result.skipped++; continue; }
    let value: string | null = r.value;
    if (r.encrypted_value?.length) {
      try { value = decrypt(Buffer.from(r.encrypted_value), key, version >= 24); } catch { value = null; }
      if (value === null) { result.failed++; continue; }
    }
    const host = r.host_key.replace(/^\./, '');
    const hostOnly = !r.host_key.startsWith('.') || r.name.startsWith('__Host-');
    try {
      await session.cookies.set({
        url: `https://${host}${r.path || '/'}`, name: r.name, value, path: r.path || '/',
        ...(hostOnly ? {} : {domain: r.host_key}),
        secure: !!r.is_secure, httpOnly: !!r.is_httponly, sameSite: SAME_SITE[String(r.samesite)] ?? 'unspecified',
        ...(expires !== null ? {expirationDate: expires} : {})
      });
      result.imported++;
    } catch { result.failed++; }
  }
  await session.cookies.flushStore();
  return result;
}
