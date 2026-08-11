import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './stage.css';

const container = document.querySelector('#scene');
const maskButtons = [...document.querySelectorAll('.mask-button')];
const artistPanel = document.querySelector('#artistPanel');
const artistName = document.querySelector('#artistName');
const artistMotionButton = document.querySelector('#artistMotionButton');
const artistExitButton = document.querySelector('#artistExitButton');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020405);
scene.fog = new THREE.FogExp2(0x020405, 0.014);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.05, 150);
camera.position.set(0, 13, 38);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
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
    color: 0x102a35,
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

scene.add(new THREE.HemisphereLight(0x42677e, 0x030304, 0.8));

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

const lightTargets = [
  { name: 'Singer', position: [0, 9], color: 0xdff7ff, intensity: 950, radius: 2.7 },
  { name: 'Bass', position: [8.2, 6.2], color: 0xffe4b0, intensity: 760, radius: 2.4 },
  { name: 'DJ', position: [10.6, -2], color: 0xc6eaff, intensity: 720, radius: 2.5 },
  { name: 'Drum', position: [0, -7.5], color: 0xc8efff, intensity: 1050, radius: 3.2 },
  { name: 'Piano', position: [-10.6, -2], color: 0xffe1a3, intensity: 740, radius: 2.7 },
  { name: 'Guitar', position: [-8.2, 6.2], color: 0xd8f5ff, intensity: 760, radius: 2.4 }
];

const performerLights = new Map();
lightTargets.forEach(({ name, position: [x, z], color, intensity, radius }) => {
  const light = new THREE.SpotLight(color, intensity, 35, THREE.MathUtils.degToRad(15), 0.5, 1.2);
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
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.032, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  );
  beam.position.set(x, beamHeight / 2, z);
  scene.add(beam);
  performerLights.set(name, { light, beam, intensity, beamOpacity: 0.032 });
});

const stageWash = new THREE.SpotLight(0x9edcff, 650, 42, THREE.MathUtils.degToRad(46), 0.72, 1.2);
stageWash.position.set(0, canopyY - 1, 0);
stageWash.target.position.set(0, 0, 0);
scene.add(stageWash, stageWash.target);

const frontFill = new THREE.DirectionalLight(0x8db4ce, 2.1);
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
const mixers = [];
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
let animationsPaused = false;
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

function playFirstAnimation(model) {
  const clip = model.animations.find((item) => item.duration > 0 && item.tracks.length > 0);
  if (!clip) return;
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
  mixer.timeScale = animationsPaused ? 0 : 1;
  mixer.update(0);
  mixers.push(mixer);
}

function toggleAllAnimations() {
  animationsPaused = !animationsPaused;
  mixers.forEach((mixer) => { mixer.timeScale = animationsPaused ? 0 : 1; });
  if (focusedArtist) artistMotionButton.textContent = animationsPaused ? 'PLAY MOTION' : 'PAUSE MOTION';
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
  playFirstAnimation(model);
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
  playFirstAnimation(drummer);
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
  performerLights.forEach((entry, performerName) => {
    const selected = !name || performerName === name;
    entry.light.intensity = selected ? entry.intensity * (name ? 1.35 : 1) : 0;
    entry.beam.material.opacity = selected ? (name ? 0.075 : entry.beamOpacity) : 0;
  });
  stageWash.intensity = name ? 80 : 650;
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
  if (!target || focusedArtist || freeCameraEnabled) return;
  focusedArtist = name;
  homeCameraPosition.copy(camera.position);
  homeOrbitTarget.copy(orbit.target);
  orbit.enabled = false;
  const distance = name === 'Drum' ? 9.5 : 6.6;
  const cameraPosition = target.clone().add(new THREE.Vector3(0, 1.6, distance));
  beginCameraTransition(cameraPosition, target);
  updateSelectedLighting(name);
  artistName.textContent = name.toUpperCase();
  artistMotionButton.textContent = animationsPaused ? 'PLAY MOTION' : 'PAUSE MOTION';
  artistPanel.classList.add('is-open');
  artistPanel.setAttribute('aria-hidden', 'false');
}

