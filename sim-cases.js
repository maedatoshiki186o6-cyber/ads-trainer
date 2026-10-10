/*
 * 実践シミュレーション — 案件カルテの選択肢・サンプル案件
 *
 * karteGroups : カルテ入力画面のまとまり { title, fields:[項目ID], calc:true なら目標の自動計算を表示 }
 * karteFields : 項目ごとの定義
 *   type    : 'single'(1つ選ぶ) / 'number'(数値入力) / 'text'(自由入力)
 *   options : 選択肢 { value, label, num(計算に使う数値・任意), desc(補足・任意) }
 *             optionsFrom: 'industries' の場合は sim-benchmarks.js の業種一覧を使う
 *   hint    : 項目の下に出す短い説明
 *   help    : ⓘボタンで表示する解説 { what:どういうものか, example:例, tip:ポイント }
 *   unit    : 数値入力の単位（'円' / '%'）、min・max・step・placeholder
 *   optional: 未入力でもよい項目なら true
 *   showIf  : { field, in:[値] } 条件を満たすときだけ表示・入力する
 * samples : サンプル案件 { id, icon, title, summary, karte:{項目ID:値} }
 *
 * ---- 段階2（Google検索：キーワード選び） ----
 * keywords[業種] : キーワード候補（良い・普通・悪いを混ぜる）。{area} はカルテの地域名に置き換わる
 *   kw       : キーワード
 *   intent   : 検索意図の強さ 'high' / 'mid' / 'low'（倍率は sim-benchmarks.js の intent）
 *   cpc      : 想定クリック単価（円）。業種の中でも差がある（例：インプラントは高い）
 *   volume   : 想定検索数（月・市区町村の規模）。カルテの商圏に応じて area.searchScale を掛ける
 *   theme    : キーワードのテーマ。広告見出しの themes と合うと品質が上がる
 *   ans      : 正解 'add'(使う) / 'negative'(除外) / 'skip'(使わない)
 *   best     : ans が 'add' のとき、◎になるマッチタイプ
 *   ok       : △になる回答（'exact' / 'phrase' / 'broad' / 'negative' / 'skip'）
 *   negGroup : 除外したときに防げる「関係ない検索」の種類（negativeGroups の id。'none' は防げるものがない）
 *   blocks   : 除外すると、良い検索まで減ってしまう場合 { themes:[減るキーワードのテーマ], ratio:減る割合 }
 *   reason   : 解説
 * negativeGroups[業種] : 関係ない検索の種類 { id, label, share(関係ない検索のうちの割合), words(自分で除外キーワードを入れたときの判定) }
 * headlines[業種] : 広告見出しの候補 { text, quality:'high'|'mid'|'violation', themes:[], reason }
 *   キーワードのテーマを含む見出しがあれば品質「高い」、テーマが合わなくても汎用の見出しがあれば「ふつう」、なければ「低い」
 *   violation（誇大表現など）を選ぶと、審査で止まるおそれがあり、品質も1段階下がる
 */
