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
    getContext() {
      if (!this._ctx) this._ctx = createMockCanvasContext();
      return this._ctx;
    },
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

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.CONNECTING;
      this.sent = [];
      this.listeners = {};
    }
    addEventListener(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    }
    send(data) {
      this.sent.push(data);
    }
    close() {
      this.readyState = MockWebSocket.CLOSED;
      this.emit('close', {});
    }
    emit(type, ev = {}) {
      const list = this.listeners[type] || [];
      for (const fn of list) fn(ev);
    }
  }
  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED = 3;

  let rafCounter = 0;
  const rafCalls = [];
  const cancelRafCalls = [];
  const windowListeners = {};
  const sandbox = {
    window: {
      innerWidth: 1280,
      innerHeight: 800,
      devicePixelRatio: 1,
      location: { host: 'localhost:8080', protocol: 'http:' },
      addEventListener: (type, fn) => {
        if (!windowListeners[type]) windowListeners[type] = [];
        windowListeners[type].push(fn);
      },
      dispatchEvent: (ev) => {
        const list = windowListeners[ev.type] || [];
        for (const fn of list) fn(ev);
      },
      AudioContext: undefined,
      webkitAudioContext: undefined,
      WebSocket: MockWebSocket,
    },
    WebSocket: MockWebSocket,
    document: mockDoc,
    performance: {
      now: () => Date.now(),
    },
    requestAnimationFrame: (cb) => {
      const id = ++rafCounter;
      rafCalls.push({ id, cb });
      return id;
    },
    cancelAnimationFrame: (id) => {
      cancelRafCalls.push(id);
    },
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
  sandbox.window.cancelAnimationFrame = sandbox.cancelAnimationFrame;

  const code = fs.readFileSync(path.join(__dirname, '..', 'dist', 'game.js'), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'game.js' });
  return {
    api: sandbox.window.__HAMMERTIME_TEST__,
    elements,
    document: mockDoc,
    window: sandbox.window,
    rafCalls,
    cancelRafCalls,
  };
}

