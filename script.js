function toggleTrack(el){
  const wasPlaying = el.classList.contains('playing');
  document.querySelectorAll('.track').forEach(t=>{
    t.classList.remove('playing');
    t.querySelector('.play-btn').textContent = '▷';
  });
  if(!wasPlaying){
    el.classList.add('playing');
    el.querySelector('.play-btn').textContent = '❚❚';
    showToast('▶ ' + el.querySelector('.track-name').textContent.trim() + ' 재생 중 (데모)');
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

const API_BASE = 'http://localhost:4000/api';
let authMode = 'login';

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
  renderAuthArea(null);
  showToast('로그아웃 되었습니다.');
}

function renderAuthArea(user){
  const area = document.getElementById('authArea');
  if(user){
    area.innerHTML = `
      <span class="link-btn" style="cursor:default">${user.nickname}님</span>
      <button class="link-btn" onclick="logout()">로그아웃</button>
    `;
  } else {
    area.innerHTML = `
      <button class="link-btn" onclick="openModal('login')">로그인</button>
      <button class="link-btn" onclick="openModal('signup')">회원가입</button>
    `;
  }
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
        showToast('"' + e.target.files[0].name + '" 업로드 준비됨 (음원 분리 서버 연동 예정)');
      }
    });
  }
  const isNewUser = new URLSearchParams(window.location.search).get('newUser') === '1';
  handleAuthRedirect();
  const user = await checkSession();
  if(isNewUser && user){
    openNicknameModal(user.nickname);
  }

  updateListCounts();
  setupListSearch();
  document.querySelectorAll('.track-scroll').forEach((trackScroll) => {
    new MutationObserver(updateListCounts).observe(trackScroll, { childList: true });
  });
});

function toggleFav(event, btn){
  event.stopPropagation();
  btn.classList.toggle('faved');
}