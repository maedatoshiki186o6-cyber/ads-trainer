/*
 * 実践シミュレーション — 計算に使う目安の数値
 *
 * ■ ここにある数値はすべて「学習用のおおまかな目安」です。実際の成果を保証するものではありません。
 * ■ 数値を調整したいときは、このファイルだけを書き換えれば計算に反映されます。
 *
 * 倍率（×1.2 など）は「基準の値に掛ける数」です。1より大きいと増え、小さいと減ります。
 */
window.SIM_BENCH = {

  /* ---------- 業種別の目安 ----------
   * search : Google検索広告  cpc=クリック単価(円) / ctr=クリック率 / cvr=成約率（クリック→成果）
   * meta   : Meta広告        cpm=1000回表示あたりの費用(円) / ctr=リンクのクリック率 / cvr=成約率
   * local  : 来店型など、決まった地域のお客さんが中心の業種なら true
   * specialCategory : Metaで「特別な広告カテゴリ」の申告が必要になりやすい業種なら、そのカテゴリ
   */
  industries: {
    restaurant: { label: '飲食店',           icon: '🍽️', local: true,  search: { cpc: 60,  ctr: 0.06, cvr: 0.08 }, meta: { cpm: 600,  ctr: 0.010, cvr: 0.03 } },
    salon:      { label: '美容室・サロン',   icon: '💇', local: true,  search: { cpc: 80,  ctr: 0.06, cvr: 0.06 }, meta: { cpm: 700,  ctr: 0.010, cvr: 0.03 } },
    dental:     { label: '歯科・クリニック', icon: '🦷', local: true,  search: { cpc: 250, ctr: 0.05, cvr: 0.05 }, meta: { cpm: 800,  ctr: 0.008, cvr: 0.02 } },
    realestate: { label: '不動産',           icon: '🏠', local: true,  search: { cpc: 150, ctr: 0.04, cvr: 0.02 }, meta: { cpm: 900,  ctr: 0.007, cvr: 0.01 }, specialCategory: 'housing' },
    legal:      { label: '士業（弁護士・税理士など）', icon: '⚖️', local: true, search: { cpc: 600, ctr: 0.04, cvr: 0.04 }, meta: { cpm: 1000, ctr: 0.006, cvr: 0.01 } },
    reform:     { label: 'リフォーム・修理', icon: '🔧', local: true,  search: { cpc: 400, ctr: 0.04, cvr: 0.03 }, meta: { cpm: 900,  ctr: 0.007, cvr: 0.012 } },
    school:     { label: 'スクール・習い事', icon: '📚', local: true,  search: { cpc: 150, ctr: 0.05, cvr: 0.04 }, meta: { cpm: 800,  ctr: 0.010, cvr: 0.02 } },
    gym:        { label: 'パーソナルジム',   icon: '🏋️', local: true,  search: { cpc: 300, ctr: 0.05, cvr: 0.04 }, meta: { cpm: 900,  ctr: 0.010, cvr: 0.02 } },
    ec:         { label: 'ネットショップ',   icon: '🛒', local: false, search: { cpc: 50,  ctr: 0.03, cvr: 0.02 }, meta: { cpm: 700,  ctr: 0.012, cvr: 0.015 } },
    btob:       { label: 'BtoBサービス',     icon: '🏢', local: false, search: { cpc: 400, ctr: 0.03, cvr: 0.03 }, meta: { cpm: 1500, ctr: 0.005, cvr: 0.01 } }
  },

  /* ---------- 商圏の広さ ----------
   * searchScale : キーワードの想定検索数（市区町村を1とした値）に掛ける倍率
   * population  : Metaで広告を届けられる人数の目安（人）
   */
  area: {
    near:     { searchScale: 0.3, population: 50000 },
    city:     { searchScale: 1,   population: 300000 },
    pref:     { searchScale: 5,   population: 3000000 },
    region:   { searchScale: 20,  population: 15000000 },
    national: { searchScale: 80,  population: 80000000 }
  },

  /* ---------- 配信地域と商圏の関係 ----------
   * volume : 表示回数の倍率 / cpc : クリック単価の倍率
   * cvr    : 成約率の倍率（extraCvr は「広げたことで増えた分」の成約率の倍率）
   */
  geoFit: {
    narrower:         { label: '商圏より狭い',   volume: 0.6, cpc: 1.15, cvr: 1.1 },
    match:            { label: '商圏どおり',     volume: 1,   cpc: 1,    cvr: 1 },
    wider:            { label: '商圏より広い',   volume: 3,   cpc: 0.95, cvr: 1, extraCvr: 0.2 },
    nationalForLocal: { label: '地域型なのに全国', volume: 15, cpc: 0.9,  cvr: 1, extraCvr: 0.05 }
  },

  /* ---------- マッチタイプ（Google検索） ----------
   * reach      : 表示の広がり（完全一致を1とした倍率）
   * irrelevant : 関係ない検索に表示される割合（除外キーワードなしの場合）
   * ctr / cpc  : クリック率・クリック単価の倍率
   */
  match: {
    exact:  { label: '完全一致',     reach: 1.0, irrelevant: 0.05, ctr: 1.2, cpc: 1.0 },
    phrase: { label: 'フレーズ一致', reach: 1.6, irrelevant: 0.20, ctr: 1.0, cpc: 0.95 },
    broad:  { label: '部分一致',     reach: 3.0, irrelevant: 0.45, ctr: 0.7, cpc: 0.9 }
  },
  irrelevantClick: { ctr: 0.5, cvr: 0.1 }, // 関係ない検索のクリック率・成約率の倍率

  /* ---------- 検索意図の強さ ---------- */
  intent: {
    high: { label: '強い', ctr: 1.3, cvr: 1.5 },
    mid:  { label: 'ふつう', ctr: 1.0, cvr: 0.8 },
    low:  { label: '弱い', ctr: 0.7, cvr: 0.3 }
  },

  /* ---------- 広告の品質（広告文とキーワードの関連性） ----------
   * 広告文にキーワードの内容が入っている・LPの内容と合っているほど高くなる
   * ctr : クリック率の倍率 / cpc : クリック単価の倍率（品質が高いと安く掲載できる）
   */
  quality: {
    high: { label: '高い（キーワードと広告文がよく合っている）', ctr: 1.2,  cpc: 0.85 },
    mid:  { label: 'ふつう',                                     ctr: 1.0,  cpc: 1.0 },
    low:  { label: '低い（広告文がキーワードと合っていない）',   ctr: 0.75, cpc: 1.3 }
  },

  /* ---------- 入札戦略（Google検索） ----------
   * baseShare : 掲載される割合（インプレッションシェア）の基準
   * cpc       : クリック単価の倍率
   * cvr       : 成約率の倍率（自動入札は成約しやすい検索に寄せて入札する／クリック数の最大化は安いクリックに寄りがち）
   * needsConversion : 計測（コンバージョン）がないと正しく動かない戦略なら true
   */
  bidding: {
    manual:      { label: '手動入札（クリック単価を自分で決める）', baseShare: null, cpc: 1.0,  cvr: 1.0 },
    clicks:      { label: 'クリック数の最大化',                     baseShare: 0.6,  cpc: 1.05, cvr: 0.9 },
    conversions: { label: 'コンバージョン数の最大化',               baseShare: 0.6,  cpc: 1.1,  cvr: 1.15, needsConversion: true },
    targetCpa:   { label: '目標コンバージョン単価（目標CPA）',      baseShare: 0.6,  cpc: 1.0,  cvr: 1.2,  needsConversion: true }
  },
  manualShare: { min: 0.1, max: 0.9, base: 0.6, power: 1.2 }, // 手動入札：掲載率 = base × (入札額 ÷ 目安CPC)^power（min〜maxに収める）
  strictTargetCpa: { ratio: 0.7, shareFactor: 0.5 },           // 目標CPAが目安の70%未満だと、掲載率×0.5

  /* ---------- LP（広告をクリックした先のページ） ---------- */
  lp: {
    dedicated: { label: '専用のLPあり',           cvr: 1.0 },
    homepage:  { label: 'ホームページのトップのみ', cvr: 0.7 },
    none:      { label: 'なし（電話・SNSに誘導）',  cvr: 0.45 }
  },

  /* ---------- 検討期間 ---------- */
  consideration: {
    instant: { label: 'その日のうちに決める', cvr: 1.2 },
    weeks:   { label: '数日〜数週間',         cvr: 1.0 },
    months:  { label: '数ヶ月以上',           cvr: 0.6 }
  },

  /* ---------- 素材（Meta） ---------- */
  creative: {
    video: { label: '動画あり',             ctr: 1.15 },
    image: { label: '画像のみ',             ctr: 1.0 },
    none:  { label: '素材なし（文字だけ）', ctr: 0.7 }
  },

  /* ---------- 計測 ---------- */
  measurement: {
    full:    { label: '計測できている（タグ・ピクセル設定済み）' },
    partial: { label: '一部だけ計測（電話だけ・フォームだけなど）' },
    none:    { label: '計測していない' }
  },
  partialMeasuredRatio: 0.6, // 一部だけ計測のとき、管理画面で数えられる成果の割合
  noMeasurement: {
    autoBidCpc: 1.2,         // 計測なしで自動入札を使ったときのクリック単価の倍率
    autoBidSwing: [0.5, 1.1], // 同じく成果の倍率（この範囲でランダム）
    metaCvr: 0.6             // Metaでピクセルなし（クリック目的の配信になる）の成約率の倍率
  },

  /* ---------- Meta：オーディエンス・学習・広告疲れ ---------- */
  meta: {
    ageGenderNarrow: 0.4,     // 年齢・性別で絞ったときに残る人数の割合
    interestNarrow: 0.3,      // 興味関心で絞ったときに残る人数の割合
    smallAudience: { under: 50000, cpm: 1.5 },   // 人数がこれ未満ならCPM×1.5
    specialCategoryCpm: 1.1,  // 特別な広告カテゴリ（ターゲティングが制限される）のCPM倍率
    placementCpm: { auto: 1.0, instagram: 1.15, facebook: 1.1 }, // 配置を絞るとCPMが上がる
    // パフォーマンスの目標ごとの倍率（ctr：クリック率／cvr：成約率）
    optimization: {
      conversions: { ctr: 1.0, cvr: 1.3 },
      lpviews:     { ctr: 1.1, cvr: 1.0 },
      clicks:      { ctr: 1.3, cvr: 0.7 },
      reach:       { ctr: 0.6, cvr: 0.5 }
    },
    adsetOverlapCpm: 0.03,    // 広告セットを1つ増やすごとのCPMの上昇（同じ人を取り合う）
    fatigue: { from: 4, ctrDropPerFreq: 0.08 },  // 月のフリークエンシーが4を超えると、1回ごとにクリック率-8%
    learning: {
      weeklyConversions: 50,  // 学習完了に必要な1週間のコンバージョン数
      notCompleteCpa: 1.2,    // 学習が完了しないときのCPA倍率
      notCompleteSwing: 0.3,  // 学習が完了しないときのブレ幅（±30%）
      firstWeekCpa: 1.3,      // 配信開始から1週間（学習期間）のCPA倍率
      note: '学習が完了しないのは、小規模の予算ではよくあることです。1週間に50件のコンバージョンが目安なので、月数万円の予算ではほとんどの場合届きません。広告セットを分けすぎない・最適化するイベントを手前のもの（問い合わせ→LPの閲覧など）にする、といった対策がありますが、無理に完了させる必要はありません。'
    }
  },

  /* ---------- 自動入札の学習（Google） ---------- */
  autoBidLearning: {
    monthlyConversions: 30,         // 安定に必要な1ヶ月のコンバージョン数
    lowDataSwing: 0.3,              // 足りないときのブレ幅（±30%）
    lowDataCpc: 1.1,                // 足りないときのクリック単価の倍率
    curve: [1.0, 1.08, 1.12],       // 計測ありの自動入札：1・2・3ヶ月目の成果の倍率
    resetFactor: 0.9,               // 大きな変更をした月の倍率（学習のやり直し）
    bigBudgetChange: 0.3            // 予算をこの割合以上変えたら「大きな変更」
  },

  /* ---------- 除外向けの単語をキーワードとして「使う」にしたとき ---------- */
  termKeyword: { volume: 300, cpc: 100 },

  /* ---------- 予算 ---------- */
  budget: {
    daysPerMonth: 30.4,
    minDailyClicks: 10   // 1日の予算で買えるクリック数がこれ未満なら警告
  },

  /* ---------- ランダムなブレ（±の割合） ---------- */
  noise: {
    impressions: 0.08,
    ctr: 0.10,
    cpc: 0.06,
    cvr: 0.20
  },

  /* ---------- 案件カルテの診断に使う値 ---------- */
  diagnosis: {
    cpaTight: 0.67,   // 目標CPAが目安CPAのこの割合を下回ると「厳しい」
    cpaLoose: 1.5     // 目標CPAが目安CPAのこの倍率を上回ると「余裕あり」
  }
};
