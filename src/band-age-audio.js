/**
 * band-age-audio.js
 * ─────────────────────────────────────────────────────────────
 * Band Age 음원 분리 + 믹싱 엔진 — 독립 ES 모듈
 *
 * 사용법 (서비스 프론트엔드):
 *   import { BandAgeAudio } from './band-age-audio.js';
 *   const audio = new BandAgeAudio('http://localhost:8000');
 *   await audio.separate(file, 'htdemucs_6s');
 *   audio.setStemActive('drums', true);
 *   audio.play();
 *
 * 이벤트 (addEventListener로 수신):
 *   'ready'       — { stems: [...], duration }
 *   'stemToggle'  — { name, active }
 *   'play'        — { currentTime }
 *   'pause'       — { currentTime }
 *   'stop'        — (no detail)
 *   'timeupdate'  — { currentTime, duration }  (250ms 주기)
 */

import {
  SoundTouch,
  SimpleFilter,
  WebAudioBufferSource,
  getWebAudioNode,
} from 'https://cdn.skypack.dev/soundtouchjs';

export class BandAgeAudio extends EventTarget {
  /**
   * @param {string} serverOrigin  백엔드 서버 주소 (예: 'http://localhost:8000')
   */
  constructor(serverOrigin = '') {
    super();
    this._origin = serverOrigin.replace(/\/$/, '');

    // ── 오디오 노드 딕셔너리 (stem 이름 → 노드) ──────────────
    this._audioCtx      = null;
    this._stemBuffers   = {};  // { name: AudioBuffer }
    this._stemGains     = {};  // { name: GainNode }
    this._stemSTs       = {};  // { name: SoundTouch }
    this._stemSTSources = {};  // { name: WebAudioBufferSource }
    this._stemSTNodes   = {};  // { name: ScriptProcessorNode }
    this._stemPanners   = {};  // { name: StereoPannerNode }
    this._stemEQs       = {};  // { name: { low, mid, high: BiquadFilterNode } }
    this._stemReverbs   = {};  // { name: { convolver, dryGain, wetGain } }
    this._stemAnalysers = {};  // { name: AnalyserNode }
    this._stemLevelData = {};  // { name: Uint8Array }
    this._stemLevelRefs = {};  // { name: number } 파트별 기준 음량
    this._masterGain    = null;
    this._masterLimiter = null;

    // ── 설정 ─────────────────────────────────────────────────
    // stemSettings[name]: { volume, pitch, pan, eq:{low,mid,high}, reverb }
    this._stemSettings  = {};
    this._activeStems   = new Set();

    // ── 재생 상태 ─────────────────────────────────────────────
    this._isPlaying     = false;
    this._loopOn        = false;
    this._startOffset   = 0;
    this._startedAt     = 0;
    this._duration      = 0;
    this._rafId         = null;

    // ── A-B 루프 ──────────────────────────────────────────────
    this._abPointA      = null;
    this._abPointB      = null;
    this._abLoopOn      = false;

    // ── 세션 ──────────────────────────────────────────────────
    this._sessionId     = null;
    this._lastTimeMs    = 0;
  }

  // ════════════════════════════════════════════════════════════
  // 상태 조회 (읽기 전용 getter)
  // ════════════════════════════════════════════════════════════
  get isReady()     { return this._audioCtx !== null && Object.keys(this._stemBuffers).length > 0; }
  get isPlaying()   { return this._isPlaying; }
  get currentTime() { return this._currentPos(); }
  get duration()    { return this._duration; }
  get sessionId()   { return this._sessionId; }
  /** @returns {string[]} 로드된 stem 이름 목록 */
  get stems()       { return Object.keys(this._stemBuffers); }
  /** @returns {string[]} 현재 활성화된 stem 이름 목록 */
  get activeStems() { return [...this._activeStems]; }

