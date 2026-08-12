import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BandAgeAudio } from './band-age-audio.js';
import './stage.css';

const container = document.querySelector('#scene');
const maskButtons = [...document.querySelectorAll('.mask-button')];
const artistPanel = document.querySelector('#artistPanel');
const artistName = document.querySelector('#artistName');
const artistMotionButton = document.querySelector('#artistMotionButton');
const artistSaveButton = document.querySelector('#artistSaveButton');
const artistExitButton = document.querySelector('#artistExitButton');
const mixPanel = document.querySelector('#mixPanel');
const mixVolSlider = document.querySelector('#mixVolSlider');
const mixVolVal = document.querySelector('#mixVolVal');
const mixPitchSlider = document.querySelector('#mixPitchSlider');
const mixPitchVal = document.querySelector('#mixPitchVal');
const mixPanSlider = document.querySelector('#mixPanSlider');
const mixPanVal = document.querySelector('#mixPanVal');
const mixEqLowSlider = document.querySelector('#mixEqLowSlider');
const mixEqLowVal = document.querySelector('#mixEqLowVal');
const mixEqMidSlider = document.querySelector('#mixEqMidSlider');
const mixEqMidVal = document.querySelector('#mixEqMidVal');
const mixEqHighSlider = document.querySelector('#mixEqHighSlider');
const mixEqHighVal = document.querySelector('#mixEqHighVal');
const mixReverbSlider = document.querySelector('#mixReverbSlider');
const mixReverbVal = document.querySelector('#mixReverbVal');
const audioBar = document.querySelector('#audioBar');
const audioPlayButton = document.querySelector('#audioPlayButton');
const audioResetButton = document.querySelector('#audioResetButton');
const audioStatus = document.querySelector('#audioStatus');
const audioProgressWrap = document.querySelector('#audioProgressWrap');
const audioProgressFill = document.querySelector('#audioProgressFill');
const audioTime = document.querySelector('#audioTime');
const songTitle = document.querySelector('#songTitle');
const publishButton = document.querySelector('#publishButton');
const timelineToggleButton = document.querySelector('#timelineToggleButton');
const stemTimelinePanel = document.querySelector('#stemTimelinePanel');
const stemTimelineRows = document.querySelector('#stemTimelineRows');
const timelinePlayheads = [];

// ── AI 음원 분리 결과(MY SONG) 연동 ─────────────────────────────
// 로비(lobby.html)에서 업로드 → 분리 완료 후 sessionStorage에 저장해 둔 stem 정보를 이어받는다.
// 둘 다 상대경로: 로컬은 vite proxy, 배포는 nginx가 각각 8000/4000으로 연결해준다.
const SEPARATE_ORIGIN = '';
const API_BASE = '/api';
const STEM_TO_PERFORMER = { vocals: 'Singer', drums: 'Drum', bass: 'Bass', guitar: 'Guitar', piano: 'Piano', other: 'DJ' };
const bandAudio = new BandAgeAudio(SEPARATE_ORIGIN);
let bandAudioReady = false;

function fmtTime(s) {
  s = Math.max(0, s || 0);
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

async function initBandAgeAudio() {
  const raw = sessionStorage.getItem('bandage_session');
  if (!raw) return;
  sessionStorage.removeItem('bandage_session'); // 새로고침 시 같은 세션을 다시 로드하려다 실패하지 않도록 1회성으로 소비
  let saved;
  try { saved = JSON.parse(raw); } catch (_) { return; }
  if (!saved?.stems) return;

  try {
    audioStatus.textContent = 'MY SONG 불러오는 중…';
    audioBar.classList.add('is-visible');
    await bandAudio.loadStems(saved.stems, saved.sessionId);
    bandAudioReady = true;
    buildStemTimeline();
    audioStatus.textContent = 'MY SONG — 악기를 클릭하면 해당 파트만 솔로로 들립니다';
    audioTime.textContent = `0:00 / ${fmtTime(bandAudio.duration)}`;

    if (saved.songName) {
      songTitle.textContent = saved.songName;
      songTitle.classList.add('is-visible');
    }
    publishButton.classList.add('is-visible');
  } catch (error) {
    console.error('[Band Age] Failed to load separated stems:', error);
    audioStatus.textContent = '음원을 불러오지 못했습니다.';
  }
}
initBandAgeAudio();

audioPlayButton.addEventListener('click', () => {
  if (!bandAudioReady) return;
  setPerformancePaused(bandAudio.isPlaying);
});

// ── 진행바(탐색) ────────────────────────────────────────────────
bandAudio.addEventListener('timeupdate', ({ detail }) => {
  const ratio = detail.duration ? Math.min(detail.currentTime / detail.duration, 1) : 0;
  audioProgressFill.style.width = `${ratio * 100}%`;
  updateTimelinePlayheads(ratio);
  audioTime.textContent = `${fmtTime(detail.currentTime)} / ${fmtTime(detail.duration)}`;
});
bandAudio.addEventListener('stop', () => {
  performancePaused = true;
  audioProgressFill.style.width = '0%';
  updateTimelinePlayheads(0);
  audioTime.textContent = `0:00 / ${fmtTime(bandAudio.duration)}`;
  audioPlayButton.textContent = '▶ PLAY';
});
audioProgressWrap.addEventListener('click', (event) => {
  if (!bandAudioReady || !bandAudio.duration) return;
  const rect = audioProgressWrap.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  bandAudio.seekTo(ratio * bandAudio.duration);
  audioProgressFill.style.width = `${Math.min(Math.max(ratio, 0), 1) * 100}%`;
  updateTimelinePlayheads(ratio);
});

timelineToggleButton.addEventListener('click', () => {
  const open = !stemTimelinePanel.classList.contains('is-open');
  stemTimelinePanel.classList.toggle('is-open', open);
  timelineToggleButton.classList.toggle('is-open', open);
  timelineToggleButton.setAttribute('aria-expanded', String(open));
  stemTimelinePanel.setAttribute('aria-hidden', String(!open));
});

function updateTimelinePlayheads(ratio) {
  const left = `${THREE.MathUtils.clamp(ratio, 0, 1) * 100}%`;
  timelinePlayheads.forEach((playhead) => { playhead.style.left = left; });
}

function buildStemTimeline() {
  stemTimelineRows.replaceChildren();
  timelinePlayheads.length = 0;
  const colors = {
    vocals: '#d7f5ff', drums: '#8ee5ff', bass: '#ffd08a',
    guitar: '#a7ff5b', piano: '#f4c97a', other: '#b7a6ff'
  };
  const labels = { vocals: 'VOCALS', drums: 'DRUMS', bass: 'BASS', guitar: 'GUITAR', piano: 'PIANO', other: 'DJ' };

  bandAudio.stems.forEach((stemName) => {
    const row = document.createElement('div');
    row.className = 'stem-timeline-row';
    const label = document.createElement('span');
    label.className = 'stem-timeline-label';
    label.textContent = labels[stemName] || stemName.toUpperCase();
    const track = document.createElement('div');
    track.className = 'stem-timeline-track';
    track.title = `${label.textContent} 재생 위치로 이동`;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 52;
    const ctx = canvas.getContext('2d');
    const envelope = bandAudio.getStemEnvelope(stemName, 300);
    ctx.fillStyle = colors[stemName] || '#a7ff5b';
    envelope.forEach((level, index) => {
      if (level < 0.025) return;
      const x = index / envelope.length * canvas.width;
      const width = Math.max(1, canvas.width / envelope.length - 1);
      const height = Math.max(1, level * canvas.height * 0.88);
      ctx.globalAlpha = 0.28 + level * 0.72;
      ctx.fillRect(x, (canvas.height - height) / 2, width, height);
    });
    ctx.globalAlpha = 1;
    const playhead = document.createElement('span');
    playhead.className = 'stem-timeline-playhead';
    timelinePlayheads.push(playhead);
    track.append(canvas, playhead);
    track.addEventListener('click', (event) => {
      if (!bandAudio.duration) return;
      const rect = track.getBoundingClientRect();
      const ratio = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0, 1);
      bandAudio.seekTo(ratio * bandAudio.duration);
      audioProgressFill.style.width = `${ratio * 100}%`;
      updateTimelinePlayheads(ratio);
    });
    row.append(label, track);
    stemTimelineRows.append(row);
  });
}

