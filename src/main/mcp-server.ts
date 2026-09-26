// Slipper's MCP server. Runs only while the app is open, on 127.0.0.1, behind a bearer token.
// It lets an AI read the current page and send variants. There is deliberately no tool that
// writes to Google Slides: putting a variant into the deck is always the user's action.
import {randomBytes} from 'node:crypto';
import {createServer, type Server} from 'node:http';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
import {VariantReviewShape, type VariantReview} from '@shared/variant-review';
import {PlanInputShape, type PlanInput} from '@shared/proposal-plan';
import type {PreviewResult} from './variant-preview';
import {VariantInputShape, type VariantInput} from '@shared/element';
import {StorylineInputShape, type StorylineInput} from '@shared/storyline';
import {DeckReadingInputShape, PageReadingInputShape, type DeckReadingInput, type PageReadingInput} from '@shared/reading';

export type McpHandlers = {
  // Creates a conversation request for the page shown in the editor and returns what the AI needs.
  currentPage(direction: string | undefined): Promise<object>;
  // Validates and stores a variant; returns problems for the AI to fix, or [] when accepted.
  submitVariantReview(input: VariantReview): Promise<string[]>;
  submitProposalPlan(input: PlanInput): Promise<string[]>;
  previewVariant(input: VariantInput): Promise<PreviewResult & {previewToken?: string}>;
  submitVariant(input: VariantInput & {previewToken?: string; visualReview?: string}): Promise<string[]>;
  // Validates and stores a storyline for the whole deck.
  submitStoryline(input: StorylineInput): Promise<string[]>;
  // Readings of the current deck and page, for comparing proposals against.
  submitDeckReading(input: DeckReadingInput): Promise<string[]>;
  submitPageReading(input: PageReadingInput): Promise<string[]>;
  // Rendered images of the pages a request is about, so the AI sees charts, highlights and sequences.
  pageImages(requestId: string): Promise<Array<{label: string; base64: string; mimeType: string}>>;
};

const text = (t: string, isError = false) => ({content: [{type: 'text' as const, text: t}], ...(isError ? {isError: true} : {})});

export class SlipperMcpServer {
  readonly token = randomBytes(24).toString('hex');
  private http: Server | null = null;
  url = '';

  constructor(private handlers: McpHandlers) {}

