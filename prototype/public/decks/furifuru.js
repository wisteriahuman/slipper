// Example deck: an explanation of "フリふる" (a service for sharing free time with friends).
// A deck is plain data — colors as named roles, rules with their reasons, and pages with variants.
const colors = {
  paper:{hex:'#f5f3ec',name:'紙',means:'全ページ共通の背景。濃い面の上の文字にも使う。'},
  ink:{hex:'#23282a',name:'墨',means:'読んでほしい言葉と、起きたこと。'},
  quiet:{hex:'#6e716a',name:'控え',means:'補足と、まだ起きていないこと（返事待ち・予定あり）。'},
  line:{hex:'#dedbd1',name:'線',means:'構造の面や軸。それ自体は意味を持たない。'},
  free:{hex:'#cf4a22',name:'空き',means:'「いま空いている・つながれる」だけを表す。'}
};
const rules = [
  {id:'same-bg',check:{bg:'paper'},rule:'背景は全ページ同じ紙色',why:'背景を変えると、聞き手は「ここで何が変わるのか」と意味を探す。このデッキには章の切り替えがないので変えない。'},
  {id:'free-late',check:{role:'free',notBefore:1},rule:'「空き」色は解決が見えてから',why:'色の意味を1つに絞ると、見た瞬間に読める。課題のページで使うと、まだ無い解決を先に見せてしまう。'},
  {id:'free-few',check:{role:'free',max:2},rule:'「空き」色は1ページ2か所まで',why:'増えるほど、どれが結論か分からなくなる。'},
  {id:'same-shape',rule:'同じものは、同じ形・同じ位置',why:'ページをまたいで揃えると、変わった部分だけが差分として見える。'}
];
const text = (id, value, x, y, w, h, size=24, color='ink', extra={}) => ({id, type:'text', text:value, x,y,w,h,size,color,...extra});
const box = (id,x,y,w,h,fill,extra={}) => ({id,type:'box',x,y,w,h,fill,...extra});
const foot = n => [text('brand','フリふる',64,488,200,20,13,'quiet',{bold:true}),text('number',`0${n} / 03`,832,488,64,20,13,'quiet')];
const scene = elements => ({bg:'paper',elements});
const why = (ids, what, reason) => ({ids, what, why:reason});
// Shared geometry for things that reappear across pages (rule: same-shape).
const composer = (send, y=284) => [box('bubble',64,y,640,88,'line',{radius:44}),text('message','今日、空いてる？',104,y+22,480,44,32),box('send',620,y+12,64,64,send,{radius:32}),text('sendicon','↑',640,y+22,28,40,32,'paper',{bold:true})];
const friends = (statuses, free=-1) => ['A','B','C'].flatMap((v,i)=>{const x=330+i*192,on=i===free;return [box('card'+i,x,266,182,150,on?'free':'line',{radius:12}),text('person'+i,v,x+24,286,80,44,36,on?'paper':'ink',{bold:true}),text('status'+i,statuses[i],x+24,370,150,26,18,on?'paper':'quiet',{bold:on})];});
const you = [box('me',64,266,170,150,'ink',{radius:12}),text('melabel','あなた',94,322,120,40,28,'paper',{bold:true}),text('arrows','→',258,316,50,50,40,'quiet')];
const pages = [
 {name:'誘う、その手前で', role:'課題への共感', original:'友達を誘うには、予定を確認する手間と、断られるかもしれない心理的なハードルがある。', variants:[
  {label:'一場面を見せる', tag:'場面', note:'説明を減らし、送る直前の画面で「誘う前のためらい」を想像してもらいます。', scene:scene([
   text('eyebrow','ある昼休みの、架空の場面',64,64,600,24,16,'quiet'),text('title','送信されなかった、\nひと言。',64,100,820,130,52,'ink',{bold:true}),
   ...composer('quiet'),text('caption','誘いたい気持ちと、送る勇気のあいだ。',64,412,820,30,20,'quiet'),...foot(1)]),
   rationale:[
    why(['send','sendicon'],'送信ボタンは「控え」色','押されなかったボタンだから。つながれる瞬間を表す「空き」色は、解決が見える2枚目まで取っておく。'),
    why(['bubble','message'],'説明文ではなく、入力欄そのものを置く','「誘うのは面倒」と書くより、送る直前の画面を見せたほうが、聞き手が自分の経験を重ねられる。'),
    why(['eyebrow'],'「架空の場面」と明記する','実際の利用者の声だと誤解されないように。')]},
  {label:'待ち時間を見せる', tag:'時間', note:'連絡の手間ではなく、返事を待つ体験に焦点を移します。', scene:scene([
   text('title','返事を待つ間に、\n昼休みが終わる。',64,64,820,130,52,'ink',{bold:true}),box('track',74,318,822,4,'line'),
   ...[['12:00','「お昼どう？」','ink'],['12:20','まだ既読なし','quiet'],['13:00','次の授業へ','quiet']].flatMap(([time,event,c],i)=>[box('dot'+i,64+i*320,310,20,20,c,{radius:10}),text('time'+i,time,64+i*320,262,100,32,24,c,{bold:true}),text('event'+i,event,64+i*320,348,190,30,20,c)]),
   text('example','時刻は説明のための例です',64,430,600,24,16,'quiet'),...foot(1)]),
   rationale:[
    why(['dot0','dot1','dot2'],'点の色は「起きたか」だけで分ける','墨＝自分が送った（起きたこと）、控え＝返事がないまま過ぎた時間。点ごとに違う色を塗ると、色の違いに意味を探させてしまう。'),
    why([],'「空き」色はどこにも使わない','この場面では最後まで返事が来ない。つながりが生まれていないので、つながりの色も出さない。'),
    why(['track'],'時間軸は右の余白まで伸ばす','昼休みが終わっても時間は流れ続ける。機会が過ぎていく感覚を、途切れない線で示す。')]},
  {label:'構造で見せる', tag:'仕組み', note:'「誰が空いているか分からない」状態を図で整理します。', scene:scene([
   text('title','誘う前に、\n分からないことがある。',64,64,820,130,52,'ink',{bold:true}),
   ...you,...friends(['空いてる？','誘っていい？','いつ分かる？']),...foot(1)]),
   rationale:[
    why(['card0','card1','card2'],'3人のカードは同じ色・同じ形','「誰が空いているか分からない」は、見分けがつかない状態。区別のない色で表す。次のページで1枚だけ色が変わる前振りでもある。'),
    why(['me','melabel'],'「あなた」だけを墨で塗る','聞き手が自分を重ねる起点。塗りの面積で、視線の出発点をつくる。'),
    why(['status0','status1','status2'],'問いは「控え」色','答えがまだない、未確定の情報だから。')]}
 ]},
 {name:'見えない予定を、見えるように', role:'解決の理解', original:'友達同士で空き時間を共有し、いま誘える相手を見つけられるようにする。', variants:[
  {label:'変化を見せる', tag:'差分', note:'前のページと同じ図で、変わった部分だけを見せます。空き時間の共有は、誘う許可と同じではありません。', scene:scene([
   text('title','「誰か空いてる？」が、\n見える。',64,64,820,130,52,'ink',{bold:true}),
   ...you,...friends(['授業中','いま空いてる','バイト中'],1),...foot(2)]),
   rationale:[
    why(['card1','person1','status1'],'Bだけを「空き」色に','このデッキで「空き」色は「いま空いている」だけを意味する。色が付いた＝誘える、と説明なしで読める。'),
    why(['me','card0','card1','card2'],'前のページ「構造で見せる」と同じ配置','位置も大きさも揃え、変わったのは色だけにした。解決の中身＝「空きが見える」ことが差分として伝わる。'),
    why(['status0','status2'],'予定がある人は「控え」色','警告の赤などは使わない。予定があるのは悪いことではなく、いまは誘えないだけ。')]},
  {label:'言葉を削る', tag:'言葉', note:'短い言葉に絞る案。具体的な操作は、次のページやデモで補います。', scene:scene([
   text('small','空き時間を、友達と共有する。',64,64,800,32,22,'quiet'),
   text('title','誘う前に、',64,190,700,100,88,'ink',{bold:true}),text('answer','分かる。',64,300,700,100,88,'free',{bold:true}),...foot(2)]),
   rationale:[
    why(['answer'],'「分かる。」だけを「空き」色に','解決の核心は、空いているかが「分かる」こと。色を付ける言葉を1つに絞り、そこが結論だと示す。'),
    why(['title','answer'],'強調は文字の大きさで行い、背景は変えない','背景を暗くして目立たせると、ページごとに背景の意味を問われる。紙色のまま、大きさと1語の色だけで強調する。')]},
  {label:'操作で見せる', tag:'手順', note:'利用の流れを3つに分けます。細かな操作や仕様は別途検証が必要です。', scene:scene([
   text('title','予定を送る前に、\n空き時間を共有。',64,64,820,130,52,'ink',{bold:true}),
   ...['空き時間を登録','友達の空きを見る','誘ってみる'].flatMap((v,i)=>[box('card'+i,64+i*288,266,256,150,'line',{radius:12}),text('step'+i,`0${i+1}`,88+i*288,286,60,28,20,'quiet',{bold:true}),text('label'+i,v,88+i*288,366,210,32,24,'ink',{bold:true})]),
   box('freedot',560,290,20,20,'free',{radius:10}),...foot(2)]),
   rationale:[
    why(['card0','card1','card2'],'3つの手順は同じ面','手順どうしに重みの差はない。順番は番号と左から右への並びで伝え、色では伝えない。'),
    why(['freedot'],'「空き」色は「友達の空きを見る」にだけ','アプリで空きが表示される場所と対応させている。飾りの点ではない。'),
    why(['step0','step1','step2'],'番号は「控え」色','読む順番を助けるだけの補足情報だから。')]}
 ]},
 {name:'一緒に過ごす時間へ', role:'価値を持ち帰る', original:'ひとりの空き時間を、誰かと過ごす時間に変える。「フリふる」の提案。', variants:[
  {label:'余韻を残す', tag:'余韻', note:'余韻を残す締め方。孤独の解消を保証する表現にはせず、目指す価値として伝えます。', scene:scene([
   text('small','FREE な時間を、FULL に。',64,64,800,32,20,'quiet'),text('title','空いていたのは、\n時間だけじゃない。',64,170,860,140,56,'ink',{bold:true}),
   text('sub','誰かと過ごす、きっかけを。',64,370,800,40,28,'free',{bold:true}),...foot(3)]),
   rationale:[
    why(['sub'],'「きっかけ」の一文だけを「空き」色に','「空き」色は、つながれる瞬間の色。締めでは、その瞬間を指す言葉にだけ色を残す。'),
    why(['title','sub'],'見出しと一文の間を大きく空ける','見出しを読み終えて一拍おいてから、下の一文に目が行く距離にしている。')]},
  {label:'価値を言い切る', tag:'明快', note:'機能説明のあとに、何のための機能かを結び直します。', scene:scene([
   text('title','ひとりの空き時間を、\nふたりの時間に。',64,64,840,130,52,'ink',{bold:true}),
   box('one',64,300,300,96,'line',{radius:48}),text('before','ひとり',112,328,200,40,30),text('arrow','→',388,322,50,50,40,'quiet'),
   box('two',460,300,436,96,'free',{radius:48}),text('after','誰かと、一緒に',508,328,360,40,30,'paper',{bold:true}),...foot(3)]),
   rationale:[
    why(['one','two'],'前は「線」、後は「空き」色','2ページ目で「いま空いてる」に使ったのと同じ色。空いていた時間が、誰かとの時間に変わったことを色の連続で示す。'),
    why(['two'],'右の面を大きくする','重さを結論の側に置く。面積の差が、そのまま「広がる」印象になる。')]},
  {label:'問いで終える', tag:'行動', note:'聞き手自身の生活につなぐ締め方。1枚目「一場面を見せる」と対になります。', scene:scene([
   text('small','フリふる',64,64,400,28,20,'quiet',{bold:true}),text('title','今日、\n誰を誘いますか。',64,104,820,160,64,'ink',{bold:true}),
   ...composer('free'),text('sub','空き時間を、誰かと過ごす時間に。',64,412,820,30,20,'quiet'),...foot(3)]),
   rationale:[
    why(['send','sendicon'],'1枚目で押されなかった送信ボタンを「空き」色に','形も位置も同じまま色だけを変え、「送れなかった」から「送れる」への変化で話を閉じる。'),
    why(['bubble','message'],'入力欄は1枚目と同じ位置・大きさ','聞き手に「あの場面だ」と気づいてもらうため。')]}
 ]}
];
export default {
 title:'フリふる',
 subtitle:'伝え方のスタディ',
 source:{label:'参考のGoogle Slidesを開く',note:'「フリふる」の内容を使った試作です。元の資料は変更しません。',url:'https://docs.google.com/presentation/d/1u2sQX86aDu9wzo1I3ttJsa2NfQY5n0sCNvKDNs4tr-U/edit'},
 brief:{audience:'大学生活を始めたばかりの学生',goal:'「自分にもある」と感じ、試してみたいと思う'},
 colors, rules, pages
};
