const $ = id => document.getElementById(id);
const show = v => {
  $('presentation').textContent = v.presentation ?? '（資料を開いていません）';
  $('slide').textContent = v.slide ?? '（ページ未特定）';
  $('url').textContent = v.url;
  if (v.ua) $('ua').textContent = v.ua;
};
const log = m => { $('log').textContent = `${new Date().toLocaleTimeString()} ${m}\n` + $('log').textContent; };
window.slipper.onLocation(v => { show(v); log(`移動: ${v.host ?? ''} page=${v.slide ?? '-'}`); });
window.slipper.onLog(log);
window.slipper.browsers().then(list => {
  $('browsers').innerHTML = '';
  for (const b of list) {
    const btn = document.createElement('button');
    btn.textContent = `${b.label} から取り込む`;
    btn.style.marginRight = '8px';
    btn.onclick = async () => {
      $('importResult').textContent = '取り込み中…（キーチェーンの確認を待っています）';
      const r = await window.slipper.importCookies(b.id);
      $('importResult').innerHTML = r.ok ? `<span class="ok">${r.browser} から ${r.imported} 件を取り込みました</span>（スキップ ${r.skipped}・失敗 ${r.failed}）` : `<span class="ng">${r.reason}</span>`;
      log(r.ok ? `取り込み: ${r.imported}件` : `取り込み失敗: ${r.reason}`);
    };
    $('browsers').append(btn);
  }
  if (!list.length) $('browsers').textContent = '対応ブラウザ（Arc / Chrome）が見つかりません';
});
$('probe').onclick = async () => {
  const r = await window.slipper.probe();
  show(r);
  $('signedIn').innerHTML = r.signedIn ? '<span class="ok">ログイン済み</span>' : '<span class="ng">未ログイン</span>';
  $('ua').textContent = r.navigatorUA.includes('Firefox') ? 'Firefox（ログイン画面用）' : r.navigatorUA.includes('Electron') ? 'Electron（未調整）' : 'Chrome';
  log(`確認: signedIn=${r.signedIn}`);
};
