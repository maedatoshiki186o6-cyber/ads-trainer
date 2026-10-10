/*
 * 実践シミュレーション — 画面と計算
 *
 * 目安の数値は sim-benchmarks.js、案件カルテの選択肢・サンプル案件は sim-cases.js にあります。
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
  const READY = ['karte', 'setup']; // 実装済みの段階

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
    return f.type === 'text' || f.optional || !!v;
  }
  const requiredIds = () => allFieldIds().filter(id => fieldOf(id).type !== 'text' && shown(id));
  // 表示用の値（数値は単位つき）
  function valueText(id, k = st.karte) {
    const f = fieldOf(id), v = k[id];
    if (f.type === 'number') return v == null ? '未入力' : f.unit === '%' ? `${v}%` : yen(v);
    if (f.type === 'text') return v;
    return labelOf(id, v);
  }
  // 円の金額を「50万円」のような読みやすい形に
  const manYen = v => v >= 10000 ? `${(v / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円` : yen(v);

  function blankKarte() {
    const k = { media: document.body.classList.contains('theme-meta') ? 'meta' : 'google' };
    for (const id of allFieldIds()) k[id] = fieldOf(id).type === 'text' ? '' : null;
    return k;
  }

  /* ---------- state ---------- */
  const st = {
    phase: 'karte',
    karte: blankKarte(),
    sampleId: null,
    setup: null,
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
  const phaseKey = () => ({ diagnosis: 'karte', setupResult: 'setup' })[st.phase] || st.phase;

  const SCREENS = {
    karte:       { title: () => '案件カルテを作ろう', body: () => renderKarte() },
    diagnosis:   { title: () => '案件カルテの診断', body: () => renderDiagnosis() },
    setup:       { title: () => st.karte.media === 'meta' ? 'オーディエンスを設定しよう' : 'キーワードを選ぼう', body: () => st.karte.media === 'meta' ? renderSetupMeta() : renderSetupGoogle() },
    setupResult: { title: () => st.karte.media === 'meta' ? 'オーディエンス設定の採点' : 'キーワード選びの採点', body: () => renderSetupResult() }
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
      <p class="sim-disclaimer sim-disclaimer-foot">${DISCLAIMER}</p>`;
  }

  function renderKarte() {
    const k = st.karte;
    const rest = missing().length;
    return `
      <p class="lead">広告を始める前に、案件（広告を出すお店や商品）の情報を整理します。サンプル案件を選ぶか、自分で項目を選んでください。この内容をもとに、あとの段階で設定と成果を計算します。</p>

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
          ${g.fields.filter(id => shown(id)).map(renderItem).join('')}
          ${g.calc ? `<div class="sim-calc" id="sim-calc" aria-live="polite">${renderCalc()}</div>` : ''}
        </section>`).join('')}

      <div class="sim-submit">
        <p class="sim-rest" id="sim-rest">${rest ? `未選択の項目があと <b>${rest}</b> 個あります` : 'すべての項目を選びました'}</p>
        <button type="button" class="btn-primary" data-action="sim-diagnose" id="sim-diagnose" ${rest ? 'disabled' : ''}>カルテを確定して診断する</button>
      </div>`;
  }

  const helpBtn = id => fieldOf(id).help ? `<button type="button" class="i-btn" data-action="sim-help" data-id="${id}" aria-label="${esc(fieldOf(id).label)}の解説">i</button>` : '';
  const reqTag = (id, word) => `<span class="sim-req" id="sim-req-${id}" ${filled(id) ? 'hidden' : ''}>${word}</span>`;

  function renderItem(id) {
    const f = fieldOf(id), v = st.karte[id];
    if (f.type === 'text') {
      return `<div class="sim-item">
        <label class="sim-label" for="sim-${id}">${esc(f.label)}</label>
        ${f.rows === 1
          ? `<input type="text" id="sim-${id}" class="sim-text" data-sim="${id}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}">`
          : `<textarea id="sim-${id}" class="sim-text" rows="${f.rows || 2}" data-sim="${id}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`}
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
          ${allFieldIds().filter(id => fieldOf(id).type !== 'text' && shown(id)).map(id => `<dt>${esc(fieldOf(id).label.replace(/（.*?）/g, ''))}</dt><dd>${esc(valueText(id))}</dd>`).join('')}
          <dt>目標CV数</dt><dd><b>${fmt(k.targetCount)}件</b>（月）</dd>
          <dt>目標CPA</dt><dd><b>${yen(k.targetCpa)}</b>（予算から見たCPA）</dd>
          <dt>上限CPA</dt><dd>${k.upperCpa ? yen(k.upperCpa) : '―（粗利率が未入力）'}</dd>
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
  const fill = t => String(t).replace(/\{area\}/g, areaWord());
  const kwList = () => C.keywords[st.karte.industry] || [];
  const negGroups = () => C.negativeGroups[st.karte.industry] || [];
  const hlList = () => C.headlines[st.karte.industry] || [];
  const isTermKw = c => !c.volume; // 除外キーワード向けの単語（検索数を持たない候補）
  const MATCH_CODE = { exact: t => `[${t}]`, phrase: t => `"${t}"`, broad: t => t };
  const ACT_LABEL = { add: '使う', negative: '除外', skip: '使わない' };
  const MARK_TEXT = { good: '◎ 正解', ok: '△ 惜しい', bad: '× 見直し' };
  const PTS = { good: 2, ok: 1, bad: 0 };
  const QUALITY_LABEL = { high: '高い', mid: 'ふつう', low: '低い' };
  const special = () => !!st.karte.specialCategory && st.karte.specialCategory !== 'none';

  function initSetup() {
    st.setup = {
      industry: st.karte.industry, media: st.karte.media,
      kw: kwList().map(() => ({ act: null, match: null })),
      customNeg: [], headlines: [], area: null, bidding: null, bid: null,
      meta: {}
    };
  }
  const setupStale = () => !st.setup || st.setup.industry !== st.karte.industry || st.setup.media !== st.karte.media;

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
  function kwQuality(c, hlIdx = st.setup.headlines) {
    const hs = hlIdx.map(i => hlList()[i]);
    let q = hs.some(h => h.quality === 'high' && h.themes.includes(c.theme)) ? 'high'
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
    if (!list.length) {
      return `<section class="field"><p>この業種（${esc(B.industries[k.industry].label)}）のキーワード候補は準備中です。いまは「歯科・クリニック」「パーソナルジム」「不動産」の3業種で練習できます。カルテで業態を変えるか、媒体をMeta広告にして試してください。</p>
        <div class="end-actions"><button type="button" class="btn-ghost" data-action="sim-edit">← カルテを修正する</button></div></section>`;
    }
    const scale = B.area[k.area].searchScale;
    const ac = avgCpc();
    return `
      <p class="lead">${esc(B.industries[k.industry].label)}の広告で使うキーワードを選びます。候補ごとに「使う（マッチタイプも選ぶ）」「除外」「使わない」を決めてください。検索数は、カルテの商圏（${esc(labelOf('area', k.area))}）での目安です。</p>
      ${goalStrip()}

      <section class="field">
        <div class="field-head"><h3>① キーワード</h3></div>
        <details class="tc-guide sim-guide"><summary>マッチタイプと検索意図の違い</summary><dl>
          ${Object.entries(B.match).map(([m, x]) => `<dt>${esc(x.label)}　<code>${esc(MATCH_CODE[m]('キーワード'))}</code></dt><dd>表示の広がり ×${x.reach}・関係ない検索 約${Math.round(x.irrelevant * 100)}%（除外なしの場合）・クリック率 ×${x.ctr}</dd>`).join('')}
          ${Object.entries(B.intent).map(([i, x]) => `<dt>検索意図：${esc(x.label)}</dt><dd>クリック率 ×${x.ctr}・成約率 ×${x.cvr}</dd>`).join('')}
        </dl></details>
        <ul class="kw-list">${list.map((c, i) => renderKwRow(c, i, scale)).join('')}</ul>

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
        <div class="field-head"><h3>② 広告見出し <small class="sim-hint">（最大${C.headlineMax}つ・${s.headlines.length}/${C.headlineMax}）</small></h3></div>
        <p class="sim-hint">見出しに、使うキーワードの内容が入っているほど「広告の品質」が上がり、クリック率が上がってクリック単価が下がります（品質が高い：クリック率×${B.quality.high.ctr}・クリック単価×${B.quality.high.cpc}／低い：クリック率×${B.quality.low.ctr}・クリック単価×${B.quality.low.cpc}）。</p>
        <div class="opts multi">${hlList().map((h, i) => `
          <label class="opt"><input type="checkbox" value="${i}" data-hl="${i}" ${s.headlines.includes(i) ? 'checked' : ''} ${!s.headlines.includes(i) && s.headlines.length >= C.headlineMax ? 'disabled' : ''}>
            <span class="opt-main"><span class="opt-label">${esc(fill(h.text))}</span></span></label>`).join('')}</div>
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
      ${sel.act === 'add' ? `<div class="sim-match"><span class="seg" role="group" aria-label="マッチタイプ">${Object.keys(B.match).map(m => `<button type="button" class="seg-btn ${sel.match === m ? 'on seg-add' : ''}" aria-pressed="${sel.match === m}" data-action="sim-match" data-i="${i}" data-val="${m}">${esc(B.match[m].label)}</button>`).join('')}</span>
        ${sel.match ? `<code class="sim-mcode">${esc(MATCH_CODE[sel.match](text))}</code>` : '<span class="sim-req">マッチタイプを選んでください</span>'}</div>` : ''}
    </li>`;
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
        <button type="button" class="btn-primary" disabled title="次の段階で追加予定です">次へ：成果シミュレーション（準備中）</button>
      </div>`;
  }

  function renderKeep() {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }
  function addNegative() {
    const input = $('#sim-neg-text');
    const t = input.value.trim().replace(/^[-−]+/, '');
    if (!t) return;
    if (!st.setup.customNeg.includes(t)) st.setup.customNeg.push(t);
    renderKeep();
    $('#sim-neg-text').focus();
  }

  /* ---------- events ---------- */
  function startSim() {
    st.phase = 'karte';
    st.karte = blankKarte();
    st.sampleId = null;
    st.setup = null;
    st.dirty = false;
    render();
    showSim();
  }

  view.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'sim-neg-text' && !e.isComposing) {
      e.preventDefault();
      addNegative();
    }
  });

  // ホームに戻るときは、入力途中なら確認する（他のモードの処理より先に動かす）
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-action="home"]');
    if (!t || view.hidden || !st.dirty) return;
    if (!confirm('シミュレーションの内容は失われます。ホームに戻りますか？')) {
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
        st.karte = Object.assign(blankKarte(), s.karte);
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
      case 'sim-to-setup':
        if (setupStale()) initSetup();
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
      case 'sim-back-setup':
        st.phase = 'setup';
        render();
        window.scrollTo(0, 0);
        break;
      case 'sim-diagnose':
        syncGoals();
        if (missing().length || !st.karte.targetCount || !st.karte.targetCpa) return;
        st.phase = 'diagnosis';
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

  view.addEventListener('change', e => {
    const d = e.target.dataset;
    if (d.hl != null) {
      const i = Number(d.hl), hs = st.setup.headlines;
      if (e.target.checked) { if (hs.length < C.headlineMax && !hs.includes(i)) hs.push(i); }
      else st.setup.headlines = hs.filter(x => x !== i);
      st.setup.headlines.sort((a, b) => a - b);
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
    } else if (f.type === 'number') {
      st.karte[id] = e.target.value === '' ? null : Number(e.target.value);
      $(`#sim-echo-${id}`).innerHTML = echoOf(id);
      refreshReq(id);
      updateCalc();
      updateRest();
    } else {
      return;
    }
    st.dirty = true;
  });
})();
