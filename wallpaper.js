(() => {
  const wallpaper = document.getElementById('wallpaper');
  if (!wallpaper) return;

  const playback = document.getElementById('playback');
  const label = document.getElementById('playback-label');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function updatePlayback() {
    const failed = wallpaper.error !== null;
    const playing = !failed && !wallpaper.paused;
    playback.disabled = failed;
    playback.toggleAttribute('data-playing', playing);
    label.textContent = failed ? '背景无法播放' : playing ? '暂停背景' : '播放背景';
  }

  function playWallpaper() {
    if (!wallpaper.hasAttribute('src')) wallpaper.src = wallpaper.dataset.videoSrc;
    wallpaper.play().catch(updatePlayback);
  }

  wallpaper.addEventListener('play', updatePlayback);
  wallpaper.addEventListener('pause', updatePlayback);
  wallpaper.addEventListener('error', updatePlayback);
  playback.addEventListener('click', () => {
    if (wallpaper.paused) playWallpaper();
    else wallpaper.pause();
  });
  reduceMotion.addEventListener('change', event => {
    if (event.matches) wallpaper.pause();
  });

  updatePlayback();
  window.addEventListener('load', () => {
    // Let the first screen paint before the video competes for bandwidth.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!reduceMotion.matches && !wallpaper.hasAttribute('src')) playWallpaper();
    }));
  }, { once: true });
})();
