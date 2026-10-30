'use strict';

const { describe, it, beforeEach } = require('./harness.js');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const srv = require('../dist/server.js');

function resetTestWorld() {
  srv.players.clear();
  srv.enemies.length = 0;
  srv.rats.length = 0;
  srv.blackCircles.length = 0;
  srv.clearLeaderboard();
  srv.initStoneColumns();
  srv.setState({
    elapsedGameTime: 0,
    spawnTimer: 0,
    earthquakeTimer: 0,
    roundRestartTimer: 0,
    gameMode: 'coop',
    roundState: 'playing',
    teamKills: 0,
    victoryInfo: null,
    pendingEvents: [],
  });
}

function addTestPlayer(id = 'p1', x = 2100, y = 2100) {
  const p = srv.createPlayer(id, null);
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.hammers = [srv.createPlayerHammer(p, 0)];
  p.hammer = p.hammers[0];
  p.chainNodes = p.hammer.chainNodes;
  srv.players.set(id, p);
  return p;
}

function addTestEnemy(x = 2200, y = 2100, hp = 100) {
  srv.spawnEnemy(false);
  const e = srv.enemies[srv.enemies.length - 1];
  e.x = x;
  e.y = y;
  e.vx = 0;
  e.vy = 0;
  e.hp = hp;
  e.maxHp = hp;
  e.radius = 19;
  e.mass = 1.45;
  e.moveForce = 210;
  e.friction = 4.6;
  e.contactDamage = 6;
  e.contactPush = 260;
  e.hitCooldown = 0;
  e.chainHitCooldown = 0;
  e.contactCooldown = 0;
  e.burnTimer = 0;
  e.fireproofTimer = 0;
  e.fearTimer = 0;
  e.danceTimer = 0;
  e.danceImmuneTimer = 0;
  e.webTimer = 0;
  e.knockdownTimer = 0;
  return e;
}

describe('Server Constants & Configuration', () => {
  it('defines expected world, chain, and combat constants', () => {
    assert.equal(srv.WORLD_WIDTH, 4200);
    assert.equal(srv.WORLD_HEIGHT, 4200);
    assert.equal(srv.STONE_COLUMN_COUNT, 4);
    assert.equal(srv.INITIAL_CHAIN_LINKS, 3);
    assert.equal(srv.MAX_HAMMERS_PER_PLAYER, 3);
    assert.equal(srv.EXTRA_HAMMER_DURATION, 120.0);
    assert.equal(srv.EXPLOSION_RADIUS, 420);
  });

  it('defines reduced rare powerup drop probabilities', () => {
    assert.equal(srv.RARE_HAMMER_DROP_CHANCE, 0.0024);
    assert.equal(srv.RARE_HORSE_DROP_CHANCE, 0.0016);
    assert.equal(srv.RARE_TORTOISE_DROP_CHANCE, 0.0016);
    assert.equal(srv.RARE_ELEPHANT_DROP_CHANCE, 0.00072);
    assert.equal(srv.RARE_BULLDOZER_DROP_CHANCE, 0.0006);
    assert.equal(srv.RARE_EARTHQUAKE_DROP_CHANCE, 0.0016);
    assert.equal(srv.RARE_FEAR_DROP_CHANCE, 0.0016);
    assert.equal(srv.RARE_DISCO_DROP_CHANCE, 0.0016);
    assert.equal(srv.RARE_JACKOLANTERN_DROP_CHANCE, 0.0016);
    assert.equal(srv.RARE_RATS_DROP_CHANCE, 0.0016);
    assert.equal(srv.RARE_SPIDER_DROP_CHANCE, 0.0016);
  });

  it('defines powerup durations and parameters', () => {
    assert.equal(srv.DISCO_HAMMER_DURATION, 20.0);
    assert.equal(srv.ZOMBIE_DANCE_DURATION, 30.0);
    assert.equal(srv.ZOMBIE_DANCE_IMMUNE_DURATION, 45.0);
    assert.equal(srv.JACKOLANTERN_HAMMER_DURATION, 60.0);
    assert.equal(srv.RAT_SWARM_COUNT, 10);
    assert.equal(srv.RAT_DAMAGE, 35);
    assert.equal(srv.ZOMBIE_WEB_DURATION, 30.0);
    assert.equal(srv.BULLDOZER_DURATION, 20.0);
    assert.equal(srv.BULLDOZER_RADIUS, 34);
    assert.equal(srv.EARTHQUAKE_DURATION, 5.0);
    assert.equal(srv.ZOMBIE_KNOCKDOWN_RECOVERY, 5.0);
    assert.equal(srv.FEAR_DURATION, 20.0);
    assert.equal(srv.FEAR_SPEED_MULT, 4.0);
  });
});

