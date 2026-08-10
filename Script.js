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

function openModal(type){
  const title = document.getElementById('modalTitle');
  const sub = document.getElementById('modalSub');
  if(type==='signup'){
    title.textContent = '회원가입';
    sub.textContent = '무료로 첫 무대를 만들어보세요.';
  } else {
    title.textContent = '로그인';
    sub.textContent = '밴드가 당신을 기다리고 있어요.';
  }
  document.getElementById('overlay').classList.add('show');
}
function closeModal(){ document.getElementById('overlay').classList.remove('show'); }

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('fileInput');
  if(fileInput){
    fileInput.addEventListener('change', (e)=>{
      if(e.target.files.length){
        showToast('"' + e.target.files[0].name + '" 업로드 준비됨 (음원 분리 서버 연동 예정)');
      }
    });
  }
});

function toggleFav(event, btn){
  event.stopPropagation();
  btn.classList.toggle('faved');
}