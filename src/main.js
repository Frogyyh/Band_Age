import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import './style.css';

const container = document.querySelector('#scene');
const toggleButton = document.querySelector('#toggleButton');
const buttonText = document.querySelector('#buttonText');
const statusText = document.querySelector('#statusText');
const meterBar = document.querySelector('#meterBar');
const loading = document.querySelector('#loading');
const loadingPercent = document.querySelector('#loadingPercent');
const errorBox = document.querySelector('#error');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090b0d);
scene.fog = new THREE.FogExp2(0x090b0d, 0.018);

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.01, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
container.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xc6d9ff, 0x181007, 1.8));

const keyLight = new THREE.DirectionalLight(0xffead8, 4.2);
keyLight.position.set(-4, 7, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xff4f18, 5);
rimLight.position.set(5, 4, -5);
scene.add(rimLight);

const fillLight = new THREE.PointLight(0x4f72ff, 22, 20);
fillLight.position.set(-5, 2, 3);
scene.add(fillLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(30, 96),
  new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.82, metalness: 0.12 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(40, 40, 0x2d2925, 0x181a1c);
grid.material.transparent = true;
grid.material.opacity = 0.35;
scene.add(grid);

let mixer;
let action;
let isPlaying = true;
let modelCenter = new THREE.Vector3();
const clock = new THREE.Clock();

function frameModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  const adjustedBox = new THREE.Box3().setFromObject(model);
  modelCenter = adjustedBox.getCenter(new THREE.Vector3());
  const adjustedSize = adjustedBox.getSize(new THREE.Vector3());
  const fitHeight = Math.max(adjustedSize.y, adjustedSize.x * 0.7);
  const distance = fitHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.18;

  // FBX characters commonly face +Z; viewing from +Z gives a frontal portrait.
  camera.position.set(0, modelCenter.y * 0.98, distance + adjustedSize.z * 0.5);
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = distance * 10;
  camera.lookAt(modelCenter.x, modelCenter.y * 0.95, modelCenter.z);
  camera.updateProjectionMatrix();

  floor.position.y = -0.015;
  grid.position.y = 0;
  scene.fog.density = 0.45 / Math.max(size.length(), 1);
}

function updateUI() {
  toggleButton.classList.toggle('is-paused', !isPlaying);
  buttonText.textContent = isPlaying ? 'PAUSE' : 'PLAY';
  statusText.textContent = isPlaying ? 'PLAYING' : 'PAUSED';
  meterBar.classList.toggle('paused', !isPlaying);
  toggleButton.setAttribute('aria-label', isPlaying ? '애니메이션 일시정지' : '애니메이션 재생');
}

function toggleAnimation() {
  if (!action) return;
  isPlaying = !isPlaying;
  action.paused = !isPlaying;
  updateUI();
}

toggleButton.addEventListener('click', toggleAnimation);
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && !event.repeat) {
    event.preventDefault();
    toggleAnimation();
  }
});

new FBXLoader().load(
  '/models/Playing%20Drums.fbx',
  (model) => {
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          material.roughness = Math.max(material.roughness ?? 0.5, 0.42);
          material.needsUpdate = true;
        });
      }
    });

    scene.add(model);
    frameModel(model);

    if (model.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      action = mixer.clipAction(model.animations[0]);
      action.setLoop(THREE.LoopRepeat, Infinity).play();
      toggleButton.disabled = false;
      updateUI();
    } else {
      statusText.textContent = 'NO MOTION';
      buttonText.textContent = 'UNAVAILABLE';
      toggleButton.disabled = true;
    }
    loading.classList.add('is-hidden');
  },
  (xhr) => {
    if (xhr.total) loadingPercent.textContent = `${Math.round((xhr.loaded / xhr.total) * 100)}%`;
  },
  (error) => {
    console.error(error);
    loading.classList.add('is-hidden');
    errorBox.hidden = false;
    errorBox.textContent = '모델을 불러오지 못했습니다. 개발 서버를 통해 접속했는지 확인해 주세요.';
    statusText.textContent = 'ERROR';
  }
);

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  if (mixer) mixer.update(delta);
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});