describe('World Initialization, Stone Columns & Player Creation', () => {
  beforeEach(resetTestWorld);

  it('initializes 4 stone columns and detects column collisions', () => {
    assert.equal(srv.stoneColumns.length, 4);
    const col = srv.stoneColumns[0];
    assert.equal(srv.touchesStoneColumn(col.x, col.y, 10), true);
    assert.equal(srv.touchesStoneColumn(2100, 2100, 10), false);
  });

  it('creates player with 0 automatic HP regeneration and 3 chain links', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    assert.equal(p.hp, 100);
    assert.equal(p.maxHp, 100);
    assert.equal(p.regenRate, 0);
    assert.equal(p.chainLinks, 3);
    assert.equal(p.hammers.length, 1);
    assert.equal(p.hammer.chainNodes.length, 4);

    // Verify warrior does not automatically heal over time
    p.hp = 50;
    srv.enemies.length = 0;
    srv.tickServer(1.0);
    assert.equal(p.hp, 50);
  });

  it('steers and moves warrior in both keyboard and mouse modes', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    p.angle = 0;
    p.input.controlMode = 'keyboard';
    p.input.keys = { left: false, right: true, up: true, down: false };
    srv.stepPlayerPhysics(p, 0.05);
    assert.ok(p.angle > 0);
    assert.ok(Math.hypot(p.vx, p.vy) > 0);

    // Mouse mode
    const p2 = addTestPlayer('p2', 1500, 1500);
    p2.angle = 0;
    p2.input.controlMode = 'mouse';
    p2.input.mouseWorldX = 1500;
    p2.input.mouseWorldY = 1800;
    srv.stepPlayerPhysics(p2, 0.05);
    assert.ok(p2.angle > 0);
    assert.ok(p2.vy > 0);
  });
});

