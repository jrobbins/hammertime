'use strict';

const { describe, it, beforeEach } = require('./harness.js');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const srv = require('../dist/server.js');

function resetTestWorld() {
  srv.players.clear();
  srv.enemies.length = 0;
  srv.blackCircles.length = 0;
  srv.setLeaderboardFilePath(null);
  srv.clearLeaderboard();
  srv.initStoneColumns();
  srv.setState({
    elapsedGameTime: 0,
    spawnTimer: 0,
    earthquakeTimer: 0,
    roundRestartTimer: 0,
    roundState: 'playing',
    teamKills: 0,
    victoryInfo: null,
    pendingEvents: [],
    activePhysicsSubsteps: srv.PHYSICS_SUBSTEPS,
    activeChainRelaxIters: srv.CHAIN_RELAX_ITERS,
    avgTickMs: 0,
    isReducedFidelity: false,
  });
}

function addTestPlayer(id = 'p1', x = 2100, y = 2100) {
  const p = srv.createPlayer(id, null);
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.input.mouseWorldX = x;
  p.input.mouseWorldY = y;
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
  e.traction = 4.6;
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
    assert.equal(srv.INITIAL_CHAIN_LINKS, 2);
    assert.equal(srv.INITIAL_HAMMER_MASS, 0.875);
    assert.equal(srv.MAX_CHAIN_LINKS, 9);
    assert.equal(srv.MAX_HAMMERS_PER_PLAYER, 2);
    assert.equal(srv.EXTRA_HAMMER_DURATION, 60.0);
    assert.equal(srv.EXPLOSION_RADIUS, 420);
  });

  it('defines rare powerup drop probabilities', () => {
    assert.equal(srv.RARE_HAMMER_DROP_CHANCE, 0.005);
    assert.equal(srv.RARE_HORSE_DROP_CHANCE, 0.005);
    assert.equal(srv.RARE_TORTOISE_DROP_CHANCE, 0.005);
    assert.equal(srv.RARE_ELEPHANT_DROP_CHANCE, 0.005);
    assert.equal(srv.RARE_BULLDOZER_DROP_CHANCE, 0.005);
    assert.equal(srv.RARE_EARTHQUAKE_DROP_CHANCE, 0.005);
    assert.equal(srv.RARE_FEAR_DROP_CHANCE, 0.005);
    assert.equal(srv.RARE_DISCO_DROP_CHANCE, 0.005);
    assert.equal(srv.RARE_JACKOLANTERN_DROP_CHANCE, 0.005);
    assert.equal(srv.RARE_SPIDER_DROP_CHANCE, 0.005);
    assert.equal(srv.RARE_THOR_DROP_CHANCE, 0.005);
  });

  it('defines powerup durations and parameters', () => {
    assert.equal(srv.DISCO_HAMMER_DURATION, 60.0);
    assert.equal(srv.ZOMBIE_DANCE_DURATION, 30.0);
    assert.equal(srv.ZOMBIE_DANCE_IMMUNE_DURATION, 45.0);
    assert.equal(srv.JACKOLANTERN_HAMMER_DURATION, 60.0);
    assert.equal(srv.SPIDER_HAMMER_DURATION, 60.0);
    assert.equal(srv.THOR_HAMMER_DURATION, 60.0);
    assert.equal(srv.THOR_EXPLOSION_RADIUS, srv.EXPLOSION_RADIUS * 0.5);
    assert.equal(srv.THOR_BLAST_DAMAGE_MULT, 0.5);
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

  it('initializes 4 hard-coded stone columns, detects column collisions, and omits stoneColumns from game state JSON', () => {
    assert.equal(srv.stoneColumns.length, 4);
    assert.deepEqual(srv.stoneColumns, [
      { x: 2637, y: 2637, radius: 34, height: 76 },
      { x: 1563, y: 2637, radius: 34, height: 76 },
      { x: 1563, y: 1563, radius: 34, height: 76 },
      { x: 2637, y: 1563, radius: 34, height: 76 },
    ]);
    assert.deepEqual(srv.STONE_COLUMNS, srv.stoneColumns);
    const col = srv.stoneColumns[0];
    assert.equal(srv.touchesStoneColumn(col.x, col.y, 10), true);
    assert.equal(srv.touchesStoneColumn(2100, 2100, 10), false);

    const statePayload = srv.buildGameStatePayload();
    assert.equal(statePayload.type, 'state');
    assert.equal('stoneColumns' in statePayload, false, 'stoneColumns should not be in game state JSON');
  });

  it('creates player with 0 automatic HP regeneration and 2 chain links', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    assert.equal(p.hp, 100);
    assert.equal(p.maxHp, 100);
    assert.equal(p.regenRate, 0);
    assert.equal(p.chainLinks, 2);
    assert.equal(p.hammers.length, 1);
    assert.equal(p.hammer.mass, 0.875);
    assert.equal(p.hammer.chainNodes.length, 3);

    // Verify warrior does not automatically heal over time
    p.hp = 50;
    srv.enemies.length = 0;
    srv.tickServer(1.0);
    assert.equal(p.hp, 50);
  });

  it('steers and moves warrior toward mouse cursor', () => {
    const p = addTestPlayer('p1', 1500, 1500);
    assert.equal('controlMode' in p.input, false);
    assert.equal('keys' in p.input, false);
    p.angle = 0;
    p.input.mouseWorldX = 1500;
    p.input.mouseWorldY = 1800;
    srv.stepPlayerPhysics(p, 0.05);
    assert.ok(p.angle > 0);
    assert.ok(p.vy > 0);
  });
});

