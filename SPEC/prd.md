# HammerTime — Product Requirements Document (PRD)

## 1. Overview & Vision

**HammerTime** is a browser-based, cooperative top-down (2.5D oblique) physics action game set on a vast, sunlit medieval-fantasy grassy battlefield. Players take on the role of armored warriors wielding heavy, spiked warhammers tethered by flexible iron chains. Rather than swinging weapons on fixed animations, players maneuver their warrior to build orbital momentum, whip the chain around stone pillars, and smash escalating hordes of zombies.

The game is designed for instant, frictionless play in any desktop or tablet web browser—no downloads, no accounts, and zero tutorial clutter. Players choose (or roll) a medieval nickname, click once to enter, and immediately join a shared live arena (or play seamlessly offline if no server is reachable).

---

## 2. Target Experience & Core Gameplay Loop

### Core Loop
1. **Enter the Arena**: Arrive at a click-to-enter welcome card with a suggested medieval nickname and heroic call-to-action button.
2. **Gather Starting Gear**: Spawn on the battlefield surrounded by a small starter ring of random powerup tokens (larger rings when joining late into a tough match) to get up to speed quickly.
3. **Build Momentum & Smash**: Move around the field to swing the chain-tethered warhammer. Faster swings and heavier maces deliver dramatically higher impact damage and knockback.
4. **Collect & Escalate**: Every slain regular zombie drops a powerup token. Collecting tokens permanently upgrades the warrior's chain length, mace mass, and movement speed, or grants tactical charges, exotic weapon transformations, ridable mounts, and battlefield-wide abilities.
5. **Survive Waves & Bosses**: As time passes and team kills climb, enemies grow larger and tougher, and milestone threats arrive—motorcycle zombies, coordinated armored mobs, and a towering floating Boss Hand.
6. **Win or Fall Together**:
   - **Victory**: Reach over **1,000 combined team zombie kills** to trigger a celebratory Victory screen and start a fresh round after a brief countdown.
   - **Observer Mode & Defeat**: If an individual warrior falls while teammates survive, they enter Observer Mode and spectate surviving allies. If all warriors fall, a short countdown triggers an automatic round reset for everyone.

---

## 3. Player Onboarding, Identity & Session Flow

### Click-to-Enter Modal
- On page load, gameplay is paused behind a welcome modal so idle browser tabs do not consume server resources or get killed before the player is ready.
- **Nickname Selection**:
  - Supports custom nicknames up to 20 characters (control characters stripped, whitespace normalized).
  - Pre-populated from the player's previously saved cookie, or automatically generated from a medieval-fantasy name pool covering four styles: noble male titles/names (e.g., *Sir Galahad*), noble female titles/names (e.g., *Lady Guinevere*), color/animal descriptors + warrior classes (e.g., *Crimson Paladin*, *Wolf Ranger*), and noble titles of fantasy realms (e.g., *Countess of Windmere*).
  - Includes a **dice reroll button** that animates and rolls a fresh random name and randomizes the submit button's heroic call-to-action (e.g., *"Onward to glory!"*, *"Smash the undead!"*, *"Unleash the mace!"*).
  - Submitting an empty nickname highlights the input with an inline prompt rather than joining unnamed.

### Session Hygiene & Idle Protection
- **Inactivity Timeout**: Players who provide no input for ~2 minutes while alive (or ~45 seconds while dead/observing) are gracefully disconnected/paused and returned to the entry modal with an explanation.
- **Time-Gap Reset**: If a browser tab sleeps or the world sits empty for an extended period (e.g., >30 seconds), the battlefield cleanly resets for a fresh experience upon return.

### Persistent All-Time Leaderboard
- Tracks the **Top 10 players by highest single-round kill count**, persisted across server restarts (and stored locally in browser storage when playing standalone).
- Displayed continuously in the top-right HUD, highlighting the local player's row in gold when present.
- AI companion bots are excluded from the leaderboard.

### Secret Developer / Fun Cheat Codes
- While actively playing (and not typing in a text field or modal), typing `cheat` spawns concentric rings containing every powerup type in the center of the arena; typing `boss` immediately summons the Boss Hand encounter.

---

## 4. Controls & Accessibility

The game supports three seamless, mutually cooperative control schemes without requiring manual mode switching:

1. **Mouse / Pointer (Primary Desktop)**:
   - The warrior smoothly turns and accelerates toward the cursor's ground position.
   - Sustained movement ramps from a walk into a full run; reversing direction applies snappy braking so players can whip the hammer quickly in tight arcs.
   - Moving the cursor close to the warrior slows and stops them cleanly.
2. **Keyboard Steering**:
   - `W` / `Up Arrow`: Move forward in the warrior's facing direction.
   - `A` / `D` or `Left` / `Right Arrow`: Steer left or right (holding only a turn key pivots in place without advancing).
   - Arrow keys prevent page scrolling. Releasing all movement keys brings the warrior to a stop.
3. **Touch-Wheel Virtual Joystick (Tablets & Touchscreens)**:
   - A translucent circular thumbstick anchored in the lower-right corner translates thumb drag direction and intensity into movement relative to the warrior's screen position. Releasing the wheel centers the thumb and halts the warrior.

### Camera Behavior
- The camera uses a **center-third deadzone**: the active warrior always remains within the middle third (horizontally and vertically) of the viewport, scrolling smoothly across the larger battlefield as they roam.
- In Observer Mode, the camera automatically follows the nearest surviving teammate.

---

## 5. Combat Mechanics & Player Feel

### Chain-and-Warhammer Physics
- The warhammer has substantial momentum and glides freely with no ground friction, tethered by a flexible multi-link chain that stretches elastically under tension and pulls slightly back on the warrior.
- The chain and mace physically wrap around and bounce off the **four immovable stone columns** symmetrically placed around the arena center, allowing skilled players to slingshot or shield themselves around pillars.
- Warriors and zombies are kept inside the fenced perimeter, while the swinging chain and mace are allowed to arc freely across the fence boundary so corner combat never feels cramped.
- **Impulse-Driven Damage**: Both damage and knockback scale directly with impact impulse (hammer mass and relative collision speed). The iron chain itself also damages and knocks back enemies on contact, at a reduced fraction of a direct mace strike (~1/3 momentum transfer and ~40% damage scaling).

### Combat Depth & Combos
- **Whirlwind Charge (5 Tiers)**: Continuously spinning the hammer at high angular or orbital speed charges up a **Whirlwind** state after several seconds, then escalates through Levels 1 to 5. Higher levels slightly extend chain reach and paint progressively longer, brighter orbital trails. Striking an enemy discharges an area-of-effect wind gust (scaling in radius, knockback, and damage by tier) and resets the charge. If the hammer is also flaming or a Jack-o'-Lantern, the gust becomes a **Flame Whirlwind** that ignites everyone caught in the blast.
- **Tactile Game Feel ("Juice")**:
  - Crushing high-damage hits and rapid multi-kills trigger a brief **hit-stop micro-freeze** (~30ms) paired with directional camera kick and heavier impact audio.
  - Zombies suffer **progressive limb loss** at 50% and 25% health: severed limbs fly off as fading spectral remnants. Losing one or both legs slows a zombie; losing its head causes it to wander blindly in circles instead of chasing players.
  - Defeated zombies launch a momentum-carrying ghostly silhouette that drifts upward and fades out.

---

## 6. Powerups & Mounts

Defeated regular enemies drop floating dark-obsidian pickup discs with distinct glowing rims and emblems. Up to ~40 pickups can exist on the field at once (evicting oldest common pickups first so rare drops are preserved).

### Common Powerups (Uniformly Split Pool)
| Powerup | Effect & Rules |
|---|---|
| **Chain Link** | Adds +1 link to a hammer's chain (up to 9 links). Once all hammers reach max links, further pickups incrementally lengthen individual links. |
| **Hammer Weight** | Permanently increases a hammer's mass and physical size, boosting impact impulse and damage. |
| **Health** | Restores 20% of warrior max HP. Cannot be collected when already at full health. |
| **Bomb** | Arms a hammer with a stackable explosive charge. On next enemy hit, detonates a massive blast wave dealing falloff AoE damage and heavy knockback. |
| **Speed** | Permanently increases warrior movement speed by +5% (compounding). |
| **Flame** | Arms a hammer with a fire charge (persists until used). Next hit ignites the zombie for 10s of burn DoT, triples its running speed, and spreads fire to any zombie it touches. Newly ignited zombies survive the initial hit to spread flames. After burning out, zombies become charred, slowed (0.5x speed), and fireproof for 5s. |