describe('Common Powerups (Link, Weight, Health, Bomb, Flame, Speed, Friction)', () => {
  beforeEach(resetTestWorld);

  it('collects link, weight, speed, friction, and health pickups', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    p.hp = 60;

    // Link (+1 link from initial 3 = 4 links, 5 nodes)
    srv.blackCircles.push({ id: 1, x: 2100, y: 2100, radius: 10, type: 'link' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hammer.chainLinks, 4);
    assert.equal(p.hammer.chainNodes.length, 5);

    // Weight
    const prevMass = p.hammer.mass;
    const prevRadius = p.hammer.radius;
    srv.blackCircles.push({ id: 2, x: p.x, y: p.y, radius: 10, type: 'weight' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.ok(p.hammer.mass > prevMass);
    assert.ok(p.hammer.radius > prevRadius);

    // Speed & Friction
    srv.blackCircles.push({ id: 3, x: p.x, y: p.y, radius: 10, type: 'speed' });
    srv.blackCircles.push({ id: 4, x: p.x, y: p.y, radius: 10, type: 'friction' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.speedMultiplier, 1.05);
    assert.equal(p.frictionMultiplier, 1.05);

    // Health (+20% in coop)
    srv.blackCircles.push({ id: 5, x: p.x, y: p.y, radius: 10, type: 'health' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hp, 80);

    // Health blocked in PvP
    srv.setState({ gameMode: 'pvp' });
    srv.blackCircles.push({ id: 6, x: p.x, y: p.y, radius: 10, type: 'health' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hp, 80);
  });

  it('arms bomb and flame charges and triggers explosion and zombie burn + fireproof cycle', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'bomb' });
    srv.blackCircles.push({ id: 2, x: p.x, y: p.y, radius: 10, type: 'flame' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hammer.bombCharges, 1);
    assert.equal(p.hammer.flameCharges, 1);

    // Flame charge does not decay over time until impact
    srv.stepPlayerPhysics(p, 5.0);
    assert.equal(p.hammer.flameCharges, 1);
    assert.ok(p.hammer.flameTimer > 0);

    // Trigger explosion near an enemy with flaming hammer active
    const e = addTestEnemy(2200, 2100, 1000);
    srv.triggerHammerExplosion(2150, 2100, p, p.hammer);
    assert.ok(e.hp < 1000);
    assert.equal(e.burnTimer, srv.ZOMBIE_BURN_DURATION);

    // Burn for 10s -> transitions to 5s fireproof and cannot be re-ignited while fireproof
    e.x = 1000;
    e.y = 1000;
    srv.stepWorldPhysics(10.1);
    assert.equal(e.burnTimer, 0);
    assert.ok(e.fireproofTimer > 0);
    assert.equal(srv.igniteEnemy(e, p), false);
  });
});

describe('Rare Powerups: Extra Hammer (120s), Mounts (Horse, Tortoise, Elephant), Earthquake, Fear', () => {
  beforeEach(resetTestWorld);

  it('adds extra hammers up to 3 and expires them after 120 seconds', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'hammer' });
    srv.blackCircles.push({ id: 2, x: p.x, y: p.y, radius: 10, type: 'hammer' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hammers.length, 3);
    assert.ok(p.hammers[1].extraTimer > 119 && p.hammers[1].extraTimer <= 120);
    assert.ok(p.hammers[2].extraTimer > 119 && p.hammers[2].extraTimer <= 120);

    // 4th hammer pickup is ignored when already at max (3)
    srv.blackCircles.push({ id: 3, x: p.x, y: p.y, radius: 10, type: 'hammer' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hammers.length, 3);
    assert.equal(srv.blackCircles.length, 1);
    srv.blackCircles.length = 0;

    // Advance 120 seconds -> extra hammers expire and disappear, primary hammer remains
    p.hammers[1].extraTimer = 0.01;
    p.hammers[2].extraTimer = 0.01;
    srv.stepPlayerPhysics(p, 0.05);
    assert.equal(p.hammers.length, 1);
  });

  it('handles Warhorse, Giant Tortoise (1/4 speed, 20x friction), and War Elephant (1x speed, 10x friction) mounts', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    p.hp = 85;

    // Horse
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'horse' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.mountType, 'horse');
    assert.equal(p.mountHp, 85);
    assert.equal(p.radius, 25);

    // Cannot pick up tortoise while already on a horse
    srv.blackCircles.push({ id: 2, x: p.x, y: p.y, radius: 10, type: 'tortoise' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.mountType, 'horse');
    assert.equal(srv.blackCircles.length, 1);
    srv.blackCircles.length = 0;

    // Damage is absorbed by mount first
    srv.applyDamageToPlayer(p, 50);
    assert.equal(p.mountHp, 35);
    assert.equal(p.hp, 85);
    srv.applyDamageToPlayer(p, 40);
    assert.equal(p.mountType, null);
    assert.equal(p.mountHp, 0);
    assert.equal(p.hp, 85);
    assert.equal(p.radius, 20);

    // Giant Tortoise
    srv.blackCircles.push({ id: 3, x: p.x, y: p.y, radius: 10, type: 'tortoise' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.mountType, 'tortoise');
    assert.equal(p.mountHp, 85);
    assert.equal(p.radius, 26);

    // Measure tortoise speed vs elephant speed
    p.angle = 0;
    p.vx = 0;
    p.vy = 0;
    p.input.controlMode = 'keyboard';
    p.input.keys = { left: false, right: false, up: true, down: false };
    for (let i = 0; i < 40; i++) srv.stepPlayerPhysics(p, 0.016);
    const tortoiseSpeed = Math.hypot(p.vx, p.vy);

    // War Elephant can upgrade from tortoise
    srv.blackCircles.push({ id: 4, x: p.x, y: p.y, radius: 10, type: 'elephant' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.mountType, 'elephant');
    assert.equal(p.mountHp, 250);
    assert.equal(p.radius, 32);

    p.vx = 0;
    p.vy = 0;
    for (let i = 0; i < 40; i++) srv.stepPlayerPhysics(p, 0.016);
    const elephantSpeed = Math.hypot(p.vx, p.vy);
    assert.ok(
      elephantSpeed > tortoiseSpeed * 2.5,
      `Expected elephant speed (${elephantSpeed}) > 2.5x tortoise speed (${tortoiseSpeed})`
    );
  });

  it('triggers Earthquake (5s quake + 5s zombie knockdown) and immobilizes enemies', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    const e = addTestEnemy(2400, 2100, 100);
    e.vx = 100;
    e.vy = 50;

    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'earthquake' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(srv.getState().earthquakeTimer, srv.EARTHQUAKE_DURATION);
    assert.equal(e.knockdownTimer, srv.ZOMBIE_KNOCKDOWN_RECOVERY);
    assert.equal(e.vx, 0);
    assert.equal(e.vy, 0);

    // During quake, enemy remains knocked down and motionless
    srv.stepWorldPhysics(1.0);
    assert.ok(srv.getState().earthquakeTimer > 3.9);
    assert.equal(e.knockdownTimer, srv.ZOMBIE_KNOCKDOWN_RECOVERY);
    assert.equal(e.vx, 0);
    assert.equal(e.vy, 0);
  });

  it('triggers Fear wave and contagious 4x panic fleeing between zombies', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    const e1 = addTestEnemy(2200, 2100, 100);
    const e2 = addTestEnemy(2220, 2100, 100);

    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'fear' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(e1.fearTimer, srv.FEAR_DURATION);
    assert.ok(e1.vx > 0, 'Feared zombie should flee away from player');

    // Reset e2 fear, place touching e1, and verify fear contagion in stepWorldPhysics
    e2.fearTimer = 0;
    e2.x = e1.x + 10;
    e2.y = e1.y;
    srv.stepWorldPhysics(0.016);
    assert.ok(e2.fearTimer > 0, 'Touching zombie should catch fear');
  });
});

describe('Rare Powerups: Disco Ball, Jack-o-Lantern, Rat Swarm, Spider Hammer, Bulldozer', () => {
  beforeEach(resetTestWorld);

  it('Disco Ball Hammer passes through zombies without damage, starts 30s dance + contagion + 45s immunity', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'disco' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.ok(p.hammer.discoTimer > 19.9);

    // Place zombie directly in path of moving disco hammer
    const e1 = addTestEnemy(2200, 2100, 100);
    const e2 = addTestEnemy(2212, 2100, 100);
    p.hammer.x = 2200;
    p.hammer.y = 2100;
    p.hammer.vx = 500;
    p.hammer.vy = 0;

    srv.stepWorldPhysics(0.016);
    // No damage dealt, hammer did not bounce backward, e1 is dancing, e2 caught dance via contact
    assert.equal(e1.hp, 100);
    assert.ok(p.hammer.vx > 0);
    assert.ok(e1.danceTimer > 29.9);
    assert.ok(e2.danceTimer > 29.9);

    // After 30s of dancing, zombie becomes immune to dancing for 45s
    e1.x = 1200;
    e2.x = 1400;
    srv.stepWorldPhysics(30.1);
    assert.equal(e1.danceTimer, 0);
    assert.ok(e1.danceImmuneTimer > 44.5);
    assert.equal(srv.startEnemyDance(e1), false);
  });

  it('Jack-o-Lantern Hammer lasts 60s and deals normal impact damage', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'jackolantern' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.ok(p.hammer.jackolanternTimer > 59.9);

    const e = addTestEnemy(2200, 2100, 200);
    p.hammer.x = 2190;
    p.hammer.y = 2100;
    p.hammer.vx = 600;
    p.hammer.vy = 0;

    srv.stepWorldPhysics(0.016);
    assert.ok(e.hp < 200, 'Jack-o-lantern hammer should deal normal impact damage');
  });

  it('Rat Swarm spawns 10 rats that run in straight lines, damage zombies, and despawn at map edges', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'rats' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(srv.rats.length, 10);

    // Move rat #0 away from the other 9 rats and place an enemy on top of rat #0
    const r0 = srv.rats[0];
    r0.x = 2500;
    r0.y = 2500;
    const e = addTestEnemy(r0.x, r0.y, 100);
    srv.stepWorldPhysics(0.016);
    assert.equal(e.hp, 100 - srv.RAT_DAMAGE);

    // Move all rats to map boundary and verify they disappear
    for (const r of srv.rats) {
      r.x = srv.WORLD_WIDTH + 50;
    }
    srv.stepWorldPhysics(0.016);
    assert.equal(srv.rats.length, 0);
  });

  it('Spider Hammer deals normal damage and wraps zombies in white webbing for 30s so they cannot move', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'spider' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hammer.isSpider, true);

    // Cannot pick up another spider powerup when all hammers are already spiders
    srv.blackCircles.push({ id: 2, x: p.x, y: p.y, radius: 10, type: 'spider' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(srv.blackCircles.length, 1);
    srv.blackCircles.length = 0;

    // Hit zombie with spider hammer
    const e = addTestEnemy(2200, 2100, 250);
    p.hammer.x = 2190;
    p.hammer.y = 2100;
    p.hammer.vx = 550;
    p.hammer.vy = 0;
    srv.stepWorldPhysics(0.016);
    assert.ok(e.hp < 250);
    assert.equal(e.webTimer, srv.ZOMBIE_WEB_DURATION);

    // Once hit cooldown expires, webbed zombie cannot move
    e.hitCooldown = 0;
    e.chainHitCooldown = 0;
    p.hammer.x = 1800;
    p.hammer.vx = 0;
    const prevX = e.x;
    const prevY = e.y;
    srv.stepWorldPhysics(0.1);
    assert.equal(e.x, prevX);
    assert.equal(e.y, prevY);
    assert.equal(e.vx, 0);
    assert.equal(e.vy, 0);
  });

  it('Bulldozer mode grants 20s invincibility, crushes zombies, pushes stone columns, and blocks other pickups', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    // Place bulldozer pickup and a speed pickup at the same spot
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'speed' });
    srv.blackCircles.push({ id: 2, x: p.x, y: p.y, radius: 10, type: 'bulldozer' });
    srv.stepPlayerPhysics(p, 0.016);

    assert.ok(p.bulldozerTimer > 19.9);
    assert.equal(p.radius, srv.BULLDOZER_RADIUS);
    // Same-tick pickup guard prevented picking up the speed powerup
    assert.equal(p.speedMultiplier, 1.0);
    assert.equal(srv.blackCircles.length, 1);

    // Invulnerable to damage while bulldozer
    assert.equal(srv.applyDamageToPlayer(p, 999), false);
    assert.equal(p.hp, 100);

    // Crushes zombies on contact
    const e = addTestEnemy(p.x + 20, p.y, 200);
    srv.stepWorldPhysics(0.016);
    assert.equal(srv.enemies.includes(e), false);
    assert.equal(p.kills, 1);

    // Pushes stone columns
    const col = srv.stoneColumns[0];
    const origColX = col.x;
    p.x = col.x - (p.radius + col.radius - 8);
    p.y = col.y;
    srv.stepPlayerPhysics(p, 0.016);
    assert.ok(col.x > origColX, 'Bulldozer should push stone column');
  });
});

