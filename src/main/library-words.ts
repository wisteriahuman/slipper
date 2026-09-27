// Japanese words common on slides, mapped to the English names and tags used by the bundled icons.
// Lucide is tagged in English only; without this, a Japanese query finds no icon at all.
// Keys are matched inside query words too (参加人数 contains 人数), longest first.
export const JA_TO_EN: Record<string, string[]> = {
  // People and organizations
  '人': ['user', 'person'], '人物': ['user', 'person'], '人数': ['users', 'people'], '参加者': ['users', 'people'], '利用者': ['user'], 'ユーザー': ['user'],
  '顧客': ['user', 'customer'], 'お客様': ['user', 'customer'], '社員': ['user', 'employee'], '担当者': ['user'], '上長': ['user', 'manager'], '管理者': ['user', 'shield'],
  'チーム': ['users', 'group', 'team'], 'グループ': ['users', 'group'], '組織': ['network', 'building'], '家族': ['users', 'family'], '車いす': ['wheelchair', 'accessibility'], 'バリアフリー': ['accessibility', 'wheelchair'], '子ども': ['baby', 'child'], '高齢者': ['user'],
  '会社': ['building', 'company', 'office'], 'オフィス': ['building', 'office'], '企業': ['building', 'company'], '店': ['store', 'shop'], '店舗': ['store', 'shop'], '工場': ['factory'],
  '学校': ['school'], '大学': ['school', 'graduation'], '病院': ['hospital'], '家': ['house', 'home'], '自宅': ['house', 'home'], '会議室': ['door-open', 'presentation', 'building'],
  // Time and schedule
  '時間': ['clock', 'time'], '時刻': ['clock', 'time'], '期間': ['calendar', 'hourglass'], '期限': ['calendar', 'deadline', 'alarm'], '締め切り': ['calendar', 'alarm', 'deadline'],
  '予定': ['calendar', 'schedule', 'event'], '予約': ['calendar', 'booking', 'reservation'], '日付': ['calendar', 'date'], '日程': ['calendar', 'schedule'], 'カレンダー': ['calendar'],
  '毎日': ['calendar', 'daily'], '週': ['calendar', 'week'], '月': ['calendar', 'month'], '年': ['calendar', 'year'], '待つ': ['hourglass', 'clock', 'wait'], '待ち時間': ['hourglass', 'clock'],
  '速い': ['zap', 'fast', 'speed', 'rocket'], '速さ': ['gauge', 'speed', 'zap'], '遅い': ['snail', 'slow'], '短縮': ['zap', 'timer'], '履歴': ['history'], '過去': ['history'], '未来': ['rocket', 'future'],
  // Actions and UI
  '押す': ['click', 'pointer', 'press'], 'クリック': ['click', 'pointer'], 'タップ': ['pointer', 'touch', 'click'], '選ぶ': ['pointer', 'select', 'click'], '選択': ['select', 'pointer', 'check'],
  '入力': ['keyboard', 'input', 'type', 'pencil'], '書く': ['pencil', 'pen', 'write'], '記入': ['pencil', 'pen', 'form'], '編集': ['pencil', 'edit'], '修正': ['pencil', 'edit', 'wrench'],
  '確定': ['check', 'confirm', 'done'], '確認': ['check', 'eye', 'search'], '完了': ['check', 'done', 'complete'], '承認': ['check', 'badge-check', 'stamp', 'approve'], '合格': ['check', 'badge-check'],
  '却下': ['x', 'ban', 'reject'], '差し戻し': ['undo', 'arrow-left', 'rotate-ccw'], 'やり直し': ['rotate-ccw', 'undo', 'refresh'], '取り消し': ['x', 'undo', 'cancel'], 'キャンセル': ['x', 'cancel'],
  '削除': ['trash', 'delete', 'remove'], '追加': ['plus', 'add'], '送る': ['send'], '送信': ['send'], '受け取る': ['inbox', 'download'], '受信': ['inbox'], '返信': ['reply'],
  '共有': ['share'], '保存': ['save'], 'ダウンロード': ['download'], 'アップロード': ['upload'], '印刷': ['printer', 'print'], 'コピー': ['copy'], '貼り付け': ['clipboard', 'paste'],
  '検索': ['search', 'find'], '探す': ['search', 'find'], '調べる': ['search', 'microscope'], '見る': ['eye', 'view'], '表示': ['eye', 'monitor'], '非表示': ['eye-off'], '隠す': ['eye-off'],
  'ログイン': ['log-in', 'key'], 'ログアウト': ['log-out'], '登録': ['user-plus', 'clipboard-pen', 'register'], '申請': ['file-pen', 'send', 'clipboard'], '申し込み': ['clipboard-pen', 'file-pen'],
  '支払う': ['credit-card', 'wallet', 'pay'], '支払い': ['credit-card', 'wallet', 'payment'], '購入': ['shopping-cart', 'shopping-bag', 'buy'], '買う': ['shopping-cart', 'buy'], '売る': ['store', 'tag', 'sell'],
  '移動': ['move', 'arrow-right', 'navigation'], '進む': ['arrow-right', 'forward'], '戻る': ['arrow-left', 'undo', 'back'], '開始': ['play', 'start'], '始める': ['play', 'rocket'], '停止': ['pause', 'stop'], '終了': ['flag', 'square', 'stop'],
  '話す': ['message-circle', 'mic', 'speech'], '会話': ['messages-square', 'message-circle', 'chat'], '相談': ['messages-square', 'message-circle', 'chat'], '問い合わせ': ['message-circle', 'headset', 'help', 'contact'],
  '聞く': ['ear', 'headphones', 'listen'], '発表': ['presentation', 'mic'], 'プレゼン': ['presentation'], '会議': ['users', 'presentation', 'video'], '打ち合わせ': ['users', 'messages-square'],
  '学ぶ': ['graduation', 'book-open', 'school', 'learn'], '勉強': ['book-open', 'graduation', 'study'], '教える': ['presentation', 'school', 'teach'], '読む': ['book-open', 'read'], '考える': ['brain', 'lightbulb', 'think'],
  'つなぐ': ['link', 'plug', 'connect'], '接続': ['link', 'plug', 'wifi', 'connect'], '連携': ['link', 'workflow', 'plug'], '設定': ['settings', 'cog', 'sliders'], '調整': ['sliders', 'settings', 'adjust'],
  // Things and devices
  'メール': ['mail', 'email'], '手紙': ['mail', 'letter'], '通知': ['bell', 'notification'], 'お知らせ': ['bell', 'megaphone'], '電話': ['phone', 'call'], 'スマホ': ['smartphone', 'phone', 'mobile'],
  'スマートフォン': ['smartphone', 'mobile'], '携帯': ['smartphone', 'mobile'], 'パソコン': ['laptop', 'monitor', 'computer'], 'PC': ['laptop', 'monitor', 'computer'], '画面': ['monitor', 'screen', 'app-window'],
  'アプリ': ['smartphone', 'app-window', 'app'], 'ウェブ': ['globe', 'web', 'browser'], 'サイト': ['globe', 'web', 'browser'], 'インターネット': ['globe', 'wifi', 'internet'], 'クラウド': ['cloud'],
  'サーバー': ['server'], 'データ': ['database', 'data'], 'データベース': ['database'], 'ファイル': ['file'], '書類': ['file', 'document', 'clipboard'], '資料': ['file', 'document', 'presentation'],
  '文書': ['file', 'document'], '契約': ['file-signature', 'handshake', 'contract', 'signature'], '署名': ['signature', 'pen'], 'フォルダ': ['folder'], 'リスト': ['list'], '一覧': ['list', 'table'], '表': ['table'],
  'グラフ': ['chart', 'graph'], '図': ['chart', 'shapes'], '地図': ['map'], '場所': ['map-pin', 'location', 'map'], '住所': ['map-pin', 'address'], '道': ['route', 'map'], 'ルート': ['route'],
  '鍵': ['key', 'lock'], 'パスワード': ['key', 'lock', 'password'], 'カメラ': ['camera'], '写真': ['image', 'camera', 'photo'], '画像': ['image'], '動画': ['video', 'film'], '音声': ['mic', 'volume', 'audio'],
  '本': ['book'], 'ノート': ['notebook'], 'メモ': ['notebook-pen', 'sticky-note', 'note'], 'カード': ['credit-card', 'card'], 'レシート': ['receipt'], '請求書': ['receipt', 'file-text', 'invoice'],
  '車': ['car'], '電車': ['train-front', 'train'], '飛行機': ['plane'], '自転車': ['bike'], '荷物': ['package', 'box'], '配送': ['truck', 'package', 'delivery'], '在庫': ['package', 'warehouse', 'boxes'],
  'ロボット': ['bot'], 'AI': ['bot', 'sparkles', 'brain'], '人工知能': ['bot', 'brain', 'sparkles'], 'ツール': ['wrench', 'hammer', 'tool'], '道具': ['wrench', 'hammer', 'tool'],
  // Money and business
  'お金': ['wallet', 'coins', 'banknote', 'money'], '費用': ['wallet', 'coins', 'money', 'cost'], 'コスト': ['coins', 'money', 'cost'], '料金': ['coins', 'banknote', 'money', 'price'], '価格': ['tag', 'price', 'coins'],
  '売上': ['chart-line', 'trending-up', 'money', 'sales'], '利益': ['trending-up', 'coins', 'profit'], '予算': ['wallet', 'piggy-bank', 'budget'], '節約': ['piggy-bank', 'savings'], '円': ['japanese-yen', 'yen'],
  '投資': ['trending-up', 'coins', 'invest'], '取引': ['handshake', 'deal'], '契約書': ['file-signature', 'contract'], '商品': ['package', 'shopping-bag', 'product'], 'サービス': ['handshake', 'hand-helping', 'service'],
  // Change, comparison and quantity
  '増加': ['trending-up', 'arrow-up', 'increase', 'growth'], '増える': ['trending-up', 'arrow-up', 'increase'], '成長': ['trending-up', 'sprout', 'growth'], '上昇': ['trending-up', 'arrow-up', 'rise'],
  '減少': ['trending-down', 'arrow-down', 'decrease'], '減る': ['trending-down', 'arrow-down', 'decrease'], '低下': ['trending-down', 'arrow-down'], '改善': ['trending-up', 'sparkles', 'wrench', 'improve'],
  '比較': ['scale', 'git-compare', 'compare', 'columns'], 'バランス': ['scale', 'balance'], '変化': ['refresh', 'shuffle', 'change'], '循環': ['refresh', 'repeat', 'recycle', 'cycle'], '繰り返し': ['repeat', 'refresh'],
  '手順': ['list-ordered', 'footprints', 'steps', 'route', 'workflow'], '流れ': ['workflow', 'arrow-right', 'route', 'flow'], 'ステップ': ['list-ordered', 'footprints', 'steps'], '工程': ['workflow', 'list-ordered'],
  '順番': ['list-ordered', 'arrow-down-1-0'], '計算': ['calculator'], '数': ['hash', 'calculator'], '割合': ['percent', 'chart-pie'], 'パーセント': ['percent'], '平均': ['chart-bar', 'sigma'], '合計': ['sigma'],
  // Evaluation and states
  '目標': ['target', 'goal', 'flag'], 'ゴール': ['target', 'goal', 'flag', 'trophy'], '目的': ['target', 'goal'], '成果': ['trophy', 'award', 'chart-line'], '成功': ['trophy', 'check', 'party-popper', 'success'],
  '失敗': ['x', 'circle-x', 'triangle-alert', 'fail'], '問題': ['triangle-alert', 'circle-alert', 'bug', 'problem'], '課題': ['circle-alert', 'clipboard-list', 'target', 'issue'], '原因': ['search', 'microscope', 'circle-help'],
  '注意': ['triangle-alert', 'alert', 'warning'], '警告': ['triangle-alert', 'alert', 'warning'], '危険': ['triangle-alert', 'skull', 'danger'], 'エラー': ['circle-x', 'bug', 'error'], '禁止': ['ban', 'forbidden'],
  '安全': ['shield', 'shield-check', 'lock', 'security', 'safe'], 'セキュリティ': ['shield', 'lock', 'security'], '守る': ['shield', 'protect'], '保護': ['shield', 'lock', 'protect'], '安心': ['shield-check', 'heart', 'smile'],
  '質問': ['circle-help', 'question', 'help'], '疑問': ['circle-help', 'question'], 'ヘルプ': ['circle-help', 'life-buoy', 'help'], '情報': ['info'], 'ヒント': ['lightbulb', 'info', 'hint'],
  'アイデア': ['lightbulb', 'idea', 'sparkles'], 'ひらめき': ['lightbulb', 'sparkles', 'idea'], '発見': ['lightbulb', 'search', 'telescope'], '新しい': ['sparkles', 'new'], '新規': ['plus', 'sparkles', 'new'],
  '好き': ['heart', 'thumbs-up', 'like'], 'いいね': ['thumbs-up', 'heart', 'like'], '嫌い': ['thumbs-down', 'dislike'], '評価': ['star', 'rating', 'thumbs-up'], 'レビュー': ['star', 'message-square', 'review'],
  '満足': ['smile', 'thumbs-up', 'satisfied'], '不満': ['frown', 'thumbs-down', 'angry'], '笑顔': ['smile', 'laugh'], '悲しい': ['frown', 'sad'], '驚き': ['sparkles', 'zap', 'surprise'],
  '人気': ['flame', 'star', 'popular'], 'おすすめ': ['star', 'thumbs-up', 'award', 'recommend'], '品質': ['badge-check', 'award', 'gem', 'quality'], '重要': ['star', 'triangle-alert', 'flag', 'important'],
  'ランキング': ['trophy', 'medal', 'chart-bar', 'ranking'], '一位': ['trophy', 'medal', 'crown'], '勝つ': ['trophy', 'crown', 'win'], '賞': ['award', 'trophy', 'medal'],
  '健康': ['heart-pulse', 'activity', 'health'], '医療': ['stethoscope', 'hospital', 'heart-pulse', 'medical'], '環境': ['leaf', 'globe', 'tree', 'recycle'], '自然': ['leaf', 'tree', 'mountain', 'nature'],
  '天気': ['sun', 'cloud', 'weather'], '世界': ['globe', 'world'], '海外': ['globe', 'plane'], '地域': ['map', 'map-pin'], '言語': ['languages', 'globe'], '翻訳': ['languages'],
  'ルール': ['scale', 'book', 'gavel', 'rule'], '法律': ['scale', 'gavel', 'law'], '仕組み': ['cog', 'workflow', 'network'], '全体': ['layout-grid', 'globe', 'network'], '部分': ['puzzle', 'piece'],
  '協力': ['handshake', 'users', 'cooperation'], '支援': ['hand-helping', 'heart-handshake', 'support'], '感謝': ['heart', 'hand-heart', 'thanks'], 'つながり': ['link', 'network', 'users']
};

