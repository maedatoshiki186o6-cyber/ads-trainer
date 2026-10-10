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
  const READY = ['karte']; // 実装済みの段階

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
  const phaseKey = () => st.phase === 'diagnosis' ? 'karte' : st.phase;

  function render() {
    const body = st.phase === 'diagnosis' ? renderDiagnosis() : renderKarte();
    view.innerHTML = `
      <div class="hero sim-hero">
        <p class="step-count">実践シミュレーション</p>
        <h1>${st.phase === 'diagnosis' ? '案件カルテの診断' : '案件カルテを作ろう'}</h1>
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
        <textarea id="sim-${id}" class="sim-text" rows="2" data-sim="${id}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>
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
        <button type="button" class="btn-primary" disabled title="次の段階で追加予定です">次へ：${esc(phaseTitle(PHASES[1]))}（準備中）</button>
      </div>`;
  }

  function updateRest() {
    const rest = missing().length;
    $('#sim-rest').innerHTML = rest ? `未選択の項目があと <b>${rest}</b> 個あります` : 'すべての項目を選びました';
    $('#sim-diagnose').disabled = rest > 0;
  }

  /* ---------- events ---------- */
  function startSim() {
    st.phase = 'karte';
    st.karte = blankKarte();
    st.sampleId = null;
    st.dirty = false;
    render();
    showSim();
  }

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
    const id = e.target.dataset.sim;
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