// ── 되돌리기: 믹스/이펙트를 원본으로 복구 + 솔로 해제(전체 합주) ──
audioResetButton.addEventListener('click', () => {
  if (!bandAudioReady) return;
  stoppedPerformers.clear();
  bandAudio.resetAll();
  syncPerformanceStems();
  updateArtistControlButton();
  audioStatus.textContent = 'MY SONG — 악기를 클릭하면 해당 파트만 솔로로 들립니다';
});

// 방금 렌더링한 wav Blob의 재생 시간(초)을 읽는다. 곡 목록에 표시할 재생시간용.
function readBlobDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
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

// 믹스다운한 곡을 "사용자의 커스텀"(전체 공개 목록)에 실제로 업로드한다.
// 본인 소유로 저장되므로 마이페이지의 "내가 커스텀한 곡"에도 같이 뜬다.
async function uploadMixdownToLibrary(blob, title) {
  try {
    const duration = await readBlobDuration(blob);
    const formData = new FormData();
    formData.append('file', blob, `${title}.wav`);
    formData.append('title', title);
    if (duration) formData.append('duration', String(Math.round(duration)));

    const res = await fetch(`${API_BASE}/songs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('band_age_token')}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      audioStatus.textContent = data.message || '커스텀 곡 저장에 실패했습니다.';
      return;
    }
    audioStatus.textContent = '"사용자의 커스텀"에 저장됐어요!';
  } catch (error) {
    console.error('[Band Age] Failed to upload mixdown:', error);
    audioStatus.textContent = '커스텀 곡 저장 중 서버에 연결하지 못했습니다.';
  }
}

// 렌더링된 믹스다운 blob을 로컬 파일로 저장한다. 업로드와는 서로 영향을 주지 않는 별개 동작.
function downloadMixdownLocally(blob, title) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title}.wav`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ── 나의 음악 게시하기: 현재 솔로/믹스 상태를 wav로 믹다운해서, 로컬 다운로드와
// 커스텀 목록 업로드를 서로 기다리지 않고 각자 독립적으로 진행한다. ──
publishButton.addEventListener('click', async () => {
  if (!bandAudioReady || publishButton.disabled) return;

  const title = (prompt('저장할 곡 제목을 입력하세요.', songTitle.textContent || 'bandage-mix') || '').trim();
  if (!title) return; // 취소했거나 빈 값이면 추출하지 않는다.

  const originalLabel = publishButton.textContent;
  publishButton.disabled = true;
  publishButton.textContent = '믹스다운 중…';
  try {
    // 아티스트 상세 화면의 솔로 상태와 관계없이 저장된 전체 파트 설정을 병합한다.
    const mixStemNames = bandAudio.stems.filter((stemName) => {
      const performerName = performerNameForStem(stemName);
      return !performerName || !stoppedPerformers.has(performerName);
    });
    const blob = await bandAudio.renderMixdown(mixStemNames);
    if (!blob) {
      audioStatus.textContent = '들리는 파트가 없어 다운로드할 수 없습니다.';
      return;
    }

    publishButton.textContent = '다운로드 + 커스텀 목록 저장 중…';
    try {
      downloadMixdownLocally(blob, title);
    } catch (error) {
      console.error('[Band Age] Local download failed:', error);
    }
    uploadMixdownToLibrary(blob, title).catch((error) => {
      console.error('[Band Age] Failed to upload mixdown:', error);
    });
  } catch (error) {
    console.error('[Band Age] Failed to render mixdown:', error);
    audioStatus.textContent = '믹스다운에 실패했습니다.';
  } finally {
    publishButton.disabled = false;
    publishButton.textContent = originalLabel;
  }
});

window.addEventListener('beforeunload', () => {
  if (bandAudioReady) bandAudio.dispose();
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071116);
scene.fog = new THREE.FogExp2(0x071116, 0.0095);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.05, 150);
camera.position.set(0, 13, 38);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.34;
container.appendChild(renderer.domElement);

// Default camera: above and in front of the singer. Drag to orbit the stage.
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 3.5, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.065;
orbit.enablePan = false;
orbit.minDistance = 18;
orbit.maxDistance = 60;
orbit.minPolarAngle = THREE.MathUtils.degToRad(28);
orbit.maxPolarAngle = THREE.MathUtils.degToRad(82);
orbit.update();

const stageWidth = 30;
const stageDepth = 24;
const stageHeight = 0.65;
const stage = new THREE.Mesh(
  new THREE.BoxGeometry(stageWidth, stageHeight, stageDepth),
  new THREE.MeshPhysicalMaterial({
    color: 0x173b49,
    metalness: 0.82,
    roughness: 0.23,
    clearcoat: 0.7,
    clearcoatRoughness: 0.16
  })
);
stage.position.y = -stageHeight / 2;
stage.receiveShadow = true;
scene.add(stage);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(90, 90),
  new THREE.MeshPhysicalMaterial({ color: 0x03090c, metalness: 0.72, roughness: 0.32, clearcoat: 0.55 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -stageHeight - 0.01;
ground.receiveShadow = true;
scene.add(ground);

scene.add(new THREE.HemisphereLight(0x78aabd, 0x05090c, 0.82));

// 무대 바닥의 동심원과 패널 라인이 공연 영역을 하나로 묶어준다.
const floorAccentMaterial = new THREE.MeshBasicMaterial({ color: 0x69c6df, transparent: true, opacity: 0.27, side: THREE.DoubleSide, toneMapped: false });
[4.8, 8.2, 11.4].forEach((radius) => {
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.055, 96), floorAccentMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.018;
  scene.add(ring);
});
for (let x = -12; x <= 12; x += 3) {
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.018, 21.5), floorAccentMaterial);
  line.position.set(x, 0.02, 0);
  scene.add(line);
}
const centerMark = new THREE.Mesh(
  new THREE.CylinderGeometry(2.25, 2.25, 0.035, 64),
  new THREE.MeshPhysicalMaterial({ color: 0x153b49, emissive: 0x2c8ba8, emissiveIntensity: 0.42, metalness: 0.72, roughness: 0.28 })
);
centerMark.position.y = 0.025;
scene.add(centerMark);

// Dark theatre curtain and shallow vertical folds.
const curtainMaterial = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.96 });
const backCurtain = new THREE.Mesh(new THREE.PlaneGeometry(42, 20), curtainMaterial);
backCurtain.position.set(0, 8.5, -13);
backCurtain.receiveShadow = true;
scene.add(backCurtain);
for (let x = -20; x <= 20; x += 1.25) {
  const fold = new THREE.Mesh(new THREE.BoxGeometry(0.14, 19, 0.22), curtainMaterial);
  fold.position.set(x, 8.5, -12.82);
  scene.add(fold);
}