// English words the AI tends to use that the icon tags express differently.
export const EN_TO_EN: Record<string, string[]> = {
  growth: ['trending-up', 'sprout'], increase: ['trending-up', 'arrow-up'], rise: ['trending-up'], decrease: ['trending-down', 'arrow-down'], decline: ['trending-down'], drop: ['trending-down'],
  people: ['users'], team: ['users'], person: ['user'], customer: ['user'], employee: ['user'], confirm: ['check'], done: ['check'], complete: ['check'], approve: ['check', 'badge-check'],
  press: ['pointer', 'click'], tap: ['pointer', 'click'], select: ['pointer', 'click'], office: ['building'], company: ['building'], home: ['house'], money: ['wallet', 'coins'], cost: ['coins', 'wallet'],
  price: ['tag', 'coins'], fast: ['zap', 'gauge'], speed: ['gauge', 'zap'], quick: ['zap'], warning: ['triangle-alert'], danger: ['triangle-alert'], caution: ['triangle-alert'], security: ['shield', 'lock'],
  safe: ['shield'], question: ['circle-help'], help: ['circle-help'], idea: ['lightbulb'], goal: ['target'], chat: ['message-circle'], contact: ['message-circle', 'phone'], document: ['file', 'file-text'],
  delete: ['trash'], remove: ['trash', 'x'], location: ['map-pin'], place: ['map-pin'], schedule: ['calendar'], booking: ['calendar'], reservation: ['calendar'], rating: ['star'], like: ['heart', 'thumbs-up'],
  steps: ['list-ordered', 'footprints'], process: ['workflow'], flow: ['workflow'], compare: ['scale', 'git-compare'], data: ['database'], school: ['school', 'graduation-cap'], learn: ['graduation-cap', 'book-open']
};
