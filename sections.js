const byId = id => document.getElementById(id);
const page = document.body.dataset.page;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function externalLink(url, className, title) {
  const link = element('a', className);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.append(element('strong', '', title));
  return link;
}

const posts = [
  {
    id: 'welcome', featured: true,
    title: '从这里开始', category: '站点笔记',
    summary: '让日常用到的入口和想留下的记录，都能从同一个首页找到。',
    paragraphs: [
      'Agent-Kang 有六个入口。博客写工作笔记，网盘和网址集留下常用资料与链接，音乐用来播放本地歌单，体育和今日热榜汇集常看的内容。',
      '接下来想把零散的小经验整理成短文。每篇尽量只讲清一件事，给后来遇到同样问题的人留一条可照着走的路径。',
    ],
  },
  {
    id: 'reconciliation',
    title: '对账时，把需要人工确认的记录留下来', category: '工具实践',
    summary: '自动匹配能省掉重复核对，导出仍要保留复核所需的原始信息。',
    paragraphs: [
      '对账工作台先读取银行流水和日记账，再尝试匹配往来记录。日期和金额对上时，可以让程序处理规则明确的部分。有差异的记录会集中展示，交给人确认。',
      '导出时保留原表和公式，把待复核明细追加在底部。回查一笔差异时，仍能顺着原表找到它的位置。',
    ],
  },
  {
    id: 'inventory-reminders',
    title: '让库存提醒可以直接回写', category: '工具实践',
    summary: '从同步飞书表格到确认发货，把操作留在提醒出现的地方。',
    paragraphs: [
      '库存流程先由影刀同步记录，再发送飞书提醒。收到提醒的人点击卡片上的“已发货”，监听程序就把发货状态写回表格。',
      '这个流程的重点是让负责发货的人少打开一张表，同时保留可查询的状态记录。',
    ],
  },
];

function setupBlog() {
  const search = byId('blog-search');
  const filter = byId('blog-filter');
  const list = byId('blog-posts');
  const count = byId('blog-count');
  const empty = byId('blog-empty');
  const dialog = byId('article-dialog');
  const heading = byId('article-title');

  const articleHash = post => '#article-' + post.id;
  const currentPost = () => posts.find(post => articleHash(post) === location.hash);
  const normalizeSearch = value => value.normalize('NFKC').toLowerCase();

  function syncReader() {
    const post = currentPost();
    if (!post) {
      if (dialog.open) dialog.close();
      return;
    }

    if (dialog.open && dialog.dataset.articleId === post.id) return;
    dialog.dataset.articleId = post.id;
    heading.textContent = post.title;
    byId('article-category').textContent = post.category;
    byId('article-copy').replaceChildren(...post.paragraphs.map(text => element('p', '', text)));
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    heading.focus({ preventScroll: true });
  }

  function render() {
    const term = normalizeSearch(search.value.trim());
    const visible = posts.filter(post =>
      (!filter.value || post.category === filter.value) &&
      [post.title, post.summary, post.category, ...post.paragraphs].some(text => normalizeSearch(text).includes(term))
    );
    list.replaceChildren(...visible.map(post => {
      const article = element('article', 'blog-card');
      const link = element('a', 'blog-card-link');
      const title = element('h3', '', post.title);
      const summary = element('p', 'blog-card-summary', post.summary);
      const featured = post.featured && visible.length >= 3;
      article.classList.toggle('blog-card-featured', Boolean(featured));
      title.id = 'blog-title-' + post.id;
      summary.id = 'blog-summary-' + post.id;
      link.href = articleHash(post);
      link.setAttribute('aria-labelledby', title.id);
      link.setAttribute('aria-describedby', summary.id);
      link.append(element('p', 'blog-category', post.category), title, summary);
      if (featured) link.append(element('span', 'blog-read-label', '阅读全文'));
      link.addEventListener('click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        link.focus({ preventScroll: true });
        history.pushState({ blogArticleId: post.id }, '', link.hash);
        syncReader();
      });
      article.append(link);
      return article;
    }));
    empty.hidden = visible.length > 0;
    const message = visible.length + ' 篇文章';
    if (count.textContent !== message) count.textContent = message;
  }

  search.addEventListener('input', render);
  filter.addEventListener('change', render);
  byId('blog-reset').addEventListener('click', () => {
    search.value = '';
    filter.value = '';
    search.focus();
    render();
  });
  window.addEventListener('hashchange', syncReader);
  dialog.addEventListener('close', () => {
    const post = currentPost();
    if (!post || dialog.open) return;
    if (history.state?.blogArticleId === post.id) {
      history.back();
    } else {
      history.replaceState(history.state, '', location.href.split('#')[0]);
      byId('posts-title').focus({ preventScroll: true });
    }
  });
  render();
  syncReader();
}