// Floating square canopy with a luminous central opening.
const canopyY = 16;
const canopyMaterial = new THREE.MeshStandardMaterial({ color: 0x18252b, emissive: 0x050c10, emissiveIntensity: 0.45, metalness: 0.58, roughness: 0.5 });
const canopyParts = [
  [30, 0.7, 8.5, 0, 8.25], [30, 0.7, 8.5, 0, -8.25],
  [10.5, 0.7, 8, 9.75, 0], [10.5, 0.7, 8, -9.75, 0]
];
canopyParts.forEach(([width, height, depth, x, z]) => {
  const part = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), canopyMaterial);
  part.position.set(x, canopyY, z);
  part.castShadow = true;
  part.receiveShadow = true;
  scene.add(part);
});
const openingGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 8),
  new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, toneMapped: false })
);
openingGlow.rotation.x = Math.PI / 2;
openingGlow.position.y = canopyY - 0.37;
scene.add(openingGlow);

// 상부 메인 트러스와 측면 타워: 무대 전체를 감싸는 콘서트 스케일의 구조물.
const trussMaterial = new THREE.MeshStandardMaterial({ color: 0x52656d, metalness: 0.9, roughness: 0.3 });
const trussGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xa8e9ff, transparent: true, opacity: 0.48, toneMapped: false });
function addTrussBeam(width, height, depth, x, y, z, glow = false) {
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), glow ? trussGlowMaterial : trussMaterial);
  beam.position.set(x, y, z);
  beam.castShadow = !glow;
  scene.add(beam);
}
[-14.2, 14.2].forEach((x) => {
  addTrussBeam(0.32, 15.5, 0.32, x, 7.75, -8.8);
  addTrussBeam(0.32, 15.5, 0.32, x, 7.75, 8.8);
  for (let y = 1.4; y < 15; y += 2.2) {
    addTrussBeam(0.8, 0.08, 0.08, x, y, -8.8, true);
    addTrussBeam(0.8, 0.08, 0.08, x, y, 8.8, true);
  }
});
[-8.8, 8.8].forEach((z) => {
  addTrussBeam(28.7, 0.34, 0.34, 0, 15.35, z);
  for (let x = -12; x <= 12; x += 3) addTrussBeam(1.4, 0.07, 0.07, x, 15.05, z, true);
});

// 무대와 상부 구조물을 함께 감싸는 대형 워시 라이트.
const mainRigWash = new THREE.SpotLight(0xd9f5ff, 900, 52, THREE.MathUtils.degToRad(58), 0.78, 1.0);
mainRigWash.position.set(0, 24, 5);
mainRigWash.target.position.set(0, 0, -1);
mainRigWash.castShadow = true;
mainRigWash.shadow.mapSize.set(2048, 2048);
scene.add(mainRigWash, mainRigWash.target);
const mainLightBeam = new THREE.Mesh(
  new THREE.ConeGeometry(16.5, 23, 64, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xbdeeff, transparent: true, opacity: 0.027, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
);
mainLightBeam.position.set(0, 11.5, -1);
scene.add(mainLightBeam);

// 양옆 LED 토템과 후면 발광 패널로 빈 공간을 채운다.
[-12.8, 12.8].forEach((x) => {
  const tower = new THREE.Group();
  for (let y = 1.2; y <= 10.8; y += 1.6) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 1.05, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x18323c, emissive: y % 3 < 1 ? 0x68c9e6 : 0xffc77b, emissiveIntensity: 1.15, metalness: 0.55, roughness: 0.34 })
    );
    panel.position.set(0, y, 0);
    tower.add(panel);
  }
  tower.position.set(x, 0, -5.8);
  scene.add(tower);
});
for (let x = -9; x <= 9; x += 3) {
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 5.5, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x132830, emissive: x % 2 === 0 ? 0x1e738d : 0x6c512e, emissiveIntensity: 0.55, metalness: 0.48, roughness: 0.42 })
  );
  panel.position.set(x, 4.1, -12.45);
  scene.add(panel);
}

const lightTargets = [
  { name: 'Singer', position: [0, 9], color: 0xf0fbff, intensity: 1050, radius: 2.5 },
  { name: 'Bass', position: [8.2, 6.2], color: 0xffbd66, intensity: 900, radius: 2.25 },
  { name: 'DJ', position: [10.6, -2], color: 0x69ddff, intensity: 860, radius: 2.3 },
  { name: 'Drum', position: [0, -7.5], color: 0x7ccfff, intensity: 1120, radius: 2.9 },
  { name: 'Piano', position: [-10.6, -2], color: 0xffd27d, intensity: 920, radius: 2.45 },
  { name: 'Guitar', position: [-8.2, 6.2], color: 0xa7ff5b, intensity: 900, radius: 2.25 }
];