function exitArtistFocus() {
  if (!focusedArtist) return;
  const returningArtist = focusedArtist;
  focusedArtist = null;
  artistPanel.classList.remove('is-open');
  artistPanel.setAttribute('aria-hidden', 'true');
  updateSelectedLighting(null);
  beginCameraTransition(homeCameraPosition, homeOrbitTarget, () => {
    if (!focusedArtist && returningArtist) {
      orbit.enabled = true;
      orbit.update();
    }
  });
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
  if (moved > 6 || focusedArtist || freeCameraEnabled) return;
  const performer = findPerformerAt(event.clientX, event.clientY);
  if (performer) focusArtist(performer);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (event.buttons || focusedArtist || freeCameraEnabled) {
    container.classList.remove('can-select');
    return;
  }
  container.classList.toggle('can-select', Boolean(findPerformerAt(event.clientX, event.clientY)));
});

artistExitButton.addEventListener('click', exitArtistFocus);
artistMotionButton.addEventListener('click', () => {
  toggleAllAnimations();
  artistMotionButton.textContent = animationsPaused ? 'PLAY MOTION' : 'PAUSE MOTION';
});

// V toggles the preserved first-person free camera. WASD moves, Q/E lowers/raises.
const pressedKeys = new Set();
const savedOrbitPosition = new THREE.Vector3();
const savedOrbitQuaternion = new THREE.Quaternion();
let freeCameraEnabled = false;
const moveSpeed = 5;
const mouseSensitivity = 0.002;

function toggleFreeCamera() {
  if (focusedArtist || cameraTransition) return;
  freeCameraEnabled = !freeCameraEnabled;
  pressedKeys.clear();
  container.classList.toggle('free-camera', freeCameraEnabled);
  orbit.enabled = !freeCameraEnabled;

  if (freeCameraEnabled) {
    savedOrbitPosition.copy(camera.position);
    savedOrbitQuaternion.copy(camera.quaternion);
    camera.rotation.reorder('YXZ');
  } else {
    if (document.pointerLockElement) document.exitPointerLock();
    camera.position.copy(savedOrbitPosition);
    camera.quaternion.copy(savedOrbitQuaternion);
    orbit.enabled = true;
    orbit.update();
  }
}

function logCamera() {
  const p = camera.position;
  const r = camera.rotation;
  console.log('[Camera Transform]', {
    position: { x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(4) },
    rotation: { x: +r.x.toFixed(4), y: +r.y.toFixed(4), z: +r.z.toFixed(4), order: r.order }
  });
}

window.addEventListener('keydown', (event) => {
  const isFormControl = event.target instanceof Element && event.target.closest('input, button');
  if (event.code === 'Space' && !event.repeat && !isFormControl) {
    event.preventDefault();
    toggleAllAnimations();
  }
  if (event.code === 'KeyV' && !event.repeat) toggleFreeCamera();
  if (event.code === 'KeyC' && !event.repeat) logCamera();
  if (freeCameraEnabled && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) {
    event.preventDefault();
    pressedKeys.add(event.code);
  }
});
window.addEventListener('keyup', (event) => pressedKeys.delete(event.code));
window.addEventListener('blur', () => pressedKeys.clear());

renderer.domElement.addEventListener('click', () => {
  if (freeCameraEnabled && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
});
window.addEventListener('mousemove', (event) => {
  if (!freeCameraEnabled || document.pointerLockElement !== renderer.domElement) return;
  camera.rotation.y -= event.movementX * mouseSensitivity;
  camera.rotation.x = THREE.MathUtils.clamp(
    camera.rotation.x - event.movementY * mouseSensitivity,
    -Math.PI / 2 + 0.01,
    Math.PI / 2 - 0.01
  );
});

function updateFreeCamera(delta) {
  if (!freeCameraEnabled) return;
  const distance = moveSpeed * delta;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  forward.y = 0;
  right.y = 0;
  forward.normalize();
  right.normalize();
  if (pressedKeys.has('KeyW')) camera.position.addScaledVector(forward, distance);
  if (pressedKeys.has('KeyS')) camera.position.addScaledVector(forward, -distance);
  if (pressedKeys.has('KeyA')) camera.position.addScaledVector(right, -distance);
  if (pressedKeys.has('KeyD')) camera.position.addScaledVector(right, distance);
  if (pressedKeys.has('KeyQ')) camera.position.y -= distance;
  if (pressedKeys.has('KeyE')) camera.position.y += distance;
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  mixers.forEach((mixer) => mixer.update(delta));
  updateHeldSticks();
  updateHeldMicrophones();
  updateHeldInstruments();
  updatePlayerMasks();
  updateFreeCamera(delta);
  updateCameraTransition(performance.now());
  if (!freeCameraEnabled && !focusedArtist && !cameraTransition) orbit.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});
