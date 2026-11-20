(() => {
  const calendar = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short' });
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const sports = new Set(['football', 'basketball']);
  const schedules = new Map();
  const savedSchedules = new Map();
  const feedPage = new URL('sports-feed.html', document.currentScript.src);
  const halfHour = 30 * 60 * 1000;

  const aliases = [
    ['埃菲斯', '伊斯坦布尔埃菲斯', '安纳托利亚艾菲斯', '阿纳多卢艾菲斯', '艾菲斯'],
    ['阿斯维尔', '艾斯维尔', '里昂维勒班', '里昂维尔班'],
    ['费希塔', '维切塔', '维希塔'],
    ['休斯敦火箭', '休斯顿火箭', '火箭'],
    ['奥林匹亚科斯', '奥林匹亚', '奥林比亚高斯', '奥林匹亚克斯'],
    ['贝尔格莱德红星', '贝尔格莱德红星队', '贝红星', '红星'],
    ['贝尔格莱德游击', '贝尔格莱德游击队', '贝游击', '游击队', '柏迪逊'],
    ['贝西克塔斯', '贝西克塔', '比锡达斯'],
    ['费内巴切', '费内巴赫', '费伦巴治'],
    ['慕尼黑拜仁', '拜仁慕尼黑', '拜仁'],
    ['皇家马德里', '皇马'],
    ['巴塞罗那', '巴塞隆拿', '巴萨'],
    ['毕尔巴鄂竞技', '毕尔巴鄂', '毕尔包'],
    ['比勒费尔德', '比勒费', '比勒菲尔德'],
    ['费城76人', '费城七十六人', '费城七六人', '76人'],
    ['俄克拉荷马城雷霆', '俄克拉荷马雷霆', '俄克拉何马城雷霆', '雷霆'],
    ['达拉斯独行侠', '达拉斯小牛', '独行侠'],
    ['底特律活塞', '底特律活塞队', '底特律活塞球队', '活塞'],
    ['克利夫兰骑士', '克里夫兰骑士', '骑士'],
    ['新奥尔良鹈鹕', '纽奥良鹈鹕', '鹈鹕'],
    ['明尼苏达森林狼', '明尼苏达木狼', '森林狼', '木狼'],
    ['萨克拉门托国王', '萨克拉门托帝王', '国王', '帝王'],
    ['波特兰开拓者', '波特兰拓荒者', '开拓者', '拓荒者'],
    ['纽约尼克斯', '纽约尼克', '纽约人', '尼克斯'],
    ['多伦多猛龙', '多伦多速龙', '猛龙', '速龙'],
    ['印第安纳步行者', '印第安纳溜马', '步行者', '溜马'],
    ['圣安东尼奥马刺', '圣安东尼奥马刺队', '马刺'],
  ];

  function teamKey(value) {
    return typeof value === 'string'
      ? value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
        .replace(/(?:足球俱乐部|篮球俱乐部|俱乐部|队|fc)$/u, '')
      : '';
  }

  const equivalentTeams = new Map(aliases.flatMap(group => group.map(name => [teamKey(name), teamKey(group[0])])));
  const teamPart = name => equivalentTeams.get(name) || name;

  function nameQuality(keys, team) {
    const candidate = teamKey(team);
    if (!candidate) return 0;
    if (keys.includes(candidate)) return 3;
    if (keys.some(key => teamPart(key) === teamPart(candidate))) return 3;
    const squad = /(?:[uw]\d{1,2}|女足|女篮|女子|预备|二队|青年|后备|\d{3}|[bc])$/u;
    return keys.some(key => key.length >= 2 && candidate.length >= 2 &&
      (key.match(squad)?.[0] || '') === (candidate.match(squad)?.[0] || '') &&
      (candidate.startsWith(key) || candidate.endsWith(key) || key.startsWith(candidate) || key.endsWith(candidate))) ? 1 : 0;
  }

  function normalizeFixture(row) {
    const kickoff = Date.parse(`${row.matchDate}T${row.matchTime}+08:00`);
    const home = row.homeTeamAbbName || row.homeTeamAllName;
    const away = row.awayTeamAbbName || row.awayTeamAllName;
    if (!row.matchId || !Number.isFinite(kickoff) || !home || !away) return null;
    return {
      id: String(row.matchId),
      code: row.matchNumStr || '',
      league: row.leagueAbbName || row.leagueAllName || '',
      home,
      away,
      kickoff: new Date(kickoff).toISOString(),
      homeKeys: [home, row.homeTeamAllName].map(teamKey).filter(Boolean),
      awayKeys: [away, row.awayTeamAllName].map(teamKey).filter(Boolean),
      postponed: /cancel|postpon|延期|取消/i.test(`${row.matchStatus} ${row.matchStatusName || ''}`),
    };
  }

  function selectScore(fixture, scores) {
    const kickoff = Date.parse(fixture.kickoff);
    const choices = [];
    for (const row of scores) {
      const offset = Math.abs(Date.parse(row.kickoff) - kickoff);
      if (!(offset <= halfHour)) continue;
      if (fixture.league === '美职篮' && row.league !== 'NBA') continue;
      const leagueAlias = name => fixture.league === '欧篮联' && row.league === 'EURO' && name === '里昂' ? '阿斯维尔' : name;
      const homeTeam = leagueAlias(row.home);
      const awayTeam = leagueAlias(row.away);

      const home = nameQuality(fixture.homeKeys, homeTeam);
      const away = nameQuality(fixture.awayKeys, awayTeam);
      const reversedHome = nameQuality(fixture.homeKeys, awayTeam);
      const reversedAway = nameQuality(fixture.awayKeys, homeTeam);
      const straight = home && away ? home + away : 0;
      const reverse = reversedHome && reversedAway ? reversedHome + reversedAway : 0;
      // Both team names are required, and matching a pair in both directions is ambiguous.
      if (straight === reverse) continue;
      choices.push({ row, flipped: reverse > straight, quality: Math.max(straight, reverse), offset });
    }
    choices.sort((a, b) => b.quality - a.quality || a.offset - b.offset);
    const [best, next] = choices;
    if (!best || (next && next.quality === best.quality && next.offset === best.offset)) return null;
    return best;
  }

  async function requestSchedule(sport) {
    const url = `https://webapi.sporttery.cn/gateway/uniform/${sport}/getMatchListV1.qry?clientCode=3001`;
    const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('体彩赛程暂时无法读取');
    const payload = await response.json();
    const groups = payload.value?.matchInfoList;
    if (!payload.success || (!Array.isArray(groups) && !payload.emptyFlag)) throw new Error('体彩赛程暂时不可用');
    return {
      updatedAt: new Date().toISOString(),
      groups: groups || [],
    };
  }

  function cachedSchedule(sport) {
    const cached = schedules.get(sport);
    if (cached && Date.now() - cached.since < 60_000) return cached.result;
    const request = { since: Date.now(), result: requestSchedule(sport) };
    schedules.set(sport, request);
    request.result.catch(() => {
      if (schedules.get(sport) === request) schedules.delete(sport);
    });
    return request.result;
  }

  function storageKey(sport) {
    return `agent-kang-sports-fixtures-v1-${sport}`;
  }

  function readSavedSchedule(sport) {
    if (savedSchedules.has(sport)) return savedSchedules.get(sport);
    const dates = new Map();
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(sport)) || '{}');
      for (const [date, fixtureDay] of Object.entries(saved)) {
        if (datePattern.test(date) && Array.isArray(fixtureDay?.rows)) dates.set(date, fixtureDay);
      }
    } catch {
      // The board remains usable with in-memory fixtures if storage is restricted.
    }
    savedSchedules.set(sport, dates);
    return dates;
  }

  function rememberSchedule(sport, schedule) {
    const dates = readSavedSchedule(sport);
    const recent = calendar.format(new Date(Date.now() - 3 * 86_400_000));
    const upcoming = calendar.format(new Date(Date.now() + 7 * 86_400_000));
    const freshDays = new Map();
    for (const group of schedule.groups) {
      const date = group.businessDate;
      if (!datePattern.test(date) || date < recent || date > upcoming) continue;
      const rows = new Map((dates.get(date)?.rows || []).map(row => [row.id, row]));
      const fresh = new Set();
      for (const record of group.subMatchList || []) {
        const fixture = normalizeFixture(record);
        if (!fixture) continue;
        fresh.add(fixture.id);
        rows.set(fixture.id, fixture);
      }
      freshDays.set(date, fresh);
      dates.set(date, { rows: [...rows.values()], updatedAt: schedule.updatedAt });
    }
    for (const date of dates.keys()) {
      if (date < recent || date > upcoming) dates.delete(date);
    }
    try {
      localStorage.setItem(storageKey(sport), JSON.stringify(Object.fromEntries(dates)));
    } catch {
      // Keep the in-memory copy for the current visit.
    }
    return freshDays;
  }

  async function loadSchedule(sport, date) {
    const schedule = await cachedSchedule(sport).catch(() => null);
    const freshDays = schedule ? rememberSchedule(sport, schedule) : new Map();
    const saved = readSavedSchedule(sport).get(date);
    if (!schedule && !saved) throw new Error('体彩赛程暂时不可用');
    const fresh = freshDays.get(date);
    const fixtures = (saved?.rows || []).slice()
      .sort((first, second) => first.code.localeCompare(second.code, 'zh-CN') || first.kickoff.localeCompare(second.kickoff));
    return {
      fixtures,
      scheduleUpdatedAt: saved?.updatedAt || schedule?.updatedAt,
      scheduleCached: Boolean(fixtures.length && fixtures.some(fixture => !fresh?.has(fixture.id))),
      historyUnavailable: !fixtures.length && date < calendar.format(new Date()),
    };
  }

  function requestScores(sport, dates) {
    return new Promise(resolve => {
      const frame = document.createElement('iframe');
      const url = new URL(feedPage);
      url.search = new URLSearchParams({ sport, dates: dates.join(',') });
      frame.title = '7M 比分数据';
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.hidden = true;
      frame.src = url.href;

      function complete(result) {
        clearTimeout(timeout);
        window.removeEventListener('message', receive);
        frame.remove();
        resolve(result);
      }

      function receive(event) {
        if (event.source !== frame.contentWindow || event.origin !== 'null' ||
          event.data?.type !== 'agent-kang-scores' || !Array.isArray(event.data.matches)) return;
        complete({ matches: event.data.matches, ok: event.data.ok === true });
      }

      const timeout = setTimeout(() => complete({ matches: [], ok: false }), 8500);
      window.addEventListener('message', receive);
      document.body.append(frame);
    });
  }

  function mergeFixture(row, matched, now) {
    const { homeKeys, awayKeys, postponed, ...fixture } = row;
    const score = matched?.row;
    const providerHasScore = Number.isInteger(score?.homeScore) && Number.isInteger(score?.awayScore);
    if (postponed || !score) {
      const state = postponed ? 'postponed' : Date.parse(fixture.kickoff) <= now ? 'unknown' : 'scheduled';
      return {
        ...fixture, state,
        homeScore: null, awayScore: null,
        detail: state === 'unknown' ? '待同步比分' : '',
        scoreSource: null,
      };
    }
    return {
      ...fixture,
      state: score.state,
      homeScore: matched.flipped ? score.awayScore : score.homeScore,
      awayScore: matched.flipped ? score.homeScore : score.awayScore,
      detail: score.detail,
      scoreSource: providerHasScore ? '7M' : null,
    };
  }

  async function load(sport, date, onSchedule) {
    if (!sports.has(sport) || !datePattern.test(date)) throw new Error('赛程筛选无效');
    const { fixtures, ...schedule } = await loadSchedule(sport, date);
    const now = Date.now();
    if (!fixtures.length) {
      return { ...schedule, matches: [], scoresUpdatedAt: null, scoresOk: null, scoreMatches: 0 };
    }
    onSchedule?.({
      ...schedule,
      matches: fixtures.map(row => mergeFixture(row, null, now)),
      scoresUpdatedAt: null, scoresOk: null, scoreMatches: 0,
    });

    const days = [...new Set(fixtures.map(row => calendar.format(new Date(row.kickoff))))];
    const scores = await requestScores(sport, days);
    const known = new Map(scores.matches.map(row => [row.id, row]));
    const candidates = [...known.values()];
    const paired = fixtures.map(row => selectScore(row, candidates));
    const matches = fixtures.map((row, index) => mergeFixture(row, paired[index], now));
    const scoreMatches = paired.filter(Boolean).length;
    return {
      ...schedule,
      matches,
      scoresUpdatedAt: scores.ok && scoreMatches ? new Date().toISOString() : null,
      scoresOk: scores.ok,
      scoreMatches,
    };
  }

  window.sportsData = { load };
})();