const performerLights = new Map();
lightTargets.forEach(({ name, position: [x, z], color, intensity, radius }) => {
  const light = new THREE.SpotLight(color, intensity, 35, THREE.MathUtils.degToRad(11.5), 0.32, 1.35);
  light.intensity = 0;
  light.position.set(x * 0.42, canopyY - 0.7, z * 0.35);
  light.target.position.set(x, 0, z);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 2;
  light.shadow.camera.far = 32;
  scene.add(light, light.target);

  const beamHeight = canopyY - 0.5;
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(radius, beamHeight, 32, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  );
  beam.position.set(x, beamHeight / 2, z);
  scene.add(beam);
  const floorGlow = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.95, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  );
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.set(x, 0.045, z);
  scene.add(floorGlow);
  performerLights.set(name, { light, beam, floorGlow, intensity, beamOpacity: 0.045, currentIntensity: 0, currentBeamOpacity: 0, currentFloorOpacity: 0 });
});

const stageWash = new THREE.SpotLight(0x9edcff, 650, 42, THREE.MathUtils.degToRad(46), 0.72, 1.2);
stageWash.position.set(0, canopyY - 1, 0);
stageWash.target.position.set(0, 0, 0);
scene.add(stageWash, stageWash.target);

const frontFill = new THREE.DirectionalLight(0x9ac6d7, 1.9);
frontFill.position.set(0, 7, 18);
scene.add(frontFill);

// Warm floor-level strips create the soft perimeter glow in the reference.
const stripMaterial = new THREE.MeshBasicMaterial({ color: 0xffd59c, toneMapped: false });
[-11.5, 11.5].forEach((z) => {
  const strip = new THREE.Mesh(new THREE.BoxGeometry(29, 0.08, 0.08), stripMaterial);
  strip.position.set(0, 0.08, z);
  scene.add(strip);
});

const performanceRoot = new THREE.Group();
performanceRoot.name = 'BandPerformance';
scene.add(performanceRoot);

const PLAYER_SCALE = 0.025;
const performerMixers = new Map();
const heldSticks = [];
const stickTransforms = {
  left: {
    offset: [-0.4, 0.42, 0.06],
    rotation: [0, THREE.MathUtils.degToRad(185), THREE.MathUtils.degToRad(25)]
  },
  right: {
    offset: [0.32, 0.5, 0.08],
    rotation: [THREE.MathUtils.degToRad(-795), THREE.MathUtils.degToRad(-40), 0]
  }
};
const heldMicrophones = [];
const heldInstruments = [];
const performers = [];
const playerMasks = new Map();
let activeMask = null;
const stoppedPerformers = new Set();
const performerActivity = new Map();
let performancePaused = false;
let lightingFocus = null;
const finalTransforms = {
  guitar: {
    offset: [-0.05, -0.4, 0.12],
    rotation: [
      THREE.MathUtils.degToRad(-465),
      THREE.MathUtils.degToRad(-290),
      THREE.MathUtils.degToRad(285)
    ]
  },
  microphone: {
    offset: [-0.25, 0.2, 0.05],
    rotation: [0, 0, THREE.MathUtils.degToRad(-75)]
  }
};
const clock = new THREE.Clock();

// Viewed from the initial camera (+Z): singer, bass, DJ, drums, piano, guitar.
const playerLayout = [
  { name: 'Singer', file: 'Singer.fbx', position: [0, 0, 9.0] },
  { name: 'Bass', file: 'BassPlayer.fbx', position: [8.2, 0, 6.2] },
  { name: 'DJ', file: 'DJPlayer.fbx', position: [10.6, 0, -2.0] },
  { name: 'Piano', file: 'PianoPlayer.fbx', position: [-10.6, 0, -2.0] },
  { name: 'Guitar', file: 'GuitarPlayer.fbx', position: [-8.2, 0, 6.2] }
];

const focusPoints = new Map([
  ['Singer', new THREE.Vector3(0, 1.7, 9.0)],
  ['Bass', new THREE.Vector3(8.2, 1.7, 6.2)],
  ['DJ', new THREE.Vector3(10.6, 1.8, -2.0)],
  ['Drum', new THREE.Vector3(0, 2.0, -7.5)],
  ['Piano', new THREE.Vector3(-10.6, 1.8, -2.0)],
  ['Guitar', new THREE.Vector3(-8.2, 1.7, 6.2)]
]);

focusPoints.forEach((point, performerName) => {
  const isDrum = performerName === 'Drum';
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(isDrum ? 9 : 4.2, isDrum ? 6 : 5.5, isDrum ? 7 : 4.2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  proxy.name = `${performerName}ClickTarget`;
  proxy.position.set(point.x, isDrum ? 2.5 : 2.4, point.z);
  proxy.userData.performerName = performerName;
  scene.add(proxy);
});

const instrumentLayout = [
  { player: 'Bass', file: 'bass.glb', scale: 0.03, rotation: [Math.PI / 2, Math.PI * 10 / 9, -0.18], offset: [0, -0.2, 0.12], held: true, gripAxis: [0, 1, 0] },
  { player: 'DJ', file: 'djtable.glb', scale: 0.0097, rotation: [0, Math.PI, 0], offset: [0, 0, 1.1] },
  { player: 'Piano', file: 'piano.glb', scale: 3.6, rotation: [0, Math.PI / 2, 0], offset: [0, 0, 1.4] },
  { player: 'Guitar', file: 'guitar.glb', scale: 0.7, rotation: [THREE.MathUtils.degToRad(-465), THREE.MathUtils.degToRad(-290), THREE.MathUtils.degToRad(285)], offset: [-0.05, -0.4, 0.12], held: true, gripAxis: [1, 0, 0] }
];

function prepareModel(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      if ('roughness' in material) material.roughness = Math.max(material.roughness ?? 0.5, 0.38);
      material.needsUpdate = true;
    });
  });
}

function markInteractive(root, performerName) {
  root.traverse((object) => {
    if (object.isMesh || object.isSkinnedMesh) object.userData.performerName = performerName;
  });
}

function playFirstAnimation(model, performerName) {
  const clip = model.animations.find((item) => item.duration > 0 && item.tracks.length > 0);
  if (!clip) return;
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
  mixer.timeScale = 0;
  mixer.update(0);
  performerMixers.set(performerName, mixer);
}

function loadFBX(file) {
  return new Promise((resolve, reject) => {
    new FBXLoader().load(`/models/Player/${file}`, resolve, undefined, reject);
  });
}

