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
const API_ORIGIN = API_BASE.replace(/\/api$/, '');
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
  renderAuthArea(null);
  showToast('로그아웃 되었습니다.');
}

function avatarHtml(user, extraClass){
  const cls = 'avatar-circle' + (extraClass ? ' ' + extraClass : '');
  if(user && user.avatarUrl){
    return `<img src="${API_ORIGIN}${user.avatarUrl}" class="${cls}" alt="">`;
  }
  const initial = user && user.nickname ? escapeHtml(user.nickname.slice(0, 1)) : '?';
  return `<span class="${cls} avatar-placeholder">${initial}</span>`;
}

function renderAuthArea(user){
  currentUser = user;
  const area = document.getElementById('authArea');
  if(user){
    area.innerHTML = `
      <button class="link-btn profile-trigger" onclick="openProfileModal()">
        ${avatarHtml(user)}
        <span>${escapeHtml(user.nickname)}님</span>
      </button>
      <button class="link-btn" onclick="logout()">로그아웃</button>
    `;
  } else {
    area.innerHTML = `
      <button class="link-btn" onclick="openModal('login')">로그인</button>
      <button class="link-btn" onclick="openModal('signup')">회원가입</button>
    `;
  }
  loadMySongs();
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

function renderProfileAvatarPreview(){
  document.getElementById('profileAvatarPreview').innerHTML = avatarHtml(currentUser, 'avatar-large');
}

function openProfileModal(){
  if(!currentUser) return;
  document.getElementById('profileNickname').value = currentUser.nickname;
  document.getElementById('profileError').style.display = 'none';
  renderProfileAvatarPreview();
  resetWithdrawSection();
  document.getElementById('profileOverlay').classList.add('show');
}
function closeProfileModal(){
  document.getElementById('profileOverlay').classList.remove('show');
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

// 휴대폰 카메라 사진 등 큰 원본을 그대로 올리면 용량 제한에 걸리니,
// 업로드 전에 브라우저에서 512px 정사각형 기준으로 줄이고 JPEG로 압축한다.
function resizeImageFile(file, maxDim = 512, quality = 0.85){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if(width > maxDim || height > maxDim){
        if(width > height){
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('이미지를 변환하지 못했습니다.')),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 불러오지 못했습니다. 다른 파일을 시도해주세요.'));
    };
    img.src = url;
  });
}

async function submitAvatar(event){
  const file = event.target.files[0];
  if(!file) return;
  const token = localStorage.getItem('band_age_token');
  try{
    const resized = await resizeImageFile(file);
    const formData = new FormData();
    formData.append('avatar', resized, 'avatar.jpg');
    const res = await fetch(API_BASE + '/auth/me/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if(!res.ok){
      showToast(data.message || '사진 업로드에 실패했습니다.');
      return;
    }
    renderAuthArea(data);
    renderProfileAvatarPreview();
    showToast('프로필 사진이 변경되었습니다.');
  } catch(err){
    showToast(err.message || '서버에 연결할 수 없습니다.');
  } finally {
    event.target.value = '';
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

function postExcerpt(content, max = 60){
  const clean = content.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

function renderBoardRows(containerId, posts){
  const container = document.getElementById(containerId);
  if(!posts.length){
    container.innerHTML = '<div class="board-row"><span class="t">아직 게시물이 없어요.</span></div>';
    return;
  }
  container.innerHTML = posts.map((post) => {
    const isOwner = currentUser && String(post.author) === String(currentUser.id);
    return `
    <div class="board-row" onclick="openPostDetail('${post._id}')">
      <div class="board-row-top">
        ${avatarHtml({ avatarUrl: post.authorAvatarUrl, nickname: post.authorNickname }, 'avatar-small')}
        <span class="board-nickname">${escapeHtml(post.authorNickname)}</span>
        <span class="board-meta">조회 ${post.views} · ${formatPostDate(post.createdAt)}</span>
        ${isOwner ? `<button class="board-delete-btn" onclick="event.stopPropagation(); deletePost('${post._id}')" aria-label="삭제">✕</button>` : ''}
      </div>
      <div class="board-row-title">${post._id === hotPostId ? '<span class="hot">HOT</span>' : ''}${escapeHtml(post.title)}</div>
      <div class="board-row-excerpt">${escapeHtml(postExcerpt(post.content))}</div>
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
  renderBoardRows('boardFullList', boardPosts.slice(start, start + POSTS_PER_PAGE));
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
  const opening = form.style.display === 'none';
  form.style.display = opening ? '' : 'none';
  if(opening && currentUser){
    document.getElementById('writeFormAuthor').innerHTML = `
      ${avatarHtml(currentUser, 'avatar-small')}
      <span class="board-nickname">${escapeHtml(currentUser.nickname)}</span>
    `;
  }
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
      ${avatarHtml({ avatarUrl: post.authorAvatarUrl, nickname: post.authorNickname }, 'avatar-small')}
      <span class="board-nickname">${escapeHtml(post.authorNickname)}</span>
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

function formatDuration(seconds){
  if(!seconds || !Number.isFinite(seconds)) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
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

function renderCustomTracks(songs){
  const container = document.getElementById('customTrackList');
  if(!container) return;
  if(!currentUser){
    container.innerHTML = '<div class="track-empty">로그인 후 이용할 수 있어요.</div>';
    return;
  }
  if(!songs.length){
    container.innerHTML = '<div class="track-empty">업로드한 트랙이 없어요.</div>';
    return;
  }
  container.innerHTML = songs.map((song) => `
    <div class="track" onclick="toggleTrack(this)">
      <span class="track-name">${escapeHtml(song.title)}</span>
      <span class="track-time">${formatDuration(song.duration)}</span>
      <button class="fav-btn" onclick="toggleFav(event, this)">♥</button>
      <button class="play-btn">▷</button>
      <button class="track-delete-btn" onclick="event.stopPropagation(); deleteSong('${song._id}')" aria-label="삭제">✕</button>
    </div>
  `).join('');
}

async function loadMySongs(){
  const container = document.getElementById('customTrackList');
  if(!container) return;
  if(!currentUser){
    renderCustomTracks([]);
    return;
  }
  const token = localStorage.getItem('band_age_token');
  try{
    const res = await fetch(API_BASE + '/songs/mine', {
      headers: { Authorization: `Bearer ${token}` },
    });
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
    loadMySongs();
  } catch(err){
    showToast('서버에 연결할 수 없습니다.');
  }
}

async function handleSongUpload(file){
  if(!currentUser){
    showToast('로그인 후 업로드할 수 있어요.');
    openModal('login');
    return;
  }
  const token = localStorage.getItem('band_age_token');
  const duration = await readAudioDuration(file);
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', file.name.replace(/\.[^/.]+$/, ''));
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
    loadMySongs();
  } catch(err){
    showToast('서버에 연결할 수 없습니다.');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const fileInput = document.getElementById('fileInput');
  if(fileInput){
    fileInput.addEventListener('change', (e)=>{
      if(e.target.files.length){
        handleSongUpload(e.target.files[0]);
      }
      e.target.value = '';
    });
  }
  const isNewUser = new URLSearchParams(window.location.search).get('newUser') === '1';
  handleAuthRedirect();
  const user = await checkSession();
  if(isNewUser && user){
    openNicknameModal(user.nickname);
  }
  await refreshHotPost();
  loadBoardPreview();

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