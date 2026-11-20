(() => {
  // This document runs in an opaque-origin sandbox. The provider sends scripts,
  // so the parent receives only the normalized fields it needs for its cards.
  const params = new URLSearchParams(location.search);
  const sport = params.get('sport');
  const dates = (params.get('dates') || '').split(',').filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date));
  const calendar = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short' });
  const stateNames = ['', '第一节', '第一节结束', '第二节', '半场', '第三节', '第三节结束', '第四节',
    '第四节结束', '完场', '加时', '加时完场', '中断', '取消', '延期', '腰斩', '待定'];

  function requestScript(address) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      function finish(error) {
        clearTimeout(timeout);
        script.remove();
        if (error) reject(error);
        else resolve();
      }
      const timeout = setTimeout(() => finish(new Error('7M 请求超时')), 5500);
      script.src = address;
      script.onload = () => finish();
      script.onerror = () => finish(new Error('7M 数据暂不可用'));
      document.head.append(script);
    });
  }

  function basketballStatus(value) {
    const code = Number(value);
    const detail = stateNames[code] || '';
    if (code === 0) return { state: 'scheduled', detail };
    if (code === 9 || code === 11) return { state: 'final', detail };
    if ((code >= 1 && code <= 8) || code === 10) return { state: 'live', detail };
    if (code >= 13 && code <= 15) return { state: 'postponed', detail };
    return { state: 'unknown', detail };
  }

  function score(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number <= 300 ? number : null;
  }

  function periodTotal(periods) {
    const points = periods.map(score);
    return points.every(point => point !== null) ? score(points.reduce((sum, point) => sum + point, 0)) : null;
  }

  function kickoff(value) {
    const parts = typeof value === 'string' ? value.split(',').map(part => part.padStart(2, '0')) : [];
    if (parts.length !== 6) return null;
    const [year, month, day, hour, minute, second] = parts;
    const time = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }

  function withScore(match, status, homePoints, awayPoints) {
    const display = status.state === 'live' || status.state === 'final';
    return {
      ...match, ...status,
      homeScore: display ? homePoints : null,
      awayScore: display ? awayPoints : null,
    };
  }

  function readBasketballSnapshot() {
    if (!Array.isArray(window.bDt)) throw new Error('7M 比赛表格式已变更');
    const matches = new Map();
    for (const [id, row] of Object.entries(window.bDt)) {
      if (!Array.isArray(row) || !row[6] || !row[8]) continue;
      const time = kickoff(row[1]);
      if (!time) continue;
      const match = { id, kickoff: time, league: row[3], home: row[6], away: row[8] };
      matches.set(id, withScore(match, basketballStatus(row[0]), score(row[16]), score(row[23])));
    }
    return { matches, sequence: Number(window.GetFn) };
  }

  function applyBasketballUpdate(snapshot) {
    const update = window.sxl;
    if (!Array.isArray(update?.c) || Number(update.fn) < snapshot.sequence) return;
    for (const row of update.c) {
      if (!Array.isArray(row) || row.length < 12) continue;
      const id = String(row[0]);
      const match = snapshot.matches.get(id);
      if (!match) continue;
      const state = basketballStatus(row[1]);
      snapshot.matches.set(id, withScore(match, state, periodTotal(row.slice(2, 7)), periodTotal(row.slice(7, 12))));
    }
  }

  async function basketballFeed() {
    const today = calendar.format(new Date());
    const current = dates.some(date => date >= today);
    const matches = new Map();
    let ok = true;
    for (const date of dates.filter(date => date < today)) {
      try {
        window.bDt = null;
        await requestScript(`https://bdata.7m.com.cn/datafile/${date.replaceAll('-', '')}/S2_fgb1.js`);
        for (const [id, match] of readBasketballSnapshot().matches) matches.set(id, match);
      } catch {
        ok = false;
      }
    }
    if (current) {
      const base = 'https://js-basket.7m.com.cn/livedts';
      const stamp = Math.floor(Date.now() / 1000);
      window.bDt = null;
      window.sxl = null;
      const [snapshot, update] = await Promise.allSettled([
        requestScript(`${base}/S2_fgb1.js?${stamp}`),
        requestScript(`${base}/sxl.js?date=${stamp}`),
      ]);
      if (snapshot.status === 'fulfilled' && Array.isArray(window.bDt)) {
        const latest = readBasketballSnapshot();
        if (update.status === 'fulfilled') applyBasketballUpdate(latest);
        for (const [id, match] of latest.matches) matches.set(id, match);
      } else {
        ok = false;
      }
    }
    return { matches: [...matches.values()], ok };
  }

  async function report() {
    let result = { matches: [], ok: false };
    try {
      if (dates.length && dates.length <= 3) {
        if (sport === 'basketball') result = await basketballFeed();
        if (sport === 'football' && typeof window.footballFeed === 'function') result = await window.footballFeed(dates, requestScript);
      }
    } finally {
      window.parent.postMessage({ type: 'agent-kang-scores', ...result }, '*');
    }
  }

  report().catch(() => { /* The parent receives the unavailable state from report(). */ });
})();