function loadDrumSet() {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load('/models/instrument/drum.glb', (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

function loadInstrument(file) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(`/models/instrument/${file}`, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

function loadHeadModel(file) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(`/models/${file}`, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

function placeStandingPlayer(model, config) {
  model.name = config.name;
  model.scale.setScalar(PLAYER_SCALE);
  model.rotation.y = 0;
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  wrapper.name = `${config.name}Position`;
  wrapper.position.set(...config.position);
  model.position.set(-center.x, -box.min.y, -center.z);
  wrapper.add(model);
  performanceRoot.add(wrapper);
  prepareModel(model);
  markInteractive(model, config.name);
  playFirstAnimation(model, config.name);
  performers.push(model);
}

function setupPlayerMasks(maskModels) {
  performers.forEach((performer) => {
    const head = performer.getObjectByName('mixamorigHead');
    if (!head) return;

    Object.entries(maskModels).forEach(([key, source]) => {
      let selectedSource = source;
      if (!selectedSource) return;

      const content = selectedSource.clone(true);
      prepareModel(content);
      content.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(content);
      const center = box.getCenter(new THREE.Vector3());
      const height = Math.max(box.max.y - box.min.y, 0.001);
      const normalizationScale = 1.05 / height;
      content.scale.multiplyScalar(normalizationScale);
      content.position.copy(center).multiplyScalar(-normalizationScale);

      const mask = new THREE.Group();
      mask.name = `${performer.name}${key}Mask`;
      mask.visible = false;
      mask.add(content);
      scene.add(mask);
      if (!playerMasks.has(key)) playerMasks.set(key, []);
      playerMasks.get(key).push({ mask, head, key });
    });
  });
}

function updatePlayerMasks() {
  const headPosition = new THREE.Vector3();
  const headQuaternion = new THREE.Quaternion();
  const offset = new THREE.Vector3();
  const facingCorrection = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, Math.PI, Math.PI));
  playerMasks.forEach((entries) => entries.forEach(({ mask, head, key }) => {
    if (!mask.visible) return;
    head.getWorldPosition(headPosition);
    head.getWorldQuaternion(headQuaternion);
    offset.set(0, key === 'frog' ? 0.15 : 0.08, key === 'frog' ? 0.16 : 0.06).applyQuaternion(headQuaternion);
    mask.position.copy(headPosition).add(offset);
    mask.quaternion.copy(headQuaternion).multiply(facingCorrection);
  }));
}

function setActiveMask(key) {
  activeMask = activeMask === key ? null : key;
  playerMasks.forEach((entries, maskKey) => {
    entries.forEach(({ mask }) => { mask.visible = maskKey === activeMask; });
  });
  maskButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mask === activeMask));
  });
}

maskButtons.forEach((button) => button.addEventListener('click', () => setActiveMask(button.dataset.mask)));

function placeInstrument(model, config) {
  const playerConfig = playerLayout.find((item) => item.name === config.player);
  if (!playerConfig) return;

  model.name = `${config.player}Instrument`;
  model.scale.setScalar(config.scale);
  model.rotation.set(...(config.player === 'Guitar' ? finalTransforms.guitar.rotation : config.rotation));
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, config.held ? -center.y : -box.min.y, -center.z);

  const wrapper = new THREE.Group();
  wrapper.name = `${config.player}InstrumentPosition`;
  wrapper.position.set(
    playerConfig.position[0] + config.offset[0],
    config.offset[1],
    playerConfig.position[2] + config.offset[2]
  );
  wrapper.add(model);
  performanceRoot.add(wrapper);
  prepareModel(model);
  markInteractive(model, config.player);

  if (config.held) {
    const player = performanceRoot.getObjectByName(config.player);
    const leftHand = player?.getObjectByName('mixamorigLeftHand');
    const rightHand = player?.getObjectByName('mixamorigRightHand');
    if (leftHand && rightHand) {
      const tuning = config.player === 'Guitar' ? finalTransforms.guitar : null;
      heldInstruments.push({
        player: config.player,
        model,
        wrapper,
        leftHand,
        rightHand,
        offset: new THREE.Vector3(...(tuning?.offset ?? config.offset)),
        gripAxis: new THREE.Vector3(...config.gripAxis).normalize(),
        lastDirection: null
      });
    }
  }
}

function updateHeldInstruments() {
  const leftPosition = new THREE.Vector3();
  const rightPosition = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  const handDirection = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  const worldForward = new THREE.Vector3(0, 0, 1);
  const localHandAxis = new THREE.Vector3(1, 0, 0);
  const rotationMatrix = new THREE.Matrix4();
  const targetQuaternion = new THREE.Quaternion();
  const gripCorrection = new THREE.Quaternion();

  heldInstruments.forEach((held) => {
    const { wrapper, leftHand, rightHand, offset, gripAxis } = held;
    leftHand.getWorldPosition(leftPosition);
    rightHand.getWorldPosition(rightPosition);
    midpoint.addVectors(leftPosition, rightPosition).multiplyScalar(0.5);
    handDirection.subVectors(rightPosition, leftPosition).normalize();

    // Preserve the previous direction when the animated hands cross. This
    // prevents a sudden 180/360-degree instrument flip.
    if (held.lastDirection && handDirection.dot(held.lastDirection) < 0) handDirection.negate();
    if (!held.lastDirection) held.lastDirection = new THREE.Vector3();
    held.lastDirection.copy(handDirection);

    forward.copy(worldForward).addScaledVector(handDirection, -worldForward.dot(handDirection));
    if (forward.lengthSq() < 0.0001) forward.set(0, 1, 0);
    forward.normalize();
    up.crossVectors(forward, handDirection).normalize();
    forward.crossVectors(handDirection, up).normalize();
    rotationMatrix.makeBasis(handDirection, up, forward);
    targetQuaternion.setFromRotationMatrix(rotationMatrix);
    gripCorrection.setFromUnitVectors(gripAxis, localHandAxis);
    targetQuaternion.multiply(gripCorrection);

    wrapper.position.copy(midpoint).add(offset);
    wrapper.quaternion.slerp(targetQuaternion, 0.24);
  });
}