window.SIM_CASES = {

  media: [
    { value: 'google', label: 'Google検索広告', icon: '🔍', desc: '検索した人にキーワードで広告を出す' },
    { value: 'meta',   label: 'Meta広告',       icon: '📱', desc: 'Instagram・Facebookで、人の属性や興味で広告を出す' }
  ],

  karteGroups: [
    { title: 'お店・商品について',   fields: ['industry', 'area', 'areaName', 'consideration', 'targetAge', 'targetGender'] },
    { title: '広告の目的と目標',     fields: ['goal', 'cvType', 'salesTarget', 'price', 'closeRate', 'margin', 'budget'], calc: true },
    { title: '計測とこれまでの実績', fields: ['measurement', 'monthlyCv', 'history'] },
    { title: '素材・LP・広告の決まり', fields: ['creative', 'lp', 'specialCategory'] },
    { title: 'メモ',                 fields: ['memo'] }
  ],

  karteFields: {
    industry: { label: '業態', type: 'single', optionsFrom: 'industries' },
    area: {
      label: '商圏（お客さんが来る範囲）', type: 'single',
      options: [
        { value: 'near',     label: '近所（半径数km）' },
        { value: 'city',     label: '市区町村' },
        { value: 'pref',     label: '都道府県' },
        { value: 'region',   label: '複数の都道府県（地方）' },
        { value: 'national', label: '全国' }
      ]
    },
    consideration: {
      label: '検討期間', type: 'single',
      options: [
        { value: 'instant', label: 'その日のうちに決める' },
        { value: 'weeks',   label: '数日〜数週間' },
        { value: 'months',  label: '数ヶ月以上' }
      ]
    },
    targetAge: {
      label: 'ターゲットの年齢', type: 'single',
      options: [
        { value: 'young',  label: '20代中心' },
        { value: 'middle', label: '30〜40代中心' },
        { value: 'senior', label: '50代以上中心' },
        { value: 'all',    label: '年齢は問わない' }
      ]
    },
    targetGender: {
      label: 'ターゲットの性別', type: 'single',
      options: [
        { value: 'female', label: '女性中心' },
        { value: 'male',   label: '男性中心' },
        { value: 'both',   label: '男女とも' }
      ]
    },
    goal: {
      label: '広告の目的（成果＝コンバージョンにするもの）', type: 'single',
      options: [
        { value: 'booking', label: '来店・予約' },
        { value: 'inquiry', label: '問い合わせ・資料請求' },
        { value: 'purchase', label: '購入' },
        { value: 'call',    label: '電話' },
        { value: 'trial',   label: '無料体験・来場' }
      ]
    },
    cvType: {
      label: 'CVの種類（広告の成果を何にするか）', type: 'single',
      options: [
        { value: 'sales', label: 'CV＝売上（購入）', desc: 'ネットショップなど、広告からそのまま購入される' },
        { value: 'lead',  label: 'CV＝見込み客（問い合わせ・予約など）', desc: '制作会社・士業など、問い合わせのあとに商談・来店を経て契約になる' }
      ],
      help: {
        what: '広告の「成果（コンバージョン＝CV）」が、そのまま売上になるのか、売上の手前の「見込み客」なのかを選びます。目標CV数の計算方法が変わります。',
        example: '売上：ネットショップで商品が買われる／見込み客：歯科の予約、ジムの無料体験、士業への相談、不動産の問い合わせ',
        tip: '見込み客の場合、CVが出ても全員が契約するわけではありません。そのため「成約率」を使って、必要なCV数を多めに見積もります。'
      }
    },
    salesTarget: {
      label: '月の売上目標（広告経由）', type: 'number', unit: '円', min: 0, step: 10000, placeholder: '例：500000',
      help: {
        what: '広告から1ヶ月にどれだけの売上を作りたいか、の目標です。お店全体の売上ではなく「広告を見て来たお客さんからの売上」で考えます。',
        example: '月50万円の売上を広告から作りたい → 500000 と入力',
        tip: 'ここから逆算して「何件の成果が必要か」を出します。目標が高すぎると、予算から見たCPAが厳しくなります。'
      }
    },
    price: {
      label: '1件あたりの売上（客単価）', type: 'number', unit: '円', min: 0, step: 1000, placeholder: '例：5000',
      help: {
        what: 'お客さん1人（1件の契約・購入）あたりの平均の売上です。',
        example: 'ネットショップの平均購入額5,000円／パーソナルジムの2ヶ月コース20万円／賃貸仲介の手数料（家賃1ヶ月分）7万円',
        tip: 'リピートが多い商売なら、1回分ではなく「お客さん1人が平均で使ってくれる金額（LTV）」で考える方法もあります。迷ったら、まずは1回分で計算しましょう。'
      }
    },
    closeRate: {
      label: '成約率（問い合わせ → 契約になる割合）', type: 'number', unit: '%', min: 1, max: 100, step: 1, placeholder: '例：25',
      showIf: { field: 'cvType', in: ['lead'] },
      help: {
        what: '広告から来た問い合わせ・予約のうち、実際に契約・来店・購入までつながる割合です。',
        example: '問い合わせ20件のうち5件が契約 → 5 ÷ 20 ＝ 25%',
        tip: '広告の管理画面の「コンバージョン率（クリック→問い合わせ）」とは別物です。こちらは問い合わせの「あと」の割合で、営業や接客の力で変わります。分からなければ、過去の問い合わせと契約の件数から計算してみましょう。'
      }
    },
    margin: {
      label: '粗利率（任意）', type: 'number', unit: '%', min: 1, max: 100, step: 1, placeholder: '例：60', optional: true,
      help: {
        what: '売上から、商品の仕入れ代や材料費などの「原価」を引いた残り（粗利）が、売上の何%かです。',
        example: '5,000円の商品の原価が2,000円 → 粗利3,000円 → 粗利率60%',
        tip: '粗利率を入れると、「1件の成果にいくらまで広告費をかけても赤字にならないか（上限CPA）」が分かります。サービス業は粗利率が高く、物販は低めになりがちです。'
      }
    },
    budget: {
      label: '月の広告予算', type: 'number', unit: '円', min: 0, step: 10000, placeholder: '例：100000',
      help: {
        what: '1ヶ月に広告に使うお金です。Google・Metaでは「1日の予算」で設定することが多いので、月の予算 ÷ 30.4 が1日の目安になります。',
        example: '月10万円 → 1日あたり約3,300円',
        tip: '予算 ÷ 目標CV数 が「予算から見たCPA（1件にかけられる広告費）」になります。これが業種の目安より低すぎると、目標の達成は難しくなります。'
      }
    },
    measurement: {
      label: '計測状況', type: 'single',
      hint: '広告から成果（予約・問い合わせなど）が何件出たかを、広告の管理画面で数えられるか',
      options: [
        { value: 'full',    label: '計測できている（タグ・ピクセル設定済み）' },
        { value: 'partial', label: '一部だけ（電話だけ・フォームだけなど）' },
        { value: 'none',    label: '計測していない' }
      ]
    },
    monthlyCv: {
      label: '今の月のコンバージョン数（広告経由）', type: 'single',
      options: [
        { value: '0',   label: '0件・わからない', num: 0 },
        { value: '1',   label: '1〜9件',   num: 5 },
        { value: '10',  label: '10〜29件', num: 20 },
        { value: '30',  label: '30〜49件', num: 40 },
        { value: '50',  label: '50件以上', num: 60 }
      ]
    },
    history: {
      label: '過去の広告実績', type: 'single',
      options: [
        { value: 'first', label: '広告は初めて' },
        { value: 'good',  label: '運用したことがあり、成果が出ていた' },
        { value: 'bad',   label: '運用したことがあるが、成果が出なかった' }
      ]
    },
    creative: {
      label: '使える素材', type: 'single',
      options: [
        { value: 'video', label: '写真と動画がある' },
        { value: 'image', label: '写真・画像だけある' },
        { value: 'none',  label: '素材なし（文字だけ）' }
      ]
    },
    lp: {
      label: 'LP（広告をクリックした先のページ）', type: 'single',
      options: [
        { value: 'dedicated', label: '広告用の専用ページがある' },
        { value: 'homepage',  label: 'ホームページのトップだけ' },
        { value: 'none',      label: 'なし（電話・SNSに誘導）' }
      ]
    },
    specialCategory: {
      label: '特別な広告カテゴリ（Meta）', type: 'single',
      hint: 'Metaで、差別を防ぐためにターゲティングが制限される分野。該当するのに申告しないと広告が止まることがあります',
      options: [
        { value: 'none',     label: '該当なし' },
        { value: 'housing',  label: '住宅（不動産の売買・賃貸など）' },
        { value: 'employment', label: '雇用（求人）' },
        { value: 'financial', label: '金融商品・サービス（ローン・カードなど）' },
        { value: 'social',   label: '社会問題・選挙・政治' }
      ]
    },
    areaName: { label: '地域名（任意）', type: 'text', rows: 1, placeholder: '例：新宿（キーワードや広告文に使います）' },
    memo: { label: 'メモ（任意）', type: 'text', placeholder: '例：自費診療（インプラント）を増やしたい' }
  },

  samples: [
    {
      id: 'dental',
      icon: '🦷',
      title: '新宿区の歯科医院',
      summary: '予約を増やしたい。計測・LPは準備済みで、過去にも成果が出ている「基本に忠実」な案件。',
      karte: {
        media: 'google',
        industry: 'dental', area: 'city', areaName: '新宿', consideration: 'weeks', targetAge: 'middle', targetGender: 'both',
        goal: 'booking', cvType: 'lead', salesTarget: 320000, price: 20000, closeRate: 80, margin: 60, budget: 100000,
        measurement: 'full', monthlyCv: '10', history: 'good',
        creative: 'image', lp: 'dedicated', specialCategory: 'none',
        memo: '一般診療の予約に加えて、単価の高いインプラント（自費診療）の相談も増やしたい。予約のうち約8割が実際に来院する。'
      }
    },
    {
      id: 'gym',
      icon: '🏋️',
      title: '横浜市のパーソナルジム',
      summary: '無料体験を増やしたい。ただし計測なし・LPなしで予算も少なめ。改善点の多い案件。',
      karte: {
        media: 'google',
        industry: 'gym', area: 'city', areaName: '横浜', consideration: 'weeks', targetAge: 'middle', targetGender: 'female',
        goal: 'trial', cvType: 'lead', salesTarget: 600000, price: 200000, closeRate: 30, margin: 70, budget: 50000,
        measurement: 'none', monthlyCv: '0', history: 'first',
        creative: 'image', lp: 'none', specialCategory: 'none',
        memo: '2ヶ月20万円のダイエットコース。無料体験に来た人の約3割が入会する。申し込みはInstagramのDMで受けている。'
      }
    },
    {
      id: 'realestate',
      icon: '🏠',
      title: '福岡市の賃貸仲介',
      summary: '物件の問い合わせを増やしたい。Metaでは「特別な広告カテゴリ（住宅）」の申告が必要な案件。',
      karte: {
        media: 'meta',
        industry: 'realestate', area: 'city', areaName: '福岡', consideration: 'weeks', targetAge: 'young', targetGender: 'both',
        goal: 'inquiry', cvType: 'lead', salesTarget: 350000, price: 70000, closeRate: 25, margin: 80, budget: 200000,
        measurement: 'full', monthlyCv: '10', history: 'bad',
        creative: 'video', lp: 'dedicated', specialCategory: 'housing',
        memo: '春の引っ越しシーズンに向けて、学生・新社会人向けの1K物件を中心に問い合わせを増やしたい。仲介手数料は家賃1ヶ月分（平均7万円）。問い合わせの約4件に1件が契約になる。'
      }
    }
  ],

  /* =========================================================
     段階2：キーワード候補（Google検索）
     ========================================================= */
  keywords: {
    dental: [
      { kw: '{area} 歯医者', intent: 'high', cpc: 280, volume: 2400, theme: 'general', ans: 'add', best: ['phrase', 'exact'], ok: ['broad'],
        reason: '「地域名＋業種」は、近くの歯医者を探している人の検索で、来院につながりやすい本命のキーワードです。フレーズ一致か完全一致で確実に押さえましょう。' },
      { kw: '{area} 歯科 予約', intent: 'high', cpc: 250, volume: 400, theme: 'general', ans: 'add', best: ['exact', 'phrase'], ok: ['broad'],
        reason: '「予約」まで入っている検索は、今すぐ行く歯医者を決めようとしている人です。検索数は少なくても成約率が高いので、必ず入れたいキーワードです。' },
      { kw: '{area} インプラント', intent: 'high', cpc: 900, volume: 300, theme: 'implant', ans: 'add', best: ['phrase', 'exact'], ok: ['broad'],
        reason: 'クリック単価は高めですが、インプラントは自費診療で1件の売上が大きいので、十分に元が取れます。地域名つきなので来院の可能性も高いです。' },
      { kw: 'インプラント 費用', intent: 'mid', cpc: 700, volume: 600, theme: 'implant', ans: 'add', best: ['phrase'], ok: ['exact', 'skip'],
        reason: '費用を比べている「検討中」の人です。すぐ予約するとは限りませんが、自費診療を増やしたいならフレーズ一致で狙う価値があります。単価が高いので部分一致は避けましょう。' },
      { kw: '歯医者', intent: 'mid', cpc: 300, volume: 5000, theme: 'general', ans: 'add', best: ['exact'], ok: ['phrase', 'skip'],
        reason: '地域名がない一語のキーワードは、意味が広すぎます。配信地域を絞っていれば完全一致で使えますが、部分一致にすると「歯医者 求人」「歯医者 怖い」など関係ない検索にも大量に出てしまいます。' },
      { kw: '歯医者 夜 やってる', intent: 'high', cpc: 260, volume: 300, theme: 'general', ans: 'add', best: ['phrase', 'exact'], ok: ['broad'],
        reason: '仕事帰りに通える歯医者を探している人です。夜も診療しているなら、条件がはっきりした意図の強いキーワードです。' },
      { kw: '歯医者 口コミ', intent: 'mid', cpc: 220, volume: 800, theme: 'general', ans: 'add', best: ['phrase'], ok: ['exact', 'skip'],
        reason: '歯医者を選んでいる途中の人です。比較の段階なので成約率はふつうですが、評判に自信があれば狙えます。' },
      { kw: '歯 痛い', intent: 'mid', cpc: 200, volume: 1500, theme: 'pain', ans: 'add', best: ['phrase'], ok: ['exact', 'skip'],
        reason: '急いで歯医者を探している人もいますが、「痛みの原因」を調べているだけの人も多いキーワードです。フレーズ一致で、痛みに配慮した広告文と組み合わせると効果的です。' },
      { kw: 'ホワイトニング', intent: 'low', cpc: 350, volume: 3000, theme: 'whitening', ans: 'skip', best: [], ok: ['phrase'],
        reason: 'セルフホワイトニングのお店や市販品を探している人が多く、医院への予約にはつながりにくいキーワードです。メモにもホワイトニングを増やしたいとは書かれていません。' },
      { kw: '歯医者 怖い', intent: 'low', cpc: 150, volume: 500, theme: 'pain', ans: 'skip', best: [], ok: ['negative', 'phrase'],
        reason: '不安を調べている段階の人で、すぐの予約にはつながりにくいキーワードです。広告費が限られているうちは、使わなくてよいでしょう。' },
      { kw: '求人', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'negative', best: [], ok: [], negGroup: 'job',
        reason: '「歯医者 求人」「歯科衛生士 求人」など、働く場所を探している人の検索です。患者さんにはならないので、必ず除外しましょう。' },
      { kw: '自分で 治す', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'negative', best: [], ok: ['skip'], negGroup: 'diy',
        reason: '「虫歯 自分で治す」など、歯医者に行かずに済ませたい人の検索です。除外して広告費の無駄を防ぎましょう。' },
      { kw: '歯ブラシ おすすめ', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'negative', best: [], ok: ['skip'], negGroup: 'product',
        reason: '歯ブラシ・歯みがき粉などの商品を探している人の検索です。部分一致のキーワードがあると表示されやすいので、除外しておくと安心です。' },
      { kw: '無料', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'negative', best: [], ok: ['skip'], negGroup: 'free',
        reason: '「歯科 無料 相談 電話」「歯医者 無料 アプリ」など、お金をかけたくない人の検索が混ざります。無料のサービスを広告していないなら除外しましょう。' }
    ],
    gym: [
      { kw: '{area} パーソナルジム', intent: 'high', cpc: 350, volume: 1200, theme: 'general', ans: 'add', best: ['phrase', 'exact'], ok: ['broad'],
        reason: '「地域名＋パーソナルジム」は、通えるジムを探している人の検索で、無料体験につながりやすい本命のキーワードです。' },
      { kw: '{area} パーソナルジム 体験', intent: 'high', cpc: 300, volume: 200, theme: 'trial', ans: 'add', best: ['exact', 'phrase'], ok: ['broad'],
        reason: '「体験」まで入っていて、今回の目的（無料体験）にぴったりです。検索数は少なくても、必ず押さえたいキーワードです。' },
      { kw: 'パーソナルジム 女性 {area}', intent: 'high', cpc: 330, volume: 150, theme: 'women', ans: 'add', best: ['phrase', 'exact'], ok: ['broad'],
        reason: 'ターゲット（30〜40代女性）と合っていて、地域名も入っています。女性向けの広告文と組み合わせると品質が上がります。' },
      { kw: 'パーソナルジム 料金', intent: 'mid', cpc: 300, volume: 2000, theme: 'general', ans: 'add', best: ['phrase'], ok: ['exact', 'skip'],
        reason: '料金を比べている検討中の人です。地域名がないので、配信地域の設定で絞ったうえでフレーズ一致で使うのが無難です。' },
      { kw: 'パーソナルジム おすすめ', intent: 'mid', cpc: 320, volume: 1500, theme: 'general', ans: 'add', best: ['phrase'], ok: ['exact', 'skip'],
        reason: 'ジムを選んでいる途中の人です。比較記事を読みたいだけの人も混ざるので、成約率はふつうです。' },
      { kw: 'ダイエット ジム', intent: 'mid', cpc: 250, volume: 3000, theme: 'diet', ans: 'add', best: ['phrase'], ok: ['exact', 'skip'],
        reason: 'ダイエット目的でジムを探している人です。2ヶ月のダイエットコースと相性が良いですが、安いジムを探す人も混ざるので部分一致は避けましょう。' },
      { kw: 'ダイエット', intent: 'low', cpc: 120, volume: 40000, theme: 'diet', ans: 'skip', best: [], ok: [],
        reason: '一語だけの「ダイエット」は、レシピ・サプリ・運動方法など意味が広すぎます。検索数が多いぶん、予算5万円では一瞬で使い切ってしまいます。' },
      { kw: 'パーソナルジム 安い', intent: 'mid', cpc: 280, volume: 800, theme: 'general', ans: 'skip', best: [], ok: ['phrase', 'negative'],
        reason: '価格を重視している人は、2ヶ月20万円のコースでは成約しにくい傾向があります。使わないか、除外してもよいキーワードです。' },
      { kw: '無料', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'skip', best: [], ok: [], negGroup: 'none', blocks: { themes: ['trial', 'general', 'women'], ratio: 0.35 },
        reason: '【注意】このジムは「無料体験」が目的です。「無料」を除外すると「パーソナルジム 無料体験」という一番大事な検索にも広告が出なくなります。除外キーワードは、自分の商品と矛盾しないか必ず確認しましょう。' },
      { kw: '求人', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'negative', best: [], ok: [], negGroup: 'job',
        reason: '「パーソナルトレーナー 求人」など、働く場所を探している人の検索です。必ず除外しましょう。' },
      { kw: '自宅', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'negative', best: [], ok: ['skip'], negGroup: 'diy',
        reason: '「自宅 筋トレ」「自宅 ダイエット」など、ジムに通わずに済ませたい人の検索です。除外しましょう。' },
      { kw: 'プロテイン', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'negative', best: [], ok: ['skip'], negGroup: 'product',
        reason: 'プロテインなどの商品を探している人の検索です。部分一致のキーワードがあると表示されやすいので、除外しておきましょう。' },
      { kw: '24時間', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'negative', best: [], ok: ['skip'], negGroup: 'cheapgym',
        reason: '「24時間ジム」は月数千円で使える一般的なジムを探す人の検索で、パーソナルジムとはサービスも価格も違います。除外しましょう。' },
      { kw: '市民 体育館', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'negative', best: [], ok: ['skip'], negGroup: 'cheapgym',
        reason: '公営の安いトレーニング施設を探している人の検索です。除外しましょう。' }
    ],
    realestate: [
      { kw: '{area} 賃貸', intent: 'high', cpc: 180, volume: 5000, theme: 'general', ans: 'add', best: ['phrase'], ok: ['exact', 'broad'],
        reason: '「地域名＋賃貸」は、この地域で部屋を探している人の検索で、問い合わせにつながりやすい本命のキーワードです。検索数が多いのでフレーズ一致がバランス良く使えます。' },
      { kw: '{area} 1K 賃貸', intent: 'high', cpc: 150, volume: 600, theme: 'student', ans: 'add', best: ['exact', 'phrase'], ok: ['broad'],
        reason: '間取りまで決まっていて、今回の重点（学生・新社会人向けの1K）にぴったりです。' },
      { kw: '{area} 賃貸 学生', intent: 'high', cpc: 140, volume: 400, theme: 'student', ans: 'add', best: ['phrase', 'exact'], ok: ['broad'],
        reason: 'ターゲット（学生）と合っていて、地域名も入っています。学生向けの広告文と組み合わせると品質が上がります。' },
      { kw: '{area} 賃貸 ペット可', intent: 'high', cpc: 160, volume: 300, theme: 'general', ans: 'add', best: ['phrase', 'exact'], ok: ['broad'],
        reason: '条件がはっきりしている、意図の強いキーワードです。ペット可の物件を扱っているなら、問い合わせにつながりやすいです。' },
      { kw: '{area} 不動産', intent: 'mid', cpc: 200, volume: 2000, theme: 'general', ans: 'add', best: ['exact'], ok: ['phrase', 'skip'],
        reason: '賃貸だけでなく、家の購入や売却を考えている人の検索も混ざります。使うなら完全一致にして、売買の検索は除外キーワードで防ぎましょう。' },
      { kw: '賃貸', intent: 'mid', cpc: 160, volume: 20000, theme: 'general', ans: 'skip', best: [], ok: ['exact'],
        reason: '地域名がないと、別の地域への引っ越しを考えている人などにも表示されます。検索数が多くて予算を使いやすいので、「地域名＋賃貸」を優先しましょう。' },
      { kw: '一人暮らし 初期費用', intent: 'low', cpc: 100, volume: 3000, theme: 'student', ans: 'skip', best: [], ok: ['phrase'],
        reason: '情報を集めている段階の人の検索で、すぐの問い合わせにはつながりにくいです。予算に余裕が出てから試すキーワードです。' },
      { kw: '仲介手数料 無料', intent: 'mid', cpc: 170, volume: 900, theme: 'general', ans: 'skip', best: [], ok: ['negative'],
        reason: '仲介手数料（家賃1ヶ月分）をいただくお店なので、「無料」を探している人には合いません。使わないか、除外しましょう。' },
      { kw: 'SUUMO', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'skip', best: [], ok: ['negative'], negGroup: 'none',
        reason: 'ポータルサイトの名前で検索する人は、そのサイトに行きたい人です。キーワードにはせず、関係ない表示が多ければ除外を検討しましょう。' },
      { kw: '購入', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'negative', best: [], ok: [], negGroup: 'buy',
        reason: '「マンション 購入」「中古 戸建て 購入」など、家を買いたい人の検索です。賃貸仲介とは違うので除外しましょう。' },
      { kw: '売却', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'negative', best: [], ok: [], negGroup: 'sell',
        reason: '「家 売却」「土地 売却 相場」など、家を売りたい人の検索です。除外しましょう。' },
      { kw: '求人', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'negative', best: [], ok: [], negGroup: 'job',
        reason: '「不動産 求人」「宅建 求人」など、働く場所を探している人の検索です。必ず除外しましょう。' },
      { kw: '引っ越し 業者', intent: 'low', cpc: 0, volume: 0, theme: '', ans: 'negative', best: [], ok: ['skip'], negGroup: 'moving',
        reason: '引っ越しの見積もりをしたい人の検索です。部屋探しとは別のサービスなので除外しましょう。' }
    ]
  },

  /* 関係ない検索の種類（share の合計が1。除外キーワードで防げなかった分が「関係ない検索」として残る） */
  negativeGroups: {
    dental: [
      { id: 'job',     label: '求人・働き先探し',     share: 0.30, words: ['求人', '募集', 'バイト', 'アルバイト', '衛生士', '助手', '転職'] },
      { id: 'diy',     label: '自分で治す・情報収集', share: 0.20, words: ['自分で', '治し方', '治す', '原因', '市販'] },
      { id: 'product', label: '商品探し',             share: 0.25, words: ['歯ブラシ', '歯磨き粉', '歯みがき', 'おすすめ', '通販', 'フロス'] },
      { id: 'free',    label: '無料・お金をかけたくない', share: 0.10, words: ['無料', 'タダ'] },
      { id: 'other',   label: 'その他（運用しながら見つける）', share: 0.15, words: [] }
    ],
    gym: [
      { id: 'job',      label: '求人・働き先探し',   share: 0.25, words: ['求人', '募集', 'バイト', 'アルバイト', 'トレーナー 求人', '転職'] },
      { id: 'diy',      label: '自宅でやる・情報収集', share: 0.25, words: ['自宅', '家で', 'やり方', 'メニュー', '方法'] },
      { id: 'product',  label: '商品探し',           share: 0.20, words: ['プロテイン', 'サプリ', '器具', 'ダンベル', '通販'] },
      { id: 'cheapgym', label: '安いジム探し',       share: 0.20, words: ['24時間', 'エニタイム', '市民', '体育館', '公営', '月額'] },
      { id: 'other',    label: 'その他（運用しながら見つける）', share: 0.10, words: [] }
    ],
    realestate: [
      { id: 'buy',    label: '購入したい',         share: 0.30, words: ['購入', '新築', '分譲', '中古', '買う', '戸建'] },
      { id: 'sell',   label: '売却したい',         share: 0.15, words: ['売却', '売る', '査定', '買取'] },
      { id: 'job',    label: '求人・働き先探し',   share: 0.15, words: ['求人', '募集', 'バイト', '宅建', '転職'] },
      { id: 'moving', label: '引っ越し業者探し',   share: 0.20, words: ['引っ越し', '引越', '業者', '見積'] },
      { id: 'other',  label: 'その他（運用しながら見つける）', share: 0.20, words: [] }
    ]
  },

  /* 広告見出しの候補（最大3つ選ぶ） */
  headlines: {
    dental: [
      { text: '{area}駅すぐの歯医者｜WEB予約24時間OK', quality: 'high', themes: ['general'],
        reason: '地域名と「歯医者」「予約」が入っていて、地域名＋歯医者で検索した人にぴったり合います。' },
      { text: '{area}のインプラント｜費用の目安とカウンセリング', quality: 'high', themes: ['implant'],
        reason: 'インプラント系のキーワードと合う見出しです。費用が気になる人の不安にも答えています。' },
      { text: '痛みに配慮した治療｜夜19時まで診療', quality: 'high', themes: ['pain'],
        reason: '「歯 痛い」「夜 やってる」と検索した人の悩みに合う見出しです。' },
      { text: '地域の皆さまの健康を守ります', quality: 'mid', themes: [],
        reason: '間違いではありませんが、どのキーワードとも具体的に合っていない、ありきたりな見出しです。' },
      { text: '絶対に痛くない！日本一の歯科医院', quality: 'violation', themes: [],
        reason: '「絶対」「日本一」は根拠を示せない誇大な表現で、医療広告のルール（医療広告ガイドライン）に反するおそれがあります。審査で広告が止まる原因になります。' }
    ],
    gym: [
      { text: '{area}のパーソナルジム｜無料体験受付中', quality: 'high', themes: ['general', 'trial'],
        reason: '地域名・パーソナルジム・無料体験が入っていて、本命のキーワードとよく合っています。' },
      { text: '女性専用パーソナルジム｜{area}駅徒歩3分', quality: 'high', themes: ['women'],
        reason: '女性向けのキーワードと合う見出しです。ターゲットにも合っています。' },
      { text: '2ヶ月で理想の体へ｜食事指導つきダイエット', quality: 'high', themes: ['diet'],
        reason: 'ダイエット系のキーワードと合う見出しです。コースの期間も伝わります。' },
      { text: '健康的な毎日を応援します', quality: 'mid', themes: [],
        reason: '間違いではありませんが、どのキーワードとも具体的に合っていない、ありきたりな見出しです。' },
      { text: '誰でも1ヶ月で必ず-10kg！', quality: 'violation', themes: [],
        reason: '「誰でも」「必ず」と効果を言い切る表現は、景品表示法などに反するおそれがあります。審査で広告が止まる原因になり、信頼も失います。' }
    ],
    realestate: [
      { text: '{area}の賃貸なら｜1K・学生向け物件多数', quality: 'high', themes: ['general', 'student'],
        reason: '地域名・賃貸・1K・学生が入っていて、本命のキーワードとよく合っています。' },
      { text: '一人暮らしを応援｜初期費用の相談OK', quality: 'high', themes: ['student'],
        reason: '学生・新社会人向けのキーワードと合う見出しです。' },
      { text: '{area}でペット可の賃貸を探すなら', quality: 'high', themes: ['general'],
        reason: '地域名＋賃貸のキーワードと合う見出しです。' },
      { text: '理想の住まいがきっと見つかる', quality: 'mid', themes: [],
        reason: '間違いではありませんが、どのキーワードとも具体的に合っていない、ありきたりな見出しです。' },
      { text: '業界最安値！どこよりも安い家賃', quality: 'violation', themes: [],
        reason: '根拠のない「最安値」「どこよりも」は、不当表示（不動産の表示に関するルール・景品表示法）にあたるおそれがあります。審査で広告が止まる原因になります。' }
    ]
  },
  headlineMax: 3,

  // キーワードのテーマ名（見出しとの関連性の解説に使う）
  themeLabels: {
    general: '地域名＋業種', implant: 'インプラント', pain: '痛み・悩み', whitening: 'ホワイトニング',
    trial: '体験', women: '女性向け', diet: 'ダイエット', student: '学生・1K'
  },

  /* =========================================================
     段階2：オーディエンス設定（Meta）
     options の value は sim.js の計算・採点で使う
     ========================================================= */
  metaGroups: [
    { title: 'オーディエンス（誰に届けるか）', fields: ['metaArea', 'ageGender', 'detailed'] },
    { title: '配信の設定',                     fields: ['optimization', 'placement', 'adsets'] }
  ],
  metaFields: {
    metaArea: {
      label: '地域',
      options: [
        { value: 'narrower', label: '商圏より狭く', desc: 'お店の周り半径数kmなど' },
        { value: 'match',    label: '商圏どおり',   desc: 'カルテの商圏に合わせる' },
        { value: 'wider',    label: '商圏より広く', desc: '周りの地域も含める' }
      ]
    },
    ageGender: {
      label: '年齢・性別',
      options: [
        { value: 'open',   label: '絞らない', desc: '18〜65歳以上・すべての性別。誰に届けるかはMetaの自動配信にまかせる' },
        { value: 'narrow', label: 'ターゲットに合わせて絞る', desc: 'カルテのターゲット（年齢・性別）だけに届ける' }
      ]
    },
    detailed: {
      label: '詳細ターゲット設定',
      options: [
        { value: 'advantage', label: 'Advantage+ オーディエンス（おまかせ）', desc: '反応しそうな人をMetaが自動で探す' },
        { value: 'interest',  label: '興味・関心で絞る', desc: '例：ダイエット・フィットネス、引っ越し など' }
      ]
    },
    optimization: {
      label: 'パフォーマンスの目標（何を増やすように配信するか）',
      options: [
        { value: 'conversions', label: 'コンバージョン数の最大化', desc: '予約・問い合わせなどの成果が出やすい人に配信。ピクセルでの計測が必要' },
        { value: 'lpviews',     label: 'ランディングページビュー数の最大化', desc: 'LPを最後まで読み込んでくれる人に配信。ピクセルが必要' },
        { value: 'clicks',      label: 'リンクのクリック数の最大化', desc: 'クリックしやすい人に配信。計測がなくても使える' },
        { value: 'reach',       label: 'リーチの最大化', desc: 'できるだけ多くの人に表示する。認知向け' }
      ]
    },
    placement: {
      label: '配置（どこに広告を出すか）',
      options: [
        { value: 'auto',      label: 'Advantage+ 配置（自動）', desc: 'Instagram・Facebookなどから、成果が出やすい場所をMetaが選ぶ' },
        { value: 'instagram', label: 'Instagramのみ', desc: 'フィード・ストーリーズ・リールなど' },
        { value: 'facebook',  label: 'Facebookのみ', desc: 'フィード・Marketplaceなど' }
      ]
    },
    adsets: {
      label: '広告セットの数',
      options: [
        { value: '1', label: '1つにまとめる', desc: '予算とデータを1か所に集める' },
        { value: '3', label: '3つに分ける', desc: '年齢別・興味関心別などで分ける' },
        { value: '5', label: '5つに分ける', desc: 'さらに細かく分けて比べる' }
      ]
    }
  }
};
