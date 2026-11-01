/**
 * HammerTime — Multiplayer Authoritative Game Server & Static HTTP Server
 * Zero external dependencies (uses built-in Node.js http, fs, path, crypto).
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');

const PORT = process.env.PORT || 8080;

// --- World & Physics Constants ---
const WORLD_WIDTH = 4200;
const WORLD_HEIGHT = 4200;
const TICK_RATE = 60;
const BroadcastRate = 30;
const PHYSICS_SUBSTEPS = 4;
const LOW_LOAD_PHYSICS_SUBSTEPS = 2;
const TICK_LOAD_THRESHOLD_MS = 10.0; // Step down fidelity when rolling tick exceeds 60% of 16.7ms budget
const TICK_RECOVERY_THRESHOLD_MS = 6.5; // Hysteresis threshold to restore full simulation fidelity

// Chain constants
const INITIAL_CHAIN_LINKS = 2;
const MAX_CHAIN_LINKS = 9;
const BASE_CHAIN_OFFSET = 20;
const LENGTH_PER_LINK = 13;
const CHAIN_SPRING_K = 32.5; // 20% less elastic stretch (26.0 / 0.8)
const CHAIN_RADIAL_DAMP = 1.98; // 20% more radial damping (1.65 * 1.2)
const CHAIN_LINK_RADIUS = 6.5;
const CHAIN_RELAX_ITERS = 10;
const LOW_LOAD_CHAIN_RELAX_ITERS = 5;

// Stone column constants (4 immovable pillars at hard-coded locations)
const STONE_COLUMN_COUNT = 4;
const STONE_COLUMN_RADIUS = 34;
const STONE_COLUMNS = [
  { x: 2637, y: 2637, radius: STONE_COLUMN_RADIUS, height: 76 },
  { x: 1563, y: 2637, radius: STONE_COLUMN_RADIUS, height: 76 },
  { x: 1563, y: 1563, radius: STONE_COLUMN_RADIUS, height: 76 },
  { x: 2637, y: 1563, radius: STONE_COLUMN_RADIUS, height: 76 },
];

// Collision constants
const HAMMER_ENEMY_RESTITUTION = 0.58;
const DAMAGE_PER_IMPULSE = 0.135;
const CHAIN_MOMENTUM_FACTOR = 1 / 3;
const CHAIN_DAMAGE_FACTOR = (1 / 3) * 1.2; // Increased chain damage by 20% (0.4)
const INITIAL_HAMMER_MASS = 0.875;
const HAMMER_WEIGHT_BONUS = 0.35;
const EXPLOSION_RADIUS = 420;

const PICKUP_TYPES = ['link', 'weight', 'health', 'bomb', 'speed', 'flame'];
const PICKUP_RADIUS = 10;
const MAX_PICKUP_COUNT = 40;
const MAX_HAMMERS_PER_PLAYER = 2;
const EXTRA_HAMMER_DURATION = 60.0;
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
const RARE_THOR_DROP_CHANCE = 0.005;

const ZOMBIE_WEB_DURATION = 30.0;
const SPIDER_HAMMER_DURATION = 60.0;
const THOR_HAMMER_DURATION = 60.0;
const THOR_EXPLOSION_RADIUS = EXPLOSION_RADIUS * 0.5;
const THOR_BLAST_DAMAGE_MULT = 0.5;

const JACKOLANTERN_HAMMER_DURATION = 60.0;
const DISCO_HAMMER_DURATION = 60.0;
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

const INITIAL_ENEMY_COUNT = 24;
const MAX_ENEMY_COUNT = 31;
const VICTORY_KILL_TARGET = 1000;
const VICTORY_DISPLAY_DURATION = 5.0;
const LEADERBOARD_MAX_ENTRIES = 10;
const MAX_NICKNAME_LENGTH = 20;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_LEADERBOARD_FILE = path.join(PROJECT_ROOT, 'leaderboard.json');

const PLAYER_PALETTES = [
  { name: 'Knight', armor: '#63b3ed', cape: '#742a2a', plume: '#ecc94b' },
  { name: 'Paladin', armor: '#f6ad55', cape: '#2b6cb0', plume: '#fefcbf' },
  { name: 'Warden', armor: '#68d391', cape: '#22543d', plume: '#fbd38d' },
  { name: 'Vanguard', armor: '#b794f4', cape: '#553c9a', plume: '#fed7e2' },
  { name: 'Berserker', armor: '#fc8181', cape: '#742a2a', plume: '#f6e05e' },
  { name: 'Templar', armor: '#4fd1c5', cape: '#234e52', plume: '#ffffff' },
];

// --- World State ---
const stoneColumns = STONE_COLUMNS.map((col) => ({ ...col }));
const enemies = [];
const blackCircles = [];
const players = new Map(); // id -> player object
const leaderboardRecords = new Map(); // lowercase nickname -> { name, kills, color, updatedAt }
let leaderboardFilePath =
  process.env.LEADERBOARD_FILE !== undefined
    ? process.env.LEADERBOARD_FILE
    : require.main === module
    ? DEFAULT_LEADERBOARD_FILE
    : null;
let nextPlayerNum = 1;
let nextEnemyId = 1;
let nextPickupId = 1;
let elapsedGameTime = 0;
let spawnTimer = 0;
let earthquakeTimer = 0; // > 0 during a 5s earthquake
let roundRestartTimer = 0; // Counts down when round ends (victory or defeat)
let roundState = 'playing'; // 'playing' | 'victory' | 'defeat'
let teamKills = 0;
let victoryInfo = null;
let pendingEvents = [];
let activePhysicsSubsteps = PHYSICS_SUBSTEPS;
let activeChainRelaxIters = CHAIN_RELAX_ITERS;
let avgTickMs = 0;
let isReducedFidelity = false;

function updateServerSimulationFidelity(tickDurationMs) {
  if (
    typeof tickDurationMs !== 'number' ||
    !Number.isFinite(tickDurationMs) ||
    tickDurationMs < 0
  ) {
    return;
  }
  avgTickMs = avgTickMs === 0 ? tickDurationMs : avgTickMs * 0.8 + tickDurationMs * 0.2;
  if (!isReducedFidelity && avgTickMs > TICK_LOAD_THRESHOLD_MS) {
    isReducedFidelity = true;
    activePhysicsSubsteps = LOW_LOAD_PHYSICS_SUBSTEPS;
    activeChainRelaxIters = LOW_LOAD_CHAIN_RELAX_ITERS;
  } else if (isReducedFidelity && avgTickMs < TICK_RECOVERY_THRESHOLD_MS) {
    isReducedFidelity = false;
    activePhysicsSubsteps = PHYSICS_SUBSTEPS;
    activeChainRelaxIters = CHAIN_RELAX_ITERS;
  }
}

function initStoneColumns() {
  stoneColumns.length = 0;
  for (let i = 0; i < STONE_COLUMNS.length; i++) {
    stoneColumns.push({ ...STONE_COLUMNS[i] });
  }
}

function getChainRestLength(chainLinks, linkLength = LENGTH_PER_LINK) {
  return BASE_CHAIN_OFFSET + chainLinks * (linkLength || LENGTH_PER_LINK);
}

function initHammerChainNodes(p, h) {
  h.chainNodes = [];
  const links = Math.min(MAX_CHAIN_LINKS, h.chainLinks || INITIAL_CHAIN_LINKS);
  h.chainLinks = links;
  for (let i = 0; i <= links; i++) {
    const t = links > 0 ? i / links : 0;
    h.chainNodes.push({
      x: p.x + (h.x - p.x) * t,
      y: p.y + (h.y - p.y) * t,
      vx: p.vx + (h.vx - p.vx) * t,
      vy: p.vy + (h.vy - p.vy) * t,
      prevX: p.x + (h.x - p.x) * t,
      prevY: p.y + (h.y - p.y) * t,
    });
  }
}

function addHammerChainLinkNode(p, h) {
  const n = h.chainNodes.length;
  if (n >= 2) {
    const prev = h.chainNodes[n - 2];
    const last = h.chainNodes[n - 1];
    const midX = (prev.x + last.x) * 0.5;
    const midY = (prev.y + last.y) * 0.5;
    h.chainNodes.splice(n - 1, 0, {
      x: midX,
      y: midY,
      vx: (prev.vx + last.vx) * 0.5,
      vy: (prev.vy + last.vy) * 0.5,
      prevX: midX,
      prevY: midY,
    });
  } else {
    initHammerChainNodes(p, h);
  }
}

function createPlayerHammer(p, spawnAngle = Math.PI / 2) {
  const initLen = getChainRestLength(INITIAL_CHAIN_LINKS, LENGTH_PER_LINK);
  const h = {
    x: p.x + Math.cos(spawnAngle) * initLen * 0.85,
    y: p.y + Math.sin(spawnAngle) * initLen * 0.85,
    vx: 0,
    vy: 0,
    radius: 17,
    mass: INITIAL_HAMMER_MASS,
    chainLinks: INITIAL_CHAIN_LINKS,
    linkLength: LENGTH_PER_LINK,
    chainNodes: [],
    bombCharges: 0,
    flameCharges: 0,
    flameTimer: 0,
    discoTimer: 0,
    jackolanternTimer: 0,
    spiderTimer: 0,
    thorTimer: 0,
    extraTimer: 0,
    isSpider: false,
    angle: spawnAngle,
    currentTension: 0,
    currentStretch: 0,
  };
  initHammerChainNodes(p, h);
  return h;
}

function touchesStoneColumn(px, py, padRadius) {
  for (let i = 0; i < stoneColumns.length; i++) {
    const col = stoneColumns[i];
    if (Math.hypot(px - col.x, py - col.y) < col.radius + padRadius + 30) {
      return true;
    }
  }
  return false;
}

function getRandomPlayerSpawnPosition() {
  let x = WORLD_WIDTH / 2;
  let y = WORLD_HEIGHT / 2;
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidateX = 480 + Math.random() * (WORLD_WIDTH - 960);
    const candidateY = 480 + Math.random() * (WORLD_HEIGHT - 960);
    if (touchesStoneColumn(candidateX, candidateY, 45)) continue;

    let tooCloseToEnemy = false;
    for (let i = 0; i < enemies.length; i++) {
      if (Math.hypot(candidateX - enemies[i].x, candidateY - enemies[i].y) < 220) {
        tooCloseToEnemy = true;
        break;
      }
    }
    if (!tooCloseToEnemy) {
      x = candidateX;
      y = candidateY;
      break;
    }
  }
  return { x, y };
}

function applyDamageToPlayer(p, damage) {
  if ((p.bulldozerTimer || 0) > 0) {
    // Invulnerable while transformed into a bulldozer
    return false;
  }
  if (p.mountType && p.mountHp > 0) {
    p.mountHp = Math.max(0, p.mountHp - damage);
    p.hurtFlash = 0.25;
    if (p.mountHp <= 0) {
      const lostMount = p.mountType.toUpperCase();
      p.mountType = null;
      p.mountHp = 0;
      p.mountMaxHp = 0;
      p.radius = 20;
      pendingEvents.push({
        type: 'floating_text',
        x: Math.round(p.x),
        y: Math.round(p.y - p.radius - 22),
        text: `${lostMount} LOST!`,
        color: '#f6ad55',
        scale: 1.15,
      });
    }
    return false;
  }
  p.hp = Math.max(0, p.hp - damage);
  p.hurtFlash = 0.25;
  if (p.hp <= 0) {
    p.alive = false;
    return true;
  }
  return false;
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

function getLeaderboardFilePath() {
  return leaderboardFilePath;
}

function setLeaderboardFilePath(filePath) {
  leaderboardFilePath =
    filePath === undefined
      ? process.env.LEADERBOARD_FILE !== undefined
        ? process.env.LEADERBOARD_FILE
        : require.main === module
        ? DEFAULT_LEADERBOARD_FILE
        : null
      : filePath;
}

function sortLeaderboardEntries(entries) {
  return entries.slice().sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
    return a.name.localeCompare(b.name);
  });
}

function readLeaderboardEntriesFromDisk(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  try {
    const rawText = fs.readFileSync(filePath, 'utf8');
    if (!rawText || !rawText.trim()) return [];
    const parsed = JSON.parse(rawText);
    return Array.isArray(parsed)
      ? parsed
      : parsed && Array.isArray(parsed.entries)
      ? parsed.entries
      : [];
  } catch (_err) {
    return [];
  }
}

function mergeLeaderboardListIntoMap(list, targetMap = leaderboardRecords) {
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== 'object') continue;
    const cleanName = sanitizeNickname(item.name, '');
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    const numericKills = Math.max(0, Math.floor(Number(item.kills) || 0));
    const updatedAt =
      typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
        ? item.updatedAt
        : Date.now() + i;
    const color = typeof item.color === 'string' && item.color ? item.color : '#f6e05e';
    const existing = targetMap.get(key);
    if (!existing || numericKills > existing.kills) {
      targetMap.set(key, {
        name: cleanName,
        kills: numericKills,
        color,
        updatedAt,
      });
    }
  }
}

function saveLeaderboardToFile(filePath = leaderboardFilePath, options: any = {}) {
  if (!filePath) return false;
  try {
    if (!options || !options.overwrite) {
      const diskEntries = readLeaderboardEntriesFromDisk(filePath);
      if (diskEntries.length > 0) {
        mergeLeaderboardListIntoMap(diskEntries, leaderboardRecords);
      }
    }
    const sorted = sortLeaderboardEntries(Array.from(leaderboardRecords.values()));
    const payload = {
      updatedAt: new Date().toISOString(),
      entries: sorted.map((entry, idx) => ({
        rank: idx + 1,
        name: entry.name,
        kills: entry.kills,
        color: entry.color || '#f6e05e',
        updatedAt: entry.updatedAt || Date.now(),
      })),
    };
    const json = JSON.stringify(payload, null, 2) + '\n';
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, json, 'utf8');
    try {
      fs.renameSync(tmpPath, filePath);
    } catch (_renameErr) {
      fs.writeFileSync(filePath, json, 'utf8');
      try {
        fs.unlinkSync(tmpPath);
      } catch (_unlinkErr) {
        // Ignore cleanup error
      }
    }
    return true;
  } catch (_err) {
    return false;
  }
}

function loadLeaderboardFromFile(filePath = leaderboardFilePath) {
  if (!filePath) return getTopLeaderboard();
  try {
    if (!fs.existsSync(filePath)) {
      return getTopLeaderboard();
    }
    const list = readLeaderboardEntriesFromDisk(filePath);
    leaderboardRecords.clear();
    mergeLeaderboardListIntoMap(list, leaderboardRecords);
  } catch (_err) {
    // Ignore missing or malformed file and keep current in-memory records
  }
  return getTopLeaderboard();
}

function recordLeaderboardKillScore(name, killsCount, color = '#f6e05e') {
  const cleanName = sanitizeNickname(name, '');
  if (!cleanName) return null;
  const key = cleanName.toLowerCase();
  const numericKills = Math.max(0, Math.floor(Number(killsCount) || 0));
  const existing = leaderboardRecords.get(key);
  if (existing) {
    let changed = false;
    if (existing.name !== cleanName) {
      existing.name = cleanName;
      changed = true;
    }
    if (color && existing.color !== color) {
      existing.color = color;
      changed = true;
    }
    if (numericKills > existing.kills) {
      existing.kills = numericKills;
      existing.updatedAt = Date.now();
      changed = true;
    }
    if (changed) {
      saveLeaderboardToFile();
    }
    return existing;
  }
  const entry = {
    name: cleanName,
    kills: numericKills,
    color: color || '#f6e05e',
    updatedAt: Date.now(),
  };
  leaderboardRecords.set(key, entry);
  saveLeaderboardToFile();
  return entry;
}

function updateLeaderboardForPlayer(p) {
  if (!p || !p.name) return;
  if (p.hasCustomNickname || (p.kills || 0) > 0) {
    recordLeaderboardKillScore(p.name, p.kills || 0, p.color);
  }
}

function setPlayerNickname(p, rawNickname) {
  if (!p) return '';
  const cleanName = sanitizeNickname(rawNickname, p.name || 'Warrior');
  const oldKey = (p.name || '').toLowerCase();
  const newKey = cleanName.toLowerCase();
  let removedOld = false;
  if (oldKey && oldKey !== newKey && !p.hasCustomNickname) {
    const oldEntry = leaderboardRecords.get(oldKey);
    if (oldEntry && oldEntry.kills <= (p.kills || 0)) {
      leaderboardRecords.delete(oldKey);
      removedOld = true;
    }
  }
  p.name = cleanName;
  p.hasCustomNickname = true;
  updateLeaderboardForPlayer(p);
  if (removedOld) {
    saveLeaderboardToFile();
  }
  return cleanName;
}

function getTopLeaderboard() {
  for (const p of players.values()) {
    updateLeaderboardForPlayer(p);
  }
  const sorted = sortLeaderboardEntries(Array.from(leaderboardRecords.values()));
  return sorted.slice(0, LEADERBOARD_MAX_ENTRIES).map((entry, idx) => ({
    rank: idx + 1,
    name: entry.name,
    kills: entry.kills,
    color: entry.color,
  }));
}

function clearLeaderboard(options: any = {}) {
  leaderboardRecords.clear();
  if (options && options.persist) {
    saveLeaderboardToFile(leaderboardFilePath, { overwrite: true });
  }
}

function resetPlayerForNewRound(p) {
  if ((p.kills || 0) > 0 || p.hasCustomNickname) {
    updateLeaderboardForPlayer(p);
  }
  const spawn = getRandomPlayerSpawnPosition();
  p.x = spawn.x;
  p.y = spawn.y;
  p.vx = 0;
  p.vy = 0;
  p.angle = -Math.PI / 2;
  p.radius = 20;
  p.hp = p.maxHp;
  p.alive = true;
  p.mountType = null;
  p.mountHp = 0;
  p.mountMaxHp = 0;
  p.bulldozerTimer = 0;
  p.speedMultiplier = 1.0;
  p.tractionMultiplier = 1.0;
  p.chainLinks = INITIAL_CHAIN_LINKS;
  p.strideCharge = 0;
  p.hurtFlash = 0;
  p.walkCycle = 0;
  p.kills = 0;
  p.maxDamageBlow = 0;

  p.hammers = [createPlayerHammer(p, Math.PI / 2)];
  p.hammer = p.hammers[0];
  p.chainNodes = p.hammer.chainNodes;
  if (p.input) {
    p.input.mouseWorldX = p.x;
    p.input.mouseWorldY = p.y;
  }
}

function createPlayer(id, ws) {
  const num = nextPlayerNum++;
  const palette = PLAYER_PALETTES[(num - 1) % PLAYER_PALETTES.length];
  const p = {
    id,
    ws,
    num,
    name: `${palette.name} #${num}`,
    hasCustomNickname: false,
    color: palette.armor,
    capeColor: palette.cape,
    plumeColor: palette.plume,
    x: WORLD_WIDTH / 2,
    y: WORLD_HEIGHT / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    radius: 20,
    mass: 4.2,
    turnSpeed: 3.3,
    walkThrust: 980,
    runThrust: 1520,
    strideCharge: 0,
    groundTraction: 5.2,
    hp: 100,
    maxHp: 100,
    regenRate: 0,
    alive: true,
    mountType: null,
    mountHp: 0,
    mountMaxHp: 0,
    bulldozerTimer: 0,
    speedMultiplier: 1.0,
    tractionMultiplier: 1.0,
    chainLinks: INITIAL_CHAIN_LINKS,
    walkCycle: 0,
    hurtFlash: 0,
    kills: 0,
    maxDamageBlow: 0,
    hammers: [],
    hammer: null,
    chainNodes: [],
    input: {
      mouseWorldX: WORLD_WIDTH / 2,
      mouseWorldY: WORLD_HEIGHT / 2,
    },
    lastActivityTime: Date.now(),
  };
  resetPlayerForNewRound(p);
  return p;
}

function spawnEnemy(awayFromPlayers = false) {
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

  let x = 200;
  let y = 200;
  const alivePlayers = Array.from(players.values()).filter((p) => p.alive);

  for (let attempts = 0; attempts < 35; attempts++) {
    if (awayFromPlayers && alivePlayers.length > 0) {
      const anchor = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist = 850 + Math.random() * 650;
      x = Math.max(80, Math.min(WORLD_WIDTH - 80, anchor.x + Math.cos(angle) * dist));
      y = Math.max(80, Math.min(WORLD_HEIGHT - 80, anchor.y + Math.sin(angle) * dist));
    } else {
      x = 120 + Math.random() * (WORLD_WIDTH - 240);
      y = 120 + Math.random() * (WORLD_HEIGHT - 240);
    }

    if (touchesStoneColumn(x, y, scaledRadius)) continue;

    let tooClose = false;
    for (let i = 0; i < alivePlayers.length; i++) {
      if (Math.hypot(x - alivePlayers[i].x, y - alivePlayers[i].y) < 340) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) break;
  }

  enemies.push({
    id: nextEnemyId++,
    variant: archetype.variant,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
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
    burnOwner: null,
    fearTimer: 0,
    fearSource: null,
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
  pendingEvents.push({
    type: 'disco_dance',
    x: Math.round(e.x),
    y: Math.round(e.y),
  });
  return true;
}

function taintEnemyWithFear(e, sourcePlayer, duration = FEAR_DURATION) {
  if ((e.fearTimer || 0) > 0 && duration <= e.fearTimer) return false;
  e.fearTimer = duration;
  e.fearSource = sourcePlayer || null;
  const isKnockedDown = earthquakeTimer > 0 || (e.knockdownTimer || 0) > 0;
  if (sourcePlayer && !isKnockedDown) {
    const dx = e.x - sourcePlayer.x;
    const dy = e.y - sourcePlayer.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const burstSpeed = (e.moveForce / e.traction) * FEAR_SPEED_MULT * 0.85;
    e.angle = Math.atan2(uy, ux);
    e.vx = ux * burstSpeed;
    e.vy = uy * burstSpeed;
  }
  pendingEvents.push({
    type: 'fear_taint',
    x: Math.round(e.x),
    y: Math.round(e.y),
  });
  return true;
}

function igniteEnemy(e, sourcePlayer) {
  if (e.burnTimer > 0 || e.fireproofTimer > 0) return false;
  e.burnTimer = ZOMBIE_BURN_DURATION;
  e.burnTickAccum = 0;
  e.burnOwner = sourcePlayer || null;
  pendingEvents.push({
    type: 'ignite',
    x: Math.round(e.x),
    y: Math.round(e.y),
  });
  return true;
}

function getTopKillerName() {
  let topPlayer = null;
  for (const p of players.values()) {
    if (!topPlayer || p.kills > topPlayer.kills) {
      topPlayer = p;
    }
  }
  return topPlayer ? topPlayer.name : 'Warriors';
}

function triggerCoopVictory() {
  if (roundState === 'victory') return;
  roundState = 'victory';
  roundRestartTimer = 0;
  victoryInfo = {
    reason: 'coop_kills',
    title: 'ARENA VICTORY!',
    subtitle: `The warriors defeated ${teamKills} zombies across the battlefield!`,
    teamKills,
    championName: getTopKillerName(),
  };
  pendingEvents.push({
    type: 'victory',
    ...victoryInfo,
  });
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

function serializePickups() {
  return blackCircles.map((pk) => ({
    id: pk.id,
    x: pk.x,
    y: pk.y,
    type: pk.type,
  }));
}

function defeatEnemy(index, killerPlayer) {
  const e = enemies[index];
  teamKills += 1;
  if (killerPlayer) {
    killerPlayer.kills += 1;
    updateLeaderboardForPlayer(killerPlayer);
  }
  const pool = PICKUP_TYPES;
  const rareRoll = Math.random();
  let pickupType;
  if (rareRoll < RARE_BULLDOZER_DROP_CHANCE) {
    pickupType = 'bulldozer';
  } else if (rareRoll < RARE_BULLDOZER_DROP_CHANCE + RARE_ELEPHANT_DROP_CHANCE) {
    pickupType = 'elephant';
  } else if (
    rareRoll <
    RARE_BULLDOZER_DROP_CHANCE + RARE_ELEPHANT_DROP_CHANCE + RARE_HORSE_DROP_CHANCE
  ) {
    pickupType = 'horse';
  } else if (
    rareRoll <
    RARE_BULLDOZER_DROP_CHANCE +
      RARE_ELEPHANT_DROP_CHANCE +
      RARE_HORSE_DROP_CHANCE +
      RARE_TORTOISE_DROP_CHANCE
  ) {
    pickupType = 'tortoise';
  } else if (
    rareRoll <
    RARE_BULLDOZER_DROP_CHANCE +
      RARE_ELEPHANT_DROP_CHANCE +
      RARE_HORSE_DROP_CHANCE +
      RARE_TORTOISE_DROP_CHANCE +
      RARE_EARTHQUAKE_DROP_CHANCE
  ) {
    pickupType = 'earthquake';
  } else if (
    rareRoll <
    RARE_BULLDOZER_DROP_CHANCE +
      RARE_ELEPHANT_DROP_CHANCE +
      RARE_HORSE_DROP_CHANCE +
      RARE_TORTOISE_DROP_CHANCE +
      RARE_EARTHQUAKE_DROP_CHANCE +
      RARE_FEAR_DROP_CHANCE
  ) {
    pickupType = 'fear';
  } else if (
    rareRoll <
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
    rareRoll <
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
    rareRoll <
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
    rareRoll <
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
  } else if (
    rareRoll <
    RARE_BULLDOZER_DROP_CHANCE +
      RARE_ELEPHANT_DROP_CHANCE +
      RARE_HORSE_DROP_CHANCE +
      RARE_TORTOISE_DROP_CHANCE +
      RARE_EARTHQUAKE_DROP_CHANCE +
      RARE_FEAR_DROP_CHANCE +
      RARE_DISCO_DROP_CHANCE +
      RARE_JACKOLANTERN_DROP_CHANCE +
      RARE_SPIDER_DROP_CHANCE +
      RARE_HAMMER_DROP_CHANCE +
      RARE_THOR_DROP_CHANCE
  ) {
    pickupType = 'thor';
  } else {
    pickupType = pool[Math.floor(Math.random() * pool.length)];
  }
  addPickupToWorld({
    id: nextPickupId++,
    x: e.x,
    y: e.y,
    type: pickupType,
  });
  pendingEvents.push({
    type: 'enemy_die',
    x: Math.round(e.x),
    y: Math.round(e.y),
    color: e.skinColor,
  });
  enemies.splice(index, 1);

  if (roundState === 'playing' && teamKills > VICTORY_KILL_TARGET) {
    triggerCoopVictory();
  }
}

function triggerHammerExplosion(ex, ey, sourcePlayer, sourceHammer, options: any = {}) {
  const blastRadius =
    options && typeof options.radius === 'number' ? options.radius : EXPLOSION_RADIUS;
  const damageScale =
    options && typeof options.damageScale === 'number' ? options.damageScale : 1.0;
  const isThor = !!(options && options.isThor);
  pendingEvents.push({
    type: 'explosion',
    x: Math.round(ex),
    y: Math.round(ey),
    radius: blastRadius,
    isThor,
  });

  const isFlamingBlast =
    (sourceHammer && sourceHammer.flameTimer > 0) ||
    (sourcePlayer && sourcePlayer.hammer && sourcePlayer.hammer.flameTimer > 0);

  for (let j = enemies.length - 1; j >= 0; j--) {
    const target = enemies[j];
    const bdx = target.x - ex;
    const bdy = target.y - ey;
    const bDist = Math.hypot(bdx, bdy);
    if (bDist <= blastRadius + target.radius) {
      const falloff = Math.max(0.35, 1 - bDist / (blastRadius + target.radius));
      const blastDamage = Math.round(550 * damageScale * falloff);
      const blastImpulse = 2400 * damageScale * falloff;
      const bnx = bDist > 0.001 ? bdx / bDist : Math.cos(Math.random() * Math.PI * 2);
      const bny = bDist > 0.001 ? bdy / bDist : Math.sin(Math.random() * Math.PI * 2);

      target.vx += (blastImpulse / target.mass) * bnx;
      target.vy += (blastImpulse / target.mass) * bny;
      target.hp -= blastDamage;
      target.hurtFlash = 0.32;
      target.lastBlastKiller = sourcePlayer || null;

      if (isFlamingBlast) {
        igniteEnemy(target, sourcePlayer);
      }

      if (sourcePlayer && blastDamage > sourcePlayer.maxDamageBlow) {
        sourcePlayer.maxDamageBlow = blastDamage;
      }

      pendingEvents.push({
        type: 'floating_text',
        x: Math.round(target.x),
        y: Math.round(target.y - target.radius - 10),
        text: `-${blastDamage}`,
        color: isThor ? '#90cdf4' : '#f6ad55',
        scale: isThor ? 1.25 : 1.35,
      });
    }
  }
}

function resetGameWorld() {
  roundState = 'playing';
  teamKills = 0;
  victoryInfo = null;
  enemies.length = 0;
  blackCircles.length = 0;
  elapsedGameTime = 0;
  spawnTimer = 0;
  earthquakeTimer = 0;
  roundRestartTimer = 0;
  activePhysicsSubsteps = PHYSICS_SUBSTEPS;
  activeChainRelaxIters = CHAIN_RELAX_ITERS;
  avgTickMs = 0;
  isReducedFidelity = false;
  initStoneColumns();

  for (const p of players.values()) {
    resetPlayerForNewRound(p);
  }

  for (let i = 0; i < INITIAL_ENEMY_COUNT; i++) {
    spawnEnemy(false);
  }

  pendingEvents.push({
    type: 'round_reset',
  });
}

const nearbyChainColumns = [];
const nearbyChainEnemies = [];
const BROADPHASE_SLACK = 16;

function updatePlayerBroadphaseBounds(p) {
  let rMinX = p.x - p.radius;
  let rMaxX = p.x + p.radius;
  let rMinY = p.y - p.radius;
  let rMaxY = p.y + p.radius;

  for (let hIdx = 0; hIdx < p.hammers.length; hIdx++) {
    const h = p.hammers[hIdx];
    const links = h.chainLinks || INITIAL_CHAIN_LINKS;
    const hMinX = h.x - h.radius;
    const hMaxX = h.x + h.radius;
    const hMinY = h.y - h.radius;
    const hMaxY = h.y + h.radius;
    if (hMinX < rMinX) rMinX = hMinX;
    if (hMaxX > rMaxX) rMaxX = hMaxX;
    if (hMinY < rMinY) rMinY = hMinY;
    if (hMaxY > rMaxY) rMaxY = hMaxY;

    let cMinX = p.x < h.x ? p.x : h.x;
    let cMaxX = p.x > h.x ? p.x : h.x;
    let cMinY = p.y < h.y ? p.y : h.y;
    let cMaxY = p.y > h.y ? p.y : h.y;
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

  p.reachMinX = rMinX - BROADPHASE_SLACK;
  p.reachMaxX = rMaxX + BROADPHASE_SLACK;
  p.reachMinY = rMinY - BROADPHASE_SLACK;
  p.reachMaxY = rMaxY + BROADPHASE_SLACK;
}

function stepPlayerPhysics(p, dt) {
  if (!p.alive) return;

  if (!p.hammers || p.hammers.length === 0) {
    p.hammers = [createPlayerHammer(p, Math.PI / 2)];
  }
  p.hammer = p.hammers[0];

  if (p.bulldozerTimer > 0) {
    p.bulldozerTimer = Math.max(0, p.bulldozerTimer - dt);
    if (p.bulldozerTimer <= 0) {
      p.radius =
        p.mountType === 'elephant'
          ? 32
          : p.mountType === 'tortoise'
          ? 26
          : p.mountType === 'horse'
          ? 25
          : 20;
    } else {
      p.radius = BULLDOZER_RADIUS;
    }
  }
  const isBulldozer = (p.bulldozerTimer || 0) > 0;

  const mountSpeedMult = isBulldozer
    ? BULLDOZER_SPEED_MULT
    : p.mountType === 'horse'
    ? 2.0
    : p.mountType === 'tortoise'
    ? 0.25
    : p.mountType === 'elephant'
    ? 1.0
    : 1.0;
  const mountTractionMult = isBulldozer
    ? BULLDOZER_TRACTION_MULT
    : p.mountType === 'tortoise'
    ? 20.0
    : p.mountType === 'elephant'
    ? 10.0
    : p.mountType === 'horse'
    ? 5.0
    : 1.0;
  const totalSpeedMult = p.speedMultiplier * mountSpeedMult;
  const totalTractionMult = p.tractionMultiplier * mountTractionMult;

  // 1. Steering & Movement (Mouse Tracking)
  const mdx = p.input.mouseWorldX - p.x;
  const mdy = p.input.mouseWorldY - p.y;
  const distToMouse = Math.hypot(mdx, mdy);

  if (distToMouse > 4) {
    const targetAngle = Math.atan2(mdy, mdx);
    const angleDiff = Math.atan2(
      Math.sin(targetAngle - p.angle),
      Math.cos(targetAngle - p.angle)
    );
    const maxTurn = p.turnSpeed * 2.2 * dt;
    if (Math.abs(angleDiff) <= maxTurn) {
      p.angle = targetAngle;
    } else {
      p.angle += Math.sign(angleDiff) * maxTurn;
    }
  }

  if (distToMouse > 10) {
    p.strideCharge = Math.min(1, p.strideCharge + dt * 1.4);
    const arrivalScale = Math.min(1, (distToMouse - 8) / 42);
    const thrust =
      (p.walkThrust + (p.runThrust - p.walkThrust) * p.strideCharge) *
      totalSpeedMult *
      totalTractionMult *
      arrivalScale;
    p.vx += Math.cos(p.angle) * thrust * dt;
    p.vy += Math.sin(p.angle) * thrust * dt;
  } else {
    p.strideCharge = Math.max(0, p.strideCharge - dt * 3.0);
  }

  const activeTraction = p.groundTraction * totalTractionMult;
  const warriorDamping = Math.exp(-activeTraction * dt);
  p.vx *= warriorDamping;
  p.vy *= warriorDamping;

  // 2. Step each Hammer & Chain owned by this Warrior
  for (let hIdx = 0; hIdx < p.hammers.length; hIdx++) {
    const h = p.hammers[hIdx];
    const links = Math.min(MAX_CHAIN_LINKS, h.chainLinks || INITIAL_CHAIN_LINKS);
    h.chainLinks = links;
    if (!h.chainNodes || h.chainNodes.length !== links + 1) {
      initHammerChainNodes(p, h);
    }

    const restLength = getChainRestLength(links, h.linkLength);
    const segRest = restLength / Math.max(1, links);

    h.chainNodes[0].x = p.x;
    h.chainNodes[0].y = p.y;
    h.chainNodes[0].vx = p.vx;
    h.chainNodes[0].vy = p.vy;

    h.chainNodes[links].x = h.x;
    h.chainNodes[links].y = h.y;
    h.chainNodes[links].vx = h.vx;
    h.chainNodes[links].vy = h.vy;

    let chainMinX = p.x < h.x ? p.x : h.x;
    let chainMaxX = p.x > h.x ? p.x : h.x;
    let chainMinY = p.y < h.y ? p.y : h.y;
    let chainMaxY = p.y > h.y ? p.y : h.y;

    for (let i = 1; i < links; i++) {
      const node = h.chainNodes[i];
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

    for (let iter = 0; iter < activeChainRelaxIters; iter++) {
      let iterTotalDist = 0;
      for (let i = 0; i < links; i++) {
        const sdx = h.chainNodes[i + 1].x - h.chainNodes[i].x;
        const sdy = h.chainNodes[i + 1].y - h.chainNodes[i].y;
        iterTotalDist += Math.sqrt(sdx * sdx + sdy * sdy);
      }
      const desiredSeg = Math.max(segRest, iterTotalDist / Math.max(1, links));

      for (let i = 0; i < links; i++) {
        const a = h.chainNodes[i];
        const b = h.chainNodes[i + 1];
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
        const prev = h.chainNodes[i - 1];
        const curr = h.chainNodes[i];
        const next = h.chainNodes[i + 1];
        const midX = (prev.x + next.x) * 0.5;
        const midY = (prev.y + next.y) * 0.5;
        curr.x += (midX - curr.x) * 0.24;
        curr.y += (midY - curr.y) * 0.24;
      }

      // Wrap chain segments and nodes around nearby immovable stone columns
      for (let cIdx = 0; cIdx < nearbyChainColumns.length; cIdx++) {
        const col = nearbyChainColumns[cIdx];
        const minColDist = col.radius + CHAIN_LINK_RADIUS;
        const minColDistSq = minColDist * minColDist;

        for (let i = 0; i < links; i++) {
          const a = h.chainNodes[i];
          const b = h.chainNodes[i + 1];
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
          const node = h.chainNodes[i];
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

      // Project internal chain nodes out of nearby enemies
      for (let eIdx = 0; eIdx < nearbyChainEnemies.length; eIdx++) {
        const e = nearbyChainEnemies[eIdx];
        const minDist = e.radius + CHAIN_LINK_RADIUS;
        const minDistSq = minDist * minDist;
        for (let i = 1; i < links; i++) {
          const node = h.chainNodes[i];
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
            e.x -= nx * push * 0.08;
            e.y -= ny * push * 0.08;
          }
        }
      }
    }

    for (let i = 1; i < links; i++) {
      const node = h.chainNodes[i];
      const pbdVx = (node.x - node.prevX) / dt;
      const pbdVy = (node.y - node.prevY) / dt;
      const t = i / links;
      const interpVx = p.vx + (h.vx - p.vx) * t;
      const interpVy = p.vy + (h.vy - p.vy) * t;
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

    // 3. Elastic Chain Tension Along Bent Path
    let totalPathDist = 0;
    for (let i = 0; i < links; i++) {
      const sdx = h.chainNodes[i + 1].x - h.chainNodes[i].x;
      const sdy = h.chainNodes[i + 1].y - h.chainNodes[i].y;
      totalPathDist += Math.sqrt(sdx * sdx + sdy * sdy);
    }

    if (totalPathDist > restLength && totalPathDist > 0.0001) {
      const stretch = totalPathDist - restLength;

      const prevHammerNode = h.chainNodes[Math.max(0, links - 1)];
      const hSegDx = h.x - prevHammerNode.x;
      const hSegDy = h.y - prevHammerNode.y;
      const hSegDist = Math.hypot(hSegDx, hSegDy) || 1;
      const uHx = hSegDx / hSegDist;
      const uHy = hSegDy / hSegDist;

      const nextWarriorNode = h.chainNodes[Math.min(links, 1)];
      const wSegDx = nextWarriorNode.x - p.x;
      const wSegDy = nextWarriorNode.y - p.y;
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

      const warriorPullAccel = Math.min(springForce / p.mass, p.walkThrust * 0.35);
      p.vx += warriorPullAccel * uWx * dt;
      p.vy += warriorPullAccel * uWy * dt;
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

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // Collide Warrior with stone columns (or push stone columns when transformed into a Bulldozer!)
  for (let cIdx = 0; cIdx < stoneColumns.length; cIdx++) {
    const col = stoneColumns[cIdx];
    const wdx = p.x - col.x;
    const wdy = p.y - col.y;
    const wDist = Math.hypot(wdx, wdy);
    const minWarriorColDist = p.radius + col.radius;
    if (wDist < minWarriorColDist && wDist > 0.0001) {
      const nx = wdx / wDist;
      const ny = wdy / wDist;
      p.x = col.x + nx * minWarriorColDist;
      p.y = col.y + ny * minWarriorColDist;
      const vn = p.vx * nx + p.vy * ny;
      if (vn < 0) {
        p.vx -= vn * nx;
        p.vy -= vn * ny;
      }
    }
  }

  const pad = p.radius + 24;
  if (p.x < pad) {
    p.x = pad;
    p.vx = Math.max(0, p.vx);
  } else if (p.x > WORLD_WIDTH - pad) {
    p.x = WORLD_WIDTH - pad;
    p.vx = Math.min(0, p.vx);
  }
  if (p.y < pad) {
    p.y = pad;
    p.vy = Math.max(0, p.vy);
  } else if (p.y > WORLD_HEIGHT - pad) {
    p.y = WORLD_HEIGHT - pad;
    p.vy = Math.min(0, p.vy);
  }

  // Advance each Hammer position, collide with stone columns and bounds
  for (let hIdx = 0; hIdx < p.hammers.length; hIdx++) {
    const h = p.hammers[hIdx];
    const links = h.chainLinks || INITIAL_CHAIN_LINKS;

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

    h.chainNodes[0].x = p.x;
    h.chainNodes[0].y = p.y;
    h.chainNodes[links].x = h.x;
    h.chainNodes[links].y = h.y;

    const hammerSpeed = Math.hypot(h.vx, h.vy);
    const lastSegDx = h.x - h.chainNodes[Math.max(0, links - 1)].x;
    const lastSegDy = h.y - h.chainNodes[Math.max(0, links - 1)].y;
    if (hammerSpeed > 25) {
      h.angle = Math.atan2(h.vy, h.vx);
    } else if (Math.hypot(lastSegDx, lastSegDy) > 3) {
      h.angle = Math.atan2(lastSegDy, lastSegDx);
    }

    // Flaming Hammer lasts until it is used (no time decay)
    h.flameTimer = h.flameCharges > 0 ? h.flameCharges : 0;

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
    if (h.thorTimer > 0) {
      h.thorTimer = Math.max(0, h.thorTimer - dt);
    }
    if (hIdx > 0 && h.extraTimer > 0) {
      h.extraTimer = Math.max(0, h.extraTimer - dt);
    }
  }

  // Remove any additional hammers whose 120-second duration has expired
  for (let hIdx = p.hammers.length - 1; hIdx >= 1; hIdx--) {
    const h = p.hammers[hIdx];
    if (h.extraTimer != null && h.extraTimer <= 0) {
      pendingEvents.push({
        type: 'floating_text',
        x: Math.round(h.x),
        y: Math.round(h.y - h.radius - 12),
        text: 'EXTRA HAMMER EXPIRED',
        color: '#b794f4',
        scale: 1.0,
      });
      p.hammers.splice(hIdx, 1);
    }
  }

  // Soft separation & clank between multiple hammers owned by the same player
  for (let i = 0; i < p.hammers.length; i++) {
    for (let j = i + 1; j < p.hammers.length; j++) {
      const ha = p.hammers[i];
      const hb = p.hammers[j];
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

  p.hammer = p.hammers[0];
  p.chainLinks = p.hammer.chainLinks;
  p.chainNodes = p.hammer.chainNodes;

  // While transformed into a bulldozer, the player cannot pick up any other powerups
  if (isBulldozer) {
    updatePlayerBroadphaseBounds(p);
    return;
  }

  // Pickup collection for this player
  for (let i = blackCircles.length - 1; i >= 0; i--) {
    const c = blackCircles[i];
    const maxPickDist = p.radius + PICKUP_RADIUS + 3;
    const pkDx = p.x - c.x;
    if (pkDx <= -maxPickDist || pkDx >= maxPickDist) continue;
    const pkDy = p.y - c.y;
    if (pkDy <= -maxPickDist || pkDy >= maxPickDist) continue;
    if (pkDx * pkDx + pkDy * pkDy < maxPickDist * maxPickDist) {
      const pType = c.type || 'link';
      if (pType === 'hammer' && p.hammers.length >= MAX_HAMMERS_PER_PLAYER) {
        // Player already has the maximum of 2 hammers; cannot pick up this powerup
        continue;
      }
      if ((pType === 'horse' || pType === 'tortoise') && p.mountType) {
        // Player already has a mount; cannot pick up a horse or tortoise
        continue;
      }
      if (pType === 'elephant' && p.mountType === 'elephant') {
        // Player already has an elephant; cannot pick up another elephant
        continue;
      }
      if (pType === 'spider' && p.hammers.every((hm) => hm.isSpider)) {
        // All of the player's current hammers are already spiders
        continue;
      }
      if (pType === 'health' && p.hp >= p.maxHp) {
        // Player is already at full health; cannot pick up a health powerup
        continue;
      }

      let label = '+1 CHAIN LINK';
      let color = '#f6e05e';

      if (pType === 'bulldozer') {
        p.bulldozerTimer = BULLDOZER_DURATION;
        p.radius = BULLDOZER_RADIUS;
        pendingEvents.push({
          type: 'bulldozer',
          playerId: p.id,
          x: Math.round(p.x),
          y: Math.round(p.y),
        });
        label = 'BULLDOZER! (20s INVINCIBLE, CRUSH ZOMBIES)';
        color = '#ecc94b';
      } else if (pType === 'hammer') {
        const spreadAngle = p.angle + Math.PI + (p.hammers.length === 1 ? 0.65 : -0.65);
        const newH = createPlayerHammer(p, spreadAngle);
        newH.vx = p.vx + Math.cos(spreadAngle) * 180;
        newH.vy = p.vy + Math.sin(spreadAngle) * 180;
        newH.extraTimer = EXTRA_HAMMER_DURATION;
        p.hammers.push(newH);
        label = `+1 EXTRA HAMMER! (60s, ${p.hammers.length}/${MAX_HAMMERS_PER_PLAYER})`;
        color = '#b794f4';
      } else if (pType === 'horse') {
        p.mountType = 'horse';
        p.mountMaxHp = Math.max(1, Math.round(p.hp));
        p.mountHp = p.mountMaxHp;
        p.radius = 25;
        label = 'WARHORSE MOUNTED! (2x SPEED, 5x GRIP)';
        color = '#ecc94b';
      } else if (pType === 'tortoise') {
        p.mountType = 'tortoise';
        p.mountMaxHp = Math.max(1, Math.round(p.hp));
        p.mountHp = p.mountMaxHp;
        p.radius = 26;
        label = 'GIANT TORTOISE MOUNTED! (1/4x SPEED, 20x GRIP)';
        color = '#68d391';
      } else if (pType === 'elephant') {
        p.mountType = 'elephant';
        p.mountMaxHp = Math.max(250, Math.round(p.maxHp * 2.5));
        p.mountHp = p.mountMaxHp;
        p.radius = 32;
        label = 'WAR ELEPHANT MOUNTED! (1x SPEED, 10x GRIP)';
        color = '#e2e8f0';
      } else if (pType === 'earthquake') {
        earthquakeTimer = EARTHQUAKE_DURATION;
        for (let eIdx = 0; eIdx < enemies.length; eIdx++) {
          enemies[eIdx].knockdownTimer = ZOMBIE_KNOCKDOWN_RECOVERY;
          enemies[eIdx].vx = 0;
          enemies[eIdx].vy = 0;
        }
        pendingEvents.push({
          type: 'earthquake',
          x: Math.round(p.x),
          y: Math.round(p.y),
        });
        label = 'EARTHQUAKE! (5s QUAKE + 5s ZOMBIE KNOCKDOWN)';
        color = '#ecc94b';
      } else if (pType === 'fear') {
        let taintedCount = 0;
        for (let eIdx = 0; eIdx < enemies.length; eIdx++) {
          const e = enemies[eIdx];
          if (Math.hypot(e.x - p.x, e.y - p.y) <= FEAR_INITIAL_RADIUS + e.radius) {
            taintEnemyWithFear(e, p, FEAR_DURATION);
            taintedCount++;
          }
        }
        if (taintedCount === 0 && enemies.length > 0) {
          const sorted = enemies
            .slice()
            .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
          const fallbackCount = Math.min(4, sorted.length);
          for (let k = 0; k < fallbackCount; k++) {
            taintEnemyWithFear(sorted[k], p, FEAR_DURATION);
          }
        }
        pendingEvents.push({
          type: 'fear_wave',
          x: Math.round(p.x),
          y: Math.round(p.y),
          radius: FEAR_INITIAL_RADIUS,
        });
        label = 'FEAR UNLEASHED! (ZOMBIES FLEE AT 4x SPEED)';
        color = '#b794f4';
      } else if (pType === 'disco') {
        const nonDisco = p.hammers.filter((hm) => (hm.discoTimer || 0) <= 0);
        const poolH = nonDisco.length > 0 ? nonDisco : p.hammers;
        const targetH = poolH[Math.floor(Math.random() * poolH.length)];
        targetH.discoTimer = DISCO_HAMMER_DURATION;
        pendingEvents.push({
          type: 'disco_pickup',
          x: Math.round(p.x),
          y: Math.round(p.y),
        });
        label = 'DISCO BALL HAMMER! (60s DANCE FEVER)';
        color = '#f687b3';
      } else if (pType === 'jackolantern') {
        const nonJack = p.hammers.filter((hm) => (hm.jackolanternTimer || 0) <= 0);
        const poolH = nonJack.length > 0 ? nonJack : p.hammers;
        const targetH = poolH[Math.floor(Math.random() * poolH.length)];
        targetH.jackolanternTimer = JACKOLANTERN_HAMMER_DURATION;
        pendingEvents.push({
          type: 'jackolantern_pickup',
          x: Math.round(p.x),
          y: Math.round(p.y),
        });
        label = 'JACK-O-LANTERN HAMMER! (60s)';
        color = '#ed8936';
      } else if (pType === 'spider') {
        const nonSpider = p.hammers.filter((hm) => !hm.isSpider && (hm.spiderTimer || 0) <= 0);
        const poolH = nonSpider.length > 0 ? nonSpider : p.hammers;
        const targetH = poolH[Math.floor(Math.random() * poolH.length)];
        targetH.spiderTimer = SPIDER_HAMMER_DURATION;
        targetH.isSpider = true;
        pendingEvents.push({
          type: 'spider_pickup',
          x: Math.round(p.x),
          y: Math.round(p.y),
        });
        label = 'SPIDER HAMMER! (60s, WEBS ZOMBIES FOR 30s)';
        color = '#e2e8f0';
      } else if (pType === 'thor') {
        const nonThor = p.hammers.filter((hm) => (hm.thorTimer || 0) <= 0);
        const poolH = nonThor.length > 0 ? nonThor : p.hammers;
        const targetH = poolH[Math.floor(Math.random() * poolH.length)];
        targetH.thorTimer = THOR_HAMMER_DURATION;
        pendingEvents.push({
          type: 'thor_pickup',
          x: Math.round(p.x),
          y: Math.round(p.y),
        });
        label = 'THOR HAMMER! (60s, 1/2 BOMB BLAST ON EVERY HIT)';
        color = '#63b3ed';
      } else if (pType === 'link') {
        const underMax = p.hammers.filter(
          (hm) => (hm.chainLinks || INITIAL_CHAIN_LINKS) < MAX_CHAIN_LINKS
        );
        if (underMax.length > 0) {
          const targetH = underMax[Math.floor(Math.random() * underMax.length)];
          const targetIdx = p.hammers.indexOf(targetH);
          targetH.chainLinks += 1;
          addHammerChainLinkNode(p, targetH);
          p.chainLinks = p.hammers[0].chainLinks;
          p.chainNodes = p.hammers[0].chainNodes;
          label =
            p.hammers.length > 1
              ? `+1 CHAIN LINK (HAMMER #${targetIdx + 1})`
              : '+1 CHAIN LINK';
        } else {
          const randIdx = Math.floor(Math.random() * p.hammers.length);
          const targetH = p.hammers[randIdx];
          targetH.linkLength = +(
            (targetH.linkLength || LENGTH_PER_LINK) +
            LENGTH_PER_LINK / MAX_CHAIN_LINKS
          ).toFixed(4);
          label =
            p.hammers.length > 1
              ? `+LINK LENGTH (HAMMER #${randIdx + 1})`
              : '+LINK LENGTH';
        }
        color = '#f6e05e';
      } else if (pType === 'weight') {
        const randIdx = Math.floor(Math.random() * p.hammers.length);
        const targetH = p.hammers[randIdx];
        targetH.mass = +(targetH.mass + HAMMER_WEIGHT_BONUS).toFixed(2);
        const mScale = Math.min(2.35, 1 + (targetH.mass - INITIAL_HAMMER_MASS) * 0.18);
        targetH.radius = +(17 * mScale).toFixed(2);
        label =
          p.hammers.length > 1
            ? `+MACE MASS (HAMMER #${randIdx + 1})`
            : '+MACE MASS';
        color = '#cbd5e0';
      } else if (pType === 'health') {
        const healAmount = p.maxHp * 0.2;
        p.hp = Math.min(p.maxHp, p.hp + healAmount);
        label = `+${Math.round(healAmount)} HP (20%)`;
        color = '#68d391';
      } else if (pType === 'bomb') {
        const unarmed = p.hammers.filter((hm) => hm.bombCharges === 0);
        const poolH = unarmed.length > 0 ? unarmed : p.hammers;
        const targetH = poolH[Math.floor(Math.random() * poolH.length)];
        targetH.bombCharges += 1;
        label = 'BOMB ARMED!';
        color = '#f6ad55';
      } else if (pType === 'speed') {
        p.speedMultiplier = +(p.speedMultiplier * 1.05).toFixed(4);
        label = '+5% SPEED';
        color = '#63b3ed';
      } else if (pType === 'flame') {
        const unflamed = p.hammers.filter((hm) => (hm.flameCharges || 0) === 0);
        const poolH = unflamed.length > 0 ? unflamed : p.hammers;
        const targetH = poolH[Math.floor(Math.random() * poolH.length)];
        targetH.flameCharges = (targetH.flameCharges || 0) + 1;
        targetH.flameTimer = targetH.flameCharges;
        label = 'FLAMING HAMMER ARMED!';
        color = '#ff6b35';
      }

      pendingEvents.push({
        type: 'pickup',
        playerId: p.id,
        x: Math.round(c.x),
        y: Math.round(c.y),
        playerX: Math.round(p.x),
        playerY: Math.round(p.y - p.radius - 16),
        label,
        color,
      });

      blackCircles.splice(i, 1);
      if ((p.bulldozerTimer || 0) > 0) {
        break;
      }
    }
  }

  updatePlayerBroadphaseBounds(p);
}

function stepWorldPhysics(dt) {
  if (earthquakeTimer > 0) {
    earthquakeTimer = Math.max(0, earthquakeTimer - dt);
  }

  const alivePlayers = [];
  for (const p of players.values()) {
    if (p.alive) {
      alivePlayers.push(p);
      stepPlayerPhysics(p, dt);
    }
  }

  // Update Enemies (Zombies) — each moves toward the closest alive player
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

    // Flaming zombie burn damage over time (5s burning -> 5s fire-proof)
    if (e.burnTimer > 0) {
      const stepBurn = Math.min(dt, e.burnTimer);
      e.burnTimer -= stepBurn;
      e.hp -= ZOMBIE_BURN_DPS * stepBurn;
      e.burnTickAccum = (e.burnTickAccum || 0) + stepBurn;

      if (e.burnTickAccum >= 1.0) {
        e.burnTickAccum -= 1.0;
        pendingEvents.push({
          type: 'floating_text',
          x: Math.round(e.x),
          y: Math.round(e.y - e.radius - 10),
          text: `-${ZOMBIE_BURN_DPS}`,
          color: '#ff6b35',
          scale: 0.95,
        });
      }

      if (e.burnTimer <= 0.0001) {
        e.burnTimer = 0;
        e.burnTickAccum = 0;
        e.fireproofTimer = ZOMBIE_FIREPROOF_DURATION;
      }

      if (e.hp <= 0) {
        defeatEnemy(i, e.burnOwner);
        continue;
      }
    } else if (e.fireproofTimer > 0) {
      e.fireproofTimer = Math.max(0, e.fireproofTimer - dt);
    }

    if (e.fearTimer > 0) {
      e.fearTimer = Math.max(0, e.fearTimer - dt);
      if (e.fearTimer <= 0) {
        e.fearSource = null;
      }
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

    // Spider webbing state (30s wrapped in white webbing and unable to move)
    if (e.webTimer > 0) {
      e.webTimer = Math.max(0, e.webTimer - dt);
    }
    const isWebbed = (e.webTimer || 0) > 0;

    // Speed multiplier: 4x when fleeing in fear, 3x when flaming, 1/2x when fire-proof
    let speedMult = e.burnTimer > 0 ? 3.0 : e.fireproofTimer > 0 ? 0.5 : 1.0;
    if (isFeared) {
      speedMult = Math.max(speedMult, FEAR_SPEED_MULT);
    }

    // Find closest alive player using squared distance first
    let closestPlayer = null;
    let closestDistSq = Infinity;
    for (let pIdx = 0; pIdx < alivePlayers.length; pIdx++) {
      const candidate = alivePlayers[pIdx];
      const pdx = candidate.x - e.x;
      const pdy = candidate.y - e.y;
      const dSq = pdx * pdx + pdy * pdy;
      if (dSq < closestDistSq) {
        closestDistSq = dSq;
        closestPlayer = candidate;
      }
    }
    const closestDist = closestPlayer ? Math.sqrt(closestDistSq) : Infinity;

    if (isKnockedDown) {
      // Fallen zombies remain motionless on the ground unless actively knocked back by a hammer/chain hit
      if (e.hitCooldown <= 0 && e.chainHitCooldown <= 0) {
        e.vx = 0;
        e.vy = 0;
      } else {
        const kdDamp = Math.exp(-e.traction * 5.0 * dt);
        e.vx *= kdDamp;
        e.vy *= kdDamp;
      }
    } else if (isWebbed) {
      // Wrapped in spider webbing: cannot move!
      if (e.hitCooldown <= 0 && e.chainHitCooldown <= 0) {
        e.vx = 0;
        e.vy = 0;
      } else {
        const webDamp = Math.exp(-e.traction * 8.0 * dt);
        e.vx *= webDamp;
        e.vy *= webDamp;
      }
    } else if (isDancing) {
      // Stand in one place and dance!
      e.vx = 0;
      e.vy = 0;
    } else if (closestPlayer && closestDist > 0.001) {
      if (isFeared) {
        const refPlayer =
          e.fearSource && e.fearSource.alive ? e.fearSource : closestPlayer;
        const awayX = e.x - refPlayer.x;
        const awayY = e.y - refPlayer.y;
        const awayDist = Math.sqrt(awayX * awayX + awayY * awayY) || 1;
        let dirX = awayX / awayDist;
        let dirY = awayY / awayDist;

        // Deflect slightly along arena borders so fleeing zombies keep scurrying instead of pinning in a corner
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
        const dirX = (closestPlayer.x - e.x) / closestDist;
        const dirY = (closestPlayer.y - e.y) / closestDist;
        e.angle = Math.atan2(dirY, dirX);
        e.vx += dirX * e.moveForce * speedMult * dt;
        e.vy += dirY * e.moveForce * speedMult * dt;
      }
    }

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

    const ePad = e.radius + 20;
    e.x = Math.max(ePad, Math.min(WORLD_WIDTH - ePad, e.x));
    e.y = Math.max(ePad, Math.min(WORLD_HEIGHT - ePad, e.y));

    // Collide zombie with the immovable stone columns
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

    // Check collisions against every alive player's Maces, Chains, and Warrior body
    let enemyDefeated = false;
    for (let pIdx = 0; pIdx < alivePlayers.length; pIdx++) {
      const p = alivePlayers[pIdx];
      if (!p.alive) continue;

      // Broadphase reject: skip this player entirely if enemy is outside player's total reach AABB
      if (
        e.x + e.radius < p.reachMinX ||
        e.x - e.radius > p.reachMaxX ||
        e.y + e.radius < p.reachMinY ||
        e.y - e.radius > p.reachMaxY
      ) {
        continue;
      }

      for (let hIdx = 0; hIdx < p.hammers.length; hIdx++) {
        const h = p.hammers[hIdx];
        const links = h.chainLinks || INITIAL_CHAIN_LINKS;

        // A. Spikey Mace (or Disco Ball) vs. Zombie
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
                if (igniteEnemy(e, p)) {
                  justIgnited = true;
                  h.flameCharges -= 1;
                  h.flameTimer = h.flameCharges > 0 ? h.flameCharges : 0;
                }
              }

              if (h.isSpider) {
                const wasFreshlyWebbed = (e.webTimer || 0) > ZOMBIE_WEB_DURATION - 0.45;
                e.webTimer = ZOMBIE_WEB_DURATION;
                if (!wasFreshlyWebbed) {
                  pendingEvents.push({
                    type: 'spider_web',
                    x: Math.round(e.x),
                    y: Math.round(e.y),
                  });
                }
              }

              let detonatedBomb = false;
              let detonatedThor = false;
              if (h.bombCharges > 0) {
                h.bombCharges -= 1;
                detonatedBomb = true;
                triggerHammerExplosion(h.x + nx * h.radius, h.y + ny * h.radius, p, h);
              } else if ((h.thorTimer || 0) > 0 && e.hitCooldown <= 0) {
                detonatedBomb = true;
                detonatedThor = true;
                triggerHammerExplosion(h.x + nx * h.radius, h.y + ny * h.radius, p, h, {
                  radius: THOR_EXPLOSION_RADIUS,
                  damageScale: THOR_BLAST_DAMAGE_MULT,
                  isThor: true,
                });
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

                  if (damage > p.maxDamageBlow) {
                    p.maxDamageBlow = damage;
                  }

                  const contactX = h.x + nx * h.radius;
                  const contactY = h.y + ny * h.radius;

                  pendingEvents.push({
                    type: 'impact',
                    x: Math.round(contactX),
                    y: Math.round(contactY),
                    enemyX: Math.round(e.x),
                    enemyY: Math.round(e.y - e.radius - 6),
                    damage,
                    isChain: false,
                  });
                }
              }

              if (detonatedThor && e.hitCooldown <= 0) {
                e.hitCooldown = 0.09;
              }

              // Ensure a zombie newly ignited by the Flaming Hammer survives the initial hit to run on fire
              if (justIgnited && !detonatedBomb && e.hp <= 0) {
                e.hp = Math.max(18, Math.round(e.maxHp * 0.3));
              }

              if (e.hp <= 0) {
                defeatEnemy(i, e.lastBlastKiller || p);
                enemyDefeated = true;
                break;
              }
            }
          }
        }

        // B. Chain vs. Zombie (1/3 momentum transfer & 1/3 damage)
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
            const node = h.chainNodes[cIdx];
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
            const node = h.chainNodes[closestNodeIdx];
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
                h.chainNodes[closestNodeIdx - 1].vx -= cVelAlongNormal * 0.45 * cnx;
                h.chainNodes[closestNodeIdx - 1].vy -= cVelAlongNormal * 0.45 * cny;
              }
              if (closestNodeIdx + 1 < links) {
                h.chainNodes[closestNodeIdx + 1].vx -= cVelAlongNormal * 0.45 * cnx;
                h.chainNodes[closestNodeIdx + 1].vy -= cVelAlongNormal * 0.45 * cny;
              }

              const leverRatio = closestNodeIdx / links;
              h.vx -= ((chainImpulse * leverRatio) / h.mass) * cnx;
              h.vy -= ((chainImpulse * leverRatio) / h.mass) * cny;
              const warriorChainRecoil = Math.min(
                (chainImpulse * (1 - leverRatio)) / p.mass,
                95
              );
              p.vx -= warriorChainRecoil * cnx;
              p.vy -= warriorChainRecoil * cny;

              if (e.chainHitCooldown <= 0 && hammerEquivImpulse > 8) {
                const chainDamage = Math.max(
                  1,
                  Math.round(hammerEquivImpulse * DAMAGE_PER_IMPULSE * CHAIN_DAMAGE_FACTOR)
                );
                e.hp -= chainDamage;
                e.chainHitCooldown = 0.09;
                e.hurtFlash = 0.14;

                if (chainDamage > p.maxDamageBlow) {
                  p.maxDamageBlow = chainDamage;
                }

                pendingEvents.push({
                  type: 'impact',
                  x: Math.round(node.x),
                  y: Math.round(node.y),
                  enemyX: Math.round(e.x),
                  enemyY: Math.round(e.y - e.radius - 6),
                  damage: chainDamage,
                  isChain: true,
                });

                if (e.hp <= 0) {
                  defeatEnemy(i, p);
                  enemyDefeated = true;
                  break;
                }
              }
            }
          }
        }
      }

      if (enemyDefeated) break;

      // C. Zombie touches Player Warrior
      const minWarriorEnemyDist = p.radius + e.radius;
      const wdx = p.x - e.x;
      if (wdx <= -minWarriorEnemyDist || wdx >= minWarriorEnemyDist) continue;
      const wdy = p.y - e.y;
      if (wdy <= -minWarriorEnemyDist || wdy >= minWarriorEnemyDist) continue;
      const wDistSq = wdx * wdx + wdy * wdy;

      if (wDistSq < minWarriorEnemyDist * minWarriorEnemyDist && wDistSq > 1e-8) {
        const wDist = Math.sqrt(wDistSq);
        if ((p.bulldozerTimer || 0) > 0) {
          // While a bulldozer, the player takes no damage and instantly kills any zombie they touch
          const crushDmg = Math.max(1, Math.ceil(e.hp));
          if (crushDmg > p.maxDamageBlow) {
            p.maxDamageBlow = crushDmg;
          }
          pendingEvents.push({
            type: 'floating_text',
            x: Math.round(e.x),
            y: Math.round(e.y - e.radius - 10),
            text: 'CRUSHED!',
            color: '#ecc94b',
            scale: 1.2,
          });
          defeatEnemy(i, p);
          enemyDefeated = true;
          break;
        }

        const wnx = wdx / wDist;
        const wny = wdy / wDist;
        const wOverlap = minWarriorEnemyDist - wDist;

        if (isDancing || isKnockedDown || isWebbed) {
          p.x += wnx * wOverlap;
          p.y += wny * wOverlap;
        } else {
          p.x += wnx * wOverlap * 0.55;
          p.y += wny * wOverlap * 0.55;
          e.x -= wnx * wOverlap * 0.45;
          e.y -= wny * wOverlap * 0.45;
          e.vx -= wnx * 90 * dt * 8.5;
          e.vy -= wny * 90 * dt * 8.5;
        }

        p.vx += wnx * e.contactPush * dt * 8.5;
        p.vy += wny * e.contactPush * dt * 8.5;

        if (!isKnockedDown && !isDancing && !isWebbed && e.contactCooldown <= 0) {
          applyDamageToPlayer(p, e.contactDamage);
          e.contactCooldown = 0.55;

          pendingEvents.push({
            type: 'player_hurt',
            playerId: p.id,
            x: Math.round(p.x - wnx * p.radius),
            y: Math.round(p.y - wny * p.radius),
            playerX: Math.round(p.x),
            playerY: Math.round(p.y - p.radius - 10),
            damage: e.contactDamage,
          });
        }
      }
    }

    if (enemyDefeated) continue;
  }

  // Sweep any additional zombies defeated by bomb blast splash damage
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].hp <= 0) {
      defeatEnemy(i, enemies[i].lastBlastKiller || null);
    }
  }

  // Soft zombie-to-zombie separation & flaming zombie contagion
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
          igniteEnemy(b, a.burnOwner);
        } else if (b.burnTimer > 0 && a.burnTimer <= 0 && a.fireproofTimer <= 0) {
          igniteEnemy(a, b.burnOwner);
        }

        // Fear contagion: a feared zombie taints any zombie it touches with fear for the remaining duration
        if ((a.fearTimer || 0) > 0 && (b.fearTimer || 0) <= 0) {
          taintEnemyWithFear(b, a.fearSource, a.fearTimer);
        } else if ((b.fearTimer || 0) > 0 && (a.fearTimer || 0) <= 0) {
          taintEnemyWithFear(a, b.fearSource, b.fearTimer);
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

  // Warrior-to-Warrior Body Separation
  for (let i = 0; i < alivePlayers.length; i++) {
    const a = alivePlayers[i];
    if (!a.alive) continue;

    for (let j = i + 1; j < alivePlayers.length; j++) {
      const b = alivePlayers[j];
      if (!b.alive) continue;
      const pdx = b.x - a.x;
      const pdy = b.y - a.y;
      const pDist = Math.hypot(pdx, pdy);
      const minWarriorDist = a.radius + b.radius;
      if (pDist < minWarriorDist && pDist > 0.0001) {
        const pnx = pdx / pDist;
        const pny = pdy / pDist;
        const overlap = (minWarriorDist - pDist) * 0.5;
        a.x -= pnx * overlap;
        a.y -= pny * overlap;
        b.x += pnx * overlap;
        b.y += pny * overlap;
      }
    }
  }
}

function tickServer(dt) {
  if (players.size === 0) return;

  // Prune idle players who left their browser window open without any input
  const nowMs = Date.now();
  for (const [pid, p] of players.entries()) {
    const idleSec = (nowMs - (p.lastActivityTime || nowMs)) / 1000;
    const maxIdleSec = p.alive ? 120 : 45;
    if (idleSec >= maxIdleSec) {
      if (p.ws && !p.ws.destroyed) {
        try {
          p.ws.write(
            encodeWsFrame(
              JSON.stringify({
                type: 'idle_disconnect',
                reason: 'Disconnected due to inactivity.',
              })
            )
          );
          p.ws.end();
        } catch (_err) {
          // Ignore socket write error
        }
      }
      updateLeaderboardForPlayer(p);
      players.delete(pid);
    }
  }
  if (players.size === 0) return;

  // If the Victory Page is currently displayed, count down and start the next round
  if (roundState === 'victory') {
    roundRestartTimer += dt;
    if (roundRestartTimer >= VICTORY_DISPLAY_DURATION) {
      resetGameWorld();
    }
    return;
  }

  // Count surviving players
  let aliveCount = 0;
  for (const p of players.values()) {
    if (p.alive) {
      aliveCount++;
    }
  }

  // If all connected players have died, count down 3s and restart
  if (aliveCount === 0) {
    roundState = 'defeat';
    roundRestartTimer += dt;
    if (roundRestartTimer >= 3.0) {
      resetGameWorld();
    }
    return;
  } else {
    roundState = 'playing';
    roundRestartTimer = 0;
  }

  const tickStartMs = performance.now();
  const substeps = activePhysicsSubsteps;
  const subDt = dt / substeps;
  for (let s = 0; s < substeps; s++) {
    stepWorldPhysics(subDt);
    if (roundState === 'victory') break;
  }

  if (roundState === 'victory') {
    updateServerSimulationFidelity(performance.now() - tickStartMs);
    return;
  }

  // Per-frame player walk cycle and hurt flash decay (no automatic HP regeneration)
  for (const p of players.values()) {
    if (!p.alive) continue;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 15) {
      p.walkCycle += speed * dt * 0.085;
    }
    if (p.hurtFlash > 0) {
      p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    }
  }

  elapsedGameTime += dt;
  const extraPlayers = Math.max(0, players.size - 2);
  const spawnRateMult = 1 + extraPlayers * 0.25;
  const spawnInterval = 2.7 / spawnRateMult;
  const maxEnemies = Math.round(MAX_ENEMY_COUNT * spawnRateMult);
  spawnTimer += dt;
  if (spawnTimer >= spawnInterval) {
    if (enemies.length < maxEnemies) {
      spawnTimer -= spawnInterval;
      spawnEnemy(true);
    } else {
      spawnTimer = 0;
    }
  }

  updateServerSimulationFidelity(performance.now() - tickStartMs);
}

// --- Native RFC 6455 WebSocket Framing Helpers ---
function encodeWsFrame(jsonString) {
  const payload = Buffer.from(jsonString, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text frame
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function setupSocketReader(socket, onMessage, onClose) {
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < 4) return;
        payloadLen = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buffer.length < 10) return;
        payloadLen = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLen = isMasked ? 4 : 0;
      if (buffer.length < offset + maskLen + payloadLen) return;

      const payload = buffer.subarray(offset + maskLen, offset + maskLen + payloadLen);
      if (isMasked) {
        const mask = buffer.subarray(offset, offset + 4);
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i & 3];
        }
      }

      buffer = buffer.subarray(offset + maskLen + payloadLen);

      if (opcode === 0x08) {
        // Close frame
        socket.end();
        return;
      } else if (opcode === 0x09) {
        // Ping -> Pong
        const pong = Buffer.alloc(2 + payload.length);
        pong[0] = 0x8a;
        pong[1] = payload.length;
        payload.copy(pong, 2);
        socket.write(pong);
      } else if (opcode === 0x01) {
        try {
          const msg = JSON.parse(payload.toString('utf8'));
          onMessage(msg);
        } catch (_err) {
          // Ignore malformed JSON
        }
      }
    }
  });

  socket.on('close', onClose);
  socket.on('error', () => {});
}

// --- HTTP & WebSocket Server ---
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// --- Server-Side Telemetry & Metrics (Requests/sec, Latency, Player Count) ---
const STATS_HISTORY_MAX_POINTS = 120; // 2 minutes at 1 point/sec
const statsHistory = [];
let currentSecondRequests = 0;
let currentSecondLatencySum = 0;
let currentSecondWsMessages = 0;
let totalServerRequests = 0;
let totalServerWsMessages = 0;
let lastStatsSecond = Math.floor(Date.now() / 1000);

function recordHttpRequestMetric(durationMs) {
  currentSecondRequests++;
  totalServerRequests++;
  if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) {
    currentSecondLatencySum += durationMs;
  }
}

function recordWsMessageMetric() {
  currentSecondWsMessages++;
  totalServerWsMessages++;
}

function flushMetricsTick(nowMs = Date.now()) {
  const currentSec = Math.floor(nowMs / 1000);
  if (currentSec <= lastStatsSecond) return;

  const secondsPassed = Math.min(10, currentSec - lastStatsSecond);
  for (let s = 1; s <= secondsPassed; s++) {
    const secTimestamp = (lastStatsSecond + s) * 1000;
    const isLatest = s === secondsPassed;
    const reqs = isLatest ? currentSecondRequests : 0;
    const wsMsgs = isLatest ? currentSecondWsMessages : 0;
    const latencySum = isLatest ? currentSecondLatencySum : 0;
    const avgLatency = reqs > 0 ? +(latencySum / reqs).toFixed(2) : 0;

    let aliveCount = 0;
    for (const p of players.values()) {
      if (p.alive) aliveCount++;
    }

    statsHistory.push({
      time: secTimestamp,
      isoTime: new Date(secTimestamp).toISOString(),
      players: players.size,
      alivePlayers: aliveCount,
      requestsPerSecond: reqs,
      wsMessagesPerSecond: wsMsgs,
      avgLatencyMs: avgLatency,
    });
  }

  while (statsHistory.length > STATS_HISTORY_MAX_POINTS) {
    statsHistory.shift();
  }

  currentSecondRequests = 0;
  currentSecondLatencySum = 0;
  currentSecondWsMessages = 0;
  lastStatsSecond = currentSec;
}

function getLatestStatsSnapshot() {
  flushMetricsTick();
  const latest = statsHistory[statsHistory.length - 1] || {
    time: Date.now(),
    players: players.size,
    alivePlayers: 0,
    requestsPerSecond: 0,
    wsMessagesPerSecond: 0,
    avgLatencyMs: 0,
  };

  let aliveCount = 0;
  for (const p of players.values()) {
    if (p.alive) aliveCount++;
  }

  return {
    serverTime: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    players: players.size,
    alivePlayers: aliveCount,
    requestsPerSecond: latest.requestsPerSecond || 0,
    wsMessagesPerSecond: latest.wsMessagesPerSecond || 0,
    avgLatencyMs: latest.avgLatencyMs || 0,
    totalRequests: totalServerRequests,
    totalWsMessages: totalServerWsMessages,
    history: statsHistory,
  };
}

function clearStatsHistory() {
  statsHistory.length = 0;
  currentSecondRequests = 0;
  currentSecondLatencySum = 0;
  currentSecondWsMessages = 0;
  totalServerRequests = 0;
  totalServerWsMessages = 0;
  lastStatsSecond = Math.floor(Date.now() / 1000);
}

function renderStatsDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HammerTime — Server Stats Dashboard</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: rgba(22, 27, 34, 0.85);
      --card-border: #30363d;
      --text: #c9d1d9;
      --heading: #f0f6fc;
      --accent-blue: #58a6ff;
      --accent-green: #3fb950;
      --accent-orange: #d29922;
      --accent-purple: #bc8cff;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
      line-height: 1.5;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--card-border);
    }
    h1 {
      font-size: 1.5rem;
      color: var(--heading);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 12px;
      background: rgba(63, 185, 80, 0.2);
      color: var(--accent-green);
      border: 1px solid var(--accent-green);
    }
    .nav-links a {
      color: var(--accent-blue);
      text-decoration: none;
      font-size: 0.9rem;
      margin-left: 16px;
    }
    .nav-links a:hover { text-decoration: underline; }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 16px;
    }
    .card-title {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #8b949e;
      margin-bottom: 6px;
    }
    .card-value {
      font-size: 1.8rem;
      font-weight: 700;
      color: var(--heading);
    }
    .card-sub {
      font-size: 0.8rem;
      color: #8b949e;
      margin-top: 4px;
    }
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 20px;
    }
    .chart-panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 18px;
    }
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 12px;
    }
    .chart-header h2 {
      font-size: 1rem;
      color: var(--heading);
    }
    .chart-latest {
      font-size: 0.95rem;
      font-weight: 600;
    }
    canvas.sparkline {
      width: 100%;
      height: 140px;
      display: block;
      background: #161b22;
      border-radius: 4px;
      border: 1px solid #21262d;
    }
  </style>
</head>
<body>
  <header>
    <h1>
      HammerTime Server Stats
      <span class="badge" id="live-badge">● LIVE 1s</span>
    </h1>
    <div class="nav-links">
      <a href="/" target="_blank">← Return to Battlefield</a>
      <a href="/stats/json" target="_blank">Raw JSON API</a>
    </div>
  </header>

  <section class="cards-grid">
    <div class="card">
      <div class="card-title">Connected Players</div>
      <div class="card-value" id="val-players" style="color: var(--accent-green)">0</div>
      <div class="card-sub" id="val-alive">0 alive</div>
    </div>
    <div class="card">
      <div class="card-title">HTTP Requests / Sec</div>
      <div class="card-value" id="val-rps" style="color: var(--accent-blue)">0</div>
      <div class="card-sub" id="val-total-req">0 total HTTP requests</div>
    </div>
    <div class="card">
      <div class="card-title">Average Latency</div>
      <div class="card-value" id="val-latency" style="color: var(--accent-orange)">0.0 ms</div>
      <div class="card-sub">Server response time</div>
    </div>
    <div class="card">
      <div class="card-title">Server Uptime</div>
      <div class="card-value" id="val-uptime" style="color: var(--accent-purple)">0s</div>
      <div class="card-sub" id="val-time">--:--:--</div>
    </div>
  </section>

  <section class="charts-grid">
    <div class="chart-panel">
      <div class="chart-header">
        <h2>Active Players Over Time</h2>
        <span class="chart-latest" id="latest-players" style="color: var(--accent-green)">0</span>
      </div>
      <canvas id="chart-players" class="sparkline" width="600" height="200"></canvas>
    </div>

    <div class="chart-panel">
      <div class="chart-header">
        <h2>HTTP Requests / Second</h2>
        <span class="chart-latest" id="latest-rps" style="color: var(--accent-blue)">0 req/s</span>
      </div>
      <canvas id="chart-rps" class="sparkline" width="600" height="200"></canvas>
    </div>

    <div class="chart-panel">
      <div class="chart-header">
        <h2>Request Latency (ms)</h2>
        <span class="chart-latest" id="latest-latency" style="color: var(--accent-orange)">0.0 ms</span>
      </div>
      <canvas id="chart-latency" class="sparkline" width="600" height="200"></canvas>
    </div>

    <div class="chart-panel">
      <div class="chart-header">
        <h2>WebSocket Messages / Second</h2>
        <span class="chart-latest" id="latest-ws" style="color: var(--accent-purple)">0 msg/s</span>
      </div>
      <canvas id="chart-ws" class="sparkline" width="600" height="200"></canvas>
    </div>
  </section>

  <script>
    function drawLineChart(canvasId, dataPoints, color, unit, minMaxY) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (!dataPoints || dataPoints.length === 0) {
        ctx.fillStyle = '#8b949e';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Collecting metrics...', w / 2, h / 2);
        return;
      }

      let maxVal = minMaxY || 1;
      for (let i = 0; i < dataPoints.length; i++) {
        if (dataPoints[i] > maxVal) maxVal = dataPoints[i];
      }
      maxVal = maxVal * 1.15;

      const padTop = 20;
      const padBottom = 26;
      const padLeft = 40;
      const padRight = 16;
      const chartW = w - padLeft - padRight;
      const chartH = h - padTop - padBottom;

      // Horizontal grid lines
      ctx.strokeStyle = '#21262d';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#8b949e';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';

      for (let g = 0; g <= 4; g++) {
        const gy = padTop + (chartH * g) / 4;
        const gVal = (maxVal * (4 - g)) / 4;
        ctx.beginPath();
        ctx.moveTo(padLeft, gy);
        ctx.lineTo(w - padRight, gy);
        ctx.stroke();
        ctx.fillText(gVal.toFixed(unit === 'ms' ? 1 : 0), padLeft - 6, gy + 3);
      }

      // Plot data points
      const n = dataPoints.length;
      const stepX = n > 1 ? chartW / (n - 1) : chartW;

      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const px = padLeft + i * stepX;
        const py = padTop + chartH - (dataPoints[i] / maxVal) * chartH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      // Fill area under curve
      ctx.save();
      const lastX = padLeft + (n - 1) * stepX;
      ctx.lineTo(lastX, padTop + chartH);
      ctx.lineTo(padLeft, padTop + chartH);
      ctx.closePath();
      ctx.fillStyle = color.replace('rgb', 'rgba').replace(')', ', 0.12)');
      ctx.fill();
      ctx.restore();

      // Stroke line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // Current point dot
      if (n > 0) {
        const lastY = padTop + chartH - (dataPoints[n - 1] / maxVal) * chartH;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    async function fetchAndUpdateStats() {
      try {
        const res = await fetch('/stats/json');
        if (!res.ok) return;
        const data = await res.json();

        document.getElementById('val-players').textContent = data.players;
        document.getElementById('val-alive').textContent = data.alivePlayers + ' alive';
        document.getElementById('val-rps').textContent = data.requestsPerSecond;
        document.getElementById('val-total-req').textContent = data.totalRequests + ' total HTTP requests';
        document.getElementById('val-latency').textContent = data.avgLatencyMs.toFixed(1) + ' ms';

        const upSec = data.uptimeSeconds;
        const h = Math.floor(upSec / 3600);
        const m = Math.floor((upSec % 3600) / 60);
        const s = upSec % 60;
        document.getElementById('val-uptime').textContent = (h > 0 ? h + 'h ' : '') + m + 'm ' + s + 's';
        document.getElementById('val-time').textContent = new Date(data.serverTime).toLocaleTimeString();

        document.getElementById('latest-players').textContent = data.players + ' players';
        document.getElementById('latest-rps').textContent = data.requestsPerSecond + ' req/s';
        document.getElementById('latest-latency').textContent = data.avgLatencyMs.toFixed(1) + ' ms';
        document.getElementById('latest-ws').textContent = (data.wsMessagesPerSecond || 0) + ' msg/s';

        const history = data.history || [];
        const playersSeries = history.map(d => d.players);
        const rpsSeries = history.map(d => d.requestsPerSecond);
        const latencySeries = history.map(d => d.avgLatencyMs);
        const wsSeries = history.map(d => d.wsMessagesPerSecond || 0);

        drawLineChart('chart-players', playersSeries, 'rgb(63, 185, 80)', '', 4);
        drawLineChart('chart-rps', rpsSeries, 'rgb(88, 166, 255)', 'req/s', 5);
        drawLineChart('chart-latency', latencySeries, 'rgb(210, 153, 34)', 'ms', 10);
        drawLineChart('chart-ws', wsSeries, 'rgb(188, 140, 255)', 'msg/s', 10);
      } catch (_err) {
        // Retry on next cycle
      }
    }

    fetchAndUpdateStats();
    setInterval(fetchAndUpdateStats, 1000);
  </script>
</body>
</html>
`;
}

const server = http.createServer((req, res) => {
  const reqStart = performance.now();
  res.on('finish', () => {
    const duration = performance.now() - reqStart;
    recordHttpRequestMetric(duration);
  });

  const safeUrl = (req.url || '/').split('?')[0];

  // Stats Dashboard Routes: /stats, /stats/, /stats/json
  if (safeUrl === '/stats' || safeUrl === '/stats/') {
    const html = renderStatsDashboardHtml();
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(html);
    return;
  }

  if (safeUrl === '/stats/json') {
    const statsData = JSON.stringify(getLatestStatsSnapshot(), null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(statsData);
    return;
  }

  if (safeUrl === '/leaderboard' || safeUrl === '/leaderboard.json') {
    const lbData = JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        entries: getTopLeaderboard(),
      },
      null,
      2
    );
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(lbData);
    return;
  }

  const relPath = safeUrl === '/' ? 'index.html' : safeUrl.replace(/^\/+/, '');
  const filePath = path.resolve(PROJECT_ROOT, relPath);

  if (!filePath.startsWith(PROJECT_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    });
    res.end(content);
  });
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = nodeCrypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'binary')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n',
  ];
  socket.write(headers.join('\r\n'));
  socket.setNoDelay(true);

  const playerId = nodeCrypto.randomBytes(6).toString('hex');
  const player = createPlayer(playerId, socket);
  players.set(playerId, player);

  // Send welcome packet with player ID and current leaderboard, followed immediately by initial state
  const welcomeFrame = encodeWsFrame(
    JSON.stringify({
      type: 'welcome',
      playerId,
      leaderboard: getTopLeaderboard(),
    })
  );
  socket.write(welcomeFrame);
  const initialStateFrame = encodeWsFrame(JSON.stringify(buildGameStatePayload()));
  socket.write(initialStateFrame);

  setupSocketReader(
    socket,
    (msg) => {
      recordWsMessageMetric();
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'set_nickname') {
        if (typeof msg.nickname === 'string' && msg.nickname.trim()) {
          setPlayerNickname(player, msg.nickname);
          player.lastActivityTime = Date.now();
        }
        if (Array.isArray(msg.leaderboard)) {
          for (let i = 0; i < msg.leaderboard.length; i++) {
            const item = msg.leaderboard[i];
            if (!item || typeof item !== 'object') continue;
            const cleanName = sanitizeNickname(item.name, '');
            if (!cleanName || cleanName === 'ImmortalChampion' || /^Warrior_\d+$/i.test(cleanName)) {
              continue;
            }
            const numericKills = Math.max(0, Math.floor(Number(item.kills) || 0));
            if (numericKills > 0) {
              recordLeaderboardKillScore(cleanName, numericKills, item.color || player.color);
            }
          }
        }
      } else if (msg.type === 'input') {
        if (typeof msg.nickname === 'string' && msg.nickname.trim()) {
          const desired = sanitizeNickname(msg.nickname, player.name);
          if (player.name !== desired || !player.hasCustomNickname) {
            setPlayerNickname(player, desired);
          }
        }

        if (typeof msg.mouseWorldX === 'number' && typeof msg.mouseWorldY === 'number') {
          if (
            msg.mouseWorldX !== player.input.mouseWorldX ||
            msg.mouseWorldY !== player.input.mouseWorldY
          ) {
            player.lastActivityTime = Date.now();
          }
          player.input.mouseWorldX = msg.mouseWorldX;
          player.input.mouseWorldY = msg.mouseWorldY;
        }

        if (msg.active) {
          player.lastActivityTime = Date.now();
        }
      } else if (msg.type === 'reset') {
        player.lastActivityTime = Date.now();
        resetGameWorld();
      }
    },
    () => {
      updateLeaderboardForPlayer(player);
      players.delete(playerId);
    }
  );
});

// Initialize world and load persisted leaderboard
loadLeaderboardFromFile();
if (leaderboardFilePath && !fs.existsSync(leaderboardFilePath)) {
  saveLeaderboardToFile();
}
initStoneColumns();
for (let i = 0; i < INITIAL_ENEMY_COUNT; i++) {
  spawnEnemy(false);
}

function buildGameStatePayload() {
  const serializedPlayers = [];
  for (const p of players.values()) {
    const serializedHammers = (p.hammers || [p.hammer]).map((h) => ({
      x: +h.x.toFixed(1),
      y: +h.y.toFixed(1),
      vx: +h.vx.toFixed(1),
      vy: +h.vy.toFixed(1),
      radius: h.radius,
      mass: h.mass,
      chainLinks: h.chainLinks || INITIAL_CHAIN_LINKS,
      linkLength: +(h.linkLength || LENGTH_PER_LINK).toFixed(2),
      bombCharges: h.bombCharges,
      flameTimer: +(h.flameTimer || 0).toFixed(2),
      discoTimer: +(h.discoTimer || 0).toFixed(2),
      jackolanternTimer: +(h.jackolanternTimer || 0).toFixed(2),
      spiderTimer: +(h.spiderTimer || 0).toFixed(2),
      thorTimer: +(h.thorTimer || 0).toFixed(2),
      extraTimer: +(h.extraTimer || 0).toFixed(2),
      isSpider: !!h.isSpider,
      angle: +h.angle.toFixed(3),
      currentStretch: +h.currentStretch.toFixed(1),
      chainNodes: (h.chainNodes || []).map((n) => ({
        x: +n.x.toFixed(1),
        y: +n.y.toFixed(1),
      })),
    }));
    serializedPlayers.push({
      id: p.id,
      name: p.name,
      color: p.color,
      capeColor: p.capeColor,
      plumeColor: p.plumeColor,
      alive: p.alive,
      x: +p.x.toFixed(1),
      y: +p.y.toFixed(1),
      vx: +p.vx.toFixed(1),
      vy: +p.vy.toFixed(1),
      angle: +p.angle.toFixed(3),
      radius: p.radius,
      hp: +p.hp.toFixed(1),
      maxHp: p.maxHp,
      mountType: p.mountType || null,
      mountHp: +(p.mountHp || 0).toFixed(1),
      mountMaxHp: p.mountMaxHp || 0,
      bulldozerTimer: +(p.bulldozerTimer || 0).toFixed(2),
      speedMultiplier: +(p.speedMultiplier || 1).toFixed(4),
      tractionMultiplier: +(p.tractionMultiplier || 1).toFixed(4),
      chainLinks: p.chainLinks,
      walkCycle: +p.walkCycle.toFixed(2),
      hurtFlash: +p.hurtFlash.toFixed(2),
      kills: p.kills,
      maxDamageBlow: p.maxDamageBlow,
      hammers: serializedHammers,
      hammer: serializedHammers[0],
      chainNodes: serializedHammers[0] ? serializedHammers[0].chainNodes : [],
    });
  }

  const serializedEnemies = enemies.map((e) => ({
    id: e.id,
    variant: e.variant,
    x: +e.x.toFixed(1),
    y: +e.y.toFixed(1),
    vx: +e.vx.toFixed(1),
    vy: +e.vy.toFixed(1),
    angle: +e.angle.toFixed(2),
    radius: e.radius,
    hp: Math.ceil(e.hp),
    maxHp: e.maxHp,
    skinColor: e.skinColor,
    coatColor: e.coatColor,
    hurtFlash: +e.hurtFlash.toFixed(2),
    burnTimer: +(e.burnTimer || 0).toFixed(2),
    fireproofTimer: +(e.fireproofTimer || 0).toFixed(2),
    fearTimer: +(e.fearTimer || 0).toFixed(2),
    danceTimer: +(e.danceTimer || 0).toFixed(2),
    danceImmuneTimer: +(e.danceImmuneTimer || 0).toFixed(2),
    webTimer: +(e.webTimer || 0).toFixed(2),
    knockdownTimer: +(e.knockdownTimer || 0).toFixed(2),
    walkPhase: +e.walkPhase.toFixed(2),
  }));

  return {
    type: 'state',
    roundState,
    teamKills,
    earthquakeTimer: +earthquakeTimer.toFixed(2),
    victoryInfo,
    players: serializedPlayers,
    enemies: serializedEnemies,
    pickups: serializePickups(),
    events: pendingEvents,
    leaderboard: getTopLeaderboard(),
    roundRestartTimer: +roundRestartTimer.toFixed(2),
  };
}

// 60 Hz Physics Loop
let lastTick = performance.now();
let broadcastAccum = 0;

if (require.main === module) {
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTick) / 1000);
    lastTick = now;

    tickServer(dt);

    broadcastAccum += dt;
    if (broadcastAccum >= 1 / BroadcastRate && players.size > 0) {
      broadcastAccum = 0;
      const snapshotFrame = encodeWsFrame(JSON.stringify(buildGameStatePayload()));
      pendingEvents = [];

      for (const p of players.values()) {
        if (p.ws && !p.ws.destroyed) {
          p.ws.write(snapshotFrame);
        }
      }
    }
  }, Math.round(1000 / TICK_RATE));

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`HammerTime multiplayer server listening on http://0.0.0.0:${PORT}`);
  });
}

module.exports = {
  // Constants
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TICK_RATE,
  BroadcastRate,
  PHYSICS_SUBSTEPS,
  LOW_LOAD_PHYSICS_SUBSTEPS,
  TICK_LOAD_THRESHOLD_MS,
  TICK_RECOVERY_THRESHOLD_MS,
  INITIAL_CHAIN_LINKS,
  MAX_CHAIN_LINKS,
  BASE_CHAIN_OFFSET,
  LENGTH_PER_LINK,
  CHAIN_SPRING_K,
  CHAIN_RADIAL_DAMP,
  CHAIN_LINK_RADIUS,
  CHAIN_RELAX_ITERS,
  LOW_LOAD_CHAIN_RELAX_ITERS,
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
  RARE_THOR_DROP_CHANCE,
  ZOMBIE_WEB_DURATION,
  SPIDER_HAMMER_DURATION,
  THOR_HAMMER_DURATION,
  THOR_EXPLOSION_RADIUS,
  THOR_BLAST_DAMAGE_MULT,
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
  DEFAULT_LEADERBOARD_FILE,
  PLAYER_PALETTES,
  // State collections & accessors
  stoneColumns,
  enemies,
  blackCircles,
  players,
  leaderboardRecords,
  getLeaderboardFilePath,
  setLeaderboardFilePath,
  server,
  getState: () => ({
    elapsedGameTime,
    spawnTimer,
    earthquakeTimer,
    roundRestartTimer,
    roundState,
    teamKills,
    victoryInfo,
    pendingEvents,
    activePhysicsSubsteps,
    activeChainRelaxIters,
    avgTickMs,
    isReducedFidelity,
  }),
  setState: (patch) => {
    if ('elapsedGameTime' in patch) elapsedGameTime = patch.elapsedGameTime;
    if ('spawnTimer' in patch) spawnTimer = patch.spawnTimer;
    if ('earthquakeTimer' in patch) earthquakeTimer = patch.earthquakeTimer;
    if ('roundRestartTimer' in patch) roundRestartTimer = patch.roundRestartTimer;
    if ('roundState' in patch) roundState = patch.roundState;
    if ('teamKills' in patch) teamKills = patch.teamKills;
    if ('victoryInfo' in patch) victoryInfo = patch.victoryInfo;
    if ('pendingEvents' in patch) pendingEvents = patch.pendingEvents;
    if ('activePhysicsSubsteps' in patch) activePhysicsSubsteps = patch.activePhysicsSubsteps;
    if ('activeChainRelaxIters' in patch) activeChainRelaxIters = patch.activeChainRelaxIters;
    if ('avgTickMs' in patch) avgTickMs = patch.avgTickMs;
    if ('isReducedFidelity' in patch) isReducedFidelity = patch.isReducedFidelity;
  },
  // Core Functions
  updateServerSimulationFidelity,
  initStoneColumns,
  getChainRestLength,
  initHammerChainNodes,
  addHammerChainLinkNode,
  createPlayerHammer,
  touchesStoneColumn,
  getRandomPlayerSpawnPosition,
  applyDamageToPlayer,
  sanitizeNickname,
  recordLeaderboardKillScore,
  updateLeaderboardForPlayer,
  setPlayerNickname,
  getTopLeaderboard,
  clearLeaderboard,
  saveLeaderboardToFile,
  loadLeaderboardFromFile,
  resetPlayerForNewRound,
  createPlayer,
  spawnEnemy,
  startEnemyDance,
  taintEnemyWithFear,
  igniteEnemy,
  getTopKillerName,
  triggerCoopVictory,
  addPickupToWorld,
  serializePickups,
  buildGameStatePayload,
  defeatEnemy,
  triggerHammerExplosion,
  resetGameWorld,
  updatePlayerBroadphaseBounds,
  stepPlayerPhysics,
  stepWorldPhysics,
  tickServer,
  recordHttpRequestMetric,
  recordWsMessageMetric,
  flushMetricsTick,
  getLatestStatsSnapshot,
  clearStatsHistory,
  renderStatsDashboardHtml,
  encodeWsFrame,
  setupSocketReader,
};
