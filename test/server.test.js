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
    assert.deepEqual([...srv.ZOMBIE_ATTACK_VARIATIONS], ['normal', 'heavy', 'fast']);
    assert.deepEqual([...srv.HURT_SOUNDS], ['normal', 'heavy', 'fast']);
    assert.deepEqual([...srv.HURT_NOISES], ['normal', 'heavy', 'fast']);
    const sampledSounds = new Set();
    for (let i = 0; i < 100; i++) {
      const s = srv.getRandomZombieAttackVariation();
      assert.ok(srv.ZOMBIE_ATTACK_VARIATIONS.includes(s));
      sampledSounds.add(s);
    }
    assert.equal(sampledSounds.size, 3);
    assert.equal(srv.TIME_GAP_RESET_SECONDS, 30);
    assert.equal(srv.WHIRLWIND_MIN_ANGULAR_SPEED, 6);
    assert.equal(srv.WHIRLWIND_CHARGE_DURATION, 6.0);
    assert.equal(srv.WHIRLWIND_REACH_MULT, 1.15);
    assert.equal(srv.WHIRLWIND_GUST_RADIUS, 140);
    assert.equal(srv.WHIRLWIND_GUST_DAMAGE, 80);
    assert.equal(srv.WHIRLWIND_LEVEL_DURATION, 4.0);
    assert.equal(srv.WHIRLWIND_MAX_LEVEL, 5);
    assert.deepEqual(srv.WHIRLWIND_LEVEL_DAMAGES, [0, 80, 200, 360, 560, 800]);
    assert.deepEqual(srv.WHIRLWIND_LEVEL_RADII, [0, 140, 180, 220, 260, 300]);
    assert.deepEqual(srv.STARTING_POWERUP_COUNTS, [4, 6, 8, 10, 12, 16]);
    assert.equal(srv.STARTING_POWERUP_RING_RADIUS, 110);
    assert.equal(srv.ARMORED_MOB_FIRST_MILESTONE, 50);
    assert.equal(srv.ARMORED_MOB_INTERVAL, 50);
    assert.equal(srv.ARMORED_MOB_BASE_SIZE, 6);
    assert.equal(srv.ARMORED_MOB_MAX_SIZE, 12);
    assert.equal(srv.ARMORED_MOB_SPEED_MULT, 1.5);
    assert.equal(srv.ARMORED_MOB_HP_MULT, 4.0);
    assert.equal(srv.HIT_STOP_DURATION, 0.030);
    assert.equal(srv.HIT_STOP_DAMAGE_THRESHOLD, 350);
    assert.equal(srv.HIT_STOP_BIG_SHAKE_THRESHOLD, 425);
    assert.equal(srv.MULTI_KILL_WINDOW, 0.35);
    assert.equal(srv.MOTORCYCLE_SPAWN_INTERVAL, 20);
    assert.equal(srv.MOTORCYCLE_WRECK_DURATION, 5.0);
    assert.equal(srv.MOTORCYCLE_WRECK_SCALE, 1.2);
    assert.equal(srv.MOTORCYCLE_WRECK_RADIUS, 25);
    assert.equal(srv.MOTORCYCLE_MOUNT_RADIUS, 30);
    assert.deepEqual(srv.ALL_LIMBS, ['left_arm', 'right_arm', 'left_leg', 'right_leg', 'head']);
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
    assert.equal(srv.DISCO_HAMMER_DURATION, 30.0);
    assert.equal(srv.ZOMBIE_DANCE_DURATION, 30.0);
    assert.equal(srv.ZOMBIE_DANCE_IMMUNE_DURATION, 45.0);
    assert.equal(srv.JACKOLANTERN_HAMMER_DURATION, 30.0);
    assert.equal(srv.SPIDER_HAMMER_DURATION, 30.0);
    assert.equal(srv.THOR_HAMMER_DURATION, 60.0);
    assert.equal(srv.THOR_EXPLOSION_RADIUS, srv.EXPLOSION_RADIUS * 0.5);
    assert.equal(srv.THOR_BLAST_DAMAGE_MULT, 0.5);
    assert.equal(srv.ZOMBIE_WEB_DURATION, 30.0);
    assert.equal(srv.BULLDOZER_DURATION, 20.0);
    assert.equal(srv.BULLDOZER_SCALE, 1.4);
    assert.equal(srv.BULLDOZER_RADIUS, 48);
    assert.equal(srv.HORSE_RADIUS, 35);
    assert.equal(srv.TORTOISE_RADIUS, 36);
    assert.equal(srv.ELEPHANT_RADIUS, 45);
    assert.equal(srv.EARTHQUAKE_DURATION, 4.0);
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

  it('turns around quickly toward mouse behind warrior without backward lag or wrong-way overshoot', () => {
    const p = addTestPlayer('p1', 1500, 1500);
    p.angle = 0; // Facing East
    p.vx = 200;  // Running East
    p.vy = 0;
    p.input.mouseWorldX = 1100; // Directly West (180 degrees behind)
    p.input.mouseWorldY = 1500;

    const startX = p.x;
    let maxX = startX;

    // Step physics for 0.2s (12 substeps of ~0.016s)
    for (let i = 0; i < 12; i++) {
      srv.stepPlayerPhysics(p, 1 / 60);
      if (p.x > maxX) maxX = p.x;
    }

    // Wrong-way overshoot East should be small (< 10px instead of > 50px)
    assert.ok(maxX - startX < 10, `Overshoot should be < 10px, was ${maxX - startX}`);
    // Warrior should be facing toward West (angle magnitude > PI/2)
    assert.ok(Math.abs(p.angle) > Math.PI * 0.5, 'Warrior should face toward West');
    // Warrior vx should be negative (moving West toward mouse)
    assert.ok(p.vx < 0, `Warrior vx should be negative toward mouse, was ${p.vx}`);
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

  it('drops 3 of each kind of powerup spread around the center of the map via spawnCheatPowerups', () => {
    srv.blackCircles.length = 0;
    const spawned = srv.spawnCheatPowerups();
    assert.equal(spawned.length, 51);
    assert.equal(srv.blackCircles.length, 51);

    const counts = {};
    for (const type of srv.ALL_POWERUP_TYPES) {
      counts[type] = 0;
    }
    assert.equal(srv.ALL_POWERUP_TYPES.length, 17);

    const centerX = srv.WORLD_WIDTH / 2;
    const centerY = srv.WORLD_HEIGHT / 2;

    for (const pk of spawned) {
      assert.ok(pk.type in counts, `Unknown pickup type: ${pk.type}`);
      counts[pk.type]++;
      const distFromCenter = Math.hypot(pk.x - centerX, pk.y - centerY);
      assert.ok(
        distFromCenter >= 100 && distFromCenter <= 350,
        `Distance ${distFromCenter} not spread around center`
      );
    }

    for (const [type, count] of Object.entries(counts)) {
      assert.equal(count, 3, `Expected 3 of type ${type}, got ${count}`);
    }
  });

  it('emits enemy_die event with ghost velocity using 0.8064 of enemy mass (reduced another 30%) and hammer momentum on hammer strike, and 0 velocity on other effects', () => {
    const p = addTestPlayer('p1', 2000, 2000);
    const hammer = p.hammer;
    hammer.mass = 1.0;
    const e1 = addTestEnemy(2050, 2000, 10);
    e1.mass = 1.5;

    // 1. Defeated by hammer strike with hammer velocity (400, -300)
    srv.getState().pendingEvents.length = 0;
    srv.defeatEnemy(srv.enemies.length - 1, p, hammer, 400, -300);

    const events = srv.getState().pendingEvents;
    const dieEv1 = events.find((ev) => ev.type === 'enemy_die');
    assert.ok(dieEv1, 'Expected enemy_die event');

    // Expected ghost velocity:
    // ghostMass = 1.5 * 0.8064 = 1.2096
    // ghostVx = (1.0 * 400) / 1.2096 = 330.7
    // ghostVy = (1.0 * -300) / 1.2096 = -248.0
    const expectedVx = Math.round(((1.0 * 400) / 1.2096) * 10) / 10;
    const expectedVy = Math.round(((1.0 * -300) / 1.2096) * 10) / 10;
    assert.equal(dieEv1.vx, expectedVx);
    assert.equal(dieEv1.vy, expectedVy);

    // 2. Defeated by other effects (no killer hammer passed)
    const e2 = addTestEnemy(2100, 2100, 10);
    srv.getState().pendingEvents.length = 0;
    srv.defeatEnemy(srv.enemies.length - 1, p);
    const dieEv2 = srv.getState().pendingEvents.find((ev) => ev.type === 'enemy_die');
    assert.ok(dieEv2, 'Expected enemy_die event for other effect');
    assert.equal(dieEv2.vx, 0);
    assert.equal(dieEv2.vy, 0);
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
    assert.equal(p.radius, 35);

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
    assert.equal(p.radius, 36);

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
    assert.equal(p.radius, 45);

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

    // War Elephant deals 40 hitpoints of damage and pushes back enemies, while the elephant itself also takes damage
    assert.equal(srv.ELEPHANT_DAMAGE, 40);
    p.x = 2100;
    p.y = 2100;
    p.vx = 0;
    p.vy = 0;
    p.mountHp = 250;
    p.hammer.x = 1800;
    p.hammer.y = 2100;
    srv.initHammerChainNodes(p, p.hammer);
    srv.updatePlayerBroadphaseBounds(p);
    const eTrample = addTestEnemy(p.x + 40, p.y, 100);
    eTrample.contactDamage = 6;
    eTrample.contactCooldown = 0;
    srv.stepWorldPhysics(0.016);
    assert.equal(eTrample.hp, 60, 'Elephant deals 40 hitpoints of damage to enemy on contact');
    assert.equal(p.mountHp, 244, 'Elephant itself also takes contact damage from enemy');
    assert.ok(eTrample.x > p.x + p.radius + eTrample.radius, 'Elephant pushes enemy back on contact');
    assert.ok(eTrample.vx > 0, 'Enemy receives pushback velocity away from elephant');
  });

  it('triggers Earthquake (4s quake + 5s zombie knockdown) and immobilizes all existing and newly spawned enemies', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    const e = addTestEnemy(2400, 2100, 100);
    e.vx = 100;
    e.vy = 50;

    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'earthquake' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(srv.getState().earthquakeTimer, srv.EARTHQUAKE_DURATION);
    assert.equal(srv.EARTHQUAKE_DURATION, 4.0);
    assert.equal(e.knockdownTimer, srv.ZOMBIE_KNOCKDOWN_RECOVERY);
    assert.equal(e.vx, 0);
    assert.equal(e.vy, 0);

    // Newly spawned regular, armored mob, and motorcycle enemies during active quake are knocked down and never move
    srv.spawnEnemy(true);
    const eSpawnedDuringQuake = srv.enemies[srv.enemies.length - 1];
    const [eMobDuringQuake] = srv.spawnArmoredMob(2);
    const eMotoDuringQuake = srv.spawnMotorcycleZombie();
    assert.ok(eSpawnedDuringQuake.knockdownTimer > 0, 'Regular enemy spawned during quake is knocked down');
    assert.ok(eMobDuringQuake.knockdownTimer > 0, 'Armored mob enemy spawned during quake is knocked down');
    assert.ok(eMotoDuringQuake.knockdownTimer > 0, 'Motorcycle enemy spawned during quake is knocked down');

    const origX = eSpawnedDuringQuake.x;
    const origY = eSpawnedDuringQuake.y;
    const origMobX = eMobDuringQuake.x;
    const origMobY = eMobDuringQuake.y;
    const origMotoX = eMotoDuringQuake.x;
    const origMotoY = eMotoDuringQuake.y;

    // During quake, enemies remain knocked down and completely motionless
    srv.stepWorldPhysics(1.0);
    assert.ok(srv.getState().earthquakeTimer > 2.9);
    assert.equal(e.knockdownTimer, srv.ZOMBIE_KNOCKDOWN_RECOVERY);
    assert.equal(e.vx, 0);
    assert.equal(e.vy, 0);
    assert.equal(eSpawnedDuringQuake.x, origX);
    assert.equal(eSpawnedDuringQuake.y, origY);
    assert.equal(eSpawnedDuringQuake.vx, 0);
    assert.equal(eSpawnedDuringQuake.vy, 0);
    assert.equal(eMobDuringQuake.x, origMobX);
    assert.equal(eMobDuringQuake.y, origMobY);
    assert.equal(eMotoDuringQuake.x, origMotoX);
    assert.equal(eMotoDuringQuake.y, origMotoY);

    // Advance past the 4s tremor into the 5s knockdown recovery phase
    srv.stepWorldPhysics(3.1);
    assert.equal(srv.getState().earthquakeTimer, 0);
    assert.ok(srv.getState().earthquakeKnockdownTimer > 4.5);

    // Newly spawned enemy during the knockdown recovery window also spawns knocked down and never moves while lying down
    srv.spawnEnemy(true);
    const eSpawnedInRecovery = srv.enemies[srv.enemies.length - 1];
    assert.ok(eSpawnedInRecovery.knockdownTimer > 0, 'Enemy spawned during knockdown recovery is knocked down');
    const recX = eSpawnedInRecovery.x;
    const recY = eSpawnedInRecovery.y;
    srv.stepWorldPhysics(0.5);
    assert.equal(eSpawnedInRecovery.x, recX);
    assert.equal(eSpawnedInRecovery.y, recY);
    assert.equal(eSpawnedInRecovery.vx, 0);
    assert.equal(eSpawnedInRecovery.vy, 0);
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
    assert.ok(p.hammer.discoTimer > 29.9 && p.hammer.discoTimer <= 30);

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

  it('Jack-o-Lantern Hammer lasts 30s, deals normal impact damage, and always sets fire to enemies', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'jackolantern' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.ok(p.hammer.jackolanternTimer > 29.9 && p.hammer.jackolanternTimer <= 30);

    const e = addTestEnemy(2200, 2100, 200);
    p.hammer.x = 2190;
    p.hammer.y = 2100;
    p.hammer.vx = 600;
    p.hammer.vy = 0;

    srv.stepWorldPhysics(0.016);
    assert.ok(e.hp < 200, 'Jack-o-lantern hammer should deal normal impact damage');
    assert.ok(e.burnTimer > 9.9, 'Jack-o-lantern hammer should ignite the hit enemy');

    // Hitting another enemy (even one with fireproofTimer > 0) also sets it on fire without consuming charges
    const e2 = addTestEnemy(2200, 2250, 250);
    e2.fireproofTimer = 4.0;
    p.hammer.x = 2190;
    p.hammer.y = 2250;
    p.hammer.vx = 600;
    p.hammer.vy = 0;
    srv.stepWorldPhysics(0.016);
    assert.equal(e2.fireproofTimer, 0);
    assert.ok(e2.burnTimer > 9.9, 'Jack-o-lantern hammer should always set fire to enemies');
  });

  it('Spider Hammer lasts 30s, deals normal damage, and wraps zombies in white webbing for 30s so they cannot move', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'spider' });
    srv.stepPlayerPhysics(p, 0.016);
    assert.equal(p.hammer.isSpider, true);
    assert.ok(p.hammer.spiderTimer > 29.9 && p.hammer.spiderTimer <= 30);

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

  it('Bulldozer mode grants 20s invincibility, deals 300 damage and pushes enemies back (2x) to hit them again, cannot move fixed stone columns, and blocks other pickups', () => {
    const p = addTestPlayer('p1', 2100, 2100);
    // Place bulldozer pickup and a speed pickup at the same spot
    srv.blackCircles.push({ id: 1, x: p.x, y: p.y, radius: 10, type: 'speed' });
    srv.blackCircles.push({ id: 2, x: p.x, y: p.y, radius: 10, type: 'bulldozer' });
    srv.stepPlayerPhysics(p, 0.016);

    assert.ok(p.bulldozerTimer > 19.9);
    assert.equal(p.radius, srv.BULLDOZER_RADIUS);
    assert.equal(srv.BULLDOZER_DAMAGE, 300);
    // Same-tick pickup guard prevented picking up the speed powerup
    assert.equal(p.speedMultiplier, 1.0);
    assert.equal(srv.blackCircles.length, 1);

    // Invulnerable to damage while bulldozer
    assert.equal(srv.applyDamageToPlayer(p, 999), false);
    assert.equal(p.hp, 100);

    // Deals 300 damage and pushes a 400-HP zombie back (2x pushback) so the bulldozer will soon hit it again
    p.hammer.x = 1800;
    p.hammer.y = 2100;
    const e = addTestEnemy(p.x + 20, p.y, 400);
    srv.stepWorldPhysics(0.016);
    assert.equal(srv.enemies.includes(e), true, '400-HP enemy survives first 300-damage bulldozer hit');
    assert.equal(e.hp, 100, 'Bulldozer deals 300 points of damage (doubled)');
    assert.ok(e.x > p.x + p.radius + e.radius, 'Enemy is pushed back in front of the bulldozer');
    assert.ok(e.vx > 200, 'Enemy has doubled knockback velocity away from the bulldozer');
    assert.equal(p.kills, 0);

    // As the bulldozer continues forward, the bulldozer soon hits the enemy again and defeats it
    p.angle = 0;
    p.input.mouseWorldX = p.x + 500;
    p.input.mouseWorldY = p.y;
    for (let step = 0; step < 40 && srv.enemies.includes(e); step++) {
      srv.stepPlayerPhysics(p, 0.033);
      p.hammer.x = p.x - 200;
      p.hammer.y = p.y;
      srv.updatePlayerBroadphaseBounds(p);
      srv.stepWorldPhysics(0.033);
    }
    assert.equal(srv.enemies.includes(e), false, 'Bulldozer soon hits the pushed-back enemy again and defeats it');
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

  it('resets game world when time gap exceeds 30 seconds', () => {
    resetTestWorld();
    assert.equal(srv.TIME_GAP_RESET_SECONDS, 30);

    // 1. tickServer resets world if dt exceeds 30 seconds
    const e1 = addTestEnemy(2150, 2100, 100);
    srv.tickServer(35); // dt > 30s
    assert.equal(srv.getState().roundState, 'playing');
    assert.equal(srv.enemies.includes(e1), false, 'Old enemy should be wiped on time gap reset');
    assert.equal(srv.enemies.length, srv.INITIAL_ENEMY_COUNT);

    // 2. checkTimeGap resets world if lastEmptyTime was > 30 seconds ago
    const oldEnemy = srv.enemies[0];
    srv.setLastEmptyTime(Date.now() - 35000); // 35 seconds ago
    const didReset = srv.checkTimeGap(Date.now());
    assert.equal(didReset, true);
    assert.equal(srv.enemies.includes(oldEnemy), false, 'Old enemy should be replaced with fresh enemies');
    assert.equal(srv.getLastEmptyTime(), null);

    // 3. checkTimeGap does NOT reset if under 30 seconds
    const currentEnemy = srv.enemies[0];
    srv.setLastEmptyTime(Date.now() - 10000); // 10 seconds ago
    const didResetRecent = srv.checkTimeGap(Date.now());
    assert.equal(didResetRecent, false);
    assert.equal(srv.enemies.includes(currentEnemy), true);
  });

  it('emits player_hurt event with random hurt sound when warrior takes contact damage', () => {
    resetTestWorld();
    const p = addTestPlayer('p1', 2100, 2100);
    const e = addTestEnemy(2110, 2100, 100);
    e.contactCooldown = 0;
    srv.stepWorldPhysics(0.016);
    const hurtEvents = srv.getState().pendingEvents.filter((ev) => ev.type === 'player_hurt');
    assert.ok(hurtEvents.length > 0);
    assert.ok(srv.HURT_SOUNDS.includes(hurtEvents[0].sound));
    assert.ok(srv.HURT_NOISES.includes(hurtEvents[0].noise));
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

  it('detects continuous collision and impacts enemies at every point along the length of the chain between nodes', () => {
    srv.enemies.length = 0;
    srv.players.clear();
    srv.setState({ pendingEvents: [] });

    const p = addTestPlayer('p_chain', 2000, 2000);
    p.vx = 0;
    p.vy = 200;
    const h = p.hammer;
    h.chainLinks = 2;
    h.mass = 4.0;
    h.x = 2200;
    h.y = 2000;
    h.vx = 0;
    h.vy = 200;

    // Node 0 at (2000, 2000), Node 1 at (2100, 2000), Node 2 at (2200, 2000)
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

    srv.updatePlayerBroadphaseBounds(p);

    // Place an enemy halfway between Node 0 and Node 1 at x = 2050.
    // Distance from enemy to Node 0 is ~52 > 25.5 (NO discrete node collision).
    // Distance from enemy to Node 1 is ~52 > 25.5 (NO discrete node collision).
    // Distance to the line segment between Node 0 and Node 1 is 15 <= 25.5.
    const enemy = addTestEnemy(2050, 2015, 100);
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.mass = 1.0;

    srv.stepWorldPhysics(0.016);

    // Verify the chain impacted the enemy along the segment
    assert.ok(enemy.hp < 100, `Enemy between chain nodes should take damage, hp was: ${enemy.hp}`);
    assert.ok(enemy.vy > 0, `Enemy should receive downward impulse from moving chain, vy was: ${enemy.vy}`);

    const impactEv = srv.getState().pendingEvents.find((ev) => ev.type === 'impact' && ev.isChain);
    assert.ok(impactEv, 'Should emit an impact event with isChain: true');
    assert.ok(
      Math.abs(impactEv.x - 2050) < 5,
      `Impact point x should be ~2050 along the chain segment, got: ${impactEv.x}`
    );
    assert.ok(
      Math.abs(impactEv.y - 2000) < 5,
      `Impact point y should be ~2000 along the chain segment, got: ${impactEv.y}`
    );
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

  it('flushes leaderboard to disk and closes open sockets on gracefulShutdown during scale-to-zero SIGTERM', () => {
    const tmpFile = path.join(__dirname, `test-shutdown-lb-${Date.now()}.json`);
    srv.setLeaderboardFilePath(tmpFile);
    try {
      srv.clearLeaderboard();
      srv.recordLeaderboardKillScore('ScaleToZeroKnight', 77);

      let socketDestroyed = false;
      const p = addTestPlayer('p1', 2100, 2100);
      p.ws = {
        destroyed: false,
        destroy() {
          this.destroyed = true;
          socketDestroyed = true;
        },
      };

      let callbackCalled = false;
      srv.gracefulShutdown(() => {
        callbackCalled = true;
      });

      assert.equal(callbackCalled, true);
      assert.equal(socketDestroyed, true);
      assert.equal(fs.existsSync(tmpFile), true);
      const data = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
      assert.equal(data.entries.length, 1);
      assert.equal(data.entries[0].name, 'ScaleToZeroKnight');
      assert.equal(data.entries[0].kills, 77);
      assert.equal(srv.LEADERBOARD_SAVE_DEBOUNCE_MS, 10000);
    } finally {
      srv.setLeaderboardFilePath(null);
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  });

  it('persists leaderboard asynchronously via saveLeaderboardToFileAsync without blocking physics loop', async () => {
    const tmpFile = path.join(os.tmpdir(), `hammertime-async-lb-${process.pid}-${Date.now()}.json`);
    try {
      srv.clearLeaderboard();
      srv.recordLeaderboardKillScore('AsyncPaladin', 91);
      const ok = await srv.saveLeaderboardToFileAsync(tmpFile);
      assert.equal(ok, true);
      assert.equal(fs.existsSync(tmpFile), true);
      const parsed = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
      assert.equal(parsed.entries.length, 1);
      assert.equal(parsed.entries[0].name, 'AsyncPaladin');
      assert.equal(parsed.entries[0].kills, 91);
    } finally {
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
    assert.ok(html.includes('document.hidden'));
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

describe('Whirlwind / Momentum Spin-Up and Overdrive', () => {
  beforeEach(() => {
    resetTestWorld();
  });

  it('charges Whirlwind into Overdrive when spinning continuously for >= 6.0s and increments whirlwindLevel every 4s up to 5', () => {
    const p = addTestPlayer('p1', 2000, 2000);
    const h = p.hammer;
    assert.equal(h.whirlwindLevel, 0);
    assert.equal(h.isWhirlwind, false);
    assert.equal(h.spinTimer, 0);

    const baseRest = srv.getChainRestLength(h.chainLinks, h.linkLength);
    const angSpeed = 7.0;
    const dt = 1 / 60;
    let currentAngle = 0;

    function spinFor(seconds) {
      const steps = Math.ceil(seconds / dt);
      for (let s = 0; s < steps; s++) {
        currentAngle += angSpeed * dt;
        h.x = p.x + Math.cos(currentAngle) * baseRest;
        h.y = p.y + Math.sin(currentAngle) * baseRest;
        h.vx = -Math.sin(currentAngle) * baseRest * angSpeed;
        h.vy = Math.cos(currentAngle) * baseRest * angSpeed;
        srv.updateHammerWhirlwind(p, h, dt);
      }
    }

    // Spin for 6.1s -> Level 1
    spinFor(6.1);
    assert.ok(h.spinTimer >= srv.WHIRLWIND_CHARGE_DURATION, 'Spin timer should reach 6.0s duration');
    assert.equal(h.whirlwindLevel, 1, 'Hammer should be at whirlwindLevel 1');
    assert.equal(h.isWhirlwind, true, 'Hammer should enter Overdrive (isWhirlwind = true)');

    // In stepPlayerPhysics, restLength should be expanded by 1.15x (1.10 + 0.05 * 1)
    srv.stepPlayerPhysics(p, dt);
    assert.equal(h.isWhirlwind, true);

    // Spin for another 4s -> Level 2
    spinFor(4.0);
    assert.equal(h.whirlwindLevel, 2, 'Hammer should reach whirlwindLevel 2 after +4s');

    // Spin for another 4s -> Level 3
    spinFor(4.0);
    assert.equal(h.whirlwindLevel, 3, 'Hammer should reach whirlwindLevel 3 after +4s');

    // Spin for another 4s -> Level 4
    spinFor(4.0);
    assert.equal(h.whirlwindLevel, 4, 'Hammer should reach whirlwindLevel 4 after +4s');

    // Spin for another 4s -> Level 5 (max)
    spinFor(4.0);
    assert.equal(h.whirlwindLevel, 5, 'Hammer should reach max whirlwindLevel 5');

    // Spin for another 5s -> capped at 5
    spinFor(5.0);
    assert.equal(h.whirlwindLevel, 5, 'whirlwindLevel should remain capped at 5');

    // When spin ceases, spinTimer decays. After decaying below threshold, whirlwind turns off
    h.spinTimer = 1.0;
    for (let s = 0; s < 60; s++) {
      h.vx = 0;
      h.vy = 0;
      srv.updateHammerWhirlwind(p, h, dt);
    }
    assert.equal(h.isWhirlwind, false, 'Whirlwind overdrive should deactivate when spin ceases');
    assert.equal(h.whirlwindLevel, 0, 'whirlwindLevel should drop to 0 when spin ceases');
    assert.ok(h.spinTimer < 0.5);
  });

  it('triggers Whirlwind gust shockwave scaling with level, and resets whirlwindLevel to 0 on hammer impact', () => {
    const p = addTestPlayer('p1', 2000, 2000);
    const h = p.hammer;
    h.whirlwindLevel = 3;
    h.isWhirlwind = true;
    h.spinTimer = 22.0;

    // Direct target zombie and nearby bystander zombie within 220px gust radius (level 3 radius)
    const eNearby = addTestEnemy(2050, 2000, 500);

    srv.setState({ pendingEvents: [] });
    // Trigger whirlwind gust at hammer location for level 3
    srv.triggerWhirlwindGust(h.x, h.y, p, h);

    const events = srv.getState().pendingEvents;
    const shockwaveEv = events.find((ev) => ev.type === 'shockwave' && ev.kind === 'gust');
    assert.ok(shockwaveEv, 'Should emit shockwave event with kind gust');
    assert.equal(shockwaveEv.radius, srv.WHIRLWIND_LEVEL_RADII[3], 'Shockwave radius should match level 3 radius (220px)');
    assert.equal(shockwaveEv.level, 3, 'Shockwave event should carry level 3');

    const whirlwindText = events.find((ev) => ev.type === 'floating_text' && ev.text === 'WHIRLWIND Lv.3!');
    assert.ok(whirlwindText, 'Should emit WHIRLWIND Lv.3! floating text');

    // Nearby bystander enemy within gust radius should have taken gust damage and impulse
    assert.ok(eNearby.hp < 500, 'Nearby enemy should take gust damage at level 3');
    assert.ok(eNearby.vx > 0, 'Nearby enemy should be pushed away by gust impulse');

    // Test that when the hammer hits an enemy in stepWorldPhysics, whirlwindLevel drops back to 0
    h.x = p.x + 40;
    h.y = p.y;
    h.vx = 500;
    h.vy = 0;
    srv.updatePlayerBroadphaseBounds(p);
    const targetEnemy = addTestEnemy(h.x + 5, h.y, 500);
    h.whirlwindLevel = 4;
    h.isWhirlwind = true;
    h.spinTimer = 32.0;

    srv.setState({ pendingEvents: [] });
    srv.stepWorldPhysics(1 / 60);

    assert.equal(h.whirlwindLevel, 0, 'whirlwindLevel should drop back to 0 on hammer impact');
    assert.equal(h.isWhirlwind, false, 'isWhirlwind should become false on hammer impact');
    assert.equal(h.spinTimer, 0, 'spinTimer should reset to 0 on hammer impact');

    // Test that whirlwind gust killing adjacent low-HP enemies does not cause TypeError in defeatEnemy
    const eDirect = addTestEnemy(h.x + 5, h.y, 10);
    const eSplash = addTestEnemy(h.x + 30, h.y, 10);
    h.x = p.x + 40;
    h.y = p.y;
    h.vx = 500;
    h.vy = 0;
    h.whirlwindLevel = 2;
    h.isWhirlwind = true;
    srv.updatePlayerBroadphaseBounds(p);

    assert.doesNotThrow(() => {
      srv.stepWorldPhysics(1 / 60);
    }, 'stepWorldPhysics should not throw when whirlwind kills enemies');

    // defeatEnemy defensively handles out-of-bounds indices
    assert.doesNotThrow(() => {
      srv.defeatEnemy(9999, p);
    }, 'defeatEnemy should gracefully ignore out-of-bounds index');
  });

  it('sets all enemies affected by whirlwind on fire when hammer hits with flame and whirlwind', () => {
    const p = addTestPlayer('p1', 2000, 2000);
    const h = p.hammer;
    h.x = p.x + 40;
    h.y = p.y;
    h.vx = 400;
    h.vy = 0;
    h.flameCharges = 5;
    h.flameTimer = 5;
    h.whirlwindLevel = 2;
    h.isWhirlwind = true;
    h.spinTimer = 7.0;

    // Enemy directly hit by hammer
    const eDirect = addTestEnemy(h.x + 10, h.y, 100);
    // Bystander enemies within Whirlwind Level 2 radius (180px)
    const eBystander1 = addTestEnemy(h.x + 80, h.y, 100);
    const eBystander2 = addTestEnemy(h.x - 70, h.y, 100);
    // Outside whirlwind radius (e.g. 350px away)
    const eFar = addTestEnemy(h.x + 350, h.y, 100);

    srv.updatePlayerBroadphaseBounds(p);
    srv.stepWorldPhysics(1 / 60);

    // Direct hit enemy should be ignited
    assert.ok(eDirect.burnTimer > 0, 'Direct hit enemy should be ignited with burnTimer > 0');
    // Bystanders inside whirlwind should also be ignited!
    assert.ok(eBystander1.burnTimer > 0, 'Bystander 1 affected by whirlwind gust should be set on fire');
    assert.ok(eBystander2.burnTimer > 0, 'Bystander 2 affected by whirlwind gust should be set on fire');
    // Enemy outside gust should NOT be ignited
    assert.equal(eFar.burnTimer, 0, 'Enemy outside whirlwind radius should not be set on fire');
  });

  it('spawns armored mob of 6 zombies at 50 kills with 4x HP, 1.5x speed, and group cohesion', () => {
    const p1 = addTestPlayer('p1', 2000, 2000);
    srv.enemies.length = 0;
    srv.setState({ teamKills: 0, lastMobSpawnMilestone: 0, pendingEvents: [] });

    // Defeat 49 enemies
    for (let i = 0; i < 49; i++) {
      addTestEnemy(2100, 2000, 10);
      srv.defeatEnemy(srv.enemies.length - 1, p1);
    }
    assert.equal(srv.getState().teamKills, 49);
    assert.ok(!srv.enemies.some((e) => e.variant === 'armored'), 'No armored mob should spawn before 50 kills');

    // 50th kill triggers armored mob spawn of 6
    addTestEnemy(2100, 2000, 10);
    srv.defeatEnemy(srv.enemies.length - 1, p1);
    assert.equal(srv.getState().teamKills, 50);

    const armored = srv.enemies.filter((e) => e.variant === 'armored');
    assert.equal(armored.length, 6, 'Should spawn exactly 6 armored zombies after 50 enemies');

    const first = armored[0];
    assert.equal(first.variant, 'armored');
    assert.equal(first.hp, 300, 'Armored zombie should have 4x normal hitpoints (4 * 75 = 300)');
    assert.equal(first.maxHp, 300);
    assert.equal(first.moveForce, 315, 'Armored zombie should move at 1.5x normal speed (1.5 * 210 = 315)');
    assert.ok(first.mobId, 'Armored zombies should have a mobId');

    // All 6 should share the same mobId and spawn together near each other
    for (const az of armored) {
      assert.equal(az.mobId, first.mobId);
      assert.ok(Math.hypot(az.x - first.x, az.y - first.y) < 120, 'Mob should spawn grouped together');
    }

    // Verify group cohesion in stepWorldPhysics:
    // Keep only p1 in players (remove bot warrior spawned at 30 kills so p1 is the sole target)
    for (const [pid, pl] of srv.players.entries()) {
      if (pl.isBot) srv.players.delete(pid);
    }
    // Place one mob member separated away from the group centroid
    const straggler = armored[0];
    straggler.x = 1000;
    straggler.y = 2000;
    for (let k = 1; k < armored.length; k++) {
      armored[k].x = 2000;
      armored[k].y = 2000;
    }
    p1.x = 1000; // Player is directly at straggler's X
    p1.y = 1500; // Player is North of straggler

    straggler.vx = 0;
    straggler.vy = 0;
    srv.stepWorldPhysics(0.016);

    // Because mob centroid is at (2000, 2000) (East of straggler), straggler should have positive vx pulling toward pack!
    assert.ok(straggler.vx > 0, 'Straggler should steer East toward group centroid to maintain group cohesion');
  });

  it('scales mob size by +1 for every 50 kills after 100 up to limit of 12', () => {
    const p1 = addTestPlayer('p1', 2000, 2000);
    srv.enemies.length = 0;
    srv.setState({ teamKills: 0, lastMobSpawnMilestone: 0 });

    // Milestones and expected mob sizes:
    // 50 -> 6
    // 100 -> 7
    // 150 -> 8
    // 200 -> 9
    // 250 -> 10
    // 300 -> 11
    // 350 -> 12
    // 400 -> 12 (limit of 12)
    const expected = [
      { kills: 50, size: 6 },
      { kills: 100, size: 7 },
      { kills: 150, size: 8 },
      { kills: 200, size: 9 },
      { kills: 250, size: 10 },
      { kills: 300, size: 11 },
      { kills: 350, size: 12 },
      { kills: 400, size: 12 },
      { kills: 450, size: 12 },
    ];

    for (const exp of expected) {
      srv.enemies.length = 0;
      srv.setState({ teamKills: exp.kills - 1, lastMobSpawnMilestone: exp.kills - 50 });

      addTestEnemy(2100, 2000, 10);
      srv.defeatEnemy(srv.enemies.length - 1, p1);

      assert.equal(srv.getState().teamKills, exp.kills);
      const armored = srv.enemies.filter((e) => e.variant === 'armored');
      assert.equal(armored.length, exp.size, `At ${exp.kills} kills, expected mob size ${exp.size}, got ${armored.length}`);
    }
  });

  it('spawns motorcycle zombie every 20 kills with 5x speed, wide turning radius, and dismount on non-fatal hit', () => {
    const p1 = addTestPlayer('p1', 2000, 2000);
    srv.enemies.length = 0;
    srv.setState({ teamKills: 0, lastMotorcycleSpawnMilestone: 0 });

    // 1. Kills 1..19: no motorcycle zombie spawned
    for (let k = 1; k <= 19; k++) {
      addTestEnemy(2100, 2000, 10);
      srv.defeatEnemy(srv.enemies.length - 1, p1);
    }
    assert.equal(srv.getState().teamKills, 19);
    assert.ok(!srv.enemies.some((e) => e.variant === 'motorcycle'), 'No motorcycle zombie before 20 kills');

    // 2. Kill 20: spawns motorcycle zombie
    addTestEnemy(2100, 2000, 10);
    srv.defeatEnemy(srv.enemies.length - 1, p1);
    assert.equal(srv.getState().teamKills, 20);
    const motoZombies = srv.enemies.filter((e) => e.variant === 'motorcycle');
    assert.equal(motoZombies.length, 1, 'Exactly 1 motorcycle zombie spawned at 20 kills');

    const mz = motoZombies[0];
    assert.equal(mz.variant, 'motorcycle');
    // Regular zombie walker has moveForce = 210. Motorcycle zombie is 5x = 1050
    assert.equal(mz.moveForce, 1050, 'Motorcycle zombie moves 5x as fast as regular zombie (5 * 210 = 1050)');
    assert.equal(mz.turnRate, +(1.2 / 0.7).toFixed(4), 'Motorcycle zombie has turnRate for 30% smaller turning radius');

    // 3. Spawns again at 40 kills
    srv.enemies.length = 0;
    srv.setState({ teamKills: 39, lastMotorcycleSpawnMilestone: 20 });
    addTestEnemy(2100, 2000, 10);
    srv.defeatEnemy(srv.enemies.length - 1, p1);
    assert.equal(srv.getState().teamKills, 40);
    assert.equal(srv.enemies.filter((e) => e.variant === 'motorcycle').length, 1, 'Spawns motorcycle zombie at 40 kills');

    // 4. Wide turning radius physics verification (30% reduced turn radius -> turnRate = 1.2 / 0.7):
    // Place a motorcycle zombie pointing East (angle = 0).
    // Place player directly North (targetAngle = -PI/2).
    // Angle difference is PI/2 = 1.5708 rad.
    // In one step (dt = 0.016), turn rate is MOTORCYCLE_TURN_RATE (1.7143 rad/s).
    srv.enemies.length = 0;
    const testMoto = srv.spawnMotorcycleZombie();
    testMoto.x = 2000;
    testMoto.y = 2000;
    testMoto.vx = 0;
    testMoto.vy = 0;
    testMoto.angle = 0; // Pointing East
    p1.x = 2000;
    p1.y = 1500; // Directly North of motorcycle

    const dt = 0.016;
    srv.stepWorldPhysics(dt);

    const expectedMaxTurn = srv.MOTORCYCLE_TURN_RATE * dt;
    assert.ok(
      Math.abs(testMoto.angle) <= expectedMaxTurn + 0.001,
      `Motorcycle angle should turn smoothly by <= ${expectedMaxTurn} rad, actual: ${testMoto.angle}`
    );
    // Acceleration should be directed along vehicle heading (mostly East), not snapped North
    assert.ok(testMoto.vx > 0, 'Motorcycle zombie accelerates forward along its vehicle heading (East)');

    // Compare with regular zombie walker:
    const regularWalker = {
      id: 9999,
      variant: 'walker',
      x: 2000,
      y: 2000,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 19,
      mass: 1.45,
      hp: 75,
      maxHp: 75,
      moveForce: 210,
      traction: 4.6,
      hitCooldown: 0,
      chainHitCooldown: 0,
      contactCooldown: 0,
      walkPhase: 0,
    };
    srv.enemies.push(regularWalker);
    srv.stepWorldPhysics(dt);
    // Regular walker immediately points North (angle ~ -PI/2) and moves North (negative vy)
    assert.ok(regularWalker.vy < 0, 'Regular walker snaps acceleration directly towards player North');

    // 5. Dismount on non-fatal hit:
    // 5. Motorcycle dismount / wreck conditions:
    // A. Injured <= 50% of maxHp: does NOT dismount, does NOT lay down motorcycle
    testMoto.hp = 75;
    testMoto.maxHp = 75;
    srv.laidDownMotorcycles.length = 0;
    srv.setState({ pendingEvents: [] });
    testMoto.hp = 45; // 30 damage <= 50% (37.5) lost
    const dismountMinor = srv.checkMotorcycleDismount(testMoto);
    assert.strictEqual(dismountMinor, false, 'Damage <= 50% should not dismount motorcycle zombie');
    assert.equal(testMoto.variant, 'motorcycle', 'Motorcycle zombie remains mounted when damage <= 50%');
    assert.equal(srv.laidDownMotorcycles.length, 0, 'No motorcycle wreck laid down when damage <= 50%');

    // B. Injured > 50% of maxHp: dismounts to walker and lays down motorcycle for 30s
    testMoto.hp = 30; // 45 damage > 50% (37.5) lost
    const dismounted = srv.checkMotorcycleDismount(testMoto);
    assert.strictEqual(dismounted, true, 'Damage > 50% should dismount motorcycle zombie');
    assert.equal(testMoto.variant, 'walker', 'Motorcycle zombie changes to regular walker zombie');
    assert.equal(testMoto.moveForce, 210, 'Move force resets to regular zombie speed (210)');
    assert.equal(testMoto.radius, 19, 'Radius resets to regular zombie radius (19)');
    assert.equal(testMoto.turnRate, null, 'Turn rate is cleared so it moves like regular zombie');
    assert.equal(testMoto.hp, 30, 'Retains remaining HP');

    const crashEv = srv.getState().pendingEvents.find((e) => e.type === 'floating_text' && e.text === 'CRASH!');
    assert.ok(crashEv, 'Should emit CRASH! floating text on dismount');

    const wreckEv = srv.getState().pendingEvents.find((e) => e.type === 'motorcycle_wreck');
    assert.ok(wreckEv, 'Should emit motorcycle_wreck event on dismount');
    assert.equal(wreckEv.duration, 5.0, 'Motorcycle wreck duration should be 5 seconds');
    assert.equal(wreckEv.radius, 25, 'Laid-down motorcycle radius is 20% larger (25px vs 21px)');
    assert.equal(wreckEv.x, Math.round(testMoto.x));
    assert.equal(wreckEv.y, Math.round(testMoto.y));

    assert.equal(srv.laidDownMotorcycles.length, 1, 'Server tracks laid-down motorcycle');
    assert.equal(srv.laidDownMotorcycles[0].radius, 25, 'Laid-down motorcycle is 20% larger');
    assert.equal(srv.laidDownMotorcycles[0].duration, 5.0);
    assert.equal(srv.laidDownMotorcycles[0].timer, 5.0);

    // After 2.5s of physics, still present
    srv.stepWorldPhysics(2.5);
    assert.equal(srv.laidDownMotorcycles.length, 1, 'Laid-down motorcycle should still be present at 2.5s');
    assert.ok(Math.abs(srv.laidDownMotorcycles[0].timer - 2.5) < 0.001);

    // After another 3.0s (total 5.5s > 5.0s), motorcycle expires and is removed
    srv.stepWorldPhysics(3.0);
    assert.equal(srv.laidDownMotorcycles.length, 0, 'Laid-down motorcycle removed after 5 seconds');

    // C. Fatal hit kills motorcycle zombie and lays down motorcycle for 5 seconds
    const testMotoFatal = srv.spawnMotorcycleZombie();
    testMotoFatal.hp = 0;
    srv.laidDownMotorcycles.length = 0;
    srv.defeatEnemy(testMotoFatal);
    assert.equal(srv.laidDownMotorcycles.length, 1, 'Killed motorcycle zombie lays down motorcycle');
    assert.equal(srv.laidDownMotorcycles[0].duration, 5.0, 'Wreck from defeated motorcycle zombie lasts 5s');

    // D. Warrior claiming laid-down motorcycle as mount
    srv.blackCircles.length = 0;
    const pUnmounted = srv.players.get('p1');
    assert.ok(pUnmounted, 'Player p1 exists');
    pUnmounted.mountType = null;
    pUnmounted.bulldozerTimer = 0;
    pUnmounted.hp = 100;
    const wreck = srv.laidDownMotorcycles[0];
    pUnmounted.x = wreck.x;
    pUnmounted.y = wreck.y;

    srv.setState({ pendingEvents: [] });
    srv.stepPlayerPhysics(pUnmounted, 0.05);

    assert.equal(pUnmounted.mountType, 'motorcycle', 'Touching laid-down motorcycle claims it as mount');
    assert.equal(pUnmounted.mountMaxHp, 100);
    assert.equal(pUnmounted.mountHp, 100);
    assert.equal(pUnmounted.radius, srv.MOTORCYCLE_MOUNT_RADIUS);
    assert.equal(srv.laidDownMotorcycles.length, 0, 'Claimed motorcycle wreck is removed from the ground');

    const claimEv = srv.getState().pendingEvents.find((e) => e.type === 'claim_motorcycle');
    assert.ok(claimEv, 'Emits claim_motorcycle event');

    // E. Warrior already with mount cannot claim another motorcycle
    const wreck2 = srv.spawnMotorcycleWreck(pUnmounted.x, pUnmounted.y, 0, 18);
    assert.equal(srv.laidDownMotorcycles.length, 1);
    srv.stepPlayerPhysics(pUnmounted, 0.05);
    assert.equal(srv.laidDownMotorcycles.length, 1, 'Warrior already on mount cannot claim laid-down motorcycle');

    // F. Warrior riding motorcycle enforces wide minimum turning radius (capped at 1.2 rad/s)
    const motoRider = addTestPlayer('moto-rider', 2000, 2000);
    motoRider.mountType = 'motorcycle';
    motoRider.mountHp = 100;
    motoRider.mountMaxHp = 100;
    motoRider.angle = 0; // Pointing East
    motoRider.vx = 250;
    motoRider.vy = 0;
    // Mouse directly North (targetAngle = -PI/2)
    motoRider.input.mouseWorldX = 2000;
    motoRider.input.mouseWorldY = 1500;

    const motoDt = 0.05;
    srv.stepPlayerPhysics(motoRider, motoDt);

    // Turn rate capped at MOTORCYCLE_TURN_RATE (1.2 rad/s)
    const expectedTurnCap = srv.MOTORCYCLE_TURN_RATE * motoDt; // 0.06 rad
    assert.ok(
      Math.abs(motoRider.angle) <= expectedTurnCap + 1e-4,
      `Motorcycle warrior angle should turn slowly (<= ${expectedTurnCap} rad), actual: ${motoRider.angle}`
    );
    assert.ok(
      motoRider.vx > 0,
      'Motorcycle warrior maintains forward momentum through turn instead of reverse-braking'
    );

    // Contrast with warrior on foot (standard quick turning)
    const footWarrior = addTestPlayer('foot-warrior', 2000, 2000);
    footWarrior.mountType = null;
    footWarrior.angle = 0;
    footWarrior.input.mouseWorldX = 2000;
    footWarrior.input.mouseWorldY = 1500;
    srv.stepPlayerPhysics(footWarrior, motoDt);
    assert.ok(
      Math.abs(footWarrior.angle) > expectedTurnCap * 5,
      'Warrior on foot turns much faster than motorcycle warrior'
    );
  });

  it('handles zombie limb loss at 50% and 75% HP loss, hopping locomotion, and headless circling', () => {
    // 1. Initial state: 0 limbs lost
    const enemy = addTestEnemy(2000, 2000, 200);
    assert.deepEqual(enemy.lostLimbs, [], 'Zombie starts with 0 lost limbs (all 5 intact)');

    // 2. Damage < 50%: no limbs lost
    enemy.hp = 120; // 40% lost
    srv.checkEnemyLimbLoss(enemy, 0, 0);
    assert.equal(enemy.lostLimbs.length, 0, 'No limbs lost before 50% damage');

    // 3. Damage >= 50%: loses 1 random limb
    enemy.hp = 100; // 50% lost
    srv.setState({ pendingEvents: [] });
    srv.checkEnemyLimbLoss(enemy, 100, 50);
    assert.equal(enemy.lostLimbs.length, 1, 'Zombie loses 1 limb at 50% HP loss');
    assert.ok(srv.ALL_LIMBS.includes(enemy.lostLimbs[0]), 'Lost limb must be one of ALL_LIMBS');
    const firstLost = enemy.lostLimbs[0];

    const ev1 = srv.getState().pendingEvents.find((e) => e.type === 'limb_loss');
    assert.ok(ev1, 'Should emit limb_loss event');
    assert.equal(ev1.limb, firstLost);
    assert.equal(ev1.enemyId, enemy.id);

    // 4. Damage >= 75%: loses 2nd random limb
    enemy.hp = 40; // 80% lost (<= 25% remaining)
    srv.setState({ pendingEvents: [] });
    srv.checkEnemyLimbLoss(enemy, 50, -50);
    assert.equal(enemy.lostLimbs.length, 2, 'Zombie loses 2 limbs at 75% HP loss');
    const secondLost = enemy.lostLimbs[1];
    assert.notEqual(firstLost, secondLost, 'Second lost limb must be distinct from first');
    assert.ok(srv.ALL_LIMBS.includes(secondLost));

    const ev2 = srv.getState().pendingEvents.find((e) => e.type === 'limb_loss');
    assert.ok(ev2, 'Should emit second limb_loss event');
    assert.equal(ev2.limb, secondLost);

    // 5. Serialized enemy includes lostLimbs array
    const statePayload = srv.buildGameStatePayload();
    const serializedEnemy = statePayload.enemies.find((e) => e.id === enemy.id);
    assert.ok(serializedEnemy);
    assert.deepEqual(serializedEnemy.lostLimbs, [firstLost, secondLost]);

    // 6. Physics test: Headless zombie wanders in circles rather than chasing player
    const p = addTestPlayer('p1', 2500, 2000); // player to the east
    const headlessZombie = addTestEnemy(2000, 2000, 100);
    headlessZombie.lostLimbs = ['head'];
    headlessZombie.angle = 0;
    headlessZombie.wanderAngle = Math.PI / 2; // facing South
    headlessZombie.vx = 0;
    headlessZombie.vy = 0;
    srv.stepWorldPhysics(0.1);

    // Headless zombie turns according to wanderAngle rather than heading toward player at (2500, 2000)
    assert.ok(headlessZombie.vy > 0, 'Headless zombie should move along wanderAngle (South)');
    assert.ok(headlessZombie.wanderAngle > Math.PI / 2, 'wanderAngle should advance continuously in circles');

    // 7. Physics test: Slower pace for 1 leg vs 2 legs lost
    const zNormal = addTestEnemy(2000, 2000, 100);
    zNormal.lostLimbs = [];
    const zOneLeg = addTestEnemy(2000, 2000, 100);
    zOneLeg.lostLimbs = ['left_leg'];
    const zNoLegs = addTestEnemy(2000, 2000, 100);
    zNoLegs.lostLimbs = ['left_leg', 'right_leg'];

    zNormal.vx = 0; zNormal.vy = 0;
    zOneLeg.vx = 0; zOneLeg.vy = 0;
    zNoLegs.vx = 0; zNoLegs.vy = 0;

    srv.stepWorldPhysics(0.1);

    const speedNormal = Math.hypot(zNormal.vx, zNormal.vy);
    const speedOneLeg = Math.hypot(zOneLeg.vx, zOneLeg.vy);
    const speedNoLegs = Math.hypot(zNoLegs.vx, zNoLegs.vy);

    assert.ok(speedOneLeg < speedNormal, '1 leg lost should move slower than normal');
    assert.ok(speedNoLegs < speedOneLeg, '2 legs lost should hop at a slower pace than 1 leg');
  });
});

describe('Robot Warriors (Server-Controlled Bots) & Mode Cycling', () => {
  beforeEach(() => {
    resetTestWorld();
  });

  it('spawns a maximum of 1 robot warrior when exactly 1 human reaches multiples of 30 kills, and does not spawn when >1 human', () => {
    const p1 = addTestPlayer('p1', 2000, 2000);
    assert.equal(srv.countHumanPlayers(), 1);
    assert.equal(srv.countBotWarriors(), 0);

    // Defeat 29 enemies with human player p1
    for (let k = 1; k <= 29; k++) {
      const e = addTestEnemy(2100, 2000, 10);
      srv.defeatEnemy(srv.enemies.indexOf(e), p1);
      assert.equal(p1.kills, k);
      assert.equal(srv.countBotWarriors(), 0, 'No bot should spawn before reaching 30 kills');
    }

    // 30th kill triggers bot spawn
    const e30 = addTestEnemy(2100, 2000, 10);
    srv.defeatEnemy(srv.enemies.indexOf(e30), p1);
    assert.equal(p1.kills, 30);
    assert.equal(srv.countBotWarriors(), 1, '1st bot warrior should spawn at 30 kills');

    const bots = Array.from(srv.players.values()).filter((p) => p.isBot);
    assert.equal(bots.length, 1);
    const bot1 = bots[0];
    assert.equal(bot1.isBot, true);
    assert.equal(bot1.ws, null);
    assert.ok(bot1.name.endsWith(' (bot)'), `Bot name should end with " (bot)", got: ${bot1.name}`);
    assert.ok(bot1.name.length <= 26);
    assert.ok(bot1.hammer !== null);
    assert.ok(bot1.chainNodes.length >= 2);
    assert.equal(bot1.alive, true);
    assert.equal(bot1.botMode, 'aggressive');

    // 60th kill should NOT spawn a 2nd bot because max is 1
    for (let k = 31; k <= 60; k++) {
      const e = addTestEnemy(2100, 2000, 10);
      srv.defeatEnemy(srv.enemies.indexOf(e), p1);
    }
    assert.equal(p1.kills, 60);
    assert.equal(srv.countBotWarriors(), 1, 'Should not exceed MAX_BOT_WARRIORS (1)');

    // Multiple humans: when >1 human is in the game, reaching multiple of 30 does NOT spawn bot
    srv.players.clear();
    const h1 = addTestPlayer('h1', 1500, 1500);
    const h2 = addTestPlayer('h2', 2500, 2500);
    assert.equal(srv.countHumanPlayers(), 2);
    assert.equal(srv.countBotWarriors(), 0);

    for (let k = 1; k <= 30; k++) {
      const e = addTestEnemy(1600, 1500, 10);
      srv.defeatEnemy(srv.enemies.indexOf(e), h1);
    }
    assert.equal(h1.kills, 30);
    assert.equal(srv.countBotWarriors(), 0, 'Should not spawn bot when there are 2 human players');
  });

  it('never adds robot warriors to the leaderboard regardless of kills or nickname updates', () => {
    addTestPlayer('p1', 2000, 2000);
    const bot = srv.spawnBotWarrior();
    assert.ok(bot);
    assert.equal(bot.isBot, true);

    // Attempting to set nickname on bot should be a no-op
    const origName = bot.name;
    const res = srv.setPlayerNickname(bot, 'SpeedyCheater');
    assert.equal(res, '');
    assert.equal(bot.name, origName, 'Bot name must not be changed by setPlayerNickname');

    // Bot kills enemies
    for (let i = 0; i < 50; i++) {
      const e = addTestEnemy(2100, 2000, 10);
      srv.defeatEnemy(srv.enemies.indexOf(e), bot);
    }
    assert.equal(bot.kills, 50);

    // Explicit call to updateLeaderboardForPlayer
    srv.updateLeaderboardForPlayer(bot);

    // Verify leaderboard is empty of bots
    const leaderboard = srv.getTopLeaderboard();
    assert.ok(!leaderboard.some((entry) => entry.name === bot.name || entry.name.includes('(bot)')));
    assert.equal(srv.leaderboardRecords.size, 0, 'No leaderboard records should be recorded for bot');
  });

  it('cycles strictly between aggressive, evasive, and greedy modes regardless of remaining hitpoints', () => {
    const bot = srv.spawnBotWarrior();
    assert.ok(bot);

    // 1. Test cycling at Full HP (100)
    bot.hp = 100;
    bot.botMode = 'aggressive';
    bot.botModeTimer = srv.BOT_MODE_CYCLE_DURATION;

    srv.stepBotAI(bot, srv.BOT_MODE_CYCLE_DURATION);
    assert.equal(bot.botMode, 'evasive', 'Aggressive should transition to Evasive at 100 HP');

    srv.stepBotAI(bot, srv.BOT_MODE_CYCLE_DURATION);
    assert.equal(bot.botMode, 'greedy', 'Evasive should transition to Greedy at 100 HP');

    srv.stepBotAI(bot, srv.BOT_MODE_CYCLE_DURATION);
    assert.equal(bot.botMode, 'aggressive', 'Greedy should transition to Aggressive at 100 HP');

    // 2. Test cycling at Half HP (50) - cycle behaves identically
    bot.hp = 50;
    srv.stepBotAI(bot, srv.BOT_MODE_CYCLE_DURATION);
    assert.equal(bot.botMode, 'evasive', 'Aggressive should transition to Evasive at 50 HP');

    srv.stepBotAI(bot, srv.BOT_MODE_CYCLE_DURATION);
    assert.equal(bot.botMode, 'greedy', 'Evasive should transition to Greedy at 50 HP');

    srv.stepBotAI(bot, srv.BOT_MODE_CYCLE_DURATION);
    assert.equal(bot.botMode, 'aggressive', 'Greedy should transition to Aggressive at 50 HP');

    // 3. Test cycling at Critical HP (10) - cycle still behaves identically
    bot.hp = 10;
    srv.stepBotAI(bot, srv.BOT_MODE_CYCLE_DURATION);
    assert.equal(bot.botMode, 'evasive', 'Aggressive should transition to Evasive at 10 HP');

    srv.stepBotAI(bot, srv.BOT_MODE_CYCLE_DURATION);
    assert.equal(bot.botMode, 'greedy', 'Evasive should transition to Greedy at 10 HP');

    srv.stepBotAI(bot, srv.BOT_MODE_CYCLE_DURATION);
    assert.equal(bot.botMode, 'aggressive', 'Greedy should transition to Aggressive at 10 HP');
  });

  it('executes mode-specific steering and collects pickups in world physics', () => {
    addTestPlayer('p1', 1000, 1000);
    const bot = srv.spawnBotWarrior();
    bot.x = 2000;
    bot.y = 2000;
    bot.vx = 0;
    bot.vy = 0;

    // 1. Aggressive mode: maintains chain length distance from nearest enemy
    const enemy = addTestEnemy(2400, 2000, 100);
    bot.botMode = 'aggressive';
    bot.botModeTimer = 10;
    srv.stepBotAI(bot, 0.016);
    // When enemy is far (400px > 76px chainDist), bot steers toward enemy
    assert.ok(bot.input.mouseWorldX > bot.x, 'Aggressive bot should move toward distant enemy');

    // When enemy is too close (30px < 76px chainDist), bot backs away to avoid contact damage
    enemy.x = 2030;
    enemy.y = 2000;
    srv.stepBotAI(bot, 0.016);
    assert.ok(bot.input.mouseWorldX < bot.x, 'Aggressive bot should back away when enemy is closer than chain length');

    // With longer chain (5 links = 85px), enemy at 60px is within chain distance and bot backs away
    bot.chainLinks = 5;
    enemy.x = 2060;
    enemy.y = 2000;
    srv.stepBotAI(bot, 0.016);
    assert.ok(bot.input.mouseWorldX < bot.x, 'Aggressive bot should scale distance to longer chain links');

    // Reset bot chain links and enemy position for remaining checks
    bot.chainLinks = 2;
    enemy.x = 2400;
    enemy.y = 2000;

    // 2. Evasive mode: steers away from enemy
    bot.botMode = 'evasive';
    bot.botModeTimer = 10;
    srv.stepBotAI(bot, 0.016);
    // Mouse target should steer West away from enemy at 2400
    assert.ok(bot.input.mouseWorldX < 2000, 'Evasive bot should aim mouse away from enemy (West)');

    // 3. Greedy mode: steers toward pickup
    srv.enemies.length = 0;
    srv.blackCircles.length = 0;
    srv.blackCircles.push({
      id: 'pickup_test',
      x: 2150,
      y: 2000,
      radius: 12,
      type: 'speed',
      lifetime: 30,
    });
    bot.botMode = 'greedy';
    bot.botModeTimer = 10;
    srv.stepBotAI(bot, 0.016);
    assert.equal(bot.input.mouseWorldX, 2150, 'Greedy bot should target pickup X');
    assert.equal(bot.input.mouseWorldY, 2000, 'Greedy bot should target pickup Y');

    // 4. World physics integration: stepping world physics moves bot and collects pickup
    srv.blackCircles[0].x = bot.x;
    srv.blackCircles[0].y = bot.y;
    assert.equal(srv.blackCircles.length, 1);
    srv.stepWorldPhysics(0.016);
    assert.equal(srv.blackCircles.length, 0, 'Bot should have collected the pickup');
    assert.equal(bot.speedMultiplier, 1.05);
  });

  it('places 4, 6, 8, 10, 12, or 16 random powerups in a circle around a joining player based on monster strength', () => {
    resetTestWorld();

    // 1. Verify getStartingPowerupCount scales across 4, 6, 8, 10, 12, 16 as elapsedGameTime / monster strength increases
    srv.setState({ elapsedGameTime: 0 });
    assert.equal(srv.getStartingPowerupCount(), 4, 'At game start (0 min), joining player receives 4 powerups');

    srv.setState({ elapsedGameTime: 60 }); // 1 min
    assert.equal(srv.getStartingPowerupCount(), 6, 'At 1 minute, joining player receives 6 powerups');

    srv.setState({ elapsedGameTime: 120 }); // 2 min
    assert.equal(srv.getStartingPowerupCount(), 8, 'At 2 minutes, joining player receives 8 powerups');

    srv.setState({ elapsedGameTime: 180 }); // 3 min
    assert.equal(srv.getStartingPowerupCount(), 10, 'At 3 minutes, joining player receives 10 powerups');

    srv.setState({ elapsedGameTime: 240 }); // 4 min
    assert.equal(srv.getStartingPowerupCount(), 12, 'At 4 minutes, joining player receives 12 powerups');

    srv.setState({ elapsedGameTime: 300 }); // 5+ min
    assert.equal(srv.getStartingPowerupCount(), 16, 'At 5+ minutes, joining player receives 16 powerups');

    // 2. Also scales if active enemies on the field have high maxHp even when elapsedGameTime is 0
    srv.setState({ elapsedGameTime: 0 });
    srv.enemies.length = 0;
    addTestEnemy(1000, 1000, 650); // strength ~ 650 / 85 = 7.65 >= 6.8
    assert.equal(srv.getStartingPowerupCount(), 16, 'Strong active monsters yield 16 starting powerups');

    // 3. When a human player joins with a socket connection, createPlayer places the circle around their starting point
    resetTestWorld();
    srv.setState({ elapsedGameTime: 120 }); // expects 8 powerups
    const mockSocket = { write() {}, destroyed: false };
    const joiningPlayer = srv.createPlayer('joiner_1', mockSocket);
    assert.equal(srv.blackCircles.length, 8, 'Should place 8 powerups in blackCircles when player joins at 2 min');

    for (let i = 0; i < srv.blackCircles.length; i++) {
      const pk = srv.blackCircles[i];
      assert.ok(srv.ALL_POWERUP_TYPES.includes(pk.type), `Valid powerup type: ${pk.type}`);
      const expectedAngle = (i / 8) * Math.PI * 2;
      const expectedX = Math.max(
        40,
        Math.min(srv.WORLD_WIDTH - 40, Math.round(joiningPlayer.x + Math.cos(expectedAngle) * srv.STARTING_POWERUP_RING_RADIUS))
      );
      const expectedY = Math.max(
        40,
        Math.min(srv.WORLD_HEIGHT - 40, Math.round(joiningPlayer.y + Math.sin(expectedAngle) * srv.STARTING_POWERUP_RING_RADIUS))
      );
      assert.equal(pk.x, expectedX);
      assert.equal(pk.y, expectedY);
    }

    // 4. Emits player_join event when a warrior joins, mount_lost when mount HP reaches 0, and player_die when warrior HP reaches 0
    const joinEv = srv.getState().pendingEvents.find((ev) => ev.type === 'player_join' && ev.playerId === 'joiner_1');
    assert.ok(joinEv, 'Should emit player_join event when a warrior joins');

    srv.setState({ pendingEvents: [] });
    joiningPlayer.mountType = 'horse';
    joiningPlayer.mountHp = 30;
    joiningPlayer.mountMaxHp = 100;
    srv.applyDamageToPlayer(joiningPlayer, 40);
    assert.equal(joiningPlayer.mountType, null);
    const mountLostEv = srv.getState().pendingEvents.find((ev) => ev.type === 'mount_lost');
    assert.ok(mountLostEv, 'Should emit mount_lost event when warrior loses mount');
    assert.equal(mountLostEv.mountType, 'horse');
    assert.equal(mountLostEv.playerId, 'joiner_1');

    srv.setState({ pendingEvents: [] });
    joiningPlayer.hp = 25;
    const died = srv.applyDamageToPlayer(joiningPlayer, 30);
    assert.equal(died, true);
    assert.equal(joiningPlayer.alive, false);
    const dieEv = srv.getState().pendingEvents.find((ev) => ev.type === 'player_die');
    assert.ok(dieEv, 'Should emit player_die event when warrior dies');
    assert.equal(dieEv.playerId, 'joiner_1');
  });
});

describe('Boss-Monster Mode (Giant Floating Hand every 200 kills)', () => {
  it('triggers boss-monster mode every 200 kills, fears regular zombies to map edges, and triggers an earthquake 5s later', () => {
    resetTestWorld();
    const p = addTestPlayer('boss_hunter', 2000, 2000);

    // Place regular zombies near each of the 4 map edges
    const zLeft = addTestEnemy(300, 2000, 100);
    const zRight = addTestEnemy(3700, 2000, 100);
    const zTop = addTestEnemy(2000, 250, 100);
    const zBottom = addTestEnemy(2000, 3750, 100);

    // Advance teamKills to 199 and defeat one more enemy to reach 200
    srv.setState({ teamKills: 199, lastBossSpawnMilestone: 0 });
    const victim = addTestEnemy(2100, 2000, 50);
    srv.defeatEnemy(srv.enemies.indexOf(victim), p);

    assert.equal(srv.getState().teamKills, 200);
    assert.equal(srv.getState().lastBossSpawnMilestone, 200);
    assert.equal(srv.activeBossHands.size, 1, 'Boss hand should spawn at 200 kills');
    assert.equal(srv.getState().bossStartQuakeTimer, 5.0, '5-second earthquake timer should start');

    // Regular zombies should be in fear state running for the nearest map edge
    assert.ok(zLeft.fearTimer > 0 && zLeft.fearToEdge, 'Left zombie should flee toward edge');
    assert.ok(zLeft.vx < 0, 'Left zombie should run toward left edge (vx < 0)');
    assert.ok(zRight.fearTimer > 0 && zRight.fearToEdge && zRight.vx > 0, 'Right zombie should run toward right edge');
    assert.ok(zTop.fearTimer > 0 && zTop.fearToEdge && zTop.vy < 0, 'Top zombie should run toward top edge');
    assert.ok(zBottom.fearTimer > 0 && zBottom.fearToEdge && zBottom.vy > 0, 'Bottom zombie should run toward bottom edge');

    // Step 4.9 seconds: earthquake should not have triggered yet
    srv.stepWorldPhysics(4.9);
    assert.equal(srv.getState().earthquakeTimer, 0, 'Earthquake should not trigger before 5 seconds');

    // Step another 0.2 seconds (total 5.1s): earthquake triggers!
    srv.stepWorldPhysics(0.2);
    assert.ok(srv.getState().earthquakeTimer > 0, 'Earthquake should be triggered 5 seconds after boss mode starts');
    assert.ok(zLeft.knockdownTimer > 0, 'Regular zombies should be knocked down by the earthquake');
  });

  it('spawns a giant floating hand with 1 palm, 4 fingers (3 segments each) and 1 thumb (2 segments) that move together and deal contact damage', () => {
    resetTestWorld();
    const p = addTestPlayer('boss_target', 2000, 2000);

    const bossHand = srv.spawnBossHand(1100, 2000);
    assert.ok(bossHand, 'spawnBossHand should return bossHand instance');
    assert.equal(bossHand.palm.bossPartType, 'palm');
    assert.equal(bossHand.palm.radius, 185, 'Palm should be 20% smaller than 231 (radius 185 = Math.round(231 * 0.8))');
    assert.equal(srv.BOSS_SEGMENT_RADIUS, 58, 'Finger segment radius should be 20% smaller than 72 (58 = Math.round(72 * 0.8))');
    assert.equal(srv.BOSS_SEGMENT_BASE_HP, 900, 'Segments should have 3x as many base hitpoints (900 = 3 * 300)');
    assert.equal(srv.BOSS_DEFEAT_SEGMENT_THRESHOLD, 14, 'Warriors must destroy all 14 segments to defeat the hand');
    assert.equal(srv.BOSS_SPEED_MULT, 1.2, 'Boss hand should move 2x as fast (1.2 = 2 * 0.6)');
    assert.equal(bossHand.segments.length, 14, '4 fingers * 3 + 1 thumb * 2 = 14 segments');
    assert.equal(bossHand.segments[0].maxHp, 900, 'Segment should start with 900 HP at base monster strength');

    const thumbSegs = bossHand.segments.filter((s) => s.isThumb);
    const fingerSegs = bossHand.segments.filter((s) => !s.isThumb);
    assert.equal(thumbSegs.length, 2, 'Thumb should have 2 segments');
    assert.equal(fingerSegs.length, 12, '4 fingers should have 12 segments total');
    assert.equal(thumbSegs[0].radius, 62, 'Thumb segment radius should be 20% smaller than 78 (62 = Math.round(78 * 0.8))');
    assert.equal(fingerSegs[0].radius, 58, 'Finger segment radius should be 20% smaller than 72 (58 = Math.round(72 * 0.8))');

    // Verify ring is placed on the third finger (digitIndex === 3, segmentIndex === 1)
    const ringSegs = bossHand.segments.filter((s) => s.hasRing);
    assert.equal(ringSegs.length, 1, 'Exactly one segment should have the ring');
    assert.equal(ringSegs[0].digitIndex, 3, 'Ring should be on the third finger (digitIndex 3)');
    assert.equal(ringSegs[0].segmentIndex, 1, 'Ring should be on the base segment of the third finger');

    for (const seg of bossHand.segments) {
      assert.equal(seg.attached, true, 'All segments start attached');
    }

    // Verify finger spreading and aligning: compare index fingertip (digit 1, seg 3) to pinky fingertip (digit 4, seg 3)
    bossHand.palm.fingerSpreadPhase = -Math.PI / 2; // spread = 0 (aligned together)
    srv.syncBossHandAttachedSegments(bossHand.palm);
    const indexTip = bossHand.segments.find((s) => s.digitIndex === 1 && s.segmentIndex === 3);
    const pinkyTip = bossHand.segments.find((s) => s.digitIndex === 4 && s.segmentIndex === 3);
    const alignedSpan = Math.hypot(indexTip.x - pinkyTip.x, indexTip.y - pinkyTip.y);

    bossHand.palm.fingerSpreadPhase = Math.PI / 2; // spread = 1 (spread wide apart)
    srv.syncBossHandAttachedSegments(bossHand.palm);
    const spreadSpan = Math.hypot(indexTip.x - pinkyTip.x, indexTip.y - pinkyTip.y);
    assert.ok(
      spreadSpan > alignedSpan * 1.8,
      `Fingers should spread apart and align together (spreadSpan=${spreadSpan.toFixed(1)}, alignedSpan=${alignedSpan.toFixed(1)})`
    );

    // Step physics and verify palm and attached segments move together toward nearest warrior and fingerSpreadPhase advances
    const startPalmX = bossHand.palm.x;
    const startPhase = bossHand.palm.fingerSpreadPhase;
    p.mouseX = p.x;
    p.mouseY = p.y;
    for (let i = 0; i < 15; i++) {
      srv.stepWorldPhysics(0.05);
    }
    assert.ok(bossHand.palm.x > startPalmX, 'Palm should pursue warrior (+x)');
    assert.ok(bossHand.palm.fingerSpreadPhase > startPhase, 'Palm fingerSpreadPhase should slowly advance over time');

    // Verify pose lock: attached segment position matches getBossSegmentAttachedPose
    for (const seg of bossHand.segments) {
      const expected = srv.getBossSegmentAttachedPose(bossHand.palm, seg.digitIndex, seg.segmentIndex);
      assert.ok(Math.hypot(seg.x - expected.x, seg.y - expected.y) < 1e-3, 'Attached segment stays locked to palm pose');
    }

    // Contact damage: place warrior touching a finger segment
    const tipSeg = bossHand.segments[13];
    p.x = tipSeg.x + tipSeg.radius + p.radius - 4;
    p.y = tipSeg.y;
    const prevHp = p.hp;
    tipSeg.contactCooldown = 0;
    srv.stepWorldPhysics(0.016);
    assert.ok(p.hp < prevHp, 'Touching any part of the boss hand should deal contact damage to warrior');
  });

  it('routes damage to the furthest segment from the palm, detaches segments at 75% HP loss (+25% speed), and credits 1 kill per defeated segment', () => {
    resetTestWorld();
    const p = addTestPlayer('segment_slayer', 2000, 2000);
    p.name = 'Sir Lancelot';

    const bossHand = srv.spawnBossHand(1500, 2000);
    const palm = bossHand.palm;

    // 1. Hitting the palm resolves to a distal tip segment (segmentIndex 3 on a finger)
    const targetFromPalm = srv.resolveBossTargetSegment(palm);
    assert.equal(targetFromPalm.bossPartType, 'segment');
    assert.equal(targetFromPalm.segmentIndex, 3, 'Hitting palm should route damage to a furthest finger tip segment (segmentIndex 3)');

    // 2. Hitting the base segment (segmentIndex 1) of digit 1 routes to the tip segment (segmentIndex 3) of digit 1
    const digit1Base = bossHand.segments.find((s) => s.digitIndex === 1 && s.segmentIndex === 1);
    const digit1Mid = bossHand.segments.find((s) => s.digitIndex === 1 && s.segmentIndex === 2);
    const digit1Tip = bossHand.segments.find((s) => s.digitIndex === 1 && s.segmentIndex === 3);
    assert.equal(srv.resolveBossTargetSegment(digit1Base), digit1Tip, 'Hitting base of finger routes to tip of that finger');

    // 3. Reduce digit1Tip HP to 25% of maxHp (75% HP lost) -> becomes detached!
    digit1Tip.hp = Math.floor(digit1Tip.maxHp * 0.25);
    const detached = srv.checkBossSegmentDetach(digit1Tip);
    assert.equal(detached, true, 'Segment should detach when it has lost 75% of its hitpoints');
    assert.equal(digit1Tip.attached, false, 'Segment attached flag should be false');

    // Now that digit1Tip is detached, hitting digit1Base routes to digit1Mid (the furthest still-attached segment on digit 1)
    assert.equal(
      srv.resolveBossTargetSegment(digit1Base),
      digit1Mid,
      'Once tip is detached, hitting finger base routes to middle segment'
    );
    // Hitting the detached segment directly damages the detached segment itself
    assert.equal(
      srv.resolveBossTargetSegment(digit1Tip),
      digit1Tip,
      'Hitting a detached segment directly damages that detached segment'
    );

    // 4. Detached segment moves independently of the palm at a 25% faster speed
    digit1Tip.x = 1200;
    digit1Tip.y = 1800;
    digit1Tip.vx = 0;
    digit1Tip.vy = 0;
    palm.x = 1200;
    palm.y = 2200;
    palm.vx = 0;
    palm.vy = 0;
    p.x = 2500;
    p.y = 2000;
    p.mouseX = p.x;
    p.mouseY = p.y;
    srv.stepWorldPhysics(0.05);
    const palmSpeed = Math.hypot(palm.vx, palm.vy);
    const detachedSpeed = Math.hypot(digit1Tip.vx, digit1Tip.vy);
    assert.ok(
      Math.abs(detachedSpeed / palmSpeed - 1.25) < 0.05,
      `Detached segment should move 25% faster than the hand (got ratio ${(detachedSpeed / palmSpeed).toFixed(3)})`
    );

    // 5. Defeating a segment counts as 1 kill for the player and leaderboard
    const killsBefore = p.kills;
    const teamKillsBefore = srv.getState().teamKills;
    srv.defeatEnemy(srv.enemies.indexOf(digit1Tip), p);
    assert.equal(p.kills, killsBefore + 1, 'Defeating a segment should increment player kills by 1');
    assert.equal(srv.getState().teamKills, teamKillsBefore + 1, 'Defeating a segment should increment teamKills by 1');
    const lbTop = srv.getTopLeaderboard();
    assert.ok(lbTop.some((e) => e.name === 'Sir Lancelot' && e.kills === p.kills), 'Segment kill should be recorded on leaderboard');
  });

  it('enforces boss immunities: no earthquake knockdown, no disco dance, can burn, and only detached segments can be webbed', () => {
    resetTestWorld();
    const p = addTestPlayer('status_tester', 2000, 2000);

    const bossHand = srv.spawnBossHand(1600, 2000);
    const palm = bossHand.palm;
    const attachedSeg = bossHand.segments[0];
    const detachedSeg = bossHand.segments[1];
    detachedSeg.attached = false;

    // 1. Earthquake cannot knock down any part of the hand
    srv.triggerEarthquake(1600, 2000);
    srv.stepWorldPhysics(0.05);
    assert.equal(palm.knockdownTimer, 0, 'Palm cannot be knocked down by earthquake');
    assert.equal(attachedSeg.knockdownTimer, 0, 'Attached segment cannot be knocked down by earthquake');
    assert.equal(detachedSeg.knockdownTimer, 0, 'Detached segment cannot be knocked down by earthquake');
    assert.ok(Math.hypot(palm.vx, palm.vy) > 0, 'Boss hand keeps moving during an earthquake');

    // 2. Disco ball cannot make any part of the hand dance
    assert.equal(srv.startEnemyDance(palm), false, 'Palm cannot dance');
    assert.equal(srv.startEnemyDance(attachedSeg), false, 'Attached segment cannot dance');
    assert.equal(srv.startEnemyDance(detachedSeg), false, 'Detached segment cannot dance');
    assert.equal(palm.danceTimer, 0);
    assert.equal(attachedSeg.danceTimer, 0);
    assert.equal(detachedSeg.danceTimer, 0);

    // 3. Parts of the hand CAN be set on fire
    assert.equal(srv.igniteEnemy(palm), true, 'Palm can be set on fire');
    assert.equal(srv.igniteEnemy(attachedSeg), true, 'Attached segment can be set on fire');
    assert.equal(srv.igniteEnemy(detachedSeg), true, 'Detached segment can be set on fire');
    assert.ok(palm.burnTimer > 0 && attachedSeg.burnTimer > 0 && detachedSeg.burnTimer > 0);

    // 4. Spider web: attached segment and palm cannot be webbed; detached segment CAN be webbed
    assert.equal(srv.canEnemyBeWebbed(palm), false, 'Palm cannot be webbed');
    assert.equal(srv.canEnemyBeWebbed(attachedSeg), false, 'Attached segment cannot be webbed');
    assert.equal(srv.canEnemyBeWebbed(detachedSeg), true, 'Detached segment can be webbed');

    // Test spider hammer strike on attached vs detached segment
    p.hammer.isSpider = true;
    p.hammer.spiderTimer = 30;
    p.hammer.x = attachedSeg.x - attachedSeg.radius - p.hammer.radius + 4;
    p.hammer.y = attachedSeg.y;
    p.hammer.vx = 500;
    p.hammer.vy = 0;
    srv.updatePlayerBroadphaseBounds(p);
    srv.stepWorldPhysics(0.016);
    assert.equal(attachedSeg.webTimer, 0, 'Spider hammer should not web an attached segment');

    p.hammer.x = detachedSeg.x - detachedSeg.radius - p.hammer.radius + 4;
    p.hammer.y = detachedSeg.y;
    p.hammer.vx = 500;
    p.hammer.vy = 0;
    srv.updatePlayerBroadphaseBounds(p);
    srv.stepWorldPhysics(0.016);
    assert.ok(detachedSeg.webTimer > 0, 'Spider hammer should web a detached segment');
  });

  it('triggers boss-defeated event when all 14 segments are defeated, blinks remaining palm for 3s, triggers earthquake, and removes remaining parts', () => {
    resetTestWorld();
    const p = addTestPlayer('boss_finisher', 2000, 2000);

    const bossHand = srv.spawnBossHand(1500, 2000);
    // Clear opening quake timer and pickups so we can isolate the defeat earthquake and powerup drop
    srv.blackCircles.length = 0;
    srv.setState({ bossStartQuakeTimer: 0, earthquakeTimer: 0, pendingEvents: [] });

    // Defeat 13 segments: boss should NOT be defeated yet, and finger segments should NOT leave powerups
    for (let i = 0; i < 13; i++) {
      const seg = bossHand.segments[i];
      srv.defeatEnemy(srv.enemies.indexOf(seg), p);
    }
    assert.equal(bossHand.defeatedSegments, 13);
    assert.equal(bossHand.defeatedTriggered, false, 'Boss should not be defeated at 13 segments');
    assert.equal(srv.blackCircles.length, 0, 'Defeating individual finger segments should not drop powerups');

    // Defeat the 14th segment -> triggers boss-defeated and drops 24 powerups!
    const seg14 = bossHand.segments[13];
    srv.defeatEnemy(srv.enemies.indexOf(seg14), p);
    assert.equal(bossHand.defeatedSegments, 14);
    assert.equal(bossHand.defeatedTriggered, true, 'Boss should trigger defeat when all 14 segments are defeated');
    assert.equal(bossHand.blinkTimer, 3.0, 'Remaining palm should blink for 3 seconds');
    assert.equal(srv.blackCircles.length, 24, 'Defeating the boss hand should leave 24 powerups');

    const defeatEv = srv.getState().pendingEvents.find((ev) => ev.type === 'boss_defeated');
    assert.ok(defeatEv, 'Should emit boss_defeated event when all 14 segments are defeated');

    // Remaining palm should have bossBlinkTimer = 3.0
    const remainingParts = srv.enemies.filter((e) => e.bossId === bossHand.bossId);
    assert.equal(remainingParts.length, 1, 'Palm should still be in enemies during blink');
    for (const part of remainingParts) {
      assert.equal(part.bossBlinkTimer, 3.0, 'Remaining boss palm should have 3s blink timer');
    }

    // Step 2.5s: still blinking, not yet removed, no earthquake yet
    srv.stepWorldPhysics(2.5);
    assert.equal(srv.getState().earthquakeTimer, 0, 'Earthquake should not fire before 3s blink finishes');
    assert.equal(
      srv.enemies.filter((e) => e.bossId === bossHand.bossId).length,
      1,
      'Remaining palm should still be visible at 2.5s'
    );

    // Step another 0.6s (total 3.1s): earthquake triggers and all remaining parts disappear!
    srv.stepWorldPhysics(0.6);
    assert.ok(srv.getState().earthquakeTimer > 0, 'Earthquake should trigger after 3s blink completes');
    assert.equal(
      srv.enemies.filter((e) => e.bossId === bossHand.bossId).length,
      0,
      'All remaining parts of the boss hand should disappear after 3s blink'
    );
    assert.equal(srv.activeBossHands.has(bossHand.bossId), false, 'Boss hand should be removed from activeBossHands');
  });

  it('triggers boss-monster mode immediately when client sends boss_cheat over WebSocket', () => {
    resetTestWorld();
    const mockSocket = new EventEmitter();
    mockSocket.write = () => {};
    mockSocket.end = () => {};
    mockSocket.setNoDelay = () => {};

    srv.server.emit(
      'upgrade',
      { headers: { 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' } },
      mockSocket,
      Buffer.alloc(0)
    );

    assert.equal(srv.activeBossHands.size, 0);
    mockSocket.emit('data', srv.encodeWsFrame(JSON.stringify({ type: 'boss_cheat' })));
    assert.equal(srv.activeBossHands.size, 1, 'Sending boss_cheat over WebSocket should immediately spawn boss hand');
    assert.equal(srv.getState().bossStartQuakeTimer, 5.0, 'Should start 5s opening earthquake countdown');
  });
});