const starterLinks = [
  { title: 'GitHub', url: 'https://github.com/', category: '开发' },
  { title: '哔哩哔哩', url: 'https://www.bilibili.com/', category: '影音' },
  { title: '央视网', url: 'https://www.cctv.com/', category: '资讯' },
];

function webAddress(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function setupCatalog(id) {
  const search = byId(id + '-search');
  const filter = byId(id + '-filter');
  const list = byId(id + '-items');
  const status = byId(id + '-status');
  const dialog = byId(id + '-form-dialog');
  const form = byId(id + '-form');
  const error = byId(id + '-form-error');
  const categories = [...form.elements.category.options].map(option => option.value);
  const isDrive = id === 'drive';
  const type = isDrive ? '资源' : '网址';
  const key = 'agent-kang-' + id + '-v1';
  let storageAvailable = true;
  let entries = [];

  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(stored)) {
      entries = stored.filter(item =>
        item && typeof item.title === 'string' && typeof item.url === 'string' &&
        categories.includes(item.category) && webAddress(item.url)
      );
    }
  } catch {
    storageAvailable = false;
  }

  function commit(next) {
    if (storageAvailable) {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        storageAvailable = false;
      }
    }
    entries = next;
  }

  function render() {
    const term = search.value.trim().toLowerCase();
    const all = isDrive ? entries : [...entries, ...starterLinks.map(item => ({...item, example: true}))];
    const visible = all.filter(item =>
      (!filter.value || item.category === filter.value) &&
      [item.title, item.url, item.category].some(text => text.toLowerCase().includes(term))
    );
    list.replaceChildren(...visible.map(item => {
      const card = element('article', isDrive ? 'resource' : 'bookmark');
      const link = externalLink(item.url, 'saved-link', item.title);
      link.append(element('span', 'link-meta', item.category + ' · ' + new URL(item.url).hostname));
      card.append(link);
      if (!item.example) {
        const remove = element('button', 'remove-link', '移除');
        remove.type = 'button';
        remove.setAttribute('aria-label', '移除' + item.title);
        remove.addEventListener('click', () => {
          if (!window.confirm('从列表中移除“' + item.title + '”？')) return;
          commit(entries.filter(entry => entry !== item));
          render();
          byId(id + '-add').focus();
        });
        card.append(remove);
      }
      return card;
    }));

    const base = visible.length
      ? visible.length + ' 个' + type + (visible.some(item => item.example) ? '，含示例网址' : '')
      : all.length ? '没有找到符合条件的' + type + '。' : '还没有资源。可以添加网盘分享链接。';
    status.textContent = storageAvailable ? base : base + ' 当前浏览器仅能在本次打开期间保留更改。';
  }

  search.addEventListener('input', render);
  filter.addEventListener('change', render);
  byId(id + '-add').addEventListener('click', () => {
    form.reset();
    error.textContent = '';
    dialog.showModal();
  });
  byId(id + '-cancel').addEventListener('click', () => dialog.close());

  form.addEventListener('submit', event => {
    event.preventDefault();
    const title = form.elements.title.value.trim();
    const url = webAddress(form.elements.url.value.trim());
    const category = form.elements.category.value;
    if (!title || !url || !categories.includes(category)) {
      error.textContent = '请填写名称和有效的 http 或 https 地址。';
      return;
    }
    commit([{ title, url: url.href, category }, ...entries]);
    search.value = '';
    filter.value = '';
    dialog.close();
    render();
  });

  render();
}

