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
    arc: (x, y, radius, startAngle, endAngle, counterclockwise) => {
      if (radius < 0) {
        throw new DOMException(
          `Failed to execute 'arc' on 'CanvasRenderingContext2D': The radius provided (${radius}) is negative.`,
          'IndexSizeError'
        );
      }
    },
    arcTo: noop,
    ellipse: (x, y, radiusX, radiusY, rotation, startAngle, endAngle, counterclockwise) => {
      if (radiusX < 0 || radiusY < 0) {
        throw new DOMException(
          `Failed to execute 'ellipse' on 'CanvasRenderingContext2D': The radius provided is negative.`,
          'IndexSizeError'
        );
      }
    },
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
    listeners: {},
    addEventListener(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    },
    dispatchEvent(ev) {
      const list = this.listeners[ev.type] || [];
      for (const fn of list) fn(ev);
    },
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    getBoundingClientRect: () => ({ left: 1100, top: 590, width: 140, height: 140 }),
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
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    Buffer,
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;
  sandbox.window.performance = sandbox.performance;
  sandbox.window.atob = sandbox.atob;
  sandbox.window.btoa = sandbox.btoa;
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
    assert.equal(c.BULLDOZER_SCALE, srv.BULLDOZER_SCALE);
    assert.equal(c.BULLDOZER_SCALE, 1.4);
    assert.equal(c.BULLDOZER_RADIUS, srv.BULLDOZER_RADIUS);
    assert.equal(c.BULLDOZER_RADIUS, 48);
    assert.equal(c.HORSE_RADIUS, srv.HORSE_RADIUS);
    assert.equal(c.TORTOISE_RADIUS, srv.TORTOISE_RADIUS);
    assert.equal(c.ELEPHANT_RADIUS, srv.ELEPHANT_RADIUS);
    assert.equal(c.TIME_GAP_RESET_SECONDS, srv.TIME_GAP_RESET_SECONDS);
    assert.equal(c.TIME_GAP_RESET_SECONDS, 30);
    assert.equal(c.WHIRLWIND_MIN_ANGULAR_SPEED, srv.WHIRLWIND_MIN_ANGULAR_SPEED);
    assert.equal(c.WHIRLWIND_CHARGE_DURATION, srv.WHIRLWIND_CHARGE_DURATION);
    assert.equal(c.WHIRLWIND_REACH_MULT, srv.WHIRLWIND_REACH_MULT);
    assert.equal(c.WHIRLWIND_GUST_RADIUS, srv.WHIRLWIND_GUST_RADIUS);
    assert.equal(c.WHIRLWIND_GUST_DAMAGE, srv.WHIRLWIND_GUST_DAMAGE);
    assert.equal(c.WHIRLWIND_LEVEL_DURATION, srv.WHIRLWIND_LEVEL_DURATION);
    assert.equal(c.WHIRLWIND_MAX_LEVEL, srv.WHIRLWIND_MAX_LEVEL);
    assert.deepEqual([...c.WHIRLWIND_LEVEL_DAMAGES], [...srv.WHIRLWIND_LEVEL_DAMAGES]);
    assert.deepEqual([...c.WHIRLWIND_LEVEL_RADII], [...srv.WHIRLWIND_LEVEL_RADII]);
    assert.equal(c.HIT_STOP_DURATION, srv.HIT_STOP_DURATION);
    assert.equal(c.HIT_STOP_DAMAGE_THRESHOLD, srv.HIT_STOP_DAMAGE_THRESHOLD);
    assert.equal(c.HIT_STOP_BIG_SHAKE_THRESHOLD, srv.HIT_STOP_BIG_SHAKE_THRESHOLD);
    assert.equal(c.MOTORCYCLE_WRECK_DURATION, srv.MOTORCYCLE_WRECK_DURATION);
    assert.equal(c.MOTORCYCLE_WRECK_SCALE, srv.MOTORCYCLE_WRECK_SCALE);
    assert.equal(c.MOTORCYCLE_WRECK_RADIUS, srv.MOTORCYCLE_WRECK_RADIUS);
    assert.equal(c.MOTORCYCLE_MOUNT_RADIUS, srv.MOTORCYCLE_MOUNT_RADIUS);
    assert.equal(c.MULTI_KILL_WINDOW, srv.MULTI_KILL_WINDOW);
    assert.deepEqual([...c.ALL_LIMBS], [...srv.ALL_LIMBS]);
    assert.deepEqual([...c.PICKUP_TYPES], srv.PICKUP_TYPES);
    assert.deepEqual([...c.PICKUP_TYPES], ['link', 'weight', 'health', 'bomb', 'speed', 'flame']);
    assert.equal(c.PICKUP_TYPES.includes('traction'), false);
    assert.deepEqual([...c.ZOMBIE_ATTACK_VARIATIONS], srv.ZOMBIE_ATTACK_VARIATIONS);
    assert.deepEqual([...c.ZOMBIE_ATTACK_VARIATIONS], ['normal', 'heavy', 'fast']);
    assert.deepEqual([...c.HURT_SOUNDS], srv.HURT_SOUNDS);
    assert.deepEqual([...c.HURT_NOISES], srv.HURT_NOISES);
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
    assert.equal(w.radius, 35);
    w.mountType = null;
    w.mountHp = 0;
    w.radius = 20;

    api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: 'tortoise' });
    api.stepPhysics(0.016);
    assert.equal(w.mountType, 'tortoise');
    assert.equal(w.radius, 36);

    api.blackCircles.push({ x: w.x, y: w.y, radius: 10, pulse: 0, type: 'elephant' });
    api.stepPhysics(0.016);
    assert.equal(w.mountType, 'elephant');
    assert.equal(w.radius, 45);

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

    const gameCanvas = elements.get('game-canvas');
    const gameCtx = gameCanvas._ctx || gameCanvas.getContext('2d');
    const scaleCalls = [];
    const origScale = gameCtx.scale;
    gameCtx.scale = (sx, sy) => {
      scaleCalls.push([sx, sy]);
      if (origScale) origScale(sx, sy);
    };

    w.mountType = 'horse';
    w.mountHp = 100;
    w.mountMaxHp = 100;
    api.updateHUD();
    assert.equal(elements.get('mount-label').textContent, 'WARHORSE HP');
    api.drawWarrior(w, true);
    assert.ok(scaleCalls.some(([sx, sy]) => Math.abs(sx - 1.4) < 1e-4 && Math.abs(sy - 1.4) < 1e-4), 'Should scale horse mount 1.4x (reduced 30%)');

    scaleCalls.length = 0;
    w.mountType = 'tortoise';
    api.updateHUD();
    assert.equal(elements.get('mount-label').textContent, 'GIANT TORTOISE HP');
    api.drawWarrior(w, true);
    assert.ok(scaleCalls.some(([sx, sy]) => Math.abs(sx - 1.4) < 1e-4 && Math.abs(sy - 1.4) < 1e-4), 'Should scale tortoise mount 1.4x (reduced 30%)');

    scaleCalls.length = 0;
    w.mountType = 'elephant';
    api.updateHUD();
    assert.equal(elements.get('mount-label').textContent, 'WAR ELEPHANT HP');
    api.drawWarrior(w, true);
    assert.ok(scaleCalls.some(([sx, sy]) => Math.abs(sx - 1.4) < 1e-4 && Math.abs(sy - 1.4) < 1e-4), 'Should scale elephant mount 1.4x (reduced 30%)');

    scaleCalls.length = 0;
    w.mountType = 'motorcycle';
    w.mountHp = 100;
    w.mountMaxHp = 100;
    api.updateHUD();
    assert.equal(elements.get('mount-label').textContent, 'MOTORCYCLE HP');
    assert.ok(!elements.get('mount-label').textContent.toLowerCase().includes('horse'), 'HUD should say motorcycle instead of horse');
    // Test warrior riding motorcycle facing south (towards camera) and north (away from camera)
    w.angle = Math.PI / 2;
    w.vx = 250;
    w.vy = 50;
    api.drawWarrior(w, true);
    assert.ok(scaleCalls.some(([sx, sy]) => Math.abs(sx - 1.4) < 1e-4 && Math.abs(sy - 1.4) < 1e-4), 'Should scale warrior motorcycle mount 1.4x');

    w.angle = -Math.PI / 2;
    api.drawWarrior(w, false);

    gameCtx.scale = origScale;

    w.bulldozerTimer = 20.0;
    api.updateHUD();
    assert.equal(elements.get('mount-label').textContent, 'BULLDOZER MODE');
    scaleCalls.length = 0;
    gameCtx.scale = (sx, sy) => {
      scaleCalls.push([sx, sy]);
      if (origScale) origScale(sx, sy);
    };
    // Test drawWarrior with bulldozer active facing both north and south
    w.angle = -Math.PI / 2;
    api.drawWarrior(w, true);
    assert.ok(
      scaleCalls.some(([sx, sy]) => Math.abs(sx - 1.4) < 1e-4 && Math.abs(sy - 1.4) < 1e-4),
      'Should scale bulldozer 1.4x (40% larger)'
    );
    w.angle = Math.PI / 2;
    api.drawWarrior(w, false);
    gameCtx.scale = origScale;
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
    e.knockdownTimer = 0;

    // Motorcycle zombie rendering (full health, speeding, facing south and north, and damaged with health bar)
    e.variant = 'motorcycle';
    e.hp = 75;
    e.maxHp = 75;
    e.angle = Math.PI / 2; // Facing south (towards camera)
    e.vx = 220;
    e.vy = 0;
    api.drawEnemy(e);

    e.angle = -Math.PI / 2; // Facing north (away from camera)
    e.vx = 180;
    e.vy = 90;
    e.hp = 45;
    api.drawEnemy(e);

    // Motorcycle zombie with severed left arm (steering with single arm)
    e.lostLimbs = ['left_arm'];
    api.drawEnemy(e);
    e.lostLimbs = [];
    e.variant = 'walker';

    // 3b. drawLaidDownMotorcycle (30 seconds duration on the ground)
    const testWreck = {
      x: 2150,
      y: 2150,
      angle: 0.78,
      radius: api.constants.MOTORCYCLE_WRECK_RADIUS,
      timer: 30.0,
      duration: 30.0,
    };
    assert.equal(api.constants.MOTORCYCLE_WRECK_RADIUS, 25, 'Laid-down motorcycle radius should be 20% larger (25px)');
    // Test across entire 30s lifecycle: fresh crash, mid-life cooling, near expiration, fading out, and boundary values
    for (const testTimer of [30.0, 29.5, 20.0, 15.0, 10.0, 5.0, 2.0, 1.0, 0.5, 0.08, 0.0, -0.5]) {
      testWreck.timer = testTimer;
      assert.doesNotThrow(() => {
        api.drawLaidDownMotorcycle(testWreck);
      }, `drawLaidDownMotorcycle should render without throwing at timer=${testTimer}`);
    }

    // Process motorcycle_wreck event and verify 5-second duration
    api.laidDownMotorcycles.length = 0;
    api.processServerEvents([
      {
        type: 'motorcycle_wreck',
        x: 2100,
        y: 2100,
        angle: 1.2,
        radius: 21,
        duration: 5.0,
      },
    ]);
    assert.equal(api.laidDownMotorcycles.length, 1, 'Client should receive and track motorcycle wreck');
    assert.equal(api.laidDownMotorcycles[0].duration, 5.0);
    assert.equal(api.laidDownMotorcycles[0].timer, 5.0);

    // Update by 2.5s
    api.updateLaidDownMotorcycles(2.5);
    assert.equal(api.laidDownMotorcycles.length, 1, 'Wreck should still exist at 2.5s');
    assert.ok(Math.abs(api.laidDownMotorcycles[0].timer - 2.5) < 0.001);

    // Update by another 3.0s (total 5.5s > 5.0s) -> removed
    api.updateLaidDownMotorcycles(3.0);
    assert.equal(api.laidDownMotorcycles.length, 0, 'Wreck should be removed after 5 seconds');

    // Verify claim_motorcycle event processing on client
    api.laidDownMotorcycles.push({
      id: 'wreck-claim-test',
      x: 2200,
      y: 2200,
      angle: 0,
      radius: 20,
      timer: 20,
      duration: 30,
    });
    assert.equal(api.laidDownMotorcycles.length, 1);
    api.processServerEvents([
      {
        type: 'claim_motorcycle',
        id: 'wreck-claim-test',
        x: 2200,
        y: 2200,
      },
    ]);
    assert.equal(api.laidDownMotorcycles.length, 0, 'Client removes wreck when claim_motorcycle event is processed');

    // Verify drawing warrior riding a motorcycle mount
    const testRider = {
      x: 2000,
      y: 2000,
      angle: 0.5,
      mountType: 'motorcycle',
      mountHp: 80,
      mountMaxHp: 100,
      radius: api.constants.MOTORCYCLE_MOUNT_RADIUS,
      hp: 100,
      maxHp: 100,
      name: 'BikerKnight',
    };
    assert.doesNotThrow(() => {
      api.drawWarrior(testRider, true);
      // Also when facing north (dirY < 0)
      testRider.angle = -Math.PI / 2;
      api.drawWarrior(testRider, false);
    }, 'drawWarrior with motorcycle mount should render cleanly in both directions');

    // Verify warrior on motorcycle enforces wide minimum turning radius in client prediction
    api.warrior.x = 2000;
    api.warrior.y = 2000;
    api.warrior.angle = 0; // East
    api.warrior.vx = 200;
    api.warrior.vy = 0;
    api.warrior.mountType = 'motorcycle';
    api.warrior.mountHp = 100;
    api.camera.x = 2000;
    api.camera.y = 2000;
    api.mouse.screenX = 0;
    api.mouse.screenY = -300; // Directly North

    const predDt = 0.05;
    api.stepLocalWarriorAndHammers(predDt, true);

    const expectedPredTurnCap = api.constants.MOTORCYCLE_TURN_RATE * predDt; // 0.06 rad
    assert.ok(
      Math.abs(api.warrior.angle) <= expectedPredTurnCap + 1e-4,
      `Client motorcycle warrior turns slowly (<= ${expectedPredTurnCap} rad), actual: ${api.warrior.angle}`
    );
    assert.ok(
      api.warrior.vx > 0,
      'Client motorcycle warrior maintains forward drive along heading instead of reverse-braking'
    );

    // Unmounted warrior turns rapidly toward mouse
    api.warrior.mountType = null;
    api.warrior.angle = 0;
    api.stepLocalWarriorAndHammers(predDt, true);
    assert.ok(
      Math.abs(api.warrior.angle) > expectedPredTurnCap * 5,
      'Unmounted client warrior turns significantly faster than motorcycle mount'
    );

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
    assert.ok(input1.value.length <= 20, `Prepopulated nickname exceeds 20 characters: "${input1.value}"`);

    const validMaleTitles = freshInstance.api.MALE_TITLES;
    const validFemaleTitles = freshInstance.api.FEMALE_TITLES;
    const validDescriptors = freshInstance.api.COLOR_OR_ANIMAL_DESCRIPTORS;
    const validLocationTitles = freshInstance.api.LOCATION_TITLES;

    const matchesGroup =
      validMaleTitles.some((t) => input1.value.startsWith(`${t} `)) ||
      validFemaleTitles.some((t) => input1.value.startsWith(`${t} `)) ||
      validDescriptors.some((d) => input1.value.startsWith(`${d} `)) ||
      validLocationTitles.some((t) => input1.value.startsWith(`${t} of `));
    assert.ok(
      matchesGroup,
      `Expected nickname to match one of the 4 medieval nickname groups, got: "${input1.value}"`
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

  it('generates medieval nickname combinations across 4 groups (male, female, non-gendered, location) and allows regenerating via dice button', () => {
    const instance = loadClientGame('');
    const input = instance.elements.get('nickname-input');
    const diceBtn = instance.elements.get('nickname-dice-btn');

    // 1. Verify male titles and names are defined (Knight removed as title)
    const expectedMaleTitles = ['King', 'Sir', 'Lord', 'Duke', 'Baron', 'Earl', 'Prince', 'Count'];
    assert.deepEqual([...instance.api.MALE_TITLES], expectedMaleTitles);
    assert.equal(instance.api.MALE_TITLES.includes('Knight'), false, 'Knight must be removed as a title');

    const expectedMaleNames = [
      'Galahad',
      'Roland',
      'Lancelot',
      'Bedivere',
      'Percival',
      'Gareth',
      'Gawain',
      'Tristram',
      'Godfrey',
      'Baldwin',
      'Roderick',
      'Cedric',
      'Aldous',
    ];
    assert.deepEqual([...instance.api.MALE_NAMES], expectedMaleNames);

    // 2. Verify female titles and names are defined
    const expectedFemaleTitles = ['Queen', 'Lady', 'Dame', 'Duchess', 'Baroness', 'Countess', 'Princess'];
    assert.deepEqual([...instance.api.FEMALE_TITLES], expectedFemaleTitles);

    const expectedFemaleNames = [
      'Guinevere',
      'Eleanor',
      'Isolde',
      'Rowena',
      'Morwenna',
      'Beatrix',
      'Matilda',
      'Yvaine',
      'Clarice',
      'Astrid',
      'Vivienne',
    ];
    assert.deepEqual([...instance.api.FEMALE_NAMES], expectedFemaleNames);

    // 3. Verify non-gendered group (color or animal descriptor + warrior type)
    const expectedDescriptors = [
      'Crimson', 'Scarlet', 'Azure', 'Emerald', 'Cobalt', 'Amber', 'Obsidian', 'Amethyst',
      'Onyx', 'Ruby', 'Sapphire', 'Verdant', 'Cerulean', 'Indigo', 'Violet', 'Copper', 'Bronze',
      'Silver', 'Gold', 'Iron', 'Ashen', 'Russet', 'Green', 'Red', 'Blue', 'Grey',
      'Wolf', 'Whale', 'Snake', 'Bear', 'Hawk', 'Eagle', 'Lion', 'Tiger', 'Stag', 'Boar', 'Raven', 'Fox', 'Viper', 'Falcon', 'Dragon'
    ];
    assert.deepEqual([...instance.api.COLOR_OR_ANIMAL_DESCRIPTORS], expectedDescriptors);
    assert.equal(instance.api.COLOR_OR_ANIMAL_DESCRIPTORS.includes('Black'), false, 'Black must be removed');
    assert.equal(instance.api.COLOR_OR_ANIMAL_DESCRIPTORS.includes('White'), false, 'White must be removed');

    const expectedWarriorTypes = [
      'Knight', 'Warrior', 'Paladin', 'Squire', 'Huntsman', 'Champion', 'Berserker', 'Guardian', 'Crusader', 'Slayer', 'Ranger', 'Sentinel', 'Vanguard'
    ];
    assert.deepEqual([...instance.api.WARRIOR_TYPES], expectedWarriorTypes);

    // Test expected descriptor combinations: "Green Warrior", "Wolf Paladin", "Whale Squire", "Snake Huntsman", "Obsidian Knight", "Crimson Berserker"
    const exampleNonGendered = [
      'Green Warrior',
      'Wolf Paladin',
      'Whale Squire',
      'Snake Huntsman',
      'Obsidian Knight',
      'Emerald Paladin',
      'Crimson Berserker',
    ];
    for (const eg of exampleNonGendered) {
      assert.ok(instance.api.MEDIEVAL_NAME_SUGGESTIONS.includes(eg), `Pool should include example non-gendered name "${eg}"`);
    }

    // 4. Verify location-based group (title + "of" + fantasy location)
    const expectedLocationTitles = [
      'King', 'Queen', 'Lord', 'Lady', 'Duke', 'Duchess', 'Baron', 'Baroness', 'Prince', 'Princess', 'Earl', 'Countess'
    ];
    assert.deepEqual([...instance.api.LOCATION_TITLES], expectedLocationTitles);
    assert.equal(instance.api.LOCATION_TITLES.includes('Knight'), false, 'Knight must not be in location titles');

    const expectedLocations = [
      'Highshire', 'Ironhold', 'Oakhaven', 'Ravenrock', 'Stormfall', 'Sunspire', 'Frostpeak', 'Windmere', 'Deepwood', 'Riverbend', 'Greymoor', 'Dunhollow', 'Goldcrest', 'Thornhill', 'Stonehaven'
    ];
    assert.deepEqual([...instance.api.FANTASY_LOCATIONS], expectedLocations);

    // Test expected location combination: "King of Highshire"
    assert.ok(
      instance.api.MEDIEVAL_NAME_SUGGESTIONS.includes('King of Highshire'),
      'Pool should include "King of Highshire"'
    );

    // 5. Verify total pool size and all combinations fit within MAX_NICKNAME_LENGTH (20 chars)
    assert.ok(instance.api.MEDIEVAL_NAME_SUGGESTIONS.length > 500, 'Should offer over 500 nickname choices');
    for (const name of instance.api.MEDIEVAL_NAME_SUGGESTIONS) {
      assert.ok(name.length <= 20, `Name "${name}" exceeds 20 characters`);
      assert.ok(name.length > 0, 'Name must not be empty');
    }

    // 6. Test specific random name generator categories
    for (let i = 0; i < 30; i++) {
      const maleName = instance.api.getRandomMedievalName('male');
      const [titleM, nameM] = maleName.split(' ');
      assert.ok(expectedMaleTitles.includes(titleM), `Expected male title, got "${titleM}"`);
      assert.ok(expectedMaleNames.includes(nameM), `Expected male name, got "${nameM}"`);

      const femaleName = instance.api.getRandomMedievalName('female');
      const [titleF, nameF] = femaleName.split(' ');
      assert.ok(expectedFemaleTitles.includes(titleF), `Expected female title, got "${titleF}"`);
      assert.ok(expectedFemaleNames.includes(nameF), `Expected female name, got "${nameF}"`);

      const descName = instance.api.getRandomMedievalName('descriptor');
      const [desc, warrior] = descName.split(' ');
      assert.ok(expectedDescriptors.includes(desc), `Expected color/animal descriptor, got "${desc}"`);
      assert.ok(expectedWarriorTypes.includes(warrior), `Expected warrior type, got "${warrior}"`);

      const locName = instance.api.getRandomMedievalName('location');
      assert.ok(locName.includes(' of '), `Expected location name with " of ", got "${locName}"`);
      const [locTitle, locPlace] = locName.split(' of ');
      assert.ok(expectedLocationTitles.includes(locTitle), `Expected location title, got "${locTitle}"`);
      assert.ok(expectedLocations.includes(locPlace), `Expected fantasy location, got "${locPlace}"`);
      assert.ok(locName.length <= 20);
    }

    // 7. Test clicking the dice icon regenerates a new random nickname across all groups
    const initialName = input.value;
    assert.ok(initialName && initialName.length > 0);

    const rolledNames = [initialName];
    for (let i = 0; i < 30; i++) {
      const prevVal = input.value;
      diceBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
      const newVal = input.value;
      assert.ok(newVal && newVal.length > 0);
      assert.ok(newVal.length <= 20);
      // Verify clicking dice regenerates a new name rather than staying on the same name
      assert.notEqual(newVal, prevVal, `Roll ${i} should produce a new name different from previous`);
      rolledNames.push(newVal);
    }
    const uniqueRolled = new Set(rolledNames);
    assert.ok(uniqueRolled.size >= 15, 'Repeated dice clicks should offer a diverse set of nickname choices');

    // 8. Test rollRandomNickname helper directly
    const directRoll = instance.api.rollRandomNickname();
    assert.equal(input.value, directRoll);

    // 9. Test dialog subtitle, input help text, and random heroic calls to action on enter button
    const enterBtn = instance.elements.get('enter-game-btn');
    assert.ok(
      instance.api.HEROIC_CALLS_TO_ACTION.length >= 12,
      'Expected at least a dozen heroic calls to action'
    );
    assert.ok(instance.api.HEROIC_CALLS_TO_ACTION.includes('Let there be blood!'));
    assert.ok(instance.api.HEROIC_CALLS_TO_ACTION.includes('Beat them back!'));
    assert.ok(instance.api.HEROIC_CALLS_TO_ACTION.includes('Onward to glory!'));
    assert.ok(
      instance.api.HEROIC_CALLS_TO_ACTION.includes(enterBtn.textContent),
      `Expected enter button text to be one of the heroic calls to action, got: "${enterBtn.textContent}"`
    );

    // Verify HTML template contains updated subtitle and help text
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(
      indexHtml.includes('Swing your mace to protect the grasslands from a horde of zombies!'),
      'index.html should have the updated dialog middle text'
    );
    assert.ok(
      indexHtml.includes('placeholder="Choose a nickname"'),
      'index.html should have the updated input field placeholder'
    );
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

  it('provides a translucent touch-wheel in the lower-right corner for touch screen steering', () => {
    const loaded = loadClientGame();
    const { api, elements, window: testWin } = loaded;
    const touchWheel = elements.get('touch-wheel');
    const touchThumb = elements.get('touch-wheel-thumb');
    assert.ok(touchWheel, 'touch-wheel DOM element should exist');
    assert.ok(touchThumb, 'touch-wheel-thumb DOM element should exist');

    // 1. Initial touch-wheel state is inactive
    const initialState = api.getState().touchWheelState;
    assert.equal(initialState.active, false);
    assert.equal(initialState.intensity, 0);

    // 2. Dragging touch wheel to the right (centerX=1170, centerY=660; target clientX=1230, clientY=660)
    touchWheel.dispatchEvent({
      type: 'pointerdown',
      pointerId: 42,
      clientX: 1230,
      clientY: 660,
      preventDefault: () => {},
      stopPropagation: () => {},
    });

    const activeState = api.getState().touchWheelState;
    assert.equal(activeState.active, true);
    assert.equal(activeState.pointerId, 42);
    assert.equal(touchWheel.classList.contains('active'), true);
    assert.ok(activeState.vectorX > 0.99, 'Vector X should be pointed right');
    assert.ok(Math.abs(activeState.vectorY) < 0.05, 'Vector Y should be near zero');
    assert.ok(activeState.intensity > 0.8, 'Intensity should reflect drag distance');
    assert.ok(touchThumb.style.transform.includes('translate3d('));

    // Mouse coordinates should be offset to the right of screen center
    assert.ok(
      api.mouse.screenX > 1280 / 2,
      'Virtual mouse screenX should be offset to the right of center'
    );

    // 3. Pointer move updates the touch wheel vector downward (clientX=1170, clientY=720)
    touchWheel.dispatchEvent({
      type: 'pointermove',
      pointerId: 42,
      clientX: 1170,
      clientY: 720,
      preventDefault: () => {},
      stopPropagation: () => {},
    });
    assert.ok(Math.abs(activeState.vectorX) < 0.05);
    assert.ok(activeState.vectorY > 0.99);
    assert.ok(
      api.mouse.screenY > 800 / 2,
      'Virtual mouse screenY should be offset downward from center'
    );

    // 4. Pointer up releases the touch wheel and resets state
    touchWheel.dispatchEvent({
      type: 'pointerup',
      pointerId: 42,
      preventDefault: () => {},
      stopPropagation: () => {},
    });
    assert.equal(activeState.active, false);
    assert.equal(activeState.pointerId, null);
    assert.equal(touchWheel.classList.contains('active'), false);
    assert.equal(touchThumb.style.transform, 'translate3d(0, 0, 0)');
    // Mouse coords should reset to center of screen when touch is released
    assert.equal(api.mouse.screenX, 1280 / 2);
    assert.equal(api.mouse.screenY, 800 / 2);

    // 5. Window pointermove and mousemove update mouse coordinates responsively
    testWin.dispatchEvent({
      type: 'pointermove',
      clientX: 850,
      clientY: 320,
    });
    assert.equal(api.mouse.screenX, 850);
    assert.equal(api.mouse.screenY, 320);

    // 6. Client prediction quickly steers and brakes reverse velocity without 2-second backward walk
    api.warrior.x = 2100;
    api.warrior.y = 2100;
    api.warrior.angle = 0; // Facing East
    api.warrior.vx = 200;  // Running East
    api.warrior.vy = 0;
    api.camera.x = 2100 - 640;
    api.camera.y = 2100 - 400 / api.constants.TILT_Y;
    // Set mouse directly West of warrior (180 degrees opposite)
    api.mouse.screenX = 640 - 250;
    api.mouse.screenY = 400;

    const initialX = api.warrior.x;
    let maxOvershootX = initialX;

    for (let frame = 0; frame < 12; frame++) {
      api.stepMultiplayerClient(1 / 60);
      if (api.warrior.x > maxOvershootX) maxOvershootX = api.warrior.x;
    }

    assert.ok(maxOvershootX - initialX < 10, 'Client prediction overshoot should be minimal (< 10px)');
    assert.ok(Math.abs(api.warrior.angle) > Math.PI * 0.5, 'Warrior should turn toward West');
    assert.ok(api.warrior.vx < 0, 'Warrior should move West toward the mouse cursor');
  });

  it('steers warrior accurately in tall/portrait windows with touch-wheel centered on warrior', () => {
    const loaded = loadClientGame();
    const { api, elements } = loaded;
    const touchWheel = elements.get('touch-wheel');

    // Simulate tall/portrait window: 600px width x 1600px height
    loaded.window.innerWidth = 600;
    loaded.window.innerHeight = 1600;
    api.warrior.x = 2100;
    api.warrior.y = 2100;
    api.warrior.vx = 0;
    api.warrior.vy = 0;
    api.warrior.angle = 0;

    // Simulate camera deadzone where warrior is down near maxScreenY (e.g. warriorScreenY = 1000 while screen height / 2 = 800)
    // maxScreenY in 1600px height is 1600 * 2/3 = 1066px
    api.camera.x = 2100 - 300;
    api.camera.y = 2100 - 1000 / api.constants.TILT_Y;

    const warriorScreenX = api.warrior.x - api.camera.x; // 300
    const warriorScreenY = (api.warrior.y - api.camera.y) * api.constants.TILT_Y; // 1000
    assert.equal(warriorScreenX, 300);
    assert.equal(warriorScreenY, 1000);

    // 1. Engage touch wheel directly DOWN (centerY=660, target clientY=720 -> vectorX=0, vectorY=1)
    touchWheel.dispatchEvent({
      type: 'pointerdown',
      pointerId: 99,
      clientX: 1170,
      clientY: 720,
      preventDefault: () => {},
      stopPropagation: () => {},
    });

    const state = api.getState().touchWheelState;
    assert.equal(state.active, true);
    assert.ok(state.vectorY > 0.99, 'Touch-wheel vector should be pointed down');

    // The virtual target must be strictly south of the warrior in both screen space and world space
    const targetWorldX = api.camera.x + api.mouse.screenX;
    const targetWorldY = api.camera.y + api.mouse.screenY / api.constants.TILT_Y;

    assert.ok(
      api.mouse.screenY > warriorScreenY,
      `Target screenY (${api.mouse.screenY}) should be south of warriorScreenY (${warriorScreenY})`
    );
    assert.ok(
      targetWorldY > api.warrior.y,
      `Target worldY (${targetWorldY}) should be south of warrior.y (${api.warrior.y})`
    );
    assert.ok(
      Math.abs(targetWorldX - api.warrior.x) < 5,
      'Target worldX should stay aligned with warrior.x when steering down'
    );
    assert.ok(
      targetWorldY - api.warrior.y > 150,
      `Target world offset (${targetWorldY - api.warrior.y}) should extend south by virtualDistance`
    );

    // 2. Stepping client simulation moves the warrior down (South)
    const prevY = api.warrior.y;
    api.stepMultiplayerClient(0.05);
    assert.ok(api.warrior.vy > 0, `Warrior vy should be positive (southward), was ${api.warrior.vy}`);
    assert.ok(api.warrior.y > prevY, `Warrior y should advance south from ${prevY} to ${api.warrior.y}`);

    // 3. Test 360-degree rotation of touch-wheel: target circle must remain centered on warrior
    const virtualDist = 160 + state.intensity * 220;
    for (let deg = 0; deg < 360; deg += 45) {
      const rad = (deg * Math.PI) / 180;
      state.vectorX = Math.cos(rad);
      state.vectorY = Math.sin(rad);
      api.updateTouchWheelTarget();

      const curWorldX = api.camera.x + api.mouse.screenX;
      const curWorldY = api.camera.y + api.mouse.screenY / api.constants.TILT_Y;
      const mdx = curWorldX - api.warrior.x;
      const mdy = curWorldY - api.warrior.y;
      const distFromWarrior = Math.hypot(mdx, mdy);

      assert.ok(
        Math.abs(distFromWarrior - virtualDist) < 1,
        `Target distance at ${deg}° should be exactly virtualDistance (${virtualDist}), got ${distFromWarrior}`
      );
    }

    // 4. Release touch-wheel
    touchWheel.dispatchEvent({
      type: 'pointerup',
      pointerId: 99,
      preventDefault: () => {},
      stopPropagation: () => {},
    });
    assert.equal(state.active, false);
    // When released, virtual target collapses to warrior so warrior stops cleanly
    assert.equal(api.mouse.screenX, api.warrior.x - api.camera.x);
    assert.equal(api.mouse.screenY, (api.warrior.y - api.camera.y) * api.constants.TILT_Y);
  });

  it('plays variations of the zombie bite attack sound (normal, heavy, fast) when warrior takes damage', () => {
    // 1. Verify zombie attack variations are defined in constants
    const expectedVariations = ['normal', 'heavy', 'fast'];
    assert.deepEqual([...api.ZOMBIE_ATTACK_VARIATIONS], expectedVariations);
    assert.deepEqual([...api.HURT_SOUNDS], expectedVariations);
    assert.deepEqual([...api.HURT_NOISES], expectedVariations);

    // 2. Set up mock Web Audio context to test sound playback and verify no procedural oscillators are used
    let lastMockContext = null;
    function createMockAudioContext() {
      const oscillators = [];
      const filters = [];
      const gains = [];
      const bufferSources = [];
      const createParam = (init = 0) => ({
        value: init,
        setValueAtTime(v) { this.value = v; },
        linearRampToValueAtTime(v) { this.value = v; },
        exponentialRampToValueAtTime(v) { this.value = v; },
      });
      const ctx = {
        currentTime: 0.5,
        state: 'running',
        destination: {},
        oscillators,
        filters,
        gains,
        bufferSources,
        decodeAudioData(arrBuf, success) {
          if (success) success({ duration: 1.04, numberOfChannels: 2, sampleRate: 44100 });
        },
        createBufferSource() {
          const src = {
            buffer: null,
            playbackRate: createParam(1),
            detune: createParam(0),
            connect: () => {},
            start: () => {},
            stop: () => {},
          };
          bufferSources.push(src);
          return src;
        },
        createOscillator() {
          const osc = {
            type: 'sawtooth',
            frequency: createParam(100),
            connect: () => {},
            start: () => {},
            stop: () => {},
          };
          oscillators.push(osc);
          return osc;
        },
        createBiquadFilter() {
          const filter = {
            type: 'bandpass',
            frequency: createParam(500),
            Q: createParam(1),
            connect: () => {},
          };
          filters.push(filter);
          return filter;
        },
        createGain() {
          const gain = {
            gain: createParam(1),
            connect: () => {},
          };
          gains.push(gain);
          return gain;
        },
      };
      lastMockContext = ctx;
      return ctx;
    }

    win.AudioContext = createMockAudioContext;

    // Decode audio sample first
    assert.ok(api.ZOMBIE_BITE_AUDIO_BASE64.length > 20000, 'Embedded base64 audio must be present');
    assert.ok(api.PLAYER_GRUNT_AUDIO_BASE64.length > 20000, 'Embedded base64 grunt audio must be present');
    assert.equal(api.PLAYER_GRUNT_AUDIO_BASE64, api.ZOMBIE_BITE_AUDIO_BASE64);
    api.loadZombieBiteAudio();
    assert.ok(api.getZombieBiteAudioBuffer(), 'Zombie bite audio buffer should be decoded');

    // 3. Test explicit sound playback for normal, heavy, and fast variations
    const expectedConfigs = {
      normal: { rate: 1.0, detune: 0, gain: 0.2499 },
      heavy: { rate: 0.86, detune: -280, gain: 0.2793 },
      fast: { rate: 1.16, detune: 260, gain: 0.2352 },
    };

    for (const variation of expectedVariations) {
      const prevBufSourceCount = lastMockContext.bufferSources.length;
      const prevGainCount = lastMockContext.gains.length;
      const prevOscCount = lastMockContext.oscillators.length;
      const result = api.playPlayerHurtSound(variation);
      assert.equal(result, variation);
      assert.equal(api.getLastHurtSound(), variation);
      assert.equal(api.getLastHurtNoise(), variation);
      assert.ok(lastMockContext, 'Mock AudioContext should have been instantiated');
      // Verify ONLY the sound file is played via AudioBufferSourceNode
      assert.equal(
        lastMockContext.bufferSources.length,
        prevBufSourceCount + 1,
        `Should create buffer source for zombie bite variation "${variation}"`
      );
      const createdSource = lastMockContext.bufferSources[lastMockContext.bufferSources.length - 1];
      assert.equal(createdSource.playbackRate.value, expectedConfigs[variation].rate);
      assert.equal(createdSource.detune.value, expectedConfigs[variation].detune);
      assert.equal(
        lastMockContext.gains.length,
        prevGainCount + 1,
        `Should create gain node for zombie bite variation "${variation}"`
      );
      const createdGain = lastMockContext.gains[lastMockContext.gains.length - 1];
      assert.equal(createdGain.gain.value, expectedConfigs[variation].gain);
      // Ensure NO procedural oscillators are used for enemy attack sounds
      assert.equal(
        lastMockContext.oscillators.length,
        prevOscCount,
        'Should NOT use procedural oscillators for zombie attack sounds'
      );
    }

    // 4. Test random / varied selection when no variation is specified
    const chosenVariations = [];
    for (let i = 0; i < 20; i++) {
      const chosen = api.playPlayerHurtSound();
      assert.ok(
        expectedVariations.includes(chosen),
        `Chosen variation "${chosen}" should be in expected list`
      );
      chosenVariations.push(chosen);
    }
    // Consecutive calls should avoid picking the same variation twice in a row
    for (let i = 1; i < chosenVariations.length; i++) {
      assert.notEqual(
        chosenVariations[i],
        chosenVariations[i - 1],
        `Consecutive hurt variation at index ${i} ("${chosenVariations[i]}") should differ from previous ("${chosenVariations[i-1]}") for variety`
      );
    }
    const uniqueChosen = new Set(chosenVariations);
    assert.equal(
      uniqueChosen.size,
      3,
      'All 3 zombie attack variations (normal, heavy, fast) should be sampled across 20 hits'
    );

    // 5. Test player_hurt event triggers specified zombie bite variation
    api.processServerEvents([
      {
        type: 'player_hurt',
        playerId: 'local-1',
        x: 2100,
        y: 2100,
        playerX: 2100,
        playerY: 2090,
        damage: 15,
        variation: 'heavy',
      },
    ]);
    assert.equal(api.getLastHurtSound(), 'heavy');

    api.processServerEvents([
      {
        type: 'player_hurt',
        playerId: 'local-1',
        x: 2100,
        y: 2100,
        playerX: 2100,
        playerY: 2090,
        damage: 15,
        sound: 'fast',
      },
    ]);
    assert.equal(api.getLastHurtSound(), 'fast');

    api.processServerEvents([
      {
        type: 'player_hurt',
        playerId: 'local-1',
        x: 2100,
        y: 2100,
        playerX: 2100,
        playerY: 2090,
        damage: 15,
        noise: 'normal',
      },
    ]);
    assert.equal(api.getLastHurtSound(), 'normal');

    // 6. Test offline / single-player zombie contact damage triggers playPlayerHurtSound
    api.warrior.hp = 100;
    api.warrior.alive = true;
    api.warrior.x = 2100;
    api.warrior.y = 2100;
    api.enemies.length = 0;
    api.spawnEnemy(false);
    const enemy = api.enemies[0];
    enemy.x = 2110;
    enemy.y = 2100;
    enemy.contactCooldown = 0;
    enemy.contactDamage = 12;
    enemy.knockdownTimer = 0;
    enemy.danceTimer = 0;
    enemy.webTimer = 0;

    api.stepPhysics(0.016);
    assert.ok(api.warrior.hp < 100, 'Warrior should have taken damage from enemy contact');
    assert.ok(
      expectedVariations.includes(api.getLastHurtSound()),
      'Warrior damage should have set lastHurtSound to a zombie attack variation'
    );
  });

  it('triggers cheat code when user types "cheat" during game play, dropping 3 of each kind of powerup around center of map', () => {
    const sandbox = loadClientGame();
    const { api, window, elements } = sandbox;

    // 1. Before entering the game (nickname dialog showing), typing "cheat" does NOT trigger cheat
    for (const char of 'cheat') {
      window.dispatchEvent({ type: 'keydown', key: char });
    }
    assert.equal(api.blackCircles.length, 0);

    // 2. Enter the game
    const nicknameInput = elements.get('nickname-input');
    nicknameInput.value = 'Sir Hammer';
    api.enterGame();
    const ws = api.getState().ws;
    ws.readyState = 1;
    ws.emit('open', {});
    assert.equal(api.getState().hasEnteredGame, true);
    assert.equal(api.blackCircles.length, 0);

    // 3. Typing into an input element does NOT trigger cheat
    const inputTarget = { tagName: 'INPUT', isContentEditable: false };
    for (const char of 'cheat') {
      window.dispatchEvent({ type: 'keydown', key: char, target: inputTarget });
    }
    assert.equal(api.blackCircles.length, 0);

    // 4. Typing "cheat" in standalone/offline mode during active game play triggers the cheat
    api.setState({ isMultiplayer: false });
    for (const char of 'cheat') {
      window.dispatchEvent({ type: 'keydown', key: char });
    }
    assert.equal(api.blackCircles.length, 51);

    const counts = {};
    for (const type of api.constants.ALL_POWERUP_TYPES) {
      counts[type] = 0;
    }
    assert.equal(api.constants.ALL_POWERUP_TYPES.length, 17);

    const centerX = 2100;
    const centerY = 2100;

    for (const pk of api.blackCircles) {
      assert.ok(pk.type in counts, `Unknown pickup type: ${pk.type}`);
      counts[pk.type]++;
      const dist = Math.hypot(pk.x - centerX, pk.y - centerY);
      assert.ok(dist >= 100 && dist <= 350, `Distance ${dist} not spread around center`);
    }

    for (const [type, count] of Object.entries(counts)) {
      assert.equal(count, 3, `Expected 3 of type ${type}, got ${count}`);
    }

    // 5. Case-insensitivity test ("ChEaT")
    api.blackCircles.length = 0;
    for (const char of 'ChEaT') {
      window.dispatchEvent({ type: 'keydown', key: char });
    }
    assert.equal(api.blackCircles.length, 51);

    // 6. In multiplayer mode, typing "cheat" sends { type: 'cheat' } over WebSocket
    api.setState({ isMultiplayer: true });
    for (const char of 'cheat') {
      window.dispatchEvent({ type: 'keydown', key: char });
    }
    const sentCheat = ws.sent.some((msg) => {
      try {
        const parsed = JSON.parse(msg);
        return parsed.type === 'cheat';
      } catch (_e) {
        return false;
      }
    });
    assert.ok(sentCheat, 'Multiplayer client should have sent { type: "cheat" } over WebSocket');
  });

  it('animates dying enemy as a ghost with mass reduced by another 30% (0.8064x) moving with full hammer momentum and leaving a trail, or stationary for other effects', () => {
    const sandbox = loadClientGame();
    const { api } = sandbox;
    api.setState({ isMultiplayer: false, hasEnteredGame: true });

    // 1. Defeated by hammer strike
    api.spawnEnemy(false);
    const enemy1 = api.enemies[api.enemies.length - 1];
    enemy1.x = 2000;
    enemy1.y = 2000;
    enemy1.mass = 1.6;

    const testHammer = { mass: 1.25 };
    const strikeHvx = 320;
    const strikeHvy = -240;

    api.enemyGhosts.length = 0;
    api.particles.length = 0;
    api.defeatEnemy(api.enemies.length - 1, testHammer, strikeHvx, strikeHvy);

    // No puff of smoke
    assert.equal(api.particles.length, 0, 'Should not spawn smoke puff particles on death');
    assert.equal(api.enemyGhosts.length, 1, 'Should spawn a ghost for dying enemy');

    const ghost1 = api.enemyGhosts[0];
    const expectedGhostMass = 1.6 * 0.8064; // 1.29024
    assert.ok(Math.abs(ghost1.mass - expectedGhostMass) < 1e-4);

    // Momentum of hammer: Px = 1.25 * 320 = 400, Py = 1.25 * -240 = -300
    // Ghost velocity: vx = 400 / 1.29024 = 310.020, vy = -300 / 1.29024 = -232.515
    const expectedGhostVx = (1.25 * 320) / expectedGhostMass;
    const expectedGhostVy = (1.25 * -240) / expectedGhostMass;
    assert.ok(Math.abs(ghost1.vx - expectedGhostVx) < 1e-3);
    assert.ok(Math.abs(ghost1.vy - expectedGhostVy) < 1e-3);

    // Verify ghost momentum equals full momentum of hammer
    assert.ok(Math.abs(ghost1.mass * ghost1.vx - testHammer.mass * strikeHvx) < 1e-3);
    assert.ok(Math.abs(ghost1.mass * ghost1.vy - testHammer.mass * strikeHvy) < 1e-3);

    // Animate ghost movement
    const prevX = ghost1.x;
    const prevY = ghost1.y;
    api.updateEffects(0.05);
    assert.ok(ghost1.x > prevX, 'Ghost should have moved in positive X direction');
    assert.ok(ghost1.y < prevY, 'Ghost should have moved in negative Y direction');
    assert.ok(Array.isArray(ghost1.trail) && ghost1.trail.length > 0, 'Moving ghost should leave a trail');

    // 2. Defeated by other effects (burn, bulldozer, explosion, etc. -> no hammer passed)
    api.spawnEnemy(false);
    const enemy2 = api.enemies[api.enemies.length - 1];
    enemy2.x = 2100;
    enemy2.y = 2100;
    enemy2.mass = 2.0;

    api.defeatEnemy(api.enemies.length - 1); // no killer hammer
    const ghost2 = api.enemyGhosts.find((g) => g !== ghost1);
    assert.ok(ghost2, 'Should spawn ghost for enemy dying from other effect');
    assert.equal(ghost2.vx, 0, 'Ghost from other effect should have 0 X velocity');
    assert.equal(ghost2.vy, 0, 'Ghost from other effect should have 0 Y velocity');
    assert.equal(ghost2.duration, ghost1.duration, 'Both ghosts should have the same duration');

    // Verify stationary ghost stays in one place
    const stationaryX = ghost2.x;
    const stationaryY = ghost2.y;
    api.updateEffects(0.05);
    assert.equal(ghost2.x, stationaryX, 'Stationary ghost should stay in one place');
    assert.equal(ghost2.y, stationaryY, 'Stationary ghost should stay in one place');
    assert.ok(Array.isArray(ghost2.trail) && ghost2.trail.length > 0, 'Stationary ghost should leave a trail');

    // 3. drawGhost renders without errors
    api.drawGhost(ghost1);
    api.drawGhost(ghost2);

    // 4. Ghost expires after duration
    api.updateEffects(1.0);
    assert.equal(api.enemyGhosts.length, 0, 'Ghosts should expire after their duration');
  });

  it('treats a time gap of more than 30 seconds as a reason to start the game over', () => {
    const sandbox = loadClientGame();
    const { api, elements } = sandbox;
    elements.get('enter-modal').classList.add('hidden');
    elements.get('game-over-modal').classList.add('hidden');
    elements.get('victory-modal').classList.add('hidden');
    api.setState({ isMultiplayer: false, hasEnteredGame: true });
    assert.equal(api.isDialogShowing(), false);

    // Put game in a distinct state
    api.enemies[0].hp = 12;
    api.setState({ kills: 42 });

    // 1. Normal frame interval (e.g. 16ms / rawDt < 30s) does NOT reset the game
    const now = performance.now();
    api.setLastTime(now);
    api.setLastWallClockTime(Date.now());
    api.gameLoop(now + 16);
    assert.equal(api.getState().kills, 42);
    assert.equal(api.enemies[0].hp, 12);

    // 2. Time gap of more than 30 seconds in gameLoop triggers initGame() to start over
    api.setLastTime(now);
    api.setLastWallClockTime(Date.now() - 35000);
    api.gameLoop(now + 35000); // 35 seconds later
    assert.equal(api.getState().kills, 0, 'Kills should reset to 0');
    assert.notEqual(api.enemies[0].hp, 12, 'Enemies should be re-initialized');

    // 3. checkTimeGap explicitly restarts game if > 30s passed
    api.setState({ kills: 15 });
    api.setLastTime(now);
    api.setLastWallClockTime(Date.now() - 40000);
    const didReset = api.checkTimeGap(now + 40000, Date.now());
    assert.equal(didReset, true);
    assert.equal(api.getState().kills, 0);

    // 4. checkTimeGap does not restart if within 30s
    api.setState({ kills: 20 });
    api.setLastTime(now);
    api.setLastWallClockTime(Date.now());
    const didResetRecent = api.checkTimeGap(now + 5000, Date.now() + 5000);
    assert.equal(didResetRecent, false);
    assert.equal(api.getState().kills, 20);
  });

  it('implements Whirlwind Spin-Up Overdrive on client', () => {
    const w = api.warrior;
    const h = api.hammer;
    w.alive = true;
    h.whirlwindLevel = 0;
    h.isWhirlwind = false;
    h.spinTimer = 0;

    const baseRest = (api.constants.BASE_CHAIN_OFFSET || 20) + h.chainLinks * (api.constants.LENGTH_PER_LINK || 13);
    const dt = 1 / 60;
    let angle = 0;

    function spinFor(seconds) {
      const steps = Math.ceil(seconds / dt);
      for (let s = 0; s < steps; s++) {
        angle += 7.0 * dt;
        h.x = w.x + Math.cos(angle) * baseRest;
        h.y = w.y + Math.sin(angle) * baseRest;
        h.vx = -Math.sin(angle) * baseRest * 7.0;
        h.vy = Math.cos(angle) * baseRest * 7.0;
        api.updateHammerWhirlwind(w, h, dt);
      }
    }

    // Spin for >= 6.1 seconds at 7 rad/s -> Level 1
    spinFor(6.1);
    assert.equal(h.whirlwindLevel, 1, 'Hammer should be at whirlwindLevel 1');
    assert.equal(h.isWhirlwind, true, 'Hammer should enter Whirlwind overdrive on client');
    assert.ok(h.spinTimer >= 6.0);

    // Verify drawing hammer across all 5 whirlwind levels with trail does not throw
    for (let lvl = 1; lvl <= 5; lvl++) {
      h.whirlwindLevel = lvl;
      h.trail = [
        { x: h.x - 10, y: h.y, whirlwindLevel: lvl, isFlaming: false, alpha: 0.6 },
        { x: h.x - 5, y: h.y, whirlwindLevel: lvl, isFlaming: false, alpha: 0.8 },
      ];
      api.drawHammer(h, h.trail);
    }

    // Spin up to Level 2 (+4s)
    h.whirlwindLevel = 1;
    spinFor(4.0);
    assert.equal(h.whirlwindLevel, 2, 'Hammer should reach level 2 after +4s');

    // Spin up to Level 5 (+12s) and verify trail capacity grows
    spinFor(12.0);
    assert.equal(h.whirlwindLevel, 5, 'Hammer should reach level 5');
    // At level 5, stepLocalWarriorAndHammers allows trail to grow up to 32 (much longer than level 1 max 6)
    api.stepPhysics(dt);
    assert.ok(h.trail.length <= 32, 'Level 5 trail should be capped at 32');

    // Test Whirlwind gust shockwave at Level 3
    h.whirlwindLevel = 3;
    if (api.enemies.length === 0) {
      api.spawnEnemy(false);
    }
    const e = api.enemies[0];
    e.x = h.x;
    e.y = h.y;
    e.hp = 250;
    api.triggerWhirlwindGust(h.x, h.y, w, h);
    assert.equal(e.hp, 250 - api.constants.WHIRLWIND_LEVEL_DAMAGES[3], 'Enemy at center of gust should take full level 3 gust damage (180)');

    // Test that hammer impact with flame and whirlwind sets all affected enemies on fire and resets whirlwindLevel to 0
    h.x = w.x + 30;
    h.y = w.y;
    h.vx = 400;
    h.vy = 0;
    h.flameCharges = 5;
    h.flameTimer = 5;
    h.whirlwindLevel = 2;
    h.isWhirlwind = true;
    h.spinTimer = 7.0;

    e.x = h.x + 20;
    e.y = h.y;
    e.vx = 0;
    e.vy = 0;
    e.hp = 200;
    e.hitCooldown = 0;
    e.burnTimer = 0;
    e.fireproofTimer = 0;

    // Add a bystander enemy within Level 2 radius (180px)
    api.spawnEnemy(false);
    const eBystander = api.enemies[api.enemies.length - 1];
    eBystander.x = h.x + 70;
    eBystander.y = h.y;
    eBystander.vx = 0;
    eBystander.vy = 0;
    eBystander.hp = 100;
    eBystander.burnTimer = 0;
    eBystander.fireproofTimer = 0;

    api.stepPhysics(dt);
    assert.equal(h.whirlwindLevel, 0, 'whirlwindLevel should reset to 0 on hammer impact');
    assert.equal(h.isWhirlwind, false, 'isWhirlwind should reset to false on hammer impact');
    assert.equal(h.spinTimer, 0, 'spinTimer should reset to 0 on hammer impact');
    assert.ok(e.burnTimer > 0, 'Direct hit enemy should be burning');
    assert.ok(eBystander.burnTimer > 0, 'Bystander affected by flame whirlwind should be set on fire');

    // Verify rendering armored zombie does not throw
    const armoredEnemy = {
      id: 9999,
      variant: 'armored',
      x: w.x + 80,
      y: w.y,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 20,
      hp: 300,
      maxHp: 300,
      walkPhase: 0,
      hurtFlash: 0,
      skinColor: '#5a6e5a',
      coatColor: '#3a4454',
      shirtColor: '#718096',
    };
    api.enemies.push(armoredEnemy);
    api.render();
  });

  it('renders zombies without lost limbs, hops when legs are missing, wanders in circles when headless, and animates ghost limbs', () => {
    // 1. Initial zombie starts with 0 lost limbs
    const enemy = {
      variant: 'regular',
      x: 2000,
      y: 2000,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 18,
      mass: 1.2,
      hp: 100,
      maxHp: 100,
      moveForce: 360,
      traction: 6.0,
      skinColor: '#5e8c52',
      coatColor: '#2d3748',
      shirtColor: '#4a5568',
      eyeColor: '#f6e05e',
      hitCooldown: 0,
      chainHitCooldown: 0,
      contactCooldown: 0,
      hurtFlash: 0,
      burnTimer: 0,
      fireproofTimer: 0,
      fearTimer: 0,
      danceTimer: 0,
      danceImmuneTimer: 0,
      webTimer: 0,
      knockdownTimer: 0,
      walkPhase: 0,
      lostLimbs: [],
    };
    api.enemies.length = 0;
    api.enemies.push(enemy);

    // 2. checkEnemyLimbLoss at 50% HP threshold: loses 1 limb and spawns ghost limb
    api.enemyGhosts.length = 0;
    enemy.hp = 50;
    api.checkEnemyLimbLoss(enemy, 120, -60);
    assert.equal(enemy.lostLimbs.length, 1);
    assert.ok(api.ALL_LIMBS.includes(enemy.lostLimbs[0]));
    assert.equal(api.enemyGhosts.length, 1);
    const ghostLimb1 = api.enemyGhosts[0];
    assert.equal(ghostLimb1.limb, enemy.lostLimbs[0]);
    assert.ok(ghostLimb1.timer > 0);
    assert.ok(ghostLimb1.duration > 0);

    // 3. checkEnemyLimbLoss at 75% HP threshold: loses 2nd limb
    enemy.hp = 20;
    api.checkEnemyLimbLoss(enemy, 80, 40);
    assert.equal(enemy.lostLimbs.length, 2);
    assert.notEqual(enemy.lostLimbs[0], enemy.lostLimbs[1]);
    assert.equal(api.enemyGhosts.length, 2);
    const ghostLimb2 = api.enemyGhosts[1];
    assert.equal(ghostLimb2.limb, enemy.lostLimbs[1]);

    // 4. Ghost limb animation & update: moves with drag and records trail
    const g0x = ghostLimb1.x;
    api.updateGhosts(0.05);
    assert.notEqual(ghostLimb1.x, g0x, 'Ghost limb should move with velocity');
    assert.ok(ghostLimb1.trail.length > 0, 'Ghost limb should record spectral trail points');

    // 5. Draw ghost limb for each limb type without errors
    for (const limb of api.ALL_LIMBS) {
      assert.doesNotThrow(() => {
        api.drawGhost({
          x: 2000,
          y: 2000,
          vx: 20,
          vy: -10,
          radius: 18,
          skinColor: '#5e8c52',
          angle: 0.5,
          limb,
          timer: 1.5,
          duration: 2.0,
          trail: [{ x: 2000, y: 2000, lift: 5, alpha: 0.4, radius: 18 }],
        });
      }, `drawGhost for limb ${limb} should not throw`);
    }

    // 6. drawEnemy without severed limbs (and hopping pose)
    // A: 1 leg missing (hopping on single leg)
    enemy.lostLimbs = ['left_leg'];
    assert.doesNotThrow(() => {
      api.drawEnemy(enemy);
    }, 'drawEnemy with 1 missing leg should not throw');

    // B: 2 legs missing (slower hopping on stumps)
    enemy.lostLimbs = ['left_leg', 'right_leg'];
    assert.doesNotThrow(() => {
      api.drawEnemy(enemy);
    }, 'drawEnemy with 2 missing legs should not throw');

    // C: Missing head (severed neck stump)
    enemy.lostLimbs = ['head'];
    assert.doesNotThrow(() => {
      api.drawEnemy(enemy);
    }, 'drawEnemy with missing head should not throw');

    // D: Missing arms
    enemy.lostLimbs = ['left_arm', 'right_arm'];
    assert.doesNotThrow(() => {
      api.drawEnemy(enemy);
    }, 'drawEnemy with missing arms should not throw');

    // E: Down / earthquake pose with missing limbs
    enemy.lostLimbs = ['head', 'left_leg', 'right_arm'];
    enemy.knockdownTimer = 2.0;
    assert.doesNotThrow(() => {
      api.drawEnemy(enemy);
    }, 'drawEnemy down pose with missing limbs should not throw');

    // 7. Headless zombie in stepPhysics wanders in circles rather than chasing warrior
    enemy.knockdownTimer = 0;
    enemy.lostLimbs = ['head'];
    enemy.angle = 0;
    enemy.wanderAngle = 0;
    enemy.vx = 0;
    enemy.vy = 0;
    api.warrior.x = 2800; // warrior far away to East
    api.warrior.y = 2000;
    enemy.x = 2000;
    enemy.y = 2000;

    api.stepPhysics(0.1);
    assert.ok(enemy.wanderAngle > 0, 'Headless zombie wanderAngle should advance in circles');

    // 8. Multiplayer server event limb_loss spawns ghost limb
    api.enemyGhosts.length = 0;
    api.processServerEvents([
      { type: 'limb_loss', limb: 'head', x: 2100, y: 2100, radius: 18, color: '#567a4e', vx: 50, vy: -50, angle: 1.0 }
    ]);
    assert.equal(api.enemyGhosts.length, 1);
    assert.equal(api.enemyGhosts[0].limb, 'head');
  });

  it('implements Hit-Stop (Impact Freeze) and Directional Screen Shake', () => {
    const c = api.constants;
    // 1. Verify constants
    assert.equal(c.HIT_STOP_DURATION, 0.030);
    assert.equal(c.HIT_STOP_DAMAGE_THRESHOLD, 350);
    assert.equal(c.HIT_STOP_BIG_SHAKE_THRESHOLD, 425);
    assert.equal(c.MULTI_KILL_WINDOW, 0.35);

    // 2. Initial state
    api.initGame();
    assert.equal(api.getHitStopTimer(), 0);
    assert.equal(api.camera.dirShake, 0);
    assert.equal(api.camera.dirX, 0);
    assert.equal(api.camera.dirY, 0);

    // 3. triggerHitStop: damage < 350 should not trigger, damage >= 350 triggers, damage > 425 gives bigger shake
    api.triggerHitStop(0.030, 1, 0, 200);
    assert.equal(api.getHitStopTimer(), 0, 'Damage < 350 should not trigger hit-stop');
    assert.equal(api.camera.dirShake, 0, 'Damage < 350 should not set dirShake');

    api.triggerHitStop(0.030, 1, 0, 380);
    assert.equal(api.getHitStopTimer(), 0.030, 'Damage >= 350 should trigger hit-stop');
    assert.equal(api.camera.dirX, 1);
    assert.equal(api.camera.dirY, 0);
    const standardDirShake = api.camera.dirShake;
    assert.ok(standardDirShake > 0, 'Directional shake intensity should be positive');
    assert.ok(api.camera.shake > 0, 'Camera shake should be positive');

    // Bigger shake for damage > 425
    api.camera.dirShake = 0;
    api.camera.shake = 0;
    api.triggerHitStop(0.030, 1, 0, 500);
    const bigDirShake = api.camera.dirShake;
    assert.ok(bigDirShake > standardDirShake, 'Damage > 425 should give bigger directional shake');
    assert.ok(bigDirShake >= 22, 'Damage > 425 should trigger shakeAmt >= 22');

    // 4. Update effects decays directional shake
    const initialDirShake = api.camera.dirShake;
    api.updateEffects(0.016);
    assert.ok(api.camera.dirShake < initialDirShake, 'dirShake should decay over time');

    // 5. High-damage crushing blow triggers Hit-Stop in stepPhysics
    api.initGame();
    api.warrior.x = 2100;
    api.warrior.y = 2050;
    api.warrior.vx = 0;
    api.warrior.vy = 0;

    api.enemies.length = 1;
    const enemy = api.enemies[0];
    enemy.hp = 1000;
    enemy.maxHp = 1000;
    enemy.x = 2100;
    enemy.y = 2100;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.moveForce = 0; // stationary enemy to prevent relative velocity drift
    enemy.mass = 2.0;
    enemy.hitCooldown = 0;

    api.hammer.chainLinks = 6; // ample rest length (168px) so spring does not fight hammer velocity
    api.hammer.x = 2100;
    api.hammer.y = 2100 + api.hammer.radius + enemy.radius - 2; // overlapping
    api.hammer.vx = 0;
    api.hammer.vy = -1600; // fast upward strike into enemy
    api.hammer.mass = 8.0;
    api.initHammerChainNodes(api.hammer);
    api.updateWarriorBroadphaseBounds(api.warrior);

    api.setHitStopTimer(0);
    api.stepPhysics(0.016);
    assert.ok(api.getHitStopTimer() >= 0.030, 'High-damage crushing blow should trigger 30ms hit-stop');
    assert.ok(api.camera.dirShake >= 22, 'Crushing blow with damage > 425 should trigger big directional shake');

    // 6. Multi-kill triggers Hit-Stop
    api.initGame();
    api.warrior.x = 2100;
    api.warrior.y = 2100;
    api.camera.x = 2100 - 640;
    api.camera.y = 2100 - 400 / api.constants.TILT_Y;
    api.setHitStopTimer(0);
    api.enemies.length = 3;
    for (let i = 0; i < 3; i++) {
      api.enemies[i].hp = 10;
      api.enemies[i].maxHp = 100;
    }
    // Defeat first enemy
    api.defeatEnemy(0, null, 100, 0);
    // Defeat second enemy within multi-kill window
    api.defeatEnemy(1, null, 100, 0);
    assert.ok(api.getHitStopTimer() >= 0.030, 'Defeating multiple enemies within multi-kill window should trigger hit-stop');

    // 7. Multiplayer impact event: damage < 350 does not trigger, damage >= 350 triggers, damage > 425 gives bigger shake
    api.camera.x = 2100 - 640;
    api.camera.y = 2100 - 400 / api.constants.TILT_Y;
    api.setHitStopTimer(0);
    api.camera.dirShake = 0;
    api.camera.dirX = 0;
    api.camera.dirY = 0;
    api.processServerEvents([
      {
        type: 'impact',
        x: 2100,
        y: 2100,
        enemyX: 2100,
        enemyY: 2100,
        damage: 250,
        isChain: false,
        dirX: 0.6,
        dirY: 0.8,
      }
    ]);
    assert.equal(api.getHitStopTimer(), 0, 'Server impact with damage < 350 should not trigger hit-stop');
    assert.equal(api.camera.dirShake, 0, 'Server impact with damage < 350 should not set dirShake');

    api.processServerEvents([
      {
        type: 'impact',
        x: 2100,
        y: 2100,
        enemyX: 2100,
        enemyY: 2100,
        damage: 380,
        isChain: false,
        dirX: 0.6,
        dirY: 0.8,
      }
    ]);
    assert.ok(api.getHitStopTimer() >= 0.030, 'Server impact with damage >= 350 should trigger hit-stop');
    assert.ok(Math.abs(api.camera.dirX - 0.6) < 0.01, 'camera.dirX should match impact direction');
    assert.ok(Math.abs(api.camera.dirY - 0.8) < 0.01, 'camera.dirY should match impact direction');
    const srvDirShake = api.camera.dirShake;
    assert.ok(srvDirShake > 0, 'camera.dirShake should be primed');

    // Server impact with damage > 425 triggers bigger shake
    api.camera.dirShake = 0;
    api.processServerEvents([
      {
        type: 'impact',
        x: 2100,
        y: 2100,
        enemyX: 2100,
        enemyY: 2100,
        damage: 480,
        isChain: false,
        dirX: 0.6,
        dirY: 0.8,
      }
    ]);
    assert.ok(api.camera.dirShake > srvDirShake, 'Server impact with damage > 425 should trigger bigger shake');
    assert.ok(api.camera.dirShake >= 22, 'Server impact with damage > 425 should have dirShake >= 22');

    // 8. Multiplayer multi-kill (multiple enemy_die events) triggers hit-stop
    api.camera.x = 2100 - 640;
    api.camera.y = 2100 - 400 / api.constants.TILT_Y;
    api.setHitStopTimer(0);
    api.processServerEvents([
      { type: 'enemy_die', x: 2100, y: 2100, vx: 50, vy: 0 },
      { type: 'enemy_die', x: 2120, y: 2100, vx: 50, vy: 0 },
    ]);
    assert.ok(api.getHitStopTimer() >= 0.030, 'Multi-kill in server events should trigger hit-stop');

    // 9. Directional rendering does not throw and computes shake offsets
    assert.doesNotThrow(() => {
      api.render();
    }, 'render with directional screen shake should not throw');

    // 10. Hammer hit sound effect: 20% longer and louder when damage >= 350, 40% when damage > 425
    function createMockAudioContext() {
      const createParam = (init = 0) => ({
        value: init,
        setValueAtTime(v) { this.value = v; },
        linearRampToValueAtTime(v) { this.value = v; },
        exponentialRampToValueAtTime(v) { this.value = v; },
      });
      return {
        currentTime: 0.5,
        state: 'running',
        destination: {},
        createOscillator() {
          return {
            type: 'sine',
            frequency: createParam(100),
            connect: () => {},
            start: () => {},
            stop: () => {},
          };
        },
        createGain() {
          return {
            gain: createParam(1),
            connect: () => {},
          };
        },
      };
    }
    win.AudioContext = createMockAudioContext;

    // Base hammer hit (< 350 damage, e.g. 100)
    api.setState({ soundWindowStartMs: -1000, soundsInCurrentWindow: 0 });
    const normalSound = api.playImpactSound(100, false);
    assert.ok(normalSound, 'Normal impact sound should be generated');
    const baseDuration = normalSound.duration; // 0.123
    const baseGain = normalSound.peakGain;     // 0.31

    // Hammer hit >= 350 (e.g. 380): 20% longer and louder
    api.setState({ soundWindowStartMs: -1000, soundsInCurrentWindow: 0 });
    const sound350 = api.playImpactSound(380, false);
    assert.ok(sound350, 'Impact sound for 380 damage should be generated');
    assert.ok(Math.abs(sound350.duration - baseDuration * 1.2) < 0.0001, 'Hit sound >= 350 should be 20% longer');
    assert.ok(Math.abs(sound350.peakGain - baseGain * 1.2) < 0.0001, 'Hit sound >= 350 should be 20% louder');

    // Hammer hit > 425 (e.g. 500): 40% longer and louder
    api.setState({ soundWindowStartMs: -1000, soundsInCurrentWindow: 0 });
    const sound425 = api.playImpactSound(500, false);
    assert.ok(sound425, 'Impact sound for 500 damage should be generated');
    assert.ok(Math.abs(sound425.duration - baseDuration * 1.4) < 0.0001, 'Hit sound > 425 should be 40% longer');
    assert.ok(Math.abs(sound425.peakGain - baseGain * 1.4) < 0.0001, 'Hit sound > 425 should be 40% louder');

    // Chain hit (isChain = true) should not scale even if damage >= 350
    api.setState({ soundWindowStartMs: -1000, soundsInCurrentWindow: 0 });
    const chainSound = api.playImpactSound(400, true);
    assert.ok(chainSound, 'Chain sound should be generated');
    assert.ok(Math.abs(chainSound.duration - baseDuration) < 0.0001, 'Chain hit sound should not get hammer duration multiplier');
    assert.ok(Math.abs(chainSound.peakGain - baseGain) < 0.0001, 'Chain hit sound should not get hammer gain multiplier');
  });

  it('detects continuous collision and impacts enemies at every point along the length of the chain in local physics', () => {
    api.initGame();
    api.enemies.length = 0;
    api.warrior.x = 2000;
    api.warrior.y = 2000;
    api.warrior.vx = 0;
    api.warrior.vy = 200;

    const h = api.hammer;
    h.chainLinks = 2;
    h.mass = 4.0;
    h.x = 2200;
    h.y = 2000;
    h.vx = 0;
    h.vy = 200;

    api.initHammerChainNodes(h);
    h.chainNodes[0].x = 2000;
    h.chainNodes[0].y = 2000;
    h.chainNodes[0].vx = 0;
    h.chainNodes[0].vy = 200;

    h.chainNodes[1].x = 2100;
    h.chainNodes[1].y = 2000;
    h.chainNodes[1].vx = 0;
    h.chainNodes[1].vy = 200;

    h.chainNodes[2].x = 2200;
    h.chainNodes[2].y = 2000;
    h.chainNodes[2].vx = 0;
    h.chainNodes[2].vy = 200;

    api.updateWarriorBroadphaseBounds(api.warrior);

    // Place an enemy halfway between Node 0 and Node 1 at x = 2050, y = 2015.
    // Distance from enemy to Node 0 is ~52 > 25.5 (NO discrete node collision).
    // Distance from enemy to Node 1 is ~52 > 25.5 (NO discrete node collision).
    // BUT distance to the line segment between Node 0 and Node 1 is 15 <= 25.5.
    api.spawnEnemy(false);
    const enemy = api.enemies[0];
    enemy.x = 2050;
    enemy.y = 2015;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.hp = 100;
    enemy.maxHp = 100;
    enemy.mass = 1.0;
    enemy.hitCooldown = 0;
    enemy.chainHitCooldown = 0;

    api.stepPhysics(0.016);

    // Verify enemy took damage and was pushed
    assert.ok(enemy.hp < 100, `Enemy between chain nodes should take damage, hp was: ${enemy.hp}`);
    assert.ok(enemy.vy > 0, `Enemy should receive downward impulse from moving chain, vy was: ${enemy.vy}`);
  });

  it('plays moderate sound effects for warrior mounts and enemy motorcycles', () => {
    let mockOscillators = [];
    let mockGains = [];
    function createMockAudioContext() {
      const createParam = (init = 0) => ({
        value: init,
        setValueAtTime(v) { this.value = v; },
        linearRampToValueAtTime(v) { this.value = v; },
        exponentialRampToValueAtTime(v) { this.value = v; },
      });
      return {
        currentTime: 1.0,
        state: 'running',
        destination: {},
        createOscillator() {
          const osc = {
            type: 'sine',
            frequency: createParam(100),
            connect: () => {},
            start: () => {},
            stop: () => {},
          };
          mockOscillators.push(osc);
          return osc;
        },
        createGain() {
          const g = {
            gain: createParam(1),
            connect: () => {},
          };
          mockGains.push(g);
          return g;
        },
      };
    }
    win.AudioContext = createMockAudioContext;

    // 1. Mount claim sounds for all 4 mounts
    const mounts = ['horse', 'tortoise', 'elephant', 'motorcycle'];
    for (const m of mounts) {
      mockOscillators = [];
      mockGains = [];
      const res = api.playMountClaimSound(m);
      assert.ok(res, `Claim sound for ${m} should return audio metadata`);
      assert.equal(res.mountType, m);
      assert.ok(res.duration >= 0.25 && res.duration <= 0.45, `Duration for ${m} should be between 0.25s and 0.45s, got: ${res.duration}`);
      assert.ok(res.peakGain >= 0.08 && res.peakGain <= 0.18, `Peak gain for ${m} should be moderate (0.08-0.18), got: ${res.peakGain}`);
      assert.ok(mockOscillators.length >= 1, `Should construct oscillator nodes for ${m}`);
      assert.ok(mockGains.length >= 1, `Should construct gain node for ${m}`);
    }

    // 2. Locomotion sounds for all 4 mounts
    for (const m of mounts) {
      mockOscillators = [];
      mockGains = [];
      const res = api.playMountLocomotionSound(m, 1.2);
      assert.ok(res, `Locomotion sound for ${m} should return audio metadata`);
      assert.equal(res.mountType, m);
      assert.ok(res.duration >= 0.04 && res.duration <= 0.15, `Locomotion duration for ${m} should be quick, got: ${res.duration}`);
      assert.ok(res.peakGain >= 0.08 && res.peakGain <= 0.16, `Locomotion peak gain for ${m} should be moderate (0.08-0.16), got: ${res.peakGain}`);
    }

    // 3. Enemy motorcycle engine sound with distance volume attenuation
    const closeSound = api.playEnemyMotorcycleEngineSound(0.12, 1.0);
    assert.ok(closeSound);
    assert.equal(closeSound.peakGain, 0.12, 'Close enemy motorcycle should have volume 0.12');

    const farSound = api.playEnemyMotorcycleEngineSound(0.03, 1.0);
    assert.ok(farSound);
    assert.equal(farSound.peakGain, 0.03, 'Far enemy motorcycle should have attenuated volume 0.03');

    // 4. Motorcycle crash sound on dismount/wreck
    mockOscillators = [];
    mockGains = [];
    const crash = api.playMotorcycleCrashSound();
    assert.ok(crash);
    assert.ok(crash.duration >= 0.20 && crash.duration <= 0.35);
    assert.ok(crash.peakGain >= 0.10 && crash.peakGain <= 0.18, 'Crash sound should have moderate peak gain');
    assert.ok(mockOscillators.length >= 2, 'Crash sound should use dual oscillators for metallic skid');

    // 5. Locomotion integration in updateEffects(dt)
    api.initGame();
    api.warrior.alive = true;
    api.warrior.mountType = 'horse';
    api.warrior.mountHp = 100;
    api.warrior.vx = 80;
    api.warrior.vy = 60; // speed = 100 > 20

    // Step by 0.1s -> timer increases but hasn't reached interval
    api.updateEffects(0.1);
    assert.ok(api.getState().mountSoundTimer > 0, 'Mount sound timer should accumulate when moving');

    // Step by another 0.25s -> exceeds horse interval (~0.24s) -> triggers sound and resets timer
    api.updateEffects(0.25);
    assert.ok(api.getState().mountSoundTimer < 0.2, 'Mount sound timer should reset after playing locomotion sound');

    // When stationary, mount sound timer should stay 0
    api.warrior.vx = 0;
    api.warrior.vy = 0;
    api.updateEffects(0.05);
    assert.equal(api.getState().mountSoundTimer, 0, 'Stationary mounted warrior should reset sound timer');

    // 6. Enemy motorcycle engine integration in updateEffects(dt)
    api.enemies.length = 0;
    api.spawnEnemy(false);
    const motoEnemy = api.enemies[0];
    motoEnemy.variant = 'motorcycle';
    motoEnemy.hp = 75;
    motoEnemy.x = api.warrior.x + 200;
    motoEnemy.y = api.warrior.y;
    motoEnemy.vx = 300;
    motoEnemy.vy = 0;

    mockOscillators = [];
    api.updateEffects(0.2); // Exceeds 0.14s enemy motorcycle loop interval
    assert.ok(mockOscillators.length > 0, 'Nearby enemy motorcycle should trigger engine audio in updateEffects');

    // 7. Server events trigger audio
    mockOscillators = [];
    api.processServerEvents([
      {
        type: 'motorcycle_wreck',
        x: api.warrior.x + 100,
        y: api.warrior.y,
        radius: 21,
        duration: 30,
      },
    ]);
    assert.ok(mockOscillators.length >= 2, 'motorcycle_wreck event should trigger crash sound');

    mockOscillators = [];
    api.processServerEvents([
      {
        type: 'claim_motorcycle',
        id: 'wreck-sound-test',
        x: api.warrior.x,
        y: api.warrior.y,
      },
    ]);
    assert.ok(mockOscillators.length >= 2, 'claim_motorcycle event should trigger motorcycle mount claim sound');
  });

  it('routes WebSocket connections from *.appspot.com to the Cloud Run backend', () => {
    const api = loadClientGame().api;
    assert.equal(api.CLOUD_RUN_HOST, 'hammertime-415310313744.us-east1.run.app');
    assert.equal(
      api.getMultiplayerWsUrl('hammertime-io.appspot.com', 'https:'),
      'wss://hammertime-415310313744.us-east1.run.app'
    );
    assert.equal(
      api.getMultiplayerWsUrl('hammertime-io.uc.r.appspot.com', 'https:'),
      'wss://hammertime-415310313744.us-east1.run.app'
    );
    assert.equal(
      api.getMultiplayerWsUrl('localhost:8080', 'http:'),
      'ws://localhost:8080'
    );
    assert.equal(
      api.getMultiplayerWsUrl('hammertime-415310313744.us-east1.run.app', 'https:'),
      'wss://hammertime-415310313744.us-east1.run.app'
    );
    assert.equal(api.INPUT_SEND_INTERVAL_MS, 33);
  });
});
