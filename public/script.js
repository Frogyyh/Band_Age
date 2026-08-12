let previewAudio = null;

// 로비 트랙 미리듣기 중에는 배경음을 잠깐 꺼둔다. 미리듣기를 시작하기 전
// 배경음이 원래 켜져 있었는지(muted) 기억해뒀다가, 멈추면 그 상태로 되돌린다.
let siteMusicMuteOverride = null;

function getSiteMusicEls(){
  return {
    audio: document.getElementById('siteMusic'),
    toggle: document.querySelector('.music-toggle[data-style="icon"]'),
  };
}

function muteSiteMusicForPreview(){
  const { audio, toggle } = getSiteMusicEls();
  if(!audio) return;
  if(siteMusicMuteOverride === null){
    siteMusicMuteOverride = audio.muted;
  }
  audio.muted = true;
  audio.pause();
  if(toggle){
    toggle.classList.add('is-muted');
    toggle.setAttribute('aria-pressed', 'false');
  }
}

function restoreSiteMusicAfterPreview(){
  if(siteMusicMuteOverride === null) return;
  const wasMuted = siteMusicMuteOverride;
  siteMusicMuteOverride = null;
  const { audio, toggle } = getSiteMusicEls();
  if(!audio) return;
  audio.muted = wasMuted;
  if(!wasMuted){
    audio.play().catch(() => {});
  }
  if(toggle){
    toggle.classList.toggle('is-muted', wasMuted);
    toggle.setAttribute('aria-pressed', String(!wasMuted));
  }
}

function previewTrack(el){
  const wasPlaying = el.classList.contains('playing');
  document.querySelectorAll('.track').forEach(t=>{
    t.classList.remove('playing');
    t.querySelector('.play-btn').textContent = '▷';
  });
  if(previewAudio){
    previewAudio.pause();
    previewAudio = null;
  }
  if(wasPlaying){
    restoreSiteMusicAfterPreview();
    return;
  }

  el.classList.add('playing');
  el.querySelector('.play-btn').textContent = '❚❚';
  const trackName = el.querySelector('.track-name').textContent.trim();
  const audioSrc = el.dataset.audioSrc;

  muteSiteMusicForPreview();

  if(audioSrc){
    previewAudio = new Audio(audioSrc);
    previewAudio.addEventListener('ended', () => {
      el.classList.remove('playing');
      el.querySelector('.play-btn').textContent = '▷';
      previewAudio = null;
      restoreSiteMusicAfterPreview();
    });
    previewAudio.play();
    showToast('▶ ' + trackName + ' 재생 중');
  } else {
    showToast('▶ ' + trackName + ' 재생 중 (데모)');
  }
}

/* ---------- 무대 시작용 음원 선택 ---------- */
let selectedTrackEl = null;
let mySongFile = null;

function selectTrack(el){
  if(selectedTrackEl === el){
    el.classList.remove('selected');
    selectedTrackEl = null;
    return;
  }
  if(selectedTrackEl){
    selectedTrackEl.classList.remove('selected');
  }
  el.classList.add('selected');
  selectedTrackEl = el;
}

function setMySongFile(file){
  mySongFile = file;
  const filenameEl = document.getElementById('mySongFilename');
  filenameEl.textContent = file.name;
  filenameEl.style.display = '';
  document.getElementById('mySongUploadBtn').style.display = 'none';
  document.getElementById('mySongCancelBtn').style.display = '';
  showToast('"' + file.name + '" MY SONG에 업로드됨');
}

function cancelMySongUpload(){
  mySongFile = null;
  document.getElementById('fileInput').value = '';
  const filenameEl = document.getElementById('mySongFilename');
  filenameEl.textContent = '';
  filenameEl.style.display = 'none';
  document.getElementById('mySongUploadBtn').style.display = '';
  document.getElementById('mySongCancelBtn').style.display = 'none';
}

function startStage(){
  const count = (selectedTrackEl ? 1 : 0) + (mySongFile ? 1 : 0);
  if(count === 0){
    showToast('MY SONG 업로드 또는 트랙 선택 중 하나로 음원을 골라주세요.');
    return;
  }
  if(count > 1){
    showToast('음원은 하나만 선택해주세요 (트랙 선택 또는 MY SONG 업로드 중 하나만).');
    return;
  }
  showLoading();
}

function triggerCustomUpload(){
  if(!currentUser){
    showToast('커스텀 트랙 업로드는 로그인 후 이용할 수 있어요.');
    openModal('login');
    return;
  }
  document.getElementById('customFileInput').click();
}

function formatDuration(seconds){
  if(!isFinite(seconds) || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

let pendingCustomFile = null;

function openCustomTrackNameModal(file){
  pendingCustomFile = file;
  document.getElementById('customTrackNameInput').value = file.name.replace(/\.[^/.]+$/, '');
  document.getElementById('customTrackNameError').style.display = 'none';
  document.getElementById('customTrackNameOverlay').classList.add('show');
}

function closeCustomTrackNameModal(){
  document.getElementById('customTrackNameOverlay').classList.remove('show');
  pendingCustomFile = null;
}

function submitCustomTrackName(){
  const name = document.getElementById('customTrackNameInput').value.trim();
  const errorBox = document.getElementById('customTrackNameError');
  if(!name){
    errorBox.textContent = '트랙 이름을 입력하세요.';
    errorBox.style.display = '';
    return;
  }
  if(!pendingCustomFile) return;
  handleSongUpload(pendingCustomFile, name);
  document.getElementById('customTrackNameOverlay').classList.remove('show');
  pendingCustomFile = null;
}

function readAudioDuration(file){
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(audio.duration) ? audio.duration : null);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    audio.src = url;
  });
}