describe('Enemy Production Scaling (>2 Players) & PvP / Victory Modes', () => {
  beforeEach(resetTestWorld);

  it('increases enemy production rate by 25% for each additional player beyond 2', () => {
    addTestPlayer('p1', 1500, 1500);
    addTestPlayer('p2', 1700, 1500);
    srv.enemies.length = 0;

    // With 2 players: spawnInterval = 2.7 / 1.0 = 2.7s
    srv.setState({ spawnTimer: 2.2 });
    srv.tickServer(0.05); // spawnTimer = 2.25 < 2.7 -> no spawn
    assert.equal(srv.enemies.length, 0);

    // With 4 players (2 extra players): spawnRateMult = 1 + 2 * 0.25 = 1.5 -> spawnInterval = 2.7 / 1.5 = 1.8s
    addTestPlayer('p3', 1900, 1500);
    addTestPlayer('p4', 2100, 1500);
    srv.setState({ spawnTimer: 1.78 });
    srv.tickServer(0.05); // spawnTimer crosses 1.8s -> spawns an enemy!
    assert.equal(srv.enemies.length, 1);
  });

  it('alternates between coop and pvp when > 3 players and triggers PvP victory for last player standing', () => {
    const p1 = addTestPlayer('p1', 1500, 1500);
    const p2 = addTestPlayer('p2', 1700, 1500);
    const p3 = addTestPlayer('p3', 1900, 1500);
    const p4 = addTestPlayer('p4', 2100, 1500);

    assert.equal(srv.getState().gameMode, 'coop');
    srv.resetGameWorld(true);
    assert.equal(srv.getState().gameMode, 'pvp');

    // If 3 players fall in PvP, last survivor wins immediately on tickServer
    p2.alive = false;
    p3.alive = false;
    p4.alive = false;
    srv.tickServer(0.016);
    assert.equal(srv.getState().roundState, 'victory');
    assert.equal(srv.getState().victoryInfo.championName, p1.name);
  });

  it('prunes idle players after timeout', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    p.lastActivityTime = Date.now() - 125000; // > 120s idle
    srv.tickServer(0.016);
    assert.equal(srv.players.size, 0);
  });
});

