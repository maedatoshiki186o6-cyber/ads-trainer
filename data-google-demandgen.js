/*
 * Google広告 — デマンド ジェネレーション キャンペーン
 * data-google.js の後に読み込みます。
 */
(function (G) {
  G.flows.demandgen = {
    label: 'デマンドジェネレーション',
    preview: { type: 'demandgen', after: 'dg_desc' },
    steps: [
      {
        id: 'dg_bid', title: '入札戦略',
        lead: 'デマンドジェネレーションは、コンバージョンやクリックを重視する自動入札で配信します。',
        fields: ['dg_bidding']
      },
      {
        id: 'dg_channel', title: 'チャネル・地域',
        lead: 'YouTube・Discover・Gmailなど、どのチャネルに配信するかと、地域・言語を決めます。',
        fields: ['dg_channels', 'location', 'language']
      },
      {
        id: 'dg_aud', title: 'オーディエンス',
        lead: '誰に広告を見せるかを決めます。顧客リストをもとに似た人を探す「類似セグメント」が、デマンドジェネレーションの大きな特徴です。',
        fields: ['dg_audience']
      },
      {
        id: 'dg_ad', title: '広告',
        lead: '画像・カルーセル・動画などの広告を作ります。SNSのフィードのように、スクロール中に目を止めてもらえるビジュアルが大切です。',
        fields: ['dg_format', 'finalUrl', 'dg_headlines', 'dg_desc']
      },
      {
        id: 'dg_budget', title: '予算',
        lead: '1日の平均予算を決めます。AIが学習するため、目標単価に対して十分な予算を用意します。',
        fields: ['budget']
      }
    ]
  };

  Object.assign(G.fields, {
    dg_bidding: {
      label: '入札戦略',
      type: 'single',
      summary: '何を重視して入札するかを選びます。',
      help: {
        role: 'デマンドジェネレーションの入札方法です。コンバージョン（必要に応じて目標CPA）、コンバージョン値（目標ROAS）、クリックを重視する戦略から選びます。',
        tip: 'コンバージョンを計測しているならコンバージョン重視が基本です。実績があり、目標単価が決まっていれば目標CPAを設定します。AIの学習には、1日の予算を目標CPAの数倍以上にしておくのが目安です。',
        mistakes: [
          'コンバージョンを計測していないのにコンバージョン重視で配信する',
          '目標CPAに対して予算が少なすぎて、学習が進まない'
        ]
      },
      options: [
        { value: 'max_conv', label: 'コンバージョン数の最大化', desc: '予算内でコンバージョンを最大化します。' },
        { value: 'tcpa', label: '目標コンバージョン単価（目標CPA）', desc: '「1件◯円」を目標に入札します。実績があるときに使います。' },
        { value: 'troas', label: '目標広告費用対効果（目標ROAS）', desc: '購入金額を計測していて、売上の効率を重視したい場合に使います。' },
        { value: 'max_clicks', label: 'クリック数の最大化', desc: 'サイトへの訪問を増やします。コンバージョンを計測していない場合の選択肢です。' }
      ]
    },

    dg_channels: {
      label: '配信チャネル',
      type: 'single',
      summary: '広告を配信する場所を選びます。',
      help: {
        role: 'デマンドジェネレーションは、YouTube（インストリーム・インフィード・ショート）、Discover、Gmail、Googleディスプレイ ネットワークに配信できます。',
        tip: '基本は「すべてのGoogleチャネル」で、AIに成果の出やすい場所を選ばせます。チャネルを絞るのは、テストや素材の都合がある場合に限ります。',
        mistakes: [
          '最初からチャネルを1つに絞り、配信量と学習データが足りなくなる',
          '動画素材しかないのにDiscover・Gmailだけに絞る'
        ]
      },
      options: [
        { value: 'all', label: 'すべてのGoogleチャネル（推奨）', desc: 'YouTube・Discover・Gmail・ディスプレイに、AIが配分して配信します。' },
        { value: 'youtube_only', label: 'YouTubeのみ', desc: 'YouTubeだけに配信します。動画中心の場合に検討します。' },
        { value: 'gmail_discover', label: 'DiscoverとGmailのみ', desc: '画像広告が中心の場合に検討します。配信量は少なくなります。' }
      ]
    },

    dg_audience: {
      label: 'オーディエンス',
      type: 'single',
      summary: '広告を見せる相手の決め方を選びます。',
      help: {
        role: 'デマンドジェネレーションでは、顧客リストをもとに「似た人」を探す類似セグメント、サイト訪問者などのリマーケティング、興味・関心や購買意向のセグメントを使えます。',
        tip: '顧客リストがあるなら、類似セグメントで「まだ知らないけれど、既存顧客に似た人」に届けるのが効果的です。顧客リストがない場合は、興味・関心・購買意向のセグメントを使います。',
        mistakes: [
          '新しいお客さんを増やしたいのに、すでにサイトに来た人（リマーケティング）だけに配信する',
          '顧客リストが少なすぎて（数百人など）、類似セグメントが作れない'
        ]
      },
      options: [
        { value: 'lookalike', label: '類似セグメント（顧客リストに似た人）', desc: '既存の顧客リストをもとに、特徴の似た新しい人を探します。新規獲得に効果的です。' },
        { value: 'remarketing', label: 'リマーケティング（サイト訪問者など）', desc: '一度サイトに来た人に、もう一度アプローチします。' },
        { value: 'interest', label: '興味・関心・購買意向のセグメント', desc: '「英語学習」「料理」など、関心のある人や購入を検討中の人に配信します。' },
        { value: 'optimized', label: '指定しない（最適化されたターゲティングにおまかせ）', desc: 'Googleが成果につながりそうな人を自動で探します。' }
      ]
    },

    dg_format: {
      label: '広告フォーマット',
      type: 'single',
      summary: '広告の形式を選びます。',
      help: {
        role: 'デマンドジェネレーションの広告の形式です。1枚の画像で見せる「画像広告」、複数の画像を横にスワイプして見せる「カルーセル」、YouTubeでも配信できる「動画広告」、Merchant Centerの商品を並べる「商品フィード付き」があります。',
        tip: 'YouTube（特にショート）に配信するなら動画、複数の商品やメニューを見せるならカルーセルが向いています。スクロール中に目を止めてもらえる、高品質なビジュアルが大切です。',
        mistakes: [
          '画像しかないのにYouTubeでの配信を期待する（画像広告はYouTubeの一部の面にしか出ない）',
          '素材の画質が低く、スクロールで素通りされる'
        ]
      },
      options: [
        { value: 'image', label: '画像広告（シングル）', desc: '1枚の画像で見せます。Discover・Gmail・YouTubeの一部の面などに配信されます。' },
        { value: 'carousel', label: 'カルーセル広告', desc: '2〜10枚の画像をスワイプして見せます。複数の商品・メニューの紹介に向いています。' },
        { value: 'video', label: '動画広告', desc: 'YouTube（インストリーム・インフィード・ショート）などに配信されます。縦型・横型の両方があると理想的です。' },
        { value: 'product', label: '商品フィード付きの広告', desc: 'Merchant Centerの商品データを使い、商品を並べて見せます。ECで商品フィードがある場合に使います。' }
      ]
    },

    dg_headlines: {
      label: '広告見出し',
      type: 'textlist',
      summary: '最大5本、1本あたり半角40文字（全角20文字）まで。',
      initial: 2, max: 5, limit: 40,
      placeholder: '例：20分で完成する本格ディナー',
      help: {
        role: '画像や動画と一緒に表示される見出しです。',
        tip: 'まだ商品を知らない人に向けて、「自分ごと」に感じてもらえる言葉にします。',
        mistakes: ['商品名だけで、何が良いのか伝わらない', '1本だけしか登録しない']
      }
    },

    dg_desc: {
      label: '説明文',
      type: 'textlist',
      summary: '最大5本、1本あたり半角90文字（全角45文字）まで。',
      initial: 1, max: 5, limit: 90,
      placeholder: '例：下ごしらえ済みの食材とレシピが届くから、平日でも20分で手作りディナー',
      help: {
        role: '見出しを補足する説明文です。',
        tip: '具体的なメリットと、次の行動（初回割引・無料体験など）を書きます。',
        mistakes: ['見出しと同じ内容を繰り返す']
      }
    }
  });

  G.scenarios.push(
    {
      id: 'mealkit-d2c',
      type: 'demandgen',
      category: 'D2C新規獲得',
      icon: '🥗',
      title: 'ミールキットの定期購入を、まだ知らない人に広げたい',
      level: '中級',
      brand: '（架空）ハラペコキッチン',
      domain: 'harapeko-kitchen.example.jp',
      facts: [
        ['業種', 'ミールキット（下ごしらえ済みの食材とレシピ）の定期便。自社ECで販売'],
        ['目的', '検索広告だけでは申込が頭打ち。まだサービスを知らない人に、写真や動画で魅力を伝えて定期購入を増やしたい'],
        ['月の予算', '80万円'],
        ['計測状況', '定期購入の申込を「購入」として計測。直近30日で80件'],
        ['データ', '既存会員の顧客リスト（約5,000件）あり'],
        ['素材', '料理の写真が多数、15秒の縦型動画あり']
      ],
      answers: {
        goal: { best: ['sales'], ok: ['consideration'], reason: '定期購入（売上）を増やすことが目的なので「販売促進」です。' },
        campaignType: { best: ['demandgen'], ok: ['pmax', 'video'], reason: 'まだ検索していない潜在層に、写真や動画で魅力を伝えて購入につなげたいので、デマンドジェネレーションが最適です。顧客リストから類似セグメントを作れるのも大きな利点です。' },
        dg_bidding: { best: ['max_conv'], ok: ['tcpa'], reason: '新しいキャンペーンなので、まずは「コンバージョン数の最大化」で成果を集めます。' },
        dg_channels: { best: ['all'], ok: [], reason: '写真と縦型動画の両方があるので、すべてのGoogleチャネルに配信し、AIに成果の出やすい場所を選ばせます。' },
        location: { best: ['japan'], ok: [], reason: '全国に配送しているので日本全国です。' },
        language: { best: ['ja'], ok: ['all'], reason: '日本語のサイトなので日本語です。' },
        dg_audience: { best: ['lookalike'], ok: ['interest', 'optimized'], reason: '約5,000件の顧客リストがあるので、類似セグメントで「既存会員に似た、まだ知らない人」に届けるのが効果的です。' },
        dg_format: { best: ['carousel', 'video'], ok: ['image'], reason: '料理の写真が多数あるならカルーセル、縦型動画があるならYouTubeショートにも出せる動画広告が向いています。' },
        finalUrl: { best: ['relevant_lp'], ok: ['top'], reason: 'お試しセットや初回割引の申込ページにリンクします。' },
        dg_headlines: { min: 3, okMin: 2, reason: '例：「20分で完成する本格ディナー」「買い物と献立決めから解放」「初回はお試し50%OFF」など。' },
        dg_desc: { min: 2, okMin: 1, reason: '例：「下ごしらえ済みの食材とレシピが届くから、平日でも20分で手作りディナー。初回は半額でお試しできます」' },
        budget: { min: 24000, max: 29000, reason: '80万円 ÷ 30.4日 ≒ 26,320円/日 です。' }
      }
    },
    {
      id: 'english-trial',
      type: 'demandgen',
      category: 'リード獲得',
      icon: '🗣️',
      title: 'オンライン英会話の無料体験を、YouTubeなどで潜在層に広げたい',
      level: '中級',
      brand: '（架空）ハローデイズ英会話',
      domain: 'hellodays-eikaiwa.example.jp',
      facts: [
        ['業種', 'オンライン英会話スクール（全国対応）'],
        ['目的', '「英語を話せるようになりたい」と思っているけれど、まだスクールを探していない人に、無料体験を申し込んでほしい'],
        ['月の予算', '40万円'],
        ['計測状況', '無料体験の申込をコンバージョンとして計測。直近30日で120件、1件あたり約3,000円'],
        ['営業の目標', '1件あたり3,500円以内で獲得したい'],
        ['素材', '30秒の講師紹介動画（横型・縦型）、レッスン風景の写真'],
        ['データ', '顧客リストは使えない（会員情報を広告に使う同意を取っていない）']
      ],
      answers: {
        goal: { best: ['leads'], ok: ['consideration'], reason: '無料体験の申込（リード）を増やすことが目的なので「見込み顧客の獲得」です。' },
        campaignType: { best: ['demandgen'], ok: ['pmax', 'video'], reason: 'まだ探していない潜在層に、YouTubeなどで動画を見せて申込につなげたいので、デマンドジェネレーションが最適です。動画からのコンバージョン獲得は、現在はデマンドジェネレーションで行います。' },
        dg_bidding: { best: ['tcpa'], ok: ['max_conv'], reason: '実績があり（30日で120件）、目標単価（3,500円）も決まっているので、目標CPAを設定します。' },
        dg_channels: { best: ['all'], ok: ['youtube_only'], reason: '動画と写真の両方があるので、すべてのGoogleチャネルに配信します。' },
        location: { best: ['japan'], ok: [], reason: 'オンラインで全国に対応しているので日本全国です。' },
        language: { best: ['ja'], ok: ['all'], reason: '日本語で英会話を学びたい人が対象なので日本語です。' },
        dg_audience: { best: ['interest'], ok: ['optimized'], reason: '顧客リストを使えないので、類似セグメントは作れません。「英語学習」「語学スクール」に関心のある人や購買意向のセグメントで配信します。' },
        dg_format: { best: ['video'], ok: ['image', 'carousel'], reason: '講師の雰囲気が伝わる動画（横型・縦型）があるので、YouTubeのインストリームやショートにも配信できる動画広告が最適です。' },
        finalUrl: { best: ['relevant_lp'], ok: [], reason: '無料体験の申込ページにリンクします。' },
        dg_headlines: { min: 3, okMin: 2, reason: '例：「1日25分、自宅で英会話」「無料体験レッスン受付中」「初心者も安心の日本語サポート」など。' },
        dg_desc: { min: 2, okMin: 1, reason: '例：「朝6時から深夜まで予約できるから、忙しい人でも続けられる。まずは無料体験で講師と話してみよう」' },
        budget: { min: 12000, max: 14500, reason: '40万円 ÷ 30.4日 ≒ 13,160円/日 です。目標CPA 3,500円の数倍以上あるので、学習に必要な予算も確保できています。' }
      }
    }
  );
})(window.TRAINER_PLATFORMS.google);
