'use strict';

const { describe, it, beforeEach } = require('./harness.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const srv = require('../dist/server.js');

function createMockCanvasContext() {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    save: noop,
    restore: noop,
    scale: noop,
    rotate: noop,
    translate: noop,
    transform: noop,
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    arc: noop,
    arcTo: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    fillText: noop,
    strokeText: noop,
    measureText: (t) => ({ width: String(t).length * 7 }),
    setLineDash: noop,
    getLineDash: () => [],
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  };
}

function createMockElement(id) {
  const classes = new Set();
  const el = {
    id,
    width: 800,
    height: 600,
    textContent: '',
    innerHTML: '',
    value: '',
    children: [],
    style: {},
    get className() {
      return Array.from(classes).join(' ');
    },
    set className(val) {
      classes.clear();
      String(val || '')
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => classes.add(c));
    },
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) classes.delete(c);
          else classes.add(c);
        } else if (force) {
          classes.add(c);
        } else {
          classes.delete(c);
        }
      },
      contains: (c) => classes.has(c),
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute: () => {},
    getAttribute: () => null,
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
    getContext: () => createMockCanvasContext(),
    focus: () => {},
    blur: () => {},
  };
  return el;
}

function loadClientGame(initialCookies = '') {
  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) {
      elements.set(id, createMockElement(id));
    }
    return elements.get(id);
  };

  const cookieJar = { raw: initialCookies };
  const mockDoc = {
    getElementById: getEl,
    createElement: (tag) => createMockElement(tag),
    activeElement: null,
    get cookie() {
      return cookieJar.raw;
    },
    set cookie(val) {
      if (typeof val === 'string') {
        const pair = val.split(';')[0].trim();
        if (pair) {
          const eqIdx = pair.indexOf('=');
          const key = eqIdx !== -1 ? pair.substring(0, eqIdx).trim() : pair;
          const cookies = cookieJar.raw ? cookieJar.raw.split(';').map(c => c.trim()) : [];
          const updated = cookies.filter(c => !c.startsWith(`${key}=`));
          updated.push(pair);
          cookieJar.raw = updated.join('; ');
        }
      }
    },
  };

  const sandbox = {
    window: {
      innerWidth: 1280,
      innerHeight: 800,
      devicePixelRatio: 1,
      location: { host: '', protocol: 'file:' },
      addEventListener: () => {},
      AudioContext: undefined,
      webkitAudioContext: undefined,
    },
    document: mockDoc,
    performance: {
      now: () => Date.now(),
    },
    requestAnimationFrame: () => 1,
    setTimeout,
    clearTimeout,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    console,
    encodeURIComponent,
    decodeURIComponent,
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;
  sandbox.window.performance = sandbox.performance;
  sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;

  const code = fs.readFileSync(path.join(__dirname, '..', 'dist', 'game.js'), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'game.js' });
  return { api: sandbox.window.__HAMMERTIME_TEST__, elements, document: mockDoc };
}

