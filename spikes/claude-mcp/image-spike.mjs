// Spike: can headless Claude Code see an image returned by an MCP tool?
import {createServer} from 'node:http';
import {readFileSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';

const image = readFileSync(process.argv[2]).toString('base64');
let answer = null;
const build = () => {
  const s = new McpServer({name: 'slipper', version: '0'});
  s.registerTool('get_page_image', {description: 'スライドの画像を返す', inputSchema: {}}, async () => ({content: [{type: 'image', data: image, mimeType: 'image/png'}]}));
  s.registerTool('answer', {description: '答えを送る', inputSchema: {text: z.string()}}, async ({text}) => { answer = text; return {content: [{type: 'text', text: 'ok'}]}; });
  return s;
};
const http = createServer(async (req, res) => {
  const s = build(), t = new StreamableHTTPServerTransport({sessionIdGenerator: undefined});
  res.on('close', () => { t.close(); s.close(); });
  await s.connect(t); let body = ''; for await (const c of req) body += c;
  await t.handleRequest(req, res, body ? JSON.parse(body) : undefined);
});
await new Promise(r => http.listen(0, '127.0.0.1', r));
const dir = mkdtempSync(join(tmpdir(), 'img-spike-')), cfg = join(dir, 'mcp.json');
writeFileSync(cfg, JSON.stringify({mcpServers: {slipper: {type: 'http', url: `http://127.0.0.1:${http.address().port}/mcp`}}}));
const t0 = Date.now();
const child = spawn('claude', ['-p', 'get_page_image でスライドの画像を見て、何が描かれているか（図の種類、線の形、注目を示す装飾があるか）を2〜3文で answer ツールに送ってください。', '--model', 'sonnet', '--fallback-model', 'opus', '--effort', 'medium', '--output-format', 'json', '--no-session-persistence', '--tools', '', '--strict-mcp-config', '--mcp-config', cfg, '--allowedTools', 'mcp__slipper__get_page_image', 'mcp__slipper__answer'], {cwd: dir, stdio: ['ignore', 'pipe', 'pipe']});
let out = ''; child.stdout.on('data', d => out += d);
child.on('close', code => { console.log('exit', code, ((Date.now() - t0) / 1000).toFixed(1) + 's'); console.log('answer:', answer); http.close(); });