  private build() {
    const server = new McpServer({name: 'slipper', version: '0.1.0'});
    server.registerTool('get_current_page', {
      description: 'Slipper の左側で表示中のスライドの内容、資料全体の「誰に・何を」、使える色と意味、そのページで既に出た案の狙いを返す。呼ぶと依頼が1件記録され、submit_variant に渡す requestId が発行される',
      inputSchema: {direction: z.string().max(200).optional().describe('利用者から伝えられた一言の方向（任意）')}
    }, async ({direction}) => {
      try { return text(JSON.stringify(await this.handlers.currentPage(direction))); }
      catch (e) { return text((e as Error).message, true); }
    });
    server.registerTool('get_page_images', {
      description: '依頼の対象ページの画像を返す（1枚の依頼ならそのページ、資料全体の依頼なら全ページ）。文字だけでは分からない図・グラフ・強調・前後のページの連続を確かめるために使う',
      inputSchema: {requestId: z.string()}
    }, async ({requestId}) => {
      try {
        const images = await this.handlers.pageImages(requestId);
        if (!images.length) return text('画像を取得できませんでした', true);
        return {content: images.flatMap(i => [{type: 'text' as const, text: i.label}, {type: 'image' as const, data: i.base64, mimeType: i.mimeType}])};
      } catch (e) { return text((e as Error).message, true); }
    });
    server.registerTool('submit_variant_review', {description:'画像と元資料を照合した見直しの結果を送る', inputSchema:VariantReviewShape}, async input => {
      const problems = await this.handlers.submitVariantReview(input);
      return problems.length ? text(problems.join('\n'),true) : text('見直しを受け取りました');
    });
    server.registerTool('submit_proposal_plan', {
      description: '内容と画像を踏まえて、狙い・根拠・見せ方の異なる3案をまとめて選ぶ', inputSchema: PlanInputShape
    }, async input => { const problems = await this.handlers.submitProposalPlan(input); return problems.length ? text(problems.join('\n'), true) : text('狙いを受け取りました'); });
    server.registerTool('preview_variant', {
      description: '案を画像として描画する。画像を見て狙い・文字切れ・注目先・手法を確認し、必要なら修正して再度呼ぶ。最後のpreviewTokenを提出に添える', inputSchema: VariantInputShape
    }, async input => {
      try {
        const result = await this.handlers.previewVariant(input);
        return {content: [{type: 'text' as const, text: JSON.stringify({problems: result.problems, previewToken: result.previewToken, instruction: '各画像を見て狙いが実現した箇所を確認。問題があれば修正して再描画する'})}, ...result.images.flatMap(i => [{type: 'text' as const, text: i.label}, {type: 'image' as const, data: i.base64, mimeType: i.mimeType}])], ...(result.problems.length ? {isError: true} : {})};
      } catch (e) { return text((e as Error).message, true); }
    });
    server.registerTool('submit_variant', {
      description: '伝え方の案を1つ送る。座標は 960×540 のキャンバス上の px。色はテーマ色の名前で指定し、意味の決まっていない強調色は使えない。問題があればエラーが返るので、直して送り直す',
      inputSchema: {...VariantInputShape, previewToken: z.string(), visualReview: z.string().min(8).max(1000)}
    }, async (input) => {
      const problems = await this.handlers.submitVariant(input);
      return problems.length ? text(problems.join('\n'), true) : text('受け取りました');
    });
    server.registerTool('submit_storyline', {
      description: '資料全体の流れの案を1つ送る。各ページは元のページを使う（keep）・まとめる（merge）・新しく作る（new）のどれか。問題があればエラーが返るので、直して送り直す',
      inputSchema: StorylineInputShape
    }, async (input) => {
      const problems = await this.handlers.submitStoryline(input);
      return problems.length ? text(problems.join('\n'), true) : text('受け取りました');
    });
    server.registerTool('submit_deck_reading', {
      description: '今の資料の流れの読み解きを送る。すべてのページを資料の順番どおりに、ちょうど1つのまとまりに入れる。良し悪しは書かない',
      inputSchema: DeckReadingInputShape
    }, async (input) => {
      const problems = await this.handlers.submitDeckReading(input);
      return problems.length ? text(problems.join('\n'), true) : text('受け取りました');
    });
    server.registerTool('submit_page_reading', {
      description: '今のページの読み解き（狙いと諦めていること）を送る。良し悪しは書かない',
      inputSchema: PageReadingInputShape
    }, async (input) => {
      const problems = await this.handlers.submitPageReading(input);
      return problems.length ? text(problems.join('\n'), true) : text('受け取りました');
    });
    return server;
  }

  start(port = 0): Promise<void> {
    this.http = createServer(async (req, res) => {
      if (req.headers.authorization !== `Bearer ${this.token}`) { res.writeHead(401).end(); return; }
      if (new URL(req.url ?? '/', 'http://127.0.0.1').pathname !== '/mcp') { res.writeHead(404).end(); return; }
      // Stateless mode: a fresh server and transport per HTTP request.
      const server = this.build();
      const transport = new StreamableHTTPServerTransport({sessionIdGenerator: undefined});
      res.on('close', () => { void transport.close(); void server.close(); });
      try {
        await server.connect(transport);
        let body = '';
        for await (const chunk of req) body += chunk;
        await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
      } catch {
        if (!res.headersSent) res.writeHead(400).end();
      }
    });
    return new Promise(resolve => this.http!.listen(port, '127.0.0.1', () => {
      const address = this.http!.address();
      this.url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}/mcp`;
      resolve();
    }));
  }

  stop() { this.http?.close(); }
}
