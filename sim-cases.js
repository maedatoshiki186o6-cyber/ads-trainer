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
 */
window.SIM_CASES = {

  media: [
    { value: 'google', label: 'Google検索広告', icon: '🔍', desc: '検索した人にキーワードで広告を出す' },
    { value: 'meta',   label: 'Meta広告',       icon: '📱', desc: 'Instagram・Facebookで、人の属性や興味で広告を出す' }
  ],

  karteGroups: [
    { title: 'お店・商品について',   fields: ['industry', 'area', 'consideration', 'targetAge', 'targetGender'] },
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
        industry: 'dental', area: 'city', consideration: 'weeks', targetAge: 'middle', targetGender: 'both',
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
        industry: 'gym', area: 'city', consideration: 'weeks', targetAge: 'middle', targetGender: 'female',
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
        industry: 'realestate', area: 'city', consideration: 'weeks', targetAge: 'young', targetGender: 'both',
        goal: 'inquiry', cvType: 'lead', salesTarget: 350000, price: 70000, closeRate: 25, margin: 80, budget: 200000,
        measurement: 'full', monthlyCv: '10', history: 'bad',
        creative: 'video', lp: 'dedicated', specialCategory: 'housing',
        memo: '春の引っ越しシーズンに向けて、学生・新社会人向けの1K物件を中心に問い合わせを増やしたい。仲介手数料は家賃1ヶ月分（平均7万円）。問い合わせの約4件に1件が契約になる。'
      }
    }
  ]
};
