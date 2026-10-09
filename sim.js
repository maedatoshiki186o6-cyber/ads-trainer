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
  const requiredIds = () => allFieldIds().filter(id => fieldOf(id).type !== 'text');

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

  const missing = () => requiredIds().filter(id => !st.karte[id]);

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

  function diagnose(k) {
    const out = [];
    const add = (level, title, text) => out.push({ level, title, text });
    const ind = B.industries[k.industry];
    const bench = benchOf(k);
    const budget = numOf('budget', k.budget);
    const tCpa = numOf('targetCpa', k.targetCpa);
    const tCount = numOf('targetCount', k.targetCount);
    const price = numOf('price', k.price);
    const isMeta = k.media === 'meta';
    const benchCount = budget / bench.cpa;

    // 目標CPAと目安CPA
    const ratio = tCpa / bench.cpa;
    const benchText = `この業種・条件での目安のCPAは約${yen(bench.cpa)}です（クリック単価 約${yen(bench.cpc)} ÷ 成約率 約${pct(bench.cvr)}）。`;
    if (ratio < B.diagnosis.cpaTight) {
      add('bad', '目標CPAが厳しすぎます', `${benchText}目標の${yen(tCpa)}は目安の${Math.round(ratio * 100)}%で、達成はかなり難しい水準です。LPの改善などで成約率を上げるか、目標を見直しましょう。`);
    } else if (ratio > B.diagnosis.cpaLoose) {
      add('good', '目標CPAには余裕があります', `${benchText}目標の${yen(tCpa)}なら、余裕をもって達成できる見込みです。件数を増やす方向も検討できます。`);
    } else {
      add('good', '目標CPAは目安どおりです', `${benchText}目標の${yen(tCpa)}は現実的な水準です。`);
    }

    // 予算と目標件数
    const need = tCpa * tCount;
    if (budget < need * 0.9) {
      add('bad', '予算が目標件数に足りません', `目標CPA ${yen(tCpa)} × ${tCount}件 = ${yen(need)}必要ですが、予算は${yen(budget)}です。目標CPAどおりに取れても約${Math.floor(budget / tCpa)}件までです。`);
    } else if (budget > need * 1.5) {
      add('ok', '予算に対して目標件数が少なめです', `目標どおりなら${yen(need)}で済み、予算${yen(budget)}が余ります。件数の目標を上げるか、予算を減らせないか確認しましょう。`);
    } else {
      add('good', '予算と目標件数のバランスは取れています', `目標CPA ${yen(tCpa)} × ${tCount}件 = ${yen(need)}で、予算${yen(budget)}と見合っています。`);
    }
    out.push({ level: 'info', title: '目安どおりに進んだ場合', text: `予算${yen(budget)} ÷ 目安CPA ${yen(bench.cpa)} で、月に約${benchCount < 10 ? benchCount.toFixed(1) : fmt(benchCount)}件の見込みです。` });

    // 客単価とCPA
    if (tCpa > price) {
      add('bad', '目標CPAが客単価を上回っています', `客単価の目安は${yen(price)}です。1件の成果に客単価より多くの広告費をかけると、リピートや紹介がない限り赤字になります。`);
    } else if (tCpa > price * 0.5) {
      add('ok', '目標CPAが客単価に近いです', `客単価の目安${yen(price)}に対して、目標CPAが${yen(tCpa)}です。利益が残るか、リピート率も含めて確認しましょう。`);
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
          ${g.fields.map(renderItem).join('')}
        </section>`).join('')}

      <div class="sim-submit">
        <p class="sim-rest" id="sim-rest">${rest ? `未選択の項目があと <b>${rest}</b> 個あります` : 'すべての項目を選びました'}</p>
        <button type="button" class="btn-primary" data-action="sim-diagnose" id="sim-diagnose" ${rest ? 'disabled' : ''}>カルテを確定して診断する</button>
      </div>`;
  }

  function renderItem(id) {
    const f = fieldOf(id), v = st.karte[id];
    if (f.type === 'text') {
      return `<div class="sim-item">
        <label class="sim-label" for="sim-${id}">${esc(f.label)}</label>
        <textarea id="sim-${id}" class="sim-text" rows="2" data-sim="${id}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>
      </div>`;
    }
    return `<fieldset class="sim-item" id="sim-item-${id}">
      <legend class="sim-label">${esc(f.label)}${v ? '' : ' <span class="sim-req">未選択</span>'}</legend>
      ${f.hint ? `<p class="sim-hint">${esc(f.hint)}</p>` : ''}
      <div class="sim-chips">${optionsOf(id).map(o => `
        <label class="sim-chip"><input type="radio" name="sim-${id}" value="${esc(o.value)}" data-sim="${id}" ${v === o.value ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}
      </div>
    </fieldset>`;
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
          ${allFieldIds().filter(id => fieldOf(id).type !== 'text').map(id => `<dt>${esc(fieldOf(id).label.replace(/（.*?）/g, ''))}</dt><dd>${esc(labelOf(id, k[id]))}</dd>`).join('')}
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
      case 'sim-diagnose':
        if (missing().length) return;
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

  view.addEventListener('change', e => {
    const id = e.target.dataset.sim;
    if (!id || fieldOf(id).type === 'text') return;
    st.karte[id] = e.target.value;
    st.dirty = true;
    const req = $(`#sim-item-${id} .sim-req`);
    if (req) req.remove();
    updateRest();
  });

  view.addEventListener('input', e => {
    const id = e.target.dataset.sim;
    if (!id || fieldOf(id).type !== 'text') return;
    st.karte[id] = e.target.value;
    st.dirty = true;
  });
})();