describe('Common Powerups (Link, Weight, Health, Bomb, Flame, Speed)', () => {
  beforeEach(resetTestWorld);

  it('collects link, weight, speed, and health pickups (and excludes traction pickup)', () => {
    assert.deepEqual(srv.PICKUP_TYPES, ['link', 'weight', 'health', 'bomb', 'speed', 'flame']);
    assert.equal(srv.PICKUP_TYPES.includes('traction'), false);

    const p = addTestPlayer('p1', 2100, 2100);
    p.hp = 60;

    // Link (+1 link from initial 2 = 3 links, 4 nodes)
    srv.blackCircles.push({ id: 1, x: 2100, y: 2100, radius: 10, type: 'link' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hammer.chainLinks, 3);
    assert.equal(p.hammer.chainNodes.length, 4);
    assert.equal(p.hammer.linkLength, srv.LENGTH_PER_LINK);

    // Collect links up to the maximum of 9 links
    for (let i = 0; i < 6; i++) {
      srv.blackCircles.push({ id: 100 + i, x: p.x, y: p.y, type: 'link' });
      srv.stepPlayerPhysics(p, 0.016);
    }
    assert.equal(p.hammer.chainLinks, 9);
    assert.equal(p.hammer.chainNodes.length, 10);
    assert.equal(p.hammer.linkLength, srv.LENGTH_PER_LINK);
    const restLenAt9 = srv.getChainRestLength(p.hammer.chainLinks, p.hammer.linkLength);

    // Collecting another link powerup after all hammers have 9 links increases linkLength instead of chainLinks
    srv.blackCircles.push({ id: 200, x: p.x, y: p.y, type: 'link' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hammer.chainLinks, 9);
    assert.equal(p.hammer.chainNodes.length, 10);
    assert.ok(p.hammer.linkLength > srv.LENGTH_PER_LINK);
    assert.ok(srv.getChainRestLength(p.hammer.chainLinks, p.hammer.linkLength) > restLenAt9);

    // Weight
    const prevMass = p.hammer.mass;
    const prevRadius = p.hammer.radius;
    srv.blackCircles.push({ id: 2, x: p.x, y: p.y, radius: 10, type: 'weight' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.ok(p.hammer.mass > prevMass);
    assert.ok(p.hammer.radius > prevRadius);

    // Speed
    srv.blackCircles.push({ id: 3, x: p.x, y: p.y, radius: 10, type: 'speed' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.speedMultiplier, 1.05);

    // Health (+20%)
    srv.blackCircles.push({ id: 5, x: p.x, y: p.y, radius: 10, type: 'health' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hp, 80);

    // Second health pickup brings player to full health (100)
    srv.blackCircles.push({ id: 6, x: p.x, y: p.y, radius: 10, type: 'health' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hp, 100);
    assert.equal(srv.blackCircles.length, 0);

    // Cannot pick up a health powerup when already at full health
    srv.blackCircles.push({ id: 7, x: p.x, y: p.y, radius: 10, type: 'health' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hp, 100);
    assert.equal(srv.blackCircles.length, 1);
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

  it('limits pickups in the world to 40, removing oldest common pickup first or oldest of any type if none, and omits radius from state JSON', () => {
    assert.equal(srv.PICKUP_RADIUS, 10);
    assert.equal(srv.MAX_PICKUP_COUNT, 40);

    // Seed 2 rare pickups and 38 common pickups (with rare-1 oldest, then common-1, then rare-2)
    srv.addPickupToWorld({ id: 'rare-1', x: 100, y: 100, type: 'elephant' });
    srv.addPickupToWorld({ id: 'common-1', x: 110, y: 100, type: 'link' });
    srv.addPickupToWorld({ id: 'rare-2', x: 120, y: 100, type: 'bulldozer' });
    srv.addPickupToWorld({ id: 'common-2', x: 130, y: 100, type: 'weight' });
    for (let i = 0; i < 36; i++) {
      srv.addPickupToWorld({ id: `common-fill-${i}`, x: 200 + i, y: 100, type: 'speed' });
    }
    assert.equal(srv.blackCircles.length, 40);

    // Defeating an enemy spawns a 41st pickup -> evicts 'common-1' (oldest common), preserving 'rare-1' and 'rare-2'
    addTestEnemy(500, 500, 50);
    srv.defeatEnemy(srv.enemies.length - 1, null);
    assert.equal(srv.blackCircles.length, 40);
    assert.equal(srv.blackCircles[0].id, 'rare-1');
    assert.equal(srv.blackCircles[1].id, 'rare-2');
    assert.equal(srv.blackCircles[2].id, 'common-2');
    assert.equal(srv.blackCircles.some((c) => c.id === 'common-1'), false);

    // Verify pickups do not include 'radius' in memory or in serialized state JSON
    const serialized = srv.serializePickups();
    assert.equal(serialized.length, 40);
    for (const pk of serialized) {
      assert.equal('radius' in pk, false);
    }
    assert.equal(JSON.stringify(serialized).includes('"radius"'), false);

    // When all 40 pickups in the world are non-common (rare), adding a new pickup removes the oldest pickup (index 0)
    srv.blackCircles.length = 0;
    for (let i = 0; i < 40; i++) {
      srv.addPickupToWorld({ id: `rare-only-${i}`, x: 300 + i, y: 100, type: 'hammer' });
    }
    assert.equal(srv.blackCircles.length, 40);

    srv.addPickupToWorld({ id: 'newest-pickup', x: 900, y: 100, type: 'link' });
    assert.equal(srv.blackCircles.length, 40);
    assert.equal(srv.blackCircles[0].id, 'rare-only-1');
    assert.equal(srv.blackCircles.some((c) => c.id === 'rare-only-0'), false);
    assert.equal(srv.blackCircles[39].id, 'newest-pickup');
  });
});

describe('Rare Powerups: Extra Hammer (60s), Mounts (Horse, Tortoise, Elephant), Earthquake, Fear', () => {
  beforeEach(resetTestWorld);

  it('adds extra hammers up to 2 and expires them after 60 seconds', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'hammer' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hammers.length, 2);
    assert.ok(p.hammers[1].extraTimer > 59 && p.hammers[1].extraTimer <= 60);

    // 3rd hammer pickup is ignored when already at max (2)
    srv.blackCircles.push({ id: 2, x: p.x, y: p.y, radius: 10, type: 'hammer' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hammers.length, 2);
    assert.equal(srv.blackCircles.length, 1);
    srv.blackCircles.length = 0;

    // Advance 120 seconds -> extra hammer expires and disappears, primary hammer remains
    p.hammers[1].extraTimer = 0.01;
    srv.stepPlayerPhysics(p, 0.05);
    assert.equal(p.hammers.length, 1);
  });

  it('handles Warhorse, Giant Tortoise (1/4 speed, 20x traction), and War Elephant (1x speed, 10x traction) mounts', () => {
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
    p.input.mouseWorldX = p.x + 1200;
    p.input.mouseWorldY = p.y;
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
    p.input.mouseWorldX = p.x + 1200;
    p.input.mouseWorldY = p.y;
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

describe('Rare Powerups: Disco Ball, Jack-o-Lantern, Spider Hammer, Bulldozer', () => {
  beforeEach(resetTestWorld);

  it('Disco Ball Hammer passes through zombies without damage, starts 30s dance + contagion + 45s immunity', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'disco' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.ok(p.hammer.discoTimer > 59.9 && p.hammer.discoTimer <= 60);

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
    assert.ok(p.hammer.jackolanternTimer > 59.9 && p.hammer.jackolanternTimer <= 60);

    const e = addTestEnemy(2200, 2100, 200);
    p.hammer.x = 2190;
    p.hammer.y = 2100;
    p.hammer.vx = 600;
    p.hammer.vy = 0;

    srv.stepWorldPhysics(0.016);
    assert.ok(e.hp < 200, 'Jack-o-lantern hammer should deal normal impact damage');
  });

  it('Spider Hammer lasts 60s, deals normal damage, and wraps zombies in white webbing for 30s so they cannot move', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'spider' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hammer.isSpider, true);
    assert.ok(p.hammer.spiderTimer > 59.9 && p.hammer.spiderTimer <= 60);

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

    // Spider hammer effect expires after 60s
    p.hammer.spiderTimer = 0.01;
    srv.stepPlayerPhysics(p, 0.05);
    assert.equal(p.hammer.spiderTimer, 0);
    assert.equal(p.hammer.isSpider, false);
  });

  it('Thor Hammer lasts 60s and triggers a 1/2 damage, 1/2 blast radius explosion on every enemy hit', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'thor' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.ok(p.hammer.thorTimer > 59.9 && p.hammer.thorTimer <= 60);

    // Enemy 1 is directly hit by the Thor hammer; Enemy 2 is 150px away (inside 210px Thor blast radius);
    // Enemy 3 is 300px away (outside 210px Thor blast radius, even though inside 420px normal bomb radius)
    const e1 = addTestEnemy(2200, 2100, 1000);
    const e2 = addTestEnemy(2200, 2250, 1000);
    const e3 = addTestEnemy(2200, 2400, 1000);

    // Compare against a normal bomb blast at the same distance (150px)
    const bombRef = addTestEnemy(1000, 1150, 1000);
    srv.triggerHammerExplosion(1000, 1000, p, p.hammer);
    const fullBombDamageAt150 = 1000 - bombRef.hp;

    p.hammer.x = 2190;
    p.hammer.y = 2100;
    p.hammer.vx = 550;
    p.hammer.vy = 0;
    srv.stepWorldPhysics(0.016);

    const thorBlastDamageAt150 = 1000 - e2.hp;
    assert.ok(e1.hp < 1000, 'Directly hit enemy takes Thor blast + impact damage');
    assert.ok(thorBlastDamageAt150 > 0, 'Enemy within 1/2 blast radius (210px) takes blast damage');
    assert.ok(
      thorBlastDamageAt150 <= Math.ceil(fullBombDamageAt150 * 0.5),
      'Thor blast deals at most 1/2 the damage of a normal bomb'
    );
    assert.equal(e3.hp, 1000, 'Enemy outside 1/2 blast radius (300px > 210px) is unharmed');

    // Hitting another enemy later while thorTimer > 0 triggers another Thor explosion
    const e4 = addTestEnemy(2300, 2100, 1000);
    p.hammer.x = 2290;
    p.hammer.y = 2100;
    p.hammer.vx = 550;
    p.hammer.vy = 0;
    srv.stepWorldPhysics(0.016);
    assert.ok(e4.hp < 1000);

    // Thor hammer expires after 120s
    p.hammer.thorTimer = 0.01;
    srv.stepPlayerPhysics(p, 0.05);
    assert.equal(p.hammer.thorTimer, 0);
  });

  it('Bulldozer mode grants 20s invincibility, crushes zombies, cannot move fixed stone columns, and blocks other pickups', () => {
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

    // Stone columns are fixed in location and cannot be moved by bulldozer
    const col = srv.stoneColumns[0];
    const origColX = col.x;
    const origColY = col.y;
    p.x = col.x - (p.radius + col.radius - 8);
    p.y = col.y;
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(col.x, origColX, 'Stone column X should remain fixed');
    assert.equal(col.y, origColY, 'Stone column Y should remain fixed');
    assert.ok(Math.hypot(p.x - col.x, p.y - col.y) >= p.radius + col.radius - 0.01);
  });
});

describe('Enemy Production Scaling (>2 Players) & Cooperative Victory Mode', () => {
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

  it('keeps players cooperative (separating without damage) and continues round when 1 survivor remains', () => {
    const p1 = addTestPlayer('p1', 1500, 1500);
    const p2 = addTestPlayer('p2', 1510, 1500);
    const p3 = addTestPlayer('p3', 1900, 1500);
    const p4 = addTestPlayer('p4', 2100, 1500);

    // Players colliding should separate without taking damage
    srv.tickServer(0.016);
    assert.equal(p1.hp, p1.maxHp);
    assert.equal(p2.hp, p2.maxHp);
    assert.ok(Math.hypot(p2.x - p1.x, p2.y - p1.y) >= p1.radius + p2.radius - 0.01);

    // If 3 players fall, the round continues in cooperative mode while 1 survivor remains
    p2.alive = false;
    p3.alive = false;
    p4.alive = false;
    srv.tickServer(0.016);
    assert.equal(srv.getState().roundState, 'playing');

    // Cooperative victory triggers via triggerCoopVictory
    p1.kills = 1001;
    srv.setState({ teamKills: 1001 });
    srv.triggerCoopVictory();
    assert.equal(srv.getState().roundState, 'victory');
    assert.equal(srv.getState().victoryInfo.championName, p1.name);
  });

  it('prunes idle players after timeout', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    p.lastActivityTime = Date.now() - 125000; // > 120s idle
    srv.tickServer(0.016);
    assert.equal(srv.players.size, 0);
  });

  it('maintains broadphase AABB bounds and handles 5-player 9-link 2-hammer chain collisions against 54 enemies', () => {
    const coords = [
      [800, 800],
      [3400, 800],
      [2100, 2100],
      [800, 3400],
      [3400, 3400],
    ];
    const testPlayers = coords.map(([x, y], idx) => {
      const p = addTestPlayer(`p${idx + 1}`, x, y);
      const h2 = srv.createPlayerHammer(p, Math.PI);
      h2.extraTimer = srv.EXTRA_HAMMER_DURATION;
      p.hammers.push(h2);
      for (const h of p.hammers) {
        h.chainLinks = srv.MAX_CHAIN_LINKS;
        srv.initHammerChainNodes(p, h);
      }
      return p;
    });

    // Spawn 54 enemies across the map, including one overlapping p1's internal chain node
    const p1 = testPlayers[0];
    const midNode = p1.hammers[0].chainNodes[4];
    midNode.vx = 450;
    midNode.vy = 0;
    const chainTargetEnemy = addTestEnemy(midNode.x + 8, midNode.y, 300);

    for (let i = 1; i < 54; i++) {
      addTestEnemy(400 + (i * 67) % 3400, 400 + ((i * 131) % 3400), 200);
    }
    assert.equal(srv.enemies.length, 54);

    srv.stepWorldPhysics(0.016);

    for (const p of testPlayers) {
      assert.ok(Number.isFinite(p.reachMinX) && Number.isFinite(p.reachMaxX));
      assert.ok(Number.isFinite(p.reachMinY) && Number.isFinite(p.reachMaxY));
      assert.ok(p.reachMinX < p.x && p.reachMaxX > p.x);
      assert.ok(p.reachMinY < p.y && p.reachMaxY > p.y);
      for (const h of p.hammers) {
        assert.ok(Number.isFinite(h.chainMinX) && Number.isFinite(h.chainMaxX));
        assert.ok(Number.isFinite(h.chainMinY) && Number.isFinite(h.chainMaxY));
      }
    }

    assert.ok(
      chainTargetEnemy.hp < 300 || chainTargetEnemy.vx > 0,
      'Enemy overlapping internal chain node should be pushed/damaged'
    );

    p1.speedMultiplier = 1.1576;
    p1.tractionMultiplier = 1.1025;
    const payload = srv.buildGameStatePayload();
    const serializedP1 = payload.players.find((pl) => pl.id === 'p1');
    assert.equal(serializedP1.speedMultiplier, 1.1576);
    assert.equal(serializedP1.tractionMultiplier, 1.1025);

    // Even with 2 heavy 9-link hammers pulling West, mouse steering East moves p1 East toward the mouse
    p1.x = 2100;
    p1.y = 2100;
    p1.vx = 0;
    p1.vy = 0;
    p1.angle = 0;
    p1.input.mouseWorldX = 2500;
    p1.input.mouseWorldY = 2100;
    for (const h of p1.hammers) {
      h.mass = 15.0; // After many weight pickups
      h.x = 1850;    // Pulling strongly West (-X)
      h.y = 2100;
      h.vx = -300;
      h.vy = 0;
      srv.initHammerChainNodes(p1, h);
    }
    for (let step = 0; step < 30; step++) {
      srv.stepPlayerPhysics(p1, 0.016 / srv.PHYSICS_SUBSTEPS);
    }
    assert.ok(p1.vx > 0 && p1.x > 2100, 'Warrior should move East toward mouse despite heavy hammers pulling West');
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
    const smallPayload = { type: 'input', mouseWorldX: 2100, mouseWorldY: 2100, active: true };
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

  it('persists leaderboard scores to disk, merges existing disk records without data loss, and never overwrites production leaderboard.json during tests', () => {
    assert.equal(
      srv.getLeaderboardFilePath(),
      null,
      'Unit test imports should default leaderboardFilePath to null so leaderboard.json is not overwritten'
    );

    const tmpFile = path.join(os.tmpdir(), `hammertime-leaderboard-test-${process.pid}-${Date.now()}.json`);
    try {
      // Seed an existing high score on disk before the server records new scores
      fs.writeFileSync(
        tmpFile,
        JSON.stringify({
          updatedAt: new Date().toISOString(),
          entries: [{ rank: 1, name: 'Sir Lancelot', kills: 45, color: '#63b3ed', updatedAt: 1000 }],
        }),
        'utf8'
      );

      srv.setLeaderboardFilePath(tmpFile);
      const p = addTestPlayer('p_disk', 2100, 2100);
      srv.setPlayerNickname(p, 'Lady Guinevere');
      for (let i = 0; i < 12; i++) {
        addTestEnemy(2200, 2100, 50);
        srv.defeatEnemy(srv.enemies.length - 1, p);
      }

      assert.ok(fs.existsSync(tmpFile), 'Expected leaderboard JSON file to be written to disk');
      const savedDisk = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
      assert.equal(savedDisk.entries.length, 2);
      assert.equal(savedDisk.entries[0].name, 'Sir Lancelot');
      assert.equal(savedDisk.entries[0].kills, 45);
      assert.equal(savedDisk.entries[1].name, 'Lady Guinevere');
      assert.equal(savedDisk.entries[1].kills, 12);

      // Simulate server restart: clear in-memory map and reload from disk
      srv.clearLeaderboard();
      assert.equal(srv.leaderboardRecords.size, 0);
      const reloaded = srv.loadLeaderboardFromFile(tmpFile);
      assert.equal(reloaded.length, 2);
      assert.equal(reloaded[0].name, 'Sir Lancelot');
      assert.equal(reloaded[0].kills, 45);
      assert.equal(reloaded[1].name, 'Lady Guinevere');
      assert.equal(reloaded[1].kills, 12);
    } finally {
      srv.setLeaderboardFilePath(null);
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
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

describe('Adaptive Server Simulation Fidelity Under Load', () => {
  beforeEach(() => {
    resetTestWorld();
  });

  it('steps down PHYSICS_SUBSTEPS (4 -> 2) and CHAIN_RELAX_ITERS (10 -> 5) under load and recovers when tick time drops', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    p.input.mouseWorldX = 2400;
    p.input.mouseWorldY = 2200;
    addTestEnemy(2200, 2100, 100);

    // Initially at full simulation fidelity
    let state = srv.getState();
    assert.equal(state.activePhysicsSubsteps, 4);
    assert.equal(state.activeChainRelaxIters, 10);
    assert.equal(state.isReducedFidelity, false);

    // Simulate sustained high tick duration (> 10ms budget threshold)
    for (let i = 0; i < 8; i++) {
      srv.updateServerSimulationFidelity(14.5);
    }

    state = srv.getState();
    assert.equal(state.isReducedFidelity, true);
    assert.equal(state.activePhysicsSubsteps, srv.LOW_LOAD_PHYSICS_SUBSTEPS);
    assert.equal(state.activePhysicsSubsteps, 2);
    assert.equal(state.activeChainRelaxIters, srv.LOW_LOAD_CHAIN_RELAX_ITERS);
    assert.equal(state.activeChainRelaxIters, 5);

    // Stepping the server under reduced fidelity still advances simulation cleanly
    srv.tickServer(1 / 60);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    assert.ok(Number.isFinite(p.hammer.x) && Number.isFinite(p.hammer.y));

    // Hysteresis: moderate tick time (e.g. 8ms, between 6.5ms and 10ms) keeps reduced fidelity to prevent oscillation
    srv.setState({ avgTickMs: 8.0 });
    srv.updateServerSimulationFidelity(8.0);
    assert.equal(srv.getState().isReducedFidelity, true);
    assert.equal(srv.getState().activePhysicsSubsteps, 2);

    // Recovery: sustained fast ticks (< 6.5ms) restore full simulation fidelity (4 substeps, 10 relax iterations)
    for (let i = 0; i < 15; i++) {
      srv.updateServerSimulationFidelity(2.5);
    }

    state = srv.getState();
    assert.equal(state.isReducedFidelity, false);
    assert.equal(state.activePhysicsSubsteps, srv.PHYSICS_SUBSTEPS);
    assert.equal(state.activePhysicsSubsteps, 4);
    assert.equal(state.activeChainRelaxIters, srv.CHAIN_RELAX_ITERS);
    assert.equal(state.activeChainRelaxIters, 10);
  });
});
