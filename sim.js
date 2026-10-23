/*
 * 実践シミュレーション — 画面と計算
 *
 * 目安の数値は sim-benchmarks.js、案件カルテの選択肢・サンプル案件は sim-cases.js、
 * AIへの指示文（「AI用にコピー」でコピーされる文章）は sim-prompts.js にあります。
 * 他のモード（自由練習・シナリオ・クイズ）とは独立して動きます。
 */
(function () {
  'use strict';

  const B = window.SIM_BENCH, C = window.SIM_CASES;
  const view = document.getElementById('view-sim');
  if (!B || !C || !view) return;

  /* ---------- helpers ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('ja-JP');
  const yen = n => fmt(n) + '円';
  const pct = (n, d = 1) => (n * 100).toFixed(d) + '%';

  const DISCLAIMER = '※ 表示される数値は学習用の目安で、実際の成果を保証するものではありません。';
  const PHASES = [
    { id: 'karte', title: '案件カルテ' },
    { id: 'setup', title: (k) => k.media === 'meta' ? 'オーディエンス設定' : 'キーワード選び' },
    { id: 'result', title: '成果シミュレーション' },
    { id: 'improve', title: '運用改善（3ヶ月）' }
  ];
  const READY = ['karte', 'setup', 'result', 'improve']; // 実装済みの段階

  /* ---------- カルテの項目 ---------- */
  const fieldOf = id => C.karteFields[id];
  function optionsOf(id) {
    const f = fieldOf(id);
    if (f.optionsFrom === 'industries') {
      return Object.entries(B.industries).map(([value, x]) => ({ value, label: `${x.icon} ${x.label}` }));
    }
    return f.options || [];
  }
  const optOf = (id, v) => optionsOf(id).find(o => o.value === v) || null;
  const labelOf = (id, v) => (optOf(id, v) || {}).label || '';
  const numOf = (id, v) => (optOf(id, v) || {}).num;
  const allFieldIds = () => C.karteGroups.flatMap(g => g.fields);
  // 自由入力の項目（文章・メニュー）。選択・数値の項目と違い、未入力でもよい
  const isFree = id => fieldOf(id).type === 'text' || fieldOf(id).type === 'menus';
  const menusOf = (k = st.karte) => (k.menus || []).filter(m => (m.name || '').trim());
  const menuText = (k = st.karte) => menusOf(k).map(m => `${m.name.trim()}${m.price != null && m.price !== '' ? `（${yen(Number(m.price))}）` : ''}`).join('、');
  const freeFilled = (id, k = st.karte) => fieldOf(id).type === 'menus' ? menusOf(k).length > 0 : !!String(k[id] || '').trim();
  // 客単価と主力メニューの価格が大きくずれていないか（最安の半分〜最高の2倍から外れたら確認する）
  function priceGap(k = st.karte) {
    const ps = menusOf(k).map(m => Number(m.price)).filter(p => p > 0);
    if (!ps.length || !validNum('price', k.price)) return null;
    const min = Math.min(...ps), max = Math.max(...ps);
    return k.price < min * 0.5 || k.price > max * 2 ? { min, max } : null;
  }
  const priceGapText = g => `客単価（1件あたりの売上）が${yen(st.karte.price)}なのに、主力メニューの価格は${g.min === g.max ? yen(g.min) : `${yen(g.min)}〜${yen(g.max)}`}です。大きくずれていないか確認してください。回数券・コースなどでまとめて買うのが普通なら、まとめた金額が客単価になります。`;
  // showIf の条件を満たすか（満たさない項目は表示・入力しない）
  function shown(id, k = st.karte) {
    const c = fieldOf(id).showIf;
    return !c || c.in.includes(k[c.field]);
  }
  // 数値入力が正しい範囲か
  function validNum(id, v) {
    const f = fieldOf(id);
    return typeof v === 'number' && isFinite(v) && v > 0 && (f.max == null || v <= f.max);
  }
  function filled(id, k = st.karte) {
    const f = fieldOf(id), v = k[id];
    if (f.type === 'number') return validNum(id, v) || (f.optional && v == null);
    return isFree(id) || f.optional || !!v;
  }
  const requiredIds = () => allFieldIds().filter(id => !isFree(id) && shown(id));
  // 表示用の値（数値は単位つき）
  function valueText(id, k = st.karte) {
    const f = fieldOf(id), v = k[id];
    if (f.type === 'number') return v == null ? '未入力' : f.unit === '%' ? `${v}%` : yen(v);
    if (f.type === 'text') return v;
    if (f.type === 'menus') return menuText(k);
    return labelOf(id, v);
  }
  // 円の金額を「50万円」のような読みやすい形に
  const manYen = v => v >= 10000 ? `${(v / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円` : yen(v);

  function blankKarte() {
    const k = { media: document.body.classList.contains('theme-meta') ? 'meta' : 'google' };
    for (const id of allFieldIds()) k[id] = fieldOf(id).type === 'text' ? '' : fieldOf(id).type === 'menus' ? [{ name: '', price: null }] : null;
    return k;
  }

  /* ---------- state ---------- */
  const st = {
    phase: 'karte',
    karte: blankKarte(),
    sampleId: null,
    setup: null,
    seed: 0,
    ops: null,        // 段階4：月ごとの結果・改善の記録          // 成果シミュレーションのランダムなブレの元（「もう一度」で変わる）
    karteOpen: false, // 画面右下の「カルテ」パネルを開いているか
    kwSource: null,   // キーワード候補の作り方（'sample' / 'template' / 'ai'。null は業種に合わせて自動）
    adSource: null,   // 広告文の作り方（'auto' / 'ai'）
    ai: { kw: null, ad: null, terms: null },  // 取り込んだAIの回答 { …, at, industry, areaName, summary }
    // AIのパネルの状態（コピーしたか・貼り付け途中の文章・取り込みの結果）
    aiFlow: { kw: { copied: false, draft: '', msg: null }, ad: { copied: false, draft: '', msg: null }, terms: { copied: false, draft: '', msg: null } },
    saved: null,      // ブラウザに保存されている前回の続き（カルテ画面から再開できる）
    dirty: false
  };

  const missing = () => requiredIds().filter(id => !filled(id));

  /* ---------- 目標CV数・目標CPAの自動計算 ----------
   * 売上    ：目標CV数 = 売上目標 ÷ 客単価              上限CPA = 客単価 × 粗利率
   * 見込み客：成約数   = 売上目標 ÷ 客単価
   *           目標CV数 = 成約数 ÷ 成約率                 上限CPA = 客単価 × 粗利率 × 成約率
   * 共通    ：予算から見たCPA = 月の広告予算 ÷ 目標CV数（件数は切り上げ）
   */
  const ceilCount = x => Math.ceil(x - 1e-9);
  function goalsOf(k) {
    const lead = k.cvType === 'lead';
    if (!k.cvType || !validNum('salesTarget', k.salesTarget) || !validNum('price', k.price)) return null;
    if (lead && !validNum('closeRate', k.closeRate)) return null;
    const cr = lead ? k.closeRate / 100 : 1;
    const dealsRaw = k.salesTarget / k.price;
    const deals = ceilCount(dealsRaw);
    const cvRaw = lead ? deals / cr : dealsRaw;
    const cv = ceilCount(cvRaw);
    const cpa = validNum('budget', k.budget) ? k.budget / cv : null;
    const margin = validNum('margin', k.margin) ? k.margin / 100 : null;
    const upper = margin ? k.price * margin * cr : null;
    return { lead, cr, dealsRaw, deals, cvRaw, cv, cpa, margin, upper };
  }
  // 計算結果をカルテの目標欄に反映（あとの段階でもこの値を使う）
  function syncGoals() {
    const g = goalsOf(st.karte);
    st.karte.targetCount = g ? g.cv : null;
    st.karte.targetCpa = g && g.cpa ? Math.round(g.cpa) : null;
    st.karte.upperCpa = g && g.upper ? Math.round(g.upper) : null;
    return g;
  }

  /* ---------- 目安の計算（カルテ診断用） ---------- */
  // 業種・LP・検討期間・素材・計測から見た「目安のCPA」
  function benchOf(k) {
    const ind = B.industries[k.industry];
    const lp = B.lp[k.lp].cvr, cons = B.consideration[k.consideration].cvr;
    if (k.media === 'meta') {
      const ctr = ind.meta.ctr * B.creative[k.creative].ctr;
      const cpc = ind.meta.cpm / (1000 * ctr);
      let cvr = ind.meta.cvr * lp * cons;
      if (k.measurement === 'none') cvr *= B.noMeasurement.metaCvr;
      return { cpc, cvr, cpa: cpc / cvr, cpm: ind.meta.cpm, ctr };
    }
    const cpc = ind.search.cpc;
    const cvr = ind.search.cvr * lp * cons;
    return { cpc, cvr, cpa: cpc / cvr, ctr: ind.search.ctr };
  }

  // 入力途中でも比べられるよう、未選択の項目は標準的な値で目安を出す
  function benchLoose(k) {
    if (!k.industry) return null;
    const defaults = { lp: 'dedicated', consideration: 'weeks', creative: 'image', measurement: 'full' };
    const k2 = Object.assign({}, k);
    let partial = false;
    for (const [id, v] of Object.entries(defaults)) if (!k2[id]) { k2[id] = v; partial = true; }
    return Object.assign(benchOf(k2), { partial });
  }

  function diagnose(k) {
    const out = [];
    const add = (level, title, text) => out.push({ level, title, text });
    const ind = B.industries[k.industry];
    const bench = benchOf(k);
    const budget = k.budget;
    const tCpa = k.targetCpa;
    const tCount = k.targetCount;
    const upper = k.upperCpa;
    const isMeta = k.media === 'meta';
    const benchCount = budget / bench.cpa;

    // 目標CPAと目安CPA
    const ratio = tCpa / bench.cpa;
    const benchText = `この業種・条件での目安のCPAは約${yen(bench.cpa)}です（クリック単価 約${yen(bench.cpc)} ÷ 成約率 約${pct(bench.cvr)}）。`;
    if (ratio < B.diagnosis.cpaTight) {
      add('bad', '目標CPAが厳しすぎます', `${benchText}予算から見た目標CPA ${yen(tCpa)}は目安の${Math.round(ratio * 100)}%で、達成はかなり難しい水準です。LPの改善などで成約率を上げるか、目標を見直しましょう。`);
    } else if (ratio > B.diagnosis.cpaLoose) {
      add('good', '目標CPAには余裕があります', `${benchText}予算から見た目標CPA ${yen(tCpa)}なら、余裕をもって達成できる見込みです。件数を増やす方向も検討できます。`);
    } else {
      add('good', '目標CPAは目安どおりです', `${benchText}予算から見た目標CPA ${yen(tCpa)}は現実的な水準です。`);
    }

    out.push({ level: 'info', title: '目安どおりに進んだ場合', text: `予算${yen(budget)} ÷ 目安CPA ${yen(bench.cpa)} で、月に約${benchCount < 10 ? benchCount.toFixed(1) : fmt(benchCount)}件の見込みです（目標は${tCount}件）。` });

    // 上限CPA（赤字にならないか）
    if (upper) {
      const how = k.cvType === 'lead' ? `客単価${yen(k.price)} × 粗利率${k.margin}% × 成約率${k.closeRate}%` : `客単価${yen(k.price)} × 粗利率${k.margin}%`;
      if (tCpa > upper) {
        add('bad', 'この予算と目標では赤字になります', `上限CPA（${how}）は${yen(upper)}ですが、予算から見たCPAは${yen(tCpa)}で、1件あたり約${yen(tCpa - upper)}の赤字です。目標か予算を見直しましょう。`);
      } else {
        add('good', '上限CPAの範囲内です', `上限CPA（${how}）は${yen(upper)}で、予算から見たCPA ${yen(tCpa)}はその範囲に収まっています。`);
      }
      if (bench.cpa > upper) {
        add('bad', '業種の目安CPAが上限CPAを超えています', `目安どおりの成果でも1件あたり約${yen(bench.cpa)}かかり、上限CPA ${yen(upper)}を超えます。このままでは広告で利益を出すのが難しいため、成約率・客単価を上げる工夫（LPの改善、セット販売など）も合わせて考えましょう。`);
      }
    } else {
      add('ok', '粗利率が未入力です', '粗利率を入れると「1件にいくらまで広告費をかけても赤字にならないか（上限CPA）」が分かります。赤字かどうかを判断するため、分かる範囲で入れてみましょう。');
    }

    // 計測
    if (k.measurement === 'none') {
      add('bad', '成果が計測できていません', `広告から何件の成果が出たかが分からないため、改善ができません。また「コンバージョン数の最大化」「目標CPA」などの自動入札は${isMeta ? '、Metaでもピクセルがないと「成果」に向けた最適化が' : ''}正しく働きません。まず計測の設定を最優先にしましょう。`);
    } else if (k.measurement === 'partial') {
      add('ok', '計測が一部だけです', '計測できていない成果（電話など）は、管理画面上で「成果ゼロ」に見えてしまいます。実際より悪く見えて、良い広告を止めてしまう原因になります。');
    } else {
      const cv = numOf('monthlyCv', k.monthlyCv);
      if (cv >= B.autoBidLearning.monthlyConversions) {
        add('good', '計測ができていて、データも十分です', `月${B.autoBidLearning.monthlyConversions}件以上のコンバージョンがあるので、${isMeta ? 'コンバージョンに向けた最適化' : '目標CPAなどの自動入札'}が安定しやすい状態です。`);
      } else {
        add('ok', '計測はできていますが、データはまだ少なめです', `月のコンバージョンが${B.autoBidLearning.monthlyConversions}件未満なので、${isMeta ? '配信の最適化が安定するまで時間がかかります' : 'いきなり「目標CPA」を設定すると配信が不安定になりがちです。まずは「コンバージョン数の最大化」から始めるのが無難です'}。`);
      }
    }

    // 予算の規模（Google：1日のクリック数／Meta：学習）
    const daily = budget / B.budget.daysPerMonth;
    if (!isMeta) {
      const clicks = daily / bench.cpc;
      if (clicks < B.budget.minDailyClicks) {
        add('bad', '1日の予算が少なすぎます', `1日の予算は約${yen(daily)}で、目安のクリック単価${yen(bench.cpc)}だと1日約${clicks.toFixed(1)}クリックしか買えません（目安は${B.budget.minDailyClicks}クリック以上）。キーワードを絞り込む、予算を増やす、などの対策が必要です。`);
      } else {
        add('good', '1日の予算は十分です', `1日の予算は約${yen(daily)}で、1日約${Math.floor(clicks)}クリック分です。`);
      }
    } else {
      const weekly = benchCount / (B.budget.daysPerMonth / 7);
      if (weekly < B.meta.learning.weeklyConversions) {
        add('ok', '学習期間が完了しにくい予算です', `見込みは1週間に約${weekly.toFixed(1)}件で、Metaの学習完了の目安（週${B.meta.learning.weeklyConversions}件）に届きません。${B.meta.learning.note}`);
      } else {
        add('good', '学習期間を完了できそうな予算です', `見込みは1週間に約${Math.floor(weekly)}件で、学習完了の目安（週${B.meta.learning.weeklyConversions}件）に届きます。`);
      }
    }

    // LP
    if (k.lp === 'none') {
      add('bad', 'LPがありません', `電話やSNSへの誘導だけだと、広告をクリックした人が内容を確かめられず、成約率が下がります（目安：専用LPの約${Math.round(B.lp.none.cvr * 100)}%）。`);
    } else if (k.lp === 'homepage') {
      add('ok', 'LPがホームページのトップだけです', `広告の内容と関係ないページから探してもらう形になり、成約率が下がりやすいです（目安：専用LPの約${Math.round(B.lp.homepage.cvr * 100)}%）。`);
    }

    // 商圏
    if (ind.local && k.area === 'national') {
      add('bad', '地域型の業種なのに商圏が全国です', '来店が必要な業種で全国に配信すると、来られない地域の人にも広告費を使ってしまいます。実際にお客さんが来る範囲に絞りましょう。');
    } else if (!ind.local && (k.area === 'near' || k.area === 'city')) {
      add('ok', '商圏が狭めです', 'ネットで完結する業種は、地域を絞ると表示できる人が大きく減ります。本当に地域を限定する必要があるか確認しましょう。');
    }

    // 特別な広告カテゴリ（Meta）
    if (isMeta) {
      if (ind.specialCategory && k.specialCategory !== ind.specialCategory) {
        add('bad', '特別な広告カテゴリの申告が必要です', `${ind.label}の広告は、Metaでは「${labelOf('specialCategory', ind.specialCategory)}」カテゴリの申告が必要です。申告しないと広告が審査で止められることがあります。申告すると、年齢・性別・地域などのターゲティングが制限されます。`);
      } else if (!ind.specialCategory && k.specialCategory !== 'none') {
        add('ok', '特別な広告カテゴリは不要かもしれません', `${ind.label}は通常、特別な広告カテゴリにあたりません。必要がないのに申告すると、ターゲティングが制限されてしまいます。`);
      } else if (ind.specialCategory) {
        add('good', '特別な広告カテゴリを正しく申告しています', '申告すると年齢・性別などで細かく絞れなくなります。その分、広告文や素材で「誰向けか」を伝えるのが大切です。');
      }
      if (k.creative === 'none') {
        add('bad', 'Meta広告なのに素材がありません', 'Instagram・Facebookは画像や動画で目を止めてもらう媒体です。文字だけではクリック率が大きく下がります。');
      }
    }

    // 客単価とメニューの価格
    const gap = priceGap(k);
    if (gap) add('ok', '客単価と主力メニューの価格がずれています', priceGapText(gap));
    // 事業の中身（AIの提案に使う）
    const empty = allFieldIds().filter(id => fieldOf(id).aiHint && !freeFilled(id, k));
    if (!isMeta && empty.length) add('ok', '「事業の中身」に未入力の項目があります', `${empty.map(id => fieldOf(id).label.replace(/（.*?）/g, '')).join('・')}が未入力です。入力するとAIの提案（キーワード・広告文・検索語句）の精度が上がります。`);

    // 過去実績
    if (k.history === 'bad') {
      add('ok', '過去にうまくいかなかった経験があります', '前回の原因（計測していなかった・LPが弱かった・関係ない検索に出ていた など）を、このカルテで確認しておきましょう。同じ設定で始めると、同じ結果になりがちです。');
    }

    return { items: out, bench, benchCount };
  }

  /* ---------- 画面 ---------- */
  function showSim() {
    document.querySelectorAll('main > section').forEach(s => { s.hidden = s.id !== 'view-sim'; });
    $('#bottom-nav').hidden = true;
    document.body.classList.remove('has-nav');
    const badge = $('#mode-badge');
    badge.hidden = false;
    updateBadge();
    window.scrollTo(0, 0);
  }
  function updateBadge() {
    $('#mode-badge').textContent = `${st.karte.media === 'meta' ? 'Meta' : 'Google'}｜実践`;
  }

  function phaseTitle(p) {
    return typeof p.title === 'function' ? p.title(st.karte) : p.title;
  }

  function renderSteps() {
    const cur = PHASES.findIndex(p => p.id === phaseKey());
    return `<ol class="sim-steps" aria-label="シミュレーションの段階">${PHASES.map((p, i) => `
      <li class="${i < cur ? 'done' : i === cur ? 'active' : ''}"><span class="num">${i + 1}</span><span>${esc(phaseTitle(p))}${READY.includes(p.id) ? '' : '<small>準備中</small>'}</span></li>`).join('')}</ol>`;
  }
  const phaseKey = () => ({ diagnosis: 'karte', setupResult: 'setup', monthResult: 'improve', review: 'improve' })[st.phase] || st.phase;

  const SCREENS = {
    karte:       { title: () => '案件カルテを作ろう', body: () => renderKarte() },
    diagnosis:   { title: () => '案件カルテの診断', body: () => renderDiagnosis() },
    setup:       { title: () => st.karte.media === 'meta' ? 'オーディエンスを設定しよう' : 'キーワードを選ぼう', body: () => st.karte.media === 'meta' ? renderSetupMeta() : renderSetupGoogle() },
    setupResult: { title: () => st.karte.media === 'meta' ? 'オーディエンス設定の採点' : 'キーワード選びの採点', body: () => renderSetupResult() },
    result:      { title: () => '1ヶ月目の成果シミュレーション', body: () => renderResult() },
    improve:     { title: () => `${lastMonth().month}ヶ月目の運用改善`, body: () => renderImprove() },
    monthResult: { title: () => `${lastMonth().month}ヶ月目の成果`, body: () => renderMonthResult() },
    review:      { title: () => '3ヶ月の振り返り', body: () => renderReview() }
  };

  function render() {
    const sc = SCREENS[st.phase];
    const body = sc.body();
    view.innerHTML = `
      <div class="hero sim-hero">
        <p class="step-count">実践シミュレーション</p>
        <h1>${esc(sc.title())}</h1>
        ${renderSteps()}
      </div>
      <p class="sim-disclaimer">${DISCLAIMER}</p>
      ${body}
      <p class="sim-disclaimer sim-disclaimer-foot">${DISCLAIMER}</p>
      ${renderDock()}`;
    if (st.dirty) saveSoon(); // 途中の状態を自動で保存（別タブから戻ったり、閉じたりしても続きから再開できる）
  }

  function renderKarte() {
    const k = st.karte;
    const rest = missing().length;
    return `
      <p class="lead">広告を始める前に、案件（広告を出すお店や商品）の情報を整理します。サンプル案件を選ぶか、自分で項目を選んでください。この内容をもとに、あとの段階で設定と成果を計算します。</p>
      ${renderSavedCase()}

      <h2 class="sec-title">サンプル案件から選ぶ</h2>
      <div class="scenario-grid">
        ${C.samples.map(s => `
          <button type="button" class="sc-card ${st.sampleId === s.id ? 'sim-on' : ''}" data-action="sim-sample" data-id="${esc(s.id)}">
            <span class="sc-top"><span class="sc-icon" aria-hidden="true">${esc(s.icon)}</span><span class="tag">${esc(B.industries[s.karte.industry].label)}</span><span class="tag tag-level">${esc((C.media.find(m => m.value === s.karte.media) || {}).label)}</span></span>
            <strong>${esc(s.title)}</strong>
            <small>${esc(s.summary)}</small>
          </button>`).join('')}
      </div>
      <div class="end-actions"><button type="button" class="btn-ghost sm" data-action="sim-blank">白紙から入力する</button></div>

      <h2 class="sec-title">配信する媒体</h2>
      <div class="platform-switch" role="radiogroup" aria-label="配信する媒体">
        ${C.media.map(m => `
          <button type="button" class="pf-btn ${k.media === m.value ? 'on' : ''}" role="radio" aria-checked="${k.media === m.value}" data-action="sim-media" data-val="${m.value}">
            <span class="pf-icon" aria-hidden="true">${m.icon}</span>
            <span><strong>${esc(m.label)}</strong><small>${esc(m.desc)}</small></span>
          </button>`).join('')}
      </div>

      ${C.karteGroups.map(g => `
        <section class="field sim-group">
          <div class="field-head"><h3>${esc(g.title)}</h3></div>
          ${g.lead ? `<p class="sim-hint">${esc(g.lead)}</p>` : ''}
          ${g.fields.filter(id => shown(id)).map(renderItem).join('')}
          ${g.calc ? `<div class="sim-calc" id="sim-calc" aria-live="polite">${renderCalc()}</div>` : ''}
        </section>`).join('')}

      <div class="sim-submit">
        <p class="sim-rest" id="sim-rest">${rest ? `未選択の項目があと <b>${rest}</b> 個あります` : 'すべての項目を選びました'}</p>
        <button type="button" class="btn-primary" data-action="sim-diagnose" id="sim-diagnose" ${rest ? 'disabled' : ''}>カルテを確定して診断する</button>
      </div>`;
  }

  function renderSavedCase() {
    const d = st.saved;
    if (!d) return '';
    const k = d.karte, ind = B.industries[k.industry], media = C.media.find(m => m.value === k.media) || {};
    const area = (k.areaName || '').trim();
    const where = { karte: '案件カルテ', diagnosis: 'カルテの診断', setup: k.media === 'meta' ? 'オーディエンス設定' : 'キーワード選び', setupResult: '設定の採点', result: '成果シミュレーション', improve: '運用改善', monthResult: '運用改善', review: '3ヶ月の振り返り' }[d.phase] || '案件カルテ';
    const ais = Object.keys(P).filter(t => d.ai && d.ai[t]).map(t => P[t].label);
    return `<section class="field sim-saved">
      <p>💾 前回の続きがブラウザに保存されています：<b>${esc(ind.icon)} ${esc(ind.label)}｜${esc(media.label || '')}${area ? `（${esc(area)}）` : ''}</b>・${esc(where)}の途中${ais.length ? `・AIから取り込み済み：${esc(ais.join('・'))}` : ''}<small>${esc(atText(d.savedAt))} 保存</small></p>
      <div class="end-actions"><button type="button" class="btn-ghost sm" data-action="sim-clear-saved">保存を削除</button><button type="button" class="btn-primary sm" data-action="sim-load-saved">続きから再開する</button></div>
    </section>`;
  }

  const helpBtn = id => fieldOf(id).help ? `<button type="button" class="i-btn" data-action="sim-help" data-id="${id}" aria-label="${esc(fieldOf(id).label)}の解説">i</button>` : '';
  const reqTag = (id, word) => `<span class="sim-req" id="sim-req-${id}" ${filled(id) ? 'hidden' : ''}>${word}</span>`;

  const aiHintOf = id => fieldOf(id).aiHint ? `<p class="sim-hint sim-aihint" id="sim-aihint-${id}" ${freeFilled(id) ? 'hidden' : ''}>💡 入力するとAIの提案の精度が上がります</p>` : '';
  function renderItem(id) {
    const f = fieldOf(id), v = st.karte[id];
    if (f.type === 'menus') {
      const rows = v && v.length ? v : [{ name: '', price: null }], g = priceGap();
      return `<div class="sim-item" id="sim-item-${id}">
        <span class="sim-label">${esc(f.label)}</span>
        ${f.hint ? `<p class="sim-hint">${esc(f.hint)}</p>` : ''}
        <ul class="sim-menus">${rows.map((m, i) => `
          <li><input type="text" class="sim-text" data-menu="${i}" data-mf="name" value="${esc(m.name)}" placeholder="例：インプラント" aria-label="メニュー${i + 1}の名前">
            <span class="num-wrap"><input type="number" inputmode="numeric" data-menu="${i}" data-mf="price" min="0" step="100" value="${m.price ?? ''}" placeholder="価格" aria-label="メニュー${i + 1}の価格"><span class="unit">円</span></span>
            ${rows.length > 1 ? `<button type="button" class="x" data-action="sim-menu-remove" data-i="${i}" aria-label="メニュー${i + 1}を削除">×</button>` : ''}</li>`).join('')}</ul>
        <button type="button" class="btn-ghost sm" data-action="sim-menu-add">＋ メニューを追加</button>
        ${aiHintOf(id)}
        <p class="sim-alert ok" id="sim-menu-check" ${g ? '' : 'hidden'}>${g ? `⚠️ ${esc(priceGapText(g))}` : ''}</p>
      </div>`;
    }
    if (f.type === 'text') {
      return `<div class="sim-item">
        <label class="sim-label" for="sim-${id}">${esc(f.label)}</label>
        ${f.rows === 1
          ? `<input type="text" id="sim-${id}" class="sim-text" data-sim="${id}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}">`
          : `<textarea id="sim-${id}" class="sim-text" rows="${f.rows || 2}" data-sim="${id}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`}
        ${aiHintOf(id)}
      </div>`;
    }
    if (f.type === 'number') {
      return `<div class="sim-item" id="sim-item-${id}">
        <div class="sim-label-row"><label class="sim-label" for="sim-${id}">${esc(f.label)}</label>${reqTag(id, f.optional ? '範囲外' : '未入力')}${helpBtn(id)}</div>
        ${f.hint ? `<p class="sim-hint">${esc(f.hint)}</p>` : ''}
        <div class="num-wrap">
          <input type="number" inputmode="numeric" id="sim-${id}" data-sim="${id}" value="${v ?? ''}" min="${f.min ?? 0}" ${f.max != null ? `max="${f.max}"` : ''} step="${f.step || 1}" placeholder="${esc(f.placeholder || '')}">
          <span class="unit">${esc(f.unit)}</span>
        </div>
        <p class="sim-hint sim-echo" id="sim-echo-${id}">${echoOf(id)}</p>
      </div>`;
    }
    const opts = optionsOf(id);
    const list = opts.some(o => o.desc)
      ? `<div class="opts">${opts.map(o => `
          <label class="opt"><input type="radio" name="sim-${id}" value="${esc(o.value)}" data-sim="${id}" ${v === o.value ? 'checked' : ''}>
            <span class="opt-main"><span class="opt-label">${esc(o.label)}</span><span class="opt-desc">${esc(o.desc)}</span></span></label>`).join('')}</div>`
      : `<div class="sim-chips">${opts.map(o => `
          <label class="sim-chip"><input type="radio" name="sim-${id}" value="${esc(o.value)}" data-sim="${id}" ${v === o.value ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</div>`;
    return `<fieldset class="sim-item" id="sim-item-${id}">
      <legend class="sim-label sim-label-row"><span>${esc(f.label)}</span>${reqTag(id, '未選択')}${helpBtn(id)}</legend>
      ${f.hint ? `<p class="sim-hint">${esc(f.hint)}</p>` : ''}
      ${list}
    </fieldset>`;
  }

  // 数値入力の下に出す補足（金額の読み方・範囲外の注意）
  function echoOf(id) {
    const f = fieldOf(id), v = st.karte[id];
    if (v == null) return '';
    if (!validNum(id, v)) return `<span class="sim-warn">${f.max != null ? `1〜${f.max}` : '1以上'}の数で入力してください</span>`;
    if (id === 'budget') return `＝ ${manYen(v)}（1日あたり約${yen(v / B.budget.daysPerMonth)}）`;
    return f.unit === '円' ? `＝ ${manYen(v)}` : '';
  }

  // 目標の自動計算（途中式つき）
  function renderCalc() {
    const k = st.karte, g = syncGoals();
    const n = x => Math.abs(x - Math.round(x)) < 0.005 ? fmt(x) : x.toFixed(1);
    const roundNote = (raw, c) => Math.abs(raw - c) < 0.005 ? '' : ` → <b>切り上げて${fmt(c)}件</b>`;
    if (!g) {
      const need = [!k.cvType && 'CVの種類', !validNum('salesTarget', k.salesTarget) && '月の売上目標', !validNum('price', k.price) && '客単価', k.cvType === 'lead' && !validNum('closeRate', k.closeRate) && '成約率'].filter(Boolean);
      return `<h4>🧮 目標CV数・目標CPAの自動計算</h4><p class="sim-hint">${esc(need.join('・'))}を入れると、目標CV数と目標CPAを自動で計算します。</p>`;
    }
    const steps = [];
    if (g.lead) {
      steps.push(`<li><b>① 必要な成約数</b>＝ 月の売上目標 ${yen(k.salesTarget)} ÷ 客単価 ${yen(k.price)} ＝ ${n(g.dealsRaw)}件${roundNote(g.dealsRaw, g.deals)}</li>`);
      steps.push(`<li><b>② 目標CV数（問い合わせ・予約の数）</b>＝ 必要な成約数 ${fmt(g.deals)}件 ÷ 成約率 ${k.closeRate}% ＝ ${n(g.cvRaw)}件${roundNote(g.cvRaw, g.cv)}</li>`);
    } else {
      steps.push(`<li><b>① 目標CV数（購入の数）</b>＝ 月の売上目標 ${yen(k.salesTarget)} ÷ 客単価 ${yen(k.price)} ＝ ${n(g.cvRaw)}件${roundNote(g.cvRaw, g.cv)}</li>`);
    }
    const no = g.lead ? ['③', '④'] : ['②', '③'];
    steps.push(g.cpa
      ? `<li><b>${no[0]} 予算から見たCPA</b>＝ 月の広告予算 ${yen(k.budget)} ÷ 目標CV数 ${fmt(g.cv)}件 ＝ ${yen(g.cpa)}</li>`
      : `<li><b>${no[0]} 予算から見たCPA</b>：月の広告予算を入れると計算します</li>`);
    steps.push(g.upper
      ? `<li><b>${no[1]} 上限CPA（これを超えると赤字）</b>＝ 客単価 ${yen(k.price)} × 粗利率 ${k.margin}%${g.lead ? ` × 成約率 ${k.closeRate}%` : ''} ＝ ${yen(g.upper)}</li>`
      : `<li><b>${no[1]} 上限CPA（これを超えると赤字）</b>：粗利率（任意）を入れると表示します</li>`);

    const notes = [];
    if (g.cpa && g.upper && g.cpa > g.upper) {
      notes.push(`<p class="sim-alert bad">⚠️ <b>この予算と目標では赤字になります。目標か予算を見直しましょう。</b><br>予算から見たCPA ${yen(g.cpa)} が上限CPA ${yen(g.upper)} を、1件あたり約${yen(g.cpa - g.upper)}上回っています。</p>`);
    }
    const bench = benchLoose(k);
    if (g.cpa && bench) {
      const ratio = g.cpa / bench.cpa;
      const more = bench.partial ? '（LP・検討期間などを選ぶと、目安がより正確になります）' : '';
      if (ratio < B.diagnosis.cpaTight) {
        notes.push(`<p class="sim-alert ok">⚠️ <b>達成が難しい目標です。</b><br>予算から見たCPA ${yen(g.cpa)} は、この業種の目安CPA 約${yen(bench.cpa)} の${Math.round(ratio * 100)}%しかありません。予算を増やすか、売上目標を下げる、成約率を上げるなどを検討しましょう。${more}</p>`);
      } else {
        notes.push(`<p class="sim-hint">業種の目安CPA 約${yen(bench.cpa)} と比べて、予算から見たCPAは目安の${Math.round(ratio * 100)}%です。${more}</p>`);
      }
    } else if (g.cpa) {
      notes.push('<p class="sim-hint">業態を選ぶと、業種の目安CPAと比べられます。</p>');
    }

    return `<h4>🧮 目標CV数・目標CPAの自動計算</h4>
      <ol class="sim-formula">${steps.join('')}</ol>
      <div class="sim-kpis">
        <div><small>目標CV数（月）</small><b>${fmt(g.cv)}件</b>${g.lead ? `<small>成約 ${fmt(g.deals)}件</small>` : ''}</div>
        <div><small>目標CPA（予算から見たCPA）</small><b>${g.cpa ? yen(g.cpa) : '―'}</b></div>
        <div><small>上限CPA</small><b>${g.upper ? yen(g.upper) : '―'}</b></div>
      </div>
      <p class="sim-hint">↑ この目標CV数と目標CPAを、案件カルテの目標として使います。</p>
      ${notes.join('')}`;
  }

  function updateCalc() {
    const el = $('#sim-calc');
    if (el) el.innerHTML = renderCalc();
  }

  function openHelp(id) {
    const f = fieldOf(id), h = f.help;
    if (!h) return;
    $('#modal-body').innerHTML = `<h2 id="modal-title">${esc(f.label)}</h2>
      <h3>📖 どういうもの？</h3><p>${esc(h.what)}</p>
      ${h.example ? `<h3>✏️ 例</h3><p>${esc(h.example)}</p>` : ''}
      ${h.tip ? `<div class="tip"><strong>💡 ポイント</strong>${esc(h.tip)}</div>` : ''}`;
    $('#modal').hidden = false;
    $('.modal-dialog').scrollTop = 0;
    document.body.classList.add('modal-open');
    $('#modal-close').focus();
  }

  function renderDiagnosis() {
    const k = st.karte;
    const { items, bench } = diagnose(k);
    const isMeta = k.media === 'meta';
    const count = lv => items.filter(x => x.level === lv).length;
    const media = C.media.find(m => m.value === k.media);
    return `
      <p class="lead">入力した案件カルテを、目安の数値と照らし合わせてチェックしました。広告の設定に進む前に、気になる点がないか確認しましょう。</p>

      <section class="field">
        <div class="field-head"><h3>${esc(media.icon)} ${esc(media.label)}｜${esc(B.industries[k.industry].label)}</h3></div>
        <dl class="sim-karte">
          ${allFieldIds().filter(id => !isFree(id) && shown(id)).map(id => `<dt>${esc(fieldOf(id).label.replace(/（.*?）/g, ''))}</dt><dd>${esc(valueText(id))}</dd>`).join('')}
          <dt>目標CV数</dt><dd><b>${fmt(k.targetCount)}件</b>（月）</dd>
          <dt>目標CPA</dt><dd><b>${yen(k.targetCpa)}</b>（予算から見たCPA）</dd>
          <dt>上限CPA</dt><dd>${k.upperCpa ? yen(k.upperCpa) : '―（粗利率が未入力）'}</dd>
          ${allFieldIds().filter(id => fieldOf(id).aiHint && freeFilled(id)).map(id => `<dt>${esc(fieldOf(id).label.replace(/（.*?）/g, ''))}</dt><dd>${esc(valueText(id))}</dd>`).join('')}
          ${k.memo.trim() ? `<dt>メモ</dt><dd>${esc(k.memo)}</dd>` : ''}
        </dl>
      </section>

      <section class="field">
        <div class="field-head"><h3>📏 この案件の目安</h3></div>
        <div class="sim-kpis">
          ${isMeta ? `<div><small>CPM（1000回表示）</small><b>${yen(bench.cpm)}</b></div><div><small>クリック率</small><b>${pct(bench.ctr, 2)}</b></div>` : `<div><small>クリック率</small><b>${pct(bench.ctr)}</b></div>`}
          <div><small>クリック単価</small><b>${yen(bench.cpc)}</b></div>
          <div><small>成約率</small><b>${pct(bench.cvr, 2)}</b></div>
          <div><small>CPA</small><b>${yen(bench.cpa)}</b></div>
        </div>
        <p class="sim-hint">業種の目安に、LP・検討期間${isMeta ? '・素材・計測' : ''}の補正をかけた値です。キーワードや配信設定によって、次の段階で変わります。</p>
      </section>

      <div class="counts sim-counts"><span class="count good">◎ 良い ${count('good')}</span><span class="count ok">△ 注意 ${count('ok')}</span><span class="count bad">× 要対応 ${count('bad')}</span></div>
      ${items.map(x => `
        <article class="res-item ${x.level === 'info' ? 'sim-info' : x.level}">
          <div class="res-head"><span class="mark ${x.level === 'info' ? '' : x.level}">${{ good: '◎ 良い', ok: '△ 注意', bad: '× 要対応', info: '📊 見込み' }[x.level]}</span><h3>${esc(x.title)}</h3></div>
          <p class="reason">${esc(x.text)}</p>
        </article>`).join('')}

      ${isMeta ? '' : `<section class="field">
        <div class="field-head"><h3>🤖 キーワード候補をAIで作る <small class="sim-hint">（任意）</small></h3></div>
        <p class="sim-hint">この案件カルテをAI（Claude）に渡して、キーワード候補を作ってもらえます。使わない場合は、次の画面で「サンプル」か「型から自動生成」を選べます。</p>
        ${renderAiFlow('kw', '<button type="button" class="btn-primary" data-action="sim-to-setup">次へ：キーワード選び →</button>')}
      </section>`}

      <div class="end-actions">
        <button type="button" class="btn-ghost" data-action="sim-edit">← カルテを修正する</button>
        <button type="button" class="btn-primary" data-action="sim-to-setup">次へ：${esc(phaseTitle(PHASES[1]))} →</button>
      </div>`;
  }

  function updateRest() {
    const rest = missing().length;
    $('#sim-rest').innerHTML = rest ? `未選択の項目があと <b>${rest}</b> 個あります` : 'すべての項目を選びました';
    $('#sim-diagnose').disabled = rest > 0;
  }

  /* =========================================================
     段階2：キーワード選び（Google）／オーディエンス設定（Meta）
     ========================================================= */
  const areaWord = () => (st.karte.areaName || '').trim() || '〇〇';
  const tplWords = () => C.kwTemplates.words[st.karte.industry] || { main: B.industries[st.karte.industry].label, act: '申し込み', sub: '' };
  const fillWords = t => { const w = tplWords(); return String(t).replace(/\{main\}/g, w.main).replace(/\{act\}/g, w.act).replace(/\{sub\}/g, w.sub); };
  const fill = t => fillWords(t).replace(/\{area\}/g, areaWord());
  // キーワード候補は、設定を始めたときの作り方で決まり、st.setup.cands に入る（サンプル・型・AI）
  const kwList = () => (st.setup && st.setup.cands) || [];
  const negGroups = () => C.negativeGroups[st.karte.industry] || C.commonNegativeGroups;
  // 広告文の候補は st.setup.hls（見出し）・st.setup.descs（説明文。AIから取り込んだときだけ）
  const hlList = () => (st.setup && st.setup.hls) || C.headlines[st.karte.industry] || C.commonHeadlines;
  const descList = () => (st.setup && st.setup.descs) || [];
  // 検索語句レポートの言葉。AIから取り込んだら、その種類の分だけ入れ替える
  function searchTermsOf() {
    const base = C.searchTerms[st.karte.industry] || C.commonSearchTerms, t = st.setup && st.setup.terms;
    if (!t) return base;
    return { variants: t.variants.length ? t.variants : base.variants, groups: Object.assign({}, base.groups, t.groups) };
  }
  const isTermKw = c => !c.volume; // 除外キーワード向けの単語（検索数を持たない候補）
  const MATCH_CODE = { exact: t => `[${t}]`, phrase: t => `"${t}"`, broad: t => t };
  const ACT_LABEL = { add: '使う', negative: '除外', skip: '使わない' };
  const MARK_TEXT = { good: '◎ 正解', ok: '△ 惜しい', bad: '× 見直し' };
  const PTS = { good: 2, ok: 1, bad: 0 };
  const QUALITY_LABEL = { high: '高い', mid: 'ふつう', low: '低い' };
  const special = () => !!st.karte.specialCategory && st.karte.specialCategory !== 'none';

  function initSetup(source = st.kwSource) {
    if (!source || (source === 'sample' && !hasSample())) source = defaultSource();
    const cands = candidatesOf(source);
    st.kwSource = source;
    st.setup = {
      industry: st.karte.industry, media: st.karte.media, source, cands, aiAt: source === 'ai' && st.ai.kw ? st.ai.kw.at : null,
      kw: cands.map(() => ({ act: null, match: null })),
      customNeg: [], headlines: [], descriptions: [], area: null, bidding: null, bid: null,
      terms: null, termsSource: 'auto', // 検索語句レポート（null は自動。AIから取り込むと { variants, groups }）
      meta: {}
    };
    setAds(st.adSource || 'auto');
  }
  // 広告文の候補（見出し hls・説明文 descs）を作り方に合わせて入れ替える。選択はリセット
  function setAds(adSource) {
    const s = st.setup, ai = adSource === 'ai' && st.ai.ad;
    const toAd = x => ({ text: x.text, quality: x.quality, themes: [], kws: x.kws, ai: true, reason: `${x.reason || '（AIの理由なし）'}（AIの評価：${AD_RATING[x.quality]}）` });
    st.adSource = s.adSource = adSource;
    s.adAt = ai ? st.ai.ad.at : null;
    s.hls = adSource === 'ai' ? (ai ? st.ai.ad.items.filter(x => x.kind === 'headline').map(toAd) : []) : (C.headlines[st.karte.industry] || C.commonHeadlines);
    s.descs = ai ? st.ai.ad.items.filter(x => x.kind === 'description').map(toAd) : [];
    s.headlines = [];
    s.descriptions = [];
  }
  const setupStale = () => !st.setup || st.setup.industry !== st.karte.industry || st.setup.media !== st.karte.media
    || (!!st.kwSource && st.setup.source !== st.kwSource)
    || (st.setup.source === 'ai' && st.setup.aiAt !== (st.ai.kw && st.ai.kw.at));

  /* ---------- キーワード候補の作り方（サンプル／型から自動生成／AIの回答を取り込む） ---------- */
  const KW_SOURCES = [
    { value: 'sample',   label: '📘 サンプルの手作り候補', desc: '解説つきで用意した候補。歯科・クリニック／パーソナルジム／不動産の3業種で使えます' },
    { value: 'template', label: '🧩 型から自動生成',       desc: '「地域名＋業種」「〇〇 料金」「〇〇 求人」などの型から作ります。すべての業種で使えます' },
    { value: 'ai',       label: '🤖 AIの回答を取り込む',   desc: '案件カルテをAI（ChatGPT・Claude・Geminiなど）に渡して作った候補を貼り付けます' }
  ];
  const AD_SOURCES = [
    { value: 'auto', label: '📝 用意した見出しから選ぶ（今までどおり）', desc: '業種ごとに用意した見出しの候補から選びます' },
    { value: 'ai',   label: '🤖 AIの回答を取り込む', desc: '案件カルテとキーワードをAIに渡して、見出し・説明文を作ってもらいます（良い例・悪い例が混ざります）' }
  ];
  const hasSample = () => !!(C.keywords[st.karte.industry] || []).length;
  const defaultSource = () => hasSample() ? 'sample' : 'template';
  const AI_INTENT = { high: '強', mid: '中', low: '弱', neg: '除外' };

  function candidatesOf(source) {
    if (source === 'sample') return C.keywords[st.karte.industry] || [];
    if (source === 'ai') return st.ai.kw ? st.ai.kw.items.map(aiCandidate) : [];
    const local = B.industries[st.karte.industry].local, cpc = B.industries[st.karte.industry].search.cpc;
    return C.kwTemplates.patterns.filter(p => p.local == null || p.local === local).map(({ local: _, ...p }) => Object.assign(p, {
      kw: fillWords(p.kw).replace(/\s+/g, ' ').trim(),
      cpc: Math.round(cpc * p.cpc / 10) * 10, theme: p.volume ? 'general' : ''
    }));
  }
  // AIが付けた検索意図の強さを正解として採点する
  const AI_ANSWER = {
    high: { ans: 'add', best: ['phrase', 'exact'], ok: ['broad'] },
    mid:  { ans: 'add', best: ['phrase'], ok: ['exact', 'skip'] },
    low:  { ans: 'skip', best: [], ok: ['negative', 'phrase'] },
    neg:  { ans: 'negative', best: [], ok: ['skip'] }
  };
  function aiCandidate(x) {
    const neg = x.intent === 'neg', scale = B.area[st.karte.area].searchScale;
    return Object.assign({
      kw: x.kw, intent: neg ? 'low' : x.intent, ai: true,
      cpc: neg ? 0 : x.cpc,
      // AIの検索数は「カルテの商圏で」の数なので、市区町村の規模に直して持つ（表示では商圏の倍率を掛け直す）
      volume: neg ? 0 : Math.max(1, x.volume) / scale,
      theme: neg ? '' : 'general',
      reason: `${x.reason || '（AIの理由なし）'}（AIの判定：${AI_INTENT[x.intent]}）`
    }, AI_ANSWER[x.intent]);
  }

  /* ---------- AIの回答の読み込み ----------
   * 前後に文章やコードブロック（```）があっても、JSONの部分を探して読み込む。
   * 項目名は日本語・英語のどちらでもよい。数値は「300円」「1,200回」「100〜200」「1.2万」なども読む。
   * 指示文は sim-prompts.js にある。返してもらう項目名を変えたら、ここの AI_KEYS も直す。
   */
  const AI_KEYS = {
    // キーワード候補
    kw:     ['キーワード', 'keyword', 'kw', '語句', 'word', 'query'],
    intent: ['検索意図の強さ', '検索意図', '意図の強さ', '意図', '強さ', 'intent', 'strength'],
    cpc:    ['想定クリック単価', 'クリック単価', '単価', 'cpc'],
    volume: ['想定月間検索数', '月間検索数', '検索数', '検索ボリューム', 'volume', 'searches', 'searchvolume'],
    reason: ['理由', '説明', 'reason', 'note'],
    // 広告文
    text:   ['文章', '広告文', 'テキスト', '本文', 'text', 'copy'],
    kind:   ['種類', '区分', 'kind', 'type'],
    rating: ['評価', '判定', '良し悪し', 'quality', 'rating', 'grade'],
    kws:    ['合うキーワード', '関連キーワード', 'キーワード', 'keywords', 'keyword'],
    // 検索語句レポート
    q:      ['検索語句', '検索クエリ', '語句', '言葉', 'query', 'term', 'searchterm', 'word'],
    rel:    ['関係', '関係の有無', 'relevance', 'relevant'],
    group:  ['種類', '分類', 'カテゴリ', 'category', 'group', 'type'],
    amount: ['多さ', '頻度', '量', 'amount', 'frequency', 'weight']
  };
  const normKey = k => String(k).toLowerCase().replace(/[\s_（）()「」]/g, '');
  const toHalf = s => String(s).replace(/[０-９．，]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  function pick(o, name) {
    const keys = Object.keys(o).filter(k => k !== '__parent'), want = AI_KEYS[name].map(normKey);
    const k = keys.find(k => want.includes(normKey(k))) || keys.find(k => want.some(w => normKey(k).includes(w)));
    return k == null ? undefined : o[k];
  }
  function parseNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v == null) return null;
    const t = toHalf(v).replace(/,/g, '');
    const ns = (t.match(/\d+(?:\.\d+)?万?/g) || []).map(x => x.endsWith('万') ? parseFloat(x) * 10000 : parseFloat(x));
    if (!ns.length) return null;
    return ns.length >= 2 && /[〜~\-－ー]/.test(t) ? (ns[0] + ns[1]) / 2 : ns[0];
  }
  function parseIntent(v) {
    const t = toHalf(v ?? '').toLowerCase();
    if (/除外|negative|exclude/.test(t)) return 'neg';
    if (/強|高|high|strong/.test(t)) return 'high';
    if (/中|普通|ふつう|mid|medium/.test(t)) return 'mid';
    if (/弱|低|low|weak/.test(t)) return 'low';
    return null;
  }
  // 文字列の中から、JSONとして読める { } / [ ] の部分を順に探す
  function jsonCandidates(text) {
    const out = [];
    for (let i = 0; i < text.length && out.length < 20; i++) {
      const open = text[i];
      if (open !== '{' && open !== '[') continue;
      let depth = 0, str = false, esc2 = false;
      for (let j = i; j < text.length; j++) {
        const ch = text[j];
        if (str) { if (esc2) esc2 = false; else if (ch === '\\') esc2 = true; else if (ch === '"') str = false; continue; }
        if (ch === '"') str = true;
        else if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') { depth--; if (!depth) { out.push(text.slice(i, j + 1)); i = j; break; } }
      }
    }
    return out.sort((a, b) => b.length - a.length);
  }
  // JSONの中から、key の項目を持つオブジェクトを集める。__parent には、入っていた一覧の名前（「除外」「説明文」など）が入る
  function collectItems(v, key, parent = '', out = []) {
    const isItem = x => { const p = pick(x, key); return p != null && typeof p !== 'object'; };
    if (Array.isArray(v)) {
      v.forEach(x => {
        if (typeof x === 'string') out.push({ [AI_KEYS[key][0]]: x, __parent: parent });
        else if (x && typeof x === 'object') isItem(x) ? out.push(Object.assign({ __parent: parent }, x)) : collectItems(x, key, parent, out);
      });
    } else if (v && typeof v === 'object') {
      if (isItem(v)) out.push(Object.assign({ __parent: parent }, v));
      else Object.entries(v).forEach(([k, x]) => collectItems(x, key, k, out));
    }
    return out;
  }
  // AIの回答から、key の項目を持つ一覧を取り出す（読めなければ error）
  // 回答がどの種類のものか（別の取り込み欄に貼り付けていないかの確認に使う）
  const KIND_TESTS = {
    kw: d => collectItems(d, 'kw').some(x => pick(x, 'intent') != null),
    ad: d => collectItems(d, 'text').some(x => pick(x, 'rating') != null),
    terms: d => collectItems(d, 'q').some(x => /関係ない|言い換え|irrelevant|variant/i.test(x.__parent))
  };
  const KEY_OF = { kw: 'kw', ad: 'text', terms: 'q' };
  function extractItems(raw, key, what) {
    const target = Object.keys(KEY_OF).find(t => KEY_OF[t] === key);
    const text = toHalf(String(raw || '')).replace(/[“”″]/g, '"').replace(/[‘’]/g, "'").trim();
    if (!text) return { error: 'AIの回答が貼り付けられていません。AIの返答をすべてコピーして、ここに貼り付けてください。' };
    const blocks = jsonCandidates(text);
    const BROKEN = 'JSONの形が崩れていて読み込めませんでした（途中で切れている・カンマや " が足りないなど）。回答が最後まで表示されているか確認して、もう一度コピーしてください。';
    if (!blocks.length && /[{[]/.test(text)) return { error: BROKEN };
    if (!blocks.length) return { error: 'JSON（{ } や [ ] で囲まれた部分）が見つかりませんでした。AIに「指定のJSON形式だけで返してください」と伝えて、もう一度作ってもらいましょう。' };
    for (const b of blocks) {
      for (const t of [b, b.replace(/,\s*([}\]])/g, '$1')]) {
        let d;
        try { d = JSON.parse(t); } catch (e) { continue; /* 次の候補を試す */ }
        const other = !KIND_TESTS[target](d) && Object.keys(KIND_TESTS).find(k => k !== target && KIND_TESTS[k](d));
        if (other) return { error: `これは「${P[other].label}」の回答のようです。${P[other].label}の取り込み欄に貼り付けるか、この欄の「AI用にコピー」から作り直してください。` };
        const items = collectItems(d, key);
        if (items.length) return { items };
      }
    }
    const parsable = blocks.some(b => { try { JSON.parse(b.replace(/,\s*([}\]])/g, '$1')); return true; } catch (e) { return false; } });
    return { error: parsable ? `JSONは読めましたが、${what}が見つかりませんでした。今の画面でコピーした指示文をAIに渡したか、項目名（${AI_KEYS[key][0]}など）が合っているか確認してください。` : BROKEN };
  }
  const cleanText = v => String(v ?? '').replace(/^[-−]+/, '').replace(/[\[\]"]/g, '').replace(/\s+/g, ' ').trim();
  // 文字数（半角=1・全角=2で数える。Googleの見出しは30・説明文は90まで）
  const widthOf = t => [...t].reduce((a, ch) => a + (/[ -~｡-ﾟ]/.test(ch) ? 1 : 2), 0);

  // キーワード候補
  function parseAiAnswer(raw) {
    const r = extractItems(raw, 'kw', 'キーワードの一覧');
    if (r.error) return r;
    const items = [], warns = [], seen = new Set();
    r.items.forEach((o, n) => {
      const kw = cleanText(pick(o, 'kw'));
      const no = `${n + 1}件目${kw ? `「${kw}」` : ''}`;
      if (!kw) { warns.push(`${no}：キーワードが空なので読み飛ばしました`); return; }
      if (seen.has(kw)) { warns.push(`${no}：同じキーワードが2回あるので、1つにまとめました`); return; }
      let intent = parseIntent(pick(o, 'intent'));
      if (!intent && /除外|negative|exclu/i.test(o.__parent)) intent = 'neg';
      if (!intent) { warns.push(`${no}：検索意図の強さ（強／中／弱／除外）が読めないので読み飛ばしました`); return; }
      const item = { kw, intent, cpc: 0, volume: 0, reason: String(pick(o, 'reason') ?? '').trim() };
      if (intent !== 'neg') {
        const cpc = parseNum(pick(o, 'cpc')), vol = parseNum(pick(o, 'volume'));
        if (cpc > 0) item.cpc = Math.min(Math.round(cpc), 50000);
        else { item.cpc = B.industries[st.karte.industry].search.cpc; warns.push(`${no}：クリック単価が読めないので、業種の目安（${yen(item.cpc)}）を使います`); }
        if (vol > 0) item.volume = Math.min(Math.round(vol), 10000000);
        else { item.volume = 100; warns.push(`${no}：検索数が読めないので、月100回として計算します`); }
      }
      seen.add(kw);
      items.push(item);
    });
    if (!items.length) return { error: 'キーワードを1つも読み込めませんでした。', warns };
    if (!items.some(x => x.intent !== 'neg')) return { error: '除外キーワードの候補しかありませんでした。使うキーワード（強・中・弱）も作ってもらいましょう。', warns };
    if (items.length > 40) { warns.push(`候補が${items.length}個あったので、最初の40個だけ読み込みました`); items.length = 40; }
    const cnt = Object.keys(AI_INTENT).map(i => `${AI_INTENT[i]}${items.filter(x => x.intent === i).length}`).join('・');
    return { data: { items }, warns, summary: `${items.length}個のキーワード候補（${cnt}）` };
  }

  // 広告文（見出し・説明文）
  const AD_LIMIT = { headline: 30, description: 90 };
  const AD_RATING = { high: '良い', mid: '普通', violation: '違反' };
  function parseRating(v) {
    const t = toHalf(v ?? '').toLowerCase();
    if (/違反|悪|ng|bad|violation/.test(t)) return 'violation';
    if (/普通|ふつう|中|mid|normal|average/.test(t)) return 'mid';
    if (/良|good|high|ok/.test(t)) return 'high';
    return null;
  }
  function parseAiAd(raw) {
    const r = extractItems(raw, 'text', '広告文の一覧');
    if (r.error) return r;
    const items = [], warns = [], seen = new Set();
    r.items.forEach((o, n) => {
      const text = String(pick(o, 'text') ?? '').replace(/\s+/g, ' ').trim();
      const no = `${n + 1}件目${text ? `「${text}」` : ''}`;
      if (!text) { warns.push(`${no}：文章が空なので読み飛ばしました`); return; }
      if (seen.has(text)) { warns.push(`${no}：同じ文章が2回あるので、1つにまとめました`); return; }
      const k = `${pick(o, 'kind') ?? ''} ${o.__parent}`;
      const kind = /説明|desc/i.test(k) ? 'description' : /見出し|headline|title/i.test(k) ? 'headline' : widthOf(text) > AD_LIMIT.headline ? 'description' : 'headline';
      const quality = parseRating(pick(o, 'rating'));
      if (!quality) { warns.push(`${no}：評価（良い／普通／違反）が読めないので読み飛ばしました`); return; }
      const kwsRaw = pick(o, 'kws');
      const kws = (Array.isArray(kwsRaw) ? kwsRaw : typeof kwsRaw === 'string' ? kwsRaw.split(/[、,／\/]/) : []).map(cleanText).filter(Boolean);
      if (widthOf(text) > AD_LIMIT[kind]) warns.push(`${no}：${kind === 'headline' ? '見出し' : '説明文'}の文字数の上限（全角${AD_LIMIT[kind] / 2}文字）を超えています。実際の広告では入稿できないので注意しましょう`);
      seen.add(text);
      items.push({ kind, text, quality, kws, reason: String(pick(o, 'reason') ?? '').trim() });
    });
    const hs = items.filter(x => x.kind === 'headline'), ds = items.filter(x => x.kind === 'description');
    if (!hs.length) return { error: '見出しを1つも読み込めませんでした。「種類」が「見出し」の文があるか確認してください。', warns };
    if (!ds.length) warns.push('説明文がなかったので、見出しだけを取り込みました');
    if (hs.length > 15) { warns.push(`見出しが${hs.length}個あったので、最初の15個だけ読み込みました`); hs.length = 15; }
    if (ds.length > 6) { warns.push(`説明文が${ds.length}個あったので、最初の6個だけ読み込みました`); ds.length = 6; }
    return { data: { items: [...hs, ...ds] }, warns, summary: `見出し${hs.length}個・説明文${ds.length}個` };
  }

  // 検索語句レポート（関係ない検索語句・言い換えの言葉）
  function groupOfLabel(v, q) {
    const gs = negGroups(), t = String(v ?? '').trim();
    const g = t && (gs.find(g => g.label === t) || gs.find(g => g.label.includes(t) || t.includes(g.label))
      || gs.find(g => g.label.split(/[・（）()]/).some(w => w.length >= 2 && t.includes(w))));
    return g ? g.id : groupOfWord(q) || (gs.find(g => g.id === 'other') || gs[gs.length - 1]).id;
  }
  function parseAiTerms(raw) {
    const r = extractItems(raw, 'q', '検索語句の一覧');
    if (r.error) return r;
    const irr = [], variants = [], warns = [], seen = new Set();
    r.items.forEach((o, n) => {
      const q = cleanText(pick(o, 'q'));
      const no = `${n + 1}件目${q ? `「${q}」` : ''}`;
      if (!q) { warns.push(`${no}：検索語句が空なので読み飛ばしました`); return; }
      if (seen.has(q)) return;
      seen.add(q);
      const rel = `${pick(o, 'rel') ?? ''} ${o.__parent}`;
      if (!/ない|無関係|irrelevant|negative|除外/i.test(rel) && /言い換え|付け足|variant|modif|関係ある|relevant/i.test(rel)) {
        if (variants.length < 6) variants.push(q);
        return;
      }
      const a = pick(o, 'amount'), at = toHalf(a ?? '');
      const w = /多/.test(at) ? 3 : /少/.test(at) ? 1 : parseNum(a) > 0 ? Math.min(parseNum(a), 10) : 2;
      irr.push({ q, group: groupOfLabel(pick(o, 'group'), q), w, reason: String(pick(o, 'reason') ?? '').trim() });
    });
    if (irr.length < 3) return { error: `関係ない検索語句が${irr.length}個しか読み込めませんでした（3個以上必要です）。「関係ない検索語句」の一覧があるか確認してください。`, warns };
    if (irr.length > 40) { warns.push(`関係ない検索語句が${irr.length}個あったので、最初の40個だけ読み込みました`); irr.length = 40; }
    if (!variants.length) warns.push('言い換えの言葉がなかったので、言い換えは今までどおり自動で作ります');
    return { data: { irr, variants }, warns, summary: `関係ない検索語句${irr.length}個・言い換え${variants.length}個` };
  }

  /* ---------- 「AI用にコピー」：指示文＋案件カルテ ---------- */
  function karteText(k = st.karte) {
    syncGoals();
    const lines = allFieldIds().filter(id => shown(id, k) && !(k.media !== 'meta' && (id === 'specialCategory' || id === 'creative'))).map(id => {
      const v = valueText(id, k), label = fieldOf(id).label.replace(/（(?!最寄り|名前).*?）/g, '');
      // 事業の中身は、未入力でも項目を残す（AIが「情報がない」と分かるように）
      if (fieldOf(id).type === 'menus') return `- ${label}：${menusOf(k).length ? '\n' + menusOf(k).map(m => `  - ${m.name.trim()}${Number(m.price) > 0 ? `：${yen(Number(m.price))}` : m.price === 0 || m.price === '0' ? '：無料' : ''}`).join('\n') : '（未入力）'}`;
      if (fieldOf(id).aiHint) return `- ${label}：${String(v || '').trim() || '（未入力）'}`;
      return v && String(v).trim() ? `- ${label}：${String(v).trim()}` : '';
    }).filter(Boolean);
    lines.unshift(`- 媒体：${(C.media.find(m => m.value === k.media) || {}).label}`);
    if (k.targetCount) lines.push(`- 目標CV数：月${fmt(k.targetCount)}件`);
    if (k.targetCpa) lines.push(`- 目標CPA：${yen(k.targetCpa)}`);
    if (k.upperCpa) lines.push(`- 上限CPA：${yen(k.upperCpa)}`);
    return lines.join('\n');
  }
  // 広告文：使うキーワード（まだ選んでいなければ候補すべて）／検索語句：配信しているキーワードとマッチタイプ
  function promptKeywords(target) {
    const s = st.setup;
    if (!s) return '（まだありません）';
    const xs = kwList().map((c, i) => ({ c, sel: s.kw[i] })).filter(x => !isTermKw(x.c));
    const used = xs.filter(x => x.sel.act === 'add');
    if (target === 'terms') return used.map(x => `- ${fill(x.c.kw)}（${B.match[x.sel.match].label}）`).join('\n') || '（まだありません）';
    return (used.length ? used : xs).map(x => `- ${fill(x.c.kw)}`).join('\n') || '（まだありません）';
  }
  const P = window.SIM_PROMPTS || {};
  const putIn = (t, key, v) => t.split(`{${key}}`).join(v);
  function aiPromptText(target = 'kw') {
    let t = (P[target] || {}).text || '';
    t = putIn(t, 'keywords', promptKeywords(target));
    t = putIn(t, 'groups', negGroups().map(g => g.label).join('／'));
    return putIn(t, 'karte', karteText());
  }
  const aiReady = () => st.karte.media === 'google' && !!st.karte.industry && !!st.karte.area;
  const PLANNER_NOTE = '<p class="sim-alert ok">⚠️ AIの数値は推測なので、実際の検索数はキーワードプランナーで確認しましょう。</p>';
  const AI_NOTES = {
    kw: PLANNER_NOTE,
    ad: '<p class="sim-alert ok">⚠️ AIの広告文や評価が正しいとは限りません。実際に入稿する前に、文字数や業界のルールを自分でも確認しましょう。</p>',
    terms: '<p class="sim-alert ok">⚠️ AIが作った検索語句は「ありそうな例」です。実際にどんな検索で表示されたかは、管理画面の検索語句レポートで確認しましょう。</p>'
  };
  const AI_PLACEHOLDER = {
    kw: '例：{"keywords":[{"キーワード":"新宿 歯医者","検索意図の強さ":"強", …}]}',
    ad: '例：{"ads":[{"種類":"見出し","文章":"新宿駅3分の歯医者","評価":"良い", …}]}',
    terms: '例：{"関係ない検索語句":[{"検索語句":"歯科衛生士 求人","種類":"求人・働き先探し", …}]}'
  };
  const PARSERS = { kw: parseAiAnswer, ad: parseAiAd, terms: parseAiTerms };
  const blankFlow = () => ({ kw: { copied: false, draft: '', msg: null }, ad: { copied: false, draft: '', msg: null }, terms: { copied: false, draft: '', msg: null } });
  const blankAi = () => ({ kw: null, ad: null, terms: null });
  const atText = at => new Date(at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  /* AIに作ってもらって取り込むパネル（キーワード・広告文・検索語句で共通）
   * コピー → 手順（Claudeを開く → 貼り付けて送信 → 回答をコピー → ここに貼り付け）→ 取り込み → 次へ */
  function renderAiFlow(target, next = '') {
    const f = st.aiFlow[target], a = st.ai[target], msg = f.msg, label = P[target] ? P[target].label : '';
    const changed = a && (a.industry !== st.karte.industry || (a.areaName || '') !== (st.karte.areaName || '').trim());
    return `<div class="sim-ai" id="sim-ai-${target}">
      <div class="sim-ai-copyrow">
        <button type="button" class="btn-primary" data-action="sim-ai-copy" data-target="${target}" id="sim-ai-copy-${target}" ${aiReady() ? '' : 'disabled'}>🤖 AI用にコピー</button>
        <span class="sim-hint">案件カルテと、${esc(label)}を作るための指示文がまとめてコピーされます</span>
      </div>
      ${f.copied ? `<ol class="sim-ai-steps">
        <li><b>Claudeを開く</b><a class="btn-ghost sm" href="https://claude.ai/new" target="_blank" rel="noopener">claude.ai を新しいタブで開く ↗</a></li>
        <li><b>コピーした内容を貼り付けて送信</b><span class="sim-hint">入力欄で ⌘+V（Windowsは Ctrl+V）</span></li>
        <li><b>返ってきた回答をすべてコピー</b><span class="sim-hint">回答の下にあるコピーボタンを使うと確実です</span></li>
        <li><b>このページに戻って、下の欄に貼り付け</b><span class="sim-hint">「取り込む」を押します。途中の状態は自動で保存しています</span></li>
      </ol>` : ''}
      <label class="sim-label sim-ai-pastelabel" for="sim-ai-paste-${target}">AIの回答を貼り付ける</label>
      <textarea id="sim-ai-paste-${target}" class="sim-text" rows="6" data-aipaste="${target}" placeholder="${esc(AI_PLACEHOLDER[target])}" aria-label="AIの回答（${esc(label)}）">${esc(f.draft || '')}</textarea>
      <p class="sim-hint">前後に説明文があっても、JSONの部分だけを読み込みます。</p>
      <div class="end-actions sim-ai-actions"><button type="button" class="btn-primary" data-action="sim-ai-import" data-target="${target}">取り込む</button></div>
      ${msg && msg.error ? `<p class="sim-alert bad" role="alert">❌ ${esc(msg.error)}</p>` : ''}
      ${msg && msg.ok ? `<div class="sim-alert sim-good sim-ai-done" role="status"><span>✅ ${esc(msg.summary)}を取り込みました。</span>${next}</div>` : ''}
      ${msg && msg.warns && msg.warns.length ? `<details class="sim-ai-warns" ${msg.error ? 'open' : ''}><summary>読み込みのメモ（${msg.warns.length}件）</summary><ul>${msg.warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
      ${a && !(msg && msg.ok) ? `<p class="sim-hint">取り込み済み：<b>${esc(a.summary || '')}</b>・${esc(atText(a.at))}に取り込み（ブラウザに保存済み）</p>` : ''}
      ${changed ? `<p class="sim-alert bad">⚠️ 取り込んだときと、案件カルテ（業種・地域名）が変わっています。今のカルテで「AI用にコピー」して、作り直しましょう。</p>` : ''}
      <details class="sim-ai-preview"><summary>コピーされる文章を見る</summary><textarea class="sim-text sim-ai-prompt" rows="12" readonly aria-label="AIへの指示文">${esc(aiPromptText(target))}</textarea></details>
      ${AI_NOTES[target]}
    </div>`;
  }
  // キーワード選びの画面の先頭：候補の作り方を選ぶ
  function renderSourcePicker() {
    const opts = KW_SOURCES.map(o => o.value === 'sample' && !hasSample()
      ? Object.assign({}, o, { desc: `${o.desc}（この業種「${B.industries[st.karte.industry].label}」のサンプルはまだありません）` }) : o);
    return `<section class="field">
      <div class="field-head"><h3>⓪ キーワード候補の作り方</h3></div>
      ${radioOpts('kwsrc', 'source', opts, st.setup.source)}
      ${st.setup.source === 'ai' ? renderAiFlow('kw', '<button type="button" class="btn-primary" data-action="sim-scroll" data-to="sim-kw-list">キーワードを選ぶ ↓</button>') : ''}
      ${st.setup.source === 'template' ? '<p class="sim-hint">型に業種の代表的な言葉を当てはめて作るので、不自然な組み合わせが混ざることもあります。それを見抜くのも練習です。単価・検索数は業種の目安から計算した値です。</p>' : ''}
    </section>`;
  }
  async function copyAiPrompt(target) {
    const text = aiPromptText(target);
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
    }
    st.aiFlow[target].copied = true;
    st.dirty = true;
    renderKeep();
    if (!ok) { openPromptModal(text); return; }
    const btn = $(`#sim-ai-copy-${target}`);
    if (!btn) return;
    btn.textContent = '✓ コピーしました';
    btn.classList.add('sim-copied');
    setTimeout(() => { btn.textContent = '🤖 AI用にコピー'; btn.classList.remove('sim-copied'); }, 2000);
  }
  // コピーできない環境では、指示文を表示して手でコピーしてもらう
  function openPromptModal(text) {
    $('#modal-body').innerHTML = `<h2 id="modal-title">AI用の指示文</h2>
      <p>自動でコピーできませんでした。下の文章をすべて選んでコピーし、AIに貼り付けてください。</p>
      <textarea class="sim-text sim-ai-prompt" rows="14" readonly>${esc(text)}</textarea>`;
    $('#modal').hidden = false;
    document.body.classList.add('modal-open');
    const ta = $('#modal-body textarea');
    ta.focus(); ta.select();
  }

  /* ---------- ブラウザへの保存（途中の状態をまるごと。別タブから戻っても続きから再開できる） ---------- */
  const SAVE_KEY = 'gat-sim-case';
  function saveCase() {
    const flow = Object.fromEntries(Object.entries(st.aiFlow).map(([t, f]) => [t, { copied: f.copied, draft: f.draft }]));
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 2, phase: st.phase, karte: st.karte, sampleId: st.sampleId, kwSource: st.kwSource, adSource: st.adSource,
        ai: st.ai, aiFlow: flow, setup: st.setup, seed: st.seed, ops: st.ops, savedAt: Date.now()
      }));
    } catch (e) { /* 保存できなくても動作に影響なし */ }
  }
  let saveTimer = null;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveCase, 400); };
  function loadCase() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d || !d.karte || !B.industries[d.karte.industry]) return null;
      if (!d.v) Object.assign(d, { phase: 'karte', ai: Object.assign(blankAi(), { kw: d.ai || null }) }); // 前の形式（カルテとAIのキーワードだけ）
      return d;
    } catch (e) { return null; }
  }
  function clearCase() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 消せなくても動作に影響なし */ } }
  // 保存した状態を戻す。段階に必要なデータがなければ、カルテから始める
  function restoreCase(d) {
    st.karte = Object.assign(blankKarte(), d.karte);
    st.sampleId = d.sampleId || null;
    st.kwSource = d.kwSource || null;
    st.adSource = d.adSource || null;
    st.ai = Object.assign(blankAi(), d.ai);
    st.aiFlow = blankFlow();
    Object.entries(d.aiFlow || {}).forEach(([t, f]) => { if (st.aiFlow[t]) Object.assign(st.aiFlow[t], { copied: !!f.copied, draft: f.draft || '' }); });
    st.setup = d.setup || null;
    st.seed = d.seed || 0;
    st.ops = d.ops || null;
    const need = { setup: 'setup', setupResult: 'setup', result: 'setup', improve: 'ops', monthResult: 'ops', review: 'ops' }[d.phase];
    st.phase = !need || (need === 'setup' ? st.setup : st.ops) ? d.phase || 'karte' : 'karte';
    if (st.phase === 'result' && !st.seed) newSeed();
    st.saved = null;
    st.dirty = true;
    syncGoals();
    try { render(); } catch (e) { st.phase = 'karte'; st.setup = null; st.ops = null; render(); }
  }

  // 配信地域の選択 → sim-benchmarks.js の geoFit のキー
  function geoKey(sel) {
    if (sel !== 'national') return sel;
    if (st.karte.area === 'national') return 'match';
    return B.industries[st.karte.industry].local ? 'nationalForLocal' : 'wider';
  }
  function geoOptions() {
    const all = [
      { value: 'narrower', label: '商圏より狭く', desc: 'お店の周り半径数kmなど。クリック単価は上がるが、成約率も上がる' },
      { value: 'match', label: `商圏どおり（${labelOf('area', st.karte.area)}）`, desc: 'カルテの商圏に合わせる' },
      { value: 'wider', label: '商圏より広く', desc: '周りの地域も含める。表示は増えるが、来られない人も増える' },
      { value: 'national', label: '日本全国', desc: '地域を絞らない' }
    ];
    return st.karte.area === 'national' ? all.filter(o => o.value === 'narrower' || o.value === 'match') : all;
  }
  const BIDDING_DESC = {
    manual: '1クリックにいくらまで払うかを自分で決める。計測がなくても使える',
    clicks: '予算内でクリックが最も多くなるように、Googleが自動で入札する',
    conversions: '予算内でコンバージョンが最も多くなるように自動で入札する。計測が必要',
    targetCpa: '目標のCPAに近づくように自動で入札する。計測と、ある程度のデータが必要'
  };

  const addedIdx = () => kwList().map((c, i) => i).filter(i => st.setup.kw[i].act === 'add');
  function avgCpc() {
    const xs = addedIdx().map(i => kwList()[i]).filter(c => !isTermKw(c));
    return xs.length ? xs.reduce((a, c) => a + c.cpc, 0) / xs.length : null;
  }

  // 広告見出しとキーワードの関連性（品質）
  // 選んでいる広告文（見出し＋説明文）
  const adItems = (s = st.setup) => [...s.headlines.map(i => s.hls[i]), ...(s.descriptions || []).map(i => (s.descs || [])[i])].filter(Boolean);
  // 広告文がキーワードに合っているか。用意した見出しはテーマで、AIの文は「合うキーワード」と文中の言葉で判定する
  const normSp = t => String(t).replace(/[\s　]+/g, ' ').trim();
  function adMatches(h, c) {
    if (!h.ai) return h.themes.includes(c.theme);
    const t = normSp(fill(c.kw));
    if ((h.kws || []).some(k => normSp(fill(k)) === t)) return true;
    const toks = t.split(' ').filter(x => x && x !== areaWord());
    if (!toks.length) return false;
    const text = fill(h.text);
    return toks.filter(x => text.includes(x)).length >= Math.ceil(toks.length / 2);
  }
  function kwQuality(c) {
    const hs = adItems();
    let q = hs.some(h => h.quality === 'high' && adMatches(h, c)) ? 'high'
      : hs.some(h => h.quality !== 'violation') ? 'mid' : 'low';
    if (hs.some(h => h.quality === 'violation')) q = q === 'high' ? 'mid' : 'low';
    return q;
  }

  // 除外キーワード（候補で「除外」にしたもの＋自分で追加したもの）
  function groupOfWord(t) {
    const g = negGroups().find(g => g.words.some(w => t.includes(w) || w.includes(t)));
    return g ? g.id : null;
  }
  function negativesOf() {
    const list = [];
    kwList().forEach((c, i) => { if (st.setup.kw[i].act === 'negative') list.push({ text: fill(c.kw), group: c.negGroup || groupOfWord(fill(c.kw)) }); });
    st.setup.customNeg.forEach(t => list.push({ text: t, group: groupOfWord(t), custom: true }));
    return list;
  }
  const blockedGroups = () => new Set(negativesOf().map(n => n.group).filter(g => g && g !== 'none'));
  // 除外キーワードが、使うキーワードを打ち消していないか
  function conflictsOf() {
    const adds = addedIdx().map(i => fill(kwList()[i].kw));
    return negativesOf()
      .map(n => ({ n, hits: adds.filter(a => n.text.split(/\s+/).every(w => a.includes(w))) }))
      .filter(x => x.hits.length);
  }

  function setupMissing() {
    const s = st.setup, out = [];
    if (st.karte.media === 'meta') {
      for (const id of Object.keys(C.metaFields)) if (!s.meta[id]) out.push(C.metaFields[id].label.replace(/（.*?）/g, ''));
      return out;
    }
    const und = s.kw.filter(x => !x.act || (x.act === 'add' && !x.match)).length;
    if (und) out.push(`キーワード${und}個`);
    else if (!s.kw.some(x => x.act === 'add')) out.push('使うキーワード（1つ以上）');
    if (!s.headlines.length) out.push('広告見出し');
    if (s.descs.length && !s.descriptions.length) out.push('説明文');
    if (!s.area) out.push('配信地域');
    if (!s.bidding) out.push('入札戦略');
    if (s.bidding === 'manual' && !(s.bid > 0)) out.push('入札額');
    return out;
  }

  function goalStrip() {
    const k = st.karte;
    return `<div class="sim-kpis sim-goal-strip">
      <div><small>目標CV数</small><b>${fmt(k.targetCount)}件</b></div>
      <div><small>目標CPA</small><b>${yen(k.targetCpa)}</b></div>
      <div><small>月の予算</small><b>${manYen(k.budget)}</b></div>
      <div><small>1日の予算</small><b>${yen(k.budget / B.budget.daysPerMonth)}</b></div>
    </div>`;
  }

  function setupSubmit() {
    const miss = setupMissing();
    return `<div class="sim-submit">
      <p class="sim-rest" id="sim-rest">${miss.length ? `未設定：<b>${esc(miss.join('・'))}</b>` : 'すべて設定しました'}</p>
      <button type="button" class="btn-ghost" data-action="sim-to-diagnosis">← 戻る</button>
      <button type="button" class="btn-primary" data-action="sim-grade" ${miss.length ? 'disabled' : ''}>採点する</button>
    </div>`;
  }
  function updateSetupRest() {
    const miss = setupMissing();
    $('#sim-rest').innerHTML = miss.length ? `未設定：<b>${esc(miss.join('・'))}</b>` : 'すべて設定しました';
    $('[data-action="sim-grade"]').disabled = miss.length > 0;
  }

  const radioOpts = (attr, id, opts, v) => `<div class="opts">${opts.map(o => `
    <label class="opt"><input type="radio" name="sim-${attr}-${id}" value="${esc(o.value)}" data-${attr}="${id}" ${v === o.value ? 'checked' : ''}>
      <span class="opt-main"><span class="opt-label">${esc(o.label)}</span>${o.desc ? `<span class="opt-desc">${esc(o.desc)}</span>` : ''}</span></label>`).join('')}</div>`;

  /* ---------- Google：キーワード選びの画面 ---------- */
  function renderSetupGoogle() {
    const k = st.karte, s = st.setup, list = kwList();
    const head = `
      <p class="lead">${esc(B.industries[k.industry].label)}の広告で使うキーワードを選びます。候補ごとに「使う（マッチタイプも選ぶ）」「除外」「使わない」を決めてください。検索数は、カルテの商圏（${esc(labelOf('area', k.area))}）での目安です。</p>
      ${goalStrip()}
      ${renderSourcePicker()}`;
    if (!list.length) {
      return `${head}
        ${s.source === 'sample' ? `<section class="field"><p>この業種（${esc(B.industries[k.industry].label)}）のサンプル候補は準備中です。いまは「歯科・クリニック」「パーソナルジム」「不動産」の3業種で使えます。上で「型から自動生成」か「AIの回答を取り込む」を選んでください。</p></section>` : ''}
        <div class="end-actions"><button type="button" class="btn-ghost" data-action="sim-to-diagnosis">← 戻る</button></div>`;
    }
    const scale = B.area[k.area].searchScale;
    const ac = avgCpc();
    return `${head}

      <section class="field">
        <div class="field-head"><h3>① キーワード</h3></div>
        <details class="tc-guide sim-guide"><summary>検索意図の強さの違い</summary><dl>
          ${Object.entries(B.intent).map(([i, x]) => `<dt>検索意図：${esc(x.label)}</dt><dd>クリック率 ×${x.ctr}・成約率 ×${x.cvr}</dd>`).join('')}
        </dl></details>
        ${s.source === 'ai' ? '<p class="sim-hint">🤖 AIの回答から取り込んだ候補です。意図・単価・検索数はAIの推測です。</p>' : s.source === 'template' ? '<p class="sim-hint">🧩 型から自動生成した候補です。</p>' : ''}
        <ul class="kw-list" id="sim-kw-list">${list.map((c, i) => renderKwRow(c, i, scale)).join('')}</ul>

        <div class="ckw">
          <h4>除外キーワードを自分で追加 <small>（任意）</small></h4>
          <div class="ckw-form"><input type="text" id="sim-neg-text" class="sim-text" placeholder="例：バイト" aria-label="除外キーワード"><button type="button" class="btn-ghost" data-action="sim-neg-add">追加</button></div>
          ${s.customNeg.length ? `<ul class="ckw-list">${s.customNeg.map((t, i) => {
            const g = negGroups().find(x => x.id === groupOfWord(t));
            return `<li><code>−${esc(t)}</code><span>${g ? `「${esc(g.label)}」の検索を防げます` : 'どの種類にも当てはまりません（運用しながら確認しましょう）'}</span><button type="button" class="x" data-action="sim-neg-remove" data-i="${i}" aria-label="${esc(t)}を削除">×</button></li>`;
          }).join('')}</ul>` : ''}
        </div>
        ${conflictsOf().map(x => `<p class="sim-alert bad">⚠️ 除外キーワード「${esc(x.n.text)}」が、使うキーワード「${esc(x.hits.join('」「'))}」にも含まれています。このキーワードにも広告が出なくなります。</p>`).join('')}
      </section>

      <section class="field">
        <div class="field-head"><h3>② 広告文</h3></div>
        ${radioOpts('adsrc', 'source', AD_SOURCES, s.adSource)}
        ${s.adSource === 'ai' ? renderAiFlow('ad', '<button type="button" class="btn-primary" data-action="sim-scroll" data-to="sim-hl-list">見出しを選ぶ ↓</button>') : ''}
        <p class="sim-hint">${s.descs.length ? '見出し・説明文' : '見出し'}に、使うキーワードの内容が入っているほど「広告の品質」が上がり、クリック率が上がってクリック単価が下がります（品質が高い：クリック率×${B.quality.high.ctr}・クリック単価×${B.quality.high.cpc}／低い：クリック率×${B.quality.low.ctr}・クリック単価×${B.quality.low.cpc}）。</p>
        ${renderAdPicks(s, 'setup')}
      </section>

      <section class="field">
        <div class="field-head"><h3>③ 配信地域</h3></div>
        ${radioOpts('setup', 'area', geoOptions(), s.area)}
      </section>

      <section class="field">
        <div class="field-head"><h3>④ 入札戦略</h3></div>
        <p class="sim-hint">カルテの計測状況：${esc(labelOf('measurement', k.measurement))}／今の月のコンバージョン：${esc(labelOf('monthlyCv', k.monthlyCv))}</p>
        ${radioOpts('setup', 'bidding', Object.entries(B.bidding).map(([v, x]) => ({ value: v, label: x.label, desc: BIDDING_DESC[v] })), s.bidding)}
        ${s.bidding === 'manual' ? `<div class="sim-item">
          <label class="sim-label" for="sim-bid">上限クリック単価（入札額）</label>
          <div class="num-wrap"><input type="number" inputmode="numeric" id="sim-bid" data-setup="bid" min="1" step="10" value="${s.bid ?? ''}" placeholder="例：300"><span class="unit">円</span></div>
          <p class="sim-hint sim-echo">${ac ? `使うキーワードの想定クリック単価の平均：約${yen(ac)}` : '使うキーワードを選ぶと、想定クリック単価の平均を表示します'}</p>
        </div>` : ''}
      </section>
      <p class="sim-hint">予算は、カルテの月${manYen(k.budget)}（1日約${yen(k.budget / B.budget.daysPerMonth)}）で配信します。予算の変更は、段階4の運用改善でできます。</p>
      ${setupSubmit()}`;
  }

  function renderKwRow(c, i, scale) {
    const sel = st.setup.kw[i], text = fill(c.kw);
    const meta = isTermKw(c)
      ? '<span class="sim-kwm">除外キーワードの候補になる単語</span>'
      : `<span class="sim-kwm">意図 <b class="sim-int-${c.intent}">${esc(B.intent[c.intent].label)}</b></span><span class="sim-kwm">想定CPC <b>${yen(c.cpc)}</b></span><span class="sim-kwm">検索数 <b>月${fmt(c.volume * scale)}回</b></span>`;
    return `<li class="kw-row" id="sim-kw-${i}">
      <div class="kw-top"><span class="kw-text">${esc(text)}</span>
        <span class="seg" role="group" aria-label="${esc(text)}の扱い">${['add', 'negative', 'skip'].map(a => `<button type="button" class="seg-btn seg-${a} ${sel.act === a ? 'on' : ''}" aria-pressed="${sel.act === a}" data-action="sim-kw" data-i="${i}" data-val="${a}">${ACT_LABEL[a]}</button>`).join('')}</span></div>
      <div class="sim-kwmeta">${meta}</div>
      ${sel.act === 'add' ? `<div class="sim-match sim-match-cards">
        <p class="sim-match-label">マッチタイプ：${sel.match ? `<code class="sim-mcode">${esc(MATCH_CODE[sel.match](text))}</code>` : '<span class="sim-req">選んでください</span>'}</p>
        ${renderMatchCards(c, i)}</div>` : ''}
    </li>`;
  }

  /* ---------- マッチタイプの説明（選ぶところに、意味・例・こんなときに選ぶ、を出す） ----------
   * 例の検索語句は、選んだキーワードから作る（キーワード「京都 整体」なら「京都 整体 安い」など）
   */
  const MATCH_HELP = {
    exact:  { net: '小さい網', mean: '登録したキーワードと同じ意味の検索だけに広告が出る', when: '予算が少ない／確実に成果につながる人だけ狙いたい' },
    phrase: { net: '中くらいの網', mean: 'キーワードの意味を含む検索に出る（前後に言葉が付いてもOK）', when: '迷ったらこれ。最初の1ヶ月はこれで始めるのが無難' },
    broad:  { net: '大きい網', mean: 'キーワードに関連しそうな検索に幅広く出る', when: '予算に余裕があり、成果を計測できていて、自動入札を使うとき。除外キーワードが必須' }
  };
  const quoteJa = t => `「${t}」`;
  function matchExamples(c) {
    const toks = normSp(fill(c.kw)).split(' ').filter(Boolean), kw = toks.join(' '), area = areaWord();
    const local = B.industries[st.karte.industry].local;
    const mods = ['安い', ...(searchTermsOf().variants || []), 'おすすめ', '口コミ']
      .filter((v, j, a) => a.indexOf(v) === j && !kw.includes(v) && (local || !/近く|駅|近い/.test(v)));
    const plus = mods.slice(0, 2).map(v => `${kw} ${v}`);
    const rel = ((C.matchLab.related || {})[st.karte.industry] || []).filter(r => !r.split(' ').some(w => toks.includes(w))).slice(0, 2);
    const relQ = rel.map((r, j) => j === 0 && toks.includes(area) ? `${area} ${r}` : r);
    // 同じ意味の例：先頭が地域名なら「新宿の歯医者」、それ以外はスペースなしの書き方（表記ゆれ）
    const same = toks.length < 2 ? [kw] : [kw, toks[0] === area ? `${toks[0]}の${toks.slice(1).join(' ')}` : toks.join('')];
    return {
      exact: `${same.map(quoteJa).join('')}には出る。${quoteJa(plus[0])}には出ない`,
      phrase: `${plus.map(quoteJa).join('')}にも出る`,
      broad: relQ.length ? `${relQ.map(quoteJa).join('')}にも出ることがある` : '言葉が違っても、関連しそうな検索にも出ることがある'
    };
  }
  function renderMatchCards(c, i) {
    const sel = st.setup.kw[i], ex = matchExamples(c);
    return `<div class="sim-mcards" role="group" aria-label="マッチタイプ">${Object.keys(B.match).map(m => `
      <button type="button" class="sim-mcard ${sel.match === m ? 'on' : ''}" aria-pressed="${sel.match === m}" data-action="sim-match" data-i="${i}" data-val="${m}">
        <span class="sim-mcard-title">${esc(B.match[m].label)}<small>＝${esc(MATCH_HELP[m].net)}</small></span>
        <span><b>意味</b>${esc(MATCH_HELP[m].mean)}</span>
        <span><b>例</b>${esc(ex[m])}</span>
        <span><b>こんなとき</b>${esc(MATCH_HELP[m].when)}</span>
      </button>`).join('')}</div>`;
  }

  // 見出し・説明文のチェックボックス（設定の画面：mode='setup'／運用改善：mode='ops'）
  function renderAdPicks(s, mode) {
    if (!s.hls.length) return '<p class="sim-hint" id="sim-hl-list">AIの回答を取り込むと、ここに見出しと説明文の候補が出ます。</p>';
    const box = (list, sel, max, attr, kind) => `<div class="opts multi">${list.map((h, i) => {
      const text = fill(h.text), over = h.ai && widthOf(text) > AD_LIMIT[kind];
      const at = mode === 'ops' ? `data-opsf="${attr}"` : `data-${attr}="${i}"`;
      return `<label class="opt"><input type="checkbox" value="${i}" ${at} ${sel.includes(i) ? 'checked' : ''} ${!sel.includes(i) && sel.length >= max ? 'disabled' : ''}>
        <span class="opt-main"><span class="opt-label">${esc(text)}</span>${h.ai ? `<span class="opt-desc${over ? ' sim-warn' : ''}">全角${Math.ceil(widthOf(text) / 2)}文字${over ? `（上限の${AD_LIMIT[kind] / 2}文字を超えています）` : ''}</span>` : ''}</span></label>`;
    }).join('')}</div>`;
    return `<h4 class="sim-adhead" id="sim-hl-list">見出し <small class="sim-hint">（最大${C.headlineMax}つ・${s.headlines.length}/${C.headlineMax}）</small></h4>
      ${box(s.hls, s.headlines, C.headlineMax, 'hl', 'headline')}
      ${s.descs.length ? `<h4 class="sim-adhead">説明文 <small class="sim-hint">（最大${C.descriptionMax}つ・${s.descriptions.length}/${C.descriptionMax}）</small></h4>
      ${box(s.descs, s.descriptions, C.descriptionMax, 'ds', 'description')}` : ''}`;
  }

  /* ---------- Meta：オーディエンス設定の画面 ---------- */
  function audienceOf(m = st.setup.meta) {
    const k = st.karte;
    // 特別な広告カテゴリでは地域を狭められないので、「商圏どおり」として計算する
    const area = !m.metaArea || (m.metaArea === 'narrower' && special()) ? 'match' : m.metaArea;
    let size = B.area[k.area].population * B.geoFit[area].volume;
    if (m.ageGender === 'narrow' && !special()) size *= B.meta.ageGenderNarrow;
    if (m.detailed === 'interest') size *= B.meta.interestNarrow;
    return Math.round(size);
  }
  // 1週間あたりのコンバージョン見込み（広告セット1つあたり）
  function weeklyPerSet(m = st.setup.meta) {
    const monthly = st.karte.budget / benchOf(st.karte).cpa;
    return monthly / (B.budget.daysPerMonth / 7) / Number(m.adsets || 1);
  }

  function renderAudience() {
    const m = st.setup.meta, size = audienceOf(), sets = Number(m.adsets || 1);
    const small = size < B.meta.smallAudience.under;
    const weekly = weeklyPerSet();
    return `<h4>👥 推定オーディエンス</h4>
      <div class="sim-kpis">
        <div><small>推定オーディエンスサイズ</small><b>約${fmt(size)}人</b><small class="${small ? 'sim-warn' : ''}">${small ? `狭すぎ（${fmt(B.meta.smallAudience.under)}人未満はCPM×${B.meta.smallAudience.cpm}）` : 'ちょうど良い〜広い'}</small></div>
        <div><small>広告セット1つあたりの予算</small><b>月${manYen(st.karte.budget / sets)}</b></div>
        <div><small>1セットあたりのCV見込み</small><b>週${weekly < 10 ? weekly.toFixed(1) : fmt(weekly)}件</b><small>${weekly < B.meta.learning.weeklyConversions ? '学習は完了しにくい' : '学習を完了できそう'}</small></div>
      </div>
      ${special() ? `<p class="sim-hint">特別な広告カテゴリ（${esc(labelOf('specialCategory', st.karte.specialCategory))}）を申告しているため、年齢・性別では絞れず、地域も半径約24km未満には絞れません。</p>` : ''}`;
  }

  function renderSetupMeta() {
    const k = st.karte;
    return `
      <p class="lead">Meta広告で「誰に・どう届けるか」を設定します。設定を変えると、推定オーディエンスサイズと学習の見込みが変わります。</p>
      ${goalStrip()}
      <div class="sim-calc" id="sim-audience" aria-live="polite">${renderAudience()}</div>
      ${C.metaGroups.map(g => `
        <section class="field sim-group">
          <div class="field-head"><h3>${esc(g.title)}</h3></div>
          ${g.fields.map(id => `<fieldset class="sim-item"><legend class="sim-label">${esc(C.metaFields[id].label)}</legend>${radioOpts('meta', id, C.metaFields[id].options, st.setup.meta[id])}</fieldset>`).join('')}
        </section>`).join('')}
      <p class="sim-hint">予算は、カルテの月${manYen(k.budget)}で配信します。素材は「${esc(labelOf('creative', k.creative))}」として計算します。</p>
      ${setupSubmit()}`;
  }

  /* ---------- 採点：Google ---------- */
  function gradeKwItem(c, sel) {
    const v = sel.act === 'add' ? sel.match : sel.act;
    const level = c.ans === 'add'
      ? (sel.act === 'add' && c.best.includes(sel.match) ? 'good' : (c.ok || []).includes(v) ? 'ok' : 'bad')
      : (sel.act === c.ans ? 'good' : (c.ok || []).includes(v) ? 'ok' : 'bad');
    return {
      level,
      choice: sel.act === 'add' ? `使う（${B.match[sel.match].label}）` : ACT_LABEL[sel.act],
      best: c.ans === 'add' ? `使う（${c.best.map(m => B.match[m].label).join('・')}）` : ACT_LABEL[c.ans]
    };
  }

  function gradeArea() {
    const key = geoKey(st.setup.area), g = B.geoFit[key];
    const t = {
      match: ['good', '商圏どおりに配信すると、来られる人にだけ広告費を使えます。'],
      narrower: ['ok', `商圏より狭くすると、来やすい人に絞れるので成約率は上がります（×${g.cvr}）。ただし表示回数が減り（×${g.volume}）、クリック単価も上がります（×${g.cpc}）。予算が少ないときの選択肢です。`],
      wider: ['ok', `商圏より広くすると表示は増えます（×${g.volume}）が、増えた分は来られない人が多く、その成約率はかなり低くなります（×${g.extraCvr}）。`],
      nationalForLocal: ['bad', `来店型の業種で全国に配信すると、表示の大半が来られない地域の人になります（増えた分の成約率×${g.extraCvr}）。広告費の無駄になるので、商圏に合わせましょう。`]
    }[key];
    return { title: '配信地域', level: t[0], choice: (geoOptions().find(o => o.value === st.setup.area) || {}).label, best: geoOptions().find(o => o.value === 'match').label, reason: t[1] };
  }

  function gradeBidding() {
    const k = st.karte, b = st.setup.bidding;
    const cv = numOf('monthlyCv', k.monthlyCv) || 0;
    const need = B.autoBidLearning.monthlyConversions;
    let level, reason, best;
    if (k.measurement === 'none') {
      best = '手動入札 または クリック数の最大化';
      if (b === 'manual' || b === 'clicks') { level = 'good'; reason = '計測ができていないので、成果をもとにした自動入札は使えません。クリックを基準にした入札で始めつつ、早めに計測を設定しましょう。'; }
      else { level = 'bad'; reason = `「${B.bidding[b].label}」はコンバージョンのデータをもとに入札します。計測していないとGoogleが何を目指せばいいか分からず、配信が不安定になり、クリック単価も上がりがちです（×${B.noMeasurement.autoBidCpc}）。`; }
    } else if (k.measurement === 'partial') {
      best = 'コンバージョン数の最大化（計測をそろえてから）';
      if (b === 'targetCpa') { level = 'bad'; reason = '一部しか計測できていない状態で目標CPAを設定すると、実際より成果が少なく見えるため、入札が弱くなりすぎます。'; }
      else { level = 'ok'; reason = '計測が一部だけなので、どの入札戦略でも成果の判断がずれやすい状態です。まずは計測をそろえることが一番の改善策です。'; }
    } else if (cv >= need) {
      best = '目標コンバージョン単価 または コンバージョン数の最大化';
      if (b === 'targetCpa' || b === 'conversions') { level = 'good'; reason = `計測ができていて、月${need}件以上のコンバージョンがあるので、自動入札が安定して働きます。`; }
      else { level = 'ok'; reason = '計測もデータも十分あるのに、クリックを基準にした入札ではもったいない状態です。成約しやすい人に絞って入札できる自動入札を使いましょう。'; }
    } else {
      best = 'コンバージョン数の最大化';
      if (b === 'conversions') { level = 'good'; reason = `計測はできているので、まずは「コンバージョン数の最大化」でデータをためるのが定番です。月${need}件ほどたまったら目標CPAを検討しましょう。`; }
      else if (b === 'targetCpa') { level = 'ok'; reason = `月のコンバージョンが${need}件未満なので、目標CPAは学習が安定せず、成果が大きくぶれやすくなります（ブレ±${Math.round(B.autoBidLearning.lowDataSwing * 100)}%）。`; }
      else { level = 'ok'; reason = '計測ができているので、コンバージョンを基準にした自動入札を使った方が、成約しやすい人に広告を出せます。'; }
    }
    if (b === 'manual' && st.setup.bid > 0) {
      const ac = avgCpc();
      if (ac && st.setup.bid < ac * 0.6) { reason += `\n入札額${yen(st.setup.bid)}は、想定クリック単価の平均（約${yen(ac)}）よりかなり低く、広告がほとんど表示されないおそれがあります。`; if (level === 'good') level = 'ok'; }
      else if (ac && st.setup.bid > ac * 2) { reason += `\n入札額${yen(st.setup.bid)}は想定クリック単価の平均（約${yen(ac)}）の2倍以上です。予算を早く使い切ってしまうおそれがあります。`; if (level === 'good') level = 'ok'; }
    }
    const choice = B.bidding[b].label + (b === 'manual' && st.setup.bid ? `（${yen(st.setup.bid)}）` : '');
    return { title: '入札戦略', level, choice, best, reason };
  }

  function gradeHeadlines() {
    if (st.setup.adSource === 'ai') return gradeAiAds();
    const hs = st.setup.headlines.map(i => hlList()[i]);
    const themes = [...new Set(addedIdx().map(i => kwList()[i].theme).filter(Boolean))];
    const covered = themes.filter(t => hs.some(h => h.quality === 'high' && h.themes.includes(t)));
    const miss = themes.filter(t => !covered.includes(t));
    const vio = hs.filter(h => h.quality === 'violation');
    const level = vio.length ? 'bad' : !themes.length ? 'ok'
      : covered.length === themes.length ? 'good' : covered.length >= themes.length / 2 ? 'ok' : 'bad';
    const lines = hs.map(h => `・${fill(h.text)}：${h.reason}`);
    if (miss.length) lines.push(`使うキーワードのうち「${miss.map(t => C.themeLabels[t] || t).join('」「')}」に合う見出しがありません。そのキーワードは品質が下がり、クリック単価が上がります。`);
    if (vio.length) lines.push('問題のある表現を含む見出しがあるため、すべてのキーワードで品質が1段階下がる計算にしています。');
    const bestHs = hlList().filter(h => h.quality === 'high' && h.themes.some(t => themes.includes(t)));
    return { title: '広告見出し', level, choice: hs.map(h => fill(h.text)).join('／'), best: bestHs.map(h => fill(h.text)).join('／') || '使うキーワードに合う見出し', reason: lines.join('\n') };
  }

  // AIの広告文：使うキーワードそれぞれに、AIが「良い」とした文で合うものがあるか
  function gradeAiAds() {
    const s = st.setup, hs = adItems();
    const adds = addedIdx().map(i => kwList()[i]).filter(c => !isTermKw(c));
    const covered = adds.filter(c => hs.some(h => h.quality === 'high' && adMatches(h, c)));
    const miss = adds.filter(c => !covered.includes(c));
    const vio = hs.filter(h => h.quality === 'violation');
    const level = vio.length ? 'bad' : !adds.length ? 'ok'
      : covered.length === adds.length ? 'good' : covered.length >= adds.length / 2 ? 'ok' : 'bad';
    const kindOf = h => s.descs.includes(h) ? '説明文' : '見出し';
    const lines = hs.map(h => `・【${kindOf(h)}】${fill(h.text)}：${h.reason}`);
    if (miss.length) lines.push(`使うキーワードのうち「${miss.map(c => fill(c.kw)).join('」「')}」に合う見出し・説明文がありません。そのキーワードは品質が下がり、クリック単価が上がります。`);
    if (vio.length) lines.push('問題のある表現を含む文があるため、すべてのキーワードで品質が1段階下がる計算にしています。');
    lines.push('AIが付けた評価（良い・普通・違反）と、文中の言葉・「合うキーワード」をもとに採点しています。AIの評価が正しいとは限らないので、自分でも考えてみましょう。');
    const best = [...s.hls, ...s.descs].filter(h => h.quality === 'high' && adds.some(c => adMatches(h, c)));
    return { title: s.descs.length ? '広告文（見出し・説明文）' : '広告見出し', level, choice: hs.map(h => fill(h.text)).join('／'),
      best: best.map(h => fill(h.text)).join('／') || '使うキーワードの言葉が入った、評価「良い」の文', reason: lines.join('\n') };
  }

  /* ---------- 採点：Meta ---------- */
  function gradeMeta() {
    const k = st.karte, m = st.setup.meta, items = [];
    const size = audienceOf(), small = size < B.meta.smallAudience.under;
    const targeted = k.targetAge !== 'all' || k.targetGender !== 'both';
    const lab = (id, v) => (C.metaFields[id].options.find(o => o.value === v) || {}).label;
    const add = (id, level, best, reason) => items.push({ title: C.metaFields[id].label.replace(/（.*?）/g, ''), level, choice: lab(id, m[id]), best, reason, w: 2 });

    // 地域
    if (m.metaArea === 'match') add('metaArea', 'good', '商圏どおり', '商圏どおりに配信すると、来られる人にだけ広告費を使えます。');
    else if (m.metaArea === 'narrower') add('metaArea', special() ? 'bad' : 'ok', '商圏どおり', special()
      ? '特別な広告カテゴリを申告した広告は、地域を半径約24km未満に絞れません。この設定は使えません。'
      : `狭くすると来やすい人に絞れますが、人数が減ってCPMが上がりやすくなります（人数が${fmt(B.meta.smallAudience.under)}人未満でCPM×${B.meta.smallAudience.cpm}）。`);
    else add('metaArea', 'ok', '商圏どおり', '広くすると人数は増えますが、来られない人にも広告が表示されるため、成約率が下がります。');

    // 年齢・性別
    if (special()) {
      add('ageGender', m.ageGender === 'open' ? 'good' : 'bad', '絞らない', m.ageGender === 'open'
        ? '特別な広告カテゴリでは年齢・性別で絞れないので、正しい設定です。誰向けの物件かは、広告文や画像で伝えましょう。'
        : '特別な広告カテゴリ（住宅・雇用・金融など）を申告した広告は、差別を防ぐため年齢・性別で絞れません。この設定は使えません。');
    } else if (m.ageGender === 'open') {
      add('ageGender', 'good', '絞らない（ターゲットがはっきりしていれば、絞るのも可）', '最近のMeta広告は、絞らなくても反応しそうな人を自動で見つけてくれます。人数が多いほど配信が安定し、CPMも下がりやすくなります。');
    } else {
      add('ageGender', targeted && !small ? 'good' : 'ok', '絞らない', targeted
        ? (small ? 'ターゲットに合わせて絞るのは自然ですが、ほかの絞り込みと重なって人数が少なくなりすぎています。' : 'カルテのターゲットがはっきりしているので、年齢・性別で絞るのは自然な判断です。人数（オーディエンスサイズ）が少なくなりすぎないかは見ておきましょう。')
        : 'カルテのターゲットは「年齢・性別を問わない」なので、絞る必要はありません。人数が減るぶん、CPMが上がりやすくなります。');
    }

    // 詳細ターゲット
    if (m.detailed === 'advantage') add('detailed', 'good', 'Advantage+ オーディエンス', '少ない予算でも配信が広がりやすく、学習も進みやすい設定です。どんな人に届けたいかは、広告文と画像で伝えましょう。');
    else add('detailed', small ? 'bad' : 'ok', 'Advantage+ オーディエンス', small
      ? `興味・関心での絞り込みが重なり、人数が約${fmt(size)}人まで減っています。配信が伸びず、CPMも上がります（×${B.meta.smallAudience.cpm}）。`
      : '興味・関心で絞るのは間違いではありませんが、人数が減って配信が伸びにくくなります。最近は、Advantage+ オーディエンスの方が成果が出やすいことが多いです。');

    // パフォーマンスの目標
    const o = m.optimization;
    if (k.measurement === 'none') {
      const t = {
        clicks: ['good', '計測（ピクセル）がないので、今できる中では「リンクのクリック数」が現実的です。ただしクリックしやすい人に配信されるだけで、問い合わせにつながる保証はありません。早めにピクセルを設定しましょう。'],
        lpviews: ['bad', '「ランディングページビュー」を数えるにもピクセルが必要です。計測していない状態では選べません。'],
        conversions: ['bad', `ピクセルで成果を計測していないと、Metaは誰が成果を出したか分からず、「コンバージョン数の最大化」は働きません（成約率×${B.noMeasurement.metaCvr}で計算します）。`],
        reach: ['bad', '「リーチ」はできるだけ多くの人に見せる、認知のための設定です。問い合わせを増やしたい今回の目的とは合いません。']
      }[o];
      add('optimization', t[0], 'リンクのクリック数（＋ピクセルの設定）', t[1]);
    } else {
      const weekly = weeklyPerSet();
      const t = {
        conversions: ['good', `成果（${labelOf('goal', k.goal)}）が出やすい人に配信される、目的に合った設定です。${weekly < B.meta.learning.weeklyConversions ? B.meta.learning.note : ''}`],
        lpviews: ['ok', `LPを見てくれる人に配信されるので、成果の手前の行動を増やせます。コンバージョンが週${B.meta.learning.weeklyConversions}件に遠く届かないときの「学習を進めるための工夫」としては使えますが、計測ができているなら、まずはコンバージョンを目標にするのが基本です。`],
        clicks: ['ok', 'クリックしやすい人に配信されるため、クリック数は増えても、問い合わせにつながりにくくなりがちです。計測ができているなら、コンバージョンを目標にしましょう。'],
        reach: ['bad', '「リーチ」はできるだけ多くの人に見せる、認知のための設定です。問い合わせを増やしたい今回の目的とは合いません。']
      }[o];
      add('optimization', t[0], 'コンバージョン数の最大化', t[1]);
    }

    // 配置
    if (m.placement === 'auto') add('placement', 'good', 'Advantage+ 配置（自動）', '配信先をMetaが自動で選ぶので、同じ予算でも安く多くの人に届けやすくなります。');
    else if (m.placement === 'instagram') add('placement', 'ok', 'Advantage+ 配置（自動）', k.targetAge === 'young' ? '20代中心ならInstagram中心も自然な考え方です。ただ、自動にした方がCPMが下がりやすく、配信も安定しやすいです。' : '配置を絞ると、配信先が減ってCPMが上がりやすくなります。まずは自動にして、成果を見てから判断しましょう。');
    else add('placement', k.targetAge === 'young' ? 'bad' : 'ok', 'Advantage+ 配置（自動）', k.targetAge === 'young' ? '20代中心のターゲットなのに、Facebookだけに絞ると届けたい人の多くを逃します。' : '配置を絞ると、配信先が減ってCPMが上がりやすくなります。まずは自動にして、成果を見てから判断しましょう。');

    // 広告セットの数
    const total = weeklyPerSet(Object.assign({}, m, { adsets: '1' }));
    const per = weeklyPerSet();
    if (m.adsets === '1') add('adsets', 'good', '1つにまとめる', `予算とデータが1か所に集まるので、学習が進みやすくなります（見込み：週${total.toFixed(1)}件）。${total < B.meta.learning.weeklyConversions ? 'それでも学習の完了（週' + B.meta.learning.weeklyConversions + '件）には届きませんが、小規模の予算ではよくあることです。' : ''}`);
    else add('adsets', total >= B.meta.learning.weeklyConversions * 3 ? 'good' : m.adsets === '3' ? 'ok' : 'bad', '1つにまとめる', `${m.adsets}つに分けると、1つあたりの予算が月${manYen(k.budget / Number(m.adsets))}、コンバージョン見込みが週${per.toFixed(1)}件になり、どの広告セットも学習が進みにくくなります。予算が少ないうちは、まとめた方が成果が安定します。`);

    return { items };
  }

  /* ---------- 採点の画面 ---------- */
  function renderSetupResult() {
    const isMeta = st.karte.media === 'meta';
    let items, kwRows = [];
    if (isMeta) {
      items = gradeMeta().items;
    } else {
      kwRows = kwList().map((c, i) => Object.assign({ c, i }, gradeKwItem(c, st.setup.kw[i])));
      items = [gradeHeadlines(), gradeArea(), gradeBidding()].map(x => Object.assign({ w: 2 }, x));
    }
    const all = [...kwRows.map(r => ({ level: r.level, w: 1 })), ...items];
    const max = all.reduce((a, x) => a + 2 * x.w, 0);
    const score = Math.round(all.reduce((a, x) => a + PTS[x.level] * x.w, 0) / max * 100);
    const count = lv => all.filter(x => x.level === lv).length;
    const comment = score >= 85 ? 'すばらしい設定です！このまま成果のシミュレーションに進みましょう。'
      : score >= 60 ? 'おおむね良い設定です。△・×の項目の解説を読んで、直してから進むとより良い成果が出ます。'
      : '見直したい項目がいくつかあります。解説を読んで「設定を直す」から修正してみましょう。';

    const itemHtml = x => `
      <article class="res-item ${x.level}">
        <div class="res-head"><span class="mark ${x.level}">${MARK_TEXT[x.level]}</span><h3>${esc(x.title)}</h3></div>
        <dl class="res-rows"><dt>あなたの設定</dt><dd>${esc(x.choice)}</dd><dt>おすすめ</dt><dd>${esc(x.best)}</dd></dl>
        <p class="reason">${esc(x.reason).replace(/\n/g, '<br>')}</p>
      </article>`;

    let google = '';
    if (!isMeta) {
      const added = addedIdx().map(i => kwList()[i]).filter(c => !isTermKw(c));
      const blocked = blockedGroups();
      google = `
        <section class="field">
          <div class="field-head"><h3>① キーワード</h3><span class="tag">${kwRows.filter(r => r.level === 'good').length} / ${kwRows.length} 正解</span></div>
          ${st.setup.source === 'ai' ? `<p class="sim-hint">AIの回答を取り込んだ候補は、AIが付けた検索意図の強さ（強＝使う・フレーズ一致か完全一致／中＝使う・フレーズ一致／弱＝使わない／除外＝除外）を正解として採点しています。AIの判定が正しいとは限らないので、自分でも考えてみましょう。</p>${PLANNER_NOTE}` : ''}
          ${st.setup.source === 'template' ? '<p class="sim-hint">型から作った候補は、型ごとに決めた答えで採点しています。</p>' : ''}
          <ul class="sim-kwres">${kwRows.map(r => `
            <li class="${r.level}">
              <div class="sim-kwres-head"><b>${esc(fill(r.c.kw))}</b><span class="mark ${r.level}">${MARK_TEXT[r.level]}</span></div>
              <p class="sim-kwres-pick">あなた：${esc(r.choice)}<span>おすすめ：${esc(r.best)}</span></p>
              <p class="sim-kwres-why">${esc(r.c.reason)}</p>
            </li>`).join('')}</ul>
        </section>

        <section class="field">
          <div class="field-head"><h3>📊 使うキーワードの品質</h3></div>
          <p class="sim-hint">選んだ広告見出しとの関連性から決まります。品質が高いほどクリック率が上がり、クリック単価が下がります。成果のシミュレーションでもこの品質を使います。</p>
          ${added.length ? `<div class="sim-table-wrap"><table class="kw-table">
            <thead><tr><th>キーワード</th><th>マッチタイプ</th><th>想定CPC</th><th>品質</th><th>品質を反映したCPC</th></tr></thead>
            <tbody>${added.map(c => {
              const i = kwList().indexOf(c), q = kwQuality(c);
              return `<tr><td>${esc(fill(c.kw))}</td><td>${esc(B.match[st.setup.kw[i].match].label)}</td><td>${yen(c.cpc)}</td>
                <td class="m ${q === 'high' ? 'good' : q === 'mid' ? 'ok' : 'bad'}">${QUALITY_LABEL[q]}</td><td>約${yen(c.cpc * B.quality[q].cpc)}</td></tr>`;
            }).join('')}</tbody></table></div>` : '<p class="sim-hint">使うキーワードがありません。</p>'}
        </section>

        <section class="field">
          <div class="field-head"><h3>🚫 除外キーワードで防げる「関係ない検索」</h3></div>
          <ul class="sim-neglist">${negGroups().map(g => `<li class="${blocked.has(g.id) ? 'on' : ''}"><span>${blocked.has(g.id) ? '✓' : '—'}</span>${esc(g.label)}<small>関係ない検索の約${Math.round(g.share * 100)}%</small></li>`).join('')}</ul>
          <p class="sim-hint">「その他」は事前に予想しにくい検索です。段階4の検索語句レポートで見つけて除外していきます。部分一致のキーワードが多いほど、関係ない検索の量そのものが増えます。</p>
          ${conflictsOf().map(x => `<p class="sim-alert bad">⚠️ 除外キーワード「${esc(x.n.text)}」が、使うキーワード「${esc(x.hits.join('」「'))}」を打ち消しています。</p>`).join('')}
        </section>`;
    } else {
      google = `<div class="sim-calc">${renderAudience()}</div>`;
    }

    return `
      <div class="score-card">
        <div class="ring" style="--p:${score}"><span>${score}<small>点</small></span></div>
        <div class="score-info"><p class="res-pf">${esc(B.industries[st.karte.industry].label)}｜${isMeta ? 'Meta広告' : 'Google検索広告'}</p>
          <h2>${isMeta ? 'オーディエンス設定' : 'キーワード選び'}の結果</h2>
          <p class="comment">${comment}</p>
          <div class="counts"><span class="count good">◎ ${count('good')}</span><span class="count ok">△ ${count('ok')}</span><span class="count bad">× ${count('bad')}</span></div>
        </div>
      </div>
      ${google}
      ${items.map(itemHtml).join('')}
      <div class="end-actions">
        <button type="button" class="btn-ghost" data-action="sim-back-setup">← 設定を直す</button>
        <button type="button" class="btn-primary" data-action="sim-to-result">次へ：成果シミュレーション →</button>
      </div>`;
  }

  // キーワードの選び方以外の設定（見出し・地域・入札・自分で追加した除外）は、候補を入れ替えても残す
  function resetCands(source) {
    const s = st.setup, keep = { headlines: s.headlines, descriptions: s.descriptions, adSource: s.adSource, adAt: s.adAt, hls: s.hls, descs: s.descs, area: s.area, bidding: s.bidding, bid: s.bid, customNeg: s.customNeg };
    initSetup(source);
    Object.assign(st.setup, keep);
  }
  const kwTouched = () => st.setup.kw.some(x => x.act);
  function changeSource(v) {
    if (v === st.setup.source) return;
    if (kwTouched() && !confirm('キーワード候補を入れ替えると、キーワードの選択（使う・除外・使わない）はリセットされます。よろしいですか？')) { renderKeep(); return; }
    st.aiFlow.kw.msg = null;
    resetCands(v);
    renderKeep();
  }
  function changeAdSource(v) {
    if (v === st.setup.adSource) return;
    if ((st.setup.headlines.length || st.setup.descriptions.length) && !confirm('広告文の候補を入れ替えると、見出し・説明文の選択はリセットされます。よろしいですか？')) { renderKeep(); return; }
    st.aiFlow.ad.msg = null;
    setAds(v);
    renderKeep();
  }
  // 検索語句レポートの作り方を変えたら、1ヶ月目の結果を作り直す（運用改善の1ヶ月目だけ。改善中の変更は残す）
  const termsEditable = () => st.ops && st.ops.history.length === 1 && !st.ops.rounds.length;
  function applyTerms(source) {
    const t = source === 'ai' && st.ai.terms;
    st.setup.termsSource = source;
    st.setup.terms = t ? {
      variants: t.variants.slice(),
      groups: t.irr.reduce((g, x) => ((g[x.group] = g[x.group] || []).push({ q: x.q, w: x.w }), g), {})
    } : null;
    if (!termsEditable()) return;
    const dr = st.ops.draft;
    startOps();
    if (dr) { dr.setup.terms = clone(st.setup.terms); dr.setup.termsSource = source; st.ops.draft = dr; }
  }
  function changeTermsSource(v) {
    if (!termsEditable() || v === st.setup.termsSource) return;
    st.aiFlow.terms.msg = null;
    applyTerms(v);
    renderKeep();
  }
  function importAi(target) {
    const f = st.aiFlow[target], el = $(`#sim-ai-paste-${target}`);
    if (el) f.draft = el.value;
    const r = PARSERS[target](f.draft);
    if (r.error) { f.msg = { error: r.error, warns: r.warns || [] }; renderKeep(); return; }
    if (target === 'kw' && st.phase === 'setup' && st.setup.source === 'ai' && kwTouched() && !confirm('新しい候補を取り込むと、今のキーワードの選択はリセットされます。よろしいですか？')) return;
    if (target === 'ad' && st.setup.adSource === 'ai' && (st.setup.headlines.length || st.setup.descriptions.length) && !confirm('新しい広告文を取り込むと、今の見出し・説明文の選択はリセットされます。よろしいですか？')) return;
    st.ai[target] = Object.assign(r.data, { at: Date.now(), industry: st.karte.industry, areaName: (st.karte.areaName || '').trim(), summary: r.summary });
    f.msg = { ok: true, summary: r.summary, warns: r.warns };
    f.draft = '';
    st.dirty = true;
    if (target === 'kw') { st.kwSource = 'ai'; if (st.phase === 'setup') resetCands('ai'); }
    if (target === 'ad') setAds('ai');
    if (target === 'terms') applyTerms('ai');
    saveCase();
    renderKeep();
  }

  function renderKeep() {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }
  function addOpNegative() {
    const t = $('#sim-op-neg-text').value.trim().replace(/^[-−]+/, '');
    if (!t) return;
    if (!st.ops.draft.setup.customNeg.includes(t)) st.ops.draft.setup.customNeg.push(t);
    renderKeep();
    $('#sim-op-neg-text').focus();
  }
  function addNegative() {
    const input = $('#sim-neg-text');
    const t = input.value.trim().replace(/^[-−]+/, '');
    if (!t) return;
    if (!st.setup.customNeg.includes(t)) st.setup.customNeg.push(t);
    renderKeep();
    $('#sim-neg-text').focus();
  }

  /* =========================================================
     段階3：成果シミュレーション（計算エンジン）
     数値は sim-benchmarks.js の目安を掛け合わせて求める。月(month)と opts で
     2・3ヶ月目（段階4）にも使えるようにしている。
     ========================================================= */
  // 同じ seed なら同じ結果になる乱数（画面を描き直しても数値が変わらないように）
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const jitter = (r, amp) => 1 + (r() * 2 - 1) * amp;
  // 期待値 λ のときの件数（少ない件数でも自然にばらつくように）
  function poisson(r, lambda) {
    if (lambda <= 0) return 0;
    if (lambda > 40) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * (r() + r() + r() - 1.5) * 2));
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= r(); } while (p > L);
    return k - 1;
  }
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  function newSeed() { st.seed = Math.floor(Math.random() * 1e9) + 1; }

  // 地域の設定が成約率に与える倍率（広げて増えた分は成約率が低い）
  function geoCvrOf(geo) {
    if (geo.extraCvr == null) return geo.cvr;
    return geo.cvr / geo.volume + geo.extraCvr * (1 - 1 / geo.volume);
  }
  // 計測状況から「管理画面で数えられる成果」を出す
  function measuredOf(conv) {
    const m = st.karte.measurement;
    if (m === 'none') return null;
    return m === 'partial' ? Math.round(conv * B.partialMeasuredRatio) : conv;
  }

  /* ---------- Google検索 ---------- */
  function simGoogle(month = 1, opts = {}) {
    const k = st.karte, s = st.setup, ind = B.industries[k.industry];
    const r = rng(st.seed + month * 7919);
    const scale = B.area[k.area].searchScale;
    const gk = geoKey(s.area), geo = B.geoFit[gk];
    const groups = negGroups(), blocked = blockedGroups();
    const negs = negativesOf();
    const fracs = Object.fromEntries(groups.map(g => [g.id, blocked.has(g.id) ? 1 : groupBlockFrac(g, negs)]));
    const blockedShare = groups.reduce((a, g) => a + g.share * fracs[g.id], 0);
    const conflictHits = new Set(conflictsOf().flatMap(x => x.hits));
    const blockRules = kwList().filter((c, i) => s.kw[i].act === 'negative' && c.blocks).map(c => c.blocks);
    const bid = B.bidding[s.bidding], auto = s.bidding !== 'manual';
    const measured = k.measurement !== 'none';
    const priorCv = opts.priorCv != null ? opts.priorCv : (numOf('monthlyCv', k.monthlyCv) || 0);
    const AL = B.autoBidLearning, MS = B.manualShare;
    const flags = { gk, blockedShare, conflicts: conflictHits.size, budget: k.budget };

    // 入札戦略による倍率
    let cpcF = bid.cpc, cvrF = bid.cvr || 1, swing = 0;
    if (bid.needsConversion && !measured) {
      cpcF *= B.noMeasurement.autoBidCpc;
      const [lo, hi] = B.noMeasurement.autoBidSwing;
      cvrF = lo + (hi - lo) * r();
      flags.noMeasureAuto = true;
    } else if (bid.needsConversion) {
      if (priorCv < AL.monthlyConversions) { cpcF *= AL.lowDataCpc; swing = AL.lowDataSwing; flags.lowData = true; }
      cvrF *= AL.curve[Math.min(month, AL.curve.length) - 1] * (opts.reset ? AL.resetFactor : 1);
    }
    let shareF = 1;
    if (s.bidding === 'targetCpa' && k.targetCpa < benchOf(k).cpa * B.strictTargetCpa.ratio) { shareF = B.strictTargetCpa.shareFactor; flags.strictCpa = true; }

    const lp = B.lp[k.lp].cvr, cons = B.consideration[k.consideration].cvr, geoCvr = geoCvrOf(geo);
    const n = { imp: jitter(r, B.noise.impressions), ctr: jitter(r, B.noise.ctr), cpc: jitter(r, B.noise.cpc), cvr: jitter(r, B.noise.cvr) * (swing ? jitter(r, swing) : 1) };

    let rows = addedIdx().map(i => {
      const c = kwList()[i], sel = s.kw[i], m = B.match[sel.match];
      const term = isTermKw(c);
      const intent = term ? 'low' : c.intent, it = B.intent[intent];
      const qk = kwQuality(c), q = B.quality[qk];
      let searches = (term ? B.termKeyword.volume : c.volume) * scale * geo.volume;
      if (conflictHits.has(fill(c.kw))) searches = 0;
      for (const b of blockRules) if (b.themes.includes(c.theme)) searches *= 1 - b.ratio;
      const matched = searches * m.reach;
      // キーワードの言い換え（「〇〇 近く」など）。除外キーワードに当たる言い換えには表示されない
      const variants = term ? [] : variantsFor(fill(c.kw), sel.match).filter((v, j) => j === 0 || !negs.some(n => tokensIn(n.text, v.q)));
      const relW = variants.reduce((a, v) => a + v.w, 0);
      const relQ = term ? 0 : matched * (1 - m.irrelevant) * relW;
      const irrQ = term ? matched : matched * m.irrelevant * (1 - blockedShare);
      const listCpc = (term ? B.termKeyword.cpc : c.cpc) * m.cpc * q.cpc * geo.cpc * cpcF;
      const share = auto ? bid.baseShare * shareF : clamp(MS.base * Math.pow(s.bid / listCpc, MS.power), MS.min, MS.max);
      const cpc = (auto ? listCpc : Math.min(s.bid, listCpc)) * n.cpc;
      const ctr = ind.search.ctr * it.ctr * m.ctr * q.ctr * n.ctr;
      const impRel = relQ * share * n.imp, impIrr = irrQ * share * n.imp;
      const clkRel = impRel * ctr, clkIrr = impIrr * ctr * B.irrelevantClick.ctr;
      const cvr = ind.search.cvr * it.cvr * lp * cons * geoCvr * cvrF * n.cvr;
      return {
        i, c, text: fill(c.kw), match: sel.match, quality: qk, share, cpc, variants,
        imp: impRel + impIrr, clicks: clkRel + clkIrr, irrClicks: clkIrr,
        expConv: clkRel * cvr + clkIrr * cvr * B.irrelevantClick.cvr
      };
    });

    // 予算を超える分は表示できない（全体を予算に合わせて縮める）
    const rawCost = rows.reduce((a, x) => a + x.clicks * x.cpc, 0);
    const f = rawCost > k.budget ? k.budget / rawCost : 1;
    flags.limited = f < 0.98;
    flags.budgetRatio = f;
    rows = rows.map(x => {
      const clicks = Math.round(x.clicks * f), irr = Math.min(clicks, Math.round(x.irrClicks * f));
      const conv = poisson(r, x.expConv * f);
      return Object.assign(x, { imp: Math.round(x.imp * f), clicks, irrClicks: irr, cost: clicks * x.cpc, irrCost: irr * x.cpc, conv: Math.min(conv, clicks) });
    });

    const t = rows.reduce((a, x) => ({ imp: a.imp + x.imp, clicks: a.clicks + x.clicks, cost: a.cost + x.cost, conv: a.conv + x.conv, irrClicks: a.irrClicks + x.irrClicks, irrCost: a.irrCost + x.irrCost }),
      { imp: 0, clicks: 0, cost: 0, conv: 0, irrClicks: 0, irrCost: 0 });
    t.ctr = t.imp ? t.clicks / t.imp : 0;
    t.cpc = t.clicks ? t.cost / t.clicks : 0;
    t.measured = measuredOf(t.conv);
    t.cpa = t.conv ? t.cost / t.conv : null;
    t.measuredCpa = t.measured ? t.cost / t.measured : null;
    flags.dailyClicks = t.clicks / B.budget.daysPerMonth;
    flags.avgShare = rows.length ? rows.reduce((a, x) => a + x.share, 0) / rows.length : 0;

    // 検索語句レポート（実際にどんな検索で表示・クリックされたか）
    const report = [];
    rows.forEach(x => {
      const ws = x.variants.map(v => v.w);
      const cl = splitInt(x.clicks - x.irrClicks, ws), cv = splitInt(x.conv, ws);
      x.variants.forEach((v, j) => { if (cl[j] > 0) report.push({ q: v.q, kw: x.text, match: x.match, clicks: cl[j], cost: cl[j] * x.cpc, conv: Math.min(cv[j], cl[j]), rel: true }); });
    });
    const irrTerms = [];
    groups.forEach(g => {
      const ts = termsOf(g.id).filter(x => !negs.some(n => tokensIn(n.text, fill(x.q))));
      const tw = ts.reduce((a, x) => a + x.w, 0);
      if (!tw || fracs[g.id] >= 1) return;
      ts.forEach(x => irrTerms.push({ q: fill(x.q), group: g.id, w: g.share * (1 - fracs[g.id]) * x.w / tw }));
    });
    const topIrr = rows.reduce((a, x) => (!a || x.irrClicks > a.irrClicks ? x : a), null);
    const irrCpc = t.irrClicks ? t.irrCost / t.irrClicks : 0;
    splitInt(t.irrClicks, irrTerms.map(x => x.w)).forEach((clicks, j) => {
      if (clicks > 0) report.push({ q: irrTerms[j].q, kw: topIrr ? topIrr.text : '', match: topIrr ? topIrr.match : 'broad', clicks, cost: clicks * irrCpc, conv: 0, rel: false, group: irrTerms[j].group });
    });
    report.sort((a, b) => b.cost - a.cost);
    return { media: 'google', month, rows, totals: t, flags, report };
  }

  /* ---------- Meta ---------- */
  function simMeta(month = 1, opts = {}) {
    const k = st.karte, m = st.setup.meta, ind = B.industries[k.industry], M = B.meta;
    const r = rng(st.seed + month * 7919);
    const size = audienceOf(m);
    const sets = Number(m.adsets || 1);
    const measured = k.measurement !== 'none';
    const flags = { size, sets };
    // CPM
    let cpm = ind.meta.cpm * M.placementCpm[m.placement] * (1 + M.adsetOverlapCpm * (sets - 1));
    if (size < M.smallAudience.under) { cpm *= M.smallAudience.cpm; flags.smallAudience = true; }
    if (special()) cpm *= M.specialCategoryCpm;
    cpm *= jitter(r, B.noise.impressions);
    const imp = Math.round(k.budget / cpm * 1000);
    const reach = Math.round(Math.min(size, size * (1 - Math.exp(-imp / size))));
    const freq = reach ? imp / reach : 0;
    // 広告疲れ
    const fatigue = freq > M.fatigue.from ? Math.max(0.5, 1 - M.fatigue.ctrDropPerFreq * (freq - M.fatigue.from)) : 1;
    flags.fatigue = fatigue < 1;
    // パフォーマンスの目標（計測なしで「コンバージョン」を選ぶと、クリック目的と同じ扱い）
    const optKey = !measured && (m.optimization === 'conversions' || m.optimization === 'lpviews') ? 'clicks' : m.optimization;
    flags.optFallback = optKey !== m.optimization;
    const opt = M.optimization[optKey];
    const ctr = ind.meta.ctr * B.creative[k.creative].ctr * opt.ctr * fatigue * jitter(r, B.noise.ctr);
    const clicks = Math.round(imp * ctr);
    // 成約率
    const area = !m.metaArea || (m.metaArea === 'narrower' && special()) ? 'match' : m.metaArea;
    let cvr = ind.meta.cvr * B.lp[k.lp].cvr * B.consideration[k.consideration].cvr * opt.cvr * geoCvrOf(B.geoFit[area]);
    if (!measured) cvr *= B.noMeasurement.metaCvr;
    // 学習期間：週のコンバージョンが足りないと完了しない（小規模の予算ではよくある）
    const weekly = clicks * cvr / (B.budget.daysPerMonth / 7) / sets;
    flags.weeklyPerSet = weekly;
    let swing = 0;
    if (weekly < M.learning.weeklyConversions) { cvr /= M.learning.notCompleteCpa; swing = M.learning.notCompleteSwing; flags.learningIncomplete = true; }
    if (month === 1 || opts.reset) { cvr *= 0.25 / M.learning.firstWeekCpa + 0.75; flags.firstWeek = true; }
    cvr *= jitter(r, B.noise.cvr) * (swing ? jitter(r, swing) : 1);
    const conv = Math.min(clicks, poisson(r, clicks * cvr));
    const t = { imp, reach, freq, cpm: k.budget / imp * 1000, clicks, ctr: imp ? clicks / imp : 0, cost: k.budget, cpc: clicks ? k.budget / clicks : 0, conv };
    t.measured = measuredOf(conv);
    t.cpa = conv ? t.cost / conv : null;
    t.measuredCpa = t.measured ? t.cost / t.measured : null;
    return { media: 'meta', month, totals: t, flags };
  }

  // 整数 n を重みの比で分ける（端数は大きい順に配る）
  function splitInt(n, ws) {
    const tot = ws.reduce((a, w) => a + w, 0);
    if (!tot || n <= 0) return ws.map(() => 0);
    const raw = ws.map(w => n * w / tot), out = raw.map(Math.floor);
    let rest = n - out.reduce((a, x) => a + x, 0);
    raw.map((x, i) => [x - out[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { out[i]++; rest--; } });
    return out;
  }
  const tokensIn = (neg, q) => neg.split(/\s+/).filter(Boolean).every(w => q.includes(w));
  const termsOf = gid => (searchTermsOf().groups || {})[gid] || [];
  // 除外キーワードで、ある種類の関係ない検索をどれだけ防げているか（0〜1）
  function groupBlockFrac(g, negs) {
    if (negs.some(n => n.group === g.id)) return 1;
    const ts = termsOf(g.id), tot = ts.reduce((a, x) => a + x.w, 0);
    if (!tot) return 0;
    return ts.filter(x => negs.some(n => tokensIn(n.text, fill(x.q)))).reduce((a, x) => a + x.w, 0) / tot;
  }
  // マッチタイプごとの、キーワードそのもの＋言い換えの割合
  const VARIANT_W = { exact: [1], phrase: [0.7, 0.15, 0.15], broad: [0.5, 0.2, 0.15, 0.15] };
  function variantsFor(text, match) {
    const ws = VARIANT_W[match];
    const vs = (searchTermsOf().variants || []).filter(v => !text.includes(v));
    return ws.map((w, j) => ({ q: j === 0 ? text : `${text} ${vs[j - 1] || ''}`.trim(), w })).filter((v, j, a) => a.findIndex(x => x.q === v.q) === j);
  }

  const simulate = (month, opts) => st.karte.media === 'meta' ? simMeta(month, opts) : simGoogle(month, opts);

  /* ---------- 結果の解説（なぜこの数値になったか） ---------- */
  function explainGoogle(res) {
    const k = st.karte, t = res.totals, f = res.flags, out = [];
    const add = (level, title, text) => out.push({ level, title, text });
    if (f.limited) {
      const okCpa = t.cpa && t.cpa <= k.targetCpa;
      add(okCpa ? 'ok' : 'bad', okCpa ? '予算で表示が制限されています（伸ばせる余地あり）' : '予算で表示が制限されています',
        `設定したキーワードと入札なら月${yen(k.budget / f.budgetRatio)}分の表示ができますが、予算が${yen(k.budget)}なので、表示できたのは約${Math.round(f.budgetRatio * 100)}%です。${okCpa ? 'CPAは目標以内なので、予算を増やせば成果を伸ばせる可能性があります。' : 'キーワードを本命に絞るか、予算を増やすと改善します。'}`);
    }
    else if (t.cost < k.budget * 0.6) add('ok', '予算を使い切れていません', `使った費用は${yen(t.cost)}で、予算の${Math.round(t.cost / k.budget * 100)}%です。キーワードが少ない・入札が低いなどで、表示の機会が足りていません。`);
    else add('good', '予算をほぼ使い切れています', `使った費用は${yen(t.cost)}（予算の${Math.round(t.cost / k.budget * 100)}%）です。`);
    if (f.dailyClicks < B.budget.minDailyClicks) add('bad', '1日のクリックが少なすぎます', `1日あたり約${f.dailyClicks.toFixed(1)}クリックです。データがたまるのに時間がかかり、良し悪しの判断もしにくくなります。`);

    const irrRate = t.clicks ? t.irrClicks / t.clicks : 0;
    const broad = res.rows.filter(x => x.match === 'broad').length;
    const irrText = `クリックの約${Math.round(irrRate * 100)}%（${fmt(t.irrClicks)}回・約${yen(t.irrCost)}）が関係ない検索からでした。${broad ? `部分一致のキーワードが${broad}個あるため、関係ない検索に出やすくなっています。` : ''}除外キーワードで防げたのは、関係ない検索の約${Math.round(f.blockedShare * 100)}%です。`;
    add(irrRate > 0.15 ? 'bad' : irrRate > 0.05 ? 'ok' : 'good', irrRate > 0.15 ? '関係ない検索に広告費を使っています' : irrRate > 0.05 ? '関係ない検索が少し混ざっています' : '関係ない検索をよく防げています', irrText);
    if (f.conflicts) add('bad', '除外キーワードが、使うキーワードを打ち消しています', '一部のキーワードに広告がまったく出ていません。除外キーワードを見直しましょう。');
    if (kwList().some((c, i) => st.setup.kw[i].act === 'negative' && c.blocks)) add('bad', '除外キーワードで、良い検索まで減っています', '自分の商品と矛盾する除外キーワード（例：無料体験なのに「無料」を除外）があり、本命の検索の一部に広告が出ていません。');

    const qs = res.rows.map(x => x.quality);
    const low = qs.filter(q => q === 'low').length, high = qs.filter(q => q === 'high').length;
    if (low) add('bad', '品質の低いキーワードがあります', `${low}個のキーワードで、広告見出しとの関連性が低くなっています。クリック率×${B.quality.low.ctr}・クリック単価×${B.quality.low.cpc}で計算しています。`);
    else if (high === qs.length && qs.length) add('good', 'すべてのキーワードで品質が高いです', `見出しとキーワードがよく合っているので、クリック率が上がり（×${B.quality.high.ctr}）、クリック単価が下がっています（×${B.quality.high.cpc}）。`);
    else add('ok', '品質が「ふつう」のキーワードがあります', 'キーワードのテーマに合う見出しを追加すると、クリック単価が下がります。');

    const g = B.geoFit[f.gk];
    if (f.gk === 'nationalForLocal') add('bad', '全国に配信しています', `表示は増えていますが、大半が来られない地域の人です（増えた分の成約率×${g.extraCvr}）。`);
    else if (f.gk === 'wider') add('ok', '商圏より広く配信しています', `表示は×${g.volume}に増えていますが、増えた分の成約率は×${g.extraCvr}です。`);
    else if (f.gk === 'narrower') add('ok', '商圏より狭く配信しています', `成約率は上がりますが（×${g.cvr}）、表示が減り（×${g.volume}）、クリック単価が上がっています（×${g.cpc}）。`);

    if (st.setup.bidding === 'manual' && f.avgShare < 0.35) add('bad', '入札額が低く、あまり掲載されていません', `入札額${yen(st.setup.bid)}では、検索されても広告が出たのは平均約${Math.round(f.avgShare * 100)}%でした。`);
    if (f.noMeasureAuto) add('bad', '計測なしで自動入札を使っています', `成果のデータがないため、Googleが何を目指せばいいか分からず、成果が不安定になっています。クリック単価も×${B.noMeasurement.autoBidCpc}で計算しています。`);
    if (f.lowData) add('ok', '自動入札の学習データが足りません', `月のコンバージョンが${B.autoBidLearning.monthlyConversions}件未満なので、成果のブレを大きく（±${Math.round(B.autoBidLearning.lowDataSwing * 100)}%）、クリック単価を×${B.autoBidLearning.lowDataCpc}で計算しています。`);
    if (f.strictCpa) add('bad', '目標CPAが厳しく、配信が絞られています', `目標CPA ${yen(k.targetCpa)}は目安よりかなり低いため、Googleが入札を控え、表示が約半分になっています。`);
    explainCommon(out, add);
    return out;
  }

  function explainMeta(res) {
    const k = st.karte, t = res.totals, f = res.flags, M = B.meta, out = [];
    const add = (level, title, text) => out.push({ level, title, text });
    if (f.smallAudience) add('bad', 'オーディエンスが狭すぎます', `推定約${fmt(f.size)}人まで絞り込んでいるため、CPMが×${M.smallAudience.cpm}に上がっています。`);
    else add('good', 'オーディエンスの広さは十分です', `推定約${fmt(f.size)}人に配信できるので、CPMが上がりにくくなっています。`);
    if (f.fatigue) add('bad', '同じ人に何度も表示されています（広告疲れ）', `フリークエンシーが月${t.freq.toFixed(1)}回で、${M.fatigue.from}回を超えたぶんクリック率が下がっています。オーディエンスを広げるか、素材を増やしましょう。`);
    else add('good', 'フリークエンシーは適正です', `1人あたり月${t.freq.toFixed(1)}回の表示で、広告疲れは起きていません。`);
    if (f.learningIncomplete) add('ok', '学習期間が完了していません', `広告セット1つあたりのコンバージョンが週約${f.weeklyPerSet.toFixed(1)}件で、学習完了の目安（週${M.learning.weeklyConversions}件）に届いていません。CPA×${M.learning.notCompleteCpa}、ブレ±${Math.round(M.learning.notCompleteSwing * 100)}%で計算しています。${M.learning.note}`);
    if (f.firstWeek) add('ok', '最初の1週間は学習期間です', `配信を始めた直後は、Metaが反応しやすい人を探している途中なので、最初の1週間はCPA×${M.learning.firstWeekCpa}で計算しています。`);
    if (f.optFallback) add('bad', '計測がないので、成果に向けた配信ができていません', 'ピクセルがないため、選んだパフォーマンスの目標は働かず、「リンクのクリック数」と同じ扱いで計算しています。');
    else if (st.setup.meta.optimization === 'clicks') add('ok', 'クリック目的で配信しています', `クリックしやすい人に配信されるため、クリック率は上がりますが（×${M.optimization.clicks.ctr}）、成約率は下がります（×${M.optimization.clicks.cvr}）。`);
    else if (st.setup.meta.optimization === 'reach') add('bad', 'リーチ目的で配信しています', `多くの人に見せる設定なので、クリック率（×${M.optimization.reach.ctr}）も成約率（×${M.optimization.reach.cvr}）も低くなっています。`);
    if (f.sets > 1) add('ok', `広告セットを${f.sets}つに分けています`, `予算とデータが分散し、同じ人を取り合うためCPMも少し上がっています（1つ増えるごとに+${Math.round(M.adsetOverlapCpm * 100)}%）。`);
    if (special()) add('ok', '特別な広告カテゴリの制限があります', `ターゲティングが制限されるため、CPMを×${M.specialCategoryCpm}で計算しています。`);
    if (st.setup.meta.placement !== 'auto') add('ok', '配置を絞っています', `配信先が減るため、CPMを×${M.placementCpm[st.setup.meta.placement]}で計算しています。`);
    explainCommon(out, add);
    return out;
  }

  function explainCommon(out, add) {
    const k = st.karte;
    if (k.lp === 'none') add('bad', 'LPがないため、成約率が下がっています', `電話・SNSへの誘導だけなので、成約率を×${B.lp.none.cvr}で計算しています。LPを用意するのが大きな改善になります。`);
    else if (k.lp === 'homepage') add('ok', 'LPがホームページのトップだけです', `成約率を×${B.lp.homepage.cvr}で計算しています。広告の内容に合ったページを用意すると改善します。`);
    if (k.measurement === 'none') add('bad', '成果が計測できていません', 'ここに出ている成果の数は「実際にはこのくらい出ているはず」という推定です。管理画面では0件に見えるため、良し悪しを判断できません。');
    else if (k.measurement === 'partial') add('ok', '成果の一部しか計測できていません', `実際の成果のうち、管理画面で数えられるのは約${Math.round(B.partialMeasuredRatio * 100)}%です。実際より悪く見えてしまいます。`);
  }

  // 目標との比較
  function verdictOf(t) {
    const k = st.karte;
    const cv = t.measured != null ? t.measured : t.conv;
    const cpa = t.measured != null ? t.measuredCpa : t.cpa;
    if (k.upperCpa && cpa && cpa > k.upperCpa) return { level: 'bad', text: '赤字です', sub: `CPA ${yen(cpa)} が上限CPA ${yen(k.upperCpa)} を超えています。` };
    if (!cv) return { level: 'bad', text: '成果が出ていません', sub: '1件もコンバージョンが出ていません。' };
    if (cv >= k.targetCount && cpa <= k.targetCpa * 1.05) return { level: 'good', text: '目標達成！', sub: `目標の${fmt(k.targetCount)}件・CPA ${yen(k.targetCpa)} をクリアしました。` };
    if (cv >= k.targetCount * 0.7) return { level: 'ok', text: 'あと少しで目標です', sub: `目標の${fmt(k.targetCount)}件まであと${fmt(Math.max(0, k.targetCount - cv))}件です。` };
    return { level: 'bad', text: '目標に届いていません', sub: `目標${fmt(k.targetCount)}件に対して${fmt(cv)}件（${Math.round(cv / k.targetCount * 100)}%）です。` };
  }

  /* ---------- 結果の画面 ---------- */
  function renderResult() {
    const k = st.karte, res = simulate(1), t = res.totals, isMeta = res.media === 'meta';
    const items = isMeta ? explainMeta(res) : explainGoogle(res);
    const v = verdictOf(t);
    const cvLabel = t.measured == null ? `<b>${fmt(t.conv)}件</b><small>推定（管理画面では0件）</small>`
      : k.measurement === 'partial' ? `<b>${fmt(t.measured)}件</b><small>実際は約${fmt(t.conv)}件</small>` : `<b>${fmt(t.conv)}件</b>`;
    const cpaVal = t.measured == null ? t.cpa : t.measuredCpa;
    const cvShown = t.measured != null ? t.measured : t.conv;
    const pctOf = (a, b) => Math.min(100, Math.round(a / b * 100));
    const kpi = (label, val, sub = '') => `<div><small>${label}</small><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;

    const metaKpis = isMeta ? [
      kpi('表示回数', fmt(t.imp) + '回'), kpi('リーチ', fmt(t.reach) + '人'), kpi('フリークエンシー', t.freq.toFixed(1) + '回'),
      kpi('CPM', yen(t.cpm)), kpi('クリック数', fmt(t.clicks) + '回'), kpi('クリック率', pct(t.ctr, 2)), kpi('クリック単価', yen(t.cpc))
    ] : [
      kpi('表示回数', fmt(t.imp) + '回'), kpi('クリック数', fmt(t.clicks) + '回'), kpi('クリック率', pct(t.ctr, 2)), kpi('クリック単価', yen(t.cpc))
    ];

    return `
      <p class="lead">${isMeta ? 'オーディエンス設定' : 'キーワード・広告見出し・地域・入札'}とカルテの内容から、1ヶ月配信した場合の成果を計算しました。毎回少しランダムなブレが入ります。</p>

      <section class="field sim-verdict ${v.level}">
        <p class="sim-verdict-main">${v.level === 'good' ? '🎉' : v.level === 'ok' ? '💪' : '⚠️'} ${esc(v.text)}</p>
        <p class="sim-hint">${esc(v.sub)}</p>
        <div class="sim-goal-bars">
          <div><span>コンバージョン</span><div class="sim-bar"><i style="width:${pctOf(cvShown, k.targetCount)}%"></i></div><b>${fmt(cvShown)} / ${fmt(k.targetCount)}件</b></div>
          <div><span>CPA</span><div class="sim-bar ${cpaVal && cpaVal > k.targetCpa ? 'over' : ''}"><i style="width:${cpaVal ? pctOf(cpaVal, Math.max(k.targetCpa, k.upperCpa || 0) * 1.2 || 1) : 0}%"></i></div><b>${cpaVal ? yen(cpaVal) : '―'}<small>目標 ${yen(k.targetCpa)}${k.upperCpa ? `・上限 ${yen(k.upperCpa)}` : ''}</small></b></div>
        </div>
      </section>

      <section class="field">
        <div class="field-head"><h3>📈 1ヶ月目の結果</h3></div>
        <div class="sim-kpis sim-result-kpis">
          ${metaKpis.join('')}
          ${kpi('費用', yen(t.cost), `予算 ${manYen(k.budget)}`)}
          <div class="sim-kpi-cv"><small>コンバージョン</small>${cvLabel}</div>
          ${kpi('CPA', cpaVal ? yen(cpaVal) : '―', t.measured == null ? '推定' : '')}
          ${isMeta ? kpi('オーディエンス', '約' + fmt(res.flags.size) + '人', res.flags.learningIncomplete ? '学習は未完了' : '学習完了') : ''}
        </div>
      </section>

      <h2 class="sec-title">🔍 なぜこの結果になったか</h2>
      ${items.map(x => `
        <article class="res-item ${x.level}">
          <div class="res-head"><span class="mark ${x.level}">${{ good: '◎ 良い', ok: '△ 注意', bad: '× 要改善' }[x.level]}</span><h3>${esc(x.title)}</h3></div>
          <p class="reason">${esc(x.text)}</p>
        </article>`).join('')}

      ${isMeta ? '' : renderKwResults(res)}

      <details class="tc-guide sim-guide">
        <summary>計算のしくみ</summary>
        ${isMeta ? `<dl>
          <dt>表示回数</dt><dd>予算 ÷ CPM × 1000（CPMは業種の目安 × 配置・オーディエンスの狭さ・特別カテゴリ・広告セット数の補正）</dd>
          <dt>リーチ</dt><dd>オーディエンス × (1 − e^(−表示回数 ÷ オーディエンス))</dd>
          <dt>クリック数</dt><dd>表示回数 × クリック率（業種の目安 × 素材 × パフォーマンスの目標 × 広告疲れ）</dd>
          <dt>コンバージョン</dt><dd>クリック数 × 成約率（業種の目安 × LP × 検討期間 × 目標 × 地域 × 計測 × 学習）</dd>
        </dl>` : `<dl>
          <dt>表示回数</dt><dd>想定検索数 × 商圏 × 配信地域 × マッチタイプの広がり × 掲載される割合（関係ない検索は、除外で防げなかった分が加わる）</dd>
          <dt>クリック数</dt><dd>表示回数 × クリック率（業種の目安 × 検索意図 × マッチタイプ × 品質）</dd>
          <dt>クリック単価</dt><dd>キーワードの想定CPC × マッチタイプ × 品質 × 地域 × 入札戦略（手動入札は入札額が上限）</dd>
          <dt>コンバージョン</dt><dd>クリック数 × 成約率（業種の目安 × 検索意図 × LP × 検討期間 × 地域 × 入札戦略）</dd>
          <dt>予算</dt><dd>費用が予算を超える場合は、全体を予算に合わせて縮める</dd>
        </dl>`}
        <p class="sim-hint">毎回、表示回数±${Math.round(B.noise.impressions * 100)}%・クリック率±${Math.round(B.noise.ctr * 100)}%・クリック単価±${Math.round(B.noise.cpc * 100)}%・成約率±${Math.round(B.noise.cvr * 100)}%のランダムなブレが入ります。目安の数値は sim-benchmarks.js にまとめています。</p>
      </details>

      <div class="end-actions">
        <button type="button" class="btn-ghost" data-action="sim-back-setup">← 設定を直す</button>
        <button type="button" class="btn-ghost" data-action="sim-reroll">🎲 ブレを変えてもう一度</button>
        <button type="button" class="btn-primary" data-action="sim-to-ops">次へ：運用改善 →</button>
      </div>`;
  }

  function renderKwResults(res) {
    const rows = res.rows.slice().sort((a, b) => b.cost - a.cost);
    return `<section class="field">
      <div class="field-head"><h3>🔑 キーワード別の結果</h3></div>
      <ul class="sim-kwres">${rows.map(x => `
        <li class="${x.conv ? 'good' : x.cost > st.karte.targetCpa ? 'bad' : 'ok'}">
          <div class="sim-kwres-head"><b>${esc(MATCH_CODE[x.match](x.text))}</b><span class="tag tag-level">${esc(B.match[x.match].label)}・品質${QUALITY_LABEL[x.quality]}</span></div>
          <p class="sim-kwres-nums">
            <span>表示 <b>${fmt(x.imp)}</b></span><span>クリック <b>${fmt(x.clicks)}</b></span><span>CTR <b>${x.imp ? pct(x.clicks / x.imp, 1) : '―'}</b></span>
            <span>CPC <b>${yen(x.cpc)}</b></span><span>費用 <b>${yen(x.cost)}</b></span><span>CV <b>${fmt(x.conv)}</b></span><span>CPA <b>${x.conv ? yen(x.cost / x.conv) : '―'}</b></span>
          </p>
          ${x.irrClicks ? `<p class="sim-kwres-why">うち関係ない検索：${fmt(x.irrClicks)}クリック・約${yen(x.irrCost)}</p>` : ''}
          ${x.clicks === 0 ? '<p class="sim-kwres-why">広告がほとんど表示されていません（除外キーワードの打ち消し・入札額・予算を確認）</p>' : ''}
        </li>`).join('')}</ul>
    </section>`;
  }

  /* =========================================================
     段階4：運用改善（1ヶ月目の結果 → 改善 → 2ヶ月目 → 改善 → 3ヶ月目 → 振り返り）
     ========================================================= */
  const MONTHS = 3;
  const clone = o => JSON.parse(JSON.stringify(o));
  // 一時的に別の設定（改善案など）で計算する
  function withState(setup, karte, fn) {
    const s0 = st.setup, k0 = st.karte;
    st.setup = setup; st.karte = karte;
    try { return fn(); } finally { st.setup = s0; st.karte = k0; }
  }
  function snapshotMonth(res) {
    return { month: res.month, res, explain: res.media === 'meta' ? explainMeta(res) : explainGoogle(res), verdict: verdictOf(res.totals), setup: clone(st.setup), karte: clone(st.karte) };
  }
  function startOps() {
    st.ops = { history: [snapshotMonth(simulate(1))], rounds: [], draft: null };
    makeDraft();
  }
  const lastMonth = () => st.ops.history[st.ops.history.length - 1];
  function makeDraft() { st.ops.draft = { setup: clone(st.setup), karte: clone(st.karte) }; }
  const cvOf = t => t.measured != null ? t.measured : t.conv;
  const cpaOf = t => t.measured != null ? t.measuredCpa : t.cpa;
  const needsCv = b => !!B.bidding[b].needsConversion;
  const CREATIVE_UP = { none: 'image', image: 'video' };

  /* ---------- 前月からの変更点 ---------- */
  function changesList(b, a) {
    const out = [];
    const isMeta = b.karte.media === 'meta';
    if (!isMeta) {
      const nb = withState(b.setup, b.karte, () => negativesOf().map(n => n.text));
      const na = withState(a.setup, a.karte, () => negativesOf().map(n => n.text));
      const added = na.filter(x => !nb.includes(x)), removed = nb.filter(x => !na.includes(x));
      if (added.length) out.push(`除外キーワードを追加：${added.join('、')}`);
      if (removed.length) out.push(`除外キーワードを削除：${removed.join('、')}`);
      kwList().forEach((c, i) => {
        const x = b.setup.kw[i], y = a.setup.kw[i], t = fill(c.kw);
        if (x.act === 'add' && y.act === 'paused') out.push(`「${t}」を停止`);
        else if (x.act === 'paused' && y.act === 'add') out.push(`「${t}」を再開`);
        else if (x.act !== 'add' && x.act !== 'paused' && y.act === 'add') out.push(`「${t}」を追加（${B.match[y.match].label}）`);
        else if (x.act === 'add' && y.act === 'add' && x.match !== y.match) out.push(`「${t}」を${B.match[x.match].label}→${B.match[y.match].label}`);
      });
      if (JSON.stringify(b.setup.headlines) !== JSON.stringify(a.setup.headlines)) out.push('広告見出しを変更');
      if (JSON.stringify(b.setup.descriptions || []) !== JSON.stringify(a.setup.descriptions || [])) out.push('説明文を変更');
      if (b.setup.area !== a.setup.area) out.push(`配信地域：${(geoOptions().find(o => o.value === a.setup.area) || {}).label}`);
      if (b.setup.bidding !== a.setup.bidding) out.push(`入札戦略：${B.bidding[b.setup.bidding].label}→${B.bidding[a.setup.bidding].label}`);
      if (a.setup.bidding === 'manual' && b.setup.bidding === 'manual' && b.setup.bid !== a.setup.bid) out.push(`入札額：${yen(b.setup.bid)}→${yen(a.setup.bid)}`);
    } else {
      for (const id of Object.keys(C.metaFields)) {
        if (b.setup.meta[id] !== a.setup.meta[id]) {
          const lab = v => (C.metaFields[id].options.find(o => o.value === v) || {}).label;
          out.push(`${C.metaFields[id].label.replace(/（.*?）/g, '')}：${lab(b.setup.meta[id])}→${lab(a.setup.meta[id])}`);
        }
      }
      if (b.karte.creative !== a.karte.creative) out.push(`素材を追加：${labelOf('creative', a.karte.creative)}`);
    }
    if (b.karte.budget !== a.karte.budget) out.push(`予算：月${manYen(b.karte.budget)}→月${manYen(a.karte.budget)}`);
    if (b.karte.measurement !== a.karte.measurement) out.push('成果の計測を設定');
    if (b.karte.lp !== a.karte.lp) out.push('広告用のLPを用意');
    return out;
  }
  function isReset(b, a) {
    const big = Math.abs(a.karte.budget / b.karte.budget - 1) >= B.autoBidLearning.bigBudgetChange;
    if (b.karte.media === 'meta') return big || Object.keys(C.metaFields).some(id => b.setup.meta[id] !== a.setup.meta[id]) || b.karte.creative !== a.karte.creative;
    return big || b.setup.bidding !== a.setup.bidding;
  }

  /* ---------- 改善の採点 ---------- */
  function evaluateRound(b, a, prev) {
    const out = [];
    const add = (level, title, text, w = 1) => out.push({ level, title, text, w });
    const res = prev.res, t = res.totals, k = b.karte;
    const cpa = cpaOf(t), cv = cvOf(t);
    const changes = changesList(b, a);

    if (b.karte.media === 'meta') evalMeta(b, a, res, add); else evalGoogle(b, a, res, add);

    // 予算
    const ratio = a.karte.budget / b.karte.budget;
    const deficit = k.upperCpa && cpa && cpa > k.upperCpa;
    const goodCpa = cpa && cpa <= k.targetCpa * 1.1;
    const room = res.media === 'google' ? res.flags.limited : true;
    if (ratio > 1.05) {
      if (deficit || !cv) add('bad', '赤字・成果ゼロのまま予算を増やしました', `CPA ${cpa ? yen(cpa) : '―'} で${deficit ? '上限CPAを超えている' : '成果が出ていない'}状態です。予算を増やす前に、設定の無駄を減らしましょう。`);
      else if (goodCpa && room) add('good', '成果の出ている広告の予算を増やしました', `CPA ${yen(cpa)} が目標以内${res.media === 'google' ? 'で、予算で表示が制限されていた' : ''}ので、予算を増やすのは良い判断です。`);
      else add('ok', 'まだ効率が良くないうちに予算を増やしました', `CPA ${cpa ? yen(cpa) : '―'} は目標 ${yen(k.targetCpa)} より高めです。先に設定を改善してから増やす方が安全です。`);
    } else if (ratio < 0.95) {
      if (deficit || !cv) add('good', '赤字を抑えるために予算を減らしました', '成果が出ていないうちは予算を抑えて、設定の見直しを優先するのは堅実な判断です。');
      else if (goodCpa && room) add('bad', '成果が出ているのに予算を減らしました', `CPA ${yen(cpa)} は目標以内で、まだ伸ばせる状態でした。`);
      else add('ok', '予算を減らしました', '効率を見ながら調整するのは一つの方法ですが、減らしすぎるとデータがたまりにくくなります。');
    } else if (goodCpa && res.media === 'google' && res.flags.limited) {
      add('ok', '予算を増やすチャンスでした', `CPA ${yen(cpa)} が目標以内で、予算で表示が制限されていました。予算を増やせば成果を伸ばせた可能性があります。`);
    }
    if (isReset(b, a)) add('ok', '学習がやり直しになる変更があります', b.karte.media === 'meta'
      ? 'Metaでは、オーディエンス・目標・予算（30%以上）などを大きく変えると、学習期間がやり直しになり、最初の1週間はCPAが上がります。'
      : '入札戦略の変更や、予算の大きな変更（30%以上）をすると、自動入札の学習がやり直しになり、その月の成果が少し落ちます（×' + B.autoBidLearning.resetFactor + '）。');

    // 計測・LP（運用以外の改善）
    if (b.karte.measurement !== 'full' && a.karte.measurement === 'full') add('good', '成果の計測を設定しました', '計測ができると、何が成果につながったか分かるようになり、自動入札・最適化も正しく働くようになります。いちばん大事な改善です。', 2);
    else if (a.karte.measurement !== 'full') add('bad', '成果の計測がまだできていません', '計測しないままでは、どの改善が効いたか判断できません。広告の設定より先に、計測を整えましょう。', 2);
    if (b.karte.lp !== 'dedicated' && a.karte.lp === 'dedicated') add('good', '広告用のLPを用意しました', `LPがあると、クリックした人が内容を確かめて申し込めるので、成約率が上がります（${B.lp[b.karte.lp].cvr}→${B.lp.dedicated.cvr}）。`);
    else if (a.karte.lp === 'none') add('bad', 'LPがないままです', `成約率が専用LPの約${Math.round(B.lp.none.cvr * 100)}%のままです。`);

    if (changes.length >= 6) add('ok', '一度にたくさん変えています', `今回は${changes.length}か所を変えました。一度に多くを変えると、何が効いたのか分かりにくくなります。大事なものから順に変えるのが運用のコツです。`);
    if (!changes.length) {
      if (prev.verdict.level === 'good') add('good', '成果が出ているので様子を見ました', '目標を達成しているときは、むやみに変えずに様子を見るのも大事な判断です。');
      else if (prev.verdict.level === 'ok') add('ok', '何も変えずに様子を見ました', '目標まであと少しなので、様子見も一つの判断です。ただ、レポートに無駄が残っていれば、小さく改善した方が目標に近づけます。');
      else add('bad', '何も変えていません', '目標に届いていないのに設定を変えないと、同じ結果が続きます。レポートを見て、無駄を減らす改善をしましょう。');
    }
    return out;
  }

  function evalGoogle(b, a, res, add) {
    const k = b.karte, t = res.totals;
    const negA = withState(a.setup, a.karte, () => negativesOf());
    const blockedAfter = x => negA.some(n => tokensIn(n.text, x.q) || (!x.rel && n.group === x.group));
    const irr = res.report.filter(x => !x.rel && x.cost > 0);
    const irrCost = irr.reduce((s, x) => s + x.cost, 0);
    const done = irr.filter(blockedAfter), doneCost = done.reduce((s, x) => s + x.cost, 0);
    const lostGood = res.report.filter(x => x.rel && x.conv > 0 && blockedAfter(x));
    if (lostGood.length) add('bad', '成果の出ていた検索語句まで除外しています', `「${lostGood.map(x => x.q).join('」「')}」は成果が出ていた検索です。除外すると、良いお客さんを逃してしまいます。`);
    if (irrCost > t.cost * 0.03) {
      const r = doneCost / irrCost;
      if (r >= 0.7) add('good', '関係ない検索語句をしっかり除外しました', `先月、関係ない検索に使った約${yen(irrCost)}のうち、約${Math.round(r * 100)}%を防げるようになりました。`);
      else if (r >= 0.3) add('ok', '関係ない検索語句の除外が一部だけです', `関係ない検索に使った約${yen(irrCost)}のうち、防げるのは約${Math.round(r * 100)}%です。まだ「${irr.filter(x => !blockedAfter(x)).slice(0, 3).map(x => x.q).join('」「')}」などが残っています。`);
      else add('bad', '関係ない検索語句が残ったままです', `先月は関係ない検索に約${yen(irrCost)}使いました。検索語句レポートで「${irr.slice(0, 3).map(x => x.q).join('」「')}」などを見つけて除外しましょう。`);
    } else if (done.length) add('good', '細かい無駄も除外しました', '関係ない検索はもともと少なめでしたが、見つけたものを除外しておくのは良い習慣です。');
    if (withState(a.setup, a.karte, () => conflictsOf().length)) add('bad', '除外キーワードが、使うキーワードを打ち消しています', '一部のキーワードに広告が出なくなります。除外キーワードを見直しましょう。');

    // マッチタイプ・停止
    const loose = res.rows.filter(x => x.match === 'broad' && x.clicks && x.irrClicks / x.clicks > 0.2);
    if (loose.length) {
      const fixed = loose.filter(x => a.setup.kw[x.i].act !== 'add' || a.setup.kw[x.i].match !== 'broad');
      if (fixed.length === loose.length) add('good', '関係ない検索の多い部分一致を絞りました', `「${loose.map(x => x.text).join('」「')}」をフレーズ一致・完全一致に変えるか停止して、関係ない検索を減らしました。`);
      else if (fixed.length) add('ok', '部分一致の見直しが一部だけです', `まだ「${loose.filter(x => !fixed.includes(x)).map(x => x.text).join('」「')}」が部分一致のままで、関係ない検索が多く出ています。`);
      else if (irrCost > t.cost * 0.1) add('ok', '関係ない検索の多い部分一致がそのままです', `「${loose.map(x => x.text).join('」「')}」は、クリックの2割以上が関係ない検索でした。マッチタイプを絞ることも検討しましょう。`);
    }
    const waste = res.rows.filter(x => !x.conv && x.cost >= k.targetCpa * 1.5);
    const winners = res.rows.filter(x => x.conv && x.cost / x.conv <= k.targetCpa);
    const pausedWin = winners.filter(x => a.setup.kw[x.i].act !== 'add');
    if (pausedWin.length) add('bad', '成果の出ているキーワードを停止しました', `「${pausedWin.map(x => x.text).join('」「')}」はCPAが目標以内でした。止めると成果が減ってしまいます。`);
    if (waste.length && k.measurement !== 'none') {
      const acted = waste.filter(x => a.setup.kw[x.i].act !== 'add' || a.setup.kw[x.i].match !== b.setup.kw[x.i].match);
      if (acted.length === waste.length) add('good', '成果の出ないキーワードを見直しました', `目標CPAの1.5倍以上使って成果ゼロだった「${waste.map(x => x.text).join('」「')}」を、停止またはマッチタイプ変更しました。`);
      else add('ok', '成果の出ないキーワードが残っています', `「${waste.filter(x => !acted.includes(x)).map(x => x.text).join('」「')}」は目標CPAの1.5倍以上使って成果ゼロでした。停止やマッチタイプの変更を検討しましょう。`);
    }

    // 入札戦略
    const bb = b.setup.bidding, ba = a.setup.bidding, cv = cvOf(t);
    if (a.karte.measurement === 'none' && needsCv(ba)) add('bad', '計測なしで自動入札のままです', '成果のデータがないので、コンバージョンを目指す自動入札は正しく働きません。手動入札かクリック数の最大化にするか、計測を設定しましょう。');
    else if (bb !== ba) {
      if (needsCv(bb) && b.karte.measurement === 'none') add('good', '計測なしでも使える入札戦略に変えました', '成果のデータがない状態では、クリックを基準にした入札の方が安定します。');
      else if (ba === 'targetCpa' && cv < B.autoBidLearning.monthlyConversions) add('ok', '目標CPAに変えるのは少し早いです', `先月のコンバージョンは${fmt(cv)}件で、月${B.autoBidLearning.monthlyConversions}件に届いていません。データが少ないうちは、成果が大きくぶれやすくなります。`);
      else if (ba === 'targetCpa') add('good', 'データがたまったので目標CPAに変えました', `月${fmt(cv)}件のコンバージョンがあるので、目標CPAで効率を上げる段階です。`);
      else if (needsCv(ba) && a.karte.measurement !== 'none') add('good', '計測を活かせる自動入札に変えました', '成果のデータをもとに、成約しやすい検索に入札できるようになります。');
      else add('ok', '入札戦略を変えました', '計測ができているなら、コンバージョンを基準にした自動入札の方が成果を出しやすいです。');
    }
    if (ba === 'manual' && bb === 'manual' && res.flags.avgShare < 0.35) {
      if (a.setup.bid > b.setup.bid) add('good', '低すぎた入札額を上げました', `掲載される割合が約${Math.round(res.flags.avgShare * 100)}%しかなかったので、入札額を上げるのは良い判断です。`);
      else add('ok', '入札額が低いままです', `掲載される割合が約${Math.round(res.flags.avgShare * 100)}%しかありません。入札額を上げるか、自動入札も検討しましょう。`);
    }

    // 地域
    const gb = geoKey(b.setup.area), ga = withState(a.setup, a.karte, () => geoKey(a.setup.area));
    if (gb === 'nationalForLocal' && ga !== 'nationalForLocal') add('good', '全国配信をやめて地域を絞りました', '来られない地域への広告費がなくなり、成約率が上がります。');
    else if (ga === 'nationalForLocal' && gb !== 'nationalForLocal') add('bad', '来店型なのに全国配信に変えました', '表示は増えますが、来られない人への広告費が増えます。');
    else if (gb === 'wider' && ga === 'match') add('good', '配信地域を商圏に合わせました', '来られる人に広告費を集中できます。');

    // 見出し（品質）
    const qScore = st0 => withState(st0.setup, st0.karte, () => addedIdx().map(i => kwList()[i]).filter(c => !isTermKw(c)).reduce((s, c) => s + ({ high: 2, mid: 1, low: 0 })[kwQuality(c)], 0) / Math.max(1, addedIdx().length));
    const qb = qScore(b), qa = qScore(a);
    if (JSON.stringify([b.setup.headlines, b.setup.descriptions]) !== JSON.stringify([a.setup.headlines, a.setup.descriptions])) {
      if (qa > qb + 0.05) add('good', '広告見出しを改善しました', 'キーワードに合う見出しが増えたので、品質が上がり、クリック率が上がってクリック単価が下がります。');
      else if (qa < qb - 0.05) add('bad', '広告見出しの品質が下がりました', 'キーワードと合わない見出しに変わったため、クリック単価が上がります。');
    }
  }

  function evalMeta(b, a, res, add) {
    const f = res.flags, mb = b.setup.meta, ma = a.setup.meta, k = b.karte;
    const sizeB = f.size, sizeA = withState(a.setup, a.karte, () => audienceOf(ma));
    if (f.fatigue) {
      if (a.karte.creative !== b.karte.creative || sizeA > sizeB * 1.3) add('good', '広告疲れに対応しました', `フリークエンシーが月${res.totals.freq.toFixed(1)}回と高かったので、素材の追加やオーディエンスの拡大は良い対策です。`);
      else add('bad', '広告疲れがそのままです', `同じ人に月${res.totals.freq.toFixed(1)}回も表示されています。素材を増やすか、オーディエンスを広げましょう。`);
    } else if (a.karte.creative !== b.karte.creative) add('ok', '素材を追加しました', '素材が増えると、クリック率が上がりやすくなります（広告疲れの予防にもなります）。');
    if (f.smallAudience) {
      if (sizeA >= B.meta.smallAudience.under) add('good', '狭すぎたオーディエンスを広げました', `推定約${fmt(sizeB)}人→約${fmt(sizeA)}人になり、CPMが下がります。`);
      else add('bad', 'オーディエンスが狭すぎるままです', `推定約${fmt(sizeA)}人で、CPMが高いままです。詳細ターゲットをAdvantage+にするなど、広げましょう。`);
    }
    if (Number(ma.adsets) > Number(mb.adsets)) add('bad', '広告セットをさらに分けました', '予算とデータが分散して、学習がさらに進みにくくなります。');
    else if (f.learningIncomplete && Number(mb.adsets) > 1) {
      if (Number(ma.adsets) < Number(mb.adsets)) add('good', '広告セットをまとめました', `学習が完了していなかったので、まとめて1つあたりのデータを増やすのは良い判断です。${B.meta.learning.note}`);
      else add('ok', '広告セットが分かれたままです', '学習が完了していないので、広告セットをまとめるとデータが集まりやすくなります。');
    }
    const measuredA = a.karte.measurement !== 'none';
    if (mb.optimization !== ma.optimization) {
      if (ma.optimization === 'reach') add('bad', 'リーチ目的に変えました', '問い合わせを増やしたい目的とは合いません。');
      else if (ma.optimization === 'conversions' && measuredA) add('good', 'コンバージョンを目標にした配信に変えました', '成果が出やすい人に配信されるようになります。');
      else if (ma.optimization !== 'clicks' && !measuredA) add('bad', '計測なしでは使えない目標に変えました', 'ピクセルがないと、コンバージョンやLPビューを目標にした配信は働きません。');
      else add('ok', 'パフォーマンスの目標を変えました', '計測ができているなら、コンバージョンを目標にするのが基本です。');
    } else if (ma.optimization !== 'conversions' && measuredA) add('ok', 'パフォーマンスの目標がそのままです', '計測ができているので、コンバージョンを目標にした配信を検討しましょう。');
    if (mb.placement !== 'auto' && ma.placement === 'auto') add('good', '配置を自動にしました', '配信先が増えて、CPMが下がりやすくなります。');
    if (special()) {
      if ((mb.ageGender === 'narrow' && ma.ageGender === 'open') || (mb.metaArea === 'narrower' && ma.metaArea !== 'narrower')) add('good', '特別な広告カテゴリのルールに合わせて直しました', '申告したカテゴリで使えない絞り込みをやめました。');
    }
  }

  /* ---------- 画面：運用改善 ---------- */
  function monthKpis(h, prevH) {
    const t = h.res.totals, p = prevH ? prevH.res.totals : null, isMeta = h.res.media === 'meta';
    const delta = (x, y, lowerBetter) => {
      if (y == null || x == null || !y) return '';
      const d = x / y - 1;
      if (Math.abs(d) < 0.005) return '<small>前月と同じ</small>';
      const good = lowerBetter ? d < 0 : d > 0;
      return `<small class="${good ? 'sim-up' : 'sim-down'}">前月比 ${d > 0 ? '▲' : '▼'}${Math.abs(Math.round(d * 100))}%</small>`;
    };
    const kpi = (label, val, sub = '') => `<div><small>${label}</small><b>${val}</b>${sub}</div>`;
    return `<div class="sim-kpis sim-result-kpis">
      ${kpi('表示回数', fmt(t.imp) + '回', delta(t.imp, p && p.imp))}
      ${isMeta ? kpi('フリークエンシー', t.freq.toFixed(1) + '回') : ''}
      ${kpi('クリック数', fmt(t.clicks) + '回', delta(t.clicks, p && p.clicks))}
      ${kpi('クリック率', pct(t.ctr, 2), delta(t.ctr, p && p.ctr))}
      ${kpi('クリック単価', yen(t.cpc), delta(t.cpc, p && p.cpc, true))}
      ${kpi('費用', yen(t.cost), delta(t.cost, p && p.cost))}
      <div class="sim-kpi-cv"><small>コンバージョン${t.measured == null ? '（推定）' : ''}</small><b>${fmt(cvOf(t))}件</b>${delta(cvOf(t), p && cvOf(p))}</div>
      ${kpi('CPA' + (t.measured == null ? '（推定）' : ''), cpaOf(t) ? yen(cpaOf(t)) : '―', delta(cpaOf(t), p && cpaOf(p), true))}
    </div>`;
  }

  function verdictBox(h) {
    const v = h.verdict;
    return `<section class="field sim-verdict ${v.level}"><p class="sim-verdict-main">${v.level === 'good' ? '🎉' : v.level === 'ok' ? '💪' : '⚠️'} ${esc(v.text)}</p><p class="sim-hint">${esc(v.sub)}</p></section>`;
  }

  function renderImprove() {
    const h = lastMonth(), d = st.ops.draft, isMeta = h.res.media === 'meta';
    const next = h.month + 1;
    const changes = changesList({ setup: st.setup, karte: st.karte }, d);
    return `
      <p class="lead">${h.month}ヶ月目の結果${isMeta ? '' : 'と検索語句レポート'}を見て、${next}ヶ月目に向けた改善をしましょう。変更は「${next}ヶ月目を配信する」を押したときに反映されます。</p>
      ${verdictBox(h)}
      <section class="field">
        <div class="field-head"><h3>📈 ${h.month}ヶ月目の結果</h3></div>
        ${monthKpis(h, st.ops.history[st.ops.history.length - 2])}
        <details class="tc-guide sim-guide"><summary>なぜこの結果になったか（${h.explain.length}件）</summary>
          <ul class="sim-explain">${h.explain.map(x => `<li class="${x.level}"><b>${{ good: '◎', ok: '△', bad: '×' }[x.level]} ${esc(x.title)}</b><span>${esc(x.text)}</span></li>`).join('')}</ul>
        </details>
      </section>
      ${isMeta ? '' : renderTermsSource()}
      ${isMeta ? renderImproveMeta(h, d) : renderImproveGoogle(h, d)}
      ${renderImproveCommon(d, isMeta)}
      <div class="sim-submit">
        <p class="sim-rest">${changes.length ? `変更：<b class="sim-changes">${changes.length}件</b>` : '変更なし（このまま配信）'}</p>
        <button type="button" class="btn-primary" data-action="sim-run-month">${next}ヶ月目を配信する →</button>
      </div>`;
  }

  const TERMS_SOURCES = [
    { value: 'auto', label: '⚙️ 自動で作る（今までどおり）', desc: '業種ごとに用意した検索語句の例から、レポートを作ります' },
    { value: 'ai',   label: '🤖 AIの回答を取り込む', desc: '案件カルテと配信しているキーワードをAIに渡して、この案件らしい検索語句を作ってもらいます' }
  ];
  // 検索語句レポートの作り方（1ヶ月目の運用改善でだけ選べる。2ヶ月目以降は同じ作り方のまま）
  function renderTermsSource() {
    const s = st.setup;
    if (!termsEditable()) return s.terms ? '<p class="sim-hint">🔎 検索語句レポートは、AIから取り込んだ検索語句で作っています。</p>' : '';
    return `<section class="field">
      <div class="field-head"><h3>🔎 検索語句レポートの作り方</h3></div>
      ${radioOpts('termsrc', 'source', TERMS_SOURCES, s.termsSource || 'auto')}
      ${s.termsSource === 'ai' ? renderAiFlow('terms', '<button type="button" class="btn-primary" data-action="sim-scroll" data-to="sim-report">検索語句レポートを見る ↓</button>') : ''}
      ${s.terms ? '<p class="sim-hint">検索語句を入れ替えたので、1ヶ月目の数値が少し変わることがあります（除外キーワードで防げる検索の割合が変わるため）。</p>' : ''}
    </section>`;
  }

  function renderImproveGoogle(h, d) {
    const res = h.res, k = st.karte;
    const negD = withState(d.setup, d.karte, () => negativesOf());
    const blockedD = x => negD.some(n => tokensIn(n.text, x.q) || (!x.rel && n.group === x.group));
    const rep = res.report.slice(0, 14);
    const unused = kwList().map((c, i) => ({ c, i })).filter(({ c, i }) => !isTermKw(c) && st.setup.kw[i].act !== 'add' && st.setup.kw[i].act !== 'paused' && st.setup.kw[i].act !== 'negative');
    return `
      <section class="field">
        <div class="field-head" id="sim-report"><h3>🔎 検索語句レポート</h3><span class="tag">費用の多い順・上位${rep.length}件</span></div>
        <p class="sim-hint">実際にどんな言葉で検索されて広告が表示・クリックされたかの一覧です。関係ない検索語句を見つけたら「除外」を押しましょう（次の月から表示されなくなります）。</p>
        <ul class="sim-report">${rep.map(x => {
          const on = blockedD(x), mine = d.setup.customNeg.includes(x.q);
          return `<li class="${on ? 'blocked' : ''}">
            <div class="sim-report-head"><b>${esc(x.q)}</b>
              <button type="button" class="btn-ghost sm ${mine ? 'on' : ''}" data-action="sim-op-neg" data-q="${esc(x.q)}" ${on && !mine ? 'disabled' : ''} aria-pressed="${mine}">${mine ? '除外を取り消す' : on ? '除外済み' : '除外'}</button></div>
            <p class="sim-kwres-nums"><span>キーワード <b>${esc(MATCH_CODE[x.match](x.kw))}</b></span><span>クリック <b>${fmt(x.clicks)}</b></span><span>費用 <b>${yen(x.cost)}</b></span><span>CV <b>${fmt(x.conv)}</b></span><span>CPA <b>${x.conv ? yen(x.cost / x.conv) : '―'}</b></span></p>
          </li>`;
        }).join('')}</ul>
        <div class="ckw">
          <h4>除外キーワードを追加 <small>（単語でもOK。例：求人）</small></h4>
          <div class="ckw-form"><input type="text" id="sim-op-neg-text" class="sim-text" placeholder="例：求人" aria-label="除外キーワード"><button type="button" class="btn-ghost" data-action="sim-op-neg-add">追加</button></div>
          ${d.setup.customNeg.length ? `<ul class="ckw-list">${d.setup.customNeg.map((t, i) => `<li><code>−${esc(t)}</code><span>${st.setup.customNeg.includes(t) ? '設定済み' : '今回追加'}</span><button type="button" class="x" data-action="sim-op-neg-remove" data-i="${i}" aria-label="${esc(t)}を削除">×</button></li>`).join('')}</ul>` : ''}
        </div>
        ${withState(d.setup, d.karte, () => conflictsOf()).map(x => `<p class="sim-alert bad">⚠️ 除外キーワード「${esc(x.n.text)}」が、使うキーワード「${esc(x.hits.join('」「'))}」を打ち消しています。</p>`).join('')}
      </section>

      <section class="field">
        <div class="field-head"><h3>🔑 キーワードの調整</h3></div>
        <ul class="sim-kwres">${kwList().map((c, i) => ({ c, i })).filter(({ i }) => st.setup.kw[i].act === 'add' || st.setup.kw[i].act === 'paused').map(({ c, i }) => {
          const row = res.rows.find(x => x.i === i), y = d.setup.kw[i], paused = y.act === 'paused';
          return `<li class="${paused ? 'sim-paused' : row && row.conv ? 'good' : row && row.cost > k.targetCpa ? 'bad' : 'ok'}">
            <div class="sim-kwres-head"><b>${esc(fill(c.kw))}</b><button type="button" class="btn-ghost sm" data-action="sim-op-pause" data-i="${i}">${paused ? '▶ 再開する' : '⏸ 停止する'}</button></div>
            ${row ? `<p class="sim-kwres-nums"><span>クリック <b>${fmt(row.clicks)}</b></span><span>費用 <b>${yen(row.cost)}</b></span><span>CV <b>${fmt(row.conv)}</b></span><span>CPA <b>${row.conv ? yen(row.cost / row.conv) : '―'}</b></span>${row.irrClicks ? `<span>関係ない検索 <b>${Math.round(row.irrClicks / Math.max(1, row.clicks) * 100)}%</b></span>` : ''}</p>` : '<p class="sim-kwres-why">先月は停止していました</p>'}
            ${paused ? '' : `<div class="sim-match"><span class="seg" role="group" aria-label="マッチタイプ">${Object.keys(B.match).map(m => `<button type="button" class="seg-btn ${y.match === m ? 'on seg-add' : ''}" aria-pressed="${y.match === m}" data-action="sim-op-match" data-i="${i}" data-val="${m}">${esc(B.match[m].label)}</button>`).join('')}</span></div>`}
          </li>`;
        }).join('')}</ul>
        ${unused.length ? `<details class="tc-guide sim-guide"><summary>使っていないキーワード候補を追加する（${unused.length}件）</summary>
          <ul class="kw-list">${unused.map(({ c, i }) => {
            const y = d.setup.kw[i];
            return `<li class="kw-row"><div class="kw-top"><span class="kw-text">${esc(fill(c.kw))}</span>
              <span class="seg">${['none', ...Object.keys(B.match)].map(m => `<button type="button" class="seg-btn ${(m === 'none' ? y.act !== 'add' : y.act === 'add' && y.match === m) ? 'on ' + (m === 'none' ? 'seg-skip' : 'seg-add') : ''}" data-action="sim-op-addkw" data-i="${i}" data-val="${m}">${m === 'none' ? '追加しない' : esc(B.match[m].label)}</button>`).join('')}</span></div>
              <div class="sim-kwmeta"><span class="sim-kwm">意図 <b>${esc(B.intent[c.intent].label)}</b></span><span class="sim-kwm">想定CPC <b>${yen(c.cpc)}</b></span><span class="sim-kwm">検索数 <b>月${fmt(c.volume * B.area[k.area].searchScale)}回</b></span></div></li>`;
          }).join('')}</ul></details>` : ''}
      </section>

      <section class="field">
        <div class="field-head"><h3>📝 ${d.setup.descs.length ? '広告文' : '広告見出し'}</h3></div>
        ${renderAdPicks(d.setup, 'ops')}
      </section>

      <section class="field">
        <div class="field-head"><h3>🎯 入札・地域</h3></div>
        <fieldset class="sim-item"><legend class="sim-label">入札戦略</legend>
          ${radioOpts('opsf', 'bidding', Object.entries(B.bidding).map(([v, x]) => ({ value: v, label: x.label, desc: BIDDING_DESC[v] })), d.setup.bidding)}
          ${d.setup.bidding === 'manual' ? `<div class="num-wrap" style="margin-top:10px"><input type="number" inputmode="numeric" data-opsf="bid" min="1" step="10" value="${d.setup.bid ?? ''}" aria-label="入札額"><span class="unit">円（上限クリック単価）</span></div>
            <p class="sim-hint">先月、広告が掲載された割合：平均約${Math.round(res.flags.avgShare * 100)}%</p>` : ''}
        </fieldset>
        <fieldset class="sim-item"><legend class="sim-label">配信地域</legend>${radioOpts('opsf', 'area', geoOptions(), d.setup.area)}</fieldset>
      </section>`;
  }

  function renderImproveMeta(h, d) {
    return `
      <div class="sim-calc" id="sim-audience">${withState(d.setup, d.karte, renderAudience)}</div>
      ${C.metaGroups.map(g => `
        <section class="field sim-group">
          <div class="field-head"><h3>${esc(g.title)}</h3></div>
          ${g.fields.map(id => `<fieldset class="sim-item"><legend class="sim-label">${esc(C.metaFields[id].label)}</legend>${radioOpts('opsf', 'm-' + id, C.metaFields[id].options, d.setup.meta[id])}</fieldset>`).join('')}
        </section>`).join('')}`;
  }

  function renderImproveCommon(d, isMeta) {
    const k = st.karte;
    const r = d.karte.budget / k.budget - 1;
    const chk = (key, on, label, desc, disabled) => `<label class="opt"><input type="checkbox" data-opsf="${key}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="opt-main"><span class="opt-label">${label}</span><span class="opt-desc">${desc}</span></span></label>`;
    const extras = [];
    if (k.measurement !== 'full') extras.push(chk('measurement', d.karte.measurement === 'full', '成果の計測を設定する', isMeta ? 'ピクセルを設置して、問い合わせなどの成果を数えられるようにする' : 'コンバージョンタグを設置して、すべての成果を数えられるようにする'));
    if (k.lp !== 'dedicated') extras.push(chk('lp', d.karte.lp === 'dedicated', '広告用のLPを用意する', '広告の内容に合った専用ページを作る（成約率が上がる）'));
    if (isMeta && CREATIVE_UP[k.creative]) extras.push(chk('creative', d.karte.creative !== k.creative, `素材を追加する（${labelOf('creative', CREATIVE_UP[k.creative])}）`, '新しい画像・動画を追加して、クリック率を上げる・広告疲れを防ぐ'));
    return `
      <section class="field">
        <div class="field-head"><h3>💰 予算</h3></div>
        <div class="num-wrap"><input type="number" inputmode="numeric" data-opsf="budget" min="1000" step="10000" value="${d.karte.budget}" aria-label="月の予算"><span class="unit">円／月</span></div>
        <p class="sim-hint" id="sim-op-budget-note">${budgetNote(r)}</p>
      </section>
      ${extras.length ? `<section class="field">
        <div class="field-head"><h3>🛠️ 広告の設定以外の改善</h3></div>
        <p class="sim-hint">実際には準備に時間がかかりますが、このシミュレーションでは次の月から反映されます。</p>
        <div class="opts multi">${extras.join('')}</div>
      </section>` : ''}`;
  }
  function budgetNote(r) {
    if (!isFinite(r) || Math.abs(r) < 0.005) return `今の予算：月${manYen(st.karte.budget)}`;
    return `今の予算 月${manYen(st.karte.budget)} から ${r > 0 ? '+' : ''}${Math.round(r * 100)}%${Math.abs(r) >= B.autoBidLearning.bigBudgetChange ? '（30%以上の変更は、学習がやり直しになります）' : ''}`;
  }

  /* ---------- 画面：翌月の結果 ---------- */
  function scoreOf(evals) {
    const max = evals.reduce((a, x) => a + 2 * x.w, 0);
    return max ? Math.round(evals.reduce((a, x) => a + PTS[x.level] * x.w, 0) / max * 100) : 0;
  }

  function renderMonthResult() {
    const hs = st.ops.history, h = hs[hs.length - 1], prev = hs[hs.length - 2], round = st.ops.rounds[st.ops.rounds.length - 1];
    const score = scoreOf(round.evals);
    const count = lv => round.evals.filter(x => x.level === lv).length;
    return `
      <p class="lead">${prev.month}ヶ月目の結果をもとにした改善を反映して、${h.month}ヶ月目を配信しました。</p>
      ${verdictBox(h)}
      <section class="field">
        <div class="field-head"><h3>📈 ${h.month}ヶ月目の結果</h3></div>
        ${monthKpis(h, prev)}
      </section>
      <section class="field">
        <div class="field-head"><h3>🔧 ${prev.month}ヶ月目のあとに変えたこと</h3></div>
        ${round.changes.length ? `<ul class="sim-changes-list">${round.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="sim-hint">何も変えずに配信しました。</p>'}
      </section>
      <div class="score-card">
        <div class="ring" style="--p:${score}"><span>${score}<small>点</small></span></div>
        <div class="score-info"><p class="res-pf">${prev.month}ヶ月目 → ${h.month}ヶ月目</p><h2>改善の採点</h2>
          <p class="comment">${score >= 85 ? 'すばらしい改善です！' : score >= 60 ? 'おおむね良い改善です。△・×の解説も確認しましょう。' : '見直したい判断があります。解説を読んで、次の改善に活かしましょう。'}</p>
          <div class="counts"><span class="count good">◎ ${count('good')}</span><span class="count ok">△ ${count('ok')}</span><span class="count bad">× ${count('bad')}</span></div>
        </div>
      </div>
      ${round.evals.map(x => `
        <article class="res-item ${x.level}">
          <div class="res-head"><span class="mark ${x.level}">${{ good: '◎ 良い判断', ok: '△ もう一歩', bad: '× 見直し' }[x.level]}</span><h3>${esc(x.title)}</h3></div>
          <p class="reason">${esc(x.text)}</p>
        </article>`).join('')}
      <details class="tc-guide sim-guide"><summary>${h.month}ヶ月目：なぜこの結果になったか（${h.explain.length}件）</summary>
        <ul class="sim-explain">${h.explain.map(x => `<li class="${x.level}"><b>${{ good: '◎', ok: '△', bad: '×' }[x.level]} ${esc(x.title)}</b><span>${esc(x.text)}</span></li>`).join('')}</ul>
      </details>
      <div class="end-actions">
        ${h.month < MONTHS
          ? `<button type="button" class="btn-primary" data-action="sim-to-improve">${h.month + 1}ヶ月目に向けて改善する →</button>`
          : '<button type="button" class="btn-primary" data-action="sim-to-review">3ヶ月の振り返りを見る →</button>'}
      </div>`;
  }

  /* ---------- 画面：振り返り ---------- */
  function monthChart(title, hs, val, fmtV, refs) {
    const vals = hs.map(h => val(h.res.totals));
    const max = Math.max(1, ...vals.filter(v => v != null), ...refs.map(r => r.v)) * 1.1;
    return `<figure class="sim-chart">
      <figcaption>${esc(title)}</figcaption>
      <div class="sim-chart-plot">
        ${refs.map(r => `<span class="sim-chart-ref ${r.cls}" style="left:calc(80px + (100% - 184px) * ${(r.v / max).toFixed(4)})"><em>${esc(r.label)} ${fmtV(r.v)}</em></span>`).join('')}
        ${hs.map((h, i) => `<div class="sim-chart-row" title="${h.month}ヶ月目：${vals[i] != null ? fmtV(vals[i]) : '―'}">
          <span class="sim-chart-lab">${h.month}ヶ月目</span>
          <span class="sim-chart-track"><i style="width:${vals[i] != null ? Math.max(0.5, vals[i] / max * 100) : 0}%"></i></span>
          <b>${vals[i] != null ? fmtV(vals[i]) : '―'}</b></div>`).join('')}
      </div>
    </figure>`;
  }

  function renderReview() {
    const k = st.karte, hs = st.ops.history, rounds = st.ops.rounds, isMeta = hs[0].res.media === 'meta';
    const est = hs.some(h => h.res.totals.measured == null);
    const sum = f => hs.reduce((a, h) => a + f(h.res.totals), 0);
    const totalCv = sum(cvOf), totalCost = sum(t => t.cost), avgCpa = totalCv ? totalCost / totalCv : null;
    const goal = k.targetCount * MONTHS;
    const lead = k.cvType === 'lead';
    const deals = lead ? totalCv * k.closeRate / 100 : totalCv;
    const sales = deals * k.price;
    const gross = k.margin ? sales * k.margin / 100 : null;
    const profit = gross != null ? gross - totalCost : null;
    const avgScore = rounds.length ? Math.round(rounds.reduce((a, r) => a + scoreOf(r.evals), 0) / rounds.length) : 0;
    const first = hs[0].res.totals, last = hs[hs.length - 1].res.totals;

    // 振り返りコメント
    const notes = [];
    const c1 = cpaOf(first), c3 = cpaOf(last);
    if (c1 && c3) notes.push(c3 < c1 * 0.95 ? `CPAは ${yen(c1)} → ${yen(c3)} と、約${Math.round((1 - c3 / c1) * 100)}%改善しました。` : c3 > c1 * 1.05 ? `CPAは ${yen(c1)} → ${yen(c3)} と悪化しました。改善の判断を振り返ってみましょう。` : `CPAは ${yen(c1)} → ${yen(c3)} で、大きくは変わりませんでした。`);
    else if (!cvOf(first) && cvOf(last)) notes.push('1ヶ月目は成果ゼロでしたが、改善によって成果が出るようになりました。');
    if (!isMeta) {
      const ir = t => t.clicks ? t.irrClicks / t.clicks : 0;
      notes.push(`関係ない検索からのクリックは、1ヶ月目 約${Math.round(ir(first) * 100)}% → 3ヶ月目 約${Math.round(ir(last) * 100)}% でした。`);
    } else {
      notes.push(`フリークエンシーは 1ヶ月目 ${first.freq.toFixed(1)}回 → 3ヶ月目 ${last.freq.toFixed(1)}回、CPMは ${yen(first.cpm)} → ${yen(last.cpm)} でした。`);
    }
    if (hs[0].karte.measurement !== 'full') notes.push(hs[hs.length - 1].karte.measurement === 'full' ? '途中で成果の計測を設定できたのは、大きな前進です。' : '最後まで計測がないままでした。計測がないと、改善の効果を確かめられません。');
    const goods = rounds.flatMap(r => r.evals.filter(x => x.level === 'good').map(x => x.title));
    const bads = rounds.flatMap(r => r.evals.filter(x => x.level === 'bad').map(x => x.title));

    return `
      <p class="lead">3ヶ月の運用をまとめました。${est ? '計測していない月は、推定の成果で計算しています。' : ''}</p>
      <div class="score-card">
        <div class="ring" style="--p:${Math.min(100, Math.round(totalCv / goal * 100))}"><span>${Math.round(totalCv / goal * 100)}<small>%</small></span></div>
        <div class="score-info"><p class="res-pf">${esc(B.industries[k.industry].label)}｜${isMeta ? 'Meta広告' : 'Google検索広告'}｜3ヶ月</p>
          <h2>目標の達成率</h2>
          <p class="comment">3ヶ月の目標 ${fmt(goal)}件に対して、${fmt(totalCv)}件のコンバージョンでした。改善の採点は平均${avgScore}点です。</p>
        </div>
      </div>

      <section class="field">
        <div class="field-head"><h3>💴 3ヶ月の合計</h3></div>
        <div class="sim-kpis">
          <div><small>コンバージョン</small><b>${fmt(totalCv)}件</b><small>目標 ${fmt(goal)}件</small></div>
          <div><small>広告費</small><b>${yen(totalCost)}</b></div>
          <div><small>平均CPA</small><b>${avgCpa ? yen(avgCpa) : '―'}</b><small>目標 ${yen(k.targetCpa)}</small></div>
          <div><small>推定の売上</small><b>${yen(sales)}</b><small>${lead ? `成約 約${deals.toFixed(1)}件 × 客単価` : 'CV × 客単価'}</small></div>
          ${profit != null ? `<div><small>粗利 − 広告費</small><b class="${profit >= 0 ? 'sim-up' : 'sim-down'}">${profit >= 0 ? '' : '−'}${yen(Math.abs(profit))}</b><small>${profit >= 0 ? '黒字' : '赤字'}</small></div>` : ''}
        </div>
      </section>

      <section class="field">
        <div class="field-head"><h3>📊 月ごとの推移</h3></div>
        ${monthChart('コンバージョン数', hs, cvOf, v => fmt(v) + '件', [{ v: k.targetCount, label: '目標', cls: 'goal' }])}
        ${monthChart('CPA（低いほど良い）', hs, cpaOf, v => yen(v), [{ v: k.targetCpa, label: '目標', cls: 'goal' }].concat(k.upperCpa ? [{ v: k.upperCpa, label: '上限', cls: 'upper' }] : []))}
        <div class="sim-table-wrap"><table class="kw-table sim-month-table">
          <thead><tr><th></th><th>CV</th><th>CPA</th><th>費用</th><th>判定</th><th>クリック</th><th>CTR</th><th>CPC</th><th>表示</th></tr></thead>
          <tbody>${hs.map(h => { const t = h.res.totals; return `<tr><th>${h.month}ヶ月目</th><td>${fmt(cvOf(t))}件</td><td>${cpaOf(t) ? yen(cpaOf(t)) : '―'}</td><td>${yen(t.cost)}</td><td class="m ${h.verdict.level}">${esc(h.verdict.text)}</td><td>${fmt(t.clicks)}</td><td>${pct(t.ctr, 1)}</td><td>${yen(t.cpc)}</td><td>${fmt(t.imp)}</td></tr>`; }).join('')}</tbody>
        </table></div>
      </section>

      <section class="field">
        <div class="field-head"><h3>📝 この運用の振り返り</h3></div>
        <ul class="sim-changes-list">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
        ${rounds.map((r, i) => `<p class="sim-hint">${i + 1}回目の改善（${i + 1}→${i + 2}ヶ月目）：${scoreOf(r.evals)}点 ／ 変更 ${r.changes.length}件</p>`).join('')}
        ${goods.length ? `<h4 class="sim-sub">◎ 良かった判断</h4><ul class="sim-changes-list good">${[...new Set(goods)].map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${bads.length ? `<h4 class="sim-sub">× 次に気をつけたいこと</h4><ul class="sim-changes-list bad">${[...new Set(bads)].map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <div class="tip"><strong>💡 運用のポイント</strong>まず計測を整える → 検索語句レポートで無駄を除外する → 成果の出ているところに予算を寄せる、の順で進めるのが基本です。一度にたくさん変えず、1ヶ月ごとに結果を確かめましょう。</div>
      </section>

      <div class="end-actions">
        <button type="button" class="btn-ghost" data-action="sim-redo-setup">同じ案件で設定からやり直す</button>
        <button type="button" class="btn-ghost" data-action="start-sim">別の案件で始める</button>
        <button type="button" class="btn-primary" data-action="home">ホームに戻る</button>
      </div>`;
  }

  function runNextMonth() {
    const ops = st.ops, prev = lastMonth(), d = ops.draft;
    const before = { setup: st.setup, karte: st.karte };
    const evals = evaluateRound(before, d, prev);
    const changes = changesList(before, d);
    const reset = isReset(before, d);
    st.setup = d.setup;
    st.karte = d.karte;
    const res = simulate(prev.month + 1, { priorCv: prev.res.totals.measured || 0, reset });
    ops.history.push(snapshotMonth(res));
    ops.rounds.push({ evals, changes, reset });
    ops.draft = null;
  }

  /* ---------- 案件カルテのパネル（設定中にいつでも見返せる） ---------- */
  const DOCK_PHASES = ['setup', 'setupResult', 'result', 'improve', 'monthResult', 'review'];
  function renderDock() {
    if (!DOCK_PHASES.includes(st.phase)) return '';
    const k = st.karte, ind = B.industries[k.industry];
    const media = C.media.find(m => m.value === k.media);
    const row = (dt, dd) => dd ? `<dt>${esc(dt)}</dt><dd>${dd}</dd>` : '';
    const lead = k.cvType === 'lead';
    return `
      <button type="button" class="sim-dock-btn" id="sim-dock-btn" aria-expanded="${st.karteOpen}" aria-controls="sim-dock" title="クリックまたは長押しで、案件カルテを表示／非表示">
        <span aria-hidden="true">ℹ️</span><span class="sim-dock-btn-label">カルテ</span>
      </button>
      <aside class="sim-dock" id="sim-dock" aria-label="案件カルテ" ${st.karteOpen ? '' : 'hidden'}>
        <div class="sim-dock-head"><strong>📋 案件カルテ</strong><button type="button" class="x" data-action="sim-dock-close" aria-label="カルテを閉じる">×</button></div>
        <div class="sim-dock-body">
          <p class="sim-dock-title">${esc(ind.icon)} ${esc(ind.label)}｜${esc(media.label)}</p>
          <div class="sim-dock-kpis">
            <div><small>目標CV数</small><b>${fmt(k.targetCount)}件</b></div>
            <div><small>目標CPA</small><b>${yen(k.targetCpa)}</b></div>
            <div><small>上限CPA</small><b>${k.upperCpa ? yen(k.upperCpa) : '―'}</b></div>
          </div>
          <dl>
            ${row('商圏', `${esc(labelOf('area', k.area))}${(k.areaName || '').trim() ? `（${esc(k.areaName.trim())}）` : ''}`)}
            ${row('予算', `月${esc(manYen(k.budget))}（1日約${yen(k.budget / B.budget.daysPerMonth)}）`)}
            ${row('目的', esc(labelOf('goal', k.goal)))}
            ${row('CVの種類', esc(lead ? '見込み客' : '売上'))}
            ${row('売上目標', yen(k.salesTarget))}
            ${row('客単価', yen(k.price))}
            ${lead ? row('成約率', `${k.closeRate}%`) : ''}
            ${row('粗利率', k.margin ? `${k.margin}%` : '未入力')}
            ${row('ターゲット', `${esc(labelOf('targetAge', k.targetAge))}・${esc(labelOf('targetGender', k.targetGender))}`)}
            ${row('検討期間', esc(labelOf('consideration', k.consideration)))}
            ${row('計測', esc(labelOf('measurement', k.measurement)))}
            ${row('月のCV数', esc(labelOf('monthlyCv', k.monthlyCv)))}
            ${row('過去実績', esc(labelOf('history', k.history)))}
            ${row('素材', esc(labelOf('creative', k.creative)))}
            ${row('LP', esc(labelOf('lp', k.lp)))}
            ${k.media === 'meta' ? row('特別カテゴリ', esc(labelOf('specialCategory', k.specialCategory))) : ''}
            ${allFieldIds().filter(id => fieldOf(id).aiHint && freeFilled(id, k)).map(id => row(fieldOf(id).label.replace(/（.*?）/g, ''), esc(valueText(id, k)))).join('')}
            ${row('メモ', (k.memo || '').trim() ? esc(k.memo.trim()) : '')}
          </dl>
        </div>
      </aside>`;
  }
  function toggleDock(open = !st.karteOpen) {
    st.karteOpen = open;
    const dock = $('#sim-dock'), btn = $('#sim-dock-btn');
    if (!dock) return;
    dock.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }
  // クリック（タップ）でも長押しでも切り替える。長押しの直後に続くクリックは無視する
  let pressTimer = null, longPressAt = 0;
  view.addEventListener('pointerdown', e => {
    if (!e.target.closest('#sim-dock-btn')) return;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { longPressAt = Date.now(); toggleDock(); }, 450);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => view.addEventListener(type, () => clearTimeout(pressTimer), true));
  view.addEventListener('click', e => {
    if (!e.target.closest('#sim-dock-btn')) return;
    if (Date.now() - longPressAt < 800) return;
    toggleDock();
  });
  view.addEventListener('contextmenu', e => { if (e.target.closest('#sim-dock-btn')) e.preventDefault(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && st.karteOpen && !view.hidden && $('#modal').hidden) toggleDock(false);
  });

  /* ---------- events ---------- */
  function startSim() {
    st.phase = 'karte';
    st.karte = blankKarte();
    st.sampleId = null;
    st.setup = null;
    st.seed = 0;
    st.ops = null;
    st.kwSource = null;
    st.adSource = null;
    st.ai = blankAi();
    st.aiFlow = blankFlow();
    st.saved = loadCase();
    st.dirty = false;
    render();
    showSim();
  }

  // タブを切り替えた・閉じたときにも保存する
  const saveNow = () => { if (st.dirty && !view.hidden) saveCase(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  window.addEventListener('pagehide', saveNow);

  view.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'sim-neg-text' && !e.isComposing) {
      e.preventDefault();
      addNegative();
    }
    if (e.key === 'Enter' && e.target.id === 'sim-op-neg-text' && !e.isComposing) {
      e.preventDefault();
      addOpNegative();
    }
  });

  // ホームに戻るときは、入力途中なら確認する（他のモードの処理より先に動かす）
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-action="home"]');
    if (!t || view.hidden || !st.dirty) return;
    saveCase();
    if (!confirm('ホームに戻りますか？（途中の状態はブラウザに保存されているので、あとで「続きから再開」できます）')) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    switch (t.dataset.action) {
      case 'start-sim': startSim(); break;
      case 'sim-sample': {
        const s = C.samples.find(x => x.id === t.dataset.id);
        if (!s) return;
        if (st.dirty && st.sampleId !== s.id && !confirm('入力中の内容を、サンプル案件で置き換えますか？')) return;
        st.karte = Object.assign(blankKarte(), clone(s.karte));
        st.sampleId = s.id;
        st.dirty = true;
        updateBadge();
        const y = window.scrollY;
        render();
        window.scrollTo(0, y);
        break;
      }
      case 'sim-blank':
        if (st.dirty && !confirm('入力中の内容を消して、白紙に戻しますか？')) return;
        st.karte = Object.assign(blankKarte(), { media: st.karte.media });
        st.sampleId = null;
        st.dirty = false;
        render();
        break;
      case 'sim-media': {
        st.karte.media = t.dataset.val;
        st.dirty = true;
        updateBadge();
        const y = window.scrollY;
        render();
        window.scrollTo(0, y);
        break;
      }
      case 'sim-help': openHelp(t.dataset.id); break;
      case 'sim-menu-add':
        st.karte.menus.push({ name: '', price: null });
        renderKeep();
        { const ins = view.querySelectorAll('[data-mf="name"]'); if (ins.length) ins[ins.length - 1].focus(); }
        break;
      case 'sim-menu-remove':
        st.karte.menus.splice(Number(t.dataset.i), 1);
        if (!st.karte.menus.length) st.karte.menus.push({ name: '', price: null });
        st.dirty = true;
        renderKeep();
        break;
      case 'sim-ai-copy': copyAiPrompt(t.dataset.target); break;
      case 'sim-ai-import': importAi(t.dataset.target); break;
      case 'sim-scroll': {
        const el = document.getElementById(t.dataset.to);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
      case 'sim-load-saved': {
        const d = st.saved;
        if (!d) return;
        if (st.dirty && !confirm('入力中の内容を、保存されている続きで置き換えますか？')) return;
        restoreCase(d);
        updateBadge();
        window.scrollTo(0, 0);
        break;
      }
      case 'sim-clear-saved':
        if (!confirm('ブラウザに保存されている前回の続き（取り込んだAIの回答を含む）を削除しますか？')) return;
        clearCase();
        st.saved = null;
        renderKeep();
        break;
      case 'sim-dock-close': toggleDock(false); break;
      case 'sim-to-setup':
        if (setupStale()) initSetup();
        saveCase();
        st.phase = 'setup';
        render();
        window.scrollTo(0, 0);
        break;
      case 'sim-to-diagnosis':
        st.phase = 'diagnosis';
        render();
        window.scrollTo(0, 0);
        break;
      case 'sim-kw': {
        const sel = st.setup.kw[Number(t.dataset.i)];
        sel.act = t.dataset.val;
        if (sel.act !== 'add') sel.match = null;
        renderKeep();
        break;
      }
      case 'sim-match':
        st.setup.kw[Number(t.dataset.i)].match = t.dataset.val;
        renderKeep();
        break;
      case 'sim-neg-add': addNegative(); break;
      case 'sim-neg-remove':
        st.setup.customNeg.splice(Number(t.dataset.i), 1);
        renderKeep();
        break;
      case 'sim-grade':
        if (setupMissing().length) return;
        st.phase = 'setupResult';
        render();
        window.scrollTo(0, 0);
        break;
      case 'sim-to-ops':
        startOps();
        st.phase = 'improve';
        render();
        window.scrollTo(0, 0);
        break;
      case 'sim-op-neg': {
        const negs = st.ops.draft.setup.customNeg, q = t.dataset.q, j = negs.indexOf(q);
        j >= 0 ? negs.splice(j, 1) : negs.push(q);
        renderKeep();
        break;
      }
      case 'sim-op-neg-add': addOpNegative(); break;
      case 'sim-op-neg-remove':
        st.ops.draft.setup.customNeg.splice(Number(t.dataset.i), 1);
        renderKeep();
        break;
      case 'sim-op-match':
        st.ops.draft.setup.kw[Number(t.dataset.i)].match = t.dataset.val;
        renderKeep();
        break;
      case 'sim-op-pause': {
        const y = st.ops.draft.setup.kw[Number(t.dataset.i)];
        y.act = y.act === 'paused' ? 'add' : 'paused';
        renderKeep();
        break;
      }
      case 'sim-op-addkw': {
        const i = Number(t.dataset.i), y = st.ops.draft.setup.kw[i];
        if (t.dataset.val === 'none') Object.assign(y, { act: st.setup.kw[i].act, match: null });
        else Object.assign(y, { act: 'add', match: t.dataset.val });
        renderKeep();
        break;
      }
      case 'sim-run-month':
        runNextMonth();
        st.phase = 'monthResult';
        render();
        window.scrollTo(0, 0);
        break;
      case 'sim-to-improve':
        makeDraft();
        st.phase = 'improve';
        render();
        window.scrollTo(0, 0);
        break;
      case 'sim-to-review':
        st.phase = 'review';
        render();
        window.scrollTo(0, 0);
        break;
      case 'sim-redo-setup': {
        const h0 = st.ops.history[0];
        st.setup = clone(h0.setup);
        st.karte = clone(h0.karte);
        st.kwSource = st.setup.source;
        st.ops = null;
        newSeed();
        st.phase = 'setup';
        render();
        window.scrollTo(0, 0);
        break;
      }
      case 'sim-to-result':
        st.ops = null;
        if (!st.seed) newSeed();
        st.phase = 'result';
        render();
        window.scrollTo(0, 0);
        break;
      case 'sim-reroll':
        newSeed();
        renderKeep();
        break;
      case 'sim-back-setup':
        st.phase = 'setup';
        render();
        window.scrollTo(0, 0);
        break;
      case 'sim-diagnose':
        syncGoals();
        if (missing().length || !st.karte.targetCount || !st.karte.targetCpa) return;
        st.phase = 'diagnosis';
        saveCase();
        render();
        window.scrollTo(0, 0);
        break;
      case 'sim-edit':
        st.phase = 'karte';
        render();
        window.scrollTo(0, 0);
        break;
    }
  });

  const refreshReq = id => { const r = $(`#sim-req-${id}`); if (r) r.hidden = filled(id); };
  const refreshAiHint = id => { const r = $(`#sim-aihint-${id}`); if (r) r.hidden = freeFilled(id); };
  function updateMenuCheck() {
    const el = $('#sim-menu-check');
    if (!el) return;
    const g = priceGap();
    el.hidden = !g;
    el.textContent = g ? `⚠️ ${priceGapText(g)}` : '';
  }

  view.addEventListener('change', e => {
    const d = e.target.dataset;
    if (d.opsf && st.ops && st.ops.draft) {
      const dr = st.ops.draft, v = e.target.value, f = d.opsf;
      if (f === 'hl') {
        const i = Number(v), hs = dr.setup.headlines;
        dr.setup.headlines = e.target.checked ? (hs.length < C.headlineMax ? [...hs, i] : hs) : hs.filter(x => x !== i);
        dr.setup.headlines.sort((a, b) => a - b);
      } else if (f === 'ds') {
        const i = Number(v), ds = dr.setup.descriptions;
        dr.setup.descriptions = e.target.checked ? (ds.length < C.descriptionMax ? [...ds, i] : ds) : ds.filter(x => x !== i);
        dr.setup.descriptions.sort((a, b) => a - b);
      } else if (f === 'bidding' || f === 'area') {
        dr.setup[f] = v;
        if (f === 'bidding' && v === 'manual' && !dr.setup.bid) dr.setup.bid = Math.round((avgCpc() || 100) / 10) * 10;
      } else if (f.startsWith('m-')) {
        dr.setup.meta[f.slice(2)] = v;
      } else if (f === 'measurement') {
        dr.karte.measurement = e.target.checked ? 'full' : st.karte.measurement;
      } else if (f === 'lp') {
        dr.karte.lp = e.target.checked ? 'dedicated' : st.karte.lp;
      } else if (f === 'creative') {
        dr.karte.creative = e.target.checked ? CREATIVE_UP[st.karte.creative] : st.karte.creative;
      } else return;
      renderKeep();
      return;
    }
    if (d.hl != null) {
      const i = Number(d.hl), hs = st.setup.headlines;
      if (e.target.checked) { if (hs.length < C.headlineMax && !hs.includes(i)) hs.push(i); }
      else st.setup.headlines = hs.filter(x => x !== i);
      st.setup.headlines.sort((a, b) => a - b);
      renderKeep();
      return;
    }
    if (d.kwsrc && st.setup) {
      changeSource(e.target.value);
      return;
    }
    if (d.adsrc && st.setup) {
      changeAdSource(e.target.value);
      return;
    }
    if (d.termsrc && st.setup) {
      changeTermsSource(e.target.value);
      return;
    }
    if (d.ds != null) {
      const i = Number(d.ds), ds = st.setup.descriptions;
      if (e.target.checked) { if (ds.length < C.descriptionMax && !ds.includes(i)) ds.push(i); }
      else st.setup.descriptions = ds.filter(x => x !== i);
      st.setup.descriptions.sort((a, b) => a - b);
      renderKeep();
      return;
    }
    if (d.setup === 'area' || d.setup === 'bidding') {
      st.setup[d.setup] = e.target.value;
      if (d.setup === 'bidding') renderKeep(); else updateSetupRest();
      return;
    }
    if (d.meta) {
      st.setup.meta[d.meta] = e.target.value;
      $('#sim-audience').innerHTML = renderAudience();
      updateSetupRest();
      return;
    }
    const id = d.sim;
    if (!id || fieldOf(id).type !== 'single') return;
    st.karte[id] = e.target.value;
    st.dirty = true;
    // この項目で表示が変わる項目（例：CVの種類 → 成約率）があれば描き直す
    if (allFieldIds().some(x => (fieldOf(x).showIf || {}).field === id)) {
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
      return;
    }
    refreshReq(id);
    updateCalc();
    updateRest();
  });

  view.addEventListener('input', e => {
    const of = e.target.dataset.opsf;
    if ((of === 'budget' || of === 'bid') && st.ops && st.ops.draft) {
      const n = Number(e.target.value);
      if (!(n > 0)) return;
      if (of === 'budget') {
        st.ops.draft.karte.budget = n;
        $('#sim-op-budget-note').textContent = budgetNote(n / st.karte.budget - 1);
      } else st.ops.draft.setup.bid = n;
      const cnt = changesList({ setup: st.setup, karte: st.karte }, st.ops.draft).length;
      const r = $('.sim-submit .sim-rest');
      if (r) r.innerHTML = cnt ? `変更：<b class="sim-changes">${cnt}件</b>` : '変更なし（このまま配信）';
      return;
    }
    if (e.target.dataset.menu != null) {
      const i = Number(e.target.dataset.menu), f = e.target.dataset.mf, ms = st.karte.menus;
      while (ms.length <= i) ms.push({ name: '', price: null });
      ms[i][f] = f === 'price' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
      st.dirty = true;
      refreshAiHint('menus');
      updateMenuCheck();
      return;
    }
    if (e.target.dataset.aipaste) {
      st.aiFlow[e.target.dataset.aipaste].draft = e.target.value;
      st.dirty = true;
      saveSoon();
      return;
    }
    if (e.target.dataset.setup === 'bid') {
      st.setup.bid = e.target.value === '' ? null : Number(e.target.value);
      updateSetupRest();
      return;
    }
    const id = e.target.dataset.sim;
    if (!id) return;
    const f = fieldOf(id);
    if (f.type === 'text') {
      st.karte[id] = e.target.value;
      refreshAiHint(id);
    } else if (f.type === 'number') {
      st.karte[id] = e.target.value === '' ? null : Number(e.target.value);
      $(`#sim-echo-${id}`).innerHTML = echoOf(id);
      if (id === 'price') updateMenuCheck();
      refreshReq(id);
      updateCalc();
      updateRest();
    } else {
      return;
    }
    st.dirty = true;
  });
})();
