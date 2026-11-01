/**
 * HammerTime — Top-Down Chain & Warhammer Physics Action Game
 */

(() => {
  'use strict';

  // --- Global / Window Augmentation for TypeScript ---
  const win = window as any;

  // --- DOM Elements ---
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
  const minimapCtx = minimapCanvas.getContext('2d') as CanvasRenderingContext2D;

  const hpTextEl = document.getElementById('hp-text');
  const hpBarFillEl = document.getElementById('hp-bar-fill');
  const mountStatGroupEl = document.getElementById('mount-stat-group');
  const mountLabelEl = document.getElementById('mount-label');
  const mountHpTextEl = document.getElementById('mount-hp-text');
  const mountHpBarFillEl = document.getElementById('mount-hp-bar-fill');
  const hammerMassValEl = document.getElementById('hammer-mass-val');
  const chainLengthValEl = document.getElementById('chain-length-val');
  const hammerSpeedValEl = document.getElementById('hammer-speed-val');
  const killsValEl = document.getElementById('kills-val');
  const tensionBarFillEl = document.getElementById('tension-bar-fill');
  const playersOnlineTextEl = document.getElementById('players-online-text');
  const observerBannerEl = document.getElementById('observer-banner');
  const observerTitleEl = document.getElementById('observer-title');
  const observerSubtitleEl = document.getElementById('observer-subtitle');

  const gameOverModal = document.getElementById('game-over-modal');
  const finalKillsEl = document.getElementById('final-kills');
  const finalLinksEl = document.getElementById('final-links');
  const finalMaxHitEl = document.getElementById('final-max-hit');
  const playAgainBtn = document.getElementById('play-again-btn');

  const victoryModal = document.getElementById('victory-modal');
  const victoryBadgeEl = document.getElementById('victory-badge');
  const victoryTitleEl = document.getElementById('victory-title');
  const victorySubtitleEl = document.getElementById('victory-subtitle');
  const victoryStat1LabelEl = document.getElementById('victory-stat-1-label');
  const victoryStat1ValEl = document.getElementById('victory-stat-1-val');
  const victoryStat2LabelEl = document.getElementById('victory-stat-2-label');
  const victoryStat2ValEl = document.getElementById('victory-stat-2-val');
  const victoryStat3LabelEl = document.getElementById('victory-stat-3-label');
  const victoryStat3ValEl = document.getElementById('victory-stat-3-val');
  const victoryCountdownTextEl = document.getElementById('victory-countdown-text');
  const victoryNextBtn = document.getElementById('victory-next-btn');

  const enterModal = document.getElementById('enter-modal');
  const enterModalSubtitleEl = document.getElementById('enter-modal-subtitle');
  const nicknameInputEl = document.getElementById('nickname-input') as HTMLInputElement | null;
  const enterGameBtn = document.getElementById('enter-game-btn');
  const leaderboardListEl = document.getElementById('leaderboard-list');

  // --- World & Physics Constants ---
  const WORLD_WIDTH = 4200;
  const WORLD_HEIGHT = 4200;
  const PHYSICS_SUBSTEPS = 4;
  const TILT_Y = 0.66; // 2.5D oblique camera pitch foreshortening factor

  // Chain constants
  const INITIAL_CHAIN_LINKS = 2;
  const MAX_CHAIN_LINKS = 9;
  const BASE_CHAIN_OFFSET = 20; // Handle/attachment offset
  const LENGTH_PER_LINK = 13;   // Each black circle adds 13px of rest length
  const CHAIN_SPRING_K = 32.5;  // Elastic spring constant (20% less elastic stretch: 26.0 / 0.8)
  const CHAIN_RADIAL_DAMP = 1.98; // Radial stretch damping (20% less elastic bounce: 1.65 * 1.2)
  const CHAIN_LINK_RADIUS = 6.5;  // Collision radius of each chain link
  const CHAIN_RELAX_ITERS = 10;   // Constraint relaxation passes per substep

  // Stone column constants (4 immovable, indestructible pillars at hard-coded locations)
  const STONE_COLUMN_COUNT = 4;
  const STONE_COLUMN_RADIUS = 34;
  const STONE_COLUMNS = [
    { x: 2637, y: 2637, radius: STONE_COLUMN_RADIUS, height: 76 },
    { x: 1563, y: 2637, radius: STONE_COLUMN_RADIUS, height: 76 },
    { x: 1563, y: 1563, radius: STONE_COLUMN_RADIUS, height: 76 },
    { x: 2637, y: 1563, radius: STONE_COLUMN_RADIUS, height: 76 },
  ];

  // Collision constants
  const HAMMER_ENEMY_RESTITUTION = 0.58; // Semi-elastic coefficient of restitution (e)
  const DAMAGE_PER_IMPULSE = 0.135;      // Scales impulse J to HP damage
  const CHAIN_MOMENTUM_FACTOR = 1 / 3;   // Chain transfers 1/3 of hammer momentum
  const CHAIN_DAMAGE_FACTOR = (1 / 3) * 1.2; // Chain damage increased by 20% (0.4 of hammer damage)
  const INITIAL_HAMMER_MASS = 0.875;     // Base mass of the warhammer
  const HAMMER_WEIGHT_BONUS = 0.35;      // Mass added per 'weight' pickup
  const EXPLOSION_RADIUS = 420;          // Blast area radius of the 'bomb' impact explosion

  // Pickup types divided evenly (plus rare extra-hammer, horse, earthquake, fear, and even rarer elephant powerups)
  const PICKUP_TYPES = ['link', 'weight', 'health', 'bomb', 'speed', 'flame'];
  const PICKUP_RADIUS = 10;
  const MAX_PICKUP_COUNT = 40;
  const MAX_HAMMERS_PER_PLAYER = 2;
  const EXTRA_HAMMER_DURATION = 120.0;
  const RARE_HAMMER_DROP_CHANCE = 0.005;
  const RARE_HORSE_DROP_CHANCE = 0.005;
  const RARE_TORTOISE_DROP_CHANCE = 0.005;
  const RARE_ELEPHANT_DROP_CHANCE = 0.005;
  const RARE_BULLDOZER_DROP_CHANCE = 0.005;
  const RARE_EARTHQUAKE_DROP_CHANCE = 0.005;
  const RARE_FEAR_DROP_CHANCE = 0.005;
  const RARE_DISCO_DROP_CHANCE = 0.005;
  const RARE_JACKOLANTERN_DROP_CHANCE = 0.005;
  const RARE_SPIDER_DROP_CHANCE = 0.005;

  const ZOMBIE_WEB_DURATION = 30.0;
  const SPIDER_HAMMER_DURATION = 120.0;

  const JACKOLANTERN_HAMMER_DURATION = 120.0;
  const DISCO_HAMMER_DURATION = 120.0;
  const ZOMBIE_DANCE_DURATION = 30.0;
  const ZOMBIE_DANCE_IMMUNE_DURATION = 45.0;

  const BULLDOZER_DURATION = 20.0;
  const BULLDOZER_SPEED_MULT = 0.5;
  const BULLDOZER_TRACTION_MULT = 10.0;
  const BULLDOZER_RADIUS = 34;

  const EARTHQUAKE_DURATION = 5.0;
  const ZOMBIE_KNOCKDOWN_RECOVERY = 5.0;

  const FEAR_DURATION = 20.0;
  const FEAR_INITIAL_RADIUS = 620;
  const FEAR_SPEED_MULT = 4.0;

  const FLAME_HAMMER_DURATION = 10.0;
  const ZOMBIE_BURN_DURATION = 10.0;
  const ZOMBIE_FIREPROOF_DURATION = 5.0;
  const ZOMBIE_BURN_DPS = 6;

  // Enemy population (reduced by 30%)
  const INITIAL_ENEMY_COUNT = 24;
  const MAX_ENEMY_COUNT = 31;
  const VICTORY_KILL_TARGET = 1000;
  const VICTORY_DISPLAY_DURATION = 5.0;
  const LEADERBOARD_MAX_ENTRIES = 10;
  const MAX_NICKNAME_LENGTH = 20;

  // --- Adaptive Visual Quality (Dynamic LOD) Constants & State ---
  const QUALITY_TIER_LOW = 0;
  const QUALITY_TIER_MEDIUM = 1;
  const QUALITY_TIER_HIGH = 2;
  const MAX_PARTICLES_BY_TIER = [90, 200, 420];
  const MAX_FLOATING_TEXTS_BY_TIER = [16, 32, 64];
  const PARTICLE_SPAWN_SCALE_BY_TIER = [0.25, 0.5, 1.0];
  const MAX_SOUNDS_PER_WINDOW_BY_TIER = [2, 4, 6];
  const SOUND_RATE_WINDOW_MS = 100;
  const MINIMAP_UPDATE_INTERVAL = 0.1; // 10 Hz minimap refresh rate

  let avgFrameMs = 16.67;
  let visualQualityTier = QUALITY_TIER_HIGH;
  let soundWindowStartMs = -1000;
  let soundsInCurrentWindow = 0;
  let minimapAccumSec = MINIMAP_UPDATE_INTERVAL;
  let lastLeaderboardSignature = '';

  function canPlayRateLimitedSound(nowMs = performance.now()) {
    if (nowMs - soundWindowStartMs >= SOUND_RATE_WINDOW_MS || nowMs < soundWindowStartMs) {
      soundWindowStartMs = nowMs;
      soundsInCurrentWindow = 0;
    }
    const maxSounds =
      MAX_SOUNDS_PER_WINDOW_BY_TIER[visualQualityTier] != null
        ? MAX_SOUNDS_PER_WINDOW_BY_TIER[visualQualityTier]
        : 6;
    if (soundsInCurrentWindow >= maxSounds) {
      return false;
    }
    soundsInCurrentWindow += 1;
    return true;
  }

  // --- Web Audio API Sound Synthesizer ---
  let audioCtx = null;

  function ensureAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = win.AudioContext || win.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /**
   * Plays a short percussive impact sound scaled proportionally to the damage done.
   */
  function playImpactSound(damage, isChain = false) {
    if (!canPlayRateLimitedSound()) return;
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    // Normalize damage intensity (0.06 for tiny 1-2 dmg taps up to 1.0 for 75+ dmg blows)
    const intensity = Math.min(1, Math.max(0.06, damage / 75));
    const duration = 0.038 + intensity * 0.085;
    const peakGain = 0.03 + intensity * 0.28;

    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();

    osc.type = isChain ? 'triangle' : 'sine';
    const startFreq = (isChain ? 240 : 140) + intensity * 95;
    const endFreq = isChain ? 75 : 42;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(gain);
    gain.connect(ctxAudio.destination);
    osc.start(now);
    osc.stop(now + duration + 0.005);

    // Metallic overtone transient proportional to damage (skipped in Low quality tier to halve audio nodes)
    if (visualQualityTier > QUALITY_TIER_LOW) {
      const overtone = ctxAudio.createOscillator();
      const overtoneGain = ctxAudio.createGain();
      overtone.type = 'square';
      overtone.frequency.setValueAtTime(isChain ? 520 : 310 + intensity * 160, now);
      overtone.frequency.exponentialRampToValueAtTime(110, now + duration * 0.65);

      overtoneGain.gain.setValueAtTime(peakGain * 0.22, now);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0008, now + duration * 0.65);

      overtone.connect(overtoneGain);
      overtoneGain.connect(ctxAudio.destination);
      overtone.start(now);
      overtone.stop(now + duration * 0.65 + 0.005);
    }
  }

  /**
   * Plays a very short downward pop sound when an enemy disappears (0 HP).
   */
  function playEnemyDisappearSound() {
    if (!canPlayRateLimitedSound()) return;
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const duration = 0.065;

    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + duration);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctxAudio.destination);
    osc.start(now);
    osc.stop(now + duration + 0.005);
  }

  /**
   * Plays a distinct, very short metallic two-note clink when a pickup circle is collected.
   */
  function playCollectLinkSound() {
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const duration = 0.075;

    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.setValueAtTime(1020, now + 0.032);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctxAudio.destination);
    osc.start(now);
    osc.stop(now + duration + 0.005);
  }

  /**
   * Plays a short punchy explosion sound when a bomb-armed hammer impacts an enemy.
   */
  function playExplosionSound() {
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const duration = 0.19;

    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + duration);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctxAudio.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  /**
   * Plays a short guttural vocal "uggh" grunt when a warrior takes damage.
   */
  function playPlayerHurtSound() {
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const duration = 0.21;

    // 1. Glottal vocal cord source (sawtooth + sub-octave triangle pitching down "uh -> ggh")
    const voiceOsc = ctxAudio.createOscillator();
    const subOsc = ctxAudio.createOscillator();
    voiceOsc.type = 'sawtooth';
    subOsc.type = 'triangle';

    // Slight random pitch variation so repeated grunts feel organic
    const pitchMult = 0.94 + Math.random() * 0.12;
    voiceOsc.frequency.setValueAtTime(142 * pitchMult, now);
    voiceOsc.frequency.linearRampToValueAtTime(118 * pitchMult, now + 0.065);
    voiceOsc.frequency.exponentialRampToValueAtTime(76 * pitchMult, now + duration);

    subOsc.frequency.setValueAtTime(71 * pitchMult, now);
    subOsc.frequency.exponentialRampToValueAtTime(42 * pitchMult, now + duration);

    // 2. Two parallel vocal-tract formant filters for the "uh / uggh" vowel sound
    // Formant 1 (throat/chest cavity ~520 Hz dropping to ~370 Hz)
    const formant1 = ctxAudio.createBiquadFilter();
    formant1.type = 'bandpass';
    formant1.frequency.setValueAtTime(520, now);
    formant1.frequency.exponentialRampToValueAtTime(370, now + duration);
    formant1.Q.setValueAtTime(4.2, now);

    // Formant 2 (mouth cavity ~1040 Hz dropping to ~760 Hz for the guttural "-ggh")
    const formant2 = ctxAudio.createBiquadFilter();
    formant2.type = 'bandpass';
    formant2.frequency.setValueAtTime(1040, now);
    formant2.frequency.exponentialRampToValueAtTime(760, now + duration);
    formant2.Q.setValueAtTime(5.0, now);

    const chestGain = ctxAudio.createGain();
    chestGain.gain.setValueAtTime(0.45, now);

    const vocalEnvelope = ctxAudio.createGain();
    vocalEnvelope.gain.setValueAtTime(0.001, now);
    vocalEnvelope.gain.linearRampToValueAtTime(0.34, now + 0.018);
    vocalEnvelope.gain.setValueAtTime(0.28, now + 0.075);
    vocalEnvelope.gain.exponentialRampToValueAtTime(0.001, now + duration);

    voiceOsc.connect(formant1);
    voiceOsc.connect(formant2);
    subOsc.connect(chestGain);

    formant1.connect(vocalEnvelope);
    formant2.connect(vocalEnvelope);
    chestGain.connect(vocalEnvelope);
    vocalEnvelope.connect(ctxAudio.destination);

    voiceOsc.start(now);
    subOsc.start(now);
    voiceOsc.stop(now + duration + 0.01);
    subOsc.stop(now + duration + 0.01);
  }

  /**
   * Plays a deep, rumbling seismic tremor sound during a 5-second earthquake.
   */
  function playEarthquakeSound() {
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const duration = EARTHQUAKE_DURATION;

    const rumbleOsc = ctxAudio.createOscillator();
    const lfoOsc = ctxAudio.createOscillator();
    const lfoGain = ctxAudio.createGain();
    const filter = ctxAudio.createBiquadFilter();
    const masterGain = ctxAudio.createGain();

    rumbleOsc.type = 'sawtooth';
    rumbleOsc.frequency.setValueAtTime(46, now);
    rumbleOsc.frequency.linearRampToValueAtTime(38, now + duration * 0.5);
    rumbleOsc.frequency.linearRampToValueAtTime(44, now + duration);

    lfoOsc.type = 'sine';
    lfoOsc.frequency.setValueAtTime(14, now);
    lfoGain.gain.setValueAtTime(12, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(115, now);

    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(0.22, now + 0.15);
    masterGain.gain.setValueAtTime(0.2, now + duration - 0.45);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    lfoOsc.connect(lfoGain);
    lfoGain.connect(rumbleOsc.frequency);
    rumbleOsc.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(ctxAudio.destination);

    rumbleOsc.start(now);
    lfoOsc.start(now);
    rumbleOsc.stop(now + duration + 0.02);
    lfoOsc.stop(now + duration + 0.02);
  }

  /**
   * Plays an eerie, warbling ghostly shriek when the Fear powerup is triggered.
   */
  function playFearSound() {
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const duration = 0.55;

    const osc1 = ctxAudio.createOscillator();
    const osc2 = ctxAudio.createOscillator();
    const vibrato = ctxAudio.createOscillator();
    const vibratoGain = ctxAudio.createGain();
    const gain = ctxAudio.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(520, now);
    osc1.frequency.exponentialRampToValueAtTime(240, now + duration);
    osc2.frequency.setValueAtTime(780, now);
    osc2.frequency.exponentialRampToValueAtTime(340, now + duration);

    vibrato.type = 'sine';
    vibrato.frequency.setValueAtTime(18, now);
    vibratoGain.gain.setValueAtTime(28, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc1.frequency);
    vibratoGain.connect(osc2.frequency);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctxAudio.destination);

    osc1.start(now);
    osc2.start(now);
    vibrato.start(now);
    osc1.stop(now + duration + 0.02);
    osc2.stop(now + duration + 0.02);
    vibrato.stop(now + duration + 0.02);
  }

  /**
   * Plays a deep diesel engine roar and hydraulic blade clank when transforming into a Bulldozer.
   */
  function playBulldozerSound() {
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const duration = 0.65;

    const engineOsc = ctxAudio.createOscillator();
    const subOsc = ctxAudio.createOscillator();
    const chugLfo = ctxAudio.createOscillator();
    const chugGain = ctxAudio.createGain();
    const filter = ctxAudio.createBiquadFilter();
    const gain = ctxAudio.createGain();

    engineOsc.type = 'sawtooth';
    subOsc.type = 'square';
    engineOsc.frequency.setValueAtTime(52, now);
    engineOsc.frequency.linearRampToValueAtTime(84, now + 0.25);
    engineOsc.frequency.linearRampToValueAtTime(62, now + duration);

    subOsc.frequency.setValueAtTime(26, now);
    subOsc.frequency.linearRampToValueAtTime(42, now + 0.25);
    subOsc.frequency.linearRampToValueAtTime(31, now + duration);

    chugLfo.type = 'sine';
    chugLfo.frequency.setValueAtTime(22, now);
    chugGain.gain.setValueAtTime(14, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.04);
    gain.gain.setValueAtTime(0.22, now + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    chugLfo.connect(chugGain);
    chugGain.connect(engineOsc.frequency);
    engineOsc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(ctxAudio.destination);

    engineOsc.start(now);
    subOsc.start(now);
    chugLfo.start(now);
    engineOsc.stop(now + duration + 0.02);
    subOsc.stop(now + duration + 0.02);
    chugLfo.stop(now + duration + 0.02);
  }

  /**
   * Plays an upbeat funky disco synth arpeggio when picking up the Disco Ball powerup.
   */
  function playDiscoSound() {
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const notes = [440, 554.37, 659.25, 880, 659.25, 880];
    for (let i = 0; i < notes.length; i++) {
      const start = now + i * 0.06;
      const dur = 0.09;
      const osc = ctxAudio.createOscillator();
      const filter = ctxAudio.createBiquadFilter();
      const gain = ctxAudio.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(notes[i], start);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, start);
      filter.Q.setValueAtTime(2.5, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctxAudio.destination);
      osc.start(start);
      osc.stop(start + dur + 0.01);
    }
  }

  /**
   * Plays a short funky synth pluck when a zombie starts dancing.
   */
  function playDiscoChimeSound() {
    if (!canPlayRateLimitedSound()) return;
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const scaleNotes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    const freq = scaleNotes[Math.floor(Math.random() * scaleNotes.length)];
    const dur = 0.085;
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(ctxAudio.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  /**
   * Plays a spooky Halloween minor-key organ/synth motif when picking up the Jack-o'-Lantern powerup.
   */
  function playJackOLanternSound() {
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const notes = [293.66, 349.23, 440.0, 415.3, 587.33]; // D4 - F4 - A4 - G#4 - D5 spooky motif
    for (let i = 0; i < notes.length; i++) {
      const start = now + i * 0.068;
      const dur = i === notes.length - 1 ? 0.28 : 0.1;
      const osc = ctxAudio.createOscillator();
      const gain = ctxAudio.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[i], start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(ctxAudio.destination);
      osc.start(start);
      osc.stop(start + dur + 0.01);
    }
  }

  /**
   * Plays a creepy skittering arachnid synth motif when the Spider Hammer powerup is collected.
   */
  function playSpiderPickupSound() {
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const notes = [330, 311.13, 440, 415.3, 659.25];
    for (let i = 0; i < notes.length; i++) {
      const start = now + i * 0.055;
      const dur = i === notes.length - 1 ? 0.22 : 0.085;
      const osc = ctxAudio.createOscillator();
      const gain = ctxAudio.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(notes[i], start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(ctxAudio.destination);
      osc.start(start);
      osc.stop(start + dur + 0.01);
    }
  }

  /**
   * Plays a snappy silky web-wrap sound when a Spider Hammer wraps a zombie in webbing.
   */
  function playSpiderWebSound() {
    if (!canPlayRateLimitedSound()) return;
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.14);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctxAudio.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  /**
   * Plays a celebratory ascending 3-note fanfare when the Victory Page appears.
   */
  function playVictorySound() {
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) return;

    const now = ctxAudio.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < notes.length; i++) {
      const start = now + i * 0.085;
      const dur = i === notes.length - 1 ? 0.32 : 0.11;
      const osc = ctxAudio.createOscillator();
      const gain = ctxAudio.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[i], start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(ctxAudio.destination);
      osc.start(start);
      osc.stop(start + dur + 0.01);
    }
  }

  // --- Input State ---
  let hasEnteredGame = false;
  let lastUserActivityTime = performance.now();
  let hasRecentInput = false;
  const mouse = {
    screenX: window.innerWidth / 2,
    screenY: window.innerHeight / 2,
  };

  window.addEventListener('pointerdown', (e) => {
    ensureAudioContext();
    lastUserActivityTime = performance.now();
    hasRecentInput = true;
    mouse.screenX = e.clientX;
    mouse.screenY = e.clientY;
  });

  window.addEventListener('mousemove', (e) => {
    if (e.clientX !== mouse.screenX || e.clientY !== mouse.screenY) {
      lastUserActivityTime = performance.now();
      hasRecentInput = true;
      mouse.screenX = e.clientX;
      mouse.screenY = e.clientY;
    }
  });

  // --- Deterministic Scenery Generator for the Grassy Field ---
  const grassPatches = [];
  const grassTufts = [];
  const wildflowers = [];
  const pebbles = [];
  const stoneColumns = STONE_COLUMNS.map((col) => ({ ...col }));

  function generateWorldScenery() {
    grassPatches.length = 0;
    grassTufts.length = 0;
    wildflowers.length = 0;
    pebbles.length = 0;
    stoneColumns.length = 0;

    // 4 immovable, indestructible stone columns at hard-coded locations
    for (let i = 0; i < STONE_COLUMNS.length; i++) {
      stoneColumns.push({ ...STONE_COLUMNS[i] });
    }

    let seed = 133742;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    // Soft organic meadow patches
    for (let i = 0; i < 240; i++) {
      grassPatches.push({
        x: rand() * WORLD_WIDTH,
        y: rand() * WORLD_HEIGHT,
        rx: 65 + rand() * 160,
        ry: 50 + rand() * 130,
        rot: rand() * Math.PI,
        type: rand() > 0.45 ? 'light' : 'clover',
      });
    }

    // Grass tufts across the field so scrolling is crisp and unmistakable
    for (let i = 0; i < 2200; i++) {
      grassTufts.push({
        x: 30 + rand() * (WORLD_WIDTH - 60),
        y: 30 + rand() * (WORLD_HEIGHT - 60),
        size: 5 + rand() * 7,
        shade: rand() > 0.5 ? '#2d6a32' : '#438a3e',
        blades: 3 + Math.floor(rand() * 3),
      });
    }

    // Small wildflowers
    const flowerColors = ['#f6e05e', '#fefcbf', '#fbd38d', '#90cdf4', '#fbb6ce'];
    for (let i = 0; i < 420; i++) {
      wildflowers.push({
        x: 50 + rand() * (WORLD_WIDTH - 100),
        y: 50 + rand() * (WORLD_HEIGHT - 100),
        r: 2.2 + rand() * 2.0,
        color: flowerColors[Math.floor(rand() * flowerColors.length)],
      });
    }

    // Field pebbles
    for (let i = 0; i < 280; i++) {
      pebbles.push({
        x: 40 + rand() * (WORLD_WIDTH - 80),
        y: 40 + rand() * (WORLD_HEIGHT - 80),
        rx: 3 + rand() * 5,
        ry: 2 + rand() * 3.5,
        rot: rand() * Math.PI,
      });
    }
  }

  // --- Game State ---
  let viewportWidth = window.innerWidth;
  let viewportHeight = window.innerHeight;

  const camera = {
    x: 0,
    y: 0,
    shake: 0,
  };

  const warrior = {
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2, // Facing up initially
    radius: 20,
    mass: 4.2,           // Warrior mass (heavier than hammer, but still dragged slightly by hammer momentum)
    turnSpeed: 3.3,      // Radians/sec
    walkThrust: 980,     // Forward acceleration when walking
    runThrust: 1520,     // Forward acceleration when running at full stride
    strideCharge: 0,     // Ramps from 0 (walk) to 1 (run) while moving toward cursor
    groundTraction: 5.2, // Ground traction damping rate
    hp: 100,
    maxHp: 100,
    regenRate: 0,        // No automatic healing over time
    alive: true,
    name: 'Knight #1',
    hasCustomNickname: false,
    color: '#63b3ed',
    capeColor: '#742a2a',
    plumeColor: '#ecc94b',
    speedMultiplier: 1.0, // Increases by 5% per 'speed' pickup
    tractionMultiplier: 1.0, // Increases warrior's traction by 5% per 'traction' pickup
    chainLinks: INITIAL_CHAIN_LINKS,
    mountType: null as string | null,     // null | 'horse' | 'elephant' | 'tortoise'
    mountHp: 0,
    mountMaxHp: 0,
    bulldozerTimer: 0,
    walkCycle: 0,
    hurtFlash: 0,
    reachMinX: 0,
    reachMaxX: 0,
    reachMinY: 0,
    reachMaxY: 0,
    serverX: WORLD_WIDTH / 2,
    serverY: WORLD_HEIGHT / 2,
    serverVx: 0,
    serverVy: 0,
    serverAngle: -Math.PI / 2,
    hasServerTarget: false,
    hammers: [] as any[],
  };

  const hammer = {
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2 + 85,
    vx: 0,
    vy: 0,
    radius: 17,
    mass: INITIAL_HAMMER_MASS, // Significant mass & momentum, 0 ground traction!
    chainLinks: INITIAL_CHAIN_LINKS,
    linkLength: LENGTH_PER_LINK,
    chainNodes: [],
    chainMinX: 0,
    chainMaxX: 0,
    chainMinY: 0,
    chainMaxY: 0,
    serverX: WORLD_WIDTH / 2,
    serverY: WORLD_HEIGHT / 2 + 85,
    serverVx: 0,
    serverVy: 0,
    serverAngle: Math.PI / 2,
    hasServerTarget: false,
    bombCharges: 0,            // Next hammer impact triggers a large explosion when > 0
    flameCharges: 0,           // Next hammer impact sets zombie on fire when > 0
    flameTimer: 0,             // > 0 while Flaming Hammer is armed
    discoTimer: 0,             // > 0 while transformed into a Disco Ball for 120s
    jackolanternTimer: 0,      // > 0 while transformed into a Jack-o'-Lantern for 120s
    spiderTimer: 0,            // > 0 while transformed into a Spider Hammer for 120s
    isSpider: false,           // true when transformed into a Spider Hammer
    angle: Math.PI / 2,
    currentTension: 0,
    currentStretch: 0,
    trail: [],
  };
  warrior.hammers = [hammer];

  const enemies = [];
  const blackCircles = []; // Dropped chain links from defeated enemies
  const chainNodes = hammer.chainNodes; // Primary hammer chain nodes alias
  const particles = [];
  const floatingTexts = [];
  const shockwaves = [];

  // Multiplayer & Round State
  let ws = null;
  let isConnecting = false;
  let isMultiplayer = false;
  let hasSyncedInitialServerState = false;
  let localPlayerId = null;
  const remotePlayers = []; // Other connected players
  let serverRoundRestartTimer = 0;
  let localObserverTimer = 0;
  let localVictoryTimer = 0;
  let roundState = 'playing'; // 'playing' | 'victory' | 'defeat'
  let teamKills = 0;
  let victoryInfo = null;
  let leaderboard = []; // Top 10 [{ rank, name, kills, color }]
  const localLeaderboardRecords = new Map(); // lowercase nickname -> { name, kills, color, updatedAt }

  let kills = 0;
  let maxDamageBlow = 0;
  let spawnTimer = 0;
  let elapsedGameTime = 0;
  let gameTime = 0;
  let earthquakeTimer = 0;
  let localKnockdownTimer = 0;
  let isGameOver = false;

  const NICKNAME_COOKIE_NAME = 'hammertime_nickname';
  const LEADERBOARD_COOKIE_NAME = 'hammertime_leaderboard';
  let lastSavedLeaderboardJson = '';
  const MEDIEVAL_NAME_SUGGESTIONS = [
    'Sir Galahad',
    'Lady Guinevere',
    'Sir Roland',
    'Lady Eleanor',
    'Sir Lancelot',
    'Sir Bedivere',
    'Lady Isolde',
    'Sir Percival',
    'Lady Rowena',
    'Sir Gareth',
    'Lady Morwenna',
    'Sir Gawain',
    'Lady Beatrix',
    'Sir Tristram',
    'Lady Matilda',
    'Sir Godfrey',
    'Lady Yvaine',
    'Sir Baldwin',
    'Lady Clarice',
    'Sir Roderick',
    'Lady Astrid',
    'Sir Cedric',
    'Lady Vivienne',
    'Sir Aldous',
  ];

  function getCookie(name) {
    if (typeof document === 'undefined' || !document.cookie) return null;
    const prefix = `${name}=`;
    const parts = document.cookie.split(';');
    for (let i = 0; i < parts.length; i++) {
      let part = parts[i].trim();
      if (part.startsWith(prefix)) {
        try {
          return decodeURIComponent(part.substring(prefix.length));
        } catch (_err) {
          return part.substring(prefix.length);
        }
      }
    }
    return null;
  }

  function setCookie(name, value, days = 365) {
    if (typeof document === 'undefined') return;
    const encoded = encodeURIComponent(value);
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encoded}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }

  function getRandomMedievalName() {
    const idx = Math.floor(Math.random() * MEDIEVAL_NAME_SUGGESTIONS.length);
    return MEDIEVAL_NAME_SUGGESTIONS[idx];
  }

  function getInitialSuggestedNickname() {
    const saved = getCookie(NICKNAME_COOKIE_NAME);
    if (saved && saved.trim()) {
      return sanitizeNickname(saved.trim(), getRandomMedievalName());
    }
    return getRandomMedievalName();
  }

  function populateNicknameSuggestion() {
    if (!nicknameInputEl) return;
    if (!nicknameInputEl.value || !nicknameInputEl.value.trim()) {
      nicknameInputEl.value = getInitialSuggestedNickname();
    }
  }

  // --- Helper Functions ---
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function lerpAngle(a, b, t) {
    const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + diff * t;
  }

  function sanitizeNickname(rawName, fallback = 'Warrior') {
    if (typeof rawName !== 'string') return fallback;
    const cleaned = rawName
      .replace(/\s+/g, ' ')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .trim()
      .slice(0, MAX_NICKNAME_LENGTH)
      .trim();
    return cleaned || fallback;
  }

  function saveLocalLeaderboardToStorage() {
    try {
      const top = getTopLocalLeaderboard();
      const json = JSON.stringify(top);
      if (json === lastSavedLeaderboardJson) return;
      lastSavedLeaderboardJson = json;
      if (win && win.localStorage && typeof win.localStorage.setItem === 'function') {
        try {
          win.localStorage.setItem(LEADERBOARD_COOKIE_NAME, json);
        } catch (_lsErr) {
          // Ignore storage quota / security errors
        }
      }
      setCookie(LEADERBOARD_COOKIE_NAME, json);
    } catch (_err) {
      // Ignore serialization error
    }
  }

  function loadLocalLeaderboardFromStorage() {
    let raw = null;
    if (win && win.localStorage && typeof win.localStorage.getItem === 'function') {
      try {
        raw = win.localStorage.getItem(LEADERBOARD_COOKIE_NAME);
      } catch (_lsErr) {
        raw = null;
      }
    }
    if (!raw) {
      raw = getCookie(LEADERBOARD_COOKIE_NAME);
    }
    if (!raw) return getTopLocalLeaderboard();
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray(parsed.entries)
        ? parsed.entries
        : [];
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item || typeof item !== 'object') continue;
        const cleanName = sanitizeNickname(item.name, '');
        if (!cleanName) continue;
        const key = cleanName.toLowerCase();
        const numericKills = Math.max(0, Math.floor(Number(item.kills) || 0));
        const existing = localLeaderboardRecords.get(key);
        if (!existing || numericKills > existing.kills) {
          localLeaderboardRecords.set(key, {
            name: cleanName,
            kills: numericKills,
            color: item.color || '#f6e05e',
            updatedAt:
              typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
                ? item.updatedAt
                : Date.now() + i,
          });
        }
      }
      lastSavedLeaderboardJson = JSON.stringify(getTopLocalLeaderboard());
    } catch (_err) {
      // Ignore malformed storage data
    }
    if (!isMultiplayer) {
      leaderboard = getTopLocalLeaderboard();
    }
    return leaderboard;
  }

  function syncServerLeaderboard(serverEntries) {
    if (!Array.isArray(serverEntries)) return;
    let changed = false;
    for (let i = 0; i < serverEntries.length; i++) {
      const item = serverEntries[i];
      if (!item || typeof item !== 'object') continue;
      const cleanName = sanitizeNickname(item.name, '');
      if (!cleanName) continue;
      const key = cleanName.toLowerCase();
      const numericKills = Math.max(0, Math.floor(Number(item.kills) || 0));
      const existing = localLeaderboardRecords.get(key);
      if (!existing || numericKills > existing.kills) {
        localLeaderboardRecords.set(key, {
          name: cleanName,
          kills: numericKills,
          color: item.color || '#f6e05e',
          updatedAt: Date.now() + i,
        });
        changed = true;
      }
    }
    leaderboard = serverEntries;
    if (changed) {
      saveLocalLeaderboardToStorage();
    }
  }

  function recordLocalLeaderboardScore(name, killsCount, color = '#f6e05e') {
    const cleanName = sanitizeNickname(name, '');
    if (!cleanName) return null;
    const key = cleanName.toLowerCase();
    const numericKills = Math.max(0, Math.floor(Number(killsCount) || 0));
    const existing = localLeaderboardRecords.get(key);
    if (existing) {
      existing.name = cleanName;
      if (color) existing.color = color;
      if (numericKills > existing.kills) {
        existing.kills = numericKills;
        existing.updatedAt = Date.now();
      }
    } else {
      localLeaderboardRecords.set(key, {
        name: cleanName,
        kills: numericKills,
        color: color || '#f6e05e',
        updatedAt: Date.now(),
      });
    }
    if (!isMultiplayer) {
      leaderboard = getTopLocalLeaderboard();
    }
    saveLocalLeaderboardToStorage();
    return localLeaderboardRecords.get(key);
  }

  function getTopLocalLeaderboard() {
    const sorted = Array.from(localLeaderboardRecords.values()).sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
      return a.name.localeCompare(b.name);
    });
    return sorted.slice(0, LEADERBOARD_MAX_ENTRIES).map((entry, idx) => ({
      rank: idx + 1,
      name: entry.name,
      kills: entry.kills,
      color: entry.color,
    }));
  }

  function clearLocalLeaderboard() {
    localLeaderboardRecords.clear();
    leaderboard = [];
    lastLeaderboardSignature = '';
    lastSavedLeaderboardJson = '';
    if (win && win.localStorage && typeof win.localStorage.removeItem === 'function') {
      try {
        win.localStorage.removeItem(LEADERBOARD_COOKIE_NAME);
      } catch (_lsErr) {
        // Ignore storage error
      }
    }
    setCookie(LEADERBOARD_COOKIE_NAME, '', 0);
  }

  function getLeaderboardSignature(entries) {
    const selfNameLower = (warrior.name || '').toLowerCase();
    let sig = `${selfNameLower}#${entries.length}`;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      sig += `|${e.rank || i + 1}:${e.name}:${e.kills != null ? e.kills : 0}:${e.color || ''}`;
    }
    return sig;
  }

  function renderLeaderboard(force = true) {
    if (!leaderboardListEl) return;
    const entries = (Array.isArray(leaderboard) ? leaderboard : []).slice(0, LEADERBOARD_MAX_ENTRIES);
    const sig = getLeaderboardSignature(entries);
    const hasChildren = Boolean(
      leaderboardListEl.children && leaderboardListEl.children.length > 0
    );
    if (!force && sig === lastLeaderboardSignature && hasChildren) {
      return;
    }
    lastLeaderboardSignature = sig;

    if (Array.isArray(leaderboardListEl.children)) {
      leaderboardListEl.children.length = 0;
    }
    leaderboardListEl.innerHTML = '';

    if (entries.length === 0) {
      if (typeof document.createElement === 'function' && typeof leaderboardListEl.appendChild === 'function') {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'leaderboard-empty';
        emptyLi.textContent = 'No enemies slain yet';
        leaderboardListEl.appendChild(emptyLi);
      }
      return;
    }

    if (typeof document.createElement !== 'function' || typeof leaderboardListEl.appendChild !== 'function') {
      return;
    }

    const selfNameLower = (warrior.name || '').toLowerCase();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const li = document.createElement('li');
      const isSelf =
        selfNameLower && entry.name && entry.name.toLowerCase() === selfNameLower;
      li.className = isSelf ? 'leaderboard-item leaderboard-self' : 'leaderboard-item';

      const rankSpan = document.createElement('span');
      rankSpan.className = 'leaderboard-rank';
      rankSpan.textContent = `#${entry.rank || i + 1}`;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'leaderboard-name';
      nameSpan.textContent = entry.name;

      const killsSpan = document.createElement('span');
      killsSpan.className = 'leaderboard-kills';
      killsSpan.textContent = String(entry.kills != null ? entry.kills : 0);

      li.appendChild(rankSpan);
      li.appendChild(nameSpan);
      li.appendChild(killsSpan);
      leaderboardListEl.appendChild(li);
    }
  }

  function getChainRestLength(
    links = warrior.chainLinks,
    linkLength = warrior.hammers && warrior.hammers[0] ? warrior.hammers[0].linkLength : LENGTH_PER_LINK
  ) {
    return BASE_CHAIN_OFFSET + links * (linkLength || LENGTH_PER_LINK);
  }

  function initHammerChainNodes(h) {
    if (!h.chainNodes) h.chainNodes = [];
    h.chainNodes.length = 0;
    const links = Math.min(MAX_CHAIN_LINKS, h.chainLinks || INITIAL_CHAIN_LINKS);
    h.chainLinks = links;
    for (let i = 0; i <= links; i++) {
      const t = links > 0 ? i / links : 0;
      h.chainNodes.push({
        x: warrior.x + (h.x - warrior.x) * t,
        y: warrior.y + (h.y - warrior.y) * t,
        vx: warrior.vx + (h.vx - warrior.vx) * t,
        vy: warrior.vy + (h.vy - warrior.vy) * t,
        prevX: warrior.x + (h.x - warrior.x) * t,
        prevY: warrior.y + (h.y - warrior.y) * t,
      });
    }
  }

  function addHammerChainLinkNode(h) {
    const nodes = h.chainNodes;
    const n = nodes.length;
    if (n >= 2) {
      const prev = nodes[n - 2];
      const last = nodes[n - 1];
      const midX = (prev.x + last.x) * 0.5;
      const midY = (prev.y + last.y) * 0.5;
      nodes.splice(n - 1, 0, {
        x: midX,
        y: midY,
        vx: (prev.vx + last.vx) * 0.5,
        vy: (prev.vy + last.vy) * 0.5,
        prevX: midX,
        prevY: midY,
      });
    } else {
      initHammerChainNodes(h);
    }
  }

  function createExtraHammer(spawnAngle = Math.PI / 2) {
    const initLen = getChainRestLength(INITIAL_CHAIN_LINKS, LENGTH_PER_LINK);
    const newH = {
      x: warrior.x + Math.cos(spawnAngle) * initLen * 0.85,
      y: warrior.y + Math.sin(spawnAngle) * initLen * 0.85,
      vx: warrior.vx + Math.cos(spawnAngle) * 180,
      vy: warrior.vy + Math.sin(spawnAngle) * 180,
      radius: 17,
      mass: INITIAL_HAMMER_MASS,
      chainLinks: INITIAL_CHAIN_LINKS,
      linkLength: LENGTH_PER_LINK,
      chainNodes: [],
      chainMinX: 0,
      chainMaxX: 0,
      chainMinY: 0,
      chainMaxY: 0,
      serverX: warrior.x + Math.cos(spawnAngle) * initLen * 0.85,
      serverY: warrior.y + Math.sin(spawnAngle) * initLen * 0.85,
      serverVx: warrior.vx + Math.cos(spawnAngle) * 180,
      serverVy: warrior.vy + Math.sin(spawnAngle) * 180,
      serverAngle: spawnAngle,
      hasServerTarget: false,
      bombCharges: 0,
      flameCharges: 0,
      flameTimer: 0,
      discoTimer: 0,
      jackolanternTimer: 0,
      spiderTimer: 0,
      extraTimer: EXTRA_HAMMER_DURATION,
      isSpider: false,
      angle: spawnAngle,
      currentTension: 0,
      currentStretch: 0,
      trail: [],
    };
    initHammerChainNodes(newH);
    return newH;
  }

  function getRandomSpawnPosition() {
    let x = WORLD_WIDTH / 2;
    let y = WORLD_HEIGHT / 2;
    for (let attempt = 0; attempt < 40; attempt++) {
      const cx = 480 + Math.random() * (WORLD_WIDTH - 960);
      const cy = 480 + Math.random() * (WORLD_HEIGHT - 960);
      let blocked = false;
      for (let i = 0; i < stoneColumns.length; i++) {
        if (Math.hypot(cx - stoneColumns[i].x, cy - stoneColumns[i].y) < stoneColumns[i].radius + 75) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        x = cx;
        y = cy;
        break;
      }
    }
    return { x, y };
  }

  function isWorldPointVisible(x, y, margin = 240) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    const viewLeft = camera.x - margin;
    const viewRight = camera.x + viewportWidth + margin;
    const viewTop = camera.y - margin;
    const viewBottom = camera.y + viewportHeight / TILT_Y + margin;
    return x >= viewLeft && x <= viewRight && y >= viewTop && y <= viewBottom;
  }

  function processServerEvents(events) {
    if (!Array.isArray(events)) return;
    const cullMargin =
      visualQualityTier === QUALITY_TIER_HIGH
        ? 320
        : visualQualityTier === QUALITY_TIER_MEDIUM
        ? 160
        : 60;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === 'impact') {
        const isLocalVictim = ev.victimPlayerId && ev.victimPlayerId === localPlayerId;
        if (!isLocalVictim && !isWorldPointVisible(ev.x, ev.y, cullMargin)) {
          continue;
        }
        playImpactSound(ev.damage, !!ev.isChain);
        if (ev.victimPlayerId) {
          playPlayerHurtSound();
        }
        if (ev.isChain) {
          addParticles(ev.x, ev.y, '#cbd5e0', 5, 40, 160, 2.5);
          addFloatingText(ev.enemyX, ev.enemyY, `-${ev.damage}`, '#cbd5e0', 0.92);
        } else {
          const sparkCount = Math.min(22, 5 + Math.floor(ev.damage / 8));
          addParticles(ev.x, ev.y, '#fbd38d', sparkCount, 60, 260, 3.2);
          if (ev.damage >= 25) {
            addShockwave(ev.x, ev.y, Math.min(65, 20 + ev.damage * 0.45));
            camera.shake = Math.min(12, camera.shake + ev.damage * 0.08);
          }
          const dmgColor = ev.damage >= 50 ? '#fbd38d' : '#ffffff';
          const dmgScale = ev.damage >= 50 ? 1.25 : 1.0;
          addFloatingText(ev.enemyX, ev.enemyY, `-${ev.damage}`, dmgColor, dmgScale);
        }
      } else if (ev.type === 'enemy_die') {
        if (!isWorldPointVisible(ev.x, ev.y, cullMargin)) {
          continue;
        }
        playEnemyDisappearSound();
        addParticles(ev.x, ev.y, ev.color || '#567a4e', 18, 40, 210, 4.5);
        addParticles(ev.x, ev.y, '#22331d', 8, 20, 90, 3.5);
      } else if (ev.type === 'pickup') {
        playCollectLinkSound();
        addFloatingText(ev.playerX, ev.playerY, ev.label, ev.color || '#f6e05e', 1.12);
        addParticles(ev.x, ev.y, ev.color || '#f6e05e', 10, 30, 120, 3);
        if (ev.label && ev.label.includes('EARTHQUAKE')) {
          earthquakeTimer = EARTHQUAKE_DURATION;
          localKnockdownTimer = EARTHQUAKE_DURATION + ZOMBIE_KNOCKDOWN_RECOVERY;
          for (let eIdx = 0; eIdx < enemies.length; eIdx++) {
            enemies[eIdx].knockdownTimer = ZOMBIE_KNOCKDOWN_RECOVERY;
            enemies[eIdx].vx = 0;
            enemies[eIdx].vy = 0;
          }
        } else if (
          ev.label &&
          ev.label.includes('BULLDOZER') &&
          (!ev.playerId || ev.playerId === localPlayerId)
        ) {
          warrior.bulldozerTimer = BULLDOZER_DURATION;
          warrior.radius = BULLDOZER_RADIUS;
        }
      } else if (ev.type === 'explosion') {
        playExplosionSound();
        const blastR = ev.radius || EXPLOSION_RADIUS;
        addShockwave(ev.x, ev.y, blastR, '251, 146, 60');
        addShockwave(ev.x, ev.y, blastR * 0.62, '254, 240, 138');
        addParticles(ev.x, ev.y, '#f6ad55', 45, 90, 520, 5.2);
        addParticles(ev.x, ev.y, '#f56565', 32, 60, 420, 4.6);
        addParticles(ev.x, ev.y, '#fefcbf', 18, 40, 280, 3.6);
        camera.shake = Math.min(22, camera.shake + 14);
      } else if (ev.type === 'player_hurt') {
        playPlayerHurtSound();
        if (ev.playerId === localPlayerId) {
          camera.shake = Math.min(8, camera.shake + 3.5);
        }
        addFloatingText(ev.playerX, ev.playerY, `-${ev.damage}`, '#fc8181', 1.05);
        addParticles(ev.x, ev.y, '#fc8181', 6, 40, 130, 3);
      } else if (ev.type === 'ignite') {
        if (!isWorldPointVisible(ev.x, ev.y, cullMargin)) continue;
        addParticles(ev.x, ev.y, '#ff6b35', 10, 35, 150, 3.6);
        addParticles(ev.x, ev.y, '#f6e05e', 6, 25, 110, 2.8);
      } else if (ev.type === 'earthquake') {
        earthquakeTimer = EARTHQUAKE_DURATION;
        localKnockdownTimer = EARTHQUAKE_DURATION + ZOMBIE_KNOCKDOWN_RECOVERY;
        for (let eIdx = 0; eIdx < enemies.length; eIdx++) {
          enemies[eIdx].knockdownTimer = ZOMBIE_KNOCKDOWN_RECOVERY;
          enemies[eIdx].vx = 0;
          enemies[eIdx].vy = 0;
        }
        playEarthquakeSound();
        addShockwave(ev.x, ev.y, 520, '236, 201, 75');
        addShockwave(ev.x, ev.y, 320, '214, 158, 46');
        addParticles(ev.x, ev.y, '#ecc94b', 36, 60, 340, 4.4);
      } else if (ev.type === 'fear_wave') {
        playFearSound();
        const r = ev.radius || FEAR_INITIAL_RADIUS;
        addShockwave(ev.x, ev.y, r, '183, 148, 244');
        addShockwave(ev.x, ev.y, r * 0.65, '128, 90, 213');
        addParticles(ev.x, ev.y, '#b794f4', 32, 60, 320, 4.2);
      } else if (ev.type === 'fear_taint') {
        if (!isWorldPointVisible(ev.x, ev.y, cullMargin)) continue;
        addParticles(ev.x, ev.y, '#b794f4', 8, 30, 130, 3.2);
        addParticles(ev.x, ev.y, '#81e6d9', 5, 20, 100, 2.6);
      } else if (ev.type === 'bulldozer') {
        if (!ev.playerId || ev.playerId === localPlayerId) {
          warrior.bulldozerTimer = BULLDOZER_DURATION;
          warrior.radius = BULLDOZER_RADIUS;
        }
        playBulldozerSound();
        addShockwave(ev.x, ev.y, 180, '236, 201, 75');
        addParticles(ev.x, ev.y, '#ecc94b', 28, 50, 220, 4.0);
        addParticles(ev.x, ev.y, '#4a5568', 16, 30, 150, 3.5);
      } else if (ev.type === 'disco_pickup') {
        playDiscoSound();
        addShockwave(ev.x, ev.y, 170, '246, 135, 179');
        addParticles(ev.x, ev.y, '#f687b3', 18, 40, 190, 3.6);
        addParticles(ev.x, ev.y, '#63b3ed', 14, 35, 170, 3.2);
      } else if (ev.type === 'jackolantern_pickup') {
        playJackOLanternSound();
        addShockwave(ev.x, ev.y, 170, '237, 137, 54');
        addParticles(ev.x, ev.y, '#ed8936', 20, 40, 190, 3.8);
        addParticles(ev.x, ev.y, '#f6e05e', 14, 35, 165, 3.2);
      } else if (ev.type === 'spider_pickup') {
        playSpiderPickupSound();
        addShockwave(ev.x, ev.y, 170, '226, 232, 240');
        addParticles(ev.x, ev.y, '#ffffff', 20, 40, 190, 3.5);
        addParticles(ev.x, ev.y, '#e53e3e', 12, 35, 160, 3.0);
      } else if (ev.type === 'spider_web') {
        if (!isWorldPointVisible(ev.x, ev.y, cullMargin)) continue;
        playSpiderWebSound();
        addParticles(ev.x, ev.y, '#ffffff', 12, 30, 130, 3.2);
        addFloatingText(ev.x, ev.y - 26, 'WEBBED! (30s)', '#ffffff', 1.05);
      } else if (ev.type === 'disco_dance') {
        if (!isWorldPointVisible(ev.x, ev.y, cullMargin)) continue;
        playDiscoChimeSound();
        addParticles(ev.x, ev.y, '#f687b3', 8, 30, 120, 3.0);
        addParticles(ev.x, ev.y, '#63b3ed', 6, 25, 105, 2.8);
        addFloatingText(ev.x, ev.y - 26, '♪ DANCING! ♪', '#f687b3', 1.05);
      } else if (ev.type === 'floating_text') {
        if (!isWorldPointVisible(ev.x, ev.y, cullMargin)) continue;
        addFloatingText(ev.x, ev.y, ev.text, ev.color || '#fff', ev.scale || 1);
      } else if (ev.type === 'victory') {
        playVictorySound();
      } else if (ev.type === 'round_reset') {
        earthquakeTimer = 0;
        localKnockdownTimer = 0;
        warrior.bulldozerTimer = 0;
        warrior.hasServerTarget = false;
        for (let hIdx = 0; hIdx < warrior.hammers.length; hIdx++) {
          warrior.hammers[hIdx].hasServerTarget = false;
          if (warrior.hammers[hIdx].trail) warrior.hammers[hIdx].trail.length = 0;
        }
      }
    }
  }

  function pauseForIdle(reasonText) {
    hasEnteredGame = false;
    isConnecting = false;
    isMultiplayer = false;
    hasSyncedInitialServerState = false;
    if (ws) {
      const sock = ws;
      ws = null;
      try {
        sock.close();
      } catch (_err) {
        // Ignore close error
      }
    }
    remotePlayers.length = 0;
    if (observerBannerEl) observerBannerEl.classList.add('hidden');
    if (victoryModal) {
      victoryModal.classList.add('hidden');
      victoryModal.setAttribute('aria-hidden', 'true');
    }
    if (enterModal) {
      if (enterModalSubtitleEl && reasonText) {
        enterModalSubtitleEl.textContent = reasonText;
      }
      if (nicknameInputEl && warrior.hasCustomNickname && !nicknameInputEl.value) {
        nicknameInputEl.value = warrior.name;
      }
      enterModal.classList.remove('hidden');
      enterModal.setAttribute('aria-hidden', 'false');
    }
  }

  function completeEnterGame() {
    isConnecting = false;
    hasEnteredGame = true;
    lastUserActivityTime = performance.now();
    hasRecentInput = true;
    if (enterModal) {
      enterModal.classList.add('hidden');
      enterModal.setAttribute('aria-hidden', 'true');
    }
    renderLeaderboard();
  }

  function enterGame(customNickname?: string) {
    if (hasEnteredGame) return true;
    const rawInput =
      typeof customNickname === 'string'
        ? customNickname
        : nicknameInputEl && typeof nicknameInputEl.value === 'string'
        ? nicknameInputEl.value
        : '';
    if (!rawInput.trim() && !warrior.hasCustomNickname) {
      if (nicknameInputEl) {
        nicknameInputEl.classList.add('input-error');
        if (typeof nicknameInputEl.focus === 'function') {
          nicknameInputEl.focus();
        }
      }
      if (enterModalSubtitleEl) {
        enterModalSubtitleEl.textContent = 'Please enter a nickname to join the battle!';
      }
      return false;
    }

    const chosenName = sanitizeNickname(
      rawInput.trim() ? rawInput : warrior.name,
      'Warrior'
    );
    warrior.name = chosenName;
    warrior.hasCustomNickname = true;
    setCookie(NICKNAME_COOKIE_NAME, chosenName);
    if (nicknameInputEl) {
      nicknameInputEl.value = chosenName;
      nicknameInputEl.classList.remove('input-error');
    }
    recordLocalLeaderboardScore(warrior.name, kills, warrior.color);

    isConnecting = true;
    lastUserActivityTime = performance.now();
    hasRecentInput = true;
    ensureAudioContext();
    if (enterModal) {
      enterModal.classList.remove('hidden');
      enterModal.setAttribute('aria-hidden', 'false');
    }
    if (enterModalSubtitleEl) {
      enterModalSubtitleEl.textContent = 'Connecting...';
    }
    connectMultiplayer();
    renderLeaderboard();
    return true;
  }

  function connectMultiplayer() {
    if (!hasEnteredGame && !isConnecting) return;
    const WebSocketClass = win.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (!WebSocketClass) return;
    if (!window.location.host || window.location.protocol === 'file:') return;
    if (ws && ws.readyState === WebSocketClass.OPEN) {
      isMultiplayer = true;
      completeEnterGame();
      return;
    }
    if (ws && ws.readyState === WebSocketClass.CONNECTING) {
      return;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      ws = new WebSocketClass(`${proto}//${window.location.host}`);
    } catch (_err) {
      return;
    }

    ws.addEventListener('open', () => {
      isMultiplayer = true;
      hasSyncedInitialServerState = false;
      completeEnterGame();
      if (warrior.hasCustomNickname && ws && ws.readyState === WebSocketClass.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'set_nickname',
            nickname: warrior.name,
            leaderboard: getTopLocalLeaderboard(),
          })
        );
      }
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (_err) {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'idle_disconnect') {
        pauseForIdle(
          'Session paused due to inactivity so the server stays idle when nobody is playing. Click to rejoin!'
        );
        return;
      }

      if (msg.type === 'welcome') {
        localPlayerId = msg.playerId;
        isMultiplayer = true;
        completeEnterGame();
        if (warrior.hasCustomNickname && ws && ws.readyState === WebSocketClass.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'set_nickname',
              nickname: warrior.name,
              leaderboard: getTopLocalLeaderboard(),
            })
          );
        }
        if (Array.isArray(msg.leaderboard)) {
          syncServerLeaderboard(msg.leaderboard);
          renderLeaderboard();
        }
      } else if (msg.type === 'state' && isMultiplayer) {
        serverRoundRestartTimer = msg.roundRestartTimer || 0;
        if (typeof msg.earthquakeTimer === 'number' && msg.earthquakeTimer > 0) {
          earthquakeTimer = Math.max(earthquakeTimer, msg.earthquakeTimer);
          localKnockdownTimer = Math.max(
            localKnockdownTimer,
            msg.earthquakeTimer + ZOMBIE_KNOCKDOWN_RECOVERY
          );
        }
        if (msg.roundState) roundState = msg.roundState;
        if (typeof msg.teamKills === 'number') teamKills = msg.teamKills;
        victoryInfo = msg.victoryInfo || null;
        if (Array.isArray(msg.leaderboard)) {
          syncServerLeaderboard(msg.leaderboard);
        }

        const hasRoundReset =
          Array.isArray(msg.events) &&
          msg.events.some((ev) => ev && ev.type === 'round_reset');
        if (hasRoundReset) {
          hasSyncedInitialServerState = false;
        }

        if (Array.isArray(msg.players)) {
          const prevRemoteById = new Map();
          for (let i = 0; i < remotePlayers.length; i++) {
            const rp = remotePlayers[i];
            if (rp && rp.id != null) {
              prevRemoteById.set(rp.id, rp);
            }
          }
          remotePlayers.length = 0;

          for (let i = 0; i < msg.players.length; i++) {
            const p = msg.players[i];
            if (p.id === localPlayerId) {
              const wasDead = !warrior.alive;
              const posError = Math.hypot(p.x - warrior.x, p.y - warrior.y);
              const shouldHardSnap =
                !hasSyncedInitialServerState ||
                (wasDead && p.alive) ||
                !p.alive ||
                posError > 260;

              warrior.serverX = p.x;
              warrior.serverY = p.y;
              warrior.serverVx = p.vx || 0;
              warrior.serverVy = p.vy || 0;
              warrior.serverAngle = p.angle || 0;
              warrior.hasServerTarget = true;

              if (shouldHardSnap) {
                warrior.x = p.x;
                warrior.y = p.y;
                warrior.vx = p.vx || 0;
                warrior.vy = p.vy || 0;
                warrior.angle = p.angle || 0;
                warrior.walkCycle = p.walkCycle || 0;
              } else {
                warrior.x += (p.x - warrior.x) * 0.28;
                warrior.y += (p.y - warrior.y) * 0.28;
                warrior.vx = warrior.vx * 0.72 + (p.vx || 0) * 0.28;
                warrior.vy = warrior.vy * 0.72 + (p.vy || 0) * 0.28;
              }

              warrior.radius = p.radius || 20;
              warrior.hp = p.hp;
              warrior.maxHp = p.maxHp;
              warrior.alive = p.alive;
              if (!warrior.hasCustomNickname) {
                warrior.name = p.name;
              }
              warrior.color = p.color;
              warrior.capeColor = p.capeColor;
              warrior.plumeColor = p.plumeColor;
              warrior.chainLinks = p.chainLinks;
              if (typeof p.speedMultiplier === 'number') {
                warrior.speedMultiplier = p.speedMultiplier;
              }
              if (typeof p.tractionMultiplier === 'number') {
                warrior.tractionMultiplier = p.tractionMultiplier;
              }
              warrior.mountType = p.mountType || null;
              warrior.mountHp = p.mountHp || 0;
              warrior.mountMaxHp = p.mountMaxHp || 0;
              if (typeof p.bulldozerTimer === 'number' && p.bulldozerTimer > 0) {
                warrior.bulldozerTimer = Math.max(warrior.bulldozerTimer || 0, p.bulldozerTimer);
                warrior.radius = BULLDOZER_RADIUS;
              } else if ((p.bulldozerTimer || 0) <= 0 && (warrior.bulldozerTimer || 0) < BULLDOZER_DURATION - 1.5) {
                warrior.bulldozerTimer = 0;
              }
              warrior.hurtFlash = p.hurtFlash;
              kills = p.kills || 0;
              maxDamageBlow = p.maxDamageBlow || 0;

              const serverHammers = Array.isArray(p.hammers) && p.hammers.length > 0
                ? p.hammers
                : p.hammer
                ? [{ ...p.hammer, chainNodes: p.chainNodes || [] }]
                : [];

              while (warrior.hammers.length > serverHammers.length) {
                warrior.hammers.pop();
              }

              for (let hIdx = 0; hIdx < serverHammers.length; hIdx++) {
                const sh = serverHammers[hIdx];
                let lh = warrior.hammers[hIdx];
                const isNewHammer = !lh;
                if (!lh) {
                  lh = {
                    x: sh.x,
                    y: sh.y,
                    vx: sh.vx || 0,
                    vy: sh.vy || 0,
                    radius: sh.radius || 17,
                    mass: sh.mass || INITIAL_HAMMER_MASS,
                    chainLinks: sh.chainLinks || INITIAL_CHAIN_LINKS,
                    linkLength: sh.linkLength || LENGTH_PER_LINK,
                    chainNodes: [],
                    chainMinX: 0,
                    chainMaxX: 0,
                    chainMinY: 0,
                    chainMaxY: 0,
                    serverX: sh.x,
                    serverY: sh.y,
                    serverVx: sh.vx || 0,
                    serverVy: sh.vy || 0,
                    serverAngle: sh.angle || 0,
                    hasServerTarget: true,
                    bombCharges: sh.bombCharges || 0,
                    flameTimer: sh.flameTimer || 0,
                    discoTimer: sh.discoTimer || 0,
                    jackolanternTimer: sh.jackolanternTimer || 0,
                    spiderTimer: sh.spiderTimer || 0,
                    extraTimer: sh.extraTimer || 0,
                    isSpider: !!sh.isSpider,
                    angle: sh.angle || 0,
                    currentStretch: sh.currentStretch || 0,
                    trail: [],
                  };
                  warrior.hammers.push(lh);
                } else {
                  const hammerSnap =
                    shouldHardSnap || Math.hypot(sh.x - lh.x, sh.y - lh.y) > 320;
                  lh.serverX = sh.x;
                  lh.serverY = sh.y;
                  lh.serverVx = sh.vx || 0;
                  lh.serverVy = sh.vy || 0;
                  lh.serverAngle = sh.angle || 0;
                  lh.hasServerTarget = true;

                  if (hammerSnap) {
                    lh.x = sh.x;
                    lh.y = sh.y;
                    lh.vx = sh.vx || 0;
                    lh.vy = sh.vy || 0;
                    lh.angle = sh.angle || 0;
                  } else {
                    lh.x += (sh.x - lh.x) * 0.35;
                    lh.y += (sh.y - lh.y) * 0.35;
                    lh.vx = lh.vx * 0.5 + (sh.vx || 0) * 0.5;
                    lh.vy = lh.vy * 0.5 + (sh.vy || 0) * 0.5;
                    lh.angle = lerpAngle(lh.angle || 0, sh.angle || 0, 0.35);
                  }
                  lh.radius = sh.radius || 17;
                  lh.mass = sh.mass || INITIAL_HAMMER_MASS;
                  lh.chainLinks = sh.chainLinks || INITIAL_CHAIN_LINKS;
                  lh.linkLength = sh.linkLength || LENGTH_PER_LINK;
                  lh.bombCharges = sh.bombCharges || 0;
                  lh.flameTimer = sh.flameTimer || 0;
                  lh.discoTimer = sh.discoTimer || 0;
                  lh.jackolanternTimer = sh.jackolanternTimer || 0;
                  lh.spiderTimer = sh.spiderTimer || 0;
                  lh.extraTimer = sh.extraTimer || 0;
                  lh.isSpider = !!sh.isSpider;
                  lh.currentStretch = sh.currentStretch || 0;
                }

                if (Array.isArray(sh.chainNodes)) {
                  const snapNodes =
                    isNewHammer ||
                    shouldHardSnap ||
                    lh.chainNodes.length !== sh.chainNodes.length;
                  if (snapNodes) {
                    lh.chainNodes.length = 0;
                    for (let c = 0; c < sh.chainNodes.length; c++) {
                      lh.chainNodes.push({
                        x: sh.chainNodes[c].x,
                        y: sh.chainNodes[c].y,
                        vx: 0,
                        vy: 0,
                        prevX: sh.chainNodes[c].x,
                        prevY: sh.chainNodes[c].y,
                      });
                    }
                  } else {
                    for (let c = 0; c < sh.chainNodes.length; c++) {
                      const cn = lh.chainNodes[c];
                      cn.x += (sh.chainNodes[c].x - cn.x) * 0.35;
                      cn.y += (sh.chainNodes[c].y - cn.y) * 0.35;
                      cn.prevX = cn.x;
                      cn.prevY = cn.y;
                    }
                  }
                }
              }

              updateWarriorBroadphaseBounds(warrior);

              if ((wasDead && warrior.alive) || !hasSyncedInitialServerState) {
                hasSyncedInitialServerState = true;
                camera.x = warrior.x - viewportWidth / 2;
                camera.y = warrior.y - viewportHeight / 2 / TILT_Y;
              }
            } else {
              const prevRp = p.id != null ? prevRemoteById.get(p.id) : null;
              const incomingHammers =
                Array.isArray(p.hammers) && p.hammers.length > 0
                  ? p.hammers
                  : p.hammer
                  ? [{ ...p.hammer, chainNodes: p.chainNodes || [] }]
                  : [];

              if (
                prevRp &&
                !hasRoundReset &&
                prevRp.alive &&
                p.alive &&
                Math.hypot(p.x - prevRp.x, p.y - prevRp.y) <= 260
              ) {
                prevRp.name = p.name;
                prevRp.color = p.color;
                prevRp.capeColor = p.capeColor;
                prevRp.plumeColor = p.plumeColor;
                prevRp.alive = p.alive;
                prevRp.radius = p.radius || 20;
                prevRp.hp = p.hp;
                prevRp.maxHp = p.maxHp;
                prevRp.mountType = p.mountType || null;
                prevRp.mountHp = p.mountHp || 0;
                prevRp.mountMaxHp = p.mountMaxHp || 0;
                prevRp.bulldozerTimer = p.bulldozerTimer || 0;
                prevRp.chainLinks = p.chainLinks;
                prevRp.hurtFlash = p.hurtFlash || 0;
                prevRp.kills = p.kills || 0;
                prevRp.maxDamageBlow = p.maxDamageBlow || 0;
                prevRp.vx = p.vx || 0;
                prevRp.vy = p.vy || 0;
                prevRp.targetX = p.x;
                prevRp.targetY = p.y;
                prevRp.targetAngle = p.angle || 0;
                prevRp.x += (p.x - prevRp.x) * 0.35;
                prevRp.y += (p.y - prevRp.y) * 0.35;
                prevRp.angle = lerpAngle(prevRp.angle || 0, p.angle || 0, 0.35);

                if (!Array.isArray(prevRp.hammers)) {
                  prevRp.hammers = [];
                }
                while (prevRp.hammers.length > incomingHammers.length) {
                  prevRp.hammers.pop();
                }
                for (let hIdx = 0; hIdx < incomingHammers.length; hIdx++) {
                  const sh = incomingHammers[hIdx];
                  let rh = prevRp.hammers[hIdx];
                  if (
                    rh &&
                    Math.hypot(sh.x - rh.x, sh.y - rh.y) <= 320
                  ) {
                    rh.radius = sh.radius || 17;
                    rh.mass = sh.mass || INITIAL_HAMMER_MASS;
                    rh.chainLinks = sh.chainLinks || INITIAL_CHAIN_LINKS;
                    rh.linkLength = sh.linkLength || LENGTH_PER_LINK;
                    rh.bombCharges = sh.bombCharges || 0;
                    rh.flameTimer = sh.flameTimer || 0;
                    rh.discoTimer = sh.discoTimer || 0;
                    rh.jackolanternTimer = sh.jackolanternTimer || 0;
                    rh.spiderTimer = sh.spiderTimer || 0;
                    rh.extraTimer = sh.extraTimer || 0;
                    rh.isSpider = !!sh.isSpider;
                    rh.currentStretch = sh.currentStretch || 0;
                    rh.vx = sh.vx || 0;
                    rh.vy = sh.vy || 0;
                    rh.targetX = sh.x;
                    rh.targetY = sh.y;
                    rh.targetAngle = sh.angle || 0;
                    rh.x += (sh.x - rh.x) * 0.35;
                    rh.y += (sh.y - rh.y) * 0.35;
                    rh.angle = lerpAngle(rh.angle || 0, sh.angle || 0, 0.35);

                    if (Array.isArray(sh.chainNodes)) {
                      if (
                        !Array.isArray(rh.chainNodes) ||
                        rh.chainNodes.length !== sh.chainNodes.length
                      ) {
                        rh.chainNodes = sh.chainNodes.map((n) => ({
                          x: n.x,
                          y: n.y,
                          targetX: n.x,
                          targetY: n.y,
                        }));
                      } else {
                        for (let c = 0; c < sh.chainNodes.length; c++) {
                          const rn = rh.chainNodes[c];
                          rn.targetX = sh.chainNodes[c].x;
                          rn.targetY = sh.chainNodes[c].y;
                          rn.x += (sh.chainNodes[c].x - rn.x) * 0.35;
                          rn.y += (sh.chainNodes[c].y - rn.y) * 0.35;
                        }
                      }
                    }
                  } else {
                    const clonedNodes = Array.isArray(sh.chainNodes)
                      ? sh.chainNodes.map((n) => ({
                          x: n.x,
                          y: n.y,
                          targetX: n.x,
                          targetY: n.y,
                        }))
                      : [];
                    prevRp.hammers[hIdx] = {
                      ...sh,
                      targetX: sh.x,
                      targetY: sh.y,
                      targetAngle: sh.angle || 0,
                      chainNodes: clonedNodes,
                    };
                  }
                }
                prevRp.hammer = prevRp.hammers[0] || null;
                prevRp.chainNodes = prevRp.hammer ? prevRp.hammer.chainNodes : [];
                remotePlayers.push(prevRp);
              } else {
                const initHammers = incomingHammers.map((sh) => ({
                  ...sh,
                  targetX: sh.x,
                  targetY: sh.y,
                  targetAngle: sh.angle || 0,
                  chainNodes: Array.isArray(sh.chainNodes)
                    ? sh.chainNodes.map((n) => ({
                        x: n.x,
                        y: n.y,
                        targetX: n.x,
                        targetY: n.y,
                      }))
                    : [],
                }));
                remotePlayers.push({
                  ...p,
                  targetX: p.x,
                  targetY: p.y,
                  targetAngle: p.angle || 0,
                  hammers: initHammers,
                  hammer: initHammers[0] || p.hammer || null,
                  chainNodes: initHammers[0]
                    ? initHammers[0].chainNodes
                    : p.chainNodes || [],
                });
              }
            }
          }
        }

        if (Array.isArray(msg.enemies)) {
          const prevEnemyById = new Map();
          for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e && e.id != null) {
              prevEnemyById.set(e.id, e);
            }
          }
          enemies.length = 0;
          for (let i = 0; i < msg.enemies.length; i++) {
            const inc = msg.enemies[i];
            const prevE = inc.id != null ? prevEnemyById.get(inc.id) : null;
            if (
              prevE &&
              !hasRoundReset &&
              Math.hypot(inc.x - prevE.x, inc.y - prevE.y) <= 260
            ) {
              prevE.variant = inc.variant;
              prevE.radius = inc.radius;
              prevE.hp = inc.hp;
              prevE.maxHp = inc.maxHp;
              prevE.skinColor = inc.skinColor;
              prevE.coatColor = inc.coatColor;
              prevE.hurtFlash = inc.hurtFlash || 0;
              prevE.burnTimer = inc.burnTimer || 0;
              prevE.fireproofTimer = inc.fireproofTimer || 0;
              prevE.fearTimer = inc.fearTimer || 0;
              prevE.danceTimer = inc.danceTimer || 0;
              prevE.danceImmuneTimer = inc.danceImmuneTimer || 0;
              prevE.webTimer = inc.webTimer || 0;
              prevE.knockdownTimer = inc.knockdownTimer || 0;
              prevE.vx = inc.vx || 0;
              prevE.vy = inc.vy || 0;
              prevE.targetX = inc.x;
              prevE.targetY = inc.y;
              prevE.targetAngle = inc.angle || 0;
              prevE.x += (inc.x - prevE.x) * 0.35;
              prevE.y += (inc.y - prevE.y) * 0.35;
              prevE.angle = lerpAngle(prevE.angle || 0, inc.angle || 0, 0.35);
              if (typeof prevE.walkPhase !== 'number') {
                prevE.walkPhase = inc.walkPhase || 0;
              }
              enemies.push(prevE);
            } else {
              enemies.push({
                ...inc,
                targetX: inc.x,
                targetY: inc.y,
                targetAngle: inc.angle || 0,
              });
            }
          }
        }

        if (Array.isArray(msg.pickups)) {
          const prevPulseById = new Map();
          for (let i = 0; i < blackCircles.length; i++) {
            if (blackCircles[i].id != null) {
              prevPulseById.set(blackCircles[i].id, blackCircles[i].pulse || 0);
            }
          }
          blackCircles.length = 0;
          for (let i = 0; i < msg.pickups.length; i++) {
            const pk = msg.pickups[i];
            blackCircles.push({
              id: pk.id,
              x: pk.x,
              y: pk.y,
              type: pk.type || 'link',
              pulse: prevPulseById.get(pk.id) || 0,
            });
          }
        }

        if (msg.events) {
          processServerEvents(msg.events);
        }
      }
    });

    ws.addEventListener('close', () => {
      isMultiplayer = false;
      hasSyncedInitialServerState = false;
      ws = null;
      if (hasEnteredGame || isConnecting) {
        setTimeout(connectMultiplayer, 2000);
      }
    });
  }

  function sendInputToServer() {
    const openState = win.WebSocket ? win.WebSocket.OPEN : 1;
    if (!hasEnteredGame || !isMultiplayer || !ws || ws.readyState !== openState) return;
    const active = hasRecentInput;
    hasRecentInput = false;
    ws.send(
      JSON.stringify({
        type: 'input',
        nickname: warrior.hasCustomNickname ? warrior.name : undefined,
        active,
        mouseWorldX: +(camera.x + mouse.screenX).toFixed(1),
        mouseWorldY: +(camera.y + mouse.screenY / TILT_Y).toFixed(1),
      })
    );
  }

  function initChainNodes() {
    hammer.chainLinks = warrior.chainLinks;
    initHammerChainNodes(hammer);
  }

  function addChainLinkNode() {
    addHammerChainLinkNode(hammer);
  }

  function isCommonPickupType(type) {
    return PICKUP_TYPES.includes(type || 'link');
  }

  function addPickupToWorld(pickup) {
    while (blackCircles.length >= MAX_PICKUP_COUNT) {
      const oldestCommonIdx = blackCircles.findIndex((c) => isCommonPickupType(c.type));
      if (oldestCommonIdx !== -1) {
        blackCircles.splice(oldestCommonIdx, 1);
      } else {
        blackCircles.shift();
      }
    }
    if (pickup && typeof pickup === 'object' && 'radius' in pickup) {
      delete pickup.radius;
    }
    blackCircles.push(pickup);
  }

  function defeatEnemy(index) {
    const e = enemies[index];
    kills++;
    teamKills = kills;
    recordLocalLeaderboardScore(warrior.name, kills, warrior.color);
    playEnemyDisappearSound();
    addParticles(e.x, e.y, e.skinColor || '#567a4e', 18, 40, 210, 4.5);
    addParticles(e.x, e.y, '#1a1a1a', 8, 20, 90, 3.5);
    const roll = Math.random();
    let pickupType;
    if (roll < RARE_BULLDOZER_DROP_CHANCE) {
      pickupType = 'bulldozer';
    } else if (roll < RARE_BULLDOZER_DROP_CHANCE + RARE_ELEPHANT_DROP_CHANCE) {
      pickupType = 'elephant';
    } else if (
      roll <
      RARE_BULLDOZER_DROP_CHANCE + RARE_ELEPHANT_DROP_CHANCE + RARE_HORSE_DROP_CHANCE
    ) {
      pickupType = 'horse';
    } else if (
      roll <
      RARE_BULLDOZER_DROP_CHANCE +
        RARE_ELEPHANT_DROP_CHANCE +
        RARE_HORSE_DROP_CHANCE +
        RARE_TORTOISE_DROP_CHANCE
    ) {
      pickupType = 'tortoise';
    } else if (
      roll <
      RARE_BULLDOZER_DROP_CHANCE +
        RARE_ELEPHANT_DROP_CHANCE +
        RARE_HORSE_DROP_CHANCE +
        RARE_TORTOISE_DROP_CHANCE +
        RARE_EARTHQUAKE_DROP_CHANCE
    ) {
      pickupType = 'earthquake';
    } else if (
      roll <
      RARE_BULLDOZER_DROP_CHANCE +
        RARE_ELEPHANT_DROP_CHANCE +
        RARE_HORSE_DROP_CHANCE +
        RARE_TORTOISE_DROP_CHANCE +
        RARE_EARTHQUAKE_DROP_CHANCE +
        RARE_FEAR_DROP_CHANCE
    ) {
      pickupType = 'fear';
    } else if (
      roll <
      RARE_BULLDOZER_DROP_CHANCE +
        RARE_ELEPHANT_DROP_CHANCE +
        RARE_HORSE_DROP_CHANCE +
        RARE_TORTOISE_DROP_CHANCE +
        RARE_EARTHQUAKE_DROP_CHANCE +
        RARE_FEAR_DROP_CHANCE +
        RARE_DISCO_DROP_CHANCE
    ) {
      pickupType = 'disco';
    } else if (
      roll <
      RARE_BULLDOZER_DROP_CHANCE +
        RARE_ELEPHANT_DROP_CHANCE +
        RARE_HORSE_DROP_CHANCE +
        RARE_TORTOISE_DROP_CHANCE +
        RARE_EARTHQUAKE_DROP_CHANCE +
        RARE_FEAR_DROP_CHANCE +
        RARE_DISCO_DROP_CHANCE +
        RARE_JACKOLANTERN_DROP_CHANCE
    ) {
      pickupType = 'jackolantern';
    } else if (
      roll <
      RARE_BULLDOZER_DROP_CHANCE +
        RARE_ELEPHANT_DROP_CHANCE +
        RARE_HORSE_DROP_CHANCE +
        RARE_TORTOISE_DROP_CHANCE +
        RARE_EARTHQUAKE_DROP_CHANCE +
        RARE_FEAR_DROP_CHANCE +
        RARE_DISCO_DROP_CHANCE +
        RARE_JACKOLANTERN_DROP_CHANCE +
        RARE_SPIDER_DROP_CHANCE
    ) {
      pickupType = 'spider';
    } else if (
      roll <
      RARE_BULLDOZER_DROP_CHANCE +
        RARE_ELEPHANT_DROP_CHANCE +
        RARE_HORSE_DROP_CHANCE +
        RARE_TORTOISE_DROP_CHANCE +
        RARE_EARTHQUAKE_DROP_CHANCE +
        RARE_FEAR_DROP_CHANCE +
        RARE_DISCO_DROP_CHANCE +
        RARE_JACKOLANTERN_DROP_CHANCE +
        RARE_SPIDER_DROP_CHANCE +
        RARE_HAMMER_DROP_CHANCE
    ) {
      pickupType = 'hammer';
    } else {
      pickupType = PICKUP_TYPES[Math.floor(Math.random() * PICKUP_TYPES.length)];
    }
    addPickupToWorld({
      x: e.x,
      y: e.y,
      pulse: 0,
      type: pickupType,
    });
    enemies.splice(index, 1);

    if (!isMultiplayer && roundState === 'playing' && kills > VICTORY_KILL_TARGET) {
      roundState = 'victory';
      localVictoryTimer = 0;
      victoryInfo = {
        reason: 'coop_kills',
        title: 'ARENA VICTORY!',
        subtitle: `You defeated ${kills} zombies across the battlefield!`,
        teamKills: kills,
        championName: warrior.name,
      };
      playVictorySound();
    }
  }

  function triggerHammerExplosion(ex, ey, sourceHammer = hammer) {
    playExplosionSound();
    addShockwave(ex, ey, EXPLOSION_RADIUS, '251, 146, 60');
    addShockwave(ex, ey, EXPLOSION_RADIUS * 0.62, '254, 240, 138');
    addParticles(ex, ey, '#f6ad55', 45, 90, 520, 5.2);
    addParticles(ex, ey, '#f56565', 32, 60, 420, 4.6);
    addParticles(ex, ey, '#fefcbf', 18, 40, 280, 3.6);
    camera.shake = Math.min(22, camera.shake + 14);

    for (let j = enemies.length - 1; j >= 0; j--) {
      const target = enemies[j];
      const bdx = target.x - ex;
      const bdy = target.y - ey;
      const bDist = Math.hypot(bdx, bdy);
      if (bDist <= EXPLOSION_RADIUS + target.radius) {
        const falloff = Math.max(0.35, 1 - bDist / (EXPLOSION_RADIUS + target.radius));
        const blastDamage = Math.round(550 * falloff);
        const blastImpulse = 2400 * falloff;
        const bnx = bDist > 0.001 ? bdx / bDist : Math.cos(Math.random() * Math.PI * 2);
        const bny = bDist > 0.001 ? bdy / bDist : Math.sin(Math.random() * Math.PI * 2);

        target.vx += (blastImpulse / target.mass) * bnx;
        target.vy += (blastImpulse / target.mass) * bny;
        target.hp -= blastDamage;
        target.hurtFlash = 0.32;

        if ((sourceHammer && sourceHammer.flameTimer > 0) || hammer.flameTimer > 0) {
          igniteEnemy(target);
        }

        if (blastDamage > maxDamageBlow) {
          maxDamageBlow = blastDamage;
        }

        addFloatingText(
          target.x,
          target.y - target.radius - 10,
          `-${blastDamage}`,
          '#f6ad55',
          1.35
        );
      }
    }
  }

  function resizeCanvas() {
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewportWidth * dpr);
    canvas.height = Math.floor(viewportHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateCamera();
  }

  window.addEventListener('resize', resizeCanvas);

  /**
   * Enforces Requirement #2:
   * "The player's character is always in the center 1/3 of the viewport.
   * As they walk around, the viewport scrolls around the larger grass field."
   * In Observer Mode (when fallen), tracks the nearest surviving player.
   */
  function updateCamera() {
    const minScreenX = viewportWidth / 3;
    const maxScreenX = (viewportWidth * 2) / 3;
    const minScreenY = viewportHeight / 3;
    const maxScreenY = (viewportHeight * 2) / 3;

    let focusX = warrior.x;
    let focusY = warrior.y;

    if (!warrior.alive) {
      let survivor = null;
      let minDist = Infinity;
      for (let i = 0; i < remotePlayers.length; i++) {
        const rp = remotePlayers[i];
        if (rp.alive) {
          const d = Math.hypot(rp.x - warrior.x, rp.y - warrior.y);
          if (d < minDist) {
            minDist = d;
            survivor = rp;
          }
        }
      }
      if (survivor) {
        focusX = survivor.x;
        focusY = survivor.y;
      }
    }

    const focusScreenX = focusX - camera.x;
    const focusScreenY = (focusY - camera.y) * TILT_Y;

    if (focusScreenX < minScreenX) {
      camera.x = focusX - minScreenX;
    } else if (focusScreenX > maxScreenX) {
      camera.x = focusX - maxScreenX;
    }

    if (focusScreenY < minScreenY) {
      camera.y = focusY - minScreenY / TILT_Y;
    } else if (focusScreenY > maxScreenY) {
      camera.y = focusY - maxScreenY / TILT_Y;
    }
  }

  function spawnEnemy(atEdgeOfScreen = false) {
    // Pick zombie archetype for visual and physics variety
    const roll = Math.random();
    let archetype;
    if (roll < 0.25) {
      archetype = {
        variant: 'shambler',
        radius: 15,
        mass: 1.05,
        maxHp: 45,
        moveForce: 250,
        traction: 4.8,
        contactDamage: 4,
        contactPush: 210,
        skinColor: '#688f5e',
        coatColor: '#3b4238',
      };
    } else if (roll < 0.80) {
      archetype = {
        variant: 'walker',
        radius: 19,
        mass: 1.45,
        maxHp: 75,
        moveForce: 210,
        traction: 4.6,
        contactDamage: 6,
        contactPush: 260,
        skinColor: '#567a4e',
        coatColor: '#35302b',
      };
    } else {
      archetype = {
        variant: 'brute',
        radius: 25,
        mass: 2.5,
        maxHp: 135,
        moveForce: 170,
        traction: 4.4,
        contactDamage: 9,
        contactPush: 340,
        skinColor: '#486643',
        coatColor: '#2c2533',
      };
    }

    // Gradual increase in size and hitpoints of new enemies over time
    const timeMinutes = elapsedGameTime / 60;
    const sizeScale = 1 + Math.min(1.65, timeMinutes * 0.42);
    const hpScale = 1 + timeMinutes * 0.95 + Math.pow(timeMinutes, 1.35) * 0.25;
    const scaledRadius = +(archetype.radius * sizeScale).toFixed(2);
    const scaledMaxHp = Math.round(archetype.maxHp * hpScale);
    const scaledMass = +(archetype.mass * Math.pow(sizeScale, 1.35)).toFixed(2);
    const scaledMoveForce = Math.round(archetype.moveForce * Math.pow(sizeScale, 0.9));

    let x, y;
    let attempts = 0;
    const touchesStoneColumn = (px, py) => {
      for (let i = 0; i < stoneColumns.length; i++) {
        const col = stoneColumns[i];
        if (Math.hypot(px - col.x, py - col.y) < col.radius + scaledRadius + 28) {
          return true;
        }
      }
      return false;
    };

    do {
      if (atEdgeOfScreen) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.max(viewportWidth, viewportHeight) * 0.68 + Math.random() * 550;
        x = Math.max(80, Math.min(WORLD_WIDTH - 80, warrior.x + Math.cos(angle) * dist));
        y = Math.max(80, Math.min(WORLD_HEIGHT - 80, warrior.y + Math.sin(angle) * dist));
      } else {
        x = 120 + Math.random() * (WORLD_WIDTH - 240);
        y = 120 + Math.random() * (WORLD_HEIGHT - 240);
      }
      attempts++;
    } while (
      (Math.hypot(x - warrior.x, y - warrior.y) < 340 || touchesStoneColumn(x, y)) &&
      attempts < 30
    );

    enemies.push({
      variant: archetype.variant,
      x,
      y,
      vx: 0,
      vy: 0,
      angle: Math.atan2(warrior.y - y, warrior.x - x),
      radius: scaledRadius,
      mass: scaledMass,
      hp: scaledMaxHp,
      maxHp: scaledMaxHp,
      moveForce: scaledMoveForce,
      traction: archetype.traction,
      contactDamage: Math.round(archetype.contactDamage * Math.pow(sizeScale, 0.5)),
      contactPush: archetype.contactPush,
      skinColor: archetype.skinColor,
      coatColor: archetype.coatColor,
      hitCooldown: 0,
      chainHitCooldown: 0,
      contactCooldown: 0,
      hurtFlash: 0,
      burnTimer: 0,
      fireproofTimer: 0,
      burnTickAccum: 0,
      fearTimer: 0,
      danceTimer: 0,
      danceImmuneTimer: 0,
      webTimer: 0,
      knockdownTimer: earthquakeTimer > 0 ? ZOMBIE_KNOCKDOWN_RECOVERY : 0,
      walkPhase: Math.random() * Math.PI * 2,
    });
  }

  function startEnemyDance(e) {
    if ((e.danceTimer || 0) > 0 || (e.danceImmuneTimer || 0) > 0) return false;
    e.danceTimer = ZOMBIE_DANCE_DURATION;
    e.vx = 0;
    e.vy = 0;
    playDiscoChimeSound();
    addParticles(e.x, e.y, '#f687b3', 8, 30, 120, 3.0);
    addParticles(e.x, e.y, '#63b3ed', 6, 25, 105, 2.8);
    addFloatingText(e.x, e.y - e.radius - 12, '♪ DANCING! ♪', '#f687b3', 1.05);
    return true;
  }

  function taintEnemyWithFear(e, duration = FEAR_DURATION) {
    if ((e.fearTimer || 0) > 0 && duration <= e.fearTimer) return false;
    e.fearTimer = duration;
    const isKnockedDown =
      earthquakeTimer > 0 || localKnockdownTimer > 0 || (e.knockdownTimer || 0) > 0;
    if (!isKnockedDown) {
      const dx = e.x - warrior.x;
      const dy = e.y - warrior.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const burstSpeed = (e.moveForce / e.traction) * FEAR_SPEED_MULT * 0.85;
      e.angle = Math.atan2(uy, ux);
      e.vx = ux * burstSpeed;
      e.vy = uy * burstSpeed;
    }
    addParticles(e.x, e.y, '#b794f4', 8, 30, 130, 3.2);
    addParticles(e.x, e.y, '#81e6d9', 5, 20, 100, 2.6);
    return true;
  }

  function igniteEnemy(e) {
    if (e.burnTimer > 0 || e.fireproofTimer > 0) return false;
    e.burnTimer = ZOMBIE_BURN_DURATION;
    e.burnTickAccum = 0;
    addParticles(e.x, e.y, '#ff6b35', 10, 35, 150, 3.6);
    addParticles(e.x, e.y, '#f6e05e', 6, 25, 110, 2.8);
    return true;
  }

  function updateVisualQuality(rawDt) {
    if (Number.isFinite(rawDt) && rawDt > 0 && rawDt <= 0.25) {
      const sampleMs = rawDt * 1000;
      avgFrameMs = avgFrameMs * 0.8 + sampleMs * 0.2;
    }

    if (visualQualityTier === QUALITY_TIER_HIGH) {
      if (avgFrameMs > 26.0) {
        visualQualityTier = QUALITY_TIER_LOW;
      } else if (avgFrameMs > 19.5) {
        visualQualityTier = QUALITY_TIER_MEDIUM;
      }
    } else if (visualQualityTier === QUALITY_TIER_MEDIUM) {
      if (avgFrameMs > 26.0) {
        visualQualityTier = QUALITY_TIER_LOW;
      } else if (avgFrameMs < 17.5) {
        visualQualityTier = QUALITY_TIER_HIGH;
      }
    } else {
      if (avgFrameMs < 17.5) {
        visualQualityTier = QUALITY_TIER_HIGH;
      } else if (avgFrameMs < 22.5) {
        visualQualityTier = QUALITY_TIER_MEDIUM;
      }
    }

    const maxParticles =
      MAX_PARTICLES_BY_TIER[visualQualityTier] != null
        ? MAX_PARTICLES_BY_TIER[visualQualityTier]
        : 420;
    if (particles.length > maxParticles) {
      particles.splice(0, particles.length - maxParticles);
    }

    const maxTexts =
      MAX_FLOATING_TEXTS_BY_TIER[visualQualityTier] != null
        ? MAX_FLOATING_TEXTS_BY_TIER[visualQualityTier]
        : 64;
    if (floatingTexts.length > maxTexts) {
      floatingTexts.splice(0, floatingTexts.length - maxTexts);
    }
  }

  function addParticles(x, y, color, count, minSpeed, maxSpeed, size = 3.5) {
    const scale =
      PARTICLE_SPAWN_SCALE_BY_TIER[visualQualityTier] != null
        ? PARTICLE_SPAWN_SCALE_BY_TIER[visualQualityTier]
        : 1.0;
    let effectiveCount = count;
    if (scale < 1.0) {
      if (count <= 1) {
        effectiveCount = Math.random() < scale ? 1 : 0;
      } else {
        effectiveCount = Math.max(1, Math.round(count * scale));
      }
    }
    if (effectiveCount <= 0) return;

    const maxParticles =
      MAX_PARTICLES_BY_TIER[visualQualityTier] != null
        ? MAX_PARTICLES_BY_TIER[visualQualityTier]
        : 420;
    const overflow = particles.length + effectiveCount - maxParticles;
    if (overflow > 0) {
      particles.splice(0, Math.min(particles.length, overflow));
    }

    for (let i = 0; i < effectiveCount; i++) {
      if (particles.length >= maxParticles) break;
      const ang = Math.random() * Math.PI * 2;
      const spd = minSpeed + Math.random() * (maxSpeed - minSpeed);
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        size: size * (0.65 + Math.random() * 0.7),
        color,
      });
    }
  }

  function addFloatingText(x, y, text, color = '#fff', scale = 1) {
    const maxTexts =
      MAX_FLOATING_TEXTS_BY_TIER[visualQualityTier] != null
        ? MAX_FLOATING_TEXTS_BY_TIER[visualQualityTier]
        : 64;
    if (floatingTexts.length >= maxTexts) {
      floatingTexts.splice(0, floatingTexts.length - maxTexts + 1);
    }
    floatingTexts.push({
      x,
      y,
      vy: -52,
      text,
      color,
      scale,
      life: 0.9,
      maxLife: 0.9,
    });
  }

  function addShockwave(x, y, maxRadius, rgb = '255, 232, 145') {
    shockwaves.push({
      x,
      y,
      radius: 8,
      maxRadius,
      rgb,
      life: 0.26,
      maxLife: 0.26,
    });
  }

  // --- Reset / Initialize Game ---
  function initGame() {
    if (isMultiplayer && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'reset' }));
      return;
    }

    isGameOver = false;
    roundState = 'playing';
    localObserverTimer = 0;
    localVictoryTimer = 0;
    teamKills = 0;
    victoryInfo = null;
    minimapAccumSec = MINIMAP_UPDATE_INTERVAL;
    lastLeaderboardSignature = '';
    gameOverModal.classList.add('hidden');
    gameOverModal.setAttribute('aria-hidden', 'true');
    if (victoryModal) {
      victoryModal.classList.add('hidden');
      victoryModal.setAttribute('aria-hidden', 'true');
    }

    // Ensure stone columns are at their hard-coded positions on new round
    stoneColumns.length = 0;
    for (let i = 0; i < STONE_COLUMNS.length; i++) {
      stoneColumns.push({ ...STONE_COLUMNS[i] });
    }

    // Start in a random location on the grassy battlefield
    const spawn = getRandomSpawnPosition();
    warrior.x = spawn.x;
    warrior.y = spawn.y;
    warrior.vx = 0;
    warrior.vy = 0;
    warrior.angle = -Math.PI / 2;
    warrior.radius = 20;
    warrior.hp = warrior.maxHp;
    warrior.alive = true;
    warrior.speedMultiplier = 1.0;
    warrior.tractionMultiplier = 1.0;
    warrior.mountType = null;
    warrior.mountHp = 0;
    warrior.mountMaxHp = 0;
    warrior.bulldozerTimer = 0;
    warrior.chainLinks = INITIAL_CHAIN_LINKS;
    warrior.strideCharge = 0;
    warrior.hurtFlash = 0;

    const initLen = getChainRestLength(INITIAL_CHAIN_LINKS, LENGTH_PER_LINK);
    hammer.x = warrior.x;
    hammer.y = warrior.y + initLen * 0.85;
    hammer.vx = 0;
    hammer.vy = 0;
    hammer.radius = 17;
    hammer.mass = INITIAL_HAMMER_MASS;
    hammer.chainLinks = INITIAL_CHAIN_LINKS;
    hammer.linkLength = LENGTH_PER_LINK;
    hammer.bombCharges = 0;
    hammer.flameCharges = 0;
    hammer.flameTimer = 0;
    hammer.discoTimer = 0;
    hammer.jackolanternTimer = 0;
    hammer.spiderTimer = 0;
    hammer.isSpider = false;
    hammer.angle = Math.PI / 2;
    hammer.currentTension = 0;
    hammer.currentStretch = 0;
    hammer.trail.length = 0;
    warrior.hammers.length = 0;
    warrior.hammers.push(hammer);

    initChainNodes();

    // Center camera on warrior initially in 2.5D screen space
    camera.x = warrior.x - viewportWidth / 2;
    camera.y = warrior.y - viewportHeight / 2 / TILT_Y;
    camera.shake = 0;
    updateCamera();

    enemies.length = 0;
    blackCircles.length = 0;
    particles.length = 0;
    floatingTexts.length = 0;
    shockwaves.length = 0;

    kills = 0;
    maxDamageBlow = 0;
    spawnTimer = 0;
    elapsedGameTime = 0;
    earthquakeTimer = 0;
    localKnockdownTimer = 0;

    for (let i = 0; i < INITIAL_ENEMY_COUNT; i++) {
      spawnEnemy(false);
    }

    updateHUD();
  }

  const nearbyChainColumns = [];
  const nearbyChainEnemies = [];
  const BROADPHASE_SLACK = 16;

  function updateWarriorBroadphaseBounds(w = warrior) {
    let rMinX = w.x - w.radius;
    let rMaxX = w.x + w.radius;
    let rMinY = w.y - w.radius;
    let rMaxY = w.y + w.radius;

    for (let hIdx = 0; hIdx < w.hammers.length; hIdx++) {
      const h = w.hammers[hIdx];
      const links = h.chainLinks || INITIAL_CHAIN_LINKS;
      const hMinX = h.x - h.radius;
      const hMaxX = h.x + h.radius;
      const hMinY = h.y - h.radius;
      const hMaxY = h.y + h.radius;
      if (hMinX < rMinX) rMinX = hMinX;
      if (hMaxX > rMaxX) rMaxX = hMaxX;
      if (hMinY < rMinY) rMinY = hMinY;
      if (hMaxY > rMaxY) rMaxY = hMaxY;

      let cMinX = w.x < h.x ? w.x : h.x;
      let cMaxX = w.x > h.x ? w.x : h.x;
      let cMinY = w.y < h.y ? w.y : h.y;
      let cMaxY = w.y > h.y ? w.y : h.y;
      if (h.chainNodes) {
        for (let i = 1; i < links; i++) {
          const node = h.chainNodes[i];
          if (!node) continue;
          if (node.x < cMinX) cMinX = node.x;
          if (node.x > cMaxX) cMaxX = node.x;
          if (node.y < cMinY) cMinY = node.y;
          if (node.y > cMaxY) cMaxY = node.y;
        }
      }
      const cPad = CHAIN_LINK_RADIUS + BROADPHASE_SLACK;
      h.chainMinX = cMinX - cPad;
      h.chainMaxX = cMaxX + cPad;
      h.chainMinY = cMinY - cPad;
      h.chainMaxY = cMaxY + cPad;

      if (h.chainMinX < rMinX) rMinX = h.chainMinX;
      if (h.chainMaxX > rMaxX) rMaxX = h.chainMaxX;
      if (h.chainMinY < rMinY) rMinY = h.chainMinY;
      if (h.chainMaxY > rMaxY) rMaxY = h.chainMaxY;
    }

    w.reachMinX = rMinX - BROADPHASE_SLACK;
    w.reachMaxX = rMaxX + BROADPHASE_SLACK;
    w.reachMinY = rMinY - BROADPHASE_SLACK;
    w.reachMaxY = rMaxY + BROADPHASE_SLACK;
  }

  function stepLocalWarriorAndHammers(dt, isPrediction = false) {
    const isBulldozer = (warrior.bulldozerTimer || 0) > 0;

    const mountSpeedMult = isBulldozer
      ? BULLDOZER_SPEED_MULT
      : warrior.mountType === 'horse'
      ? 2.0
      : warrior.mountType === 'tortoise'
      ? 0.25
      : warrior.mountType === 'elephant'
      ? 1.0
      : 1.0;
    const mountTractionMult = isBulldozer
      ? BULLDOZER_TRACTION_MULT
      : warrior.mountType === 'tortoise'
      ? 20.0
      : warrior.mountType === 'elephant'
      ? 10.0
      : warrior.mountType === 'horse'
      ? 5.0
      : 1.0;
    const totalSpeedMult = warrior.speedMultiplier * mountSpeedMult;
    const totalTractionMult = warrior.tractionMultiplier * mountTractionMult;

    // 1 & 2. Warrior Steering & Movement (Mouse Tracking)
    const targetWorldX = camera.x + mouse.screenX;
    const targetWorldY = camera.y + mouse.screenY / TILT_Y;
    const mdx = targetWorldX - warrior.x;
    const mdy = targetWorldY - warrior.y;
    const distToMouse = Math.hypot(mdx, mdy);

    if (distToMouse > 4) {
      const targetAngle = Math.atan2(mdy, mdx);
      const angleDiff = Math.atan2(
        Math.sin(targetAngle - warrior.angle),
        Math.cos(targetAngle - warrior.angle)
      );
      const maxTurn = warrior.turnSpeed * 2.2 * dt;
      if (Math.abs(angleDiff) <= maxTurn) {
        warrior.angle = targetAngle;
      } else {
        warrior.angle += Math.sign(angleDiff) * maxTurn;
      }
    }

    if (distToMouse > 10) {
      warrior.strideCharge = Math.min(1, warrior.strideCharge + dt * 1.4);
      const arrivalScale = Math.min(1, (distToMouse - 8) / 42);
      const thrust =
        (warrior.walkThrust +
          (warrior.runThrust - warrior.walkThrust) * warrior.strideCharge) *
        totalSpeedMult *
        totalTractionMult *
        arrivalScale;
      warrior.vx += Math.cos(warrior.angle) * thrust * dt;
      warrior.vy += Math.sin(warrior.angle) * thrust * dt;
    } else {
      warrior.strideCharge = Math.max(0, warrior.strideCharge - dt * 3.0);
    }

    // Apply ground traction to warrior (scaled by totalTractionMult)
    const activeTraction = warrior.groundTraction * totalTractionMult;
    const warriorDamping = Math.exp(-activeTraction * dt);
    warrior.vx *= warriorDamping;
    warrior.vy *= warriorDamping;

    // 3. Step Chain & Elastic Tension for each Hammer owned by Warrior
    for (let hIdx = 0; hIdx < warrior.hammers.length; hIdx++) {
      const h = warrior.hammers[hIdx];
      const links = Math.min(MAX_CHAIN_LINKS, h.chainLinks || INITIAL_CHAIN_LINKS);
      h.chainLinks = links;
      if (!h.chainNodes || h.chainNodes.length !== links + 1) {
        initHammerChainNodes(h);
      }
      const nodes = h.chainNodes;
      const restLength = getChainRestLength(links, h.linkLength);
      const segRest = restLength / Math.max(1, links);

      nodes[0].x = warrior.x;
      nodes[0].y = warrior.y;
      nodes[0].vx = warrior.vx;
      nodes[0].vy = warrior.vy;

      nodes[links].x = h.x;
      nodes[links].y = h.y;
      nodes[links].vx = h.vx;
      nodes[links].vy = h.vy;

      let chainMinX = warrior.x < h.x ? warrior.x : h.x;
      let chainMaxX = warrior.x > h.x ? warrior.x : h.x;
      let chainMinY = warrior.y < h.y ? warrior.y : h.y;
      let chainMaxY = warrior.y > h.y ? warrior.y : h.y;

      for (let i = 1; i < links; i++) {
        const node = nodes[i];
        node.prevX = node.x;
        node.prevY = node.y;
        node.x += node.vx * dt;
        node.y += node.vy * dt;
        if (node.x < chainMinX) chainMinX = node.x;
        if (node.x > chainMaxX) chainMaxX = node.x;
        if (node.y < chainMinY) chainMinY = node.y;
        if (node.y > chainMaxY) chainMaxY = node.y;
      }

      // Broadphase cull stone columns and enemies near this chain once per substep
      // rather than scanning all world entities across all 10 relaxation iterations
      const broadphasePad = CHAIN_LINK_RADIUS + 80;
      nearbyChainColumns.length = 0;
      for (let cIdx = 0; cIdx < stoneColumns.length; cIdx++) {
        const col = stoneColumns[cIdx];
        const reach = col.radius + broadphasePad;
        if (
          col.x + reach >= chainMinX &&
          col.x - reach <= chainMaxX &&
          col.y + reach >= chainMinY &&
          col.y - reach <= chainMaxY
        ) {
          nearbyChainColumns.push(col);
        }
      }

      nearbyChainEnemies.length = 0;
      for (let eIdx = 0; eIdx < enemies.length; eIdx++) {
        const e = enemies[eIdx];
        const reach = e.radius + broadphasePad;
        if (
          e.x + reach >= chainMinX &&
          e.x - reach <= chainMaxX &&
          e.y + reach >= chainMinY &&
          e.y - reach <= chainMaxY
        ) {
          nearbyChainEnemies.push(e);
        }
      }

      for (let iter = 0; iter < CHAIN_RELAX_ITERS; iter++) {
        let iterTotalDist = 0;
        for (let i = 0; i < links; i++) {
          const sdx = nodes[i + 1].x - nodes[i].x;
          const sdy = nodes[i + 1].y - nodes[i].y;
          iterTotalDist += Math.sqrt(sdx * sdx + sdy * sdy);
        }
        const desiredSeg = Math.max(segRest, iterTotalDist / Math.max(1, links));

        for (let i = 0; i < links; i++) {
          const a = nodes[i];
          const b = nodes[i + 1];
          const sdx = b.x - a.x;
          const sdy = b.y - a.y;
          const sDistSq = sdx * sdx + sdy * sdy;
          if (sDistSq > 1e-8) {
            const sDist = Math.sqrt(sDistSq);
            const targetLen = Math.min(sDist, desiredSeg);
            const diff = (sDist - targetLen) / sDist;
            if (i > 0 && i + 1 < links) {
              a.x += sdx * diff * 0.42;
              a.y += sdy * diff * 0.42;
              b.x -= sdx * diff * 0.42;
              b.y -= sdy * diff * 0.42;
            } else if (i === 0 && i + 1 < links) {
              b.x -= sdx * diff * 0.75;
              b.y -= sdy * diff * 0.75;
            } else if (i > 0 && i + 1 === links) {
              a.x += sdx * diff * 0.75;
              a.y += sdy * diff * 0.75;
            }
          }
        }

        for (let i = 1; i < links; i++) {
          const prev = nodes[i - 1];
          const curr = nodes[i];
          const next = nodes[i + 1];
          const midX = (prev.x + next.x) * 0.5;
          const midY = (prev.y + next.y) * 0.5;
          curr.x += (midX - curr.x) * 0.24;
          curr.y += (midY - curr.y) * 0.24;
        }

        for (let cIdx = 0; cIdx < nearbyChainColumns.length; cIdx++) {
          const col = nearbyChainColumns[cIdx];
          const minColDist = col.radius + CHAIN_LINK_RADIUS;
          const minColDistSq = minColDist * minColDist;

          for (let i = 0; i < links; i++) {
            const a = nodes[i];
            const b = nodes[i + 1];
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const abLenSq = abx * abx + aby * aby;
            if (abLenSq > 0.0001) {
              const tProj = Math.max(
                0,
                Math.min(1, ((col.x - a.x) * abx + (col.y - a.y) * aby) / abLenSq)
              );
              const closestX = a.x + abx * tProj;
              const closestY = a.y + aby * tProj;
              const dx = closestX - col.x;
              const dy = closestY - col.y;
              const distSq = dx * dx + dy * dy;
              if (distSq < minColDistSq) {
                const dist = Math.sqrt(distSq);
                const push = minColDist - dist;
                let nx, ny;
                if (dist > 0.0001) {
                  nx = dx / dist;
                  ny = dy / dist;
                } else {
                  const abLen = Math.sqrt(abLenSq);
                  nx = -aby / abLen;
                  ny = abx / abLen;
                }
                if (i > 0 && i + 1 < links) {
                  a.x += nx * push * (1 - tProj);
                  a.y += ny * push * (1 - tProj);
                  b.x += nx * push * tProj;
                  b.y += ny * push * tProj;
                } else if (i === 0 && i + 1 < links) {
                  b.x += nx * push;
                  b.y += ny * push;
                } else if (i > 0 && i + 1 === links) {
                  a.x += nx * push;
                  a.y += ny * push;
                }
              }
            }
          }

          for (let i = 1; i < links; i++) {
            const node = nodes[i];
            const cdx = node.x - col.x;
            if (cdx <= -minColDist || cdx >= minColDist) continue;
            const cdy = node.y - col.y;
            if (cdy <= -minColDist || cdy >= minColDist) continue;
            const cDistSq = cdx * cdx + cdy * cdy;
            if (cDistSq < minColDistSq && cDistSq > 1e-8) {
              const cDist = Math.sqrt(cDistSq);
              node.x = col.x + (cdx / cDist) * minColDist;
              node.y = col.y + (cdy / cDist) * minColDist;
            }
          }
        }

        for (let eIdx = 0; eIdx < nearbyChainEnemies.length; eIdx++) {
          const e = nearbyChainEnemies[eIdx];
          const minDist = e.radius + CHAIN_LINK_RADIUS;
          const minDistSq = minDist * minDist;
          for (let i = 1; i < links; i++) {
            const node = nodes[i];
            const cdx = node.x - e.x;
            if (cdx <= -minDist || cdx >= minDist) continue;
            const cdy = node.y - e.y;
            if (cdy <= -minDist || cdy >= minDist) continue;
            const cDistSq = cdx * cdx + cdy * cdy;
            if (cDistSq < minDistSq && cDistSq > 1e-8) {
              const cDist = Math.sqrt(cDistSq);
              const push = minDist - cDist;
              const nx = cdx / cDist;
              const ny = cdy / cDist;
              node.x += nx * push * 0.92;
              node.y += ny * push * 0.92;
              if (!isPrediction) {
                e.x -= nx * push * 0.08;
                e.y -= ny * push * 0.08;
              }
            }
          }
        }
      }

      for (let i = 1; i < links; i++) {
        const node = nodes[i];
        const pbdVx = (node.x - node.prevX) / dt;
        const pbdVy = (node.y - node.prevY) / dt;
        const t = i / links;
        const interpVx = warrior.vx + (h.vx - warrior.vx) * t;
        const interpVy = warrior.vy + (h.vy - warrior.vy) * t;
        node.vx = pbdVx * 0.82 + interpVx * 0.18;
        node.vy = pbdVy * 0.82 + interpVy * 0.18;

        for (let cIdx = 0; cIdx < nearbyChainColumns.length; cIdx++) {
          const col = nearbyChainColumns[cIdx];
          const maxColDist = col.radius + CHAIN_LINK_RADIUS + 1.5;
          const cdx = node.x - col.x;
          if (cdx < -maxColDist || cdx > maxColDist) continue;
          const cdy = node.y - col.y;
          if (cdy < -maxColDist || cdy > maxColDist) continue;
          const cDistSq = cdx * cdx + cdy * cdy;
          if (cDistSq <= maxColDist * maxColDist && cDistSq > 1e-8) {
            const cDist = Math.sqrt(cDistSq);
            const nx = cdx / cDist;
            const ny = cdy / cDist;
            const vn = node.vx * nx + node.vy * ny;
            if (vn < 0) {
              node.vx -= vn * nx;
              node.vy -= vn * ny;
            }
          }
        }
      }

      let totalPathDist = 0;
      for (let i = 0; i < links; i++) {
        const sdx = nodes[i + 1].x - nodes[i].x;
        const sdy = nodes[i + 1].y - nodes[i].y;
        totalPathDist += Math.sqrt(sdx * sdx + sdy * sdy);
      }

      if (totalPathDist > restLength && totalPathDist > 0.0001) {
        const stretch = totalPathDist - restLength;

        const prevHammerNode = nodes[Math.max(0, links - 1)];
        const hSegDx = h.x - prevHammerNode.x;
        const hSegDy = h.y - prevHammerNode.y;
        const hSegDist = Math.hypot(hSegDx, hSegDy) || 1;
        const uHx = hSegDx / hSegDist;
        const uHy = hSegDy / hSegDist;

        const nextWarriorNode = nodes[Math.min(links, 1)];
        const wSegDx = nextWarriorNode.x - warrior.x;
        const wSegDy = nextWarriorNode.y - warrior.y;
        const wSegDist = Math.hypot(wSegDx, wSegDy) || 1;
        const uWx = wSegDx / wSegDist;
        const uWy = wSegDy / wSegDist;

        const relVx = h.vx - prevHammerNode.vx;
        const relVy = h.vy - prevHammerNode.vy;
        const radialRelVel = relVx * uHx + relVy * uHy;

        let springForce = CHAIN_SPRING_K * stretch;
        if (radialRelVel > 0) {
          springForce += CHAIN_RADIAL_DAMP * radialRelVel;
        }

        h.currentStretch = stretch;
        h.currentTension = springForce;

        h.vx -= ((springForce * uHx) / INITIAL_HAMMER_MASS) * dt;
        h.vy -= ((springForce * uHy) / INITIAL_HAMMER_MASS) * dt;

        if (!isPrediction) {
          const warriorPullAccel = Math.min(
            springForce / warrior.mass,
            warrior.walkThrust * 0.35
          );
          warrior.vx += warriorPullAccel * uWx * dt;
          warrior.vy += warriorPullAccel * uWy * dt;
        }
      } else {
        h.currentStretch = 0;
        h.currentTension = 0;
      }

      const hammerSpeed = Math.hypot(h.vx, h.vy);
      const maxHammerSpeed = 1650;
      if (hammerSpeed > maxHammerSpeed) {
        const scale = maxHammerSpeed / hammerSpeed;
        h.vx *= scale;
        h.vy *= scale;
      }
    }

    // Integrate Warrior position
    warrior.x += warrior.vx * dt;
    warrior.y += warrior.vy * dt;

    for (let cIdx = 0; cIdx < stoneColumns.length; cIdx++) {
      const col = stoneColumns[cIdx];
      const wdx = warrior.x - col.x;
      const wdy = warrior.y - col.y;
      const wDist = Math.hypot(wdx, wdy);
      const minWarriorColDist = warrior.radius + col.radius;
      if (wDist < minWarriorColDist && wDist > 0.0001) {
        const nx = wdx / wDist;
        const ny = wdy / wDist;
        warrior.x = col.x + nx * minWarriorColDist;
        warrior.y = col.y + ny * minWarriorColDist;
        const vn = warrior.vx * nx + warrior.vy * ny;
        if (vn < 0) {
          warrior.vx -= vn * nx;
          warrior.vy -= vn * ny;
        }
      }
    }

    const pad = warrior.radius + 24;
    if (warrior.x < pad) {
      warrior.x = pad;
      warrior.vx = Math.max(0, warrior.vx);
    } else if (warrior.x > WORLD_WIDTH - pad) {
      warrior.x = WORLD_WIDTH - pad;
      warrior.vx = Math.min(0, warrior.vx);
    }
    if (warrior.y < pad) {
      warrior.y = pad;
      warrior.vy = Math.max(0, warrior.vy);
    } else if (warrior.y > WORLD_HEIGHT - pad) {
      warrior.y = WORLD_HEIGHT - pad;
      warrior.vy = Math.min(0, warrior.vy);
    }

    // Integrate each Hammer position, collide with stone columns and world boundaries
    for (let hIdx = 0; hIdx < warrior.hammers.length; hIdx++) {
      const h = warrior.hammers[hIdx];
      const links = h.chainLinks || INITIAL_CHAIN_LINKS;
      const nodes = h.chainNodes;

      h.x += h.vx * dt;
      h.y += h.vy * dt;

      for (let cIdx = 0; cIdx < stoneColumns.length; cIdx++) {
        const col = stoneColumns[cIdx];
        const hdx = h.x - col.x;
        const hdy = h.y - col.y;
        const hDist = Math.hypot(hdx, hdy);
        const minHammerColDist = h.radius + col.radius;
        if (hDist < minHammerColDist && hDist > 0.0001) {
          const nx = hdx / hDist;
          const ny = hdy / hDist;
          h.x = col.x + nx * minHammerColDist;
          h.y = col.y + ny * minHammerColDist;
          const vn = h.vx * nx + h.vy * ny;
          if (vn < 0) {
            h.vx -= (1 + 0.65) * vn * nx;
            h.vy -= (1 + 0.65) * vn * ny;
            if (-vn > 110) {
              addParticles(
                col.x + nx * col.radius,
                col.y + ny * col.radius,
                '#cbd5e0',
                5,
                40,
                150,
                2.6
              );
            }
          }
        }
      }

      const hPad = h.radius + 16;
      if (h.x < hPad) {
        h.x = hPad;
        h.vx = Math.abs(h.vx) * 0.75;
      } else if (h.x > WORLD_WIDTH - hPad) {
        h.x = WORLD_WIDTH - hPad;
        h.vx = -Math.abs(h.vx) * 0.75;
      }
      if (h.y < hPad) {
        h.y = hPad;
        h.vy = Math.abs(h.vy) * 0.75;
      } else if (h.y > WORLD_HEIGHT - hPad) {
        h.y = WORLD_HEIGHT - hPad;
        h.vy = -Math.abs(h.vy) * 0.75;
      }

      nodes[0].x = warrior.x;
      nodes[0].y = warrior.y;
      nodes[links].x = h.x;
      nodes[links].y = h.y;

      const hammerSpeed = Math.hypot(h.vx, h.vy);
      const lastSegDx = h.x - nodes[Math.max(0, links - 1)].x;
      const lastSegDy = h.y - nodes[Math.max(0, links - 1)].y;
      if (hammerSpeed > 25) {
        h.angle = Math.atan2(h.vy, h.vx);
      } else if (Math.hypot(lastSegDx, lastSegDy) > 3) {
        h.angle = Math.atan2(lastSegDy, lastSegDx);
      }

      if (!isPrediction) {
        // Flaming Hammer lasts until it is used (no time decay)
        h.flameTimer = h.flameCharges > 0 ? h.flameCharges : 0;
      }

      if (h.discoTimer > 0) {
        h.discoTimer = Math.max(0, h.discoTimer - dt);
      }
      if (h.jackolanternTimer > 0) {
        h.jackolanternTimer = Math.max(0, h.jackolanternTimer - dt);
      }
      if (h.spiderTimer > 0) {
        h.spiderTimer = Math.max(0, h.spiderTimer - dt);
        if (h.spiderTimer <= 0) {
          h.isSpider = false;
        } else {
          h.isSpider = true;
        }
      }
      if (hIdx > 0 && h.extraTimer > 0) {
        h.extraTimer = Math.max(0, h.extraTimer - dt);
      }
    }

    if (!isPrediction) {
      // Remove any additional hammers whose 120-second duration has expired
      for (let hIdx = warrior.hammers.length - 1; hIdx >= 1; hIdx--) {
        const h = warrior.hammers[hIdx];
        if (h.extraTimer != null && h.extraTimer <= 0) {
          addParticles(h.x, h.y, '#b794f4', 14, 30, 140, 3.2);
          addFloatingText(h.x, h.y - h.radius - 12, 'EXTRA HAMMER EXPIRED', '#b794f4', 1.0);
          warrior.hammers.splice(hIdx, 1);
        }
      }
    }

    // Soft separation & clank between multiple hammers owned by the player
    for (let i = 0; i < warrior.hammers.length; i++) {
      for (let j = i + 1; j < warrior.hammers.length; j++) {
        const ha = warrior.hammers[i];
        const hb = warrior.hammers[j];
        const hdx = hb.x - ha.x;
        const hdy = hb.y - ha.y;
        const hDist = Math.hypot(hdx, hdy);
        const minDist = ha.radius + hb.radius + 4;
        if (hDist < minDist && hDist > 0.0001) {
          const nx = hdx / hDist;
          const ny = hdy / hDist;
          const overlap = minDist - hDist;
          const totalInvMass = 1 / ha.mass + 1 / hb.mass;
          ha.x -= nx * overlap * ((1 / ha.mass) / totalInvMass);
          ha.y -= ny * overlap * ((1 / ha.mass) / totalInvMass);
          hb.x += nx * overlap * ((1 / hb.mass) / totalInvMass);
          hb.y += ny * overlap * ((1 / hb.mass) / totalInvMass);

          const rvx = ha.vx - hb.vx;
          const rvy = ha.vy - hb.vy;
          const vn = rvx * nx + rvy * ny;
          if (vn > 0) {
            const imp = (1.35 * vn) / totalInvMass;
            ha.vx -= (imp / ha.mass) * nx;
            ha.vy -= (imp / ha.mass) * ny;
            hb.vx += (imp / hb.mass) * nx;
            hb.vy += (imp / hb.mass) * ny;
          }
          ha.chainNodes[ha.chainLinks].x = ha.x;
          ha.chainNodes[ha.chainLinks].y = ha.y;
          hb.chainNodes[hb.chainLinks].x = hb.x;
          hb.chainNodes[hb.chainLinks].y = hb.y;
        }
      }
    }

    warrior.chainLinks = warrior.hammers[0].chainLinks;
    updateWarriorBroadphaseBounds(warrior);
    return isBulldozer;
  }

  function stepMultiplayerClient(frameDt) {
    if (!warrior.hammers || warrior.hammers.length === 0) {
      warrior.hammers = [hammer];
    }

    // 1. Local Player Prediction & Smooth Reconciliation
    if (roundState === 'playing' && warrior.alive) {
      const subDt = frameDt / PHYSICS_SUBSTEPS;
      for (let s = 0; s < PHYSICS_SUBSTEPS; s++) {
        stepLocalWarriorAndHammers(subDt, true);
      }
      const warriorSpeed = Math.hypot(warrior.vx, warrior.vy);
      if (warriorSpeed > 15) {
        warrior.walkCycle = (warrior.walkCycle || 0) + warriorSpeed * frameDt * 0.085;
      }
      if (warrior.hurtFlash > 0) {
        warrior.hurtFlash = Math.max(0, warrior.hurtFlash - frameDt);
      }
    }

    const interpBlend = 1 - Math.exp(-16 * frameDt);

    // 2. Remote Players Dead-Reckoning & Snapshot Interpolation
    for (let i = 0; i < remotePlayers.length; i++) {
      const rp = remotePlayers[i];
      if (!rp || !rp.alive) continue;
      const vx = rp.vx || 0;
      const vy = rp.vy || 0;
      const rPad = (rp.radius || 20) + 24;
      const baseTx = typeof rp.targetX === 'number' ? rp.targetX : rp.x;
      const baseTy = typeof rp.targetY === 'number' ? rp.targetY : rp.y;
      rp.targetX = clamp(baseTx + vx * frameDt, rPad, WORLD_WIDTH - rPad);
      rp.targetY = clamp(baseTy + vy * frameDt, rPad, WORLD_HEIGHT - rPad);
      rp.x += (rp.targetX - rp.x) * interpBlend;
      rp.y += (rp.targetY - rp.y) * interpBlend;
      if (typeof rp.targetAngle === 'number') {
        rp.angle = lerpAngle(rp.angle || 0, rp.targetAngle, interpBlend);
      }
      const rpSpeed = Math.hypot(vx, vy);
      if (rpSpeed > 15) {
        rp.walkCycle = (rp.walkCycle || 0) + rpSpeed * frameDt * 0.085;
      }
      if (rp.hurtFlash > 0) {
        rp.hurtFlash = Math.max(0, rp.hurtFlash - frameDt);
      }

      const rpHammers =
        Array.isArray(rp.hammers) && rp.hammers.length > 0
          ? rp.hammers
          : rp.hammer
          ? [rp.hammer]
          : [];
      for (let hIdx = 0; hIdx < rpHammers.length; hIdx++) {
        const rh = rpHammers[hIdx];
        if (!rh) continue;
        const hvx = rh.vx || 0;
        const hvy = rh.vy || 0;
        const hPad = (rh.radius || 17) + 16;
        const hBaseTx = typeof rh.targetX === 'number' ? rh.targetX : rh.x;
        const hBaseTy = typeof rh.targetY === 'number' ? rh.targetY : rh.y;
        rh.targetX = clamp(hBaseTx + hvx * frameDt, hPad, WORLD_WIDTH - hPad);
        rh.targetY = clamp(hBaseTy + hvy * frameDt, hPad, WORLD_HEIGHT - hPad);
        rh.x += (rh.targetX - rh.x) * interpBlend;
        rh.y += (rh.targetY - rh.y) * interpBlend;
        if (typeof rh.targetAngle === 'number') {
          rh.angle = lerpAngle(rh.angle || 0, rh.targetAngle, interpBlend);
        }

        const rNodes = rh.chainNodes;
        if (Array.isArray(rNodes) && rNodes.length >= 2) {
          const lastIdx = rNodes.length - 1;
          rNodes[0].x = rp.x;
          rNodes[0].y = rp.y;
          rNodes[lastIdx].x = rh.x;
          rNodes[lastIdx].y = rh.y;
          for (let c = 1; c < lastIdx; c++) {
            const node = rNodes[c];
            const t = c / lastIdx;
            const nvx = vx + (hvx - vx) * t;
            const nvy = vy + (hvy - vy) * t;
            const nBaseTx = typeof node.targetX === 'number' ? node.targetX : node.x;
            const nBaseTy = typeof node.targetY === 'number' ? node.targetY : node.y;
            node.targetX = nBaseTx + nvx * frameDt;
            node.targetY = nBaseTy + nvy * frameDt;
            node.x += (node.targetX - node.x) * interpBlend;
            node.y += (node.targetY - node.y) * interpBlend;
          }
          for (let c = 1; c < lastIdx; c++) {
            const prev = rNodes[c - 1];
            const curr = rNodes[c];
            const next = rNodes[c + 1];
            curr.x += ((prev.x + next.x) * 0.5 - curr.x) * 0.2;
            curr.y += ((prev.y + next.y) * 0.5 - curr.y) * 0.2;
          }
        }
      }
    }

    // 3. Enemies Dead-Reckoning & Snapshot Interpolation
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e) continue;
      const isStationary =
        (e.danceTimer || 0) > 0 ||
        (e.webTimer || 0) > 0 ||
        earthquakeTimer > 0 ||
        (e.knockdownTimer || 0) > 0;
      const evx = isStationary ? 0 : e.vx || 0;
      const evy = isStationary ? 0 : e.vy || 0;
      const ePad = (e.radius || 19) + 12;
      const eBaseTx = typeof e.targetX === 'number' ? e.targetX : e.x;
      const eBaseTy = typeof e.targetY === 'number' ? e.targetY : e.y;
      e.targetX = clamp(eBaseTx + evx * frameDt, ePad, WORLD_WIDTH - ePad);
      e.targetY = clamp(eBaseTy + evy * frameDt, ePad, WORLD_HEIGHT - ePad);
      e.x += (e.targetX - e.x) * interpBlend;
      e.y += (e.targetY - e.y) * interpBlend;
      if (typeof e.targetAngle === 'number') {
        e.angle = lerpAngle(e.angle || 0, e.targetAngle, interpBlend);
      }
      const eSpeed = Math.hypot(evx, evy);
      if (!isStationary && eSpeed > 5) {
        e.walkPhase = (e.walkPhase || 0) + eSpeed * frameDt * 0.11;
      }
      if (e.hurtFlash > 0) {
        e.hurtFlash = Math.max(0, e.hurtFlash - frameDt);
      }
    }
  }

  // --- Core Physics Step ---
  function stepPhysics(dt) {
    if (!warrior.hammers || warrior.hammers.length === 0) {
      warrior.hammers = [hammer];
    }

    if (earthquakeTimer > 0) {
      earthquakeTimer = Math.max(0, earthquakeTimer - dt);
    }
    if (localKnockdownTimer > 0) {
      localKnockdownTimer = Math.max(0, localKnockdownTimer - dt);
    }

    if (warrior.bulldozerTimer > 0) {
      warrior.bulldozerTimer = Math.max(0, warrior.bulldozerTimer - dt);
      if (warrior.bulldozerTimer <= 0) {
        warrior.radius =
          warrior.mountType === 'elephant'
            ? 32
            : warrior.mountType === 'tortoise'
            ? 26
            : warrior.mountType === 'horse'
            ? 25
            : 20;
      } else {
        warrior.radius = BULLDOZER_RADIUS;
      }
    }
    const isBulldozer = stepLocalWarriorAndHammers(dt, false);

    // 5. Update Enemies & Collisions (Hammers, Chains, and Warrior)
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.hitCooldown > 0) e.hitCooldown = Math.max(0, e.hitCooldown - dt);
      if (e.chainHitCooldown > 0) e.chainHitCooldown = Math.max(0, e.chainHitCooldown - dt);
      if (e.contactCooldown > 0) e.contactCooldown = Math.max(0, e.contactCooldown - dt);
      if (e.hurtFlash > 0) e.hurtFlash = Math.max(0, e.hurtFlash - dt);

      if (earthquakeTimer > 0) {
        e.knockdownTimer = Math.max(e.knockdownTimer || 0, ZOMBIE_KNOCKDOWN_RECOVERY);
      } else if (e.knockdownTimer > 0) {
        e.knockdownTimer = Math.max(0, e.knockdownTimer - dt);
      }
      const isKnockedDown = earthquakeTimer > 0 || (e.knockdownTimer || 0) > 0;

      // Flaming zombie burn damage over time (10s burning -> 5s fire-proof)
      if (e.burnTimer > 0) {
        const stepBurn = Math.min(dt, e.burnTimer);
        e.burnTimer -= stepBurn;
        e.hp -= ZOMBIE_BURN_DPS * stepBurn;
        e.burnTickAccum = (e.burnTickAccum || 0) + stepBurn;

        if (e.burnTickAccum >= 1.0) {
          e.burnTickAccum -= 1.0;
          addFloatingText(
            e.x,
            e.y - e.radius - 10,
            `-${ZOMBIE_BURN_DPS}`,
            '#ff6b35',
            0.95
          );
        }

        if (e.burnTimer <= 0.0001) {
          e.burnTimer = 0;
          e.burnTickAccum = 0;
          e.fireproofTimer = ZOMBIE_FIREPROOF_DURATION;
        }

        if (e.hp <= 0) {
          defeatEnemy(i);
          continue;
        }
      } else if (e.fireproofTimer > 0) {
        e.fireproofTimer = Math.max(0, e.fireproofTimer - dt);
      }

      if (e.fearTimer > 0) {
        e.fearTimer = Math.max(0, e.fearTimer - dt);
      }
      const isFeared = (e.fearTimer || 0) > 0;

      // Disco dancing state (30s dancing in place -> 45s immune to dancing)
      if (e.danceTimer > 0) {
        e.danceTimer -= dt;
        if (e.danceTimer <= 0.0001) {
          e.danceTimer = 0;
          e.danceImmuneTimer = ZOMBIE_DANCE_IMMUNE_DURATION;
        }
      } else if (e.danceImmuneTimer > 0) {
        e.danceImmuneTimer = Math.max(0, e.danceImmuneTimer - dt);
      }
      const isDancing = (e.danceTimer || 0) > 0;

      // Spider webbing state (30s wrapped in white lines and unable to move)
      if (e.webTimer > 0) {
        e.webTimer = Math.max(0, e.webTimer - dt);
      }
      const isWebbed = (e.webTimer || 0) > 0;

      // Speed multiplier: 4x when fleeing in fear, 3x when flaming, 1/2x when fire-proof
      let speedMult = e.burnTimer > 0 ? 3.0 : e.fireproofTimer > 0 ? 0.5 : 1.0;
      if (isFeared) {
        speedMult = Math.max(speedMult, FEAR_SPEED_MULT);
      }

      // Move toward warrior (or away from warrior at 4x speed when tainted with fear, or stand in place when dancing)
      const toWarriorX = warrior.x - e.x;
      const toWarriorY = warrior.y - e.y;
      const distToWarrior = Math.sqrt(toWarriorX * toWarriorX + toWarriorY * toWarriorY);
      if (isKnockedDown) {
        if (e.hitCooldown <= 0 && e.chainHitCooldown <= 0) {
          e.vx = 0;
          e.vy = 0;
        } else {
          const kdDamp = Math.exp(-e.traction * 5.0 * dt);
          e.vx *= kdDamp;
          e.vy *= kdDamp;
        }
      } else if (isWebbed) {
        if (e.hitCooldown <= 0 && e.chainHitCooldown <= 0) {
          e.vx = 0;
          e.vy = 0;
        } else {
          const webDamp = Math.exp(-e.traction * 8.0 * dt);
          e.vx *= webDamp;
          e.vy *= webDamp;
        }
      } else if (isDancing) {
        e.vx = 0;
        e.vy = 0;
      } else if (distToWarrior > 0.001) {
        if (isFeared) {
          let dirX = -toWarriorX / distToWarrior;
          let dirY = -toWarriorY / distToWarrior;
          const wallMargin = e.radius + 90;
          if (
            (e.x < wallMargin && dirX < 0) ||
            (e.x > WORLD_WIDTH - wallMargin && dirX > 0)
          ) {
            dirY += (e.y < WORLD_HEIGHT / 2 ? 1 : -1) * 0.85;
            dirX *= 0.25;
          }
          if (
            (e.y < wallMargin && dirY < 0) ||
            (e.y > WORLD_HEIGHT - wallMargin && dirY > 0)
          ) {
            dirX += (e.x < WORLD_WIDTH / 2 ? 1 : -1) * 0.85;
            dirY *= 0.25;
          }
          const norm = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
          dirX /= norm;
          dirY /= norm;

          e.angle = Math.atan2(dirY, dirX);
          e.vx += dirX * e.moveForce * speedMult * dt;
          e.vy += dirY * e.moveForce * speedMult * dt;
        } else {
          const dirX = toWarriorX / distToWarrior;
          const dirY = toWarriorY / distToWarrior;
          e.angle = Math.atan2(dirY, dirX);
          e.vx += dirX * e.moveForce * speedMult * dt;
          e.vy += dirY * e.moveForce * speedMult * dt;
        }
      }

      // Apply enemy ground traction
      if (!isKnockedDown && !isWebbed) {
        const enemyDamp = Math.exp(-(isDancing ? e.traction * 8.0 : e.traction) * dt);
        e.vx *= enemyDamp;
        e.vy *= enemyDamp;
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (isDancing && !isKnockedDown && !isWebbed) {
        e.walkPhase += dt * 11.5;
      } else if (!isKnockedDown && !isWebbed) {
        e.walkPhase += Math.sqrt(e.vx * e.vx + e.vy * e.vy) * dt * 0.09;
      }

      // Clamp enemy inside world
      const ePad = e.radius + 20;
      e.x = Math.max(ePad, Math.min(WORLD_WIDTH - ePad, e.x));
      e.y = Math.max(ePad, Math.min(WORLD_HEIGHT - ePad, e.y));

      // Collide enemy with the 4 immovable stone columns
      for (let cIdx = 0; cIdx < stoneColumns.length; cIdx++) {
        const col = stoneColumns[cIdx];
        const minEnemyColDist = e.radius + col.radius;
        const cdx = e.x - col.x;
        if (cdx <= -minEnemyColDist || cdx >= minEnemyColDist) continue;
        const cdy = e.y - col.y;
        if (cdy <= -minEnemyColDist || cdy >= minEnemyColDist) continue;
        const cDistSq = cdx * cdx + cdy * cdy;
        if (cDistSq < minEnemyColDist * minEnemyColDist && cDistSq > 1e-8) {
          const cDist = Math.sqrt(cDistSq);
          const nx = cdx / cDist;
          const ny = cdy / cDist;
          e.x = col.x + nx * minEnemyColDist;
          e.y = col.y + ny * minEnemyColDist;
          const vn = e.vx * nx + e.vy * ny;
          if (vn < 0) {
            e.vx -= vn * nx;
            e.vy -= vn * ny;
          }
        }
      }

      // Broadphase reject: skip hammer, chain, and warrior collision checks if enemy is outside warrior's reach AABB
      if (
        e.x + e.radius < warrior.reachMinX ||
        e.x - e.radius > warrior.reachMaxX ||
        e.y + e.radius < warrior.reachMinY ||
        e.y - e.radius > warrior.reachMaxY
      ) {
        continue;
      }

      let enemyDefeated = false;
      for (let hIdx = 0; hIdx < warrior.hammers.length; hIdx++) {
        const h = warrior.hammers[hIdx];
        const links = h.chainLinks || INITIAL_CHAIN_LINKS;
        const nodes = h.chainNodes;

        // --- A. Hammer-Enemy Semi-Elastic Collision & Force-Based Damage (or Disco Ball Pass-Through) ---
        const minHammerEnemyDist = h.radius + e.radius;
        const hdx = e.x - h.x;
        const hdy = e.y - h.y;
        if (
          hdx > -minHammerEnemyDist &&
          hdx < minHammerEnemyDist &&
          hdy > -minHammerEnemyDist &&
          hdy < minHammerEnemyDist
        ) {
          const hDistSq = hdx * hdx + hdy * hdy;
          if (hDistSq < minHammerEnemyDist * minHammerEnemyDist && hDistSq > 1e-8) {
            const hDist = Math.sqrt(hDistSq);
            if ((h.discoTimer || 0) > 0) {
              // Disco Ball does not do any damage and passes through zombies rather than bouncing off of them;
              // any zombie touched by it immediately stands in one place and starts dancing!
              startEnemyDance(e);
              continue;
            } else {
              const nx = hdx / hDist;
              const ny = hdy / hDist;

              const overlap = minHammerEnemyDist - hDist;
              const totalInvMass = 1 / h.mass + 1 / e.mass;
              h.x -= nx * overlap * ((1 / h.mass) / totalInvMass);
              h.y -= ny * overlap * ((1 / h.mass) / totalInvMass);
              e.x += nx * overlap * ((1 / e.mass) / totalInvMass);
              e.y += ny * overlap * ((1 / e.mass) / totalInvMass);

              let justIgnited = false;
              if (h.flameCharges > 0 && e.burnTimer <= 0 && e.fireproofTimer <= 0) {
                if (igniteEnemy(e)) {
                  justIgnited = true;
                  h.flameCharges -= 1;
                  h.flameTimer = h.flameCharges > 0 ? h.flameCharges : 0;
                }
              }

              if (h.isSpider) {
                const wasFreshlyWebbed = (e.webTimer || 0) > ZOMBIE_WEB_DURATION - 0.45;
                e.webTimer = ZOMBIE_WEB_DURATION;
                if (!wasFreshlyWebbed) {
                  playSpiderWebSound();
                  addParticles(e.x, e.y, '#ffffff', 12, 30, 130, 3.2);
                  addFloatingText(e.x, e.y - e.radius - 16, 'WEBBED! (30s)', '#ffffff', 1.05);
                }
              }

              let detonatedBomb = false;
              if (h.bombCharges > 0) {
                h.bombCharges -= 1;
                detonatedBomb = true;
                triggerHammerExplosion(h.x + nx * h.radius, h.y + ny * h.radius, h);
              }

              const rvx = h.vx - e.vx;
              const rvy = h.vy - e.vy;
              const velAlongNormal = rvx * nx + rvy * ny;

              if (velAlongNormal > 0) {
                const impulse =
                  ((1 + HAMMER_ENEMY_RESTITUTION) * velAlongNormal) / totalInvMass;

                h.vx -= (impulse / h.mass) * nx;
                h.vy -= (impulse / h.mass) * ny;
                e.vx += (impulse / e.mass) * nx;
                e.vy += (impulse / e.mass) * ny;

                if (e.hitCooldown <= 0 && impulse > 8) {
                  const damage = Math.max(1, Math.round(impulse * DAMAGE_PER_IMPULSE));
                  e.hp -= damage;
                  e.hitCooldown = 0.09;
                  e.hurtFlash = 0.18;
                  playImpactSound(damage, false);

                  if (damage > maxDamageBlow) {
                    maxDamageBlow = damage;
                  }

                  const contactX = h.x + nx * h.radius;
                  const contactY = h.y + ny * h.radius;

                  const sparkCount = Math.min(22, 5 + Math.floor(damage / 8));
                  addParticles(contactX, contactY, '#fbd38d', sparkCount, 60, 260, 3.2);
                  if (damage >= 25) {
                    addShockwave(contactX, contactY, Math.min(65, 20 + damage * 0.45));
                    camera.shake = Math.min(12, camera.shake + damage * 0.08);
                  }

                  const dmgColor = damage >= 50 ? '#fbd38d' : '#ffffff';
                  const dmgScale = damage >= 50 ? 1.25 : 1.0;
                  addFloatingText(e.x, e.y - e.radius - 6, `-${damage}`, dmgColor, dmgScale);
                }
              }

              if (justIgnited && !detonatedBomb && e.hp <= 0) {
                e.hp = Math.max(18, Math.round(e.maxHp * 0.3));
              }

              if (e.hp <= 0) {
                defeatEnemy(i);
                enemyDefeated = true;
                break;
              }
            }
          }
        }

        // --- B. Chain-Enemy Collision: 1/3 Momentum Transfer, 1/3 Damage, and Chain Bending ---
        const minChainEnemyDist = CHAIN_LINK_RADIUS + e.radius;
        if (
          e.x + e.radius >= h.chainMinX &&
          e.x - e.radius <= h.chainMaxX &&
          e.y + e.radius >= h.chainMinY &&
          e.y - e.radius <= h.chainMaxY
        ) {
          let closestNodeIdx = -1;
          let minNodeDistSq = minChainEnemyDist * minChainEnemyDist;
          for (let cIdx = 1; cIdx < links; cIdx++) {
            const node = nodes[cIdx];
            const ndx = e.x - node.x;
            const ndy = e.y - node.y;
            const dSq = ndx * ndx + ndy * ndy;
            if (dSq < minNodeDistSq) {
              minNodeDistSq = dSq;
              closestNodeIdx = cIdx;
            }
          }

          if (closestNodeIdx !== -1 && minNodeDistSq > 1e-8) {
            const minNodeDist = Math.sqrt(minNodeDistSq);
            const node = nodes[closestNodeIdx];
            const cnx = (e.x - node.x) / minNodeDist;
            const cny = (e.y - node.y) / minNodeDist;
            const cOverlap = minChainEnemyDist - minNodeDist;

            node.x -= cnx * cOverlap * 0.82;
            node.y -= cny * cOverlap * 0.82;
            e.x += cnx * cOverlap * 0.18;
            e.y += cny * cOverlap * 0.18;

            const crvx = node.vx - e.vx;
            const crvy = node.vy - e.vy;
            const cVelAlongNormal = crvx * cnx + crvy * cny;

            if (cVelAlongNormal > 0) {
              const totalInvMass = 1 / h.mass + 1 / e.mass;
              const hammerEquivImpulse =
                ((1 + HAMMER_ENEMY_RESTITUTION) * cVelAlongNormal) / totalInvMass;
              const chainImpulse = hammerEquivImpulse * CHAIN_MOMENTUM_FACTOR;

              e.vx += (chainImpulse / e.mass) * cnx;
              e.vy += (chainImpulse / e.mass) * cny;

              node.vx -= cVelAlongNormal * (1 + HAMMER_ENEMY_RESTITUTION) * cnx;
              node.vy -= cVelAlongNormal * (1 + HAMMER_ENEMY_RESTITUTION) * cny;
              if (closestNodeIdx > 1) {
                nodes[closestNodeIdx - 1].vx -= cVelAlongNormal * 0.45 * cnx;
                nodes[closestNodeIdx - 1].vy -= cVelAlongNormal * 0.45 * cny;
              }
              if (closestNodeIdx + 1 < links) {
                nodes[closestNodeIdx + 1].vx -= cVelAlongNormal * 0.45 * cnx;
                nodes[closestNodeIdx + 1].vy -= cVelAlongNormal * 0.45 * cny;
              }

              const leverRatio = closestNodeIdx / links;
              h.vx -= ((chainImpulse * leverRatio) / h.mass) * cnx;
              h.vy -= ((chainImpulse * leverRatio) / h.mass) * cny;
              const warriorChainRecoil = Math.min(
                (chainImpulse * (1 - leverRatio)) / warrior.mass,
                95
              );
              warrior.vx -= warriorChainRecoil * cnx;
              warrior.vy -= warriorChainRecoil * cny;

              if (e.chainHitCooldown <= 0 && hammerEquivImpulse > 8) {
                const chainDamage = Math.max(
                  1,
                  Math.round(hammerEquivImpulse * DAMAGE_PER_IMPULSE * CHAIN_DAMAGE_FACTOR)
                );
                e.hp -= chainDamage;
                e.chainHitCooldown = 0.09;
                e.hurtFlash = 0.14;
                playImpactSound(chainDamage, true);

                if (chainDamage > maxDamageBlow) {
                  maxDamageBlow = chainDamage;
                }

                addParticles(node.x, node.y, '#cbd5e0', 5, 40, 160, 2.5);
                addFloatingText(
                  e.x,
                  e.y - e.radius - 6,
                  `-${chainDamage}`,
                  '#cbd5e0',
                  0.92
                );

                if (e.hp <= 0) {
                  defeatEnemy(i);
                  enemyDefeated = true;
                  break;
                }
              }
            }
          }
        }
      }

      if (enemyDefeated) continue;

      // --- C. Requirement #9: Enemy touches warrior -> small damage & pushes warrior a little bit ---
      const minWarriorEnemyDist = warrior.radius + e.radius;
      const wdx = warrior.x - e.x;
      if (wdx <= -minWarriorEnemyDist || wdx >= minWarriorEnemyDist) continue;
      const wdy = warrior.y - e.y;
      if (wdy <= -minWarriorEnemyDist || wdy >= minWarriorEnemyDist) continue;
      const wDistSq = wdx * wdx + wdy * wdy;

      if (wDistSq < minWarriorEnemyDist * minWarriorEnemyDist && wDistSq > 1e-8) {
        const wDist = Math.sqrt(wDistSq);
        if (isBulldozer) {
          // While a bulldozer, the player takes no damage and instantly kills any zombie they touch
          const crushDmg = Math.max(1, Math.ceil(e.hp));
          if (crushDmg > maxDamageBlow) {
            maxDamageBlow = crushDmg;
          }
          playImpactSound(85, false);
          addFloatingText(e.x, e.y - e.radius - 10, 'CRUSHED!', '#ecc94b', 1.2);
          addParticles(e.x, e.y, '#ecc94b', 10, 40, 180, 3.2);
          defeatEnemy(i);
          continue;
        }

        const wnx = wdx / wDist;
        const wny = wdy / wDist;
        const wOverlap = minWarriorEnemyDist - wDist;

        // Separate overlap (if zombie is dancing in place, webbed, or knocked down, keep the zombie stationary)
        if (isDancing || isKnockedDown || isWebbed) {
          warrior.x += wnx * wOverlap;
          warrior.y += wny * wOverlap;
        } else {
          warrior.x += wnx * wOverlap * 0.55;
          warrior.y += wny * wOverlap * 0.55;
          e.x -= wnx * wOverlap * 0.45;
          e.y -= wny * wOverlap * 0.45;
          e.vx -= wnx * 90 * dt * 8.5;
          e.vy -= wny * 90 * dt * 8.5;
        }

        // Push the warrior a little bit
        warrior.vx += wnx * e.contactPush * dt * 8.5;
        warrior.vy += wny * e.contactPush * dt * 8.5;

        if (!isKnockedDown && !isDancing && !isWebbed && e.contactCooldown <= 0) {
          if (warrior.mountType && warrior.mountHp > 0) {
            warrior.mountHp = Math.max(0, warrior.mountHp - e.contactDamage);
            if (warrior.mountHp <= 0) {
              const lostLabel =
                warrior.mountType === 'elephant'
                  ? 'ELEPHANT LOST!'
                  : warrior.mountType === 'tortoise'
                  ? 'TORTOISE LOST!'
                  : 'HORSE LOST!';
              warrior.mountType = null;
              warrior.mountHp = 0;
              warrior.mountMaxHp = 0;
              warrior.radius = 20;
              addFloatingText(
                warrior.x,
                warrior.y - warrior.radius - 26,
                lostLabel,
                '#feb2b2',
                1.2
              );
            }
          } else {
            warrior.hp = Math.max(0, warrior.hp - e.contactDamage);
          }
          warrior.hurtFlash = 0.25;
          e.contactCooldown = 0.55;
          playPlayerHurtSound();
          camera.shake = Math.min(8, camera.shake + 3.5);
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 10,
            `-${e.contactDamage}`,
            '#fc8181',
            1.05
          );
          addParticles(
            warrior.x - wnx * warrior.radius,
            warrior.y - wny * warrior.radius,
            '#fc8181',
            6,
            40,
            130,
            3
          );

          if (warrior.hp <= 0) {
            warrior.alive = false;
            localObserverTimer = 0;
          }
        }
      }
    }

    // Sweep any additional enemies defeated by bomb blast splash damage
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].hp <= 0) {
        defeatEnemy(i);
      }
    }

    // Soft enemy-to-enemy separation & flaming zombie contagion
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        const minDist = a.radius + b.radius;
        const touchDist = minDist + 2;
        const edx = b.x - a.x;
        if (edx > touchDist || edx < -touchDist) continue;
        const edy = b.y - a.y;
        if (edy > touchDist || edy < -touchDist) continue;
        const eDistSq = edx * edx + edy * edy;
        if (eDistSq > touchDist * touchDist) continue;
        const eDist = Math.sqrt(eDistSq);
        if (eDist <= touchDist) {
          if (a.burnTimer > 0 && b.burnTimer <= 0 && b.fireproofTimer <= 0) {
            igniteEnemy(b);
          } else if (b.burnTimer > 0 && a.burnTimer <= 0 && a.fireproofTimer <= 0) {
            igniteEnemy(a);
          }

          // Fear contagion: a feared zombie taints any zombie it touches with fear
          if ((a.fearTimer || 0) > 0 && (b.fearTimer || 0) <= 0) {
            taintEnemyWithFear(b, a.fearTimer);
          } else if ((b.fearTimer || 0) > 0 && (a.fearTimer || 0) <= 0) {
            taintEnemyWithFear(a, b.fearTimer);
          }

          // Disco dance contagion: any other zombie that touches a dancing zombie also starts dancing for 30s
          if ((a.danceTimer || 0) > 0 && (b.danceTimer || 0) <= 0 && (b.danceImmuneTimer || 0) <= 0) {
            startEnemyDance(b);
          } else if ((b.danceTimer || 0) > 0 && (a.danceTimer || 0) <= 0 && (a.danceImmuneTimer || 0) <= 0) {
            startEnemyDance(a);
          }
        }
        if (eDist < minDist && eDist > 0.001) {
          const overlap = (minDist - eDist) * 0.5;
          const enx = edx / eDist;
          const eny = edy / eDist;
          const aStationary =
            (a.danceTimer || 0) > 0 ||
            (a.webTimer || 0) > 0 ||
            earthquakeTimer > 0 ||
            (a.knockdownTimer || 0) > 0;
          const bStationary =
            (b.danceTimer || 0) > 0 ||
            (b.webTimer || 0) > 0 ||
            earthquakeTimer > 0 ||
            (b.knockdownTimer || 0) > 0;
          if (aStationary && bStationary) {
            // Both fallen or dancing in place: do not slide them around
          } else if (aStationary && !bStationary) {
            b.x += enx * overlap * 2;
            b.y += eny * overlap * 2;
          } else if (bStationary && !aStationary) {
            a.x -= enx * overlap * 2;
            a.y -= eny * overlap * 2;
          } else {
            a.x -= enx * overlap;
            a.y -= eny * overlap;
            b.x += enx * overlap;
            b.y += eny * overlap;
          }
        }
      }
    }

    // 6. Warrior collects pickup circles (while a bulldozer, cannot pick up any other powerups)
    if (!isBulldozer) {
      for (let i = blackCircles.length - 1; i >= 0; i--) {
        const c = blackCircles[i];
        c.pulse += dt * 4;
        const maxPickDist = warrior.radius + PICKUP_RADIUS + 3;
        const cdx = warrior.x - c.x;
        if (cdx <= -maxPickDist || cdx >= maxPickDist) continue;
        const cdy = warrior.y - c.y;
        if (cdy <= -maxPickDist || cdy >= maxPickDist) continue;
        if (cdx * cdx + cdy * cdy < maxPickDist * maxPickDist) {
          const pType = c.type || 'link';
          if (pType === 'hammer' && warrior.hammers.length >= MAX_HAMMERS_PER_PLAYER) {
            // Cannot pick up extra hammer when already at maximum of 2 hammers
            continue;
          }
          if ((pType === 'horse' || pType === 'tortoise') && warrior.mountType) {
            // Already riding a mount
            continue;
          }
          if (pType === 'elephant' && warrior.mountType === 'elephant') {
            // Already riding a war elephant
            continue;
          }
          if (pType === 'spider' && warrior.hammers.every((hm) => hm.isSpider)) {
            // All current hammers are already spiders
            continue;
          }
          if (pType === 'health' && warrior.hp >= warrior.maxHp) {
            // Already at full health; cannot pick up a health powerup
            continue;
          }

          playCollectLinkSound();

          if (pType === 'bulldozer') {
            warrior.bulldozerTimer = BULLDOZER_DURATION;
            warrior.radius = BULLDOZER_RADIUS;
            playBulldozerSound();
            addShockwave(c.x, c.y, 180, '236, 201, 75');
            addFloatingText(
              warrior.x,
              warrior.y - warrior.radius - 16,
              'BULLDOZER! (20s INVINCIBLE, CRUSH ZOMBIES)',
              '#ecc94b',
              1.2
            );
            addParticles(c.x, c.y, '#ecc94b', 28, 50, 220, 4.0);
            addParticles(c.x, c.y, '#4a5568', 16, 30, 150, 3.5);
          } else if (pType === 'horse') {
          warrior.mountType = 'horse';
          warrior.mountMaxHp = Math.max(1, Math.round(warrior.hp));
          warrior.mountHp = warrior.mountMaxHp;
          warrior.radius = 25;
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            `WARHORSE MOUNTED! (${warrior.mountHp} HP, 2x SPD, 5x FRIC)`,
            '#f6ad55',
            1.18
          );
          addParticles(c.x, c.y, '#f6ad55', 16, 40, 150, 3.6);
        } else if (pType === 'tortoise') {
          warrior.mountType = 'tortoise';
          warrior.mountMaxHp = Math.max(1, Math.round(warrior.hp));
          warrior.mountHp = warrior.mountMaxHp;
          warrior.radius = 26;
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            `GIANT TORTOISE! (${warrior.mountHp} HP, 1/4x SPD, 20x FRIC)`,
            '#68d391',
            1.2
          );
          addParticles(c.x, c.y, '#68d391', 18, 40, 155, 3.6);
        } else if (pType === 'elephant') {
          warrior.mountType = 'elephant';
          warrior.mountMaxHp = Math.max(250, Math.round(warrior.maxHp * 2.5));
          warrior.mountHp = warrior.mountMaxHp;
          warrior.radius = 32;
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            `WAR ELEPHANT! (${warrior.mountHp} HP, 1x SPD, 10x FRIC)`,
            '#90cdf4',
            1.22
          );
          addParticles(c.x, c.y, '#90cdf4', 18, 45, 165, 3.8);
        } else if (pType === 'earthquake') {
          earthquakeTimer = EARTHQUAKE_DURATION;
          localKnockdownTimer = EARTHQUAKE_DURATION + ZOMBIE_KNOCKDOWN_RECOVERY;
          for (let eIdx = 0; eIdx < enemies.length; eIdx++) {
            enemies[eIdx].knockdownTimer = ZOMBIE_KNOCKDOWN_RECOVERY;
            enemies[eIdx].vx = 0;
            enemies[eIdx].vy = 0;
          }
          playEarthquakeSound();
          addShockwave(c.x, c.y, 520, '236, 201, 75');
          addShockwave(c.x, c.y, 320, '214, 158, 46');
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            'EARTHQUAKE! (5s QUAKE + 5s ZOMBIE KNOCKDOWN)',
            '#ecc94b',
            1.2
          );
          addParticles(c.x, c.y, '#ecc94b', 36, 60, 340, 4.4);
        } else if (pType === 'fear') {
          let taintedCount = 0;
          for (let eIdx = 0; eIdx < enemies.length; eIdx++) {
            const e = enemies[eIdx];
            if (Math.hypot(e.x - warrior.x, e.y - warrior.y) <= FEAR_INITIAL_RADIUS + e.radius) {
              taintEnemyWithFear(e, FEAR_DURATION);
              taintedCount++;
            }
          }
          if (taintedCount === 0 && enemies.length > 0) {
            const sorted = enemies
              .slice()
              .sort(
                (a, b) =>
                  Math.hypot(a.x - warrior.x, a.y - warrior.y) -
                  Math.hypot(b.x - warrior.x, b.y - warrior.y)
              );
            const fallbackCount = Math.min(4, sorted.length);
            for (let k = 0; k < fallbackCount; k++) {
              taintEnemyWithFear(sorted[k], FEAR_DURATION);
            }
          }
          playFearSound();
          addShockwave(c.x, c.y, FEAR_INITIAL_RADIUS, '183, 148, 244');
          addShockwave(c.x, c.y, FEAR_INITIAL_RADIUS * 0.65, '128, 90, 213');
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            'FEAR UNLEASHED! (ZOMBIES FLEE AT 4x SPEED)',
            '#b794f4',
            1.2
          );
          addParticles(c.x, c.y, '#b794f4', 32, 60, 320, 4.2);
        } else if (pType === 'disco') {
          const nonDisco = warrior.hammers.filter((hm) => (hm.discoTimer || 0) <= 0);
          const poolH = nonDisco.length > 0 ? nonDisco : warrior.hammers;
          const targetH = poolH[Math.floor(Math.random() * poolH.length)];
          targetH.discoTimer = DISCO_HAMMER_DURATION;
          playDiscoSound();
          addShockwave(c.x, c.y, 170, '246, 135, 179');
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            'DISCO BALL HAMMER! (120s DANCE FEVER)',
            '#f687b3',
            1.2
          );
          addParticles(c.x, c.y, '#f687b3', 18, 40, 190, 3.6);
          addParticles(c.x, c.y, '#63b3ed', 14, 35, 170, 3.2);
        } else if (pType === 'jackolantern') {
          const nonJack = warrior.hammers.filter((hm) => (hm.jackolanternTimer || 0) <= 0);
          const poolH = nonJack.length > 0 ? nonJack : warrior.hammers;
          const targetH = poolH[Math.floor(Math.random() * poolH.length)];
          targetH.jackolanternTimer = JACKOLANTERN_HAMMER_DURATION;
          playJackOLanternSound();
          addShockwave(c.x, c.y, 170, '237, 137, 54');
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            'JACK-O-LANTERN HAMMER! (120s)',
            '#ed8936',
            1.2
          );
          addParticles(c.x, c.y, '#ed8936', 20, 40, 190, 3.8);
          addParticles(c.x, c.y, '#f6e05e', 14, 35, 165, 3.2);
        } else if (pType === 'spider') {
          const nonSpider = warrior.hammers.filter((hm) => !hm.isSpider && (hm.spiderTimer || 0) <= 0);
          const poolH = nonSpider.length > 0 ? nonSpider : warrior.hammers;
          const targetH = poolH[Math.floor(Math.random() * poolH.length)];
          targetH.spiderTimer = SPIDER_HAMMER_DURATION;
          targetH.isSpider = true;
          playSpiderPickupSound();
          addShockwave(c.x, c.y, 170, '226, 232, 240');
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            'SPIDER HAMMER! (120s, WEBS ZOMBIES FOR 30s)',
            '#e2e8f0',
            1.2
          );
          addParticles(c.x, c.y, '#ffffff', 20, 40, 190, 3.5);
          addParticles(c.x, c.y, '#e53e3e', 12, 35, 160, 3.0);
        } else if (pType === 'hammer') {
          const spreadAngle =
            warrior.angle + Math.PI + (warrior.hammers.length === 1 ? 0.65 : -0.65);
          warrior.hammers.push(createExtraHammer(spreadAngle));
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            `+1 EXTRA HAMMER! (120s, ${warrior.hammers.length}/${MAX_HAMMERS_PER_PLAYER})`,
            '#b794f4',
            1.18
          );
          addParticles(c.x, c.y, '#b794f4', 16, 40, 150, 3.6);
        } else if (pType === 'link') {
          const underMax = warrior.hammers.filter(
            (hm) => (hm.chainLinks || INITIAL_CHAIN_LINKS) < MAX_CHAIN_LINKS
          );
          if (underMax.length > 0) {
            const targetH = underMax[Math.floor(Math.random() * underMax.length)];
            const targetIdx = warrior.hammers.indexOf(targetH);
            targetH.chainLinks += 1;
            addHammerChainLinkNode(targetH);
            warrior.chainLinks = warrior.hammers[0].chainLinks;
            addFloatingText(
              warrior.x,
              warrior.y - warrior.radius - 16,
              warrior.hammers.length > 1
                ? `+1 CHAIN LINK (HAMMER #${targetIdx + 1})`
                : '+1 CHAIN LINK',
              '#f6e05e',
              1.12
            );
          } else {
            const randIdx = Math.floor(Math.random() * warrior.hammers.length);
            const targetH = warrior.hammers[randIdx];
            targetH.linkLength = +(
              (targetH.linkLength || LENGTH_PER_LINK) +
              LENGTH_PER_LINK / MAX_CHAIN_LINKS
            ).toFixed(4);
            addFloatingText(
              warrior.x,
              warrior.y - warrior.radius - 16,
              warrior.hammers.length > 1
                ? `+LINK LENGTH (HAMMER #${randIdx + 1})`
                : '+LINK LENGTH',
              '#f6e05e',
              1.12
            );
          }
          addParticles(c.x, c.y, '#f6e05e', 10, 30, 120, 3);
        } else if (pType === 'weight') {
          const randIdx = Math.floor(Math.random() * warrior.hammers.length);
          const targetH = warrior.hammers[randIdx];
          targetH.mass = +(targetH.mass + HAMMER_WEIGHT_BONUS).toFixed(2);
          const mScale = Math.min(2.35, 1 + (targetH.mass - INITIAL_HAMMER_MASS) * 0.18);
          targetH.radius = +(17 * mScale).toFixed(2);
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            warrior.hammers.length > 1
              ? `+MACE MASS (HAMMER #${randIdx + 1})`
              : '+HAMMER MASS',
            '#cbd5e0',
            1.12
          );
          addParticles(c.x, c.y, '#cbd5e0', 10, 30, 120, 3);
        } else if (pType === 'health') {
          const healAmount = warrior.maxHp * 0.2;
          warrior.hp = Math.min(warrior.maxHp, warrior.hp + healAmount);
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            `+${Math.round(healAmount)} HP (20%)`,
            '#68d391',
            1.12
          );
          addParticles(c.x, c.y, '#68d391', 10, 30, 120, 3);
        } else if (pType === 'bomb') {
          const unarmed = warrior.hammers.filter((hm) => hm.bombCharges === 0);
          const poolH = unarmed.length > 0 ? unarmed : warrior.hammers;
          const targetH = poolH[Math.floor(Math.random() * poolH.length)];
          targetH.bombCharges += 1;
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            'BOMB ARMED!',
            '#f6ad55',
            1.15
          );
          addParticles(c.x, c.y, '#f6ad55', 12, 35, 130, 3.2);
        } else if (pType === 'speed') {
          warrior.speedMultiplier = +(warrior.speedMultiplier * 1.05).toFixed(4);
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            '+5% SPEED',
            '#63b3ed',
            1.12
          );
          addParticles(c.x, c.y, '#63b3ed', 10, 30, 120, 3);
        } else if (pType === 'flame') {
          const unflamed = warrior.hammers.filter((hm) => (hm.flameCharges || 0) === 0);
          const poolH = unflamed.length > 0 ? unflamed : warrior.hammers;
          const targetH = poolH[Math.floor(Math.random() * poolH.length)];
          targetH.flameCharges = (targetH.flameCharges || 0) + 1;
          targetH.flameTimer = targetH.flameCharges;
          addFloatingText(
            warrior.x,
            warrior.y - warrior.radius - 16,
            'FLAMING HAMMER ARMED!',
            '#ff6b35',
            1.15
          );
          addParticles(c.x, c.y, '#ff6b35', 14, 40, 150, 3.5);
          addParticles(c.x, c.y, '#f6e05e', 8, 25, 110, 2.8);
        }

        blackCircles.splice(i, 1);
        if ((warrior.bulldozerTimer || 0) > 0) {
          break;
        }
      }
    }
    } else {
      for (let i = 0; i < blackCircles.length; i++) {
        blackCircles[i].pulse += dt * 4;
      }
    }

    updateWarriorBroadphaseBounds(warrior);
  }

  function triggerGameOver() {
    warrior.alive = false;
    localObserverTimer = 0;
  }

  // --- Visual Effects & HUD Update ---
  function updateEffects(dt) {
    // Animate pickup bobbing in both multiplayer and standalone modes
    for (let i = 0; i < blackCircles.length; i++) {
      blackCircles[i].pulse = (blackCircles[i].pulse || 0) + dt * 4;
    }

    if (!isMultiplayer) {
      if (roundState === 'victory') {
        localVictoryTimer += dt;
        if (localVictoryTimer >= VICTORY_DISPLAY_DURATION) {
          initGame();
          return;
        }
      } else if (!warrior.alive) {
        localObserverTimer += dt;
        if (localObserverTimer >= 3.0) {
          initGame();
          return;
        }
      }

      const warriorSpeed = Math.hypot(warrior.vx, warrior.vy);
      if (warriorSpeed > 15 && warrior.alive) {
        warrior.walkCycle += warriorSpeed * dt * 0.085;
      }
      if (warrior.hurtFlash > 0) {
        warrior.hurtFlash = Math.max(0, warrior.hurtFlash - dt);
      }
    }

    if (isMultiplayer) {
      if (earthquakeTimer > 0) {
        earthquakeTimer = Math.max(0, earthquakeTimer - dt);
      }
      if (localKnockdownTimer > 0) {
        localKnockdownTimer = Math.max(0, localKnockdownTimer - dt);
      }
      if (warrior.bulldozerTimer > 0) {
        warrior.bulldozerTimer = Math.max(0, warrior.bulldozerTimer - dt);
      }
    }

    if (camera.shake > 0) {
      camera.shake = Math.max(0, camera.shake - dt * 28);
    }

    // Active earthquake effects: rattle the ground with pebbles & seismic rings
    if (earthquakeTimer > 0) {
      if (Math.random() < dt * 28) {
        const rx = camera.x + Math.random() * viewportWidth;
        const ry = camera.y + (Math.random() * viewportHeight) / TILT_Y;
        addParticles(rx, ry, Math.random() < 0.5 ? '#a0aec0' : '#d69e2e', 3, 35, 115, 3.2);
      }
      if (Math.random() < dt * 7.5) {
        const rx = camera.x + (0.12 + Math.random() * 0.76) * viewportWidth;
        const ry = camera.y + ((0.12 + Math.random() * 0.76) * viewportHeight) / TILT_Y;
        addShockwave(rx, ry, 180 + Math.random() * 140, '236, 201, 75');
      }
    }

    // Bulldozer diesel exhaust puffs
    if (warrior.alive && (warrior.bulldozerTimer || 0) > 0 && Math.random() < dt * 16) {
      const exhaustX = warrior.x + Math.cos(warrior.angle) * 6 - Math.sin(warrior.angle) * 10;
      const exhaustY = warrior.y + Math.sin(warrior.angle) * 6 + Math.cos(warrior.angle) * 10;
      addParticles(
        exhaustX,
        exhaustY,
        Math.random() < 0.5 ? '#4a5568' : '#718096',
        1,
        15,
        45,
        3.6
      );
    }

    // Hammer motion trails & live fire ember particles across all hammers
    const maxTrailLen =
      visualQualityTier === QUALITY_TIER_HIGH
        ? 9
        : visualQualityTier === QUALITY_TIER_MEDIUM
        ? 4
        : 0;
    for (let hIdx = 0; hIdx < warrior.hammers.length; hIdx++) {
      const h = warrior.hammers[hIdx];
      if (!h.trail) h.trail = [];
      if (maxTrailLen === 0) {
        h.trail.length = 0;
      } else {
        const hammerSpeed = Math.hypot(h.vx, h.vy);
        if (warrior.alive && (hammerSpeed > 180 || h.flameTimer > 0 || (h.discoTimer || 0) > 0)) {
          h.trail.push({
            x: h.x,
            y: h.y,
            angle: h.angle,
            alpha:
              h.flameTimer > 0 || (h.discoTimer || 0) > 0
                ? Math.max(0.38, Math.min(0.65, hammerSpeed / 700))
                : Math.min(0.55, (hammerSpeed - 180) / 900),
          });
        }
        while (h.trail.length > maxTrailLen) {
          h.trail.shift();
        }
        for (let i = h.trail.length - 1; i >= 0; i--) {
          h.trail[i].alpha -= dt * 2.4;
          if (h.trail[i].alpha <= 0) {
            h.trail.splice(i, 1);
          }
        }
      }

      if (warrior.alive && (h.discoTimer || 0) > 0 && Math.random() < dt * 26) {
        const discoColors = ['#f687b3', '#63b3ed', '#f6e05e', '#68d391', '#b794f4', '#ffffff'];
        addParticles(
          h.x + (Math.random() - 0.5) * 18,
          h.y + (Math.random() - 0.5) * 18,
          discoColors[Math.floor(Math.random() * discoColors.length)],
          1,
          20,
          70,
          2.7
        );
      } else if (warrior.alive && h.flameTimer > 0 && Math.random() < dt * 28) {
        addParticles(
          h.x + (Math.random() - 0.5) * 14,
          h.y + (Math.random() - 0.5) * 14,
          Math.random() < 0.5 ? '#ff6b35' : '#f6e05e',
          1,
          18,
          65,
          2.8
        );
      }
    }
    for (let i = 0; i < remotePlayers.length; i++) {
      const rp = remotePlayers[i];
      if (!rp.alive || !isWorldPointVisible(rp.x, rp.y, 160)) continue;
      if ((rp.bulldozerTimer || 0) > 0 && Math.random() < dt * 14) {
        const exhaustX = rp.x + Math.cos(rp.angle) * 6 - Math.sin(rp.angle) * 10;
        const exhaustY = rp.y + Math.sin(rp.angle) * 6 + Math.cos(rp.angle) * 10;
        addParticles(
          exhaustX,
          exhaustY,
          Math.random() < 0.5 ? '#4a5568' : '#718096',
          1,
          15,
          45,
          3.6
        );
      }
      const rHammers =
        Array.isArray(rp.hammers) && rp.hammers.length > 0
          ? rp.hammers
          : rp.hammer
          ? [rp.hammer]
          : [];
      for (let hIdx = 0; hIdx < rHammers.length; hIdx++) {
        const rh = rHammers[hIdx];
        if (rh && (rh.discoTimer || 0) > 0 && Math.random() < dt * 22) {
          const discoColors = ['#f687b3', '#63b3ed', '#f6e05e', '#68d391', '#b794f4', '#ffffff'];
          addParticles(
            rh.x + (Math.random() - 0.5) * 18,
            rh.y + (Math.random() - 0.5) * 18,
            discoColors[Math.floor(Math.random() * discoColors.length)],
            1,
            20,
            70,
            2.7
          );
        } else if (rh && rh.flameTimer > 0 && Math.random() < dt * 24) {
          addParticles(
            rh.x + (Math.random() - 0.5) * 14,
            rh.y + (Math.random() - 0.5) * 14,
            Math.random() < 0.5 ? '#ff6b35' : '#f6e05e',
            1,
            18,
            65,
            2.8
          );
        }
      }
    }
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if ((e.burnTimer || 0) <= 0 && (e.danceTimer || 0) <= 0) continue;
      if (!isWorldPointVisible(e.x, e.y, 120)) continue;
      if (e.burnTimer > 0 && Math.random() < dt * 36) {
        addParticles(
          e.x + (Math.random() - 0.5) * e.radius * 1.2,
          e.y + (Math.random() - 0.5) * e.radius * 1.2,
          Math.random() < 0.55 ? '#ff5722' : '#f6e05e',
          1,
          22,
          75,
          3.2
        );
      } else if ((e.danceTimer || 0) > 0 && Math.random() < dt * 10) {
        const discoColors = ['#f687b3', '#63b3ed', '#f6e05e', '#68d391', '#b794f4'];
        addParticles(
          e.x + (Math.random() - 0.5) * e.radius * 1.3,
          e.y + (Math.random() - 0.5) * e.radius * 1.3,
          discoColors[Math.floor(Math.random() * discoColors.length)],
          1,
          15,
          45,
          2.5
        );
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-4.5 * dt);
      p.vy *= Math.exp(-4.5 * dt);
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }

    // Shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i];
      s.life -= dt;
      const progress = 1 - s.life / s.maxLife;
      s.radius = 8 + (s.maxRadius - 8) * progress;
      if (s.life <= 0) {
        shockwaves.splice(i, 1);
      }
    }

    // Floating texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.vy *= Math.exp(-2.5 * dt);
      ft.life -= dt;
      if (ft.life <= 0) {
        floatingTexts.splice(i, 1);
      }
    }

    // Standalone enemy spawning when not connected to server
    if (!isMultiplayer && warrior.alive && roundState === 'playing') {
      elapsedGameTime += dt;
      spawnTimer += dt;
      if (spawnTimer >= 2.7 && enemies.length < MAX_ENEMY_COUNT) {
        spawnTimer = 0;
        spawnEnemy(true);
      }
    }
  }

  function setTextIfChanged(el, text) {
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }

  function setStyleIfChanged(el, prop, val) {
    if (el && el.style && el.style[prop] !== val) {
      el.style[prop] = val;
    }
  }

  function updateHUD() {
    const hpPct = Math.max(0, Math.min(100, (warrior.hp / warrior.maxHp) * 100));
    setTextIfChanged(hpTextEl, `${Math.ceil(warrior.hp)} / ${warrior.maxHp}`);
    setStyleIfChanged(hpBarFillEl, 'width', `${hpPct}%`);

    if (hpPct > 55) {
      setStyleIfChanged(
        hpBarFillEl,
        'background',
        'linear-gradient(90deg, hsl(134, 62%, 38%), hsl(134, 70%, 50%))'
      );
    } else if (hpPct > 25) {
      setStyleIfChanged(
        hpBarFillEl,
        'background',
        'linear-gradient(90deg, hsl(38, 88%, 45%), hsl(45, 92%, 55%))'
      );
    } else {
      setStyleIfChanged(
        hpBarFillEl,
        'background',
        'linear-gradient(90deg, hsl(0, 78%, 46%), hsl(12, 88%, 56%))'
      );
    }

    if (mountStatGroupEl) {
      if ((warrior.bulldozerTimer || 0) > 0) {
        mountStatGroupEl.classList.remove('hidden');
        const dozerPct = Math.max(
          0,
          Math.min(100, (warrior.bulldozerTimer / BULLDOZER_DURATION) * 100)
        );
        setTextIfChanged(mountLabelEl, 'BULLDOZER MODE');
        setTextIfChanged(
          mountHpTextEl,
          `${warrior.bulldozerTimer.toFixed(1)}s / ${BULLDOZER_DURATION}s`
        );
        setStyleIfChanged(mountHpBarFillEl, 'width', `${dozerPct}%`);
        setStyleIfChanged(
          mountHpBarFillEl,
          'background',
          'linear-gradient(90deg, #d69e2e, #ecc94b)'
        );
      } else if (warrior.mountType && warrior.mountHp > 0) {
        mountStatGroupEl.classList.remove('hidden');
        const mountMax = Math.max(1, warrior.mountMaxHp || warrior.mountHp);
        const mountPct = Math.max(0, Math.min(100, (warrior.mountHp / mountMax) * 100));
        setTextIfChanged(
          mountLabelEl,
          warrior.mountType === 'elephant'
            ? 'WAR ELEPHANT HP'
            : warrior.mountType === 'tortoise'
            ? 'GIANT TORTOISE HP'
            : 'WARHORSE HP'
        );
        setTextIfChanged(mountHpTextEl, `${Math.ceil(warrior.mountHp)} / ${mountMax}`);
        setStyleIfChanged(mountHpBarFillEl, 'width', `${mountPct}%`);
        setStyleIfChanged(
          mountHpBarFillEl,
          'background',
          warrior.mountType === 'elephant'
            ? 'linear-gradient(90deg, #4299e1, #90cdf4)'
            : warrior.mountType === 'tortoise'
            ? 'linear-gradient(90deg, #2f855a, #68d391)'
            : 'linear-gradient(90deg, #dd6b20, #f6ad55)'
        );
      } else {
        mountStatGroupEl.classList.add('hidden');
      }
    }

    if (warrior.hammers.length > 1) {
      setTextIfChanged(
        hammerMassValEl,
        warrior.hammers.map((hm) => (hm.mass || INITIAL_HAMMER_MASS).toFixed(2)).join('/')
      );
    } else {
      const primaryMass =
        warrior.hammers[0] && warrior.hammers[0].mass
          ? warrior.hammers[0].mass
          : hammer.mass || INITIAL_HAMMER_MASS;
      setTextIfChanged(hammerMassValEl, primaryMass.toFixed(2));
    }
    const lengthMeters = (
      getChainRestLength(warrior.hammers[0].chainLinks, warrior.hammers[0].linkLength) / 50
    ).toFixed(1);
    setTextIfChanged(
      chainLengthValEl,
      warrior.hammers.length > 1 ? `${lengthMeters}m (${warrior.hammers.length}x)` : `${lengthMeters}m`
    );

    let maxHSpeed = 0;
    let maxStretch = 0;
    for (let hIdx = 0; hIdx < warrior.hammers.length; hIdx++) {
      const hm = warrior.hammers[hIdx];
      const spd = Math.hypot(hm.vx, hm.vy);
      if (spd > maxHSpeed) maxHSpeed = spd;
      if ((hm.currentStretch || 0) > maxStretch) maxStretch = hm.currentStretch || 0;
    }
    const hSpeedMeters = (maxHSpeed / 50).toFixed(1);
    setTextIfChanged(hammerSpeedValEl, `${hSpeedMeters} m/s`);
    if (isMultiplayer) {
      setTextIfChanged(killsValEl, `${kills} (${teamKills})`);
    } else {
      setTextIfChanged(killsValEl, String(kills));
    }

    const tensionPct = Math.min(100, (maxStretch / 140) * 100);
    setStyleIfChanged(tensionBarFillEl, 'width', `${tensionPct}%`);

    // Count total and alive players
    const totalPlayers = 1 + remotePlayers.length;
    let alivePlayers = warrior.alive ? 1 : 0;
    for (let i = 0; i < remotePlayers.length; i++) {
      if (remotePlayers[i].alive) alivePlayers++;
    }
    setTextIfChanged(playersOnlineTextEl, `${alivePlayers} / ${totalPlayers} ALIVE`);

    renderLeaderboard(false);

    // Victory Page Modal
    if (victoryModal) {
      if (roundState === 'victory') {
        victoryModal.classList.remove('hidden');
        victoryModal.setAttribute('aria-hidden', 'false');
        if (observerBannerEl) {
          observerBannerEl.classList.add('hidden');
        }

        const remaining = isMultiplayer
          ? Math.max(0, VICTORY_DISPLAY_DURATION - serverRoundRestartTimer)
          : Math.max(0, VICTORY_DISPLAY_DURATION - localVictoryTimer);

        if (victoryBadgeEl) victoryBadgeEl.textContent = 'ARENA CONQUERED';
        if (victoryTitleEl) {
          victoryTitleEl.textContent = 'VICTORY!';
          victoryTitleEl.style.color = '';
        }
        const totalDefeated =
          victoryInfo && victoryInfo.teamKills ? victoryInfo.teamKills : Math.max(kills, teamKills);
        if (victorySubtitleEl) {
          victorySubtitleEl.textContent =
            (victoryInfo && victoryInfo.subtitle) ||
            `Over ${VICTORY_KILL_TARGET} zombie hordes have been vanquished (${totalDefeated} defeated)!`;
        }
        if (victoryStat1LabelEl) victoryStat1LabelEl.textContent = 'TOTAL DEFEATED';
        if (victoryStat1ValEl) victoryStat1ValEl.textContent = String(totalDefeated);
        if (victoryStat2LabelEl) victoryStat2LabelEl.textContent = 'YOUR KILLS';
        if (victoryStat2ValEl) victoryStat2ValEl.textContent = String(kills);
        if (victoryStat3LabelEl) victoryStat3LabelEl.textContent = 'TOP WARRIOR';
        if (victoryStat3ValEl) {
          victoryStat3ValEl.textContent =
            victoryInfo && victoryInfo.mvpName
              ? `${victoryInfo.mvpName} (${victoryInfo.mvpKills})`
              : `${warrior.name || 'YOU'} (${kills})`;
        }

        if (victoryCountdownTextEl) {
          victoryCountdownTextEl.textContent = `Starting new round in ${remaining.toFixed(1)}s...`;
        }
      } else {
        victoryModal.classList.add('hidden');
        victoryModal.setAttribute('aria-hidden', 'true');
      }
    }

    // Observer Mode banner when local player has died (and round is not showing victory modal)
    if (observerBannerEl && roundState !== 'victory') {
      if (!warrior.alive) {
        observerBannerEl.classList.remove('hidden');
        if (alivePlayers === 0) {
          const remaining = isMultiplayer
            ? Math.max(0, 3.0 - serverRoundRestartTimer)
            : Math.max(0, 3.0 - localObserverTimer);
          observerTitleEl.textContent = 'ALL WARRIORS HAVE FALLEN';
          observerSubtitleEl.textContent = `Restarting battle with all players active in ${remaining.toFixed(1)}s...`;
        } else {
          observerTitleEl.textContent = 'OBSERVER MODE';
          observerSubtitleEl.textContent = `You have fallen! Spectating surviving warriors (${alivePlayers} alive) until all players fall...`;
        }
      } else {
        observerBannerEl.classList.add('hidden');
      }
    }
  }

  // --- 2.5D Rendering ---
  function render() {
    ctx.save();

    // Fill outer apron grass with a subtle 2.5D depth gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, viewportHeight);
    skyGrad.addColorStop(0, '#1c3b19');
    skyGrad.addColorStop(1, '#264d23');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);

    const nowMs = performance.now();
    const isQuaking = earthquakeTimer > 0;
    if (isQuaking) {
      const domX = (Math.sin(nowMs * 0.13) * 7.5 + (Math.random() - 0.5) * 9).toFixed(1);
      const domY = (Math.cos(nowMs * 0.16) * 6.5 + (Math.random() - 0.5) * 8).toFixed(1);
      const domRot = (Math.sin(nowMs * 0.085) * 0.65).toFixed(2);
      canvas.style.transform = `translate3d(${domX}px, ${domY}px, 0) rotate(${domRot}deg) scale(1.016)`;
    } else if (canvas.style.transform) {
      canvas.style.transform = '';
    }

    const quakeX = isQuaking
      ? Math.sin(nowMs * 0.095) * 14 + (Math.random() - 0.5) * 16
      : 0;
    const quakeY = isQuaking
      ? Math.cos(nowMs * 0.115) * 11 + (Math.random() - 0.5) * 13
      : 0;
    const shakeX =
      (camera.shake > 0 ? (Math.random() - 0.5) * camera.shake * 2 : 0) + quakeX;
    const shakeY =
      (camera.shake > 0 ? (Math.random() - 0.5) * camera.shake * 2 : 0) + quakeY;

    if (isQuaking) {
      const canvasTilt = Math.sin(nowMs * 0.075) * 0.012;
      ctx.translate(viewportWidth / 2, viewportHeight / 2);
      ctx.rotate(canvasTilt);
      ctx.translate(-viewportWidth / 2, -viewportHeight / 2);
    }

    const camX = camera.x + shakeX;
    const camY = camera.y + shakeY;

    const viewLeft = camX - 220;
    const viewRight = camX + viewportWidth + 220;
    const viewTop = camY - 260;
    const viewBottom = camY + viewportHeight / TILT_Y + 260;

    // --- PASS 1: Foreshortened Ground Plane (z = 0) ---
    ctx.save();
    ctx.scale(1, TILT_Y);
    ctx.translate(-camX, -camY);

    // 1. Base Grassy Battlefield with subtle 2.5D perspective turf stripes
    ctx.fillStyle = '#31622c';
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    ctx.fillStyle = 'rgba(38, 82, 34, 0.24)';
    const firstStripe = Math.max(0, Math.floor(viewTop / 160) * 160);
    const lastStripe = Math.min(WORLD_HEIGHT, Math.ceil(viewBottom / 160) * 160);
    for (let sy = firstStripe; sy < lastStripe; sy += 160) {
      ctx.fillRect(0, sy, WORLD_WIDTH, 80);
    }

    // 1b. Seismic Ground Fissures & Tremor Cracks across the field during an earthquake
    if (isQuaking || localKnockdownTimer > 0) {
      const fissureAlpha = isQuaking
        ? 0.78 + 0.22 * Math.sin(nowMs * 0.04)
        : Math.min(0.55, localKnockdownTimer / ZOMBIE_KNOCKDOWN_RECOVERY * 0.5);
      const cellSize = 360;
      const startGX = Math.max(0, Math.floor(viewLeft / cellSize) * cellSize);
      const endGX = Math.min(WORLD_WIDTH, Math.ceil(viewRight / cellSize) * cellSize);
      const startGY = Math.max(0, Math.floor(viewTop / cellSize) * cellSize);
      const endGY = Math.min(WORLD_HEIGHT, Math.ceil(viewBottom / cellSize) * cellSize);

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let gx = startGX; gx <= endGX; gx += cellSize) {
        for (let gy = startGY; gy <= endGY; gy += cellSize) {
          const seed = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
          const cx = gx + (seed % 220) + 60;
          const cy = gy + ((seed >> 8) % 220) + 60;
          const baseAng = ((seed % 360) * Math.PI) / 180;
          const jitter = isQuaking ? Math.sin(nowMs * 0.08 + seed) * 5 : 0;

          // Dark jagged fault crack with glowing amber magma/seismic rim
          for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle =
              pass === 0
                ? `rgba(236, 201, 75, ${(fissureAlpha * 0.55).toFixed(2)})`
                : `rgba(20, 14, 8, ${(fissureAlpha * 0.92).toFixed(2)})`;
            ctx.lineWidth = pass === 0 ? 7.5 : 3.4;
            ctx.beginPath();
            let px = cx + jitter;
            let py = cy - jitter * 0.6;
            ctx.moveTo(px, py);
            for (let seg = 1; seg <= 5; seg++) {
              const zig = (seg % 2 === 0 ? 1 : -1) * (18 + ((seed >> seg) % 16));
              const segLen = 34 + ((seed >> (seg * 2)) % 24);
              px += Math.cos(baseAng) * segLen - Math.sin(baseAng) * zig;
              py += Math.sin(baseAng) * segLen + Math.cos(baseAng) * zig;
              ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    // 2. Meadow Patches (foreshortened on the ground plane — always rendered so ground never blinks)
    for (let i = 0; i < grassPatches.length; i++) {
      const p = grassPatches[i];
      if (
        p.x + p.rx < viewLeft ||
        p.x - p.rx > viewRight ||
        p.y + p.ry < viewTop ||
        p.y - p.ry > viewBottom
      ) {
        continue;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.type === 'light' ? 'rgba(88, 158, 66, 0.24)' : 'rgba(28, 68, 28, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Wildflowers on the turf (always rendered consistently across all quality tiers)
    for (let i = 0; i < wildflowers.length; i++) {
      const f = wildflowers[i];
      if (f.x < viewLeft || f.x > viewRight || f.y < viewTop || f.y > viewBottom) continue;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 1.15, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Shockwaves on the ground plane (automatically foreshortened into 2.5D ellipses)
    for (let i = 0; i < shockwaves.length; i++) {
      const s = shockwaves[i];
      const alpha = Math.max(0, s.life / s.maxLife);
      ctx.strokeStyle = `rgba(${s.rgb || '255, 232, 145'}, ${alpha * 0.82})`;
      ctx.lineWidth = 4 * alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Mouse target reticle on the ground plane
    const targetWorldX = camera.x + mouse.screenX;
    const targetWorldY = camera.y + mouse.screenY / TILT_Y;
    ctx.strokeStyle = 'rgba(99, 179, 237, 0.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(targetWorldX, targetWorldY, 13, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(99, 179, 237, 0.85)';
    ctx.beginPath();
    ctx.arc(targetWorldX, targetWorldY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // --- PASS 2: 2.5D World Space (wx -> wx - camX, wy -> (wy - camY) * TILT_Y - wz) ---
    ctx.save();
    ctx.translate(-camX, -camY * TILT_Y);

    // 5. Standing Grass Tufts rising vertically (-z) from the tilted ground
    // Always rendered in full so grass never blinks; batched by shade into 2 stroke() calls for speed
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    const grassShades = ['#2d6a32', '#438a3e'];
    for (let sIdx = 0; sIdx < grassShades.length; sIdx++) {
      const shade = grassShades[sIdx];
      ctx.strokeStyle = shade;
      ctx.beginPath();
      for (let i = 0; i < grassTufts.length; i++) {
        const t = grassTufts[i];
        if (t.shade !== shade) continue;
        if (t.x < viewLeft || t.x > viewRight || t.y < viewTop || t.y > viewBottom) continue;
        const gy = t.y * TILT_Y;
        for (let b = 0; b < t.blades; b++) {
          const spread = (b - (t.blades - 1) / 2) * 3.2;
          ctx.moveTo(t.x + spread * 0.3, gy);
          ctx.lineTo(t.x + spread, gy - t.size * 1.25);
        }
      }
      ctx.stroke();
    }

    // 6. 3D Field Stones (always rendered so stones never blink; batched by pass into 3 fill() calls)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    for (let i = 0; i < pebbles.length; i++) {
      const p = pebbles[i];
      if (p.x < viewLeft || p.x > viewRight || p.y < viewTop || p.y > viewBottom) continue;
      const py = p.y * TILT_Y;
      ctx.moveTo(p.x + 2 + p.rx * 1.15, py + 1.5);
      ctx.ellipse(p.x + 2, py + 1.5, p.rx * 1.15, p.ry * TILT_Y, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    ctx.fillStyle = '#5a625a';
    ctx.beginPath();
    for (let i = 0; i < pebbles.length; i++) {
      const p = pebbles[i];
      if (p.x < viewLeft || p.x > viewRight || p.y < viewTop || p.y > viewBottom) continue;
      const py = p.y * TILT_Y;
      ctx.moveTo(p.x + p.rx * 1.1, py);
      ctx.ellipse(p.x, py, p.rx * 1.1, p.ry * TILT_Y, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    ctx.fillStyle = '#8b9689';
    ctx.beginPath();
    for (let i = 0; i < pebbles.length; i++) {
      const p = pebbles[i];
      if (p.x < viewLeft || p.x > viewRight || p.y < viewTop || p.y > viewBottom) continue;
      const py = p.y * TILT_Y;
      const h = p.ry * 0.95;
      ctx.moveTo(p.x + p.rx * 1.02, py - h);
      ctx.ellipse(p.x, py - h, p.rx * 1.02, p.ry * TILT_Y * 0.9, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    // 7. North / Back 3D Timber Fence
    drawWorldBorderBack();

    // 8. 2.5D Suspended Iron Chains for all active players & all their hammers
    if (warrior.alive) {
      for (let hIdx = 0; hIdx < warrior.hammers.length; hIdx++) {
        const h = warrior.hammers[hIdx];
        if (Array.isArray(h.chainNodes)) {
          drawChain(h.chainNodes, h.currentStretch);
        }
      }
    }
    for (let i = 0; i < remotePlayers.length; i++) {
      const rp = remotePlayers[i];
      if (!rp.alive) continue;
      if (Array.isArray(rp.hammers) && rp.hammers.length > 0) {
        for (let hIdx = 0; hIdx < rp.hammers.length; hIdx++) {
          const rh = rp.hammers[hIdx];
          if (rh && Array.isArray(rh.chainNodes) && rh.chainNodes.length > 0) {
            let cMinX = rp.x < rh.x ? rp.x : rh.x;
            let cMaxX = rp.x > rh.x ? rp.x : rh.x;
            let cMinY = rp.y < rh.y ? rp.y : rh.y;
            let cMaxY = rp.y > rh.y ? rp.y : rh.y;
            for (let nIdx = 0; nIdx < rh.chainNodes.length; nIdx++) {
              const cn = rh.chainNodes[nIdx];
              if (cn.x < cMinX) cMinX = cn.x;
              if (cn.x > cMaxX) cMaxX = cn.x;
              if (cn.y < cMinY) cMinY = cn.y;
              if (cn.y > cMaxY) cMaxY = cn.y;
            }
            if (
              cMaxX >= viewLeft &&
              cMinX <= viewRight &&
              cMaxY >= viewTop &&
              cMinY <= viewBottom
            ) {
              drawChain(rh.chainNodes, rh.currentStretch || 0);
            }
          }
        }
      } else if (Array.isArray(rp.chainNodes) && rp.chainNodes.length > 0) {
        let cMinX = rp.x;
        let cMaxX = rp.x;
        let cMinY = rp.y;
        let cMaxY = rp.y;
        for (let nIdx = 0; nIdx < rp.chainNodes.length; nIdx++) {
          const cn = rp.chainNodes[nIdx];
          if (cn.x < cMinX) cMinX = cn.x;
          if (cn.x > cMaxX) cMaxX = cn.x;
          if (cn.y < cMinY) cMinY = cn.y;
          if (cn.y > cMaxY) cMaxY = cn.y;
        }
        if (
          cMaxX >= viewLeft &&
          cMinX <= viewRight &&
          cMaxY >= viewTop &&
          cMinY <= viewBottom
        ) {
          drawChain(rp.chainNodes, rp.hammer ? rp.hammer.currentStretch : 0);
        }
      }
    }

    // 9. Depth-Sorted (Y-Sorted) 2.5D Volumetric Entities (Columns, Pickups, Zombies, Warriors, Maces)
    const drawList = [];

    for (let i = 0; i < stoneColumns.length; i++) {
      const col = stoneColumns[i];
      if (
        col.x + col.radius < viewLeft ||
        col.x - col.radius > viewRight ||
        col.y + col.radius < viewTop ||
        col.y - col.radius > viewBottom
      ) {
        continue;
      }
      drawList.push({ y: col.y, type: 'column', ref: col });
    }

    for (let i = 0; i < blackCircles.length; i++) {
      const c = blackCircles[i];
      if (c.x < viewLeft || c.x > viewRight || c.y < viewTop || c.y > viewBottom) continue;
      drawList.push({ y: c.y, type: 'pickup', ref: c });
    }

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (
        e.x + e.radius < viewLeft ||
        e.x - e.radius > viewRight ||
        e.y + e.radius < viewTop ||
        e.y - e.radius > viewBottom
      ) {
        continue;
      }
      drawList.push({ y: e.y, type: 'enemy', ref: e });
    }

    if (warrior.alive) {
      drawList.push({ y: warrior.y, type: 'warrior', ref: warrior, isLocal: true });
      for (let hIdx = 0; hIdx < warrior.hammers.length; hIdx++) {
        const h = warrior.hammers[hIdx];
        drawList.push({ y: h.y + 1, type: 'hammer', ref: h, trail: h.trail || [] });
      }
    }

    for (let i = 0; i < remotePlayers.length; i++) {
      const rp = remotePlayers[i];
      if (!rp.alive) continue;
      drawList.push({ y: rp.y, type: 'warrior', ref: rp, isLocal: false });
      if (Array.isArray(rp.hammers) && rp.hammers.length > 0) {
        for (let hIdx = 0; hIdx < rp.hammers.length; hIdx++) {
          const rh = rp.hammers[hIdx];
          if (rh) {
            drawList.push({ y: rh.y + 1, type: 'hammer', ref: rh, trail: [] });
          }
        }
      } else if (rp.hammer) {
        drawList.push({ y: rp.hammer.y + 1, type: 'hammer', ref: rp.hammer, trail: [] });
      }
    }

    drawList.sort((a, b) => a.y - b.y);

    for (let i = 0; i < drawList.length; i++) {
      const item = drawList[i];
      if (item.type === 'column') {
        drawStoneColumn(item.ref);
      } else if (item.type === 'pickup') {
        drawPickupCircle(item.ref);
      } else if (item.type === 'enemy') {
        drawEnemy(item.ref);
      } else if (item.type === 'warrior') {
        drawWarrior(item.ref, item.isLocal);
      } else if (item.type === 'hammer') {
        drawHammer(item.ref, item.trail);
      }
    }

    // 10. South / Front 3D Timber Fence
    drawWorldBorderFront();

    // 11. 2.5D Elevated Particles & Floating Damage Numbers
    const drawParticleShadows = visualQualityTier === QUALITY_TIER_HIGH;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.x < viewLeft || p.x > viewRight || p.y < viewTop || p.y > viewBottom) continue;
      const alpha = Math.max(0, p.life / p.maxLife);
      const zLift = Math.sin((1 - alpha) * Math.PI) * 18 + 10;
      ctx.globalAlpha = alpha;
      if (drawParticleShadows) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y * TILT_Y, p.size, p.size * TILT_Y, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y * TILT_Y - zLift, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < floatingTexts.length; i++) {
      const ft = floatingTexts[i];
      if (ft.x < viewLeft || ft.x > viewRight || ft.y < viewTop || ft.y > viewBottom) continue;
      const alpha = Math.max(0, ft.life / ft.maxLife);
      const screenY = ft.y * TILT_Y - 34;
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${Math.round(14 * ft.scale)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
      ctx.fillText(ft.text, ft.x + 1.5, screenY + 1.5);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, screenY);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
    ctx.restore();

    // Active Earthquake Screen Border & Top Status Banner
    if (earthquakeTimer > 0 || localKnockdownTimer > 0) {
      ctx.save();
      if (earthquakeTimer > 0) {
        const pulse = 0.55 + 0.45 * Math.sin(nowMs * 0.035);
        ctx.strokeStyle = `rgba(236, 201, 75, ${(0.55 * pulse).toFixed(2)})`;
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, viewportWidth - 10, viewportHeight - 10);

        const bannerW = 390;
        const bannerH = 36;
        const bx = (viewportWidth - bannerW) / 2;
        const by = 18;
        ctx.fillStyle = 'rgba(26, 32, 44, 0.88)';
        ctx.strokeStyle = '#ecc94b';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.roundRect(bx, by, bannerW, bannerH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fefcbf';
        ctx.font = '800 14px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          `EARTHQUAKE! FIELD SHAKING (${earthquakeTimer.toFixed(1)}s)`,
          viewportWidth / 2,
          by + bannerH / 2
        );
      } else if (localKnockdownTimer > 0) {
        const bannerW = 360;
        const bannerH = 32;
        const bx = (viewportWidth - bannerW) / 2;
        const by = 18;
        ctx.fillStyle = 'rgba(26, 32, 44, 0.82)';
        ctx.strokeStyle = '#d69e2e';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(bx, by, bannerW, bannerH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fbd38d';
        ctx.font = '700 13px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          `ZOMBIES TOPPLED & MOTIONLESS (${localKnockdownTimer.toFixed(1)}s)`,
          viewportWidth / 2,
          by + bannerH / 2
        );
      }
      ctx.restore();
    }

    if (minimapAccumSec >= MINIMAP_UPDATE_INTERVAL) {
      minimapAccumSec = 0;
      renderMinimap();
    }
  }

  function drawPickupCircle(c) {
    const pType = c.type || 'link';
    const bobZ = 7 + Math.sin(c.pulse) * 3;
    const sy = c.y * TILT_Y;

    let glowColor = 'rgba(246, 224, 94, 0.28)';
    let strokeColor = '#ecc94b';
    let sideColor = '#744210';
    if (pType === 'weight') {
      glowColor = 'rgba(203, 213, 224, 0.28)';
      strokeColor = '#cbd5e0';
      sideColor = '#2d3748';
    } else if (pType === 'health') {
      glowColor = 'rgba(72, 187, 120, 0.28)';
      strokeColor = '#48bb78';
      sideColor = '#22543d';
    } else if (pType === 'bomb') {
      glowColor = 'rgba(237, 137, 54, 0.32)';
      strokeColor = '#ed8936';
      sideColor = '#7b341e';
    } else if (pType === 'speed') {
      glowColor = 'rgba(99, 179, 237, 0.28)';
      strokeColor = '#63b3ed';
      sideColor = '#2a4365';
    } else if (pType === 'flame') {
      glowColor = 'rgba(255, 107, 53, 0.38)';
      strokeColor = '#ff6b35';
      sideColor = '#7b241c';
    } else if (pType === 'hammer') {
      glowColor = 'rgba(183, 148, 244, 0.45)';
      strokeColor = '#b794f4';
      sideColor = '#44337a';
    } else if (pType === 'horse') {
      glowColor = 'rgba(237, 137, 54, 0.44)';
      strokeColor = '#f6ad55';
      sideColor = '#7b341e';
    } else if (pType === 'tortoise') {
      glowColor = 'rgba(72, 187, 120, 0.48)';
      strokeColor = '#68d391';
      sideColor = '#22543d';
    } else if (pType === 'elephant') {
      glowColor = 'rgba(144, 205, 244, 0.48)';
      strokeColor = '#90cdf4';
      sideColor = '#2c5282';
    } else if (pType === 'earthquake') {
      glowColor = 'rgba(236, 201, 75, 0.48)';
      strokeColor = '#ecc94b';
      sideColor = '#975a16';
    } else if (pType === 'fear') {
      glowColor = 'rgba(183, 148, 244, 0.48)';
      strokeColor = '#b794f4';
      sideColor = '#553c9a';
    } else if (pType === 'bulldozer') {
      glowColor = 'rgba(236, 201, 75, 0.56)';
      strokeColor = '#ecc94b';
      sideColor = '#744210';
    } else if (pType === 'disco') {
      glowColor = 'rgba(246, 135, 179, 0.54)';
      strokeColor = '#f687b3';
      sideColor = '#702459';
    } else if (pType === 'jackolantern') {
      glowColor = 'rgba(237, 137, 54, 0.54)';
      strokeColor = '#ed8936';
      sideColor = '#7b341e';
    } else if (pType === 'spider') {
      glowColor = 'rgba(226, 232, 240, 0.56)';
      strokeColor = '#ffffff';
      sideColor = '#2d3748';
    }

    ctx.save();

    // 1. Foreshortened ground shadow & glow on the grass (z = 0)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(c.x, sy + 2, PICKUP_RADIUS * 1.05, PICKUP_RADIUS * TILT_Y * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.ellipse(
      c.x,
      sy - bobZ + 2,
      PICKUP_RADIUS + 5,
      (PICKUP_RADIUS + 5) * TILT_Y,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // 2. 2.5D Extruded Disc / Puck floating at height bobZ
    const discY = sy - bobZ;
    const rx = PICKUP_RADIUS * 1.12;
    const ry = PICKUP_RADIUS * 0.85;
    const thickness = 5;

    // Side cylinder wall of the pickup disc
    ctx.fillStyle = sideColor;
    ctx.beginPath();
    ctx.ellipse(c.x, discY + thickness, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(c.x - rx, discY);
    ctx.ellipse(c.x, discY, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();

    // Dark obsidian top face
    ctx.fillStyle = '#0e1114';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(c.x, discY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 3. Emblem on top of the floating 2.5D disc
    ctx.translate(c.x, discY);
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = 1.8;

    if (pType === 'link') {
      ctx.beginPath();
      ctx.ellipse(-1.8, 0, 3.6, 2.0, -0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(1.8, 0, 3.6, 2.0, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    } else if (pType === 'weight') {
      ctx.beginPath();
      ctx.moveTo(-3.5, -2.5);
      ctx.lineTo(3.5, -2.5);
      ctx.lineTo(5, 3.2);
      ctx.lineTo(-5, 3.2);
      ctx.closePath();
      ctx.fill();
    } else if (pType === 'health') {
      ctx.fillRect(-1.3, -4.2, 2.6, 8.4);
      ctx.fillRect(-4.4, -1.2, 8.8, 2.4);
    } else if (pType === 'bomb') {
      ctx.beginPath();
      ctx.arc(-0.5, 0.8, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fefcbf';
      ctx.beginPath();
      ctx.moveTo(1.4, -1.2);
      ctx.lineTo(4.0, -3.8);
      ctx.stroke();
    } else if (pType === 'speed') {
      ctx.beginPath();
      ctx.moveTo(-3.5, -3.2);
      ctx.lineTo(0.5, 0);
      ctx.lineTo(-3.5, 3.2);
      ctx.moveTo(0.5, -3.2);
      ctx.lineTo(4.5, 0);
      ctx.lineTo(0.5, 3.2);
      ctx.stroke();
    } else if (pType === 'flame') {
      // Flickering multi-layered flame emblem
      const flicker = Math.sin(c.pulse * 2.3) * 0.9;
      ctx.fillStyle = '#ff5722';
      ctx.beginPath();
      ctx.moveTo(0, -5.8 - flicker * 0.5);
      ctx.quadraticCurveTo(4.8, -1.2, 3.6, 2.8);
      ctx.arc(0, 2.2, 3.8, 0.15, Math.PI - 0.15);
      ctx.quadraticCurveTo(-4.8, -1.2, 0, -5.8 - flicker * 0.5);
      ctx.fill();

      ctx.fillStyle = '#f6e05e';
      ctx.beginPath();
      ctx.moveTo(0, -3.2 + flicker * 0.3);
      ctx.quadraticCurveTo(2.4, 0, 1.8, 2.5);
      ctx.arc(0, 2.2, 2.0, 0.15, Math.PI - 0.15);
      ctx.quadraticCurveTo(-2.4, 0, 0, -3.2 + flicker * 0.3);
      ctx.fill();
    } else if (pType === 'hammer') {
      // Miniature spiked mace / warhammer emblem
      ctx.strokeStyle = '#e9d8fd';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-4.2, 3.8);
      ctx.lineTo(1.2, -1.6);
      ctx.stroke();

      ctx.fillStyle = '#b794f4';
      ctx.beginPath();
      ctx.arc(2.2, -2.4, 3.4, 0, Math.PI * 2);
      ctx.fill();

      // Tiny spikes on the mace head
      ctx.strokeStyle = '#faf5ff';
      ctx.lineWidth = 1.4;
      for (let s = 0; s < 6; s++) {
        const ang = (s * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(2.2 + Math.cos(ang) * 2.5, -2.4 + Math.sin(ang) * 2.5);
        ctx.lineTo(2.2 + Math.cos(ang) * 4.8, -2.4 + Math.sin(ang) * 4.8);
        ctx.stroke();
      }
    } else if (pType === 'horse') {
      // Chestnut Warhorse head & mane silhouette emblem
      ctx.fillStyle = '#f6ad55';
      ctx.beginPath();
      ctx.moveTo(-3.2, 4.2);
      ctx.lineTo(-2.5, -2.5);
      ctx.lineTo(-0.8, -5.2);
      ctx.lineTo(0.8, -3.5);
      ctx.lineTo(4.6, -1.2);
      ctx.lineTo(3.8, 1.0);
      ctx.lineTo(0.5, 0.5);
      ctx.lineTo(1.2, 4.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fbd38d';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-2.5, -2.8);
      ctx.lineTo(-4.4, 2.2);
      ctx.stroke();
    } else if (pType === 'tortoise') {
      // Miniature Domed Tortoise Shell, Legs, and Poking Head emblem
      ctx.fillStyle = '#38a169';
      ctx.beginPath();
      ctx.arc(4.8, 0.4, 1.7, 0, Math.PI * 2);
      ctx.ellipse(-2.8, 2.8, 1.3, 1.0, 0.2, 0, Math.PI * 2);
      ctx.ellipse(2.2, 2.8, 1.3, 1.0, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // Domed emerald shell
      ctx.fillStyle = '#68d391';
      ctx.beginPath();
      ctx.arc(-0.4, 1.4, 4.4, Math.PI, 0, false);
      ctx.closePath();
      ctx.fill();

      // Shell rim & scute lines
      ctx.strokeStyle = '#f6e05e';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-5.0, 1.4);
      ctx.lineTo(4.2, 1.4);
      ctx.stroke();

      ctx.strokeStyle = '#22543d';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(-2.2, 1.2);
      ctx.lineTo(-1.4, -2.6);
      ctx.moveTo(1.2, 1.2);
      ctx.lineTo(0.6, -2.6);
      ctx.stroke();
    } else if (pType === 'elephant') {
      // War Elephant head, ear, trunk, and ivory tusk emblem
      ctx.fillStyle = '#90cdf4';
      ctx.beginPath();
      ctx.ellipse(-2.2, -0.5, 3.2, 3.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0.8, -0.8, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#90cdf4';
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(3.2, -0.5);
      ctx.quadraticCurveTo(5.6, 2.5, 3.4, 4.2);
      ctx.stroke();
      // White ivory tusk
      ctx.strokeStyle = '#fffff0';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(2.0, 1.0);
      ctx.quadraticCurveTo(5.0, 1.6, 5.8, -0.5);
      ctx.stroke();
    } else if (pType === 'earthquake') {
      // Jagged seismic fault crack & shockwave rings emblem
      ctx.strokeStyle = '#ecc94b';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-4.8, -3.6);
      ctx.lineTo(-1.2, -0.8);
      ctx.lineTo(2.0, -2.2);
      ctx.lineTo(-1.0, 1.4);
      ctx.lineTo(4.6, 3.6);
      ctx.stroke();

      ctx.strokeStyle = '#fefcbf';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 5.6, -0.6, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 5.6, Math.PI - 0.6, Math.PI + 0.6);
      ctx.stroke();
    } else if (pType === 'fear') {
      // Ghostly screaming skull / terror mask emblem
      ctx.fillStyle = '#e9d8fd';
      ctx.beginPath();
      ctx.arc(0, -1.2, 4.2, Math.PI, 0, false);
      ctx.lineTo(3.2, 3.8);
      ctx.lineTo(-3.2, 3.8);
      ctx.closePath();
      ctx.fill();

      // Hollow terrified eyes & screaming mouth
      ctx.fillStyle = '#1a202c';
      ctx.beginPath();
      ctx.arc(-1.6, -1.2, 1.1, 0, Math.PI * 2);
      ctx.arc(1.6, -1.2, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 1.6, 1.3, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (pType === 'bulldozer') {
      // Miniature Caterpillar Bulldozer emblem (tread base, yellow cab/hood, curved front steel blade)
      ctx.fillStyle = '#4a5568';
      ctx.beginPath();
      ctx.roundRect(-5.2, 1.4, 8.2, 2.8, 1.3);
      ctx.fill();

      ctx.fillStyle = '#ecc94b';
      ctx.fillRect(-4.6, -1.4, 7.0, 2.9);
      ctx.fillRect(-4.0, -4.0, 4.0, 2.8);

      // Curved heavy front dozer blade on right
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(4.0, -3.5);
      ctx.quadraticCurveTo(5.6, 0.2, 4.2, 3.8);
      ctx.stroke();
    } else if (pType === 'disco') {
      // Glittering mirrored Disco Ball emblem with grid lines & star glints
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(0, 0, 4.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#702459';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-4.4, -1.5);
      ctx.lineTo(4.4, -1.5);
      ctx.moveTo(-4.4, 1.5);
      ctx.lineTo(4.4, 1.5);
      ctx.moveTo(-1.5, -4.4);
      ctx.lineTo(-1.5, 4.4);
      ctx.moveTo(1.5, -4.4);
      ctx.lineTo(1.5, 4.4);
      ctx.stroke();

      // Colorful mirror facet highlights
      ctx.fillStyle = '#f687b3';
      ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
      ctx.fillStyle = '#63b3ed';
      ctx.fillRect(-3.6, -1.3, 1.8, 2.4);
      ctx.fillStyle = '#f6e05e';
      ctx.fillRect(1.6, -1.3, 1.8, 2.4);
    } else if (pType === 'jackolantern') {
      // Miniature carved Jack-o'-Lantern pumpkin emblem
      ctx.fillStyle = '#ed8936';
      ctx.beginPath();
      ctx.ellipse(0, 0.6, 4.9, 3.9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Green pumpkin stem on top
      ctx.strokeStyle = '#48bb78';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -3.2);
      ctx.lineTo(1.2, -5.0);
      ctx.stroke();

      // Glowing yellow carved eyes & grin
      ctx.fillStyle = '#fefcbf';
      ctx.beginPath();
      ctx.moveTo(-2.5, -1.0);
      ctx.lineTo(-1.0, -1.0);
      ctx.lineTo(-1.75, -2.3);
      ctx.closePath();
      ctx.moveTo(2.5, -1.0);
      ctx.lineTo(1.0, -1.0);
      ctx.lineTo(1.75, -2.3);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#fefcbf';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0.8, 2.5, 0.2, Math.PI - 0.2);
      ctx.stroke();
    } else if (pType === 'spider') {
      // Miniature Black Widow Spider & Web emblem (8 angled legs, dark abdomen, crimson hourglass & eyes)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.15;
      for (let side of [-1, 1]) {
        for (let leg = 0; leg < 4; leg++) {
          const ly = -2.4 + leg * 1.65;
          const kneeX = side * (3.6 + (leg === 1 || leg === 2 ? 0.8 : 0));
          const kneeY = ly + (leg < 2 ? -1.4 : 1.4);
          const tipX = side * 5.8;
          const tipY = ly + (leg < 2 ? -2.6 : 2.6);
          ctx.beginPath();
          ctx.moveTo(side * 1.2, ly * 0.5);
          ctx.lineTo(kneeX, kneeY);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();
        }
      }

      // Glossy dark spider abdomen & cephalothorax
      ctx.fillStyle = '#1a202c';
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, 1.4, 2.7, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, -2.3, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Crimson hourglass marking & glowing red eyes
      ctx.fillStyle = '#f56565';
      ctx.beginPath();
      ctx.arc(0, 1.4, 1.1, 0, Math.PI * 2);
      ctx.arc(-0.7, -2.8, 0.6, 0, Math.PI * 2);
      ctx.arc(0.7, -2.8, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawWorldBorderBack() {
    ctx.save();
    const topY = 8 * TILT_Y;
    const fenceH = 28;

    // North wall 3D timber rails & posts
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(8, topY, WORLD_WIDTH - 16, 8);

    ctx.fillStyle = '#5c4028';
    ctx.fillRect(8, topY - fenceH + 6, WORLD_WIDTH - 16, 7);
    ctx.fillRect(8, topY - 10, WORLD_WIDTH - 16, 7);

    ctx.fillStyle = '#3d2817';
    for (let x = 8; x <= WORLD_WIDTH - 8; x += 140) {
      ctx.fillRect(x - 5, topY - fenceH, 10, fenceH + 4);
      ctx.fillStyle = '#7c5836';
      ctx.fillRect(x - 5, topY - fenceH, 10, 4);
      ctx.fillStyle = '#3d2817';
    }
    ctx.restore();
  }

  function drawWorldBorderFront() {
    ctx.save();
    const topY = 8 * TILT_Y;
    const botY = (WORLD_HEIGHT - 8) * TILT_Y;
    const fenceH = 28;

    // Left and Right vertical side walls in 2.5D
    ctx.strokeStyle = '#4a3520';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(8, topY - fenceH * 0.5);
    ctx.lineTo(8, botY - fenceH * 0.5);
    ctx.moveTo(WORLD_WIDTH - 8, topY - fenceH * 0.5);
    ctx.lineTo(WORLD_WIDTH - 8, botY - fenceH * 0.5);
    ctx.stroke();

    // South wall 3D timber rails & posts
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.fillRect(8, botY, WORLD_WIDTH - 16, 8);

    ctx.fillStyle = '#5c4028';
    ctx.fillRect(8, botY - fenceH + 6, WORLD_WIDTH - 16, 7);
    ctx.fillRect(8, botY - 10, WORLD_WIDTH - 16, 7);

    for (let x = 8; x <= WORLD_WIDTH - 8; x += 140) {
      ctx.fillStyle = '#3d2817';
      ctx.fillRect(x - 5, botY - fenceH, 10, fenceH + 4);
      ctx.fillStyle = '#7c5836';
      ctx.fillRect(x - 5, botY - fenceH, 10, 4);
    }
    ctx.restore();
  }

  function drawChain(nodes = chainNodes, stretch = hammer.currentStretch) {
    const n = nodes.length;
    if (n < 2) return;

    const tensionRatio = Math.min(1, (stretch || 0) / 120);

    // 1. Ground shadow of the chain (at z = 0)
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(nodes[0].x + 3, nodes[0].y * TILT_Y + 3);
    for (let i = 1; i < n; i++) {
      ctx.lineTo(nodes[i].x + 3, nodes[i].y * TILT_Y + 3);
    }
    ctx.stroke();

    // Compute 3D elevation z for each chain node (warrior gauntlet z=18 -> catenary sag -> hammer z=15)
    const sagDepth = Math.max(0, 1 - tensionRatio) * 7;
    const getLinkZ = (idx) => {
      const t = idx / (n - 1);
      const baseZ = 18 * (1 - t) + 15 * t;
      return baseZ - Math.sin(t * Math.PI) * sagDepth;
    };

    // 2. Elevated 3D iron spine connecting links
    ctx.strokeStyle = '#1e2631';
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(nodes[0].x, nodes[0].y * TILT_Y - getLinkZ(0));
    for (let i = 1; i < n; i++) {
      ctx.lineTo(nodes[i].x, nodes[i].y * TILT_Y - getLinkZ(i));
    }
    ctx.stroke();
    ctx.restore();

    // 3. Individual 3D metallic chain links (secondary torus shadow highlight scales with quality tier)
    const drawSecondaryTorusHighlight = visualQualityTier === QUALITY_TIER_HIGH;
    for (let i = 0; i < n; i++) {
      const curr = nodes[i];
      const prev = nodes[Math.max(0, i - 1)];
      const next = nodes[Math.min(n - 1, i + 1)];

      const sx = curr.x;
      const sy = curr.y * TILT_Y - getLinkZ(i);
      const prevSy = prev.y * TILT_Y - getLinkZ(Math.max(0, i - 1));
      const nextSy = next.y * TILT_Y - getLinkZ(Math.min(n - 1, i + 1));
      const localAngle = Math.atan2(nextSy - prevSy, next.x - prev.x);

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(localAngle + (i % 2 === 0 ? 0.2 : -0.2));

      if (drawSecondaryTorusHighlight) {
        // Bottom/side thickness of link
        ctx.strokeStyle = '#1a202c';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.ellipse(0, 1.6, 6.2, 3.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Top lit link face (warms to glowing gold/amber under high elastic tension)
      if (tensionRatio > 0.05) {
        const r = Math.round(70 + tensionRatio * 185);
        const g = Math.round(80 + tensionRatio * 105);
        const b = Math.round(92 - tensionRatio * 45);
        ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      } else {
        ctx.strokeStyle = i % 2 === 0 ? '#718096' : '#a0aec0';
      }

      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 6.2, 3.2, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawWarrior(w = warrior, isLocal = true) {
    const sx = w.x;
    const sy = w.y * TILT_Y;
    const dirX = Math.cos(w.angle);
    const dirY = Math.sin(w.angle);
    const rightX = -dirY;
    const rightY = dirX;

    const speed = Math.hypot(w.vx || 0, w.vy || 0);
    const bob = Math.abs(Math.sin(w.walkCycle || 0)) * Math.min(3.5, speed * 0.018);
    const isBulldozer = (w.bulldozerTimer || 0) > 0;
    const isHorse = !isBulldozer && w.mountType === 'horse' && (w.mountHp || 0) > 0;
    const isTortoise = !isBulldozer && w.mountType === 'tortoise' && (w.mountHp || 0) > 0;
    const isElephant = !isBulldozer && w.mountType === 'elephant' && (w.mountHp || 0) > 0;
    const mountLift = isElephant ? 24 : isHorse ? 14 : isTortoise ? 13 : 0;
    const radius =
      w.radius ||
      (isBulldozer
        ? BULLDOZER_RADIUS
        : isElephant
        ? 32
        : isTortoise
        ? 26
        : isHorse
        ? 25
        : 20);

    ctx.save();
    ctx.translate(sx, sy);

    // 1. Foreshortened 2.5D Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(
      2,
      3,
      radius *
        (isBulldozer
          ? 1.35
          : isElephant
          ? 1.38
          : isTortoise
          ? 1.32
          : isHorse
          ? 1.25
          : 1.12),
      radius *
        TILT_Y *
        (isBulldozer
          ? 1.15
          : isElephant
          ? 1.15
          : isTortoise
          ? 1.12
          : isHorse
          ? 1.05
          : 0.95),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Facing direction ring / arrow on the turf around the warrior's feet
    const ringDist = isBulldozer ? 40 : isElephant ? 34 : isTortoise ? 28 : isHorse ? 25 : 16;
    ctx.strokeStyle = isLocal ? 'rgba(236, 201, 75, 0.55)' : 'rgba(104, 211, 145, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(
      dirX * ringDist,
      dirY * ringDist * TILT_Y,
      5,
      5 * TILT_Y,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();

    // 1a. If transformed into a Bulldozer, render the 2.5D Heavy Caterpillar Bulldozer
    if (isBulldozer) {
      gameTime = performance.now() * 0.001;
      const nowSecDozer = gameTime;
      const rumble = Math.sin(gameTime * 38) * 1.1;
      const bodyAngle = Math.atan2(dirY * TILT_Y, dirX);

      const drawDozerTrack = (sideSign) => {
        const tx = rightX * sideSign * 19;
        const ty = rightY * sideSign * 19 * TILT_Y - 7 + rumble * 0.4;
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(bodyAngle);

        // Heavy armored caterpillar track frame
        ctx.fillStyle = '#1a202c';
        ctx.strokeStyle = '#0d1117';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-24, -6.5, 48, 13, 5);
        ctx.fill();
        ctx.stroke();

        // Yellow track roller Bogie frame
        ctx.fillStyle = '#d69e2e';
        ctx.beginPath();
        ctx.roundRect(-17, -3, 34, 6, 2);
        ctx.fill();

        // Animated steel grouser treads
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 1.8;
        const treadShift = ((w.walkCycle || 0) * 5) % 8;
        for (let gx = -20 + treadShift; gx <= 20; gx += 8) {
          ctx.beginPath();
          ctx.moveTo(gx, -6);
          ctx.lineTo(gx, 6);
          ctx.stroke();
        }
        ctx.restore();
      };

      const drawDozerBlade = () => {
        // Twin hydraulic lift arms connecting chassis to front blade
        ctx.strokeStyle = '#b7791f';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          const armStartX = dirX * 8 + rightX * side * 15;
          const armStartY = (dirY * 8 + rightY * side * 15) * TILT_Y - 12 + rumble;
          const armEndX = dirX * 29 + rightX * side * 19;
          const armEndY = (dirY * 29 + rightY * side * 19) * TILT_Y - 11 + rumble;
          ctx.beginPath();
          ctx.moveTo(armStartX, armStartY);
          ctx.lineTo(armEndX, armEndY);
          ctx.stroke();
        }

        // Massive curved steel front Bulldozer Blade
        const bx = dirX * 31;
        const by = dirY * 31 * TILT_Y - 13 + rumble;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(bodyAngle);

        const bladeGrad = ctx.createLinearGradient(-4, -26, 8, 26);
        bladeGrad.addColorStop(0, '#718096');
        bladeGrad.addColorStop(0.5, '#cbd5e0');
        bladeGrad.addColorStop(1, '#2d3748');

        ctx.fillStyle = bladeGrad;
        ctx.strokeStyle = '#1a202c';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-4, -27);
        ctx.quadraticCurveTo(8, 0, -4, 27);
        ctx.lineTo(4, 29);
        ctx.quadraticCurveTo(14, 0, 4, -29);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Yellow-and-black hazard top lip on the blade
        ctx.strokeStyle = '#f6e05e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-2, -26);
        ctx.quadraticCurveTo(9, 0, -2, 26);
        ctx.stroke();

        ctx.restore();
      };

      // Depth-sort far track first
      if (rightY < 0) {
        drawDozerTrack(1);
      } else {
        drawDozerTrack(-1);
      }

      // If facing northward (away from camera), draw front blade behind chassis
      if (dirY < 0) {
        drawDozerBlade();
      }

      // Main Heavy Yellow Bulldozer Body & Engine Hood
      ctx.save();
      ctx.translate(0, -18 + rumble);
      ctx.rotate(bodyAngle);

      const bodyGrad = ctx.createLinearGradient(-22, -16, 22, 16);
      bodyGrad.addColorStop(0, '#b7791f');
      bodyGrad.addColorStop(0.45, '#f6e05e');
      bodyGrad.addColorStop(1, '#d69e2e');

      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = '#744210';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.roundRect(-22, -15, 44, 30, 6);
      ctx.fill();
      ctx.stroke();

      // Dark front radiator grille & vents
      ctx.fillStyle = '#1a202c';
      ctx.fillRect(14, -10, 6, 20);
      ctx.strokeStyle = '#4a5568';
      ctx.lineWidth = 1.4;
      for (let vy = -7; vy <= 7; vy += 3.5) {
        ctx.beginPath();
        ctx.moveTo(15, vy);
        ctx.lineTo(19, vy);
        ctx.stroke();
      }

      // Diesel Exhaust Stack on forward hood
      ctx.fillStyle = '#2d3748';
      ctx.strokeStyle = '#1a202c';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(9, -8, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Armored Operator Cab / ROPS Roll Cage Canopy
      ctx.fillStyle = '#2d3748';
      ctx.strokeStyle = '#1a202c';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.roundRect(-18, -12, 22, 24, 4);
      ctx.fill();
      ctx.stroke();

      // Tinted cab windshield glass
      ctx.fillStyle = 'rgba(99, 179, 237, 0.55)';
      ctx.beginPath();
      ctx.roundRect(-14, -9, 14, 18, 2);
      ctx.fill();

      // Yellow ROPS roof canopy + flashing amber warning beacon
      ctx.fillStyle = '#ecc94b';
      ctx.strokeStyle = '#744210';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(-16, -10, 18, 20, 3);
      ctx.fill();
      ctx.stroke();

      const beaconPulse = 0.55 + 0.45 * Math.sin(nowSecDozer * 16);
      ctx.fillStyle = `rgba(246, 173, 85, ${beaconPulse})`;
      ctx.beginPath();
      ctx.arc(-7, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fffaf0';
      ctx.beginPath();
      ctx.arc(-7, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Depth-sort near track
      if (rightY < 0) {
        drawDozerTrack(-1);
      } else {
        drawDozerTrack(1);
      }

      // If facing southward (towards camera), draw front blade in front of chassis
      if (dirY >= 0) {
        drawDozerBlade();
      }

      // Floating Name Tag & Bulldozer Countdown Bar
      const labelBaseY = -52 + rumble;
      ctx.font = '700 11px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillText(isLocal ? `${w.name} (BULLDOZER)` : `${w.name || 'Warrior'} (DOZER)`, 1, labelBaseY + 1);
      ctx.fillStyle = '#f6e05e';
      ctx.fillText(isLocal ? `${w.name} (BULLDOZER)` : `${w.name || 'Warrior'} (DOZER)`, 0, labelBaseY);

      const bw = 44;
      const bh = 4;
      const barY = labelBaseY + 6;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
      ctx.fillRect(-bw / 2 - 1, barY - 1, bw + 2, bh + 2);
      ctx.fillStyle = '#ecc94b';
      ctx.fillRect(-bw / 2, barY, bw * Math.max(0, Math.min(1, w.bulldozerTimer / BULLDOZER_DURATION)), bh);

      ctx.restore();
      return;
    }

    // 1b. Draw 2.5D Mount (Warhorse or visually larger War Elephant) beneath the riding warrior
    const drawMountHeadAndFront = () => {
      if (isHorse) {
        // Warhorse Neck, Head, Ears & Flowing Mane pointing in facing direction
        const neckBaseX = dirX * 13;
        const neckBaseY = dirY * 13 * TILT_Y - 14 - bob * 0.8;
        const headTipX = dirX * 26;
        const headTipY = dirY * 26 * TILT_Y - 25 - bob;
        const muzzleX = dirX * 32;
        const muzzleY = dirY * 32 * TILT_Y - 21 - bob;

        // Flowing dark mane along back of neck
        ctx.strokeStyle = '#2d170b';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(neckBaseX - dirX * 3, neckBaseY - 2);
        ctx.lineTo(headTipX - dirX * 4, headTipY - 3);
        ctx.stroke();

        // Muscular chestnut neck
        ctx.strokeStyle = w.hurtFlash > 0 ? '#fc8181' : '#8b4513';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(neckBaseX, neckBaseY);
        ctx.lineTo(headTipX, headTipY);
        ctx.stroke();

        // Horse head & muzzle
        ctx.fillStyle = w.hurtFlash > 0 ? '#feb2b2' : '#9c4221';
        ctx.strokeStyle = '#2d170b';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(
          (headTipX + muzzleX) * 0.5,
          (headTipY + muzzleY) * 0.5,
          7.5,
          4.8,
          Math.atan2(muzzleY - headTipY, muzzleX - headTipX),
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();

        // Golden bridle strap
        ctx.strokeStyle = '#ecc94b';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(headTipX, headTipY);
        ctx.lineTo(muzzleX - dirX * 2, muzzleY);
        ctx.stroke();

        // Pointed ears
        ctx.fillStyle = '#7b341e';
        ctx.beginPath();
        ctx.arc(headTipX - rightX * 3, headTipY - 5, 2.6, 0, Math.PI * 2);
        ctx.arc(headTipX + rightX * 3, headTipY - 5, 2.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (isTortoise) {
        // Giant Tortoise Wrinkled Neck & Rounded Reptilian Head poking out from the front shell opening
        const neckStartX = dirX * 15;
        const neckStartY = dirY * 15 * TILT_Y - 7 - bob * 0.4;
        const headX = dirX * 26;
        const headY = dirY * 26 * TILT_Y - 9 - bob * 0.5;

        // Thick scaly olive-green neck
        ctx.strokeStyle = w.hurtFlash > 0 ? '#fc8181' : '#2f855a';
        ctx.lineWidth = 8.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(neckStartX, neckStartY);
        ctx.lineTo(headX, headY);
        ctx.stroke();

        // Rounded tortoise head with beak-like snout
        ctx.fillStyle = w.hurtFlash > 0 ? '#feb2b2' : '#38a169';
        ctx.strokeStyle = '#1c4532';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(
          headX + dirX * 2,
          headY,
          7.2,
          5.4,
          Math.atan2(dirY * TILT_Y, dirX),
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();

        // Wise dark tortoise eyes on left & right of head
        ctx.fillStyle = '#1a202c';
        ctx.beginPath();
        ctx.arc(headX + dirX * 3 - rightX * 3.5, headY - 1.5, 1.5, 0, Math.PI * 2);
        ctx.arc(headX + dirX * 3 + rightX * 3.5, headY - 1.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (isElephant) {
        // War Elephant Massive Head, Flapping Ears, Swaying Trunk & Curved Ivory Tusks
        const headX = dirX * 24;
        const headY = dirY * 24 * TILT_Y - 24 - bob * 0.7;

        // Large flapping elephant ears on left & right of head
        const earFlap = Math.sin((w.walkCycle || 0) * 0.9) * 2.2;
        ctx.fillStyle = w.hurtFlash > 0 ? '#fc8181' : '#4a5568';
        ctx.strokeStyle = '#1a202c';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(
          headX - rightX * (15 + earFlap),
          headY - rightY * 12 * TILT_Y + 1,
          8.5,
          12,
          0.2,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(
          headX + rightX * (15 + earFlap),
          headY + rightY * 12 * TILT_Y + 1,
          8.5,
          12,
          -0.2,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();

        // Massive domed elephant head
        ctx.fillStyle = w.hurtFlash > 0 ? '#feb2b2' : '#718096';
        ctx.strokeStyle = '#1a202c';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(headX, headY, 14.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Royal gold & crimson war-frontlet on forehead
        ctx.fillStyle = '#c53030';
        ctx.strokeStyle = '#ecc94b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(headX + dirX * 5, headY - 3, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Twin curved white ivory tusks
        const drawTusk = (sideSign) => {
          const baseX = headX + dirX * 10 + rightX * sideSign * 8;
          const baseY = headY + dirY * 8 * TILT_Y + rightY * sideSign * 6 * TILT_Y + 4;
          const tipX = headX + dirX * 26 + rightX * sideSign * 11;
          const tipY = headY + dirY * 22 * TILT_Y + rightY * sideSign * 7 * TILT_Y - 3;
          ctx.strokeStyle = '#fffff0';
          ctx.lineWidth = 3.6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(baseX, baseY);
          ctx.quadraticCurveTo(
            (baseX + tipX) * 0.5 + dirX * 4,
            (baseY + tipY) * 0.5 + 6,
            tipX,
            tipY
          );
          ctx.stroke();
        };
        drawTusk(-1);
        drawTusk(1);

        // Swaying muscular trunk
        const trunkSway = Math.sin((w.walkCycle || 0) * 1.1) * 5;
        const trunkStartX = headX + dirX * 12;
        const trunkStartY = headY + dirY * 10 * TILT_Y + 2;
        const trunkEndX = headX + dirX * 25 + rightX * trunkSway;
        const trunkEndY = headY + dirY * 22 * TILT_Y + 14;
        ctx.strokeStyle = w.hurtFlash > 0 ? '#fc8181' : '#5a6778';
        ctx.lineWidth = 6.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(trunkStartX, trunkStartY);
        ctx.quadraticCurveTo(
          (trunkStartX + trunkEndX) * 0.5 + dirX * 4,
          (trunkStartY + trunkEndY) * 0.5 + 4,
          trunkEndX,
          trunkEndY
        );
        ctx.stroke();
      }
    };

    if (isHorse) {
      const gallop = Math.sin((w.walkCycle || 0) * 1.35) * 9;
      // 4 Galloping hooves/legs
      const legs = [
        { lx: dirX * 12 - rightX * 8 + dirX * gallop, ly: (dirY * 12 - rightY * 8) * TILT_Y },
        { lx: dirX * 12 + rightX * 8 - dirX * gallop, ly: (dirY * 12 + rightY * 8) * TILT_Y },
        { lx: -dirX * 12 - rightX * 8 - dirX * gallop, ly: (-dirY * 12 - rightY * 8) * TILT_Y },
        { lx: -dirX * 12 + rightX * 8 + dirX * gallop, ly: (-dirY * 12 + rightY * 8) * TILT_Y },
      ];
      ctx.strokeStyle = '#4a2511';
      ctx.lineWidth = 4.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < legs.length; i++) {
        ctx.beginPath();
        ctx.moveTo(legs[i].lx * 0.7, legs[i].ly * 0.7 - 12);
        ctx.lineTo(legs[i].lx, legs[i].ly + 2);
        ctx.stroke();
      }

      // Flowing horse tail at rear
      const tailWave = Math.sin((w.walkCycle || 0) * 1.8) * 5;
      ctx.strokeStyle = '#2d170b';
      ctx.lineWidth = 4.8;
      ctx.beginPath();
      ctx.moveTo(-dirX * 18, -dirY * 18 * TILT_Y - 14 - bob * 0.6);
      ctx.quadraticCurveTo(
        -dirX * 26 + rightX * tailWave,
        -dirY * 26 * TILT_Y - 8,
        -dirX * 28 + rightX * tailWave * 1.3,
        -dirY * 28 * TILT_Y + 1
      );
      ctx.stroke();

      if (dirY < 0) {
        drawMountHeadAndFront();
      }

      // Chestnut Warhorse Barrel / Body
      const bodyAngle = Math.atan2(dirY * TILT_Y, dirX);
      ctx.fillStyle = w.hurtFlash > 0 ? '#fc8181' : '#8b4513';
      ctx.strokeStyle = '#2d170b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -13 - bob * 0.7, 21, 12.5, bodyAngle, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Golden-trimmed saddle cloth
      ctx.fillStyle = w.capeColor || '#742a2a';
      ctx.strokeStyle = '#ecc94b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, -15 - bob * 0.7, 12, 8.5, bodyAngle, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (isTortoise) {
      const slowStep = Math.sin((w.walkCycle || 0) * 1.1) * 4.5;
      // 4 Sturdy Scaled Tortoise Legs with Claws
      const legs = [
        { lx: dirX * 14 - rightX * 14 + dirX * slowStep, ly: (dirY * 14 - rightY * 14) * TILT_Y },
        { lx: dirX * 14 + rightX * 14 - dirX * slowStep, ly: (dirY * 14 + rightY * 14) * TILT_Y },
        { lx: -dirX * 14 - rightX * 14 - dirX * slowStep, ly: (-dirY * 14 - rightY * 14) * TILT_Y },
        { lx: -dirX * 14 + rightX * 14 + dirX * slowStep, ly: (-dirY * 14 + rightY * 14) * TILT_Y },
      ];
      for (let i = 0; i < legs.length; i++) {
        ctx.fillStyle = '#2f855a';
        ctx.strokeStyle = '#1c4532';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(legs[i].lx, legs[i].ly - 3, 5.8, 4.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Pale tortoise claws on the front of each foot
        ctx.fillStyle = '#fefcbf';
        ctx.beginPath();
        ctx.arc(legs[i].lx + dirX * 4.5, legs[i].ly - 2, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Short pointed tortoise tail at the rear
      ctx.strokeStyle = '#276749';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-dirX * 18, -dirY * 18 * TILT_Y - 6);
      ctx.lineTo(-dirX * 25, -dirY * 25 * TILT_Y - 3);
      ctx.stroke();

      if (dirY < 0) {
        drawMountHeadAndFront();
      }

      // 3D Domed Giant Tortoise Carapace (Shell)
      const bodyAngle = Math.atan2(dirY * TILT_Y, dirX);

      // Golden-tan bottom plastron / marginal rim of the shell
      ctx.fillStyle = '#d69e2e';
      ctx.strokeStyle = '#744210';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, -8 - bob * 0.4, 24.5, 16.5, bodyAngle, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // High-domed emerald & forest-green armored tortoise shell
      const shellGrad = ctx.createRadialGradient(-5, -18 - bob * 0.4, 3, 0, -13 - bob * 0.4, 25);
      shellGrad.addColorStop(0, '#68d391');
      shellGrad.addColorStop(0.55, '#2f855a');
      shellGrad.addColorStop(1, '#1c4532');

      ctx.fillStyle = w.hurtFlash > 0 ? '#fc8181' : shellGrad;
      ctx.strokeStyle = '#143325';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, -13 - bob * 0.4, 22.5, 15, bodyAngle, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Hexagonal scute plate seams across the tortoise carapace
      ctx.save();
      ctx.translate(0, -13 - bob * 0.4);
      ctx.rotate(bodyAngle);
      ctx.strokeStyle = 'rgba(20, 51, 37, 0.72)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 7.5, 0, 0, Math.PI * 2);
      for (let s = 0; s < 6; s++) {
        const sAng = (s * Math.PI) / 3;
        ctx.moveTo(Math.cos(sAng) * 12, Math.sin(sAng) * 7.5);
        ctx.lineTo(Math.cos(sAng) * 22, Math.sin(sAng) * 14.5);
      }
      ctx.stroke();
      ctx.restore();

      // Saddle cushion on top of the tortoise shell
      ctx.fillStyle = w.capeColor || '#742a2a';
      ctx.strokeStyle = '#ecc94b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, -16 - bob * 0.4, 11, 8, bodyAngle, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (isElephant) {
      const stomp = Math.sin((w.walkCycle || 0) * 0.85) * 6.5;
      // 4 Thick pillar legs
      const legs = [
        { lx: dirX * 16 - rightX * 14 + dirX * stomp, ly: (dirY * 16 - rightY * 14) * TILT_Y },
        { lx: dirX * 16 + rightX * 14 - dirX * stomp, ly: (dirY * 16 + rightY * 14) * TILT_Y },
        { lx: -dirX * 16 - rightX * 14 - dirX * stomp, ly: (-dirY * 16 - rightY * 14) * TILT_Y },
        { lx: -dirX * 16 + rightX * 14 + dirX * stomp, ly: (-dirY * 16 + rightY * 14) * TILT_Y },
      ];
      for (let i = 0; i < legs.length; i++) {
        ctx.fillStyle = '#4a5568';
        ctx.strokeStyle = '#1a202c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(legs[i].lx - 5.5, legs[i].ly - 18, 11, 21, 4);
        ctx.fill();
        ctx.stroke();
      }

      if (dirY < 0) {
        drawMountHeadAndFront();
      }

      // Massive Slate-Gray War Elephant Body
      const bodyAngle = Math.atan2(dirY * TILT_Y, dirX);
      const eleGrad = ctx.createRadialGradient(-5, -24 - bob * 0.6, 5, 0, -20 - bob * 0.6, 34);
      eleGrad.addColorStop(0, '#a0aec0');
      eleGrad.addColorStop(0.6, '#718096');
      eleGrad.addColorStop(1, '#2d3748');

      ctx.fillStyle = w.hurtFlash > 0 ? '#fc8181' : eleGrad;
      ctx.strokeStyle = '#1a202c';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, -20 - bob * 0.6, 31, 20, bodyAngle, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Ornate crimson & gold war-howdah blanket on elephant's back
      ctx.fillStyle = w.capeColor || '#742a2a';
      ctx.strokeStyle = '#ecc94b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -24 - bob * 0.6, 18, 13, bodyAngle, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Lift the warrior vertically (-Y in 2.5D screen space) when seated on a Horse or Elephant
    ctx.save();
    ctx.translate(0, -mountLift);

    // 2. Cape (drawn behind torso when facing south/front, or in front when facing north/away)
    const drawCape = () => {
      const capeWave = Math.sin((w.walkCycle || 0) * 1.5) * Math.min(5, speed * 0.025);
      const attachX = -dirX * 5;
      const attachY = -dirY * 5 * TILT_Y - 25 - bob;
      const hemX = -dirX * 18 + rightX * capeWave;
      const hemY = -dirY * 18 * TILT_Y + 2;

      ctx.fillStyle = w.capeColor || '#742a2a';
      ctx.strokeStyle = '#1a120d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(attachX - rightX * 11, attachY);
      ctx.lineTo(attachX + rightX * 11, attachY);
      ctx.quadraticCurveTo(hemX + rightX * 14, (attachY + hemY) * 0.5, hemX + rightX * 12, hemY);
      ctx.lineTo(hemX - rightX * 12, hemY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    if (dirY >= -0.15) {
      drawCape();
    }

    // 3. Striding 3D Armored Boots (or Stirrup Boots when mounted)
    const stride = isHorse || isTortoise || isElephant ? 0 : Math.sin(w.walkCycle || 0) * 7.5;
    const footSpread = isElephant ? 13 : isTortoise ? 11.5 : isHorse ? 10.5 : 7;
    const foot1X = rightX * footSpread + dirX * stride;
    const foot1Y = (rightY * footSpread + dirY * stride) * TILT_Y;
    const foot2X = -rightX * footSpread - dirX * stride;
    const foot2Y = (-rightY * footSpread - dirY * stride) * TILT_Y;

    ctx.fillStyle = '#3d271d';
    ctx.strokeStyle = '#1a120d';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(foot1X, foot1Y, 6, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(foot2X, foot2Y, 6, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 4. Upright 3D Armored Torso / Cuirass Cylinder (rising from z=5 to z=27)
    const torsoGrad = ctx.createLinearGradient(-14, 0, 14, 0);
    if (w.hurtFlash > 0) {
      torsoGrad.addColorStop(0, '#fc8181');
      torsoGrad.addColorStop(0.5, '#fed7d7');
      torsoGrad.addColorStop(1, '#c53030');
    } else {
      torsoGrad.addColorStop(0, '#4a5568');
      torsoGrad.addColorStop(0.45, w.color || '#a0aec0');
      torsoGrad.addColorStop(1, '#2d3748');
    }

    ctx.fillStyle = torsoGrad;
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-13, -27 - bob, 26, 22, 7);
    ctx.fill();
    ctx.stroke();

    // Gold war-belt around waist
    ctx.fillStyle = '#d69e2e';
    ctx.fillRect(-13, -11 - bob, 26, 4);

    // 5. 3D Shoulder Pauldrons (depth-ordered by shoulder Y)
    const leftShX = -rightX * 14;
    const leftShY = -rightY * 14 * TILT_Y - 23 - bob;
    const rightShX = rightX * 14;
    const rightShY = rightY * 14 * TILT_Y - 23 - bob;

    const drawPauldron = (px, py) => {
      ctx.fillStyle = w.hurtFlash > 0 ? '#fc8181' : '#718096';
      ctx.strokeStyle = '#1a202c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(px, py, 8.5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = w.plumeColor || '#ecc94b';
      ctx.beginPath();
      ctx.arc(px, py - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    };

    if (leftShY < rightShY) {
      drawPauldron(leftShX, leftShY);
      drawPauldron(rightShX, rightShY);
    } else {
      drawPauldron(rightShX, rightShY);
      drawPauldron(leftShX, leftShY);
    }

    if (dirY < -0.15) {
      drawCape();
    }

    // 6. 3D Knight Helmet & Crest at z = 35
    const headX = dirX * 2;
    const headY = dirY * 2 * TILT_Y - 34 - bob;

    const helmGrad = ctx.createRadialGradient(headX - 3, headY - 4, 2, headX, headY, 13);
    helmGrad.addColorStop(0, '#e2e8f0');
    helmGrad.addColorStop(0.6, '#718096');
    helmGrad.addColorStop(1, '#2d3748');

    ctx.fillStyle = w.hurtFlash > 0 ? '#feb2b2' : helmGrad;
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(headX, headY, 11.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Glowing Visor Slit (visible when facing sideways or southward)
    if (dirY > -0.65) {
      const visorX = headX + dirX * 7;
      const visorY = headY + dirY * 5 * TILT_Y + 1;
      ctx.strokeStyle = '#1a202c';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(visorX - rightX * 5, visorY - rightY * 3 * TILT_Y);
      ctx.lineTo(visorX + dirX * 2.5, visorY + dirY * 2 * TILT_Y);
      ctx.lineTo(visorX + rightX * 5, visorY + rightY * 3 * TILT_Y);
      ctx.stroke();
    }

    // 3D Helmet Plume / Crest pointing along facing angle
    ctx.fillStyle = w.plumeColor || '#ecc94b';
    ctx.strokeStyle = '#975a16';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(headX + dirX * 11, headY + dirY * 7 * TILT_Y - 2);
    ctx.quadraticCurveTo(headX, headY - 12, headX - dirX * 11, headY - dirY * 7 * TILT_Y - 3);
    ctx.lineTo(headX - dirX * 7, headY - dirY * 4 * TILT_Y + 1);
    ctx.lineTo(headX + dirX * 8, headY + dirY * 5 * TILT_Y + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore(); // End warrior saddle lift

    // Draw mount head in front of rider when facing southward (towards camera)
    if ((isHorse || isTortoise || isElephant) && dirY >= 0) {
      drawMountHeadAndFront();
    }

    // Floating Name Tag & Health Bar (plus Mount HP Bar when mounted)
    const labelBaseY = -56 - mountLift - bob;
    if (!isLocal || remotePlayers.length > 0 || isHorse || isTortoise || isElephant) {
      if (!isLocal || remotePlayers.length > 0) {
        ctx.font = '700 11px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillText(isLocal ? `${w.name} (YOU)` : w.name || 'Warrior', 1, labelBaseY + 1);
        ctx.fillStyle = isLocal ? '#f6e05e' : w.color || '#63b3ed';
        ctx.fillText(isLocal ? `${w.name} (YOU)` : w.name || 'Warrior', 0, labelBaseY);
      }

      if (isHorse || isTortoise || isElephant) {
        const bw = isElephant ? 44 : 36;
        const bh = 4;
        const barY = labelBaseY + 6;
        const mountMax = Math.max(1, w.mountMaxHp || w.mountHp || 100);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(-bw / 2 - 1, barY - 1, bw + 2, bh + 2);
        ctx.fillStyle = isElephant ? '#63b3ed' : isTortoise ? '#68d391' : '#f6ad55';
        ctx.fillRect(-bw / 2, barY, bw * Math.max(0, Math.min(1, w.mountHp / mountMax)), bh);
      }

      if (!isLocal && w.hp < (w.maxHp || 100)) {
        const bw = 34;
        const bh = 4;
        const hpBarY = labelBaseY + (isHorse || isTortoise || isElephant ? 12 : 6);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(-bw / 2 - 1, hpBarY - 1, bw + 2, bh + 2);
        ctx.fillStyle = '#48bb78';
        ctx.fillRect(-bw / 2, hpBarY, bw * Math.max(0, w.hp / (w.maxHp || 100)), bh);
      }
    }

    ctx.restore();
  }

  function drawStoneColumn(col) {
    const sx = col.x;
    const sy = col.y * TILT_Y;
    const r = col.radius;
    const ry = r * TILT_Y;
    const h = col.height || 76;

    ctx.save();
    ctx.translate(sx, sy);

    // 1. Foreshortened 2.5D Ground Shadow cast by the tall pillar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(9, 6, r * 1.25, ry * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Stepped Stone Plinth / Pedestal Base (z = 0 to z = 11)
    const baseRx = r * 1.08;
    const baseRy = ry * 1.08;
    const baseH = 11;
    const baseGrad = ctx.createLinearGradient(-baseRx, 0, baseRx, 0);
    baseGrad.addColorStop(0, '#4a5568');
    baseGrad.addColorStop(0.35, '#a0aec0');
    baseGrad.addColorStop(1, '#2d3748');

    ctx.fillStyle = baseGrad;
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, baseRx, baseRy, 0, 0, Math.PI);
    ctx.lineTo(-baseRx, -baseH);
    ctx.ellipse(0, -baseH, baseRx, baseRy, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Plinth top rim
    ctx.fillStyle = '#718096';
    ctx.beginPath();
    ctx.ellipse(0, -baseH, baseRx, baseRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 3. Tall Fluted Cylindrical Stone Shaft (z = 10 to z = h - 10)
    const shaftRx = r * 0.88;
    const shaftRy = ry * 0.88;
    const shaftBotY = -baseH + 1;
    const shaftTopY = -h + 10;

    const shaftGrad = ctx.createLinearGradient(-shaftRx, 0, shaftRx, 0);
    shaftGrad.addColorStop(0, '#4a5568');
    shaftGrad.addColorStop(0.28, '#cbd5e0');
    shaftGrad.addColorStop(0.65, '#718096');
    shaftGrad.addColorStop(1, '#2d3748');

    ctx.fillStyle = shaftGrad;
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, shaftBotY, shaftRx, shaftRy, 0, 0, Math.PI);
    ctx.lineTo(-shaftRx, shaftTopY);
    ctx.ellipse(0, shaftTopY, shaftRx, shaftRy, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Vertical fluting grooves & horizontal stone drum seams along the shaft
    ctx.strokeStyle = 'rgba(26, 32, 44, 0.38)';
    ctx.lineWidth = 1.5;
    for (let f = -3; f <= 3; f++) {
      const fx = (f / 4) * shaftRx * 0.88;
      const fyOffset = Math.sqrt(Math.max(0, 1 - Math.pow(fx / shaftRx, 2))) * shaftRy;
      ctx.beginPath();
      ctx.moveTo(fx, shaftBotY + fyOffset - 2);
      ctx.lineTo(fx, shaftTopY + fyOffset + 2);
      ctx.stroke();
    }

    // Horizontal masonry drum rings
    for (let ringFrac of [0.35, 0.68]) {
      const ringY = shaftBotY + (shaftTopY - shaftBotY) * ringFrac;
      ctx.beginPath();
      ctx.ellipse(0, ringY, shaftRx, shaftRy, 0, 0, Math.PI);
      ctx.stroke();
    }

    // 4. Carved Stone Capital / Crown at top of column (z = h - 10 to z = h)
    const capRx = r * 1.04;
    const capRy = ry * 1.04;
    const capBotY = shaftTopY;
    const capTopY = -h;

    ctx.fillStyle = baseGrad;
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, capBotY, capRx, capRy, 0, 0, Math.PI);
    ctx.lineTo(-capRx, capTopY);
    ctx.ellipse(0, capTopY, capRx, capRy, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Top sunlit stone face of the column
    const topGrad = ctx.createRadialGradient(-capRx * 0.25, capTopY - capRy * 0.2, 3, 0, capTopY, capRx);
    topGrad.addColorStop(0, '#e2e8f0');
    topGrad.addColorStop(0.65, '#a0aec0');
    topGrad.addColorStop(1, '#718096');

    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.ellipse(0, capTopY, capRx, capRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Subtle carved inner ring on the top stone face
    ctx.strokeStyle = 'rgba(45, 55, 72, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, capTopY, capRx * 0.68, capRy * 0.68, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function drawHammer(h = hammer, trail = hammer.trail) {
    const massScale = Math.min(
      2.35,
      1 + Math.max(0, (h.mass || INITIAL_HAMMER_MASS) - INITIAL_HAMMER_MASS) * 0.18
    );
    const hammerZ = 16 + (massScale - 1) * 6;
    const coreRadius = 15.5 * massScale;
    const spikeCount = 8;

    const isFlaming = (h.flameTimer || 0) > 0;
    const isDisco = (h.discoTimer || 0) > 0;
    const isJackOLantern = !isDisco && (h.jackolanternTimer || 0) > 0;
    const isSpider = !isDisco && !isJackOLantern && !!h.isSpider;
    const nowSec = performance.now() * 0.001;
    const discoPalette = ['#f687b3', '#63b3ed', '#f6e05e', '#68d391', '#b794f4', '#ffffff'];

    // 1. 2.5D Motion Blur Afterimages of the Spikey Mace (skipped in Low quality tier)
    if (visualQualityTier > QUALITY_TIER_LOW && Array.isArray(trail)) {
      for (let i = 0; i < trail.length; i++) {
        const tr = trail[i];
        ctx.save();
        ctx.globalAlpha = Math.max(
          0,
          tr.alpha *
            (isDisco
              ? 0.56
              : isJackOLantern
              ? 0.48
              : isSpider
              ? 0.46
              : isFlaming
              ? 0.52
              : 0.34)
        );
        ctx.translate(tr.x, tr.y * TILT_Y - hammerZ);
        ctx.fillStyle = isDisco
          ? discoPalette[i % discoPalette.length]
          : isJackOLantern
          ? i % 2 === 0
            ? '#ed8936'
            : '#f6e05e'
          : isSpider
          ? i % 2 === 0
            ? '#ffffff'
            : '#2d3748'
          : isFlaming
          ? i % 2 === 0
            ? '#ff6b35'
            : '#f6e05e'
          : '#cbd5e0';
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          coreRadius * (isDisco || isJackOLantern || isFlaming ? 1.08 : 0.95),
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }
    }

    const sx = h.x;
    const syGround = h.y * TILT_Y;

    // If transformed into a Disco Ball for 20s, render the 3D Mirrored Disco Ball & Rotating Floor Spotlights!
    if (isDisco) {
      // A. Ground shadow & rotating colored disco floor spotlights on the grass (z = 0)
      ctx.save();
      ctx.translate(sx, syGround);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(3, 3, coreRadius * 1.15, coreRadius * TILT_Y * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();

      const beamCount = 6;
      for (let b = 0; b < beamCount; b++) {
        const beamAng = nowSec * 2.8 + (b * Math.PI * 2) / beamCount;
        const beamDist = coreRadius * 2.1 + Math.sin(nowSec * 4 + b) * 5;
        const spotX = Math.cos(beamAng) * beamDist;
        const spotY = Math.sin(beamAng) * beamDist * TILT_Y;
        const col = discoPalette[b % discoPalette.length];

        // Translucent light ray cone from elevated disco ball down to turf spot
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 4.5 * massScale;
        ctx.beginPath();
        ctx.moveTo(0, -hammerZ);
        ctx.lineTo(spotX, spotY);
        ctx.stroke();

        // Glowing colored spotlight oval on the grass
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.48;
        ctx.beginPath();
        ctx.ellipse(spotX, spotY, 7.5 * massScale, 7.5 * TILT_Y * massScale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // B. 3D Mirrored Disco Ball Sphere at height hammerZ
      const ballR = coreRadius * 1.18;
      ctx.save();
      ctx.translate(sx, syGround - hammerZ);

      // Outer shimmering disco halo
      const haloGrad = ctx.createRadialGradient(0, 0, ballR * 0.6, 0, 0, ballR * 1.65);
      haloGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
      haloGrad.addColorStop(0.55, 'rgba(246, 135, 179, 0.28)');
      haloGrad.addColorStop(1, 'rgba(99, 179, 237, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(0, 0, ballR * 1.65, 0, Math.PI * 2);
      ctx.fill();

      // Base metallic silver sphere
      const sphereGrad = ctx.createRadialGradient(
        -ballR * 0.3,
        -ballR * 0.3,
        ballR * 0.1,
        0,
        0,
        ballR
      );
      sphereGrad.addColorStop(0, '#ffffff');
      sphereGrad.addColorStop(0.45, '#cbd5e0');
      sphereGrad.addColorStop(0.82, '#4a5568');
      sphereGrad.addColorStop(1, '#1a202c');

      ctx.fillStyle = sphereGrad;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, ballR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Clip to sphere interior to draw rotating latitude/longitude mirror facet tiles
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, ballR - 1, 0, Math.PI * 2);
      ctx.clip();

      const latRows = 5;
      const lonCols = 7;
      const spinPhase = nowSec * 3.6 + h.angle * 0.5;
      for (let r = 0; r < latRows; r++) {
        const latNorm = (r + 0.5) / latRows - 0.5; // -0.4 to +0.4
        const rowY = latNorm * ballR * 1.85;
        const rowH = (ballR * 1.75) / latRows;
        const ringWidth = Math.sqrt(Math.max(0.05, 1 - latNorm * latNorm * 3.1)) * ballR;

        for (let c = 0; c < lonCols; c++) {
          const lonPhase = ((c / lonCols + spinPhase * 0.22) % 1 + 1) % 1; // 0..1 across front hemisphere
          const lonAng = (lonPhase - 0.5) * Math.PI;
          const tileX = Math.sin(lonAng) * ringWidth;
          const tileW = Math.max(2.2, Math.cos(lonAng) * ((ringWidth * 2.5) / lonCols));

          const shimmerVal = Math.sin(nowSec * 9 + r * 2.7 + c * 4.1);
          if (shimmerVal > 0.55) {
            ctx.fillStyle = '#ffffff';
          } else if (shimmerVal > 0.1) {
            ctx.fillStyle = discoPalette[(r * 3 + c) % discoPalette.length];
          } else if (shimmerVal > -0.35) {
            ctx.fillStyle = '#e2e8f0';
          } else {
            ctx.fillStyle = '#718096';
          }

          ctx.fillRect(tileX - tileW * 0.45, rowY - rowH * 0.44, tileW * 0.9, rowH * 0.86);
        }
      }
      ctx.restore();

      // Crisp 4-point star sparkles glinting on the disco ball
      const drawSparkle = (gx, gy, sr) => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(gx, gy - sr);
        ctx.lineTo(gx + sr * 0.28, gy - sr * 0.28);
        ctx.lineTo(gx + sr, gy);
        ctx.lineTo(gx + sr * 0.28, gy + sr * 0.28);
        ctx.lineTo(gx, gy + sr);
        ctx.lineTo(gx - sr * 0.28, gy + sr * 0.28);
        ctx.lineTo(gx - sr, gy);
        ctx.lineTo(gx - sr * 0.28, gy - sr * 0.28);
        ctx.closePath();
        ctx.fill();
      };
      const glintPulse = 0.65 + 0.35 * Math.sin(nowSec * 14);
      drawSparkle(-ballR * 0.36, -ballR * 0.34, 6.5 * massScale * glintPulse);
      drawSparkle(ballR * 0.42, ballR * 0.22, 5.0 * massScale * (1.3 - glintPulse * 0.5));

      ctx.restore();
      return;
    }

    // If transformed into a Jack-o'-Lantern for 60s, render the 3D Carved Glowing Pumpkin Head!
    if (isJackOLantern) {
      const pumpkinRx = coreRadius * 1.32;
      const pumpkinRy = coreRadius * 1.12;
      const candleFlicker =
        0.88 + 0.12 * Math.sin(nowSec * 19 + h.x * 0.05) * Math.cos(nowSec * 11);

      // A. Ground shadow & warm flickering candlelight pool on the grass (z = 0)
      ctx.save();
      ctx.translate(sx, syGround);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath();
      ctx.ellipse(3, 3, pumpkinRx * 1.08, pumpkinRx * TILT_Y * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(246, 173, 85, ${(0.28 * candleFlicker).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(0, 1, pumpkinRx * 1.48, pumpkinRx * TILT_Y * 1.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // B. Bomb Armed or Flaming Hammer Aura around the Jack-o'-Lantern if armed
      if (h.bombCharges > 0 || isFlaming) {
        ctx.save();
        ctx.translate(sx, syGround - hammerZ);
        ctx.fillStyle = isFlaming ? 'rgba(255, 87, 34, 0.34)' : 'rgba(246, 173, 85, 0.34)';
        ctx.strokeStyle = isFlaming ? '#ff6b35' : '#f6ad55';
        ctx.lineWidth = 2.2;
        const auraR = pumpkinRx + 11 * massScale;
        ctx.beginPath();
        ctx.ellipse(0, 0, auraR, auraR * TILT_Y, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // C. 3D Ribbed Pumpkin Body, Stem, and Carved Candle-Lit Face at height hammerZ
      ctx.save();
      ctx.translate(sx, syGround - hammerZ);

      // Warm outer Halloween lantern glow halo
      const lanternHalo = ctx.createRadialGradient(
        0,
        0,
        pumpkinRx * 0.45,
        0,
        0,
        pumpkinRx * 1.55
      );
      lanternHalo.addColorStop(0, `rgba(254, 240, 138, ${(0.38 * candleFlicker).toFixed(2)})`);
      lanternHalo.addColorStop(0.55, `rgba(237, 137, 54, ${(0.22 * candleFlicker).toFixed(2)})`);
      lanternHalo.addColorStop(1, 'rgba(237, 137, 54, 0)');
      ctx.fillStyle = lanternHalo;
      ctx.beginPath();
      ctx.arc(0, 0, pumpkinRx * 1.55, 0, Math.PI * 2);
      ctx.fill();

      // Base pumpkin gourd silhouette (outer ribs)
      const gourdGrad = ctx.createRadialGradient(
        -pumpkinRx * 0.28,
        -pumpkinRy * 0.32,
        pumpkinRx * 0.12,
        0,
        0,
        pumpkinRx * 1.05
      );
      gourdGrad.addColorStop(0, '#fbd38d');
      gourdGrad.addColorStop(0.32, '#ed8936');
      gourdGrad.addColorStop(0.76, '#c05621');
      gourdGrad.addColorStop(1, '#7b341e');

      ctx.fillStyle = gourdGrad;
      ctx.strokeStyle = '#652b19';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, pumpkinRx, pumpkinRy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 3D Vertical Pumpkin Lobes / Ribs (drawn from outer to center for volumetric roundness)
      const lobeFactors = [0.76, 0.42];
      for (let l = 0; l < lobeFactors.length; l++) {
        const lf = lobeFactors[l];
        ctx.strokeStyle = 'rgba(101, 43, 25, 0.65)';
        ctx.lineWidth = 1.6 * massScale;
        ctx.beginPath();
        ctx.ellipse(0, 0, pumpkinRx * lf, pumpkinRy * 0.99, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Twisted Woody Green Pumpkin Stem on top (-z)
      ctx.fillStyle = '#276749';
      ctx.strokeStyle = '#1c4532';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-3.4 * massScale, -pumpkinRy * 0.88);
      ctx.quadraticCurveTo(
        -1.5 * massScale,
        -pumpkinRy * 1.38,
        4.2 * massScale,
        -pumpkinRy * 1.44
      );
      ctx.lineTo(5.6 * massScale, -pumpkinRy * 1.24);
      ctx.quadraticCurveTo(
        1.8 * massScale,
        -pumpkinRy * 1.15,
        3.4 * massScale,
        -pumpkinRy * 0.88
      );
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Curly green pumpkin vine tendril beside the stem
      ctx.strokeStyle = '#48bb78';
      ctx.lineWidth = 1.5 * massScale;
      ctx.beginPath();
      ctx.moveTo(2.2 * massScale, -pumpkinRy * 0.95);
      ctx.bezierCurveTo(
        7.5 * massScale,
        -pumpkinRy * 1.25,
        9.5 * massScale,
        -pumpkinRy * 0.72,
        5.5 * massScale,
        -pumpkinRy * 0.78
      );
      ctx.stroke();

      // Slight horizontal turn of the carved face based on hammer swing angle
      const faceShiftX = Math.cos(h.angle) * pumpkinRx * 0.12;
      const faceShiftY = Math.sin(h.angle) * pumpkinRy * 0.06;

      const candleGrad = ctx.createRadialGradient(
        faceShiftX,
        faceShiftY,
        1,
        faceShiftX,
        faceShiftY,
        pumpkinRx * 0.75
      );
      candleGrad.addColorStop(0, '#ffffff');
      candleGrad.addColorStop(0.38, '#fef08a');
      candleGrad.addColorStop(0.78, '#f6ad55');
      candleGrad.addColorStop(1, '#dd6b20');

      // Carved Triangular Eyes (dark carved rind bevel + glowing candle-lit interior)
      const eyeY = -pumpkinRy * 0.22 + faceShiftY;
      const eyeOffsetX = pumpkinRx * 0.36;
      const eyeW = pumpkinRx * 0.25;
      const eyeH = pumpkinRy * 0.32;

      for (const side of [-1, 1]) {
        const ex = faceShiftX + side * eyeOffsetX;
        ctx.fillStyle = candleGrad;
        ctx.strokeStyle = '#5c2309';
        ctx.lineWidth = 1.6 * massScale;
        ctx.beginPath();
        ctx.moveTo(ex - side * eyeW * 0.95, eyeY + eyeH * 0.42);
        ctx.lineTo(ex + side * eyeW * 0.85, eyeY + eyeH * 0.22);
        ctx.lineTo(ex - side * eyeW * 0.12, eyeY - eyeH * 0.68);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Carved Triangular Nose in center
      const noseY = faceShiftY + pumpkinRy * 0.02;
      const noseW = pumpkinRx * 0.14;
      const noseH = pumpkinRy * 0.2;
      ctx.fillStyle = candleGrad;
      ctx.strokeStyle = '#5c2309';
      ctx.lineWidth = 1.4 * massScale;
      ctx.beginPath();
      ctx.moveTo(faceShiftX, noseY - noseH * 0.65);
      ctx.lineTo(faceShiftX + noseW, noseY + noseH * 0.55);
      ctx.lineTo(faceShiftX - noseW, noseY + noseH * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Carved Jagged Toothy Jack-o'-Lantern Grin
      const mouthX = faceShiftX;
      const mouthY = faceShiftY + pumpkinRy * 0.34;
      const mw = pumpkinRx * 0.66;
      const mh = pumpkinRy * 0.32;

      ctx.fillStyle = candleGrad;
      ctx.strokeStyle = '#5c2309';
      ctx.lineWidth = 1.6 * massScale;
      ctx.beginPath();
      // Upper lip with 2 carved fang notches
      ctx.moveTo(mouthX - mw, mouthY - mh * 0.45);
      ctx.lineTo(mouthX - mw * 0.52, mouthY - mh * 0.12);
      ctx.lineTo(mouthX - mw * 0.38, mouthY + mh * 0.24);
      ctx.lineTo(mouthX - mw * 0.18, mouthY - mh * 0.06);
      ctx.lineTo(mouthX + mw * 0.18, mouthY - mh * 0.06);
      ctx.lineTo(mouthX + mw * 0.38, mouthY + mh * 0.24);
      ctx.lineTo(mouthX + mw * 0.52, mouthY - mh * 0.12);
      ctx.lineTo(mouthX + mw, mouthY - mh * 0.45);
      // Lower jagged jaw with bottom tooth notch
      ctx.lineTo(mouthX + mw * 0.68, mouthY + mh * 0.52);
      ctx.lineTo(mouthX + mw * 0.18, mouthY + mh * 0.72);
      ctx.lineTo(mouthX, mouthY + mh * 0.32);
      ctx.lineTo(mouthX - mw * 0.18, mouthY + mh * 0.72);
      ctx.lineTo(mouthX - mw * 0.68, mouthY + mh * 0.52);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // If also Flaming, draw roaring flames around the Jack-o'-Lantern
      if (isFlaming) {
        const flameTongues = 8;
        for (let f = 0; f < flameTongues; f++) {
          const phase = nowSec * 14 + f * 1.35;
          const spreadAng = (f / flameTongues) * Math.PI * 2 + Math.sin(phase * 0.7) * 0.2;
          const baseR = pumpkinRx * (0.55 + 0.25 * Math.sin(phase));
          const bx = Math.cos(spreadAng) * baseR;
          const by = Math.sin(spreadAng) * baseR * TILT_Y;
          const flameH = (14 + Math.sin(phase * 1.3) * 6) * massScale;
          const swayX = Math.sin(phase * 1.7 + f) * 4.5;
          const w = (5.2 + Math.cos(phase) * 1.5) * massScale;

          ctx.fillStyle = f % 2 === 0 ? 'rgba(255, 87, 34, 0.86)' : 'rgba(246, 140, 85, 0.84)';
          ctx.beginPath();
          ctx.moveTo(bx - w, by);
          ctx.quadraticCurveTo(
            bx - w * 0.4 + swayX * 0.5,
            by - flameH * 0.55,
            bx + swayX,
            by - flameH
          );
          ctx.quadraticCurveTo(
            bx + w * 0.4 + swayX * 0.5,
            by - flameH * 0.55,
            bx + w,
            by
          );
          ctx.closePath();
          ctx.fill();
        }
      }

      ctx.restore();
      return;
    }

    // If transformed into a Spider Hammer, render a 2.5D Giant Black Widow Spider with 8 articulated legs & web silk!
    if (isSpider) {
      const spiderScale = massScale;
      const skitterPhase = nowSec * 18 + (h.x + h.y) * 0.04;

      // A. Ground Shadow with 8 splayed leg shadows on the grass (z = 0)
      ctx.save();
      ctx.translate(sx + 3, syGround + 3);
      ctx.scale(1, TILT_Y);
      ctx.rotate(h.angle);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath();
      ctx.ellipse(-3 * spiderScale, 0, 15 * spiderScale, 11 * spiderScale, 0, 0, Math.PI * 2);
      ctx.arc(10 * spiderScale, 0, 8 * spiderScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // B. Bomb Armed or Flaming Aura around the Spider Hammer if armed
      if (h.bombCharges > 0 || isFlaming) {
        ctx.save();
        ctx.translate(sx, syGround - hammerZ);
        ctx.fillStyle = isFlaming ? 'rgba(255, 87, 34, 0.34)' : 'rgba(246, 173, 85, 0.34)';
        ctx.strokeStyle = isFlaming ? '#ff6b35' : '#f6ad55';
        ctx.lineWidth = 2.2;
        const auraR = coreRadius * 1.65;
        ctx.beginPath();
        ctx.ellipse(0, 0, auraR, auraR * TILT_Y, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // C. 3D Giant Spider Body, 8 Articulated Legs, Fangs, Red Hourglass & Web Strands at height hammerZ
      ctx.save();
      ctx.translate(sx, syGround - hammerZ);

      // Subtle glistening white spiderweb aura behind the spider
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.lineWidth = 1.2 * spiderScale;
      ctx.beginPath();
      ctx.ellipse(0, 0, coreRadius * 1.45, coreRadius * 1.45 * TILT_Y, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.save();
      ctx.scale(1, 0.88);
      ctx.rotate(h.angle);

      // 1. Eight 3D Articulated Spider Legs (4 per side, flexing with skitterPhase)
      const legConfigs = [
        { baseAng: 0.48, kneeLen: 14, tipLen: 24, sweep: 0.35 },
        { baseAng: 1.05, kneeLen: 16, tipLen: 27, sweep: 0.12 },
        { baseAng: 1.72, kneeLen: 16, tipLen: 26, sweep: -0.15 },
        { baseAng: 2.35, kneeLen: 14, tipLen: 23, sweep: -0.38 },
      ];

      for (const side of [-1, 1]) {
        for (let l = 0; l < legConfigs.length; l++) {
          const cfg = legConfigs[l];
          const twitch =
            Math.sin(skitterPhase + l * 1.4 + (side > 0 ? 0 : Math.PI)) * 0.14;
          const a1 = side * (cfg.baseAng + twitch);
          const a2 = side * (cfg.baseAng + cfg.sweep + twitch * 1.3);

          const rootX = (3 - l * 2.2) * spiderScale;
          const rootY = side * 5.5 * spiderScale;
          const kneeX = rootX + Math.cos(a1) * cfg.kneeLen * spiderScale;
          const kneeY = rootY + Math.sin(a1) * cfg.kneeLen * spiderScale - 3.5 * spiderScale;
          const tipX = rootX + Math.cos(a2) * cfg.tipLen * spiderScale;
          const tipY = rootY + Math.sin(a2) * cfg.tipLen * spiderScale + 2.0 * spiderScale;

          // Outer dark chitin leg segment
          ctx.strokeStyle = '#11161f';
          ctx.lineWidth = 3.8 * spiderScale;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(rootX, rootY);
          ctx.lineTo(kneeX, kneeY);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();

          // Glossy slate highlight & crimson joint band
          ctx.strokeStyle = '#4a5568';
          ctx.lineWidth = 1.6 * spiderScale;
          ctx.beginPath();
          ctx.moveTo(rootX, rootY);
          ctx.lineTo(kneeX, kneeY);
          ctx.stroke();

          ctx.fillStyle = '#e53e3e';
          ctx.beginPath();
          ctx.arc(kneeX, kneeY, 1.9 * spiderScale, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Silky white web strands stretched between the spider's rear spinnerets and back legs
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.lineWidth = 1.3 * spiderScale;
      ctx.beginPath();
      ctx.moveTo(-17 * spiderScale, 0);
      ctx.lineTo(-24 * spiderScale, -7 * spiderScale);
      ctx.moveTo(-17 * spiderScale, 0);
      ctx.lineTo(-24 * spiderScale, 7 * spiderScale);
      ctx.moveTo(-17 * spiderScale, 0);
      ctx.lineTo(-26 * spiderScale, 0);
      ctx.stroke();

      // 2. Bulbous 3D Obsidian-Black Spider Abdomen (trailing side -x)
      const abdRx = 13.5 * spiderScale;
      const abdRy = 10.8 * spiderScale;
      const abdGrad = ctx.createRadialGradient(
        -7 * spiderScale,
        -4 * spiderScale,
        1.5 * spiderScale,
        -4 * spiderScale,
        0,
        abdRx
      );
      abdGrad.addColorStop(0, '#4a5568');
      abdGrad.addColorStop(0.38, '#1a202c');
      abdGrad.addColorStop(0.85, '#0b0e14');
      abdGrad.addColorStop(1, '#05070a');

      ctx.fillStyle = abdGrad;
      ctx.strokeStyle = '#2d3748';
      ctx.lineWidth = 1.8 * spiderScale;
      ctx.beginPath();
      ctx.ellipse(-4.5 * spiderScale, 0, abdRx, abdRy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Vivid Crimson Black-Widow Hourglass Emblem on the dorsal abdomen
      ctx.fillStyle = '#f56565';
      ctx.strokeStyle = '#feb2b2';
      ctx.lineWidth = 0.9 * spiderScale;
      ctx.beginPath();
      ctx.moveTo(-9.5 * spiderScale, -4.2 * spiderScale);
      ctx.lineTo(-1.5 * spiderScale, -4.2 * spiderScale);
      ctx.lineTo(-4.6 * spiderScale, 0);
      ctx.lineTo(-1.5 * spiderScale, 4.2 * spiderScale);
      ctx.lineTo(-9.5 * spiderScale, 4.2 * spiderScale);
      ctx.lineTo(-6.4 * spiderScale, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 3. Armored Cephalothorax / Head (+x)
      const headR = 7.8 * spiderScale;
      const headGrad = ctx.createRadialGradient(
        7 * spiderScale,
        -2.5 * spiderScale,
        1 * spiderScale,
        8.5 * spiderScale,
        0,
        headR
      );
      headGrad.addColorStop(0, '#718096');
      headGrad.addColorStop(0.45, '#1a202c');
      headGrad.addColorStop(1, '#0a0d12');

      ctx.fillStyle = headGrad;
      ctx.strokeStyle = '#2d3748';
      ctx.lineWidth = 1.6 * spiderScale;
      ctx.beginPath();
      ctx.arc(8.5 * spiderScale, 0, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 4. Curved Venomous Chelicerae / Fangs at front (+x) dripping white web silk
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = '#1a202c';
        ctx.lineWidth = 1.3 * spiderScale;
        ctx.beginPath();
        ctx.moveTo(14.5 * spiderScale, side * 4.4 * spiderScale);
        ctx.quadraticCurveTo(
          20.5 * spiderScale,
          side * 5.2 * spiderScale,
          21.5 * spiderScale,
          side * 1.4 * spiderScale
        );
        ctx.quadraticCurveTo(
          17.5 * spiderScale,
          side * 2.2 * spiderScale,
          14.5 * spiderScale,
          side * 1.6 * spiderScale
        );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // 5. Cluster of 8 Glowing Crimson Arachnid Eyes on front of cephalothorax
      ctx.fillStyle = '#ff2e2e';
      const eyePositions = [
        [13.2, -2.2, 1.65],
        [13.2, 2.2, 1.65],
        [11.8, -4.4, 1.25],
        [11.8, 4.4, 1.25],
        [10.2, -1.5, 1.1],
        [10.2, 1.5, 1.1],
      ];
      for (let eIdx = 0; eIdx < eyePositions.length; eIdx++) {
        const [ex, ey, er] = eyePositions[eIdx];
        ctx.beginPath();
        ctx.arc(ex * spiderScale, ey * spiderScale, er * spiderScale, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      ctx.restore();
      return;
    }

    // 2. Foreshortened Spikey Mace Ground Shadow (at z = 0)
    ctx.save();
    ctx.translate(sx + 4, syGround + 4);
    ctx.scale(1, TILT_Y);
    ctx.fillStyle = isFlaming ? 'rgba(255, 87, 34, 0.35)' : 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    for (let i = 0; i < spikeCount * 2; i++) {
      const ang = h.angle + (i * Math.PI) / spikeCount;
      const r = i % 2 === 0 ? coreRadius + 8 * massScale : coreRadius * 0.85;
      const px = Math.cos(ang) * r;
      const py = Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 3. Bomb Armed or Flaming Hammer Aura (around the elevated spikey mace)
    if (h.bombCharges > 0 || isFlaming) {
      ctx.save();
      ctx.translate(sx, syGround - hammerZ);
      ctx.fillStyle = isFlaming ? 'rgba(255, 87, 34, 0.34)' : 'rgba(246, 173, 85, 0.34)';
      ctx.strokeStyle = isFlaming ? '#ff6b35' : '#f6ad55';
      ctx.lineWidth = 2.2;
      const auraR = (coreRadius + 10.5 * massScale) + 9 * massScale;
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        auraR,
        auraR * TILT_Y,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 4. 3D Spikey Mace Head (Morningstar Sphere + Conical Steel Spikes)
    ctx.save();
    ctx.translate(sx, syGround - hammerZ);

    // Draw a 3D conical spike pointing from (bx, by) to (tx, ty) with base width w
    const drawSpike = (bx, by, tx, ty, w) => {
      const dx = tx - bx;
      const dy = ty - by;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      // Dark iron side of cone
      ctx.fillStyle = '#4a5568';
      ctx.strokeStyle = '#1a202c';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(bx + nx * w, by + ny * w);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx - nx * w, by - ny * w);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Gleaming steel highlight facet on upper side of cone
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx + nx * w * 0.85, by + ny * w * 0.85);
      ctx.closePath();
      ctx.fill();
    };

    // A. Back-hemisphere equatorial spikes (where sin(ang) < 0 so they are behind the mace ball)
    const spikeLen = 10.5 * massScale;
    const spikeBaseW = 4.4 * massScale;
    const spikeInset = 2.5 * massScale;
    for (let i = 0; i < spikeCount; i++) {
      const ang = h.angle + (i * Math.PI * 2) / spikeCount;
      if (Math.sin(ang) < 0) {
        const bx = Math.cos(ang) * (coreRadius - spikeInset);
        const by = Math.sin(ang) * (coreRadius - spikeInset) * TILT_Y;
        const tx = Math.cos(ang) * (coreRadius + spikeLen);
        const ty = Math.sin(ang) * (coreRadius + spikeLen) * TILT_Y - 1.5 * massScale;
        drawSpike(bx, by, tx, ty, spikeBaseW);
      }
    }

    // B. Heavy 3D Spherical Iron Mace Core
    const ballGrad = ctx.createRadialGradient(
      -coreRadius * 0.35,
      -coreRadius * 0.38,
      coreRadius * 0.12,
      0,
      0,
      coreRadius
    );
    ballGrad.addColorStop(0, '#cbd5e0');
    ballGrad.addColorStop(0.35, '#718096');
    ballGrad.addColorStop(0.78, '#2d3748');
    ballGrad.addColorStop(1, '#1a202c');

    ctx.fillStyle = ballGrad;
    ctx.strokeStyle = '#11161f';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Forged steel equatorial band & bronze swivel collar
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.32)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, coreRadius * 0.96, coreRadius * 0.96 * TILT_Y, 0, 0, Math.PI);
    ctx.stroke();

    // C. Upper-dome 3D spikes (angled upward in 2.5D space)
    for (let i = 0; i < 4; i++) {
      const ang = h.angle + Math.PI / 4 + (i * Math.PI) / 2;
      const bx = Math.cos(ang) * coreRadius * 0.48;
      const by = Math.sin(ang) * coreRadius * 0.48 * TILT_Y - coreRadius * 0.42;
      const tx = Math.cos(ang) * (coreRadius * 0.95 + spikeLen * 0.65);
      const ty = Math.sin(ang) * (coreRadius * 0.95 + spikeLen * 0.65) * TILT_Y - coreRadius * 0.95;
      drawSpike(bx, by, tx, ty, spikeBaseW * 0.85);
    }

    // Central crown spike pointing straight up (-z)
    drawSpike(0, -coreRadius * 0.55, 0, -coreRadius - spikeLen * 0.85, spikeBaseW * 0.85);

    // D. Front-hemisphere equatorial spikes (where sin(ang) >= 0 so they jut out in front)
    for (let i = 0; i < spikeCount; i++) {
      const ang = h.angle + (i * Math.PI * 2) / spikeCount;
      if (Math.sin(ang) >= 0) {
        const bx = Math.cos(ang) * (coreRadius - spikeInset);
        const by = Math.sin(ang) * (coreRadius - spikeInset) * TILT_Y;
        const tx = Math.cos(ang) * (coreRadius + spikeLen);
        const ty = Math.sin(ang) * (coreRadius + spikeLen) * TILT_Y - 1.5 * massScale;
        drawSpike(bx, by, tx, ty, spikeBaseW);
      }
    }

    // Bronze chain-attachment boss on the trailing side of the mace
    const collarAng = h.angle + Math.PI;
    const collarX = Math.cos(collarAng) * coreRadius * 0.55;
    const collarY = Math.sin(collarAng) * coreRadius * 0.55 * TILT_Y;
    ctx.fillStyle = '#d69e2e';
    ctx.strokeStyle = '#744210';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(collarX, collarY, 4.2 * massScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 5. Animated Roaring Fire on the Flaming Hammer (when h.flameTimer > 0)
    if (isFlaming) {
      const flameTongues =
        visualQualityTier === QUALITY_TIER_HIGH
          ? 9
          : visualQualityTier === QUALITY_TIER_MEDIUM
          ? 5
          : 3;
      for (let f = 0; f < flameTongues; f++) {
        const phase = nowSec * 14 + f * 1.35;
        const spreadAng = (f / flameTongues) * Math.PI * 2 + Math.sin(phase * 0.7) * 0.2;
        const baseR = coreRadius * (0.55 + 0.25 * Math.sin(phase));
        const bx = Math.cos(spreadAng) * baseR;
        const by = Math.sin(spreadAng) * baseR * TILT_Y;
        const flameH = (14 + Math.sin(phase * 1.3) * 6) * massScale;
        const swayX = Math.sin(phase * 1.7 + f) * 4.5;
        const w = (5.2 + Math.cos(phase) * 1.5) * massScale;

        // Outer orange-red flame tongue
        ctx.fillStyle = f % 2 === 0 ? 'rgba(255, 87, 34, 0.86)' : 'rgba(246, 1AD, 85, 0.84)'.replace('1AD', '140');
        ctx.beginPath();
        ctx.moveTo(bx - w, by);
        ctx.quadraticCurveTo(bx - w * 0.4 + swayX * 0.5, by - flameH * 0.55, bx + swayX, by - flameH);
        ctx.quadraticCurveTo(bx + w * 0.4 + swayX * 0.5, by - flameH * 0.55, bx + w, by);
        ctx.closePath();
        ctx.fill();

        // Inner bright yellow-white flame core
        ctx.fillStyle = 'rgba(254, 240, 138, 0.9)';
        ctx.beginPath();
        ctx.moveTo(bx - w * 0.5, by);
        ctx.quadraticCurveTo(bx + swayX * 0.35, by - flameH * 0.35, bx + swayX * 0.65, by - flameH * 0.62);
        ctx.quadraticCurveTo(bx + swayX * 0.35, by - flameH * 0.35, bx + w * 0.5, by);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawEnemy(e) {
    const sx = e.x;
    const sy = e.y * TILT_Y;
    const dirX = Math.cos(e.angle);
    const dirY = Math.sin(e.angle);
    const rightX = -dirY;
    const rightY = dirX;

    const visualScale = Math.max(0.85, e.radius / 18);
    const bodyHeight = Math.round(e.radius * 1.38);
    const isDown =
      (e.knockdownTimer || 0) > 0 || earthquakeTimer > 0 || localKnockdownTimer > 0;
    const isBurning = (e.burnTimer || 0) > 0;
    const isFireproof = !isBurning && (e.fireproofTimer || 0) > 0;
    const isFeared = (e.fearTimer || 0) > 0;
    const isWebbed = (e.webTimer || 0) > 0;
    const isDancing = !isDown && !isWebbed && (e.danceTimer || 0) > 0;
    const isDanceImmune = !isDown && !isDancing && (e.danceImmuneTimer || 0) > 0;
    const nowSec = performance.now() * 0.001;
    const danceBeat = nowSec * 10.5 + e.walkPhase * 0.35;
    const lurch = isDown || isWebbed
      ? 0
      : isDancing
      ? Math.sin(danceBeat) * 5.2 * visualScale
      : Math.sin(e.walkPhase) * 2.2 * visualScale;
    const bob = isDown || isWebbed
      ? 0
      : isDancing
      ? Math.abs(Math.sin(danceBeat * 2)) * 4.5 * visualScale
      : Math.abs(Math.sin(e.walkPhase)) * 2.2;

    let skinCol = e.skinColor || '#5e8c52';
    let coatCol = e.coatColor || '#2d3748';
    let shirtCol = e.shirtColor || '#4a5568';

    if (e.hurtFlash > 0) {
      skinCol = '#ffffff';
      coatCol = '#e2e8f0';
      shirtCol = '#f7fafc';
    } else if (isBurning) {
      skinCol = '#7b5e3b';
      coatCol = '#3b2318';
      shirtCol = '#5c331e';
    } else if (isFeared) {
      // Pale, ghostly violet-blue pallor when tainted with fear
      skinCol = '#9f7aea';
      coatCol = '#322659';
      shirtCol = '#553c9a';
    } else if (isFireproof) {
      // Charred, ashen fire-proof appearance (1/2 speed & immune to fire)
      skinCol = '#4a5568';
      coatCol = '#1a202c';
      shirtCol = '#2d3748';
    }

    ctx.save();
    ctx.translate(sx, sy);

    // 1. Foreshortened 2.5D Ground Shadow (wider & flatter when zombie has fallen to the ground)
    ctx.fillStyle = isBurning ? 'rgba(255, 87, 34, 0.52)' : 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(
      2,
      3,
      e.radius * (isDown ? 1.92 : 1.18),
      e.radius * TILT_Y * (isDown ? 0.92 : 0.98),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Dedicated horizontal fallen-on-the-ground zombie pose during earthquake & recovery
    if (isDown) {
      const fallSign = Math.cos(e.angle) >= 0 ? 1 : -1;
      const quakeJitterX =
        earthquakeTimer > 0 ? Math.sin(nowSec * 62 + e.x * 0.17) * 3.2 : 0;
      const quakeJitterY =
        earthquakeTimer > 0 ? Math.cos(nowSec * 54 + e.y * 0.19) * 2.0 : 0;

      ctx.save();
      ctx.translate(quakeJitterX, quakeJitterY);

      // Subtle dust/knockdown ring around the fallen zombie on the turf
      ctx.strokeStyle =
        earthquakeTimer > 0 ? 'rgba(236, 201, 75, 0.72)' : 'rgba(160, 174, 192, 0.42)';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(0, 2, e.radius * 1.85, e.radius * TILT_Y * 0.88, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Sprawled legs & boots lying flat on the grass at the feet end (-fallSign)
      const legBaseX = -fallSign * e.radius * 0.85;
      ctx.strokeStyle = '#1a202c';
      ctx.lineWidth = 6.2 * visualScale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(legBaseX * 0.45, -3 * visualScale);
      ctx.lineTo(legBaseX * 1.38, -6.5 * visualScale);
      ctx.moveTo(legBaseX * 0.45, 3.5 * visualScale);
      ctx.lineTo(legBaseX * 1.42, 7.5 * visualScale);
      ctx.stroke();

      // Boots flat on the turf
      ctx.fillStyle = '#14181f';
      ctx.beginPath();
      ctx.ellipse(
        legBaseX * 1.44,
        -6.5 * visualScale,
        4.6 * visualScale,
        3.2 * visualScale,
        0.2,
        0,
        Math.PI * 2
      );
      ctx.ellipse(
        legBaseX * 1.48,
        7.5 * visualScale,
        4.6 * visualScale,
        3.2 * visualScale,
        -0.2,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Back sprawled zombie arm lying flat on the turf
      const shoulderX = fallSign * e.radius * 0.42;
      ctx.strokeStyle = coatCol;
      ctx.lineWidth = 6.0 * visualScale;
      ctx.beginPath();
      ctx.moveTo(shoulderX, -3 * visualScale);
      ctx.lineTo(shoulderX + fallSign * e.radius * 0.75, -11.5 * visualScale);
      ctx.stroke();
      ctx.fillStyle = skinCol;
      ctx.beginPath();
      ctx.arc(
        shoulderX + fallSign * e.radius * 0.82,
        -12 * visualScale,
        3.3 * visualScale,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Horizontal Fallen Zombie Torso lying flat on the ground
      const torsoW = bodyHeight * 1.25;
      const torsoH = e.radius * 0.96;
      ctx.fillStyle = coatCol;
      ctx.strokeStyle = '#141814';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.roundRect(
        -torsoW * 0.5,
        -torsoH * 0.65,
        torsoW,
        torsoH,
        torsoH * 0.45
      );
      ctx.fill();
      ctx.stroke();

      // Torn shirt / ribcage patch on horizontal torso
      ctx.fillStyle = shirtCol;
      ctx.beginPath();
      ctx.ellipse(
        fallSign * e.radius * 0.08,
        -torsoH * 0.15,
        torsoW * 0.28,
        torsoH * 0.3,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Front sprawled zombie arm splayed across the grass
      ctx.strokeStyle = skinCol;
      ctx.lineWidth = 5.2 * visualScale;
      ctx.beginPath();
      ctx.moveTo(shoulderX, 2 * visualScale);
      ctx.lineTo(shoulderX + fallSign * e.radius * 0.85, 10.5 * visualScale);
      ctx.stroke();
      ctx.fillStyle = skinCol;
      ctx.strokeStyle = '#161e14';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(
        shoulderX + fallSign * e.radius * 0.9,
        11 * visualScale,
        3.4 * visualScale,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.stroke();

      // Fallen Zombie Head resting flat on the turf at +fallSign end
      const headX = fallSign * (torsoW * 0.52 + e.radius * 0.34);
      const headY = -e.radius * 0.15;
      const headRadius = e.radius * 0.62;

      ctx.fillStyle = skinCol;
      ctx.strokeStyle = '#162014';
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Dizzy / Knocked-Out X-Eyes on the fallen zombie head
      ctx.strokeStyle = '#141a12';
      ctx.lineWidth = 1.9 * visualScale;
      const eyeOffset = 3.2 * visualScale;
      for (const eySign of [-1, 1]) {
        const ex = headX + fallSign * headRadius * 0.22;
        const ey = headY + eySign * eyeOffset;
        const xr = 2.2 * visualScale;
        ctx.beginPath();
        ctx.moveTo(ex - xr, ey - xr);
        ctx.lineTo(ex + xr, ey + xr);
        ctx.moveTo(ex + xr, ey - xr);
        ctx.lineTo(ex - xr, ey + xr);
        ctx.stroke();
      }

      // Orbiting golden stun halo & stars above the fallen zombie's head
      const haloY = headY - headRadius - 7 * visualScale;
      ctx.strokeStyle = 'rgba(246, 224, 94, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(headX, haloY, 9.5 * visualScale, 4.2 * visualScale, 0, 0, Math.PI * 2);
      ctx.stroke();

      for (let s = 0; s < 2; s++) {
        const starAng = nowSec * 5.5 + s * Math.PI + e.walkPhase;
        const starX = headX + Math.cos(starAng) * 9.5 * visualScale;
        const starY = haloY + Math.sin(starAng) * 4.2 * visualScale;
        ctx.fillStyle = s === 0 ? '#fefcbf' : '#ecc94b';
        ctx.beginPath();
        ctx.arc(starX, starY, 2.3 * visualScale, 0, Math.PI * 2);
        ctx.fill();
      }

      // If also wrapped in Spider Webbing while fallen on the ground, draw white lines across the fallen body
      if (isWebbed) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.1 * visualScale;
        ctx.beginPath();
        for (let w = -3; w <= 3; w++) {
          const wx = w * (torsoW * 0.2);
          ctx.moveTo(wx - 4 * visualScale, -torsoH * 0.72);
          ctx.lineTo(wx + 4 * visualScale, torsoH * 0.45);
          ctx.moveTo(wx + 4 * visualScale, -torsoH * 0.72);
          ctx.lineTo(wx - 4 * visualScale, torsoH * 0.45);
        }
        ctx.stroke();
      }

      ctx.restore();
      ctx.restore();

      // Floating 2.5D Health Bar above fallen zombie
      if (e.hp < e.maxHp) {
        const barW = e.radius * 2.1;
        const barH = 5;
        const bx = sx - barW / 2;
        const by = sy - e.radius * 1.15 - 14;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);

        const hpRatio = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = hpRatio > 0.4 ? '#48bb78' : '#f6ad55';
        ctx.fillRect(bx, by, barW * hpRatio, barH);
      }
      return;
    }

    if (isBurning) {
      // Pulsing fiery ring & back-layer flame halo behind the zombie
      const pulseR = e.radius * (1.28 + Math.sin(nowSec * 16 + e.walkPhase) * 0.1);
      ctx.strokeStyle = '#ff6b35';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 1, pulseR, pulseR * TILT_Y, 0, 0, Math.PI * 2);
      ctx.stroke();

      const backTongues =
        visualQualityTier === QUALITY_TIER_HIGH
          ? 5
          : visualQualityTier === QUALITY_TIER_MEDIUM
          ? 3
          : 2;
      for (let b = 0; b < backTongues; b++) {
        const bPhase = nowSec * 15 + b * 1.4 + e.walkPhase;
        const bx = ((b - 2) / 2.2) * e.radius * 0.95;
        const by = -bodyHeight * 0.35 - bob;
        const bh = (22 + Math.sin(bPhase) * 8) * visualScale;
        const bSway = Math.cos(bPhase * 1.2) * 5 * visualScale;
        const bw = 6.5 * visualScale;

        ctx.fillStyle = 'rgba(229, 62, 62, 0.78)';
        ctx.beginPath();
        ctx.moveTo(bx - bw, by);
        ctx.quadraticCurveTo(bx - bw * 0.3 + bSway * 0.5, by - bh * 0.55, bx + bSway, by - bh);
        ctx.quadraticCurveTo(bx + bw * 0.3 + bSway * 0.5, by - bh * 0.55, bx + bw, by);
        ctx.closePath();
        ctx.fill();
      }
    } else if (isFeared) {
      // Pulsing ghostly violet-cyan fear aura ring at zombie's feet
      const fearPulse = e.radius * (1.24 + Math.sin(nowSec * 18 + e.walkPhase) * 0.1);
      ctx.strokeStyle = 'rgba(183, 148, 244, 0.85)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 1, fearPulse, fearPulse * TILT_Y, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isDancing) {
      // Pulsing colorful Disco Spotlight & Dance Floor Ring under the dancing zombie
      const discoColors = ['#f687b3', '#63b3ed', '#f6e05e', '#68d391', '#b794f4'];
      const colorIdx = Math.floor(nowSec * 6 + e.walkPhase) % discoColors.length;
      const danceRingR = e.radius * (1.32 + Math.sin(danceBeat * 2) * 0.1);
      ctx.fillStyle = 'rgba(246, 135, 179, 0.22)';
      ctx.strokeStyle = discoColors[colorIdx];
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 2, danceRingR, danceRingR * TILT_Y, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (isDanceImmune) {
      // Subtle dashed silver-magenta ring while in the 45s post-dance immunity window
      ctx.strokeStyle = 'rgba(246, 135, 179, 0.45)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.ellipse(0, 2, e.radius * 1.15, e.radius * TILT_Y * 0.95, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (isFireproof) {
      ctx.strokeStyle = 'rgba(144, 205, 244, 0.65)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.ellipse(0, 2, e.radius * 1.18, e.radius * TILT_Y * 0.98, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Sticky white spiderweb mat on the grass beneath a webbed zombie
    if (isWebbed) {
      const webR = e.radius * 1.48;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let sp = 0; sp < 8; sp++) {
        const a = (sp * Math.PI) / 4;
        ctx.moveTo(0, 2);
        ctx.lineTo(Math.cos(a) * webR, 2 + Math.sin(a) * webR * TILT_Y);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 2, webR * 0.55, webR * 0.55 * TILT_Y, 0, 0, Math.PI * 2);
      ctx.ellipse(0, 2, webR * 0.92, webR * 0.92 * TILT_Y, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2. Shuffling Zombie Feet (motionless when fallen on ground or webbed)
    const step = isDown || isWebbed ? 0 : Math.sin(e.walkPhase) * 4.5 * visualScale;
    ctx.fillStyle = '#1a202c';
    ctx.beginPath();
    ctx.ellipse(
      rightX * e.radius * 0.48 + dirX * step,
      (rightY * e.radius * 0.48 + dirY * step) * TILT_Y,
      5.0 * visualScale,
      3.4 * visualScale,
      0,
      0,
      Math.PI * 2
    );
    ctx.ellipse(
      -rightX * e.radius * 0.48 - dirX * step,
      (-rightY * e.radius * 0.48 - dirY * step) * TILT_Y,
      5.0 * visualScale,
      3.4 * visualScale,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Helper to draw an outstretched zombie arm reaching forward toward target (or disco dancing!)
    const drawZombieArm = (sideSign) => {
      const shoulderX = rightX * sideSign * e.radius * 0.78 + (isDancing ? lurch * 0.35 : 0);
      const shoulderY = -bodyHeight * 0.72 - bob + rightY * sideSign * e.radius * 0.35 * TILT_Y;
      const reachLen = e.radius * 1.18;
      let handX;
      let handY;
      if (isDancing) {
        // Alternating Saturday Night Fever disco point skyward & hip groove
        const armWave = Math.sin(danceBeat + sideSign * Math.PI * 0.5);
        handX = shoulderX + sideSign * e.radius * 0.72 + Math.cos(danceBeat) * 3 * visualScale;
        handY = shoulderY - armWave * e.radius * 0.95 - 4 * visualScale;
      } else if (isWebbed) {
        // Arms pinned tightly against the zombie's torso by spider webbing
        handX = shoulderX + dirX * e.radius * 0.32;
        handY = shoulderY + e.radius * 0.48;
      } else {
        const sway = isDown ? 0 : Math.sin(e.walkPhase + sideSign * 0.9) * 2.2 * visualScale;
        handX = shoulderX + dirX * reachLen + rightX * sway * 0.4;
        handY = shoulderY + dirY * reachLen * TILT_Y - 2 * visualScale;
      }

      // Tattered sleeve upper arm + rotting green forearm
      ctx.strokeStyle = '#161e14';
      ctx.lineWidth = 6.8 * visualScale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY);
      ctx.lineTo(handX, handY);
      ctx.stroke();

      ctx.strokeStyle = skinCol;
      ctx.lineWidth = 4.6 * visualScale;
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY);
      ctx.lineTo(handX, handY);
      ctx.stroke();

      // Tattered sleeve cuff near shoulder
      ctx.strokeStyle = coatCol;
      ctx.lineWidth = 5.6 * visualScale;
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY);
      ctx.lineTo(
        shoulderX + (handX - shoulderX) * 0.42,
        shoulderY + (handY - shoulderY) * 0.42
      );
      ctx.stroke();

      // Bony claw hand
      ctx.fillStyle = skinCol;
      ctx.strokeStyle = '#161e14';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(handX, handY, 3.1 * visualScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    // Draw back arm first (the arm with lower screen Y so torso overlaps it naturally)
    if (rightY < 0) {
      drawZombieArm(1);
    } else {
      drawZombieArm(-1);
    }

    // 3. Hunched 3D Zombie Torso in Tattered Rags
    ctx.fillStyle = coatCol;
    ctx.strokeStyle = '#141814';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(
      -e.radius * 0.86 + lurch * 0.25,
      -bodyHeight - bob,
      e.radius * 1.72,
      bodyHeight,
      e.radius * 0.58
    );
    ctx.fill();
    ctx.stroke();

    // Torn shirt / exposed ribcage patch on chest
    ctx.fillStyle = shirtCol;
    ctx.beginPath();
    ctx.ellipse(
      lurch * 0.25 + dirX * e.radius * 0.18,
      -bodyHeight * 0.55 - bob,
      e.radius * 0.52,
      bodyHeight * 0.32,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Hunched rotting shoulders / torn collar
    ctx.fillStyle = coatCol;
    ctx.beginPath();
    ctx.ellipse(
      lurch * 0.3,
      -bodyHeight * 0.78 - bob,
      e.radius * 0.92,
      e.radius * 0.44,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();

    // Draw front outstretched zombie arm
    if (rightY < 0) {
      drawZombieArm(-1);
    } else {
      drawZombieArm(1);
    }

    // 4. 3D Undead Zombie Head (tilted / lurching forward)
    const headX = dirX * e.radius * 0.16 + lurch * 0.45;
    const headY = -bodyHeight - e.radius * 0.32 - bob + dirY * e.radius * 0.1 * TILT_Y;
    const headRadius = e.radius * 0.62;

    ctx.fillStyle = skinCol;
    ctx.strokeStyle = '#162014';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cranial suture / zombie scar on top-side of head
    ctx.strokeStyle = 'rgba(45, 22, 28, 0.65)';
    ctx.lineWidth = 1.5 * visualScale;
    ctx.beginPath();
    ctx.moveTo(headX - headRadius * 0.45, headY - headRadius * 0.45);
    ctx.lineTo(headX + headRadius * 0.15, headY - headRadius * 0.2);
    ctx.stroke();

    // Sunken dark eye sockets, glowing undead eyes & gaping jaw when facing camera
    if (dirY > -0.75) {
      const eyeBaseX = headX + dirX * headRadius * 0.52;
      const eyeBaseY = headY + dirY * headRadius * 0.32 * TILT_Y;
      const eyeSpacing = 4.1 * visualScale;
      const socketRadius = 3.1 * visualScale;
      const pupilRadius = 1.9 * visualScale;

      // Dark sunken sockets
      ctx.fillStyle = '#141a12';
      ctx.beginPath();
      ctx.arc(eyeBaseX - rightX * eyeSpacing, eyeBaseY, socketRadius, 0, Math.PI * 2);
      ctx.arc(eyeBaseX + rightX * eyeSpacing, eyeBaseY, socketRadius, 0, Math.PI * 2);
      ctx.fill();

      // Glowing yellow-red undead eyes
      ctx.fillStyle = e.eyeColor || '#f6e05e';
      ctx.beginPath();
      ctx.arc(eyeBaseX - rightX * eyeSpacing, eyeBaseY, pupilRadius, 0, Math.PI * 2);
      ctx.arc(eyeBaseX + rightX * eyeSpacing, eyeBaseY, pupilRadius, 0, Math.PI * 2);
      ctx.fill();

      // Dark slack zombie mouth below eyes
      if (dirY > -0.25) {
        ctx.fillStyle = '#2d1216';
        ctx.beginPath();
        ctx.ellipse(
          eyeBaseX,
          eyeBaseY + 4.4 * visualScale,
          3.4 * visualScale,
          2.0 * visualScale,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    // Animated flames engulfing burning zombies (when e.burnTimer > 0)
    if (isBurning) {
      const tongues =
        visualQualityTier === QUALITY_TIER_HIGH
          ? 9
          : visualQualityTier === QUALITY_TIER_MEDIUM
          ? 5
          : 3;
      for (let f = 0; f < tongues; f++) {
        const phase = nowSec * 15 + f * 1.35 + e.walkPhase;
        const ox =
          ((f - (tongues - 1) / 2) / (tongues * 0.48)) * e.radius * 0.92 +
          Math.sin(phase * 0.8) * 2.2 * visualScale;
        const tier = f % 3;
        const baseY =
          (tier === 0
            ? -bodyHeight * 0.18
            : tier === 1
            ? -bodyHeight * 0.58
            : -bodyHeight * 0.98) - bob;
        const flameH = (16 + Math.sin(phase * 1.25) * 6.5) * visualScale;
        const swayX = Math.cos(phase * 1.5 + f) * 4.8 * visualScale;
        const w = (5.4 + Math.sin(phase) * 1.2) * visualScale;

        // Outer blazing orange-red flame tongue
        ctx.fillStyle = f % 2 === 0 ? 'rgba(255, 87, 34, 0.9)' : 'rgba(237, 137, 54, 0.88)';
        ctx.beginPath();
        ctx.moveTo(ox - w, baseY);
        ctx.quadraticCurveTo(
          ox - w * 0.35 + swayX * 0.5,
          baseY - flameH * 0.55,
          ox + swayX,
          baseY - flameH
        );
        ctx.quadraticCurveTo(
          ox + w * 0.35 + swayX * 0.5,
          baseY - flameH * 0.55,
          ox + w,
          baseY
        );
        ctx.closePath();
        ctx.fill();

        // Inner golden-yellow & white-hot core
        ctx.fillStyle = f % 3 === 0 ? 'rgba(254, 252, 191, 0.94)' : 'rgba(246, 224, 94, 0.92)';
        ctx.beginPath();
        ctx.moveTo(ox - w * 0.48, baseY);
        ctx.quadraticCurveTo(
          ox + swayX * 0.35,
          baseY - flameH * 0.35,
          ox + swayX * 0.65,
          baseY - flameH * 0.65
        );
        ctx.quadraticCurveTo(
          ox + swayX * 0.35,
          baseY - flameH * 0.35,
          ox + w * 0.48,
          baseY
        );
        ctx.closePath();
        ctx.fill();
      }
    }

    // Floating musical notes above a dancing zombie
    if (isDancing) {
      const noteColors = ['#f687b3', '#63b3ed', '#f6e05e', '#68d391'];
      ctx.font = `700 ${Math.round(13 * visualScale)}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      for (let n = 0; n < 2; n++) {
        const nPhase = (nowSec * 1.8 + n * 0.5 + e.walkPhase * 0.1) % 1;
        const nx = (n === 0 ? -1 : 1) * (e.radius * 0.65 + Math.sin(nowSec * 6 + n) * 4);
        const ny = -bodyHeight - e.radius * 0.9 - nPhase * 18 * visualScale;
        ctx.globalAlpha = Math.sin(nPhase * Math.PI);
        ctx.fillStyle = noteColors[(Math.floor(nowSec * 4) + n) % noteColors.length];
        ctx.fillText(n === 0 ? '♪' : '♫', nx, ny);
      }
      ctx.globalAlpha = 1;
    }

    // White Spider Webbing Lines wrapped tightly around the zombie (for 30 seconds when hit by a Spider Hammer)
    if (isWebbed) {
      const wrapW = e.radius * 1.05;
      ctx.save();
      ctx.lineCap = 'round';

      // Translucent white silk cocoon sheen over torso
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.ellipse(0, -bodyHeight * 0.55, wrapW * 0.98, bodyHeight * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();

      // Crisscrossing bright white silk bands wrapping legs, torso, pinned arms, and head
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2 * visualScale;
      ctx.beginPath();
      const bands = visualQualityTier === QUALITY_TIER_HIGH ? 6 : 3;
      for (let b = 0; b < bands; b++) {
        const frac = (b + 0.5) / bands;
        const by = -bodyHeight * 0.08 - frac * (bodyHeight * 1.08);
        const bw = wrapW * (1.0 - Math.abs(frac - 0.52) * 0.32);

        // Horizontal curved wrap line
        ctx.moveTo(-bw, by - 2.2 * visualScale);
        ctx.quadraticCurveTo(0, by + 3.2 * visualScale, bw, by - 1.8 * visualScale);

        // Diagonal cross-wrap strand
        if (b < bands - 1) {
          const nextBy = -bodyHeight * 0.08 - ((b + 1.5) / bands) * (bodyHeight * 1.08);
          if (b % 2 === 0) {
            ctx.moveTo(-bw * 0.92, by);
            ctx.lineTo(bw * 0.92, nextBy);
          } else {
            ctx.moveTo(bw * 0.92, by);
            ctx.lineTo(-bw * 0.92, nextBy);
          }
        }
      }

      // Extra white web lines binding the zombie's head & anchoring to the ground web
      ctx.moveTo(-headRadius * 0.95, headY - headRadius * 0.15);
      ctx.lineTo(headRadius * 0.95, headY + headRadius * 0.25);
      ctx.moveTo(headRadius * 0.95, headY - headRadius * 0.2);
      ctx.lineTo(-headRadius * 0.95, headY + headRadius * 0.2);

      // Anchor strands from cocoon down to the ground web mat
      ctx.moveTo(-wrapW * 0.88, -bodyHeight * 0.45);
      ctx.lineTo(-e.radius * 1.35, 2);
      ctx.moveTo(wrapW * 0.88, -bodyHeight * 0.45);
      ctx.lineTo(e.radius * 1.35, 2);
      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();

    // 5. Floating 2.5D Health Bar above zombie's 3D head (or fallen body)
    if (e.hp < e.maxHp) {
      const barW = e.radius * 2.1;
      const barH = 5;
      const bx = sx - barW / 2;
      const by = isDown
        ? sy - e.radius * 0.95 - 12
        : sy - bodyHeight - e.radius * 1.15 - 10;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);

      const hpRatio = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = hpRatio > 0.4 ? '#48bb78' : '#f6ad55';
      ctx.fillRect(bx, by, barW * hpRatio, barH);
    }
  }

  function renderMinimap() {
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;
    const scaleX = mw / WORLD_WIDTH;
    const scaleY = mh / WORLD_HEIGHT;

    minimapCtx.clearRect(0, 0, mw, mh);

    // Grass background
    minimapCtx.fillStyle = '#254b22';
    minimapCtx.fillRect(0, 0, mw, mh);

    // Viewport rectangle (accounting for 2.5D TILT_Y ground coverage)
    minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(
      camera.x * scaleX,
      camera.y * scaleY,
      viewportWidth * scaleX,
      (viewportHeight / TILT_Y) * scaleY
    );

    // 4 Stone Columns on minimap
    for (let i = 0; i < stoneColumns.length; i++) {
      const col = stoneColumns[i];
      minimapCtx.fillStyle = '#a0aec0';
      minimapCtx.strokeStyle = '#1a202c';
      minimapCtx.lineWidth = 1.2;
      minimapCtx.beginPath();
      minimapCtx.arc(col.x * scaleX, col.y * scaleY, 3.6, 0, Math.PI * 2);
      minimapCtx.fill();
      minimapCtx.stroke();
    }

    // Collectible black circles on minimap
    for (let i = 0; i < blackCircles.length; i++) {
      const c = blackCircles[i];
      minimapCtx.fillStyle = '#0a0a0a';
      minimapCtx.strokeStyle = '#cbd5e0';
      minimapCtx.lineWidth = 1;
      minimapCtx.beginPath();
      minimapCtx.arc(c.x * scaleX, c.y * scaleY, 2.6, 0, Math.PI * 2);
      minimapCtx.fill();
      minimapCtx.stroke();
    }

    // Zombies on minimap
    minimapCtx.fillStyle = '#68d391';
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      minimapCtx.beginPath();
      minimapCtx.arc(e.x * scaleX, e.y * scaleY, 2.2, 0, Math.PI * 2);
      minimapCtx.fill();
    }

    // Remote Players on minimap
    for (let i = 0; i < remotePlayers.length; i++) {
      const rp = remotePlayers[i];
      if (!rp.alive) continue;
      minimapCtx.fillStyle = rp.color || '#48bb78';
      minimapCtx.beginPath();
      minimapCtx.arc(rp.x * scaleX, rp.y * scaleY, 3.2, 0, Math.PI * 2);
      minimapCtx.fill();
    }

    // Local Player & Hammers
    if (warrior.alive) {
      minimapCtx.fillStyle = '#f6e05e';
      for (let hIdx = 0; hIdx < warrior.hammers.length; hIdx++) {
        const hm = warrior.hammers[hIdx];
        const hmScale = Math.min(
          2.0,
          1 + Math.max(0, (hm.mass || INITIAL_HAMMER_MASS) - INITIAL_HAMMER_MASS) * 0.14
        );
        minimapCtx.beginPath();
        minimapCtx.arc(hm.x * scaleX, hm.y * scaleY, 2.8 * hmScale, 0, Math.PI * 2);
        minimapCtx.fill();
      }

      minimapCtx.fillStyle = warrior.color || '#63b3ed';
      minimapCtx.beginPath();
      minimapCtx.arc(warrior.x * scaleX, warrior.y * scaleY, 3.5, 0, Math.PI * 2);
      minimapCtx.fill();
    }
  }

  // --- UI Controls ---
  playAgainBtn.addEventListener('click', () => {
    initGame();
  });

  if (victoryNextBtn) {
    victoryNextBtn.addEventListener('click', () => {
      initGame();
    });
  }

  if (enterGameBtn) {
    enterGameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      enterGame();
    });
  }

  if (nicknameInputEl) {
    nicknameInputEl.addEventListener('input', () => {
      nicknameInputEl.classList.remove('input-error');
    });
    nicknameInputEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        enterGame();
      }
    });
    populateNicknameSuggestion();
    if (typeof nicknameInputEl.focus === 'function') {
      nicknameInputEl.focus();
    }
    if (nicknameInputEl && typeof (nicknameInputEl as any).select === 'function') {
      (nicknameInputEl as any).select();
    }
  }

  // --- Main Animation Loop ---
  let lastTime = performance.now();

  function gameLoop(now) {
    gameTime = now * 0.001;
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    updateVisualQuality(rawDt);
    const frameDt = Math.min(Math.max(0, rawDt), 0.05); // Cap delta time on tab switch
    minimapAccumSec += frameDt;

    if (hasEnteredGame) {
      const idleSeconds = (now - lastUserActivityTime) / 1000;
      const maxIdleSeconds = warrior.alive ? 120 : 45;
      if (idleSeconds >= maxIdleSeconds) {
        pauseForIdle(
          'Session paused due to inactivity so the server stays idle when nobody is playing. Click to rejoin!'
        );
      } else if (isMultiplayer) {
        stepMultiplayerClient(frameDt);
        updateCamera();
        sendInputToServer();
        updateEffects(frameDt);
        updateHUD();
      } else if (!isGameOver) {
        if (roundState === 'playing') {
          const subDt = frameDt / PHYSICS_SUBSTEPS;
          for (let s = 0; s < PHYSICS_SUBSTEPS; s++) {
            stepPhysics(subDt);
          }
        }
        updateCamera();
        updateEffects(frameDt);
        updateHUD();
      }
    }

    render();
    requestAnimationFrame(gameLoop);
  }

  // Start up (waits for user click on #enter-modal before connecting to server)
  loadLocalLeaderboardFromStorage();
  generateWorldScenery();
  resizeCanvas();
  initGame();
  requestAnimationFrame(gameLoop);

  if (typeof window !== 'undefined') {
    win.__HAMMERTIME_TEST__ = {
      constants: {
        WORLD_WIDTH,
        WORLD_HEIGHT,
        PHYSICS_SUBSTEPS,
        TILT_Y,
        INITIAL_CHAIN_LINKS,
        MAX_CHAIN_LINKS,
        BASE_CHAIN_OFFSET,
        LENGTH_PER_LINK,
        CHAIN_SPRING_K,
        CHAIN_RADIAL_DAMP,
        CHAIN_LINK_RADIUS,
        CHAIN_RELAX_ITERS,
        STONE_COLUMN_COUNT,
        STONE_COLUMN_RADIUS,
        STONE_COLUMNS,
        HAMMER_ENEMY_RESTITUTION,
        DAMAGE_PER_IMPULSE,
        CHAIN_MOMENTUM_FACTOR,
        CHAIN_DAMAGE_FACTOR,
        INITIAL_HAMMER_MASS,
        HAMMER_WEIGHT_BONUS,
        EXPLOSION_RADIUS,
        PICKUP_TYPES,
        PICKUP_RADIUS,
        MAX_PICKUP_COUNT,
        MAX_HAMMERS_PER_PLAYER,
        EXTRA_HAMMER_DURATION,
        RARE_HAMMER_DROP_CHANCE,
        RARE_HORSE_DROP_CHANCE,
        RARE_TORTOISE_DROP_CHANCE,
        RARE_ELEPHANT_DROP_CHANCE,
        RARE_BULLDOZER_DROP_CHANCE,
        RARE_EARTHQUAKE_DROP_CHANCE,
        RARE_FEAR_DROP_CHANCE,
        RARE_DISCO_DROP_CHANCE,
        RARE_JACKOLANTERN_DROP_CHANCE,
        RARE_SPIDER_DROP_CHANCE,
        ZOMBIE_WEB_DURATION,
        SPIDER_HAMMER_DURATION,
        JACKOLANTERN_HAMMER_DURATION,
        DISCO_HAMMER_DURATION,
        ZOMBIE_DANCE_DURATION,
        ZOMBIE_DANCE_IMMUNE_DURATION,
        BULLDOZER_DURATION,
        BULLDOZER_SPEED_MULT,
        BULLDOZER_TRACTION_MULT,
        BULLDOZER_RADIUS,
        EARTHQUAKE_DURATION,
        ZOMBIE_KNOCKDOWN_RECOVERY,
        FEAR_DURATION,
        FEAR_INITIAL_RADIUS,
        FEAR_SPEED_MULT,
        FLAME_HAMMER_DURATION,
        ZOMBIE_BURN_DURATION,
        ZOMBIE_FIREPROOF_DURATION,
        ZOMBIE_BURN_DPS,
        INITIAL_ENEMY_COUNT,
        MAX_ENEMY_COUNT,
        VICTORY_KILL_TARGET,
        VICTORY_DISPLAY_DURATION,
        LEADERBOARD_MAX_ENTRIES,
        MAX_NICKNAME_LENGTH,
        QUALITY_TIER_LOW,
        QUALITY_TIER_MEDIUM,
        QUALITY_TIER_HIGH,
        MAX_PARTICLES_BY_TIER,
        MAX_FLOATING_TEXTS_BY_TIER,
        PARTICLE_SPAWN_SCALE_BY_TIER,
        MAX_SOUNDS_PER_WINDOW_BY_TIER,
        SOUND_RATE_WINDOW_MS,
        MINIMAP_UPDATE_INTERVAL,
      },
      warrior,
      hammer,
      enemies,
      blackCircles,
      stoneColumns,
      particles,
      floatingTexts,
      shockwaves,
      remotePlayers,
      localLeaderboardRecords,
      camera,
      mouse,
      getState: () => ({
        hasEnteredGame,
        isConnecting,
        isMultiplayer,
        hasSyncedInitialServerState,
        localPlayerId,
        roundState,
        teamKills,
        kills,
        maxDamageBlow,
        earthquakeTimer,
        localKnockdownTimer,
        gameTime,
        leaderboard,
        ws,
        avgFrameMs,
        visualQualityTier,
        minimapAccumSec,
        soundsInCurrentWindow,
      }),
      setState: (patch) => {
        if ('hasEnteredGame' in patch) hasEnteredGame = patch.hasEnteredGame;
        if ('isConnecting' in patch) isConnecting = patch.isConnecting;
        if ('isMultiplayer' in patch) isMultiplayer = patch.isMultiplayer;
        if ('hasSyncedInitialServerState' in patch)
          hasSyncedInitialServerState = patch.hasSyncedInitialServerState;
        if ('localPlayerId' in patch) localPlayerId = patch.localPlayerId;
        if ('roundState' in patch) roundState = patch.roundState;
        if ('teamKills' in patch) teamKills = patch.teamKills;
        if ('kills' in patch) kills = patch.kills;
        if ('maxDamageBlow' in patch) maxDamageBlow = patch.maxDamageBlow;
        if ('earthquakeTimer' in patch) earthquakeTimer = patch.earthquakeTimer;
        if ('localKnockdownTimer' in patch) localKnockdownTimer = patch.localKnockdownTimer;
        if ('gameTime' in patch) gameTime = patch.gameTime;
        if ('leaderboard' in patch) leaderboard = patch.leaderboard;
        if ('avgFrameMs' in patch) avgFrameMs = patch.avgFrameMs;
        if ('visualQualityTier' in patch) visualQualityTier = patch.visualQualityTier;
        if ('minimapAccumSec' in patch) minimapAccumSec = patch.minimapAccumSec;
        if ('soundWindowStartMs' in patch) soundWindowStartMs = patch.soundWindowStartMs;
        if ('soundsInCurrentWindow' in patch) soundsInCurrentWindow = patch.soundsInCurrentWindow;
      },
      initGame,
      enterGame,
      connectMultiplayer,
      lerpAngle,
      getCookie,
      setCookie,
      getRandomMedievalName,
      getInitialSuggestedNickname,
      populateNicknameSuggestion,
      sanitizeNickname,
      saveLocalLeaderboardToStorage,
      loadLocalLeaderboardFromStorage,
      syncServerLeaderboard,
      recordLocalLeaderboardScore,
      getTopLocalLeaderboard,
      clearLocalLeaderboard,
      renderLeaderboard,
      updateVisualQuality,
      canPlayRateLimitedSound,
      isWorldPointVisible,
      addParticles,
      addFloatingText,
      updateWarriorBroadphaseBounds,
      stepLocalWarriorAndHammers,
      stepMultiplayerClient,
      stepPhysics,
      updateEffects,
      updateHUD,
      updateCamera,
      render,
      renderMinimap,
      drawWarrior,
      drawHammer,
      drawEnemy,
      drawPickupCircle,
      drawBlackCircle: drawPickupCircle,
      drawChain,
      drawStoneColumn,
      processServerEvents,
      addPickupToWorld,
      defeatEnemy,
      spawnEnemy,
      createExtraHammer,
      startEnemyDance,
      taintEnemyWithFear,
      igniteEnemy,
      triggerHammerExplosion,
      getChainRestLength,
      initHammerChainNodes,
      addHammerChainLinkNode,
      gameLoop,
    };
  }
})();
