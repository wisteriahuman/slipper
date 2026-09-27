// Asks headless Claude Code (claude -p) for variants through Slipper's MCP server.
// No API key: Claude Code uses the user's own sign-in. The spawned process gets no built-in tools
// (--tools "") and only Slipper's MCP server (--strict-mcp-config); verified in spikes/claude-mcp.
import {spawn, type ChildProcess} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export type RunSettings = {model: string; fallbackModel: string; effort: 'medium' | 'high'};
export const DEFAULT_SETTINGS: RunSettings = {model: 'sonnet', fallbackModel: 'opus', effort: 'medium'};

export type SubmitTool = 'submit_text_refinement_review' | 'submit_text_refinement' | 'submit_variant_review' | 'submit_proposal_plan' | 'submit_variant' | 'submit_storyline' | 'submit_deck_reading' | 'submit_page_reading';

export type RunResult = {ok: boolean; seconds: number; models: string[]; error?: string};
// Progress worth showing while waiting: the AI service being busy is common and otherwise looks like a hang.
export type RunProgress = {kind: 'retry'; attempt: number; maxRetries: number; status: number | null};

type StreamEvent = {type?: string; subtype?: string; attempt?: number; max_retries?: number; error_status?: number; is_error?: boolean; result?: string; modelUsage?: Record<string, unknown>};

export class ClaudeRunner {
  private dir = mkdtempSync(join(tmpdir(), 'slipper-claude-'));
  private configFile = join(this.dir, 'mcp.json');
  private running = new Set<ChildProcess>();

  constructor(mcpUrl: string, token: string) {
    // The token lives in a private file rather than on the command line, where other processes could read it.
    writeFileSync(this.configFile, JSON.stringify({mcpServers: {slipper: {type: 'http', url: mcpUrl, headers: {Authorization: `Bearer ${token}`}}}}), {mode: 0o600});
  }

  run(prompt: string, settings: RunSettings, tool: SubmitTool, onProgress: (p: RunProgress) => void = () => {}, timeoutMs = 240_000): Promise<RunResult> {
    // --fallback-model: when the main model is overloaded, Claude Code switches instead of retrying for minutes.
    const args = ['-p', prompt, '--model', settings.model, '--fallback-model', settings.fallbackModel, '--effort', settings.effort,
      '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
      '--tools', '', '--strict-mcp-config', '--mcp-config', this.configFile, '--allowedTools', `mcp__slipper__${tool}`, 'mcp__slipper__get_page_images', ...(tool === 'submit_variant' ? ['mcp__slipper__preview_variant', 'mcp__slipper__search_library'] : []), ...(tool === 'submit_proposal_plan' ? ['mcp__slipper__search_library'] : [])];
    const started = Date.now();
    return new Promise(resolve => {
      const child = spawn('claude', args, {cwd: this.dir, stdio: ['ignore', 'pipe', 'pipe']});
      this.running.add(child);
      let buffer = '', err = '', final: StreamEvent | null = null;
      const onLine = (line: string) => {
        let ev: StreamEvent;
        try { ev = JSON.parse(line); } catch { return; }
        if (ev.type === 'system' && ev.subtype === 'api_retry') onProgress({kind: 'retry', attempt: ev.attempt ?? 0, maxRetries: ev.max_retries ?? 0, status: ev.error_status ?? null});
        if (ev.type === 'result') final = ev;
      };
      child.stdout?.on('data', d => {
        buffer += d;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(onLine);
      });
      child.stderr?.on('data', d => { err += d; });
      const timer = setTimeout(() => child.kill(), timeoutMs);
      child.on('error', e => { err += e.message; });
      child.on('close', code => {
        clearTimeout(timer);
        this.running.delete(child);
        if (buffer) onLine(buffer);
        const seconds = (Date.now() - started) / 1000;
        const result = final as StreamEvent | null;
        const models = Object.keys(result?.modelUsage ?? {});
        if (code === 0 && result && !result.is_error) { resolve({ok: true, seconds, models}); return; }
        const error = /ENOENT/.test(err) ? 'Claude Code が見つかりません（claude コマンドをインストールしてください）'
          : code === null || code === 143 ? `${Math.round(seconds)}秒待っても終わらなかったため打ち切りました`
          : (result?.result ?? err.trim()) || `終了コード ${code}`;
        resolve({ok: false, seconds, models, error});
      });
    });
  }

  cancelAll() { for (const c of this.running) c.kill(); }

  dispose() { this.cancelAll(); rmSync(this.dir, {recursive: true, force: true}); }
}
