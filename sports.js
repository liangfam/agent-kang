(() => {
  const timeZone = 'Asia/Shanghai';
  const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short' });
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { timeZone, month: 'long', day: 'numeric', weekday: 'short' });
  const kickLabel = new Intl.DateTimeFormat('zh-CN', { timeZone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const timeLabel = new Intl.DateTimeFormat('zh-CN', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const stateLabels = {
    scheduled: '未开赛',
    live: '进行中',
    final: '已完赛',
    postponed: '延期或取消',
    unknown: '赛况待同步',
  };
  const sourceLinks = {
    football: { scores: 'https://live.7m.com.cn/default_gb.aspx', schedule: 'https://www.sporttery.cn/jc/zqbfzb/' },
    basketball: { scores: 'https://basket.7m.com.cn/', schedule: 'https://www.sporttery.cn/jc/lqbfzb/' },
  };

  const dateOutput = document.querySelector('#sports-date');
  const status = document.querySelector('#sports-status');
  const results = document.querySelector('#sports-results');
  const matches = document.querySelector('#sports-matches');
  const empty = document.querySelector('#sports-empty');
  const refreshButton = document.querySelector('#sports-refresh');
  const sourceLink = document.querySelector('#sports-score-source');
  const scheduleLink = document.querySelector('#sports-schedule-source');
  const sportButtons = [...document.querySelectorAll('[data-sport]')];
  const stateButtons = [...document.querySelectorAll('button[data-state]')];

  let sport = 'football';
  let date = dateKey.format();
  let filter = 'all';
  let snapshot = null;
  let request = 0;
  let loading = false;

  function dateAtNoon(key) {
    return new Date(`${key}T12:00:00+08:00`);
  }

  function neighborDate(key, offset) {
    const basis = dateAtNoon(key);
    basis.setUTCDate(basis.getUTCDate() + offset);
    return dateKey.format(basis);
  }

  function create(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setStatus(message, tone = '') {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function formatTime(value, formatter) {
    if (value == null) return '';
    const stamp = new Date(value);
    return Number.isFinite(stamp.getTime()) ? formatter.format(stamp) : '';
  }

  function team(name, role) {
    const label = create('span', 'sports-match-team', name);
    label.append(create('small', '', role));
    return label;
  }

  function scorecard(match) {
    const state = Object.hasOwn(stateLabels, match.state) ? match.state : 'unknown';
    const row = create('li', 'sports-match');
    row.dataset.state = state;

    const meta = create('div', 'sports-match-meta');
    const tags = create('div', 'sports-match-tags');
    if (match.code) tags.append(create('span', 'sports-match-code', match.code));
    if (match.league) tags.append(create('span', 'sports-match-league', match.league));
    meta.append(tags, create('span', 'sports-match-state', stateLabels[state]));

    const contest = create('div', 'sports-match-result');
    const hasScore = match.homeScore != null && match.awayScore != null;
    const score = create('strong', 'sports-match-score', hasScore ? `${match.homeScore} : ${match.awayScore}` : '—');
    if (!hasScore) score.setAttribute('aria-label', '暂无比分');
    contest.append(team(match.home, '主队'), score, team(match.away, '客队'));

    const foot = create('div', 'sports-match-foot');
    const kickoff = formatTime(match.kickoff, kickLabel);
    if (kickoff) {
      const time = create('time', '', kickoff);
      time.dateTime = new Date(match.kickoff).toISOString();
      foot.append(time);
    } else {
      foot.append(create('span', '', '开赛时间待定'));
    }
    const detail = match.detail === stateLabels[state] ? '' : match.detail;
    const source = hasScore && match.scoreSource ? match.scoreSource : '';
    const secondary = [detail, source].filter(Boolean).join(' · ');
    if (secondary) foot.append(create('span', '', secondary));
    row.append(meta, contest, foot);
    return row;
  }

  function render() {
    const items = snapshot?.matches ?? [];
    for (const button of stateButtons) {
      const value = button.dataset.state;
      const count = value === 'all' ? items.length : items.filter(match => match.state === value).length;
      button.setAttribute('aria-pressed', String(filter === value));
      button.querySelector('span').textContent = snapshot ? count : '—';
    }

    const visible = filter === 'all' ? items : items.filter(match => match.state === filter);
    matches.replaceChildren(...visible.map(scorecard));
    matches.hidden = visible.length === 0;
    empty.hidden = visible.length > 0;
    if (!snapshot) {
      empty.textContent = loading ? '正在获取比赛，请稍候。' : '暂时无法读取赛程，请重试或查看中国体彩网。';
    } else if (!items.length) {
      empty.textContent = snapshot.historyUnavailable
        ? '这个比赛日没有已保存的赛程，可前往中国体彩网查看赛果。'
        : '这个比赛日暂无可显示的体彩场次。';
    } else if (!visible.length) {
      empty.textContent = `暂无${stateLabels[filter] ?? '符合条件的'}比赛。`;
    }
  }

  function updateControls() {
    dateOutput.dateTime = date;
    dateOutput.textContent = dateLabel.format(dateAtNoon(date));
    sourceLink.href = sourceLinks[sport].scores;
    scheduleLink.href = sourceLinks[sport].schedule;
    for (const button of sportButtons) button.setAttribute('aria-pressed', String(button.dataset.sport === sport));
  }

  function updateSnapshot(next) {
    if (next.scoresOk === false && snapshot?.scoresUpdatedAt) {
      const previous = new Map(snapshot.matches.map(match => [match.id, match]));
      let retainedScore = false;
      for (const match of next.matches) {
        const existing = previous.get(match.id);
        if (existing && match.homeScore == null && match.awayScore == null && match.state !== 'postponed') {
          const { state, homeScore, awayScore, detail, scoreSource } = existing;
          if (scoreSource === '7M' && homeScore != null && awayScore != null) {
            Object.assign(match, { state, homeScore, awayScore, detail, scoreSource });
            retainedScore = true;
          }
        }
      }
      if (retainedScore) next.scoresUpdatedAt ??= snapshot.scoresUpdatedAt;
    }
    snapshot = next;
    render();
  }

  function describeSnapshot() {
    const saved = snapshot.scheduleCached ? ' · 含已保存赛程' : '';
    if (!snapshot.matches.length) {
      const time = formatTime(snapshot.scheduleUpdatedAt, timeLabel);
      setStatus(snapshot.historyUnavailable ? '历史赛程暂未保存' : time ? `体彩赛程已同步 · ${time}` : '体彩赛程已同步');
    } else if (snapshot.scoresOk === false) {
      const time = formatTime(snapshot.scoresUpdatedAt, timeLabel);
      setStatus(time ? `7M 暂时无法更新 · 保留 ${time} 已同步的比分` : `7M 比分暂不可用 · 已显示体彩赛程${saved}`, 'stale');
    } else if (snapshot.scoreMatches > 0) {
      const time = formatTime(snapshot.scoresUpdatedAt, timeLabel);
      const summary = `已匹配 ${snapshot.scoreMatches} 场 7M 赛况`;
      setStatus(`${summary}${time ? ` · ${time} 更新` : ''}${saved}`);
    } else {
      setStatus(`暂无匹配的 7M 赛况${saved}`);
    }
  }

  async function load(reason) {
    if (loading && reason !== 'selection') return;
    const activeRequest = ++request;
    loading = true;
    refreshButton.setAttribute('aria-disabled', 'true');
    status.setAttribute('aria-live', reason === 'auto' ? 'off' : 'polite');
    if (!snapshot) {
      results.setAttribute('aria-busy', 'true');
      setStatus('正在加载体彩赛程…');
      render();
    } else if (reason === 'manual') {
      setStatus('正在刷新赛事…');
    }

    try {
      const next = await window.sportsData.load(sport, date, schedule => {
        if (activeRequest !== request || snapshot) return;
        updateSnapshot(schedule);
        results.setAttribute('aria-busy', 'false');
        setStatus('体彩赛程已同步 · 正在匹配 7M 比分…');
      });
      if (activeRequest !== request) return;
      updateSnapshot(next);
      describeSnapshot();
    } catch {
      if (activeRequest !== request) return;
      setStatus(snapshot ? '暂时无法更新 · 保留上次同步的比赛' : '暂时无法连接体彩赛程', 'stale');
    } finally {
      if (activeRequest === request) {
        loading = false;
        results.setAttribute('aria-busy', 'false');
        refreshButton.removeAttribute('aria-disabled');
        if (!snapshot) render();
      }
    }
  }

  function select(nextSport, nextDate) {
    if (sport === nextSport && date === nextDate) return;
    sport = nextSport;
    date = nextDate;
    filter = 'all';
    snapshot = null;
    updateControls();
    load('selection');
  }

  function autoRefresh() {
    if (!document.hidden && date >= neighborDate(dateKey.format(), -1) && date <= dateKey.format()) load('auto');
  }

  for (const button of sportButtons) button.addEventListener('click', () => select(button.dataset.sport, date));
  for (const button of stateButtons) button.addEventListener('click', () => {
    filter = button.dataset.state;
    render();
  });
  document.querySelector('#sports-prev').addEventListener('click', () => select(sport, neighborDate(date, -1)));
  document.querySelector('#sports-next').addEventListener('click', () => select(sport, neighborDate(date, 1)));
  document.querySelector('#sports-today').addEventListener('click', () => select(sport, dateKey.format()));
  refreshButton.addEventListener('click', () => load('manual'));
  document.addEventListener('visibilitychange', autoRefresh);
  setInterval(autoRefresh, 30_000);
  updateControls();
  load('selection');
})();
