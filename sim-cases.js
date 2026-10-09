/*
 * 実践シミュレーション — 案件カルテの選択肢・サンプル案件
 *
 * karteGroups : カルテ入力画面のまとまり { title, fields:[項目ID] }
 * karteFields : 項目ごとの定義
 *   type    : 'single'(1つ選ぶ) / 'text'(自由入力)
 *   options : 選択肢 { value, label, num(計算に使う数値・任意) }
 *             optionsFrom: 'industries' の場合は sim-benchmarks.js の業種一覧を使う
 *   hint    : 項目の下に出す短い説明
 * samples : サンプル案件 { id, icon, title, summary, karte:{項目ID:値} }
 */
window.SIM_CASES = {

  media: [
    { value: 'google', label: 'Google検索広告', icon: '🔍', desc: '検索した人にキーワードで広告を出す' },
    { value: 'meta',   label: 'Meta広告',       icon: '📱', desc: 'Instagram・Facebookで、人の属性や興味で広告を出す' }
  ],

  karteGroups: [
    { title: 'お店・商品について',   fields: ['industry', 'area', 'price', 'consideration', 'targetAge', 'targetGender'] },
    { title: '広告の目的と予算',     fields: ['goal', 'budget', 'targetCpa', 'targetCount'] },
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
    price: {
      label: '客単価（1人あたりの売上）', type: 'single',
      options: [
        { value: 'u5k',    label: '5千円未満',       num: 3000 },
        { value: 'u30k',   label: '5千〜3万円',      num: 15000 },
        { value: 'u100k',  label: '3万〜10万円',     num: 60000 },
        { value: 'u1m',    label: '10万〜100万円',   num: 300000 },
        { value: 'o1m',    label: '100万円以上',     num: 2000000 }
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
    budget: {
      label: '月の広告予算', type: 'single',
      options: [30000, 50000, 100000, 200000, 300000, 500000, 1000000].map(n => ({ value: String(n), label: (n / 10000) + '万円', num: n }))
    },
    targetCpa: {
      label: '目標CPA（成果1件にかけてよい広告費）', type: 'single',
      options: [1000, 3000, 5000, 10000, 20000, 30000, 50000, 100000].map(n => ({ value: String(n), label: n.toLocaleString('ja-JP') + '円', num: n }))
    },
    targetCount: {
      label: '目標件数（1ヶ月）', type: 'single',
      options: [5, 10, 20, 30, 50, 100].map(n => ({ value: String(n), label: n + '件', num: n }))
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
        industry: 'dental', area: 'city', price: 'u30k', consideration: 'weeks', targetAge: 'middle', targetGender: 'both',
        goal: 'booking', budget: '100000', targetCpa: '5000', targetCount: '20',
        measurement: 'full', monthlyCv: '10', history: 'good',
        creative: 'image', lp: 'dedicated', specialCategory: 'none',
        memo: '一般診療の予約に加えて、単価の高いインプラント（自費診療）の相談も増やしたい。'
      }
    },
    {
      id: 'gym',
      icon: '🏋️',
      title: '横浜市のパーソナルジム',
      summary: '無料体験を増やしたい。ただし計測なし・LPなしで予算も少なめ。改善点の多い案件。',
      karte: {
        media: 'google',
        industry: 'gym', area: 'city', price: 'u1m', consideration: 'weeks', targetAge: 'middle', targetGender: 'female',
        goal: 'trial', budget: '50000', targetCpa: '5000', targetCount: '10',
        measurement: 'none', monthlyCv: '0', history: 'first',
        creative: 'image', lp: 'none', specialCategory: 'none',
        memo: '2ヶ月20万円のダイエットコース。申し込みはInstagramのDMで受けている。'
      }
    },
    {
      id: 'realestate',
      icon: '🏠',
      title: '福岡市の賃貸仲介',
      summary: '物件の問い合わせを増やしたい。Metaでは「特別な広告カテゴリ（住宅）」の申告が必要な案件。',
      karte: {
        media: 'meta',
        industry: 'realestate', area: 'city', price: 'u100k', consideration: 'weeks', targetAge: 'young', targetGender: 'both',
        goal: 'inquiry', budget: '200000', targetCpa: '10000', targetCount: '20',
        measurement: 'full', monthlyCv: '10', history: 'bad',
        creative: 'video', lp: 'dedicated', specialCategory: 'housing',
        memo: '春の引っ越しシーズンに向けて、学生・新社会人向けの1K物件を中心に問い合わせを増やしたい。'
      }
    }
  ]
};
