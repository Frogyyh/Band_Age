const MIN_ZOOM = 0.15;
// 서브픽셀 반올림 오차로 스크롤이 생기는 걸 막기 위한 여유값
const SAFETY_MARGIN = 0.98;
const MAX_ITERATIONS = 8;

// 콘텐츠 높이가 zoom에 정비례하지 않는다 (고정 px 요소, zoom에 따른 줄바꿈 변화 때문에).
// 그래서 한 번에 계산하지 않고, 적용→측정→보정을 반복해서 수렴시킨다.
function fitToViewport(){
  const html = document.documentElement;
  const availableHeight = window.innerHeight;
  let scale = 1;

  for(let i = 0; i < MAX_ITERATIONS; i++){
    html.style.zoom = scale;
    const currentHeight = document.documentElement.scrollHeight;
    if(currentHeight <= availableHeight) break;
    if(scale <= MIN_ZOOM) break;
    scale = Math.max(MIN_ZOOM, scale * (availableHeight / currentHeight) * SAFETY_MARGIN);
  }
}

let resizeTimer;
function scheduleFit(){
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fitToViewport, 100);
}

window.addEventListener('load', fitToViewport);
window.addEventListener('resize', scheduleFit);

if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(fitToViewport);
}

document.addEventListener('DOMContentLoaded', () => {
  fitToViewport();
  const frame = document.querySelector('.frame');
  if(frame){
    new MutationObserver(scheduleFit).observe(frame, { childList:true, subtree:true });
  }
});