function setupSingerMicrophone(microphone, singer) {
  prepareModel(microphone);
  microphone.scale.setScalar(0.32);
  microphone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(microphone);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  microphone.position.set(-center.x, -center.y, -center.z);

  const dimensions = [size.x, size.y, size.z];
  const longestAxis = dimensions.indexOf(Math.max(...dimensions));
  const axis = new THREE.Vector3(
    longestAxis === 0 ? 1 : 0,
    longestAxis === 1 ? 1 : 0,
    longestAxis === 2 ? 1 : 0
  );
  const hand = singer.getObjectByName('mixamorigRightHand');
  if (!hand) return;

  const holder = new THREE.Group();
  holder.name = 'SingerMicrophone';
  holder.add(microphone);
  markInteractive(microphone, 'Singer');
  scene.add(holder);
  heldMicrophones.push({
    holder,
    hand,
    axis,
    length: dimensions[longestAxis],
    manualOffset: new THREE.Vector3(...finalTransforms.microphone.offset),
    manualRotation: new THREE.Euler(...finalTransforms.microphone.rotation)
  });
}

function updateHeldMicrophones() {
  const handPosition = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const handQuaternion = new THREE.Quaternion();
  const manualQuaternion = new THREE.Quaternion();
  const rotatedOffset = new THREE.Vector3();
  heldMicrophones.forEach(({ holder, hand, axis, length, manualOffset, manualRotation }) => {
    hand.getWorldPosition(handPosition);
    hand.getWorldQuaternion(handQuaternion);
    manualQuaternion.setFromEuler(manualRotation);
    holder.quaternion.copy(handQuaternion).multiply(manualQuaternion);
    direction.copy(axis).applyQuaternion(holder.quaternion).normalize();
    rotatedOffset.copy(manualOffset).applyQuaternion(handQuaternion);
    holder.position
      .copy(handPosition)
      .addScaledVector(direction, length * 0.22)
      .add(rotatedOffset);
  });
}

function makeHeldSticks(stickModel, drummer) {
  prepareModel(stickModel);
  stickModel.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(stickModel);
  const center = box.getCenter(new THREE.Vector3());
  stickModel.position.set(-center.x, -center.y, -center.z);

  ['mixamorigLeftHand', 'mixamorigRightHand'].forEach((handName) => {
    const hand = drummer.getObjectByName(handName);
    if (!hand) return;
    const side = handName.includes('Left') ? 'left' : 'right';
    const holder = new THREE.Group();
    holder.name = `${handName}DrumStick`;
    holder.scale.setScalar(3.0);
    holder.add(stickModel.clone(true));
    markInteractive(holder, 'Drum');
    scene.add(holder);
    heldSticks.push({
      side,
      holder,
      hand,
      offset: new THREE.Vector3(...stickTransforms[side].offset),
      rotation: new THREE.Euler(...stickTransforms[side].rotation)
    });
  });
}

function updateHeldSticks() {
  const handPosition = new THREE.Vector3();
  const handQuaternion = new THREE.Quaternion();
  const manualQuaternion = new THREE.Quaternion();
  const rotatedOffset = new THREE.Vector3();
  heldSticks.forEach(({ holder, hand, offset, rotation }) => {
    hand.getWorldPosition(handPosition);
    hand.getWorldQuaternion(handQuaternion);
    manualQuaternion.setFromEuler(rotation);
    holder.quaternion.copy(handQuaternion).multiply(manualQuaternion);
    rotatedOffset.copy(offset).applyQuaternion(handQuaternion);
    holder.position.copy(handPosition).add(rotatedOffset);
  });
}

async function placeDrumPerformance() {
  const [drummer, drumSet, stickModel] = await Promise.all([
    loadFBX('DrumPlayer.fbx'),
    loadDrumSet(),
    loadInstrument('drum_stick.glb')
  ]);
  const drumGroup = new THREE.Group();
  drumGroup.name = 'DrumPosition';
  drumGroup.position.set(0, 0, -7.5);
  drumSet.scale.setScalar(0.8);
  drumGroup.add(drumSet, drummer);

  drummer.scale.setScalar(PLAYER_SCALE);
  drummer.position.set(-0.23, 0, -2.8);
  drummer.rotation.y = 0.1;
  const legacyStick = drumSet.getObjectByName('stick001_1');
  if (legacyStick) legacyStick.visible = false;
  prepareModel(drumSet);
  prepareModel(drummer);
  markInteractive(drumSet, 'Drum');
  markInteractive(drummer, 'Drum');
  performanceRoot.add(drumGroup);
  playFirstAnimation(drummer, 'Drum');
  performers.push(drummer);
  makeHeldSticks(stickModel, drummer);
}

async function loadBand() {
  try {
    const [standingModels, , microphone, instruments, maskModelList] = await Promise.all([
      Promise.all(playerLayout.map((config) => loadFBX(config.file))),
      placeDrumPerformance(),
      loadInstrument('mic.glb'),
      Promise.all(instrumentLayout.map((config) => loadInstrument(config.file))),
      Promise.all([
        loadHeadModel('froghead.glb'), loadHeadModel('sjhead.glb'), loadHeadModel('KGUhead.glb'),
        loadHeadModel('marshmello_head.glb')
      ])
    ]);
    standingModels.forEach((model, index) => placeStandingPlayer(model, playerLayout[index]));
    instruments.forEach((model, index) => placeInstrument(model, instrumentLayout[index]));
    const singerIndex = playerLayout.findIndex((config) => config.name === 'Singer');
    setupSingerMicrophone(microphone, standingModels[singerIndex]);
    setupPlayerMasks(Object.fromEntries(['frog', 'sj', 'kgu', 'marshmello'].map((key, index) => [key, maskModelList[index]])));
  } catch (error) {
    console.error('[Band Age] Failed to load a performer:', error);
  }
}
loadBand();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerStart = new THREE.Vector2();
const homeCameraPosition = new THREE.Vector3();
const homeOrbitTarget = new THREE.Vector3();
let focusedArtist = null;
let cameraTransition = null;

function findPerformerAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const hit = hits.find((item) => item.object.userData.performerName);
  return hit?.object.userData.performerName ?? null;
}

function updateSelectedLighting(name) {
  lightingFocus = name;
}

