const API_BASE = 'http://localhost:4000/api';
const dialog = document.querySelector('#authDialog');
const form = document.querySelector('#authForm');
const usernameInput = document.querySelector('#authUsername');
const nicknameField = document.querySelector('#nicknameField');
const nicknameInput = document.querySelector('#authNickname');
const passwordInput = document.querySelector('#authPassword');
const errorBox = document.querySelector('#authError');
const submitButton = document.querySelector('#authSubmit');
let mode = 'login';

function openAuth(){
  dialog.classList.add('is-open');
  dialog.setAttribute('aria-hidden','false');
  setTimeout(()=>usernameInput.focus(),100);
}
function closeAuth(){
  dialog.classList.remove('is-open');
  dialog.setAttribute('aria-hidden','true');
}
function setMode(nextMode){
  mode=nextMode;
  const signup=mode==='signup';
  document.querySelectorAll('.auth-tab').forEach(tab=>tab.classList.toggle('is-active',tab.dataset.mode===mode));
  nicknameField.hidden=!signup;
  nicknameInput.required=signup;
  passwordInput.autocomplete=signup?'new-password':'current-password';
  document.querySelector('#authTitle').textContent=signup?'새로운 무대를 시작하세요.':'다시 만나 반가워요.';
  document.querySelector('#authDescription').textContent=signup?'계정을 만들고 6인조 밴드를 만나보세요.':'로그인하고 나만의 밴드 무대로 이동하세요.';
  submitButton.textContent=signup?'회원가입하고 시작하기':'로그인하고 시작하기';
  errorBox.hidden=true;
}
function showError(message){errorBox.textContent=message;errorBox.hidden=false}
function goToLobby(extra=''){window.location.href='/lobby.html'+extra}

// 이미 로그인된 토큰이 있으면 로그인창을 또 띄우지 않고 바로 로비로 보낸다.
async function hasValidSession(){
  const token=localStorage.getItem('band_age_token');
  if(!token)return false;
  try{
    const response=await fetch(API_BASE+'/auth/me',{headers:{Authorization:`Bearer ${token}`}});
    if(!response.ok){localStorage.removeItem('band_age_token');return false}
    return true;
  }catch(error){return false}
}

document.querySelector('#enterButton').addEventListener('click',async()=>{
  if(await hasValidSession()){goToLobby()}else{openAuth()}
});
document.querySelector('#authClose').addEventListener('click',closeAuth);
dialog.addEventListener('click',event=>{if(event.target===dialog)closeAuth()});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAuth()});
document.querySelectorAll('.auth-tab').forEach(tab=>tab.addEventListener('click',()=>setMode(tab.dataset.mode)));
document.querySelector('#kakaoButton').addEventListener('click',()=>{window.location.href=API_BASE+'/auth/kakao'});

form.addEventListener('submit',async event=>{
  event.preventDefault();
  const username=usernameInput.value.trim();
  const nickname=nicknameInput.value.trim();
  const password=passwordInput.value;
  if(!username||!password)return showError('아이디와 비밀번호를 입력하세요.');
  if(username.length<4)return showError('아이디는 4글자 이상 입력해주세요.');
  if(!/[A-Za-z]/.test(username))return showError('아이디는 영문을 포함해야 해요.');
  if(mode==='signup'&&!nickname)return showError('닉네임을 입력하세요.');
  submitButton.disabled=true;
  errorBox.hidden=true;
  try{
    const response=await fetch(API_BASE+(mode==='signup'?'/auth/register':'/auth/login'),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(mode==='signup'?{username,password,nickname}:{username,password})
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data.message||'요청을 처리하지 못했습니다.');
    localStorage.setItem('band_age_token',data.token);
    goToLobby();
  }catch(error){showError(error.message==='Failed to fetch'?'로그인 서버에 연결할 수 없습니다. .env 설정과 API 서버 상태를 확인하세요.':error.message)}
  finally{submitButton.disabled=false}
});

const params=new URLSearchParams(window.location.search);
const token=params.get('token');
if(token){
  localStorage.setItem('band_age_token',token);
  goToLobby(params.get('newUser')==='1'?'?newUser=1':'');
}else if(params.get('error')){
  openAuth();
  showError(params.get('error')==='kakao_denied'?'카카오 로그인이 취소되었습니다.':'카카오 로그인에 실패했습니다.');
}else if(params.get('auth')==='1'){
  openAuth();
}