describe('WebSocket RFC 6455 Framing & HTTP Static Server', () => {
  it('encodes and decodes WebSocket frames (small & 16-bit extended payload)', () => {
    const received = [];
    const mockSocket = new EventEmitter();
    mockSocket.write = () => {};
    mockSocket.end = () => {};

    srv.setupSocketReader(
      mockSocket,
      (msg) => received.push(msg),
      () => {}
    );

    // Small unmasked frame
    const smallPayload = { type: 'input', controlMode: 'mouse', active: true };
    mockSocket.emit('data', srv.encodeWsFrame(JSON.stringify(smallPayload)));
    assert.equal(received.length, 1);
    assert.deepEqual(received[0], smallPayload);

    // 16-bit length (>125 bytes) masked client frame
    const largeObj = { type: 'input', pad: 'x'.repeat(300) };
    const rawBytes = Buffer.from(JSON.stringify(largeObj), 'utf8');
    const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(rawBytes.length, 2);
    const maskedPayload = Buffer.alloc(rawBytes.length);
    for (let i = 0; i < rawBytes.length; i++) {
      maskedPayload[i] = rawBytes[i] ^ mask[i & 3];
    }
    mockSocket.emit('data', Buffer.concat([header, mask, maskedPayload]));
    assert.equal(received.length, 2);
    assert.equal(received[1].pad.length, 300);
  });
});