  // ════════════════════════════════════════════════════════════
  // 음원 분리 요청 (POST /separate)
  // ════════════════════════════════════════════════════════════
  /**
   * 음원 파일을 서버에 업로드하고 분리 결과를 로드합니다.
   * 서버는 POST /separate에 즉시 job_id를 응답하고 백그라운드에서 분리를 진행하므로,
   * GET /jobs/{job_id}를 폴링해 완료(done)될 때까지 기다린다.
   * @param {File}   file   음원 파일 (mp3, wav, flac, ogg, m4a)
   * @param {string} model  'htdemucs' | 'htdemucs_6s'
   * @param {{ onProgress?: (status: 'queued'|'processing') => void }} [options]
   * @returns {Promise<{ sessionId: string, stems: string[] }>}
   */
  async separate(file, model = 'htdemucs_6s', { onProgress } = {}) {
    const form = new FormData();
    form.append('file', file);
    form.append('model', model);

    const res  = await fetch(`${this._origin}/separate`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail ?? '서버 오류');

    const job = await this._pollJob(data.job_id, onProgress);
    this._sessionId = job.session_id;
    await this._loadStems(job.stems);
    return { sessionId: job.session_id, stems: Object.keys(job.stems) };
  }

  /** @private GET /jobs/{job_id}를 완료될 때까지 폴링한다. */
  async _pollJob(jobId, onProgress, intervalMs = 3000, timeoutMs = 600000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      const res = await fetch(`${this._origin}/jobs/${jobId}`);
      const job = await res.json();
      if (job.status === 'done') return job;
      if (job.status === 'failed') throw new Error(job.error ?? '분리 실패');
      onProgress?.(job.status);
    }
    throw new Error('타임아웃: 분리 시간이 너무 깁니다 (10분 초과).');
  }

  /**
   * 이미 분리된 결과(stem URL 맵)를 직접 로드합니다.
   * separate() 없이 /separate 응답을 재사용할 때 사용.
   * @param {{ [name: string]: string }} stemsMap  { vocals: '/stems/.../vocals.wav', ... }
   * @param {string} [sessionId]
   */
  async loadStems(stemsMap, sessionId = null) {
    this._sessionId = sessionId;
    await this._loadStems(stemsMap);
  }

  // ════════════════════════════════════════════════════════════
  // 재생 제어
  // ════════════════════════════════════════════════════════════
  play() {
    if (!this._audioCtx || this._activeStems.size === 0) return;
    if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
    const offset = this._startOffset % this._duration;
    this._activeStems.forEach(name => this._startStemAt(name, offset));
    this._startedAt = this._audioCtx.currentTime;
    this._isPlaying = true;
    this._rafId = requestAnimationFrame(() => this._tick());
    this._emit('play', { currentTime: offset });
  }

  pause() {
    this._startOffset = this._currentPos();
    Object.keys(this._stemSTNodes).forEach(name => {
      if (this._stemSTNodes[name]) {
        try { this._stemSTNodes[name].disconnect(); } catch (_) {}
        this._stemSTNodes[name] = null;
      }
    });
    this._isPlaying = false;
    cancelAnimationFrame(this._rafId);
    this._emit('pause', { currentTime: this._startOffset });
  }

  stop() {
    this.pause();
    this._startOffset = 0;
    this._emit('stop');
  }

  /** @param {number} seconds 이동할 위치 (초) */
  seekTo(seconds) {
    if (!this._audioCtx) return;
    this._startOffset = Math.max(0, Math.min(Number(seconds), this._duration));
    if (this._isPlaying) {
      this._activeStems.forEach(name => this._startStemAt(name, this._startOffset));
      this._startedAt = this._audioCtx.currentTime;
    }
  }

  /** @param {boolean} active 반복 재생 여부 */
  setLoop(active) { this._loopOn = Boolean(active); }

  // ════════════════════════════════════════════════════════════
  // Stem 활성 제어
  // ════════════════════════════════════════════════════════════
  /**
   * stem 활성 상태를 토글합니다.
   * 3D 팀: 모델 클릭 시 selectStem('drums') 호출
   * @param {string} name  stem 이름 (vocals, drums, bass, guitar, piano, other)
   */
  selectStem(name) {
    if (this._stemBuffers[name]) this._toggleStem(name);
  }

  /**
   * stem 활성 상태를 직접 설정합니다.
   * @param {string}  name    stem 이름
   * @param {boolean} active  true: 활성화, false: 음소거
   */
  setStemActive(name, active) {
    if (!this._stemBuffers[name]) return;
    if (Boolean(active) !== this._activeStems.has(name)) this._toggleStem(name);
  }

  /** @param {string} name @returns {boolean} */
  isStemActive(name) { return this._activeStems.has(name); }

  // ════════════════════════════════════════════════════════════
  // 믹싱 파라미터 (재생 중 즉시 반영)
  // ════════════════════════════════════════════════════════════
  /** @param {string} name @param {number} value 0.0 ~ 2.0 */
  setVolume(name, value) {
    if (!this._stemSettings[name]) return;
    const v = Math.max(0, Math.min(2.0, Number(value)));
    this._stemSettings[name].volume = v;
    if (this._activeStems.has(name)) this._stemGains[name].gain.value = v;
  }

  /** @param {string} name @param {number} semitones -12 ~ +12 */
  setPitch(name, semitones) {
    if (!this._stemSettings[name]) return;
    const st = Math.max(-12, Math.min(12, Number(semitones)));
    this._stemSettings[name].pitch = st;
    if (this._stemSTs[name]) this._stemSTs[name].pitch = Math.pow(2, st / 12);
  }

  /** @param {string} name @param {number} value -1.0(L) ~ +1.0(R) */
  setPan(name, value) {
    if (!this._stemSettings[name]) return;
    const p = Math.max(-1, Math.min(1, Number(value)));
    this._stemSettings[name].pan = p;
    if (this._stemPanners[name]) this._stemPanners[name].pan.value = p;
  }

  /**
   * @param {string} name
   * @param {'low'|'mid'|'high'} band  low: 250Hz, mid: 1kHz, high: 4kHz
   * @param {number} db  -12 ~ +12
   */
  setEQ(name, band, db) {
    if (!this._stemSettings[name] || !this._stemEQs[name]) return;
    if (!['low', 'mid', 'high'].includes(band)) return;
    const v = Math.max(-12, Math.min(12, Number(db)));
    this._stemSettings[name].eq[band] = v;
    this._stemEQs[name][band].gain.value = v;
  }

  /** @param {string} name @param {number} mix 0.0(Dry) ~ 1.0(Wet) */
  setReverb(name, mix) {
    if (!this._stemSettings[name] || !this._stemReverbs[name]) return;
    const m = Math.max(0, Math.min(1, Number(mix)));
    this._stemSettings[name].reverb = m;
    this._stemReverbs[name].dryGain.gain.value = 1 - m;
    this._stemReverbs[name].wetGain.gain.value = m;
  }

  /** stem의 현재 설정 스냅샷을 반환합니다. */
  getStemSettings(name) {
    const s = this._stemSettings[name];
    return s ? { ...s, eq: { ...s.eq } } : null;
  }

  /** 현재 stem 출력의 RMS 레벨을 0~1 범위로 반환합니다. */
  getStemLevel(name) {
    const analyser = this._stemAnalysers[name];
    const data = this._stemLevelData[name];
    if (!analyser || !data || !this._activeStems.has(name) || !this._isPlaying) return 0;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const sample = (data[i] - 128) / 128;
      sum += sample * sample;
    }
    return Math.sqrt(sum / data.length);
  }

  /** 파트별 기준 음량으로 보정한 현재 활동량을 반환합니다. */
  getStemActivity(name) {
    const reference = this._stemLevelRefs[name] || 0.03;
    return Math.min(1, this.getStemLevel(name) / reference);
  }

  /** 플레이라인 UI용으로 stem 전체의 RMS 윤곽을 지정한 개수만큼 추출합니다. */
  getStemEnvelope(name, bins = 240) {
    const buffer = this._stemBuffers[name];
    if (!buffer) return [];
    const count = Math.max(16, Math.floor(bins));
    const channelCount = buffer.numberOfChannels;
    const framesPerBin = Math.max(1, Math.floor(buffer.length / count));
    const envelope = new Array(count).fill(0);
    let peak = 0;
    for (let bin = 0; bin < count; bin++) {
      const start = bin * framesPerBin;
      const end = Math.min(buffer.length, start + framesPerBin);
      let sum = 0;
      let samples = 0;
      const stride = Math.max(1, Math.floor((end - start) / 256));
      for (let ch = 0; ch < channelCount; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = start; i < end; i += stride) {
          sum += data[i] * data[i];
          samples++;
        }
      }
      const rms = samples ? Math.sqrt(sum / samples) : 0;
      envelope[bin] = rms;
      peak = Math.max(peak, rms);
    }
    if (peak > 0) return envelope.map((value) => Math.min(1, value / peak));
    return envelope;
  }

  // ════════════════════════════════════════════════════════════
  // A-B 루프
  // ════════════════════════════════════════════════════════════
  /**
   * @param {number} a 시작 지점 (초)
   * @param {number} b 끝 지점 (초)
   */
  setABPoints(a, b) {
    this._abPointA = Math.max(0, Number(a));
    this._abPointB = Math.min(this._duration, Number(b));
  }

  /** @param {boolean} active */
  setABLoopActive(active) {
    if (this._abPointA === null || this._abPointB === null) return;
    this._abLoopOn = Boolean(active);
  }

  clearABLoop() {
    this._abPointA = null;
    this._abPointB = null;
    this._abLoopOn = false;
  }

  // ════════════════════════════════════════════════════════════
  // 세션 종료
  // ════════════════════════════════════════════════════════════
  /** 서버 임시 파일 삭제 + 오디오 컨텍스트 해제 */
  async dispose() {
    this.stop();
    this._cleanupSTNodes();
    if (this._sessionId) {
      try {
        await fetch(`${this._origin}/session/${this._sessionId}`, { method: 'DELETE' });
      } catch (_) {}
      this._sessionId = null;
    }
    if (this._audioCtx) { this._audioCtx.close(); this._audioCtx = null; }
    this._masterGain = null; this._masterLimiter = null;
    this._stemBuffers = {}; this._stemGains = {}; this._stemPanners = {};
    this._stemEQs = {}; this._stemReverbs = {}; this._stemAnalysers = {};
    this._stemLevelData = {}; this._stemLevelRefs = {}; this._stemSettings = {};
    this._activeStems = new Set();
    this._duration = 0;
  }

  // ════════════════════════════════════════════════════════════
  // 내부 구현
  // ════════════════════════════════════════════════════════════
  async _loadStems(stemsMap) {
    this.stop();
    this._cleanupSTNodes();
    this._stemBuffers = {}; this._stemGains = {}; this._stemPanners = {};
    this._stemEQs = {}; this._stemReverbs = {}; this._stemAnalysers = {};
    this._stemLevelData = {}; this._stemLevelRefs = {}; this._stemSettings = {};
    this._activeStems = new Set();
    this._duration = 0;

    this._audioCtx = new AudioContext();
    this._masterGain = this._audioCtx.createGain();
    this._masterGain.gain.value = 0.82;
    this._masterLimiter = this._audioCtx.createDynamicsCompressor();
    this._masterLimiter.threshold.value = -8;
    this._masterLimiter.knee.value = 5;
    this._masterLimiter.ratio.value = 12;
    this._masterLimiter.attack.value = 0.003;
    this._masterLimiter.release.value = 0.18;
    this._masterGain.connect(this._masterLimiter);
    this._masterLimiter.connect(this._audioCtx.destination);

    await Promise.all(Object.entries(stemsMap).map(async ([name, url]) => {
      const fullUrl = url.startsWith('http') ? url : `${this._origin}${url}`;
      const buf = await fetch(fullUrl).then(r => r.arrayBuffer());
      this._stemBuffers[name] = await this._audioCtx.decodeAudioData(buf);
      this._duration = Math.max(this._duration, this._stemBuffers[name].duration);
      this._stemLevelRefs[name] = this._measureBufferReference(this._stemBuffers[name]);

      // ── 오디오 체인 구성 ────────────────────────────────────
      // ScriptProcessor(ST) → Gain → EQ×3 → Panner → dryGain ─┐
      //                                                          → destination
      //                              └──→ Convolver → wetGain ──┘
      const gain = this._audioCtx.createGain();
      gain.gain.value = 0;

      const analyser = this._audioCtx.createAnalyser();
      analyser.fftSize = 256;

      const eqLow = this._audioCtx.createBiquadFilter();
      eqLow.type = 'lowshelf'; eqLow.frequency.value = 250; eqLow.gain.value = 0;

      const eqMid = this._audioCtx.createBiquadFilter();
      eqMid.type = 'peaking'; eqMid.frequency.value = 1000; eqMid.Q.value = 1.0; eqMid.gain.value = 0;

      const eqHigh = this._audioCtx.createBiquadFilter();
      eqHigh.type = 'highshelf'; eqHigh.frequency.value = 4000; eqHigh.gain.value = 0;

      const panner = this._audioCtx.createStereoPanner();
      panner.pan.value = 0;

      const dryGain = this._audioCtx.createGain(); dryGain.gain.value = 1;
      const convolver = this._audioCtx.createConvolver();
      convolver.buffer = this._generateIR(this._audioCtx);
      const wetGain = this._audioCtx.createGain(); wetGain.gain.value = 0;

      gain.connect(analyser); analyser.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh);
      eqHigh.connect(panner);
      panner.connect(dryGain); panner.connect(convolver); convolver.connect(wetGain);
      dryGain.connect(this._masterGain);
      wetGain.connect(this._masterGain);

      this._stemGains[name]   = gain;
      this._stemAnalysers[name] = analyser;
      this._stemLevelData[name] = new Uint8Array(analyser.fftSize);
      this._stemEQs[name]     = { low: eqLow, mid: eqMid, high: eqHigh };
      this._stemPanners[name] = panner;
      this._stemReverbs[name] = { convolver, dryGain, wetGain };
      this._stemSettings[name] = {
        volume: 1, pitch: 0, pan: 0,
        eq: { low: 0, mid: 0, high: 0 }, reverb: 0,
      };
    }));

    this._emit('ready', { stems: Object.keys(this._stemBuffers), duration: this._duration });
  }

  _generateIR(ctx, time = 1.5, decay = 2.0) {
    const sr = ctx.sampleRate;
    const length = Math.ceil(sr * time);
    const ir = ctx.createBuffer(2, length, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return ir;
  }

  _measureBufferReference(buffer) {
    const data = buffer.getChannelData(0);
    const windowCount = 180;
    const windowSize = Math.max(1, Math.floor(data.length / windowCount));
    const levels = [];
    for (let window = 0; window < windowCount; window++) {
      const start = window * windowSize;
      const end = Math.min(data.length, start + windowSize);
      const stride = Math.max(1, Math.floor((end - start) / 256));
      let sum = 0;
      let samples = 0;
      for (let i = start; i < end; i += stride) {
        sum += data[i] * data[i];
        samples++;
      }
      levels.push(samples ? Math.sqrt(sum / samples) : 0);
    }
    levels.sort((a, b) => a - b);
    return Math.max(0.004, levels[Math.floor(levels.length * 0.82)] || 0.03);
  }

  // ════════════════════════════════════════════════════════════
  // 믹스다운 렌더링 (다운로드용)
  // ════════════════════════════════════════════════════════════
  /**
   * 현재 활성화(솔로)된 stem들을 현재 볼륨/팬/EQ/리버브/피치 설정 그대로 오프라인 렌더링해
   * 하나의 WAV Blob으로 합친다.
   *
   * 피치가 기본값이 아닌 stem은 SoundTouch를 ScriptProcessorNode 없이 동기 루프로 직접 돌려
   * (extract()를 반복 호출) 새 AudioBuffer를 먼저 만든 뒤, 그 결과를 일반 AudioBufferSourceNode로
   * OfflineAudioContext에 태운다. ScriptProcessorNode를 OfflineAudioContext 안에서 쓰면 렌더링이
   * 멈춰버리는 문제가 있어(실시간 오디오 콜백 전제 API라 오프라인 컨텍스트와 호환이 안 됨) 이 방식을 쓴다.
   * @returns {Promise<Blob|null>} WAV Blob, 활성 stem이 없으면 null
   */
  async renderMixdown(stemNames = [...this._activeStems]) {
    if (!this._audioCtx || stemNames.length === 0) return null;

    const sampleRate = this._audioCtx.sampleRate;

    // 1) 피치가 걸린 stem은 미리 동기 처리해 새 AudioBuffer로 만들어 둔다.
    stemNames = stemNames.filter((name) => this._stemBuffers[name]);
    if (stemNames.length === 0) return null;
    const renderBuffers = {};
    let maxDuration = 0;
    for (const name of stemNames) {
      const settings = this._stemSettings[name];
      const original = this._stemBuffers[name];
      const buffer = settings.pitch === 0
        ? original
        : await this._pitchShiftBuffer(original, settings.pitch, sampleRate);
      renderBuffers[name] = buffer;
      maxDuration = Math.max(maxDuration, buffer.duration);
    }

    // 2) 볼륨/EQ/팬/리버브는 기존과 동일하게 OfflineAudioContext 오디오 그래프로 처리한다.
    const length = Math.ceil(maxDuration * sampleRate);
    const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = 0.82;
    const limiter = offlineCtx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 5;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    masterGain.connect(limiter);
    limiter.connect(offlineCtx.destination);

    stemNames.forEach((name) => {
      const settings = this._stemSettings[name];
      const source = offlineCtx.createBufferSource();
      source.buffer = renderBuffers[name];

      const gain = offlineCtx.createGain();
      gain.gain.value = settings.volume;

      const eqLow = offlineCtx.createBiquadFilter();
      eqLow.type = 'lowshelf'; eqLow.frequency.value = 250; eqLow.gain.value = settings.eq.low;
      const eqMid = offlineCtx.createBiquadFilter();
      eqMid.type = 'peaking'; eqMid.frequency.value = 1000; eqMid.Q.value = 1.0; eqMid.gain.value = settings.eq.mid;
      const eqHigh = offlineCtx.createBiquadFilter();
      eqHigh.type = 'highshelf'; eqHigh.frequency.value = 4000; eqHigh.gain.value = settings.eq.high;

      const panner = offlineCtx.createStereoPanner();
      panner.pan.value = settings.pan;

      const dryGain = offlineCtx.createGain(); dryGain.gain.value = 1 - settings.reverb;
      const convolver = offlineCtx.createConvolver();
      convolver.buffer = this._generateIR(offlineCtx);
      const wetGain = offlineCtx.createGain(); wetGain.gain.value = settings.reverb;

      source.connect(gain);
      gain.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh);
      eqHigh.connect(panner);
      panner.connect(dryGain); panner.connect(convolver); convolver.connect(wetGain);
      dryGain.connect(masterGain);
      wetGain.connect(masterGain);

      source.start(0);
    });

    const rendered = await offlineCtx.startRendering();
    return audioBufferToWavBlob(rendered);
  }

  /**
   * SoundTouch를 오디오 노드 없이 순수 JS 루프로 돌려 길이를 유지한 채 피치가 적용된 새 AudioBuffer를 만든다.
   * @param {AudioBuffer} buffer 원본
   * @param {number} pitchSemitones -12~12
   * @param {number} sampleRate
   * @returns {Promise<AudioBuffer>}
   */
  async _pitchShiftBuffer(buffer, pitchSemitones, sampleRate) {
    const st = new SoundTouch();
    st.pitch = Math.pow(2, pitchSemitones / 12);

    const bufSrc = new WebAudioBufferSource(buffer, () => {});
    bufSrc.position = 0;
    const filter = new SimpleFilter(bufSrc, st);

    const BLOCK_FRAMES = 4096;
    const chunk = new Float32Array(BLOCK_FRAMES * 2); // interleaved stereo
    const chunks = [];
    let totalFrames = 0;
    let blockCount = 0;

    for (;;) {
      const framesExtracted = filter.extract(chunk, BLOCK_FRAMES);
      if (framesExtracted <= 0) break;
      chunks.push(chunk.slice(0, framesExtracted * 2));
      totalFrames += framesExtracted;
      // 긴 곡에서 메인 스레드를 계속 막지 않도록 주기적으로 양보한다.
      blockCount += 1;
      if (blockCount % 512 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const outBuffer = this._audioCtx.createBuffer(2, Math.max(totalFrames, 1), sampleRate);
    const left = outBuffer.getChannelData(0);
    const right = outBuffer.getChannelData(1);
    let idx = 0;
    for (const c of chunks) {
      const frames = c.length / 2;
      for (let i = 0; i < frames; i++) {
        left[idx] = c[i * 2];
        right[idx] = c[i * 2 + 1];
        idx++;
      }
    }
    return outBuffer;
  }

  /** 모든 stem의 믹스/이펙트 설정을 기본값으로 복구하고 전체 합주 상태로 되돌린다. */
  resetAll() {
    this.stems.forEach((name) => {
      this._stemSettings[name] = { volume: 1, pitch: 0, pan: 0, eq: { low: 0, mid: 0, high: 0 }, reverb: 0 };
      if (this._stemGains[name]) this._stemGains[name].gain.value = this._activeStems.has(name) ? 1 : 0;
      if (this._stemPanners[name]) this._stemPanners[name].pan.value = 0;
      if (this._stemEQs[name]) {
        this._stemEQs[name].low.gain.value = 0;
        this._stemEQs[name].mid.gain.value = 0;
        this._stemEQs[name].high.gain.value = 0;
      }
      if (this._stemReverbs[name]) {
        this._stemReverbs[name].dryGain.gain.value = 1;
        this._stemReverbs[name].wetGain.gain.value = 0;
      }
      if (this._stemSTs[name]) {
        this._stemSTs[name].pitch = 1.0;
      }
      this.setStemActive(name, true);
    });
  }

  _currentPos() {
    return this._isPlaying
      ? this._startOffset + (this._audioCtx.currentTime - this._startedAt)
      : this._startOffset;
  }

  _startStemAt(name, offset) {
    if (this._stemSTNodes[name]) {
      try { this._stemSTNodes[name].disconnect(); } catch (_) {}
    }
    const { pitch } = this._stemSettings[name];
    const st = new SoundTouch();
    st.pitch = Math.pow(2, pitch / 12);
    const bufSrc = new WebAudioBufferSource(this._stemBuffers[name], () => {});
    const filter = new SimpleFilter(bufSrc, st);
    const sourceFrame = Math.floor(Math.max(0, offset) * this._stemBuffers[name].sampleRate);
    filter.sourcePosition = Math.min(sourceFrame, this._stemBuffers[name].length - 1);
    const stNode = getWebAudioNode(this._audioCtx, filter, () => {}, 4096);
    stNode.connect(this._stemGains[name]);
    this._stemSTs[name]       = st;
    this._stemSTSources[name] = bufSrc;
    this._stemSTNodes[name]   = stNode;
  }

  _cleanupSTNodes() {
    Object.values(this._stemSTNodes).forEach(node => {
      if (node) try { node.disconnect(); } catch (_) {}
    });
    this._stemSTs = {}; this._stemSTSources = {}; this._stemSTNodes = {};
  }

  _toggleStem(name) {
    if (this._activeStems.has(name)) {
      this._activeStems.delete(name);
      this._stemGains[name].gain.value = 0;
      if (this._stemSTNodes[name]) {
        try { this._stemSTNodes[name].disconnect(); } catch (_) {}
        this._stemSTNodes[name] = null;
      }
    } else {
      this._activeStems.add(name);
      this._stemGains[name].gain.value = this._stemSettings[name].volume;
      if (this._isPlaying) this._startStemAt(name, this._currentPos());
    }
    this._emit('stemToggle', { name, active: this._activeStems.has(name) });
  }

  _tick() {
    if (!this._isPlaying) return;
    const elapsed = this._currentPos();

    // timeupdate 이벤트 (250ms 주기)
    const nowMs = performance.now();
    if (nowMs - this._lastTimeMs > 250) {
      this._emit('timeupdate', { currentTime: elapsed, duration: this._duration });
      this._lastTimeMs = nowMs;
    }

    // A-B 루프 (일반 loop보다 우선)
    if (this._abLoopOn && this._abPointA !== null && this._abPointB !== null
        && elapsed >= this._abPointB) {
      this._startOffset = this._abPointA;
      this._activeStems.forEach(name => this._startStemAt(name, this._abPointA));
      this._startedAt = this._audioCtx.currentTime;
      this._rafId = requestAnimationFrame(() => this._tick());
      return;
    }

    if (elapsed >= this._duration) {
      if (this._loopOn) {
        this._startOffset = 0;
        this._activeStems.forEach(name => this._startStemAt(name, 0));
        this._startedAt = this._audioCtx.currentTime;
      } else {
        this.stop();
        return;
      }
    }
    this._rafId = requestAnimationFrame(() => this._tick());
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

/** AudioBuffer → 16-bit PCM WAV Blob 인코딩 */
function audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;

  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData = [];
  for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