function renderCustomTracks(songs, containerId = 'customTrackList', scope = 'all'){
  const container = document.getElementById(containerId);
  if(!container) return;
  if(scope === 'mine' && !currentUser){
    container.innerHTML = '<div class="track-empty">로그인 후 이용할 수 있어요.</div>';
    return;
  }
  if(!songs.length){
    container.innerHTML = `<div class="track-empty">${scope === 'mine' ? '업로드한 트랙이 없어요.' : '아직 커스텀 트랙이 없어요.'}</div>`;
    return;
  }
  container.innerHTML = songs.map((song) => {
    const isOwner = currentUser && String(song.uploader) === String(currentUser.id);
    const audioSrc = API_ORIGIN + song.fileUrl;
    return `
    <div class="track" onclick="selectTrack(this)" data-audio-src="${escapeHtml(audioSrc)}">
      <span class="track-name">${escapeHtml(song.title)}</span>
      <span class="track-uploader">${escapeHtml(song.uploaderNickname || '')}</span>
      <span class="track-time">${formatDuration(song.duration)}</span>
      <button class="like-btn" onclick="toggleLike(event, this)" data-likes="0">
        <span class="like-icon">♥</span><span class="like-count">0</span>
      </button>
      <button class="play-btn" onclick="event.stopPropagation(); previewTrack(this.parentElement)">▷</button>
      ${isOwner ? `<button class="track-delete-btn" onclick="event.stopPropagation(); deleteSong('${song._id}')" aria-label="삭제">✕</button>` : ''}
    </div>
  `;
  }).join('');
  sortCustomListByLikes();
}

async function loadAllCustomSongs(){
  const container = document.getElementById('customTrackList');
  if(!container) return;
  try{
    const res = await fetch(API_BASE + '/songs');
    if(!res.ok){
      renderCustomTracks([]);
      return;
    }
    renderCustomTracks(await res.json());
  } catch(err){
    container.innerHTML = '<div class="track-empty">불러올 수 없어요.</div>';
  }
}

async function deleteSong(id){
  if(!confirm('이 트랙을 삭제하시겠어요?')) return;
  const token = localStorage.getItem('band_age_token');
  try{
    const res = await fetch(API_BASE + '/songs/' + id, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok){
      showToast(data.message || '삭제하지 못했습니다.');
      return;
    }
    showToast('트랙이 삭제되었습니다.');
    loadAllCustomSongs();
    loadMyPageSongs();
  } catch(err){
    showToast('서버에 연결할 수 없습니다.');
  }
}

async function handleSongUpload(file, title){
  if(!currentUser){
    showToast('로그인 후 업로드할 수 있어요.');
    openModal('login');
    return;
  }
  const token = localStorage.getItem('band_age_token');
  const duration = await readAudioDuration(file);
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', (title && title.trim()) || file.name.replace(/\.[^/.]+$/, ''));
  if(duration) formData.append('duration', String(Math.round(duration)));

  showToast('"' + file.name + '" 업로드 중...');
  try{
    const res = await fetch(API_BASE + '/songs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if(!res.ok){
      showToast(data.message || '업로드에 실패했습니다.');
      return;
    }
    showToast('"' + data.title + '" 업로드 완료!');
    loadAllCustomSongs();
    loadMyPageSongs();
  } catch(err){
    showToast('서버에 연결할 수 없습니다.');
  }
}

function toggleVideo(){
  const box = document.getElementById('videoBox');
  box.classList.toggle('on');
  if(box.classList.contains('on')) showToast('데모 영상 재생 (실제 영상은 업로드 후 연결)');
}

function triggerUpload(){ document.getElementById('fileInput').click(); }

let toastTimer;
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 2600);
}

/* ---------- 로딩 화면 ---------- */
const LOADING_STEPS = [10, 34, 58, 76, 92, 100];
const LOADING_STEP_MS = 420;
let loadingTimers = [];