describe('Player Nicknames & Top 10 Enemies Killed Leaderboard', () => {
  beforeEach(resetTestWorld);

  it('sanitizes nicknames (trims, collapses whitespace, strips control chars, caps at 20 chars)', () => {
    assert.equal(srv.sanitizeNickname('   Sir   Hammer\t\nLot   '), 'Sir Hammer Lot');
    assert.equal(srv.sanitizeNickname('12345678901234567890EXTRA'), '12345678901234567890');
    assert.equal(srv.sanitizeNickname('   ', 'FallbackHero'), 'FallbackHero');
    assert.equal(srv.sanitizeNickname(null, 'DefaultName'), 'DefaultName');
  });

  it('sets player custom nickname and records enemy kills on the leaderboard', () => {
    const p1 = addTestPlayer('p1', 2100, 2100);
    const p2 = addTestPlayer('p2', 2300, 2100);

    srv.setPlayerNickname(p1, '  Thor Odinson  ');
    srv.setPlayerNickname(p2, 'Valkyrie');

    assert.equal(p1.name, 'Thor Odinson');
    assert.equal(p1.hasCustomNickname, true);
    assert.equal(p2.name, 'Valkyrie');

    // Defeat 3 enemies with Valkyrie and 1 with Thor
    for (let i = 0; i < 3; i++) {
      addTestEnemy(2200, 2100, 50);
      srv.defeatEnemy(srv.enemies.length - 1, p2);
    }
    addTestEnemy(2200, 2100, 50);
    srv.defeatEnemy(srv.enemies.length - 1, p1);

    const board = srv.getTopLeaderboard();
    assert.equal(board.length, 2);
    assert.equal(board[0].rank, 1);
    assert.equal(board[0].name, 'Valkyrie');
    assert.equal(board[0].kills, 3);
    assert.equal(board[1].rank, 2);
    assert.equal(board[1].name, 'Thor Odinson');
    assert.equal(board[1].kills, 1);
  });

  it('limits leaderboard to top 10 entries sorted by highest kills and preserves best score across rounds', () => {
    for (let i = 1; i <= 14; i++) {
      srv.recordLeaderboardKillScore(`Warrior_${i}`, i * 5);
    }

    const top10 = srv.getTopLeaderboard();
    assert.equal(top10.length, 10);
    assert.equal(top10[0].rank, 1);
    assert.equal(top10[0].name, 'Warrior_14');
    assert.equal(top10[0].kills, 70);
    assert.equal(top10[9].rank, 10);
    assert.equal(top10[9].name, 'Warrior_5');
    assert.equal(top10[9].kills, 25);

    // Lower score for an existing nickname does not overwrite their high score
    srv.recordLeaderboardKillScore('Warrior_14', 12);
    assert.equal(srv.getTopLeaderboard()[0].kills, 70);

    // Higher score updates their record
    srv.recordLeaderboardKillScore('Warrior_5', 99);
    const updatedTop10 = srv.getTopLeaderboard();
    assert.equal(updatedTop10[0].name, 'Warrior_5');
    assert.equal(updatedTop10[0].kills, 99);

    // Resetting player for a new round preserves their best score on the leaderboard
    const p = addTestPlayer('p_round', 2100, 2100);
    srv.setPlayerNickname(p, 'ImmortalChampion');
    p.kills = 120;
    srv.resetPlayerForNewRound(p);
    assert.equal(p.kills, 0);
    assert.equal(srv.getTopLeaderboard()[0].name, 'ImmortalChampion');
    assert.equal(srv.getTopLeaderboard()[0].kills, 120);
  });
});

