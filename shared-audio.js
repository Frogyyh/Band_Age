const audio = document.querySelector('#siteMusic');
const toggle = document.querySelector('.music-toggle');
const TIME_KEY = 'band_age_music_time';
const ENABLED_KEY = 'band_age_music_enabled';
const enabled = localStorage.getItem(ENABLED_KEY) !== 'false';

audio.volume = 0.38;
audio.muted = !enabled;

const useIcon = toggle.dataset.style === 'icon';

if (useIcon) {
  toggle.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 9v6h4l5 5V4L8 9H4z"></path>
  <path class="wave" d="M16.3 8.3a5.2 5.2 0 0 1 0 7.4"></path>
  <path class="wave" d="M19 5.6a9 9 0 0 1 0 12.8"></path>
  <path class="mute-x" d="M16.5 9.5l5 5M21.5 9.5l-5 5"></path>
</svg>`;
}

function updateButton() {
  if (useIcon) {
    const on = !audio.muted;
    toggle.classList.toggle('is-muted', !on);
    toggle.setAttribute('aria-pressed', String(on));
    return;
  }
  const playing = !audio.paused && !audio.muted;
  toggle.textContent = playing ? 'MUSIC ON' : (audio.muted ? 'MUSIC OFF' : 'PLAY MUSIC');
  toggle.setAttribute('aria-pressed', String(playing));
}

function restoreTime() {
  const savedTime = Number(sessionStorage.getItem(TIME_KEY));
  if (Number.isFinite(savedTime) && savedTime >= 0 && audio.duration) {
    audio.currentTime = savedTime % audio.duration;
  }
}

async function startAudio() {
  if (audio.muted) return;
  try {
    await audio.play();
  } catch {
    // Sound autoplay may be blocked until the first user gesture.
  }
  updateButton();
}

audio.addEventListener('loadedmetadata', () => {
  restoreTime();
  startAudio();
}, { once: true });

audio.addEventListener('timeupdate', () => {
  sessionStorage.setItem(TIME_KEY, String(audio.currentTime));
});

window.addEventListener('pagehide', () => {
  sessionStorage.setItem(TIME_KEY, String(audio.currentTime));
});

async function unlockAudio() {
  await startAudio();
  document.removeEventListener('pointerdown', unlockAudio);
  document.removeEventListener('keydown', unlockAudio);
}

document.addEventListener('pointerdown', unlockAudio);
document.addEventListener('keydown', unlockAudio);

toggle.addEventListener('click', async (event) => {
  event.stopPropagation();
  if (audio.paused || audio.muted) {
    audio.muted = false;
    await startAudio();
  } else {
    audio.muted = true;
    audio.pause();
  }
  localStorage.setItem(ENABLED_KEY, String(!audio.muted));
  updateButton();
});

updateButton();
startAudio();
