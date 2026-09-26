// Minimal Slipper MCP server for the spike: serves one page and collects variants.
// Localhost only, bearer token required. There is deliberately no tool that writes to Google Slides.
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';

const W = 960, H = 540;
const element = z.object({
  id: z.string().regex(/^[\w-]+$/),
  type: z.enum(['text', 'box', 'asset']).describe('asset = 元のページの素材（画像など）。assetId で参照し、中身は変えない'),
  text: z.string().optional(),
  assetId: z.string().optional(),
  x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive(),
  size: z.number().min(10).max(120).optional().describe('文字サイズ（px）'),
  role: z.string().optional().describe('色の役割名（例: ink, quiet, accent）'),
  invented: z.boolean().describe('元のページにない内容（架空の場面・例の数値など）なら true')
});
const variantInput = {
  requestId: z.string(),
  aim: z.string().min(4).max(80).describe('狙い：この案が聞き手に何をしようとしているか（1行）'),
  gaveUp: z.string().min(2).max(80).describe('捨てたもの：この案が諦めたこと（1行）'),
  elements: z.array(element).min(1).max(40)
};

export function startServer({requests}) {
  const token = randomBytes(24).toString('hex');
  const variants = [];

  function buildServer() {
    const server = new McpServer({name: 'slipper', version: '0.0.1'});
    server.registerTool('get_page', {
      description: 'Slipperで依頼されたページの内容、資料全体の「誰に・何を」、この依頼で試す見せ方の方針を返す',
      inputSchema: {requestId: z.string()}
    }, async ({requestId}) => {
      const r = requests.get(requestId);
      if (!r) return {isError: true, content: [{type: 'text', text: '不明な requestId です'}]};
      return {content: [{type: 'text', text: JSON.stringify({canvas: {width: W, height: H}, brief: r.brief, page: r.page, approach: r.approach, roles: r.roles})}]};
    });
    server.registerTool('submit_variant', {
      description: '案を1つ送る。座標は 960×540 のキャンバス上の px。形式や範囲に問題があればエラーを返すので、直して送り直す',
      inputSchema: variantInput
    }, async (v) => {
      const r = requests.get(v.requestId);
      if (!r) return {isError: true, content: [{type: 'text', text: '不明な requestId です'}]};
      const problems = v.elements.flatMap(e => [
        ...(e.x < 0 || e.y < 0 || e.x + e.w > W || e.y + e.h > H ? [`${e.id}: キャンバスからはみ出しています`] : []),
        ...(e.type === 'text' && !e.text ? [`${e.id}: text がありません`] : []),
        ...(e.type === 'asset' && !r.page.assets.some(a => a.id === e.assetId) ? [`${e.id}: 存在しない assetId です`] : [])
      ]);
      if (problems.length) return {isError: true, content: [{type: 'text', text: problems.join('\n')}]};
      variants.push({...v, approach: r.approach, receivedAt: Date.now()});
      return {content: [{type: 'text', text: '受け取りました'}]};
    });
    return server;
  }

  const http = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
    if (new URL(req.url, 'http://x').pathname !== '/mcp') { res.writeHead(404).end(); return; }
    // Stateless mode: a fresh server and transport per request.
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined});
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    let body = '';
    for await (const chunk of req) body += chunk;
    await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
  });

  return new Promise(resolve => http.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${http.address().port}/mcp`, token, variants, close: () => http.close()
  })));
}