describe('Client Game (game.js) Constants, Physics, Events & 2.5D Rendering', () => {
  let api;
  let elements;
  let win;

  beforeEach(() => {
    const loaded = loadClientGame();
    api = loaded.api;
    elements = loaded.elements;
    win = loaded.window;
    api.initGame();
    api.enemies.length = 0;
    api.blackCircles.length = 0;
    api.warrior.x = 2100;
    api.warrior.y = 2100;
    api.warrior.vx = 0;
    api.warrior.vy = 0;
    api.camera.x = 2100 - 640;
    api.camera.y = 2100 - 400 / api.constants.TILT_Y;
    api.mouse.screenX = 640;
    api.mouse.screenY = 400;
  });

  it('keeps client constants in exact parity with server constants', () => {
    const c = api.constants;
    assert.equal(c.WORLD_WIDTH, srv.WORLD_WIDTH);
    assert.equal(c.WORLD_HEIGHT, srv.WORLD_HEIGHT);
    assert.equal(c.PICKUP_RADIUS, srv.PICKUP_RADIUS);
    assert.equal(c.PICKUP_RADIUS, 10);
    assert.equal(c.MAX_PICKUP_COUNT, srv.MAX_PICKUP_COUNT);
    assert.equal(c.MAX_PICKUP_COUNT, 40);
    assert.equal(c.INITIAL_CHAIN_LINKS, srv.INITIAL_CHAIN_LINKS);
    assert.equal(c.INITIAL_CHAIN_LINKS, 2);
    assert.equal(c.INITIAL_HAMMER_MASS, srv.INITIAL_HAMMER_MASS);
    assert.equal(c.INITIAL_HAMMER_MASS, 0.875);
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
    assert.equal(c.RARE_THOR_DROP_CHANCE, srv.RARE_THOR_DROP_CHANCE);
    assert.equal(c.DISCO_HAMMER_DURATION, srv.DISCO_HAMMER_DURATION);
    assert.equal(c.JACKOLANTERN_HAMMER_DURATION, srv.JACKOLANTERN_HAMMER_DURATION);
    assert.equal(c.SPIDER_HAMMER_DURATION, srv.SPIDER_HAMMER_DURATION);
    assert.equal(c.THOR_HAMMER_DURATION, srv.THOR_HAMMER_DURATION);
    assert.equal(c.THOR_EXPLOSION_RADIUS, srv.THOR_EXPLOSION_RADIUS);
    assert.equal(c.THOR_BLAST_DAMAGE_MULT, srv.THOR_BLAST_DAMAGE_MULT);
    assert.equal(c.ZOMBIE_WEB_DURATION, srv.ZOMBIE_WEB_DURATION);
    assert.equal(c.BULLDOZER_DURATION, srv.BULLDOZER_DURATION);
    assert.equal(c.BULLDOZER_TRACTION_MULT, srv.BULLDOZER_TRACTION_MULT);
    assert.equal(c.BULLDOZER_RADIUS, srv.BULLDOZER_RADIUS);
    assert.deepEqual([...c.PICKUP_TYPES], srv.PICKUP_TYPES);
    assert.deepEqual([...c.PICKUP_TYPES], ['link', 'weight', 'health', 'bomb', 'speed', 'flame']);
    assert.equal(c.PICKUP_TYPES.includes('traction'), false);
    assert.deepEqual(JSON.parse(JSON.stringify(c.STONE_COLUMNS)), srv.STONE_COLUMNS);
    assert.deepEqual(JSON.parse(JSON.stringify(api.stoneColumns)), srv.STONE_COLUMNS);

    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.equal(indexHtml.includes('toggle-deadzone-btn'), false);
    assert.equal(indexHtml.includes('reset-game-btn'), false);
    assert.equal(indexHtml.includes('hud-actions'), false);
    assert.equal(indexHtml.includes('coords-text'), false);
    assert.equal(indexHtml.includes('wave-badge'), false);
    assert.equal(indexHtml.includes('chain-links-val'), false);
    assert.equal(indexHtml.includes('hammer-mass-val'), true);
    assert.equal(indexHtml.includes('HAMMER MASS'), true);
    assert.equal(indexHtml.includes('hud-bottom'), false);
    assert.equal(indexHtml.includes('<strong>Traction</strong>'), false);

    api.updateHUD();
    assert.equal(elements.get('hammer-mass-val').textContent, '0.88');
    assert.equal(elements.has('coords-text'), false);
    assert.equal(elements.has('wave-badge'), false);
  });

  it('handles all 16 standalone pickups, extra hammer 60s expiration, spider web, disco, and bulldozer', () => {
    const w = api.warrior;

    // Common pickups: link, weight, health, bomb, flame, speed
    w.hp = 60;
    const commonPickups = ['link', 'weight', 'health', 'bomb', 'flame', 'speed'];
    for (const pType of commonPickups) {
      api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: pType });
      api.stepPhysics(0.016);
    }
    assert.equal(w.hammers[0].chainLinks, 3);
    assert.ok(w.hammers[0].mass > api.constants.INITIAL_HAMMER_MASS);
    assert.equal(w.hp, 80);
    assert.equal(w.hammers[0].bombCharges, 1);
    assert.equal(w.hammers[0].flameCharges, 1);
    assert.equal(w.speedMultiplier, 1.05);

    // Cannot pick up health when already at full health
    w.hp = w.maxHp;
    api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: 'health' });
    api.stepPhysics(0.016);
    assert.equal(api.blackCircles.length, 1);
    api.blackCircles.length = 0;

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
    assert.ok(w.hammers[0].discoTimer > 59.9 && w.hammers[0].discoTimer <= 60);
    assert.ok(w.hammers[0].jackolanternTimer > 59.9 && w.hammers[0].jackolanternTimer <= 60);
    w.hammers[0].discoTimer = 0;
    api.setState({ earthquakeTimer: 0, localKnockdownTimer: 0 });

    // Extra hammer pickup (capped at 2) + 60s expiration
    api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: 'hammer' });
    api.stepPhysics(0.016);
    assert.equal(w.hammers.length, 2);
    assert.ok(w.hammers[1].extraTimer > 59 && w.hammers[1].extraTimer <= 60);
    api.updateHUD();
    assert.equal(elements.get('hammer-mass-val').textContent, '1.23/0.88');
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
    for (let i = 0; i < 6; i++) {
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
    assert.ok(w.hammers[0].spiderTimer > 59.9 && w.hammers[0].spiderTimer <= 60);

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

    w.hammers[0].spiderTimer = 0.01;
    api.stepPhysics(0.05);
    assert.equal(w.hammers[0].spiderTimer, 0);
    assert.equal(w.hammers[0].isSpider, false);

    // Thor pickup + 1/2 damage, 1/2 blast radius explosion on hit
    api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: 'thor' });
    api.stepPhysics(0.016);
    assert.ok(w.hammers[0].thorTimer > 59.9 && w.hammers[0].thorTimer <= 60);

    e.hitCooldown = 0;
    e.hp = 1000;
    e.maxHp = 1000;
    e.x = 2200;
    e.y = 2100;
    w.hammers[0].x = 2190;
    w.hammers[0].y = 2100;
    w.hammers[0].vx = 600;
    w.hammers[0].vy = 0;
    api.stepPhysics(0.016);
    assert.ok(e.hp < 800, 'Thor hammer triggers blast + impact damage on hit');

    w.hammers[0].thorTimer = 0.01;
    api.stepPhysics(0.05);
    assert.equal(w.hammers[0].thorTimer, 0);

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

    // Broadphase AABB bounds are maintained for warrior and hammer chains
    assert.ok(Number.isFinite(w.reachMinX) && Number.isFinite(w.reachMaxX));
    assert.ok(Number.isFinite(w.reachMinY) && Number.isFinite(w.reachMaxY));
    assert.ok(w.reachMinX < w.x && w.reachMaxX > w.x);
    assert.ok(w.reachMinY < w.y && w.reachMaxY > w.y);
    assert.ok(Number.isFinite(w.hammers[0].chainMinX) && Number.isFinite(w.hammers[0].chainMaxX));
    assert.ok(Number.isFinite(w.hammers[0].chainMinY) && Number.isFinite(w.hammers[0].chainMaxY));
  });

  it('processes server events including bulldozer, earthquake, spider_web, disco_dance, and round_reset', () => {
    api.setState({ localPlayerId: 'me', isMultiplayer: true });
    api.processServerEvents([
      { type: 'bulldozer', playerId: 'me', x: 2100, y: 2100 },
      { type: 'earthquake', x: 2100, y: 2100 },
      { type: 'spider_web', x: 2150, y: 2100 },
      { type: 'disco_dance', x: 2180, y: 2100 },
      { type: 'thor_pickup', x: 2100, y: 2100 },
      { type: 'explosion', x: 2120, y: 2100, radius: 210, isThor: true },
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

  it('renders all 2.5D entities (including Bulldozer mode in drawWarrior, all Hammer modes, all Enemy states, and all 16 Pickups) without errors', () => {
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
    h.isSpider = false;

    h.thorTimer = 60;
    api.drawHammer(h, h.trail);
    h.thorTimer = 0;

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

    // 4. drawBlackCircle for all 16 pickup types
    const allPickupTypes = [
      'link',
      'weight',
      'health',
      'bomb',
      'speed',
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
      'thor',
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

    // Entering a valid nickname starts connecting, keeps dialog open with "Connecting...", and waits for server connection
    const enterModalSubtitle = elements.get('enter-modal-subtitle');
    nicknameInput.value = '  Lady Hammer  ';
    const joinedValid = api.enterGame();
    assert.equal(joinedValid, true);
    assert.equal(api.warrior.name, 'Lady Hammer');
    assert.equal(api.warrior.hasCustomNickname, true);
    assert.equal(api.getState().hasEnteredGame, false);
    assert.equal(api.getState().isConnecting, true);
    assert.equal(enterModal.classList.contains('hidden'), false);
    assert.equal(enterModalSubtitle.textContent, 'Connecting...');

    // Once the WebSocket connects to the server, the dialog closes and hasEnteredGame becomes true
    const ws = api.getState().ws;
    assert.ok(ws, 'Expected WebSocket connection to be initiated');
    ws.readyState = 1;
    ws.emit('open', {});
    assert.equal(api.getState().hasEnteredGame, true);
    assert.equal(api.getState().isConnecting, false);
    assert.equal(enterModal.classList.contains('hidden'), true);

    // Defeating enemies in standalone mode updates local player's kills on the leaderboard
    api.setState({ isMultiplayer: false });
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

    // 2. User sets their own custom nickname and enters game -> waits for server connection
    input1.value = 'Sir Percival';
    const joined = freshInstance.api.enterGame();
    assert.equal(joined, true);
    assert.equal(freshInstance.api.getState().hasEnteredGame, false);
    assert.equal(freshInstance.elements.get('enter-modal').classList.contains('hidden'), false);
    assert.equal(freshInstance.elements.get('enter-modal-subtitle').textContent, 'Connecting...');
    assert.ok(freshInstance.document.cookie.includes('hammertime_nickname=Sir%20Percival'));

    const ws = freshInstance.api.getState().ws;
    ws.readyState = 1;
    ws.emit('open', {});
    assert.equal(freshInstance.api.getState().hasEnteredGame, true);
    assert.equal(freshInstance.elements.get('enter-modal').classList.contains('hidden'), true);

    // 3. Record leaderboard score and reload page (simulated by passing the cookie jar into new instance)
    freshInstance.api.recordLocalLeaderboardScore('Sir Percival', 27);
    const reloadedInstance = loadClientGame(freshInstance.document.cookie);
    const input2 = reloadedInstance.elements.get('nickname-input');
    assert.equal(input2.value, 'Sir Percival');
    const restoredBoard = reloadedInstance.api.getTopLocalLeaderboard();
    assert.equal(restoredBoard.length, 1);
    assert.equal(restoredBoard[0].name, 'Sir Percival');
    assert.equal(restoredBoard[0].kills, 27);
  });

  it('performs local client prediction with smooth reconciliation and remote entity snapshot interpolation', () => {
    const nicknameInput = elements.get('nickname-input');
    nicknameInput.value = 'Sir Predict';
    api.enterGame();
    const ws = api.getState().ws;
    ws.readyState = 1;
    ws.emit('open', {});
    ws.emit('message', {
      data: JSON.stringify({
        type: 'welcome',
        playerId: 'local-1',
        worldWidth: 4200,
        worldHeight: 4200,
      }),
    });

    assert.equal(api.getState().isMultiplayer, true);
    assert.equal(api.getState().localPlayerId, 'local-1');
    assert.equal(api.getState().hasSyncedInitialServerState, false);

    // 1. Initial 'state' snapshot hard-snaps local warrior, remote players, and enemies
    ws.emit('message', {
      data: JSON.stringify({
        type: 'state',
        roundState: 'playing',
        teamKills: 5,
        players: [
          {
            id: 'local-1',
            name: 'Sir Predict',
            color: '#63b3ed',
            capeColor: '#742a2a',
            plumeColor: '#ecc94b',
            alive: true,
            x: 1200,
            y: 1300,
            vx: 100,
            vy: 0,
            angle: 0,
            radius: 20,
            hp: 100,
            maxHp: 100,
            speedMultiplier: 1.1,
            tractionMultiplier: 1.05,
            chainLinks: 4,
            walkCycle: 0,
            hurtFlash: 0,
            kills: 2,
            maxDamageBlow: 40,
            hammers: [
              {
                x: 1120,
                y: 1300,
                vx: 90,
                vy: 0,
                radius: 17,
                mass: 1.85,
                chainLinks: 4,
                linkLength: 14,
                angle: 0,
                currentStretch: 0,
                chainNodes: [
                  { x: 1200, y: 1300 },
                  { x: 1180, y: 1300 },
                  { x: 1160, y: 1300 },
                  { x: 1140, y: 1300 },
                  { x: 1120, y: 1300 },
                ],
              },
            ],
          },
          {
            id: 'remote-2',
            name: 'Lady Remote',
            color: '#f6ad55',
            capeColor: '#2c5282',
            plumeColor: '#f6e05e',
            alive: true,
            x: 1600,
            y: 1600,
            vx: 150,
            vy: -50,
            angle: 0.2,
            radius: 20,
            hp: 100,
            maxHp: 100,
            chainLinks: 4,
            walkCycle: 0,
            hurtFlash: 0,
            hammers: [
              {
                x: 1520,
                y: 1600,
                vx: 140,
                vy: -40,
                radius: 17,
                mass: 1.85,
                chainLinks: 4,
                linkLength: 14,
                angle: 0.2,
                currentStretch: 0,
                chainNodes: [
                  { x: 1600, y: 1600 },
                  { x: 1580, y: 1600 },
                  { x: 1560, y: 1600 },
                  { x: 1540, y: 1600 },
                  { x: 1520, y: 1600 },
                ],
              },
            ],
          },
        ],
        enemies: [
          {
            id: 'enemy-1',
            variant: 'walker',
            x: 1400,
            y: 1400,
            vx: -80,
            vy: 60,
            angle: 2.5,
            radius: 19,
            hp: 75,
            maxHp: 75,
            skinColor: '#567a4e',
            coatColor: '#35302b',
            hurtFlash: 0,
            walkPhase: 0,
          },
        ],
        pickups: [],
      }),
    });

    assert.equal(api.getState().hasSyncedInitialServerState, true);
    assert.equal(api.warrior.x, 1200);
    assert.equal(api.warrior.y, 1300);
    assert.equal(api.warrior.speedMultiplier, 1.1);
    assert.equal(api.warrior.tractionMultiplier, 1.05);
    assert.equal(api.remotePlayers.length, 1);
    assert.equal(api.remotePlayers[0].x, 1600);
    assert.equal(api.enemies.length, 1);
    assert.equal(api.enemies[0].x, 1400);

    // 2. Subsequent 'state' message with small discrepancy smoothly blends instead of hard-jumping
    ws.emit('message', {
      data: JSON.stringify({
        type: 'state',
        roundState: 'playing',
        players: [
          {
            id: 'local-1',
            name: 'Sir Predict',
            alive: true,
            x: 1240,
            y: 1320,
            vx: 100,
            vy: 0,
            angle: 0.5,
            radius: 20,
            hp: 100,
            maxHp: 100,
            chainLinks: 4,
            hammers: [
              {
                x: 1160,
                y: 1320,
                vx: 90,
                vy: 0,
                radius: 17,
                mass: 1.85,
                chainLinks: 4,
                linkLength: 14,
                angle: 0.5,
                chainNodes: [
                  { x: 1240, y: 1320 },
                  { x: 1220, y: 1320 },
                  { x: 1200, y: 1320 },
                  { x: 1180, y: 1320 },
                  { x: 1160, y: 1320 },
                ],
              },
            ],
          },
          {
            id: 'remote-2',
            name: 'Lady Remote',
            alive: true,
            x: 1630,
            y: 1590,
            vx: 150,
            vy: -50,
            angle: 0.4,
            radius: 20,
            hp: 100,
            maxHp: 100,
            chainLinks: 4,
            hammers: [
              {
                x: 1550,
                y: 1590,
                vx: 140,
                vy: -40,
                radius: 17,
                mass: 1.85,
                chainLinks: 4,
                linkLength: 14,
                angle: 0.4,
                chainNodes: [
                  { x: 1630, y: 1590 },
                  { x: 1610, y: 1590 },
                  { x: 1590, y: 1590 },
                  { x: 1570, y: 1590 },
                  { x: 1550, y: 1590 },
                ],
              },
            ],
          },
        ],
        enemies: [
          {
            id: 'enemy-1',
            variant: 'walker',
            x: 1380,
            y: 1415,
            vx: -80,
            vy: 60,
            angle: 2.6,
            radius: 19,
            hp: 75,
            maxHp: 75,
          },
        ],
      }),
    });

    // Should be smoothly blended between old (1200) and new (1240), not hard-jumped to 1240
    assert.ok(api.warrior.x > 1200 && api.warrior.x < 1240);
    assert.ok(api.remotePlayers[0].x > 1600 && api.remotePlayers[0].x < 1630);
    assert.ok(api.enemies[0].x < 1400 && api.enemies[0].x > 1380);

    // 3. Stepping client between snapshots advances local prediction toward mouse, remote player dead-reckoning, and enemy dead-reckoning
    api.mouse.screenX = api.warrior.x + 300 - api.camera.x;
    api.mouse.screenY = (api.warrior.y - api.camera.y) * api.constants.TILT_Y;
    const prevLocalX = api.warrior.x;
    const prevRemoteX = api.remotePlayers[0].x;
    const prevEnemyX = api.enemies[0].x;

    api.stepMultiplayerClient(0.016);

    assert.ok(api.warrior.x > prevLocalX, 'Local warrior should advance via client prediction');
    assert.ok(
      api.remotePlayers[0].x > prevRemoteX,
      'Remote player should advance via velocity dead-reckoning and interpolation'
    );
    assert.ok(
      api.enemies[0].x < prevEnemyX,
      'Enemy with negative vx should advance left via dead-reckoning and interpolation'
    );

    // 4. Large teleport (> 260 px) hard-snaps immediately
    ws.emit('message', {
      data: JSON.stringify({
        type: 'state',
        roundState: 'playing',
        players: [
          {
            id: 'local-1',
            name: 'Sir Predict',
            alive: true,
            x: 3000,
            y: 3000,
            vx: 0,
            vy: 0,
            angle: 0,
            radius: 20,
            hp: 100,
            maxHp: 100,
            chainLinks: 4,
            hammers: [],
          },
        ],
        enemies: [],
      }),
    });
    assert.equal(api.warrior.x, 3000);
    assert.equal(api.warrior.y, 3000);

    // 5. Verify keyboard mode and keys state have been completely removed
    assert.equal('keys' in api, false);
    assert.equal('controlMode' in api.getState(), false);
  });

  it('adapts visual quality tiers (Dynamic LOD), caps/throttles effects & audio, and throttles minimap/HUD updates based on frame time', () => {
    const c = api.constants;
    assert.equal(api.getState().visualQualityTier, c.QUALITY_TIER_HIGH);

    // 1. Frame-time EMA steps down from HIGH (2) -> MEDIUM (1) -> LOW (0) and recovers back to HIGH (2)
    for (let i = 0; i < 12; i++) {
      api.updateVisualQuality(0.023); // 23 ms (~43 FPS)
    }
    assert.equal(api.getState().visualQualityTier, c.QUALITY_TIER_MEDIUM);

    for (let i = 0; i < 12; i++) {
      api.updateVisualQuality(0.034); // 34 ms (~29 FPS)
    }
    assert.equal(api.getState().visualQualityTier, c.QUALITY_TIER_LOW);

    for (let i = 0; i < 20; i++) {
      api.updateVisualQuality(0.014); // 14 ms (~71 FPS)
    }
    assert.equal(api.getState().visualQualityTier, c.QUALITY_TIER_HIGH);

    // 2. Particle & floating-text pool caps and spark count scaling per tier
    api.particles.length = 0;
    api.setState({ visualQualityTier: c.QUALITY_TIER_HIGH });
    api.addParticles(2100, 2100, '#fff', 20, 10, 50);
    assert.equal(api.particles.length, 20);

    api.particles.length = 0;
    api.setState({ visualQualityTier: c.QUALITY_TIER_MEDIUM });
    api.addParticles(2100, 2100, '#fff', 20, 10, 50);
    assert.equal(api.particles.length, 10); // 0.5x in MEDIUM

    api.particles.length = 0;
    api.setState({ visualQualityTier: c.QUALITY_TIER_LOW });
    api.addParticles(2100, 2100, '#fff', 20, 10, 50);
    assert.equal(api.particles.length, 5); // 0.25x in LOW

    // Hard pool cap in LOW tier (90 particles, 16 floatingTexts)
    for (let i = 0; i < 30; i++) {
      api.addParticles(2100, 2100, '#fff', 20, 10, 50);
      api.addFloatingText(2100, 2100, `hit-${i}`);
    }
    assert.equal(api.particles.length, c.MAX_PARTICLES_BY_TIER[c.QUALITY_TIER_LOW]);
    assert.equal(api.floatingTexts.length, c.MAX_FLOATING_TEXTS_BY_TIER[c.QUALITY_TIER_LOW]);

    // 3. Off-screen impact and enemy_die events are culled while on-screen or local-victim events are processed
    api.particles.length = 0;
    api.floatingTexts.length = 0;
    api.setState({ visualQualityTier: c.QUALITY_TIER_HIGH, localPlayerId: 'local-1' });
    // Far off-screen (camera is around 2100, 2100)
    api.processServerEvents([
      { type: 'impact', x: 50, y: 50, enemyX: 50, enemyY: 50, damage: 30 },
      { type: 'enemy_die', x: 50, y: 50, color: '#567a4e' },
    ]);
    assert.equal(api.particles.length, 0);
    assert.equal(api.floatingTexts.length, 0);

    // On-screen impact spawns particles and floating text
    api.processServerEvents([
      { type: 'impact', x: 2100, y: 2100, enemyX: 2100, enemyY: 2100, damage: 30 },
    ]);
    assert.ok(api.particles.length > 0);
    assert.equal(api.floatingTexts.length, 1);

    // 4. Web Audio rate limiter caps sounds per 100ms window by tier
    api.setState({
      visualQualityTier: c.QUALITY_TIER_LOW,
      soundWindowStartMs: -1000,
      soundsInCurrentWindow: 0,
    });
    assert.equal(api.canPlayRateLimitedSound(1000), true);
    assert.equal(api.canPlayRateLimitedSound(1010), true);
    assert.equal(
      api.canPlayRateLimitedSound(1020),
      false,
      'Low tier should cap at 2 sounds per 100ms window'
    );
    assert.equal(
      api.canPlayRateLimitedSound(1105),
      true,
      'New 100ms window should reset sound budget'
    );

    // 5. Hammer trail length adapts by tier in updateEffects and render() executes across all tiers
    api.warrior.alive = true;
    api.hammer.vx = 500;
    api.hammer.vy = 0;
    api.hammer.flameTimer = 5;
    api.setState({ visualQualityTier: c.QUALITY_TIER_MEDIUM });
    for (let i = 0; i < 10; i++) {
      api.updateEffects(0.005);
    }
    assert.ok(api.hammer.trail.length <= 4 && api.hammer.trail.length > 0);
    api.render();

    api.setState({ visualQualityTier: c.QUALITY_TIER_LOW });
    api.updateEffects(0.005);
    assert.equal(api.hammer.trail.length, 0);
    api.render();

    // Verify static ground scenery (grass blades, wildflowers, pebbles, meadow patches) never changes across tiers so grass never blinks
    api.warrior.alive = false;
    api.enemies.length = 0;
    api.particles.length = 0;
    api.floatingTexts.length = 0;
    api.shockwaves.length = 0;
    const gameCtx = elements.get('game-canvas')._ctx;
    const countSceneryOps = (tier) => {
      let lineToCount = 0;
      let ellipseCount = 0;
      let arcCount = 0;
      gameCtx.lineTo = () => {
        lineToCount++;
      };
      gameCtx.ellipse = () => {
        ellipseCount++;
      };
      gameCtx.arc = () => {
        arcCount++;
      };
      api.setState({ visualQualityTier: tier, minimapAccumSec: 0 });
      api.render();
      return { lineToCount, ellipseCount, arcCount };
    };
    const highOps = countSceneryOps(c.QUALITY_TIER_HIGH);
    const medOps = countSceneryOps(c.QUALITY_TIER_MEDIUM);
    const lowOps = countSceneryOps(c.QUALITY_TIER_LOW);
    assert.ok(highOps.lineToCount > 50, 'Expected visible grass blades to be drawn');
    assert.deepEqual(
      medOps,
      highOps,
      'Grass blades, pebbles, and wildflowers must remain identical in MEDIUM tier (no blinking)'
    );
    assert.deepEqual(
      lowOps,
      highOps,
      'Grass blades, pebbles, and wildflowers must remain identical in LOW tier (no blinking)'
    );

    // 6. Minimap throttled to 10 Hz (0.1s) and leaderboard DOM only rebuilt when entries change
    const leaderboardList = elements.get('leaderboard-list');
    api.recordLocalLeaderboardScore('Sir Cache', 10);
    api.updateHUD();
    const firstChildRef = leaderboardList.children[0];
    assert.ok(firstChildRef);
    api.updateHUD();
    assert.equal(
      leaderboardList.children[0],
      firstChildRef,
      'Unchanged leaderboard should not rebuild DOM nodes on every updateHUD() call'
    );

    api.setState({ minimapAccumSec: 0.02 });
    api.render();
    assert.equal(
      api.getState().minimapAccumSec,
      0.02,
      'render() should skip renderMinimap() when < 0.1s has elapsed'
    );
    api.setState({ minimapAccumSec: 0.1 });
    api.render();
    assert.equal(
      api.getState().minimapAccumSec,
      0,
      'render() should run renderMinimap() and reset accumulator once >= 0.1s has elapsed'
    );
  });

  it('spawns and renders bomb blast and Thor lightning animations across their blast areas', () => {
    const { api } = loadClientGame();
    const c = api.constants;
    api.shockwaves.length = 0;

    // 1. Bomb explosion creates a 'bomb' blast animation across EXPLOSION_RADIUS (420)
    api.triggerHammerExplosion(1200, 1300, api.hammer);
    const bombWave = api.shockwaves.find((s) => s.kind === 'bomb');
    assert.ok(bombWave, 'Expected a bomb blast animation entry in shockwaves');
    assert.equal(bombWave.maxRadius, c.EXPLOSION_RADIUS);
    assert.ok(Array.isArray(bombWave.rays) && bombWave.rays.length === 12);

    // 2. Thor hammer hit creates a 'thor' lightning animation across THOR_EXPLOSION_RADIUS (210)
    api.shockwaves.length = 0;
    api.triggerHammerExplosion(1250, 1350, api.hammer, {
      radius: c.THOR_EXPLOSION_RADIUS,
      damageScale: c.THOR_BLAST_DAMAGE_MULT,
      isThor: true,
    });
    const thorWave = api.shockwaves.find((s) => s.kind === 'thor');
    assert.ok(thorWave, 'Expected a thor lightning animation entry in shockwaves');
    assert.equal(thorWave.maxRadius, c.THOR_EXPLOSION_RADIUS);
    assert.ok(Array.isArray(thorWave.bolts) && thorWave.bolts.length === 8);
    assert.ok(Array.isArray(thorWave.skyBolt) && thorWave.skyBolt.length > 1);

    // 3. Server explosion events also trigger the bomb and thor blast/lightning animations
    api.shockwaves.length = 0;
    api.processServerEvents([
      { type: 'explosion', x: 1000, y: 1000, radius: 420, isThor: false },
      { type: 'explosion', x: 1100, y: 1100, radius: 210, isThor: true },
    ]);
    assert.ok(api.shockwaves.some((s) => s.kind === 'bomb' && s.maxRadius === 420));
    assert.ok(api.shockwaves.some((s) => s.kind === 'thor' && s.maxRadius === 210));

    // 4. Stepping effects and rendering executes both ground-plane and 2.5D elevated animations cleanly
    api.updateEffects(0.08);
    assert.doesNotThrow(() => {
      api.render();
    });
  });

  it('does not run any animation loop or simulation steps when a dialog box is showing', () => {
    const loaded = loadClientGame();
    const { api, elements, rafCalls, cancelRafCalls } = loaded;
    const enterModal = elements.get('enter-modal');
    const gameOverModal = elements.get('game-over-modal');
    const victoryModal = elements.get('victory-modal');
    const gameCtx = elements.get('game-canvas')._ctx;

    // 1. On initial load, #enter-modal is showing -> no requestAnimationFrame loop is started
    assert.equal(enterModal.classList.contains('hidden'), false);
    assert.equal(api.isDialogShowing(), true);
    assert.equal(api.getState().isLoopRunning, false);
    assert.equal(rafCalls.length, 0, 'Should not schedule requestAnimationFrame on initial modal load');

    // Calling gameLoop while #enter-modal is showing does not render, step physics, or schedule RAF
    let fillRectCount = 0;
    const origFillRect = gameCtx.fillRect;
    gameCtx.fillRect = (...args) => {
      fillRectCount++;
      return origFillRect.apply(gameCtx, args);
    };
    const origWarriorX = api.warrior.x;
    api.warrior.vx = 400;
    api.gameLoop(Date.now() + 16);
    assert.equal(fillRectCount, 0, 'Should not render while enter dialog is showing');
    assert.equal(api.warrior.x, origWarriorX, 'Should not step physics while enter dialog is showing');
    assert.equal(rafCalls.length, 0, 'Should not schedule RAF while enter dialog is showing');

    // 2. Entering game: while "Connecting...", modal is still open -> loop still stopped
    elements.get('nickname-input').value = 'Sir QuietFan';
    api.enterGame();
    assert.equal(enterModal.classList.contains('hidden'), false);
    assert.equal(api.isDialogShowing(), true);
    assert.equal(api.getState().isLoopRunning, false);
    assert.equal(rafCalls.length, 0);

    // 3. When WebSocket connects, #enter-modal hides and the animation loop starts
    const ws = api.getState().ws;
    ws.readyState = 1;
    ws.emit('open', {});
    assert.equal(enterModal.classList.contains('hidden'), true);
    assert.equal(api.isDialogShowing(), false);
    assert.equal(api.getState().isLoopRunning, true);
    assert.equal(rafCalls.length, 1, 'Expected animation loop to start once dialog closes');

    // Running a frame when no dialog is showing steps simulation, renders, and schedules next RAF
    const nowMs = Date.now() + 16;
    api.setState({ lastUserActivityTime: nowMs });
    api.gameLoop(nowMs);
    assert.ok(fillRectCount > 0, 'Expected render() to execute when no dialog is showing');
    assert.equal(rafCalls.length, 2, 'Expected next animation frame to be scheduled');

    // 4. When idle timeout triggers pauseForIdle (idle dialog box showing), loop stops and cancels RAF
    fillRectCount = 0;
    const rafCountBeforeIdle = rafCalls.length;
    api.setState({ lastUserActivityTime: nowMs - 130000 });
    api.gameLoop(nowMs + 16);
    assert.equal(enterModal.classList.contains('hidden'), false, 'Idle dialog box should be visible');
    assert.equal(api.isDialogShowing(), true);
    assert.equal(api.getState().isLoopRunning, false);
    assert.equal(fillRectCount, 0, 'Should not render on the frame that pauses for idle');
    assert.equal(rafCalls.length, rafCountBeforeIdle, 'Should not schedule any new RAF when paused for idle');

    // Calling pauseForIdle while loop is active cancels the pending animationFrameId
    ws.readyState = 1;
    ws.emit('open', {});
    assert.equal(api.getState().isLoopRunning, true);
    const pendingId = api.getState().animationFrameId;
    assert.ok(pendingId !== null);
    api.pauseForIdle('Paused for test');
    assert.equal(api.getState().isLoopRunning, false);
    assert.equal(api.getState().animationFrameId, null);
    assert.ok(cancelRafCalls.includes(pendingId), 'Expected cancelAnimationFrame to be called with pending id');

    // 5. Showing #victory-modal or #game-over-modal also stops the animation loop and simulation
    ws.readyState = 1;
    ws.emit('open', {});
    assert.equal(api.getState().isLoopRunning, true);
    victoryModal.classList.remove('hidden');
    assert.equal(api.isDialogShowing(), true);
    fillRectCount = 0;
    const rafBeforeVictoryFrame = rafCalls.length;
    api.gameLoop(Date.now() + 32);
    assert.equal(api.getState().isLoopRunning, false);
    assert.equal(fillRectCount, 0, 'Should not render while victory modal is showing');
    assert.equal(rafCalls.length, rafBeforeVictoryFrame, 'Should not schedule RAF while victory modal is showing');

    victoryModal.classList.add('hidden');
    gameOverModal.classList.remove('hidden');
    assert.equal(api.isDialogShowing(), true);
    api.startAnimationLoop();
    assert.equal(api.getState().isLoopRunning, false, 'Should not start loop while game-over modal is showing');
  });
});