describe('Server Stats Telemetry & /stats Dashboard', () => {
  beforeEach(() => {
    resetTestWorld();
    srv.clearStatsHistory();
  });

  it('tracks requests per second, request latency, and player count over time', () => {
    addTestPlayer('p1', 2100, 2100);
    addTestPlayer('p2', 2200, 2100);

    // Simulate 3 HTTP requests with distinct latencies
    srv.recordHttpRequestMetric(12.5);
    srv.recordHttpRequestMetric(17.5);
    srv.recordHttpRequestMetric(15.0);

    // Simulate WebSocket message
    srv.recordWsMessageMetric();
    srv.recordWsMessageMetric();

    const snapshot = srv.getLatestStatsSnapshot();
    assert.equal(snapshot.players, 2);
    assert.equal(snapshot.alivePlayers, 2);
    assert.equal(snapshot.totalRequests, 3);
    assert.equal(snapshot.totalWsMessages, 2);
    assert.ok(Array.isArray(snapshot.history));

    const html = srv.renderStatsDashboardHtml();
    assert.ok(html.includes('HammerTime Server Stats'));
    assert.ok(html.includes('/stats/json'));
    assert.ok(html.includes('chart-players'));
    assert.ok(html.includes('chart-rps'));
    assert.ok(html.includes('chart-latency'));
  });
});
