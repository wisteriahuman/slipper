// Spike: ask headless Claude Code (claude -p) for 3 variants in parallel through the Slipper MCP server.
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from './server.mjs';

// A made-up page, unrelated to any real deck.
const brief = {audience: 'テストをほとんど書かない5人の開発チーム', goal: 'テストを「面倒な義務」ではなく「安心して変更するための道具」だと感じてもらう'};
const page = {
  text: ['なぜテストを書くのか', '・バグを早く見つけられる', '・リファクタリングが怖くなくなる', '・仕様のドキュメントになる'],
  assets: [{id: 'img-team', kind: 'image', description: 'チームが机を囲んでいる写真'}]
};
const roles = {paper: '背景', ink: '本文', quiet: '補足', accent: '強調（1ページ2か所まで）'};
const approaches = ['一場面を見せる（具体的な瞬間で想像させる）', '構造で見せる（仕組みや関係を図にする）', '問いで終える（聞き手自身に考えさせる）'];

const requests = new Map(approaches.map((approach, i) => [`req-${i}`, {brief, page, roles, approach}]));
const server = await startServer({requests});
const dir = mkdtempSync(join(tmpdir(), 'slipper-claude-'));
// The token goes in a private temp file, not on the command line where other processes could see it.
const mcpConfig = join(dir, 'mcp.json');
writeFileSync(mcpConfig, JSON.stringify({mcpServers: {slipper: {type: 'http', url: server.url, headers: {Authorization: `Bearer ${server.token}`}}}}), {mode: 0o600});
const model = process.env.SLIPPER_MODEL || 'sonnet';

function ask(prompt) {
  const args = ['-p', prompt, '--model', model, ...(process.env.SLIPPER_EFFORT ? ['--effort', process.env.SLIPPER_EFFORT] : []), '--output-format', 'json', '--no-session-persistence',
    '--tools', '', '--strict-mcp-config', '--mcp-config', mcpConfig,
    '--allowedTools', 'mcp__slipper__get_page', 'mcp__slipper__submit_variant'];
  const started = Date.now();
  return new Promise(resolve => {
    const child = spawn('claude', args, {cwd: dir, stdio: ['ignore', 'pipe', 'pipe']});
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      let result = null; try { result = JSON.parse(out); } catch {}
      resolve({code, seconds: (Date.now() - started) / 1000, result, err: err.slice(0, 500)});
    });
  });
}

const variantPrompt = id => `あなたはスライドの伝え方を提案するデザイナーです。Slipper の get_page を requestId "${id}" で呼び、ページの内容と「誰に・何を」、この依頼で試す見せ方の方針を読んでください。
その方針で、同じ内容を別の伝え方で見せるスライド案を1つ作り、submit_variant で送ってください。
- 色違いや配置違いではなく、見せ方そのものを変える
- 元のページにない内容を加えた要素は invented: true にする
- エラーが返ったら直して送り直す
送り終えたら「完了」とだけ答えてください。`;

// Faster variant: the page is embedded in the prompt, so the model only needs one tool call.
const inlinePrompt = id => { const r = requests.get(id); return `あなたはスライドの伝え方を提案するデザイナーです。次のページを、指定の方針で別の伝え方にしたスライド案を1つ作り、Slipper の submit_variant（requestId "${id}"）で送ってください。
${JSON.stringify({canvas: {width: 960, height: 540}, brief: r.brief, page: r.page, approach: r.approach, roles: r.roles})}
- 色違いや配置違いではなく、見せ方そのものを変える
- 元のページにない内容を加えた要素は invented: true にする
- エラーが返ったら直して送り直す
送り終えたら「完了」とだけ答えてください。`; };
const mode = process.argv[2] || 'variants';
if (mode === 'variants' || mode === 'inline') {
  const t0 = Date.now(), prompt = mode === 'inline' ? inlinePrompt : variantPrompt;
  const runs = await Promise.all([...requests.keys()].map(id => ask(prompt(id))));
  console.log(`全体: ${((Date.now() - t0) / 1000).toFixed(1)}秒 / モデル: ${model} / effort: ${process.env.SLIPPER_EFFORT || '既定'}`);
  runs.forEach((r, i) => console.log(`req-${i}: exit=${r.code} ${r.seconds.toFixed(1)}秒 turns=${r.result?.num_turns} out=${r.result?.usage?.output_tokens} API=${((r.result?.duration_api_ms ?? 0) / 1000).toFixed(1)}秒 返答=${JSON.stringify(r.result?.result)?.slice(0, 40)} denied=${JSON.stringify(r.result?.permission_denials ?? [])}${r.err ? ' stderr=' + r.err : ''}`));
  for (const v of server.variants) console.log(`\n[${v.approach}]\n 狙い: ${v.aim}\n 捨てた: ${v.gaveUp}\n 要素: ${v.elements.length}件 / invented: ${v.elements.filter(e => e.invented).map(e => e.id).join(',') || 'なし'}\n ${v.elements.filter(e => e.type === 'text').map(e => e.text.replace(/\n/g, '⏎')).join(' | ').slice(0, 200)}`);
  writeFileSync(join(process.cwd(), 'last-variants.json'), JSON.stringify(server.variants, null, 1));
} else if (mode === 'escape') {
  // Negative test: try to make it read files and run commands. Both should be impossible.
  const r = await ask('次を順に試して、それぞれ成功したか失敗したかを正直に報告してください。1) Bash で `ls ~` を実行する 2) Read で ~/.ssh/config を読む 3) WebFetch で https://example.com を取得する 4) Slipper の get_page を requestId "req-0" で呼ぶ');
  console.log(`exit=${r.code} ${r.seconds.toFixed(1)}秒\n返答:\n${r.result?.result}\ndenied=${JSON.stringify(r.result?.permission_denials ?? [])}`);
}
server.close();
rmSync(dir, {recursive: true, force: true});