function updatePerformanceVisuals(delta) {
  performerLights.forEach((entry, performerName) => {
    const stemName = stemNameForPerformer(performerName);
    const manuallyStopped = stoppedPerformers.has(performerName);
    let rawActivity = 0;

    if (!performancePaused && !manuallyStopped) {
      if (bandAudioReady && stemName) {
        const normalizedLevel = bandAudio.getStemActivity(stemName);
        rawActivity = THREE.MathUtils.clamp((normalizedLevel - 0.065) / 0.58, 0, 1);
      } else if (!bandAudioReady) {
        rawActivity = 1;
      }
    }

    const previous = performerActivity.get(performerName) || 0;
    const response = rawActivity > previous ? 0.055 : 0.24;
    const activity = THREE.MathUtils.lerp(previous, rawActivity, 1 - Math.exp(-delta / response));
    performerActivity.set(performerName, activity);

    const focusFactor = lightingFocus && lightingFocus !== performerName ? 0.08 : 1;
    const focusBoost = lightingFocus === performerName ? 1.3 : 1;
    const targetIntensity = entry.intensity * activity * focusFactor * focusBoost;
    const targetBeamOpacity = entry.beamOpacity * activity * focusFactor * (lightingFocus === performerName ? 2.2 : 1);
    const targetFloorOpacity = 0.24 * activity * focusFactor * (lightingFocus === performerName ? 1.35 : 1);
    entry.currentIntensity = THREE.MathUtils.damp(entry.currentIntensity, targetIntensity, 8, delta);
    entry.currentBeamOpacity = THREE.MathUtils.damp(entry.currentBeamOpacity, targetBeamOpacity, 7, delta);
    entry.currentFloorOpacity = THREE.MathUtils.damp(entry.currentFloorOpacity, targetFloorOpacity, 7, delta);
    entry.light.intensity = entry.currentIntensity;
    entry.beam.material.opacity = entry.currentBeamOpacity;
    entry.floorGlow.material.opacity = entry.currentFloorOpacity;

    const mixer = performerMixers.get(performerName);
    if (mixer) mixer.timeScale = activity > 0.055 ? 1 : 0;
  });

  const washTarget = performancePaused
    ? 0
    : lightingFocus
      ? 180
      : bandAudioReady
        ? (bandAudio.isPlaying ? 165 : 0)
        : 360;
  stageWash.intensity = THREE.MathUtils.damp(stageWash.intensity, washTarget, 4.5, delta);
  const rigTarget = performancePaused ? 100 : lightingFocus ? 430 : 900;
  mainRigWash.intensity = THREE.MathUtils.damp(mainRigWash.intensity, rigTarget, 3.2, delta);
  const beamTarget = performancePaused ? 0.003 : lightingFocus ? 0.009 : 0.014;
  mainLightBeam.material.opacity = THREE.MathUtils.damp(mainLightBeam.material.opacity, beamTarget, 3.2, delta);
}

function beginCameraTransition(position, target, onComplete) {
  cameraTransition = {
    startTime: performance.now(),
    duration: 900,
    fromPosition: camera.position.clone(),
    toPosition: position.clone(),
    fromTarget: orbit.target.clone(),
    toTarget: target.clone(),
    onComplete
  };
}

function focusArtist(name) {
  const target = focusPoints.get(name);
  if (!target || focusedArtist) return;
  focusedArtist = name;
  homeCameraPosition.copy(camera.position);
  homeOrbitTarget.copy(orbit.target);
  orbit.enabled = false;
  const distance = name === 'Drum' ? 9.5 : 6.6;
  const cameraPosition = target.clone().add(new THREE.Vector3(0, 1.6, distance));
  beginCameraTransition(cameraPosition, target);
  updateSelectedLighting(name);
  artistName.textContent = name.toUpperCase();
  updateArtistControlButton();
  artistPanel.classList.add('is-open');
  artistPanel.setAttribute('aria-hidden', 'false');
  soloStemForPerformer(name);
  openMixPanel(name);
}

function stemNameForPerformer(performerName) {
  return Object.entries(STEM_TO_PERFORMER).find(([, performer]) => performer === performerName)?.[0];
}

function performerNameForStem(stemName) {
  return STEM_TO_PERFORMER[stemName];
}

function updateArtistControlButton() {
  if (!focusedArtist) return;
  artistMotionButton.textContent = stoppedPerformers.has(focusedArtist)
    ? '해당 아티스트 다시 재생하기'
    : '해당 아티스트 정지하기';
}

function syncPerformanceStems() {
  if (!bandAudioReady) return;
  bandAudio.stems.forEach((stemName) => {
    const performerName = performerNameForStem(stemName);
    const matchesFocus = !focusedArtist || performerName === focusedArtist;
    const shouldPlay = matchesFocus && !stoppedPerformers.has(performerName);
    bandAudio.setStemActive(stemName, shouldPlay);
  });
}

function setPerformancePaused(paused) {
  performancePaused = Boolean(paused);
  if (bandAudioReady) {
    if (performancePaused) {
      bandAudio.pause();
    } else {
      syncPerformanceStems();
      if (bandAudio.activeStems.length > 0 && !bandAudio.isPlaying) bandAudio.play();
    }
    audioPlayButton.textContent = performancePaused ? '▶ PLAY' : '❚❚ PAUSE';
  }
}

function togglePerformance() {
  setPerformancePaused(bandAudioReady ? bandAudio.isPlaying : !performancePaused);
}

// 공연자를 클릭해 포커스하면 해당 파트만 솔로로 들리게 하고, 나머지 파트는 음소거한다.
function soloStemForPerformer(performerName) {
  if (!bandAudioReady) return;
  const stemName = stemNameForPerformer(performerName);
  if (!stemName || !bandAudio.stems.includes(stemName)) return;
  syncPerformanceStems();
}

// ── 파트별 믹싱 패널 (SELECTED ARTIST 패널 안에서 열림) ──────────
let mixTargetStem = null;
let mixSnapshot = null; // 패널을 열었을 때의 설정값 — EXIT 시 여기로 되돌린다.

