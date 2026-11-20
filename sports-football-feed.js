(() => {
  const fixturesUrl = 'https://ctc-live.7m.com.cn/datafile/fgb2.js';
  const scoresUrl = 'https://js-live.7m.com.cn/livedts/csxl.js';
  const changesUrl = 'https://js-live.7m.com.cn/livedts/sxl.js';
  const statuses = {
    0: ['scheduled', '未开赛'],
    1: ['live', '上半场'],
    2: ['live', '中场休息'],
    3: ['live', '下半场'],
    4: ['final', '完场'],
    5: ['postponed', '比赛中断'],
    6: ['postponed', '已取消'],
    7: ['live', '加时赛'],
    8: ['live', '加时赛'],
    9: ['live', '加时赛'],
    10: ['final', '完场'],
    11: ['live', '点球大战'],
    12: ['final', '完场'],
    13: ['postponed', '比赛延期'],
    14: ['postponed', '比赛腰斩'],
    15: ['unknown', '赛况待定'],
    16: ['final', '完场'],
    17: ['scheduled', '未开赛'],
    18: ['live', '加时赛上半场'],
    19: ['live', '加时赛中场'],
    20: ['live', '加时赛下半场'],
  };

  function kickoffDate(value) {
    if (typeof value !== 'string' || !/^\d{4}(?:,\d{1,2}){5}$/.test(value)) return null;
    const [year, month, day, hours, minutes, seconds] = value.split(',').map(part => part.padStart(2, '0'));
    const localDate = `${year}-${month}-${day}`;
    const instant = new Date(`${localDate}T${hours}:${minutes}:${seconds}+08:00`);
    return Number.isFinite(instant.getTime()) ? { localDate, iso: instant.toISOString() } : null;
  }

  function asScore(value) {
    if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value))) return null;
    const score = Number(value);
    return Number.isSafeInteger(score) ? score : null;
  }

  async function applyLatestChange(requestScript, timestamp) {
    window.sxl = null;
    try {
      await requestScript(`${changesUrl}?c=${timestamp}`);
    } catch {
      return;
    }
    const changes = window.sxl;
    const sequence = Number(changes?.fn);
    const snapshotSequence = Number(window.GetFlagNum);
    // The snapshot is sufficient if the change file has moved beyond its next sequence.
    if (!Array.isArray(changes?.c) || !Number.isSafeInteger(sequence)
        || !Number.isSafeInteger(snapshotSequence) || sequence < snapshotSequence || sequence > snapshotSequence + 1) return;
    for (const row of changes.c) {
      if (!Array.isArray(row) || !/^\d+$/.test(String(row[0])) || !Array.isArray(window.sDt2[row[0]])) continue;
      const snapshot = window.sDt2[row[0]];
      if (Number.isInteger(Number(row[1])) && row[1] !== '') snapshot[0] = row[1];
      if (asScore(row[2]) !== null) snapshot[1] = row[2];
      if (asScore(row[3]) !== null) snapshot[2] = row[3];
      if (kickoffDate(row[9])) snapshot[8] = row[9];
      if (Number.isInteger(Number(row[18])) && row[18] !== '') snapshot[19] = row[18];
    }
  }

  window.footballFeed = async function footballFeed(dates, requestScript) {
    const wantedDates = new Set(dates);
    if (!wantedDates.size) return { matches: [], ok: true };
    window.sDt = [];
    window.sDt2 = [];
    window.GetFlagNum = undefined;
    const timestamp = Math.floor(Date.now() / 15000) * 15;
    const snapshots = await Promise.allSettled([
      requestScript(`${fixturesUrl}?nocache=${timestamp}`),
      requestScript(`${scoresUrl}?nocache=${timestamp}`),
    ]);
    if (snapshots.some(result => result.status === 'rejected')
        || !Array.isArray(window.sDt) || !Array.isArray(window.sDt2) || !Number.isSafeInteger(window.GetFlagNum)) {
      return { matches: [], ok: false };
    }
    await applyLatestChange(requestScript, timestamp);
    const matches = [];
    for (const [id, fixture] of Object.entries(window.sDt)) {
      const score = window.sDt2[id];
      if (!/^\d+$/.test(id) || !Array.isArray(fixture) || !Array.isArray(score)
          || !fixture[2] || !fixture[3]) continue;
      const kickoff = kickoffDate(score[8]);
      if (!kickoff || !wantedDates.has(kickoff.localDate)) continue;
      const code = asScore(score[0]);
      const status = statuses[code] || ['unknown', '赛况待定'];
      const period = asScore(score[19]);
      const extraTime = code === 8 && period >= 18 && period <= 20 && statuses[period];
      const [state, detail] = extraTime || status;
      const showScore = state === 'live' || state === 'final';
      matches.push({
        id,
        kickoff: kickoff.iso,
        home: String(fixture[2]),
        away: String(fixture[3]),
        league: String(fixture[0] || ''),
        state,
        homeScore: showScore ? asScore(score[1]) : null,
        awayScore: showScore ? asScore(score[2]) : null,
        detail,
      });
    }
    return { matches, ok: true };
  };
})();