const LOADING_TMI = [
  '시작 페이지를 유심히 보시면 무슨 AI로 만들었는지 아실 수 있을 거예요..',
  'DJ 모션은 피아노 모션을 변형한 동작입니다.',
  '저희 팀은 03, 04, 05, 06으로 구성되어 있습니다.',
  '저희 팀 혈액형 구성은 B형 3명, A형 1명입니다.',
  '기타는 같은 음이라도 줄을 누르는 위치와 연주 방법에 따라 음색이 달라집니다.',
  '일렉기타는 기타 자체보다 앰프와 이펙터가 최종 음색에 큰 영향을 줍니다.',
  '스네어 소리는 드럼 사운드에서 박자를 느끼게 해주는 핵심 요소입니다.',
  '기다리느라 많이 힘드시죠...?',
  '팀원들이 다 F입니다.',
  '인공지능전공 2명, 컴공 2명으로 구성된 팀입니다.',
  '베이스 줄은 일반적인 기타 줄보다 더 굵고 낮은 음을 냅니다.',
  '옛날 녹음 스튜디오는 리버브를 만들려고 타일 깔린 방(에코 챔버)에 실제로 스피커랑 마이크를 두고 녹음했대요. 지금은 그걸 수학 함수 하나로 흉내내요.',
  '보컬을 믹싱할 때는 음량뿐 아니라 EQ와 리버브도 목소리의 느낌을 크게 바꿉니다.',
  '노래에서 보컬이 잘 들리지 않는다면 단순히 볼륨을 올리는 것보다 다른 악기의 주파수와 겹치는 부분을 조절하기도 합니다.',
  'Pan을 왼쪽이나 오른쪽으로 움직이면 소리가 오는 방향이 달라지는 것처럼 들립니다.',
  'Pan을 적절하게 나누면 여러 악기가 한 공간에 겹치지 않고 배치된 것처럼 느껴집니다.',
  '추출하기 버튼 누르면 나오는 파일, mp3가 아니라 wav예요. 화질로 치면 무압축 원본이라고 보시면 돼요.',
];
let loadingTmiTimer = null;

function startLoadingTmi(){
  const el = document.getElementById('loadingTmi');
  if(!el) return;
  const order = LOADING_TMI.map((_, i) => i).sort(() => Math.random() - 0.5);
  let idx = 0;
  const show = (text) => {
    el.classList.remove('show');
    setTimeout(() => { el.textContent = text; el.classList.add('show'); }, 200);
  };
  show(LOADING_TMI[order[idx]]);
  loadingTmiTimer = setInterval(() => {
    idx = (idx + 1) % order.length;
    show(LOADING_TMI[order[idx]]);
  }, 4200);
}

function stopLoadingTmi(){
  if(loadingTmiTimer){ clearInterval(loadingTmiTimer); loadingTmiTimer = null; }
  const el = document.getElementById('loadingTmi');
  if(el) el.classList.remove('show');
}

/* ---------- AI 음원 분리 연동 (Band_Age FastAPI 서버) ---------- */
// 상대경로: 로컬은 vite proxy, 배포는 nginx가 8000번으로 넘겨준다.
const SEPARATE_ORIGIN = '';

// POST /separate → job_id 즉시 수신 → GET /jobs/{job_id} 폴링 → done 시 { session_id, stems, model } 반환
// 서버가 항상 htdemucs_6s(vocals/drums/bass/guitar/piano/other)만 사용하므로 모델을 따로 지정하지 않는다.
async function requestAudioSeparation(file, onProgress){
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(SEPARATE_ORIGIN + '/separate', { method: 'POST', body: form });
  const data = await res.json();
  if(!res.ok) throw new Error(data.detail || '서버 오류');

  const deadline = Date.now() + 600000;
  while(Date.now() < deadline){
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const jobRes = await fetch(SEPARATE_ORIGIN + '/jobs/' + data.job_id);
    const job = await jobRes.json();
    if(job.status === 'done') return job;
    if(job.status === 'failed') throw new Error(job.error || '분리 실패');
    onProgress?.(job.status, job.queue_position);
  }
  throw new Error('타임아웃: 분리 시간이 너무 깁니다 (10분 초과).');
}

/* ---------- 로딩 화면에서 선택한 원곡 미리듣기 ---------- */
let loadingPreviewAudio = null;
let loadingPreviewObjectUrl = null;