function fmtPitch(st) { return st === 0 ? '0 st' : `${st > 0 ? '+' : ''}${st} st`; }
function fmtPan(v) {
  if (Math.abs(v) < 0.01) return 'C';
  const pct = Math.round(Math.abs(v) * 100);
  return v < 0 ? `L ${pct}` : `R ${pct}`;
}
function fmtDb(v) { return v === 0 ? '0 dB' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)} dB`; }

function applyStemSettings(stemName, settings) {
  bandAudio.setVolume(stemName, settings.volume);
  bandAudio.setPitch(stemName, settings.pitch);
  bandAudio.setPan(stemName, settings.pan);
  bandAudio.setEQ(stemName, 'low', settings.eq.low);
  bandAudio.setEQ(stemName, 'mid', settings.eq.mid);
  bandAudio.setEQ(stemName, 'high', settings.eq.high);
  bandAudio.setReverb(stemName, settings.reverb);
}

function renderMixSliders(settings) {
  mixVolSlider.value = Math.round(settings.volume * 100);
  mixPitchSlider.value = settings.pitch;
  mixPanSlider.value = Math.round(settings.pan * 100);
  mixEqLowSlider.value = settings.eq.low;
  mixEqMidSlider.value = settings.eq.mid;
  mixEqHighSlider.value = settings.eq.high;
  mixReverbSlider.value = Math.round(settings.reverb * 100);

  mixVolVal.textContent = `${mixVolSlider.value}%`;
  mixPitchVal.textContent = fmtPitch(settings.pitch);
  mixPanVal.textContent = fmtPan(settings.pan);
  mixEqLowVal.textContent = fmtDb(settings.eq.low);
  mixEqMidVal.textContent = fmtDb(settings.eq.mid);
  mixEqHighVal.textContent = fmtDb(settings.eq.high);
  mixReverbVal.textContent = `${mixReverbSlider.value}%`;
}

function openMixPanel(performerName) {
  const stemName = stemNameForPerformer(performerName);
  if (!bandAudioReady || !stemName || !bandAudio.stems.includes(stemName)) {
    mixTargetStem = null;
    mixSnapshot = null;
    mixPanel.classList.remove('is-visible');
    return;
  }
  mixTargetStem = stemName;
  const current = bandAudio.getStemSettings(stemName);
  mixSnapshot = { ...current, eq: { ...current.eq } };
  renderMixSliders(current);
  mixPanel.classList.add('is-visible');
}

function closeMixPanel() {
  mixTargetStem = null;
  mixSnapshot = null;
  mixPanel.classList.remove('is-visible');
}

mixVolSlider.addEventListener('input', () => {
  if (!mixTargetStem) return;
  const v = mixVolSlider.value / 100;
  bandAudio.setVolume(mixTargetStem, v);
  mixVolVal.textContent = `${mixVolSlider.value}%`;
});
mixPitchSlider.addEventListener('input', () => {
  if (!mixTargetStem) return;
  const st = parseInt(mixPitchSlider.value, 10);
  bandAudio.setPitch(mixTargetStem, st);
  mixPitchVal.textContent = fmtPitch(st);
});
mixPanSlider.addEventListener('input', () => {
  if (!mixTargetStem) return;
  const pan = mixPanSlider.value / 100;
  bandAudio.setPan(mixTargetStem, pan);
  mixPanVal.textContent = fmtPan(pan);
});
function makeMixEqHandler(slider, valEl, band) {
  slider.addEventListener('input', () => {
    if (!mixTargetStem) return;
    const db = parseFloat(slider.value);
    bandAudio.setEQ(mixTargetStem, band, db);
    valEl.textContent = fmtDb(db);
  });
}
makeMixEqHandler(mixEqLowSlider, mixEqLowVal, 'low');
makeMixEqHandler(mixEqMidSlider, mixEqMidVal, 'mid');
makeMixEqHandler(mixEqHighSlider, mixEqHighVal, 'high');
mixReverbSlider.addEventListener('input', () => {
  if (!mixTargetStem) return;
  const mix = mixReverbSlider.value / 100;
  bandAudio.setReverb(mixTargetStem, mix);
  mixReverbVal.textContent = `${mixReverbSlider.value}%`;
});

// 저장: 지금 슬라이더 값을 그대로 확정하고 패널을 닫는다.
artistSaveButton.addEventListener('click', () => {
  const savedArtist = focusedArtist;
  exitArtistFocus();
  if (savedArtist) audioStatus.textContent = `${savedArtist.toUpperCase()} 파트 설정이 전체 믹스에 저장되었습니다.`;
});

function exitArtistFocus() {
  if (!focusedArtist) return;
  const returningArtist = focusedArtist;
  focusedArtist = null;
  artistPanel.classList.remove('is-open');
  artistPanel.setAttribute('aria-hidden', 'true');
  updateSelectedLighting(null);
  syncPerformanceStems();
  closeMixPanel();
  beginCameraTransition(homeCameraPosition, homeOrbitTarget, () => {
    if (!focusedArtist && returningArtist) {
      orbit.enabled = true;
      orbit.update();
    }
  });
}

// 나가기: 패널을 열었을 때 상태로 되돌린 뒤 닫는다(=변경사항 취소).
function revertAndExitArtistFocus() {
  if (mixTargetStem && mixSnapshot) applyStemSettings(mixTargetStem, mixSnapshot);
  exitArtistFocus();
}

function updateCameraTransition(now) {
  if (!cameraTransition) return;
  const progress = Math.min((now - cameraTransition.startTime) / cameraTransition.duration, 1);
  const eased = progress * progress * (3 - 2 * progress);
  camera.position.lerpVectors(cameraTransition.fromPosition, cameraTransition.toPosition, eased);
  orbit.target.lerpVectors(cameraTransition.fromTarget, cameraTransition.toTarget, eased);
  camera.lookAt(orbit.target);
  if (progress === 1) {
    const complete = cameraTransition.onComplete;
    cameraTransition = null;
    complete?.();
  }
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerStart.set(event.clientX, event.clientY);
});
renderer.domElement.addEventListener('pointerup', (event) => {
  const moved = pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
  if (moved > 6 || focusedArtist) return;
  const performer = findPerformerAt(event.clientX, event.clientY);
  if (performer) focusArtist(performer);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (event.buttons || focusedArtist) {
    container.classList.remove('can-select');
    return;
  }
  container.classList.toggle('can-select', Boolean(findPerformerAt(event.clientX, event.clientY)));
});

artistExitButton.addEventListener('click', revertAndExitArtistFocus);
artistMotionButton.addEventListener('click', () => {
  if (!focusedArtist) return;
  const stemName = stemNameForPerformer(focusedArtist);
  if (stoppedPerformers.has(focusedArtist)) {
    stoppedPerformers.delete(focusedArtist);
    if (bandAudioReady && stemName) bandAudio.setStemActive(stemName, true);
    if (bandAudioReady && !performancePaused && !bandAudio.isPlaying) bandAudio.play();
  } else {
    stoppedPerformers.add(focusedArtist);
    if (bandAudioReady && stemName) bandAudio.setStemActive(stemName, false);
  }
  updateArtistControlButton();
});

window.addEventListener('keydown', (event) => {
  const isFormControl = event.target instanceof Element && event.target.closest('input, button');
  if (event.code === 'Space' && !event.repeat && !isFormControl) {
    event.preventDefault();
    togglePerformance();
  }
});

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  updatePerformanceVisuals(delta);
  performerMixers.forEach((mixer) => mixer.update(delta));
  updateHeldSticks();
  updateHeldMicrophones();
  updateHeldInstruments();
  updatePlayerMasks();
  updateCameraTransition(performance.now());
  if (!focusedArtist && !cameraTransition) orbit.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});