function setupMusic() {
  const audio = byId('audio');
  const player = audio.closest('.player');
  const queue = byId('queue-list');
  const status = byId('player-status');
  const filesInput = byId('music-files');
  let tracks = [];
  let activeTrack = 0;
  let audioUrl;

  function showTrack(index, autoplay = false) {
    const track = tracks[index];
    if (!track) return;

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    activeTrack = index;
    const trackUrl = URL.createObjectURL(track);
    audioUrl = trackUrl;
    audio.src = trackUrl;
    audio.hidden = false;
    byId('track-title').textContent = track.name.replace(/\.[^.]+$/, '');
    byId('transport').hidden = tracks.length < 2;
    status.textContent = '';
    for (const [position, item] of [...queue.children].entries()) {
      item.firstElementChild.setAttribute('aria-current', position === index ? 'true' : 'false');
    }
    if (autoplay) {
      audio.play().catch(() => {
        if (audio.src === trackUrl && !audio.error) status.textContent = '请按播放器上的播放键开始。';
      });
    }
  }

  function switchTrack(offset) {
    const index = (activeTrack + offset + tracks.length) % tracks.length;
    showTrack(index, true);
  }

  function importTracks() {
    const newTracks = Array.from(filesInput.files);
    if (!newTracks.length) return;
    tracks = newTracks;
    queue.replaceChildren(...tracks.map((track, index) => {
      const item = element('li');
      const button = element('button', 'track-link', track.name);
      button.type = 'button';
      button.addEventListener('click', () => showTrack(index, true));
      item.append(button);
      return item;
    }));
    byId('queue-empty').hidden = true;
    showTrack(0);
  }

  filesInput.addEventListener('change', importTracks);
  byId('prev-track').addEventListener('click', () => switchTrack(-1));
  byId('next-track').addEventListener('click', () => switchTrack(1));
  audio.addEventListener('ended', () => {
    if (activeTrack + 1 < tracks.length) showTrack(activeTrack + 1, true);
  });
  audio.addEventListener('playing', () => {
    player.setAttribute('data-playing', '');
    status.textContent = '';
  });
  for (const event of ['pause', 'ended', 'emptied', 'waiting', 'error']) {
    audio.addEventListener(event, () => player.removeAttribute('data-playing'));
  }
  audio.addEventListener('error', () => { status.textContent = '无法播放此文件。请尝试 MP3 或 WAV 格式。'; });
}

const sampleScores = [
  { sport: '足球', home: '海岸队', away: '山谷队', score: '2 : 1', state: '已结束' },
  { sport: '篮球', home: '星光队', away: '雷鸣队', score: '98 : 94', state: '已结束' },
];

function setupSports() {
  const select = byId('score-filter');
  const list = byId('scores');

  function render() {
    const scores = sampleScores.filter(match => !select.value || match.sport === select.value);
    list.replaceChildren(...scores.map(match => {
      const row = element('article', 'score-row');
      const meta = element('p', 'score-meta', match.sport + ' · ' + match.state);
      const result = element('p', 'score-result');
      result.append(element('span', '', match.home), element('strong', '', match.score), element('span', '', match.away));
      row.append(meta, result);
      return row;
    }));
  }

  select.addEventListener('change', render);
  render();
}

const trendSources = [
  { title: '微博热搜', url: 'https://s.weibo.com/top/summary', items: [] },
  { title: '知乎热榜', url: 'https://www.zhihu.com/hot', items: [] },
  { title: '哔哩哔哩热门', url: 'https://www.bilibili.com/v/popular/all/', items: [] },
];

function setupTrending() {
  byId('trend-sources').replaceChildren(...trendSources.map(source => {
    const board = element('article', 'trend-source');
    const heading = element('h3');
    const sourceLink = externalLink(source.url, 'trend-original', source.title);
    sourceLink.append(element('span', 'helper', '查看原榜'));
    heading.append(sourceLink);
    board.append(heading);

    if (source.items.length) {
      const list = element('ol', 'rank-list');
      for (const item of source.items) {
        const row = element('li');
        row.append(externalLink(item.url, 'rank-link', item.title));
        list.append(row);
      }
      board.append(list);
    } else {
      board.append(element('p', 'helper rank-empty', '榜单待接入'));
    }
    return board;
  }));
}

const startup = {
  blog: setupBlog,
  drive: () => setupCatalog('drive'),
  music: setupMusic,
  sports: setupSports,
  links: () => setupCatalog('links'),
  trending: setupTrending,
};
startup[page]();