### Rare Powerups (~0.5% Drop Chance Each)
| Powerup | Category | Effect & Rules |
|---|---|---|
| **Extra Hammer** | Weapon | Adds a second independent chain-and-mace for 60s (max 2 hammers). Hammers physically clank off one another. |
| **Warhorse** | Mount | Grants a mount health bar (equal to warrior's current HP) that absorbs damage before the warrior. **2x speed**, **5x traction**. Cannot be picked up while already mounted. |
| **Giant Tortoise** | Mount | Grants a mount health bar (equal to warrior's current HP). **0.25x speed**, **20x traction**—turns the warrior into a nearly immovable anchor for whipping massive maces. Cannot be picked up while already mounted. |
| **War Elephant** | Mount | Grants a huge mount health bar (**2.5x warrior max HP**). **1x speed**, **10x traction**. Automatically tramples zombies on contact for bonus damage and heavy knockback. Can replace a lesser mount (cannot pick up another elephant). |
| **Bulldozer** | Transform | Transforms the warrior into an oversized caterpillar bulldozer for **20s**: completely invulnerable, **0.5x speed**, **10x traction**, crushes zombies on contact for massive damage + knockback, and leaves fading grass tread tracks. Cannot pick up other powerups while active. |
| **Earthquake** | Global Event | Shakes the battlefield violently for **4s**, opening glowing ground fissures and knocking all regular zombies flat and motionless for the quake plus a **5s** recovery window (they cannot deal contact damage while toppled). |
| **Fear** | Global/AoE | Unleashes a wide terror wave; afflicted zombies flee away from the warrior at **4x speed** for **20s** and spread fear by contact contagion. |
| **Disco Ball** | Hammer Mod | Transforms a hammer into a mirrored Disco Ball for **30s**. Passes harmlessly through zombies, compelling any touched zombie to stop and dance in place for **30s** (incapable of attacking), spreading dance fever on contact, followed by **45s** of dance immunity. |
| **Jack-o'-Lantern** | Hammer Mod | Transforms a hammer into a glowing carved pumpkin for **30s**. Ignites zombies on every strike (bypassing fireproof immunity) and infuses bomb blasts and whirlwinds with fire. |
| **Spider Hammer** | Hammer Mod | Transforms a hammer into a giant Black Widow spider for **30s**. Wraps struck zombies (and detached boss finger segments) in sticky white silk webbing, immobilizing them and preventing contact attacks for **30s**. |
| **Thor Hammer** | Hammer Mod | Transforms a hammer into electrified Mjölnir for **60s**. Every hammer strike triggers a half-radius, half-damage lightning blast. |

### Battlefield Mount: Claimable Motorcycle
- Defeating or injuring a Motorcycle Zombie below 50% HP causes it to crash, leaving a smoking laid-down motorcycle wreck on the grass for ~5 seconds.
- Any unmounted warrior (not in Bulldozer mode) who touches the wreck claims the **Motorcycle Mount** (mount HP equal to warrior's current HP, **2.5x speed**, **4x traction**, and wide chopper turning arcs).

---

## 7. Enemies, Escalation & Boss Encounters

### Continuous Escalation
- The battlefield starts populated with ~24 zombies and continuously spawns replacements up to a soft population cap (scaling slightly upward when more than 2 players are online).
- Over elapsed round time, newly spawned zombies steadily increase in physical size, mass, HP, and contact damage.

### Enemy Archetypes
1. **Shambler**: Smaller, nimbler, lower HP, lighter hit.
2. **Walker**: Standard balanced zombie (most common).
3. **Brute**: Larger, heavier, slower, high HP and harder contact hit.
4. **Motorcycle Zombie** *(Milestone: every 20 team kills)*: Rides a chopper at ~5x walker speed with a wide turning radius. Crashes and dismounts into a standard walker when brought below 50% HP (or on death), dropping a temporary claimable wreck.
5. **Armored Zombie Mob** *(Milestone: every 50 team kills)*: Spawns near a distant arena edge as a coordinated squad (6 members on first wave, growing by +1 per milestone up to 12). Clad in steel helmets and cuirasses with ~4x normal HP and ~1.5x speed, steering with group cohesion so they charge together as a pack.

### Boss-Monster Encounter: Giant Floating Hand
Triggered every **200 team kills** (or via the `boss` cheat):
1. **Ominous Entrance**: Every regular zombie on the battlefield enters panic/fear and flees toward the nearest map edge. A dark pulsing violet vignette closes in around the boss. Five seconds later, an earthquake shakes the arena.
2. **Anatomy & Behavior**: A massive hovering undead hand composed of a central **palm** and **5 articulated digits** (thumb with 2 segments, 4 fingers with 3 segments each = **14 targetable segments**, with a jeweled gold ring on the ring finger). The fingers rhythmically spread and close as the hand drifts steadily toward the nearest warrior.
3. **Targeted Segment Combat**:
   - The boss is immune to earthquake knockdown, fear, and disco dancing.
   - Damage dealt to the palm or an attached digit is automatically routed to the outermost attached segment of that digit (or furthest surviving attached segment), creating a tactile "chop off the fingers from the tips inward" progression.
   - When a segment falls to **≤25% HP**, it **detaches** from the hand, pops free, and pursues players independently at slightly increased speed (detached segments can be immobilized by the Spider Hammer).
4. **Boss Defeat & Reward**: Destroying all 14 segments halts the hand in a 3-second flashing death sequence, showers **24 random powerups** in two concentric rings around its body, and finishes with a final earthquake as the boss vanishes.

---

## 8. Multiplayer, Companion Bot & HUD

### Cooperative Multiplayer & Solo Companion
- All players share one cooperative battlefield—no friendly fire, shared progress toward the 1,000-kill victory goal, and gentle body separation between warriors.
- **Solo Bot Ally**: When only one human player is connected on the server, every 30 human kills spawns an AI-controlled knight companion (up to 1 active bot at a time, named with a `(bot)` suffix). The bot cycles every few seconds through **aggressive** (orbiting enemies at chain distance), **evasive** (avoiding enemies, pillars, and walls), and **greedy** (collecting nearby pickups) modes.

### Heads-Up Display (HUD)
- **Top-Left Vital & Physics Panel**:
  - Game title (`HAMMERTIME`).
  - Warrior Health bar (numeric readout + color shift across healthy green, warning amber, and critical red).
  - Contextual secondary bar shown only when mounted (Mount name + HP bar colored per mount) or transformed (`BULLDOZER MODE` countdown bar).
  - 2x2 telemetry readout: **Hammer Mass** (showing both values when dual-wielding), **Chain Length** in meters (plus `(2x)` when dual-wielding), peak **Hammer Speed** in m/s, and **Enemies Slain** (showing personal and team kills in multiplayer).
  - **Chain Tension** live bar and `X / Y ALIVE` player counter.
- **Top-Right Radar & Leaderboard Panel**:
  - **Grasslands Radar (Minimap)**: Real-time overview showing the current camera viewport rectangle, 4 stone columns, pickup tokens, zombies, teammates, local warrior, and mass-scaled hammers.
  - **Top 10 Leaderboard**: Ranked list of top slayers.
- **Contextual Banners & Modals**:
  - Top-center banners for **Observer Mode**, **All Warriors Have Fallen** countdown, and **Earthquake / Knockdown** status timers.
  - **Victory Modal** showing total team kills, personal kills, MVP/top warrior, countdown timer, and a *"Start Next Round Now"* button.
  - **Game Over Modal** (when applicable in solo flow) summarizing enemies defeated, final chain links, peak single-blow damage, and a *"Fight Again"* button.

---

## 9. Audio Experience

The game delivers rich, responsive audio without requiring large sound packs:
- **Procedural Sound Effects**: Velocity/damage-scaled metallic and bass impact thuds, enemy death pops, bright two-note pickup chimes, booming bomb blasts, seismic earthquake rumbles, ghostly fear wails, heavy diesel bulldozer growls, funky disco chimes, spooky Halloween motifs, spider web snaps, Thor thunder chords, warrior join war-horns, solemn death chords, and victory fanfares.
- **Mount & Vehicle Audio**: Distinct claim, loss, and rhythmic locomotion audio for each mount (galloping hoofbeats, heavy tortoise thuds, deep elephant stomps, throaty motorcycle engine pulses), plus distance-attenuated enemy motorcycle engine noise and metallic crash skids.
- **Player Hurt Audio**: Three pitch/tempo variations of a crunchy bite/grunt sample when taking damage.
- **Audio Comfort**: Audio unlocks automatically on first user gesture and rate-limits rapid concurrent combat effects so crowded battles remain punchy rather than distorted.