function updateLoadingSoundToggle(){
  const btn = document.getElementById('loadingSoundToggle');
  if(!btn) return;
  if(!loadingPreviewAudio){
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  const muted = loadingPreviewAudio.paused;
  btn.classList.toggle('is-muted', muted);
  btn.setAttribute('aria-pressed', String(!muted));
}

function playLoadingPreview(url, isObjectUrl){
  stopLoadingPreview();
  const siteMusic = document.getElementById('siteMusic');
  if(siteMusic) siteMusic.pause();
  if(isObjectUrl) loadingPreviewObjectUrl = url;
  loadingPreviewAudio = new Audio(url);
  loadingPreviewAudio.loop = true;
  updateLoadingSoundToggle();
  // 브라우저 자동재생 정책으로 막힐 수 있으니, 실패하면 아이콘을 "꺼짐"으로 표시해
  // 사용자가 직접 눌러서 재생할 수 있게 한다.
  loadingPreviewAudio.play().catch(() => {}).then(updateLoadingSoundToggle);
}

function stopLoadingPreview(){
  if(loadingPreviewAudio){
    loadingPreviewAudio.pause();
    loadingPreviewAudio.src = '';
    loadingPreviewAudio = null;
  }
  if(loadingPreviewObjectUrl){
    URL.revokeObjectURL(loadingPreviewObjectUrl);
    loadingPreviewObjectUrl = null;
  }
  updateLoadingSoundToggle();
  const siteMusic = document.getElementById('siteMusic');
  if(siteMusic && !siteMusic.muted) siteMusic.play().catch(() => {});
}

const loadingSoundToggle = document.getElementById('loadingSoundToggle');
if(loadingSoundToggle){
  loadingSoundToggle.addEventListener('click', () => {
    if(!loadingPreviewAudio) return;
    if(loadingPreviewAudio.paused){
      loadingPreviewAudio.play().catch(() => {}).then(updateLoadingSoundToggle);
    } else {
      loadingPreviewAudio.pause();
    }
    updateLoadingSoundToggle();
  });
}

async function showLoading(){
  const screen = document.getElementById('loadingScreen');
  const fill = document.getElementById('loadingBarFill');
  const sub = document.getElementById('loadingSub');
  clearLoadingTimers();
  fill.style.width = '0%';
  screen.classList.add('show');
  screen.setAttribute('aria-hidden', 'false');
  startLoadingTmi();

  // 커스텀 트랙을 선택한 경우, 실제 음원 URL(data-audio-src)이 있으면 그 트랙도 분리 대상이다.
  // (데모 트랙은 data-audio-src가 없어 실제 음원이 없으므로 기존 데모 연출로만 처리)
  const trackAudioSrc = selectedTrackEl ? selectedTrackEl.dataset.audioSrc : null;

  // MY SONG 업로드도, 실제 음원이 있는 트랙 선택도 없으면 기존 데모 연출 그대로 무대로 이동
  if(!mySongFile && !trackAudioSrc){
    sub.textContent = '무대를 준비하는 중…';
    LOADING_STEPS.forEach((pct, i) => {
      loadingTimers.push(setTimeout(()=> { fill.style.width = pct + '%'; }, (i + 1) * LOADING_STEP_MS));
    });
    loadingTimers.push(setTimeout(() => {
      window.location.href = 'stage.html';
    }, (LOADING_STEPS.length + 1) * LOADING_STEP_MS));
    return;
  }

  // MY SONG 업로드 또는 실제 음원이 있는 커스텀 트랙이면 AI 음원 분리 서버로 보내고, 완료된 stem을 무대로 전달
  try{
    let fileToSeparate, songName;
    if(mySongFile){
      songName = mySongFile.name.replace(/\.[^.]+$/, '');
      playLoadingPreview(URL.createObjectURL(mySongFile), true);
      fileToSeparate = mySongFile;
    } else {
      const trackNameEl = selectedTrackEl.querySelector('.track-name');
      songName = trackNameEl ? trackNameEl.textContent.trim() : '트랙';
      playLoadingPreview(trackAudioSrc, false);

      sub.textContent = '음원 불러오는 중…';
      fill.style.width = '10%';
      const audioRes = await fetch(trackAudioSrc);
      if(!audioRes.ok) throw new Error('트랙 음원을 불러오지 못했습니다.');
      const blob = await audioRes.blob();
      const ext = (trackAudioSrc.split('?')[0].match(/\.[a-zA-Z0-9]+$/) || ['.mp3'])[0];
      fileToSeparate = new File([blob], songName + ext, { type: blob.type || 'audio/mpeg' });
    }

    sub.textContent = '음원 업로드 중…';
    fill.style.width = '25%';
    const job = await requestAudioSeparation(fileToSeparate, (status, queuePosition) => {
      if(status === 'processing'){
        sub.textContent = 'AI가 음원을 분리하는 중… (첫 실행 시 모델 다운로드 포함 3~4분 소요)';
      } else if(queuePosition > 0){
        sub.textContent = `분리 대기열에서 대기 중… (내 앞에 ${queuePosition}명)`;
      } else {
        sub.textContent = '분리 대기열에서 대기 중… (곧 시작합니다)';
      }
      fill.style.width = '55%';
    });
    fill.style.width = '100%';
    sub.textContent = '완료! 무대로 이동합니다…';
    sessionStorage.setItem('bandage_session', JSON.stringify({
      sessionId: job.session_id,
      stems: job.stems,
      model: job.model,
      songName,
    }));
    loadingTimers.push(setTimeout(() => { stopLoadingPreview(); window.location.href = 'stage.html'; }, 400));
  } catch(err){
    stopLoadingPreview();
    hideLoading();
    showToast('❌ 음원 분리 실패: ' + err.message);
  }
}

function hideLoading(){
  const screen = document.getElementById('loadingScreen');
  clearLoadingTimers();
  stopLoadingTmi();
  screen.classList.remove('show');
  screen.setAttribute('aria-hidden', 'true');
}

function clearLoadingTimers(){
  loadingTimers.forEach(clearTimeout);
  loadingTimers = [];
}

// 상대경로로 둬서 배포 도메인이 바뀌어도 코드를 안 고쳐도 되게 한다.
// 로컬 개발에서는 vite.config.js의 server.proxy가 실제 백엔드(4000)로 대신 연결해준다.
const API_BASE = '/api';
const API_ORIGIN = '';
let authMode = 'login';
let currentUser = null;

function openModal(type){
  authMode = type;
  const title = document.getElementById('modalTitle');
  const sub = document.getElementById('modalSub');
  const nicknameInput = document.getElementById('authNickname');
  const errorBox = document.getElementById('authError');
  errorBox.style.display = 'none';
  document.getElementById('authUsername').value = '';
  document.getElementById('authNickname').value = '';
  document.getElementById('authPassword').value = '';
  if(type==='signup'){
    title.textContent = '회원가입';
    sub.textContent = '무료로 첫 무대를 만들어보세요.';
    nicknameInput.style.display = '';
  } else {
    title.textContent = '로그인';
    sub.textContent = '밴드가 당신을 기다리고 있어요.';
    nicknameInput.style.display = 'none';
  }
  document.getElementById('overlay').classList.add('show');
}
function closeModal(){ document.getElementById('overlay').classList.remove('show'); }

function showAuthError(msg){
  const errorBox = document.getElementById('authError');
  errorBox.textContent = msg;
  errorBox.style.display = '';
}

async function submitAuth(){
  const username = document.getElementById('authUsername').value.trim();
  const nickname = document.getElementById('authNickname').value.trim();
  const password = document.getElementById('authPassword').value;

  if(!username || !password){
    showAuthError('아이디와 비밀번호를 입력하세요.');
    return;
  }
  if(authMode === 'signup' && !nickname){
    showAuthError('닉네임을 입력하세요.');
    return;
  }

  const path = authMode === 'signup' ? '/auth/register' : '/auth/login';
  const body = authMode === 'signup' ? { username, password, nickname } : { username, password };

  try{
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if(!res.ok){
      showAuthError(data.message || '요청을 처리하지 못했습니다.');
      return;
    }
    localStorage.setItem('band_age_token', data.token);
    closeModal();
    showToast(`${data.user.nickname}님, 환영합니다!`);
    renderAuthArea(data.user);
  } catch(err){
    showAuthError('서버에 연결할 수 없습니다.');
  }
}

function loginWithKakao(){
  window.location.href = API_BASE + '/auth/kakao';
}

function handleAuthRedirect(){
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const error = params.get('error');

  if(token){
    localStorage.setItem('band_age_token', token);
    showToast('카카오 로그인 성공!');
  } else if(error === 'kakao_denied'){
    showToast('카카오 로그인이 취소되었습니다.');
  } else if(error === 'kakao_failed'){
    showToast('카카오 로그인에 실패했습니다.');
  }

  if(token || error){
    window.history.replaceState({}, '', window.location.pathname);
  }
}

function logout(){
  localStorage.removeItem('band_age_token');
  window.location.href = '/';
}

function renderAuthArea(user){
  currentUser = user;
}

async function checkSession(){
  const token = localStorage.getItem('band_age_token');
  if(!token) return null;
  try{
    const res = await fetch(API_BASE + '/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if(!res.ok){
      localStorage.removeItem('band_age_token');
      return null;
    }
    const user = await res.json();
    renderAuthArea(user);
    return user;
  } catch(err){
    // 서버 연결 안 되면 로그인 전 상태로 둔다.
    return null;
  }
}

function openNicknameModal(currentNickname){
  document.getElementById('newNickname').value = currentNickname || '';
  document.getElementById('nicknameError').style.display = 'none';
  document.getElementById('nicknameOverlay').classList.add('show');
}
function closeNicknameModal(){
  document.getElementById('nicknameOverlay').classList.remove('show');
}

async function submitNickname(){
  const nickname = document.getElementById('newNickname').value.trim();
  const errorBox = document.getElementById('nicknameError');
  if(!nickname){
    errorBox.textContent = '닉네임을 입력하세요.';
    errorBox.style.display = '';
    return;
  }
  const token = localStorage.getItem('band_age_token');
  try{
    const res = await fetch(API_BASE + '/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname }),
    });
    const data = await res.json();
    if(!res.ok){
      errorBox.textContent = data.message || '닉네임을 저장하지 못했습니다.';
      errorBox.style.display = '';
      return;
    }
    closeNicknameModal();
    showToast('닉네임이 설정되었습니다.');
    renderAuthArea(data);
  } catch(err){
    errorBox.textContent = '서버에 연결할 수 없습니다.';
    errorBox.style.display = '';
  }
}