describe('Client Game (game.js) Constants, Physics, Events & 2.5D Rendering', () => {
  let api;
  let elements;

  beforeEach(() => {
    const loaded = loadClientGame();
    api = loaded.api;
    elements = loaded.elements;
    api.initGame();
    api.enemies.length = 0;
    api.blackCircles.length = 0;
    api.warrior.x = 2100;
    api.warrior.y = 2100;
    api.warrior.vx = 0;
    api.warrior.vy = 0;
  });

  it('keeps client constants in exact parity with server constants', () => {
    const c = api.constants;
    assert.equal(c.WORLD_WIDTH, srv.WORLD_WIDTH);
    assert.equal(c.WORLD_HEIGHT, srv.WORLD_HEIGHT);
    assert.equal(c.PICKUP_RADIUS, srv.PICKUP_RADIUS);
    assert.equal(c.PICKUP_RADIUS, 10);
    assert.equal(c.MAX_PICKUP_COUNT, srv.MAX_PICKUP_COUNT);
    assert.equal(c.MAX_PICKUP_COUNT, 40);
    assert.equal(c.MAX_CHAIN_LINKS, srv.MAX_CHAIN_LINKS);
    assert.equal(c.MAX_CHAIN_LINKS, 9);
    assert.equal(c.MAX_HAMMERS_PER_PLAYER, srv.MAX_HAMMERS_PER_PLAYER);
    assert.equal(c.MAX_HAMMERS_PER_PLAYER, 2);
    assert.equal(c.EXTRA_HAMMER_DURATION, srv.EXTRA_HAMMER_DURATION);
    assert.equal(c.RARE_HAMMER_DROP_CHANCE, srv.RARE_HAMMER_DROP_CHANCE);
    assert.equal(c.RARE_HORSE_DROP_CHANCE, srv.RARE_HORSE_DROP_CHANCE);
    assert.equal(c.RARE_TORTOISE_DROP_CHANCE, srv.RARE_TORTOISE_DROP_CHANCE);
    assert.equal(c.RARE_ELEPHANT_DROP_CHANCE, srv.RARE_ELEPHANT_DROP_CHANCE);
    assert.equal(c.RARE_BULLDOZER_DROP_CHANCE, srv.RARE_BULLDOZER_DROP_CHANCE);
    assert.equal(c.RARE_EARTHQUAKE_DROP_CHANCE, srv.RARE_EARTHQUAKE_DROP_CHANCE);
    assert.equal(c.RARE_FEAR_DROP_CHANCE, srv.RARE_FEAR_DROP_CHANCE);
    assert.equal(c.RARE_DISCO_DROP_CHANCE, srv.RARE_DISCO_DROP_CHANCE);
    assert.equal(c.RARE_JACKOLANTERN_DROP_CHANCE, srv.RARE_JACKOLANTERN_DROP_CHANCE);
    assert.equal(c.RARE_SPIDER_DROP_CHANCE, srv.RARE_SPIDER_DROP_CHANCE);
    assert.equal(c.ZOMBIE_WEB_DURATION, srv.ZOMBIE_WEB_DURATION);
    assert.equal(c.BULLDOZER_DURATION, srv.BULLDOZER_DURATION);
    assert.equal(c.BULLDOZER_TRACTION_MULT, srv.BULLDOZER_TRACTION_MULT);
    assert.equal(c.BULLDOZER_RADIUS, srv.BULLDOZER_RADIUS);
    assert.deepEqual(JSON.parse(JSON.stringify(c.STONE_COLUMNS)), srv.STONE_COLUMNS);
    assert.deepEqual(JSON.parse(JSON.stringify(api.stoneColumns)), srv.STONE_COLUMNS);
  });

  it('handles all 17 standalone pickups, extra hammer 120s expiration, spider web, disco, and bulldozer', () => {
    const w = api.warrior;

    // Common pickups: link, weight, health, bomb, flame, speed, traction
    w.hp = 60;
    const commonPickups = ['link', 'weight', 'health', 'bomb', 'flame', 'speed', 'traction'];
    for (const pType of commonPickups) {
      api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: pType });
      api.stepPhysics(0.016);
    }
    assert.equal(w.hammers[0].chainLinks, 4);
    assert.ok(w.hammers[0].mass > api.constants.INITIAL_HAMMER_MASS);
    assert.equal(w.hp, 80);
    assert.equal(w.hammers[0].bombCharges, 1);
    assert.equal(w.hammers[0].flameCharges, 1);
    assert.equal(w.speedMultiplier, 1.05);
    assert.equal(w.tractionMultiplier, 1.05);

    // Mounts: horse, tortoise, elephant
    api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: 'horse' });
    api.stepPhysics(0.016);
    assert.equal(w.mountType, 'horse');
    w.mountType = null;
    w.mountHp = 0;

    api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: 'tortoise' });
    api.stepPhysics(0.016);
    assert.equal(w.mountType, 'tortoise');

    api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: 'elephant' });
    api.stepPhysics(0.016);
    assert.equal(w.mountType, 'elephant');

    // Earthquake, Fear, Disco, Jack-o'-Lantern
    for (const pType of ['earthquake', 'fear', 'disco', 'jackolantern']) {
      api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: pType });
      api.stepPhysics(0.016);
    }
    assert.ok(api.getState().earthquakeTimer > 4.9);
    assert.ok(w.hammers[0].discoTimer > 19.9);
    assert.ok(w.hammers[0].jackolanternTimer > 59.9);
    w.hammers[0].discoTimer = 0;
    api.setState({ earthquakeTimer: 0, localKnockdownTimer: 0 });

    // Extra hammer pickup (capped at 2) + 120s expiration
    api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: 'hammer' });
    api.stepPhysics(0.016);
    assert.equal(w.hammers.length, 2);
    assert.ok(w.hammers[1].extraTimer > 119);
    // 3rd hammer pickup is ignored when already at max 2
    api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: 'hammer' });
    api.stepPhysics(0.016);
    assert.equal(w.hammers.length, 2);
    assert.equal(api.blackCircles.length, 1);
    api.blackCircles.length = 0;

    w.hammers[1].extraTimer = 0.01;
    api.stepPhysics(0.05);
    assert.equal(w.hammers.length, 1);

    // Link pickups cap at 9 links and then increase linkLength
    for (let i = 0; i < 5; i++) {
      api.blackCircles.push({ x: w.x, y: w.y, pulse: 0, type: 'link' });
      api.stepPhysics(0.016);
    }
    assert.equal(w.hammers[0].chainLinks, 9);
    assert.equal(w.hammers[0].linkLength, api.constants.LENGTH_PER_LINK);
    api.blackCircles.push({ x: w.x, y: w.y, pulse: 0, type: 'link' });
    api.stepPhysics(0.016);
    assert.equal(w.hammers[0].chainLinks, 9);
    assert.ok(w.hammers[0].linkLength > api.constants.LENGTH_PER_LINK);

    // Spider pickup + webbing zombie on hit
    w.hammers[0].bombCharges = 0;
    w.hammers[0].flameCharges = 0;
    w.hammers[0].flameTimer = 0;
    api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: 'spider' });
    api.stepPhysics(0.016);
    assert.equal(w.hammers[0].isSpider, true);

    api.spawnEnemy(false);
    const e = api.enemies[0];
    e.x = 2200;
    e.y = 2100;
    e.hp = 300;
    e.maxHp = 300;
    e.knockdownTimer = 0;
    w.hammers[0].x = 2190;
    w.hammers[0].y = 2100;
    w.hammers[0].vx = 600;
    w.hammers[0].vy = 0;
    api.stepPhysics(0.016);
    assert.ok(e.webTimer > 29.9);

    // Bulldozer pickup & same-tick pickup guard
    w.speedMultiplier = 1.0;
    api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: 'speed' });
    api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: 'bulldozer' });
    api.stepPhysics(0.016);
    assert.ok(w.bulldozerTimer > 19.9);
    assert.equal(w.radius, api.constants.BULLDOZER_RADIUS);
    assert.equal(w.speedMultiplier, 1.0);

    // Stone columns remain fixed in location when collided with by bulldozer
    const col = api.stoneColumns[0];
    const origColX = col.x;
    const origColY = col.y;
    w.x = col.x - (w.radius + col.radius - 8);
    w.y = col.y;
    api.stepPhysics(0.016);
    assert.equal(col.x, origColX);
    assert.equal(col.y, origColY);
    assert.ok(Math.hypot(w.x - col.x, w.y - col.y) >= w.radius + col.radius - 0.01);

    // Pickup cap of 40: removes oldest common pickup first, or oldest of any type if no common exists
    api.blackCircles.length = 0;
    api.addPickupToWorld({ id: 'rare-1', x: 100, y: 100, pulse: 0, type: 'elephant' });
    api.addPickupToWorld({ id: 'common-1', x: 110, y: 100, pulse: 0, type: 'link' });
    api.addPickupToWorld({ id: 'rare-2', x: 120, y: 100, pulse: 0, type: 'bulldozer' });
    for (let i = 0; i < 37; i++) {
      api.addPickupToWorld({ id: `common-extra-${i}`, x: 200 + i, y: 100, pulse: 0, type: 'speed' });
    }
    assert.equal(api.blackCircles.length, 40);
    assert.equal('radius' in api.blackCircles[0], false);

    // Adding a 41st pickup removes 'common-1' (oldest common) while keeping older 'rare-1'
    api.addPickupToWorld({ id: 'new-pickup', x: 500, y: 100, pulse: 0, type: 'disco' });
    assert.equal(api.blackCircles.length, 40);
    assert.equal(api.blackCircles[0].id, 'rare-1');
    assert.equal(api.blackCircles[1].id, 'rare-2');
    assert.equal(api.blackCircles.some((c) => c.id === 'common-1'), false);
    assert.equal(api.blackCircles[39].id, 'new-pickup');

    // When all 40 pickups are rare, adding a new pickup removes the oldest pickup at index 0
    api.blackCircles.length = 0;
    for (let i = 0; i < 40; i++) {
      api.addPickupToWorld({ id: `only-rare-${i}`, x: 300 + i, y: 100, pulse: 0, type: 'horse' });
    }
    api.addPickupToWorld({ id: 'rare-41', x: 600, y: 100, pulse: 0, type: 'spider' });
    assert.equal(api.blackCircles.length, 40);
    assert.equal(api.blackCircles[0].id, 'only-rare-1');
    assert.equal(api.blackCircles[39].id, 'rare-41');
  });

  it('processes server events including bulldozer, earthquake, spider_web, disco_dance, and round_reset', () => {
    api.setState({ localPlayerId: 'me', isMultiplayer: true });
    api.processServerEvents([
      { type: 'bulldozer', playerId: 'me', x: 2100, y: 2100 },
      { type: 'earthquake', x: 2100, y: 2100 },
      { type: 'spider_web', x: 2150, y: 2100 },
      { type: 'disco_dance', x: 2180, y: 2100 },
    ]);
    assert.equal(api.warrior.bulldozerTimer, api.constants.BULLDOZER_DURATION);
    assert.equal(api.warrior.radius, api.constants.BULLDOZER_RADIUS);
    assert.equal(api.getState().earthquakeTimer, api.constants.EARTHQUAKE_DURATION);

    // Update effects ticks down bulldozerTimer & earthquakeTimer in multiplayer
    api.updateEffects(0.5);
    assert.ok(api.warrior.bulldozerTimer < api.constants.BULLDOZER_DURATION);
    assert.ok(api.getState().earthquakeTimer < api.constants.EARTHQUAKE_DURATION);

    // round_reset clears timers
    api.processServerEvents([{ type: 'round_reset' }]);
    assert.equal(api.warrior.bulldozerTimer, 0);
    assert.equal(api.getState().earthquakeTimer, 0);
  });

  it('renders all 2.5D entities (including Bulldozer mode in drawWarrior, all Hammer modes, all Enemy states, and all 17 Pickups) without errors', () => {
    const w = api.warrior;

    // 1. drawWarrior in Normal, Horse, Tortoise, Elephant, and Bulldozer modes
    api.drawWarrior(w, true);

    w.mountType = 'horse';
    w.mountHp = 100;
    w.mountMaxHp = 100;
    api.updateHUD();
    api.drawWarrior(w, true);

    w.mountType = 'tortoise';
    api.updateHUD();
    api.drawWarrior(w, true);

    w.mountType = 'elephant';
    api.updateHUD();
    api.drawWarrior(w, true);

    w.bulldozerTimer = 20.0;
    api.updateHUD();
    assert.equal(elements.get('mount-label').textContent, 'BULLDOZER MODE');
    // Test drawWarrior with bulldozer active facing both north and south
    w.angle = -Math.PI / 2;
    api.drawWarrior(w, true);
    w.angle = Math.PI / 2;
    api.drawWarrior(w, false);
    assert.ok(api.getState().gameTime > 0);

    // 2. drawHammer in Normal, Bomb, Flaming, Disco, Jack-o'-Lantern, and Spider modes
    const h = api.hammer;
    h.trail = [{ x: h.x - 10, y: h.y - 10, alpha: 0.5 }];
    api.drawHammer(h, h.trail);

    h.bombCharges = 1;
    h.flameTimer = 5;
    api.drawHammer(h, h.trail);

    h.discoTimer = 15;
    api.drawHammer(h, h.trail);
    h.discoTimer = 0;

    h.jackolanternTimer = 45;
    api.drawHammer(h, h.trail);
    h.jackolanternTimer = 0;

    h.isSpider = true;
    api.drawHammer(h, h.trail);

    // 3. drawEnemy in Normal, Burning, Fireproof, Feared, Dancing, Dance-Immune, Webbed, and Knocked-Down states
    api.spawnEnemy(false);
    const e = api.enemies[0];
    e.x = 2150;
    e.y = 2150;
    api.drawEnemy(e);

    e.burnTimer = 8;
    api.drawEnemy(e);
    e.burnTimer = 0;

    e.fireproofTimer = 4;
    api.drawEnemy(e);
    e.fireproofTimer = 0;

    e.fearTimer = 10;
    api.drawEnemy(e);
    e.fearTimer = 0;

    e.danceTimer = 20;
    api.drawEnemy(e);
    e.danceTimer = 0;

    e.danceImmuneTimer = 30;
    api.drawEnemy(e);
    e.danceImmuneTimer = 0;

    e.webTimer = 25;
    api.drawEnemy(e);

    e.knockdownTimer = 4;
    api.drawEnemy(e);

    // 4. drawBlackCircle for all 17 pickup types
    const allPickupTypes = [
      'link',
      'weight',
      'health',
      'bomb',
      'speed',
      'traction',
      'flame',
      'hammer',
      'horse',
      'tortoise',
      'elephant',
      'earthquake',
      'fear',
      'bulldozer',
      'disco',
      'jackolantern',
      'spider',
    ];
    for (const pType of allPickupTypes) {
      api.drawBlackCircle({ x: 2100, y: 2100, pulse: 1.0, type: pType });
    }

    // 5. Full scene render() and gameLoop()
    api.setState({ earthquakeTimer: 2.5 });
    api.render();
    api.gameLoop(Date.now() + 16);
  });

  it('requires new users to enter a nickname and renders the Top 10 Enemies Killed Leaderboard', () => {
    const nicknameInput = elements.get('nickname-input');
    const enterModal = elements.get('enter-modal');
    const leaderboardList = elements.get('leaderboard-list');

    // Attempting to enter game with blank nickname shows validation error and stays on modal
    nicknameInput.value = '   ';
    const joinedBlank = api.enterGame();
    assert.equal(joinedBlank, false);
    assert.equal(api.getState().hasEnteredGame, false);
    assert.equal(nicknameInput.classList.contains('input-error'), true);

    // Entering a valid nickname joins the game and sets warrior.name
    nicknameInput.value = '  Lady Hammer  ';
    const joinedValid = api.enterGame();
    assert.equal(joinedValid, true);
    assert.equal(api.getState().hasEnteredGame, true);
    assert.equal(api.warrior.name, 'Lady Hammer');
    assert.equal(api.warrior.hasCustomNickname, true);
    assert.equal(enterModal.classList.contains('hidden'), true);

    // Defeating enemies in standalone mode updates local player's kills on the leaderboard
    api.spawnEnemy(false);
    api.defeatEnemy(api.enemies.length - 1);
    api.spawnEnemy(false);
    api.defeatEnemy(api.enemies.length - 1);
    api.updateHUD();

    assert.equal(leaderboardList.children.length, 1);
    assert.equal(leaderboardList.children[0].children[0].textContent, '#1');
    assert.equal(leaderboardList.children[0].children[1].textContent, 'Lady Hammer');
    assert.equal(leaderboardList.children[0].children[2].textContent, '2');
    assert.equal(leaderboardList.children[0].classList.contains('leaderboard-self'), true);

    // Populate 12 warrior scores and verify only Top 10 are rendered in descending order
    for (let i = 1; i <= 12; i++) {
      api.recordLocalLeaderboardScore(`Challenger_${i}`, i * 3);
    }
    api.updateHUD();
    assert.equal(leaderboardList.children.length, 10);
    assert.equal(leaderboardList.children[0].children[0].textContent, '#1');
    assert.equal(leaderboardList.children[0].children[1].textContent, 'Challenger_12');
    assert.equal(leaderboardList.children[0].children[2].textContent, '36');
    assert.equal(leaderboardList.children[9].children[0].textContent, '#10');
    assert.equal(leaderboardList.children[9].children[1].textContent, 'Challenger_3');
    assert.equal(leaderboardList.children[9].children[2].textContent, '9');
  });

  it('prepopulates medieval nickname and remembers it across page reload via cookie', () => {
    // 1. Initial page load without cookie prepopulates a medieval-themed name
    const freshInstance = loadClientGame('');
    const input1 = freshInstance.elements.get('nickname-input');
    assert.ok(input1.value && input1.value.length > 0);
    assert.ok(
      input1.value.startsWith('Sir ') || input1.value.startsWith('Lady '),
      `Expected medieval name suggestion, got: ${input1.value}`
    );

    // 2. User sets their own custom nickname and enters game
    input1.value = 'Sir Percival';
    const joined = freshInstance.api.enterGame();
    assert.equal(joined, true);
    assert.ok(freshInstance.document.cookie.includes('hammertime_nickname=Sir%20Percival'));

    // 3. User reloads page (simulated by passing the cookie jar into new instance)
    const reloadedInstance = loadClientGame(freshInstance.document.cookie);
    const input2 = reloadedInstance.elements.get('nickname-input');
    assert.equal(input2.value, 'Sir Percival');
  });
});