function openProfileModal(){
  if(!currentUser){
    showToast('로그인이 필요해요.');
    window.location.href = '/';
    return;
  }
  document.getElementById('profileUsername').textContent = currentUser.username;
  document.getElementById('profileNickname').value = currentUser.nickname;
  document.getElementById('profileError').style.display = 'none';
  resetWithdrawSection();
  document.getElementById('profileOverlay').classList.add('show');
  loadMyPageSongs();
  loadMyPagePosts();
}
function closeProfileModal(){
  document.getElementById('profileOverlay').classList.remove('show');
}

async function loadMyPageSongs(){
  const container = document.getElementById('myPageSongs');
  if(!container || !currentUser) return;
  const token = localStorage.getItem('band_age_token');
  try{
    const res = await fetch(API_BASE + '/songs/mine', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if(!res.ok){
      renderCustomTracks([], 'myPageSongs', 'mine');
      return;
    }
    renderCustomTracks(await res.json(), 'myPageSongs', 'mine');
  } catch(err){
    container.innerHTML = '<div class="track-empty">불러올 수 없어요.</div>';
  }
}

async function loadMyPagePosts(){
  const container = document.getElementById('myPagePosts');
  if(!container || !currentUser) return;
  const token = localStorage.getItem('band_age_token');
  try{
    const res = await fetch(API_BASE + '/posts/mine', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if(!res.ok){
      container.innerHTML = '<div class="board-row"><span class="t">불러올 수 없어요.</span></div>';
      return;
    }
    const posts = await res.json();
    if(!posts.length){
      container.innerHTML = '<div class="board-row"><span class="t">아직 쓴 글이 없어요.</span></div>';
      return;
    }
    renderBoardRows('myPagePosts', posts);
  } catch(err){
    container.innerHTML = '<div class="board-row"><span class="t">불러올 수 없어요.</span></div>';
  }
}

async function saveProfileNickname(){
  const nickname = document.getElementById('profileNickname').value.trim();
  const errorBox = document.getElementById('profileError');
  errorBox.style.display = 'none';
  if(!nickname){
    errorBox.textContent = '닉네임을 입력하세요.';
    errorBox.style.display = '';
    return;
  }
  const token = localStorage.getItem('band_age_token');
  try{
    const res = await fetch(API_BASE + '/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname }),
    });
    const data = await res.json();
    if(!res.ok){
      errorBox.textContent = data.message || '닉네임을 저장하지 못했습니다.';
      errorBox.style.display = '';
      return;
    }
    renderAuthArea(data);
    showToast('닉네임이 변경되었습니다.');
  } catch(err){
    errorBox.textContent = '서버에 연결할 수 없습니다.';
    errorBox.style.display = '';
  }
}

const WITHDRAW_PHRASE = '탈퇴하겠습니다';

function resetWithdrawSection(){
  document.getElementById('withdrawTrigger').style.display = '';
  document.getElementById('withdrawSection').style.display = 'none';
  document.getElementById('withdrawPassword1').value = '';
  document.getElementById('withdrawPassword2').value = '';
  document.getElementById('withdrawError').style.display = 'none';
}

function startWithdraw(){
  const isLocal = currentUser && currentUser.provider === 'local';
  const p1 = document.getElementById('withdrawPassword1');
  const p2 = document.getElementById('withdrawPassword2');
  const hint = document.getElementById('withdrawHint');

  if(isLocal){
    p1.type = 'password';
    p2.type = 'password';
    p1.placeholder = '비밀번호';
    p2.placeholder = '비밀번호 확인';
    hint.textContent = '비밀번호를 두 번 입력하면 탈퇴가 진행됩니다.';
  } else {
    p1.type = 'text';
    p2.type = 'text';
    p1.placeholder = WITHDRAW_PHRASE;
    p2.placeholder = WITHDRAW_PHRASE + ' (확인)';
    hint.textContent = `"${WITHDRAW_PHRASE}"를 두 번 입력하면 탈퇴가 진행됩니다.`;
  }

  document.getElementById('withdrawTrigger').style.display = 'none';
  document.getElementById('withdrawSection').style.display = '';
  p1.value = '';
  p2.value = '';
  document.getElementById('withdrawError').style.display = 'none';
}

async function confirmWithdraw(){
  const isLocal = currentUser && currentUser.provider === 'local';
  const p1 = document.getElementById('withdrawPassword1').value;
  const p2 = document.getElementById('withdrawPassword2').value;
  const errorBox = document.getElementById('withdrawError');
  errorBox.style.display = 'none';

  if(!p1 || !p2){
    errorBox.textContent = isLocal ? '비밀번호를 두 번 입력하세요.' : `"${WITHDRAW_PHRASE}"를 두 번 입력하세요.`;
    errorBox.style.display = '';
    return;
  }
  if(p1 !== p2){
    errorBox.textContent = isLocal ? '비밀번호가 서로 일치하지 않습니다.' : '입력한 두 문구가 서로 일치하지 않습니다.';
    errorBox.style.display = '';
    return;
  }
  if(!isLocal && p1 !== WITHDRAW_PHRASE){
    errorBox.textContent = `"${WITHDRAW_PHRASE}"를 정확히 입력하세요.`;
    errorBox.style.display = '';
    return;
  }
  if(!confirm('정말로 탈퇴하시겠어요? 이 작업은 되돌릴 수 없습니다.')) return;
  await withdrawAccount(isLocal ? p1 : undefined);
}

async function withdrawAccount(password){
  const token = localStorage.getItem('band_age_token');
  try{
    const res = await fetch(API_BASE + '/auth/me', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(password ? { password } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok){
      const errorBox = document.getElementById('withdrawError');
      if(errorBox && errorBox.offsetParent !== null){
        errorBox.textContent = data.message || '탈퇴에 실패했습니다.';
        errorBox.style.display = '';
      } else {
        showToast(data.message || '탈퇴에 실패했습니다.');
      }
      return;
    }
    closeProfileModal();
    localStorage.removeItem('band_age_token');
    renderAuthArea(null);
    showToast(data.message || '탈퇴가 완료되었습니다.');
  } catch(err){
    showToast('서버에 연결할 수 없습니다.');
  }
}

let hotPostId = null;
let currentBoardSort = 'latest';
let boardPosts = [];
let boardPage = 1;
const POSTS_PER_PAGE = 5;

function formatPostDate(dateString){
  const d = new Date(dateString);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Hot 게시물(조회수 1위)은 정렬 기준과 상관없이 항상 목록 맨 앞으로 고정한다.
function reorderWithHotFirst(posts){
  if(!hotPostId) return posts;
  const idx = posts.findIndex(p => p._id === hotPostId);
  if(idx <= 0) return posts;
  const [hot] = posts.splice(idx, 1);
  return [hot, ...posts];
}

function renderBoardRows(containerId, posts, offset = 0){
  const container = document.getElementById(containerId);
  if(!posts.length){
    container.innerHTML = '<div class="board-row"><span class="t">아직 게시물이 없어요.</span></div>';
    return;
  }
  container.innerHTML = posts.map((post, i) => {
    const isOwner = currentUser && String(post.author) === String(currentUser.id);
    return `
    <div class="board-row" onclick="openPostDetail('${post._id}')">
      <span class="idx">${String(offset + i + 1).padStart(2, '0')}</span>
      <span class="t">${post._id === hotPostId ? '<span class="hot">HOT</span>' : ''}${escapeHtml(post.title)}</span>
      <span class="m">조회 ${post.views} · ${formatPostDate(post.createdAt)}</span>
      ${isOwner ? `<button class="board-delete-btn" onclick="event.stopPropagation(); deletePost('${post._id}')" aria-label="삭제">✕</button>` : ''}
    </div>
  `;
  }).join('');
}

async function refreshHotPost(){
  try{
    const res = await fetch(API_BASE + '/posts?sort=views');
    const posts = await res.json();
    hotPostId = (posts.length && posts[0].views > 0) ? posts[0]._id : null;
  } catch(err){
    hotPostId = null;
  }
}

async function loadBoardPreview(){
  try{
    const res = await fetch(API_BASE + '/posts?sort=latest');
    const posts = reorderWithHotFirst(await res.json());
    renderBoardRows('boardPreview', posts.slice(0, 3));
  } catch(err){
    document.getElementById('boardPreview').innerHTML =
      '<div class="board-row"><span class="t">방명록을 불러올 수 없어요.</span></div>';
  }
}

function renderBoardPagination(){
  const container = document.getElementById('boardPagination');
  const totalPages = Math.max(1, Math.ceil(boardPosts.length / POSTS_PER_PAGE));
  if(totalPages <= 1){
    container.innerHTML = '';
    return;
  }
  let html = '';
  for(let p = 1; p <= totalPages; p++){
    html += `<button class="board-page-btn ${p === boardPage ? 'active' : ''}" onclick="goToBoardPage(${p})">${p}</button>`;
  }
  container.innerHTML = html;
}

function renderCurrentBoardPage(){
  const start = (boardPage - 1) * POSTS_PER_PAGE;
  renderBoardRows('boardFullList', boardPosts.slice(start, start + POSTS_PER_PAGE), start);
  renderBoardPagination();
}

function goToBoardPage(page){
  boardPage = page;
  renderCurrentBoardPage();
}

async function loadBoardFullList(){
  const container = document.getElementById('boardFullList');
  container.innerHTML = '<div class="board-row"><span class="t">불러오는 중...</span></div>';
  try{
    const res = await fetch(API_BASE + '/posts?sort=' + currentBoardSort);
    boardPosts = reorderWithHotFirst(await res.json());
    boardPage = 1;
    renderCurrentBoardPage();
  } catch(err){
    container.innerHTML = '<div class="board-row"><span class="t">방명록을 불러올 수 없어요.</span></div>';
    document.getElementById('boardPagination').innerHTML = '';
  }
}

function setBoardSort(sort){
  currentBoardSort = sort;
  document.getElementById('tabLatest').classList.toggle('active', sort === 'latest');
  document.getElementById('tabViews').classList.toggle('active', sort === 'views');
  loadBoardFullList();
}

function openBoardModal(){
  document.getElementById('boardOverlay').classList.add('show');
  setBoardSort('latest');
}
function closeBoardModal(){
  document.getElementById('boardOverlay').classList.remove('show');
  document.getElementById('writeForm').style.display = 'none';
}

function toggleWriteForm(){
  if(!localStorage.getItem('band_age_token')){
    closeBoardModal();
    showToast('글쓰기는 로그인 후 이용할 수 있어요.');
    openModal('login');
    return;
  }
  const form = document.getElementById('writeForm');
  form.style.display = form.style.display === 'none' ? '' : 'none';
}

async function submitPost(){
  const title = document.getElementById('postTitle').value.trim();
  const content = document.getElementById('postContent').value.trim();
  const errorBox = document.getElementById('postError');
  errorBox.style.display = 'none';

  if(!title || !content){
    errorBox.textContent = '제목과 내용을 입력하세요.';
    errorBox.style.display = '';
    return;
  }

  const token = localStorage.getItem('band_age_token');
  try{
    const res = await fetch(API_BASE + '/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, content }),
    });
    const data = await res.json();
    if(!res.ok){
      errorBox.textContent = data.message || '게시물을 등록하지 못했습니다.';
      errorBox.style.display = '';
      return;
    }
    document.getElementById('postTitle').value = '';
    document.getElementById('postContent').value = '';
    document.getElementById('writeForm').style.display = 'none';
    showToast('게시물이 등록되었습니다.');
    await refreshHotPost();
    await loadBoardFullList();
    await loadBoardPreview();
  } catch(err){
    errorBox.textContent = '서버에 연결할 수 없습니다.';
    errorBox.style.display = '';
  }
}

let currentPostDetailId = null;

async function openPostDetail(id){
  try{
    const res = await fetch(API_BASE + '/posts/' + id);
    if(!res.ok) return;
    const post = await res.json();
    currentPostDetailId = post._id;
    document.getElementById('postDetailAuthor').innerHTML = `
      <span>${escapeHtml(post.authorNickname)}</span>
    `;
    document.getElementById('postDetailTitle').textContent = post.title;
    document.getElementById('postDetailMeta').textContent =
      `${formatPostDate(post.createdAt)} · 조회 ${post.views}`;
    document.getElementById('postDetailContent').textContent = post.content;

    const isOwner = currentUser && String(post.author) === String(currentUser.id);
    document.getElementById('postDetailDeleteBtn').style.display = isOwner ? '' : 'none';

    document.getElementById('postDetailOverlay').classList.add('show');

    // 조회수가 올랐으니 Hot 배지/목록도 최신 상태로 갱신한다.
    await refreshHotPost();
    await loadBoardPreview();
    if(document.getElementById('boardOverlay').classList.contains('show')){
      await loadBoardFullList();
    }
  } catch(err){
    showToast('게시물을 불러올 수 없습니다.');
  }
}
function closePostDetail(){
  document.getElementById('postDetailOverlay').classList.remove('show');
  currentPostDetailId = null;
}

async function deletePost(id, fromDetail){
  if(!id) return;
  if(!confirm('이 게시물을 삭제하시겠어요?')) return;
  const token = localStorage.getItem('band_age_token');
  try{
    const res = await fetch(API_BASE + '/posts/' + id, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok){
      showToast(data.message || '삭제하지 못했습니다.');
      return;
    }
    if(fromDetail) closePostDetail();
    showToast('게시물이 삭제되었습니다.');
    await refreshHotPost();
    await loadBoardPreview();
    if(document.getElementById('boardOverlay').classList.contains('show')){
      await loadBoardFullList();
    }
  } catch(err){
    showToast('서버에 연결할 수 없습니다.');
  }
}

function updateListCounts(){
  document.querySelectorAll('.list-section').forEach((section) => {
    const trackScroll = section.querySelector('.track-scroll');
    const countEl = section.querySelector('.count');
    if(!trackScroll || !countEl) return;
    const total = trackScroll.querySelectorAll('.track').length;
    const suffix = countEl.dataset.suffix || '';
    countEl.textContent = String(total).padStart(2, '0') + ' ' + suffix;
  });
}

function setupListSearch(){
  document.querySelectorAll('.list-search').forEach((input) => {
    input.addEventListener('input', () => {
      const section = input.closest('.list-section');
      if(!section) return;
      const query = input.value.trim().toLowerCase();
      section.querySelectorAll('.track').forEach((track) => {
        const name = track.querySelector('.track-name')?.textContent.toLowerCase() || '';
        track.classList.toggle('search-hidden', query.length > 0 && !name.includes(query));
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const fileInput = document.getElementById('fileInput');
  if(fileInput){
    fileInput.addEventListener('change', (e)=>{
      if(e.target.files.length){
        setMySongFile(e.target.files[0]);
      }
    });
  }
  const customFileInput = document.getElementById('customFileInput');
  if(customFileInput){
    customFileInput.addEventListener('change', (e)=>{
      const file = e.target.files[0];
      e.target.value = '';
      if(!file) return;
      if(!currentUser){
        showToast('커스텀 트랙 업로드는 로그인 후 이용할 수 있어요.');
        return;
      }
      openCustomTrackNameModal(file);
    });
  }
  const isNewUser = new URLSearchParams(window.location.search).get('newUser') === '1';
  handleAuthRedirect();
  const user = await checkSession();
  if(!user){
    window.location.href = '/';
    return;
  }
  if(isNewUser){
    openNicknameModal(user.nickname);
  }
  await refreshHotPost();
  loadBoardPreview();
  loadAllCustomSongs();

  updateListCounts();
  setupListSearch();
  document.querySelectorAll('.track-scroll').forEach((trackScroll) => {
    new MutationObserver(updateListCounts).observe(trackScroll, { childList: true });
  });
});

// TODO(백엔드 연동 시): 여기서 좋아요 상태/개수를 서버(GET으로 초기 상태 불러오기,
// POST /api/likes/:trackId 같은 걸로 토글)에 반영하도록 바꾸면 된다.
// 지금은 로그인 여부만 체크하고, 좋아요 상태는 이 브라우저 세션에서만 유지된다(새로고침 시 초기화).
function toggleLike(event, btn){
  event.stopPropagation();
  if(!localStorage.getItem('band_age_token')){
    showToast('좋아요는 로그인 후 이용할 수 있어요.');
    openModal('login');
    return;
  }

  const liked = btn.classList.contains('liked');
  const likes = parseInt(btn.dataset.likes || '0', 10) + (liked ? -1 : 1);
  btn.dataset.likes = likes;
  btn.classList.toggle('liked', !liked);
  btn.querySelector('.like-count').textContent = likes;
  sortCustomListByLikes();
}

function sortCustomListByLikes(){
  const container = document.querySelector('.list-section[data-list="custom"] .track-scroll');
  if(!container) return;
  const tracks = Array.from(container.querySelectorAll('.track'));
  tracks.sort((a, b) => {
    const likesA = parseInt(a.querySelector('.like-btn')?.dataset.likes || '0', 10);
    const likesB = parseInt(b.querySelector('.like-btn')?.dataset.likes || '0', 10);
    return likesB - likesA;
  });
  tracks.forEach((track) => container.appendChild(track));
}