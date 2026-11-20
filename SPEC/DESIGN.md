# HammerTime — Visual Style & Design Guide

## 1. Visual Identity & Aesthetic Direction

HammerTime blends **storybook medieval fantasy** with **crisp, tactile arcade readability**. The arena is a bright, sunlit emerald meadow framed by rustic timber fencing and classical fluted stone columns—creating a high-contrast, inviting green backdrop against which metallic steel weapons, colorful warrior heraldry, eerie rotting zombies, and dazzling elemental powerups pop immediately at a glance.

Key aesthetic pillars:
- **Painterly 2.5D Depth on 2D Canvas**: No flat top-down circles. Every character, mount, weapon, pickup, pebble, fence post, and pillar is drawn with extruded vertical height, directional ground shadows, top-lit highlights, and layered anatomy using procedural Canvas 2D vector art.
- **Warm Medieval-Modern UI Chrome**: Translucent dark-forest glassmorphic panels trimmed with soft sage borders and antique gold accents, paired with chiseled serif display headers and crisp monospace telemetry.
- **Unmistakable Silhouette & Color Coding**: Every powerup, mount, zombie variant, and status effect has both a distinct silhouette and an immediate color/particle signature so players can read chaotic battles in milliseconds.

---

## 2. Perspective, Lighting & Ground Environment

### 2.5D Oblique Projection
- The battlefield is viewed at an elevated oblique angle (vertical ground foreshortening ~`0.66`).
- Ground decals (shadows, turf patches, shockwaves, bulldozer tread tracks, reticle, blood/skid marks, seismic fissures) lie flat and foreshortened on the `z = 0` plane.
- Characters, standing grass tufts, fence posts, columns, floating pickups, and hovering weapons rise vertically upward (`-Y` on screen) above their contact shadows.
- **Directional Light**: Consistent soft top-left sunlight casts subtle darkened right/bottom shading on cylinders/spheres and slightly offset elliptical ground shadows (`rgba(0,0,0,0.35–0.45)`).

### Battlefield Scenery (Deterministic Procedural Meadow)
- **Outer Apron**: Deep forest-green vertical gradient surrounding the arena borders.
- **Meadow Turf**: Rich grass green (`#31622c`) overlaid with subtle horizontal mowing/perspective turf stripes, soft organic lighter-grass and darker-clover elliptical meadow patches, standing multi-blade grass tufts in two green shades, tiny colorful wildflowers (gold, cream, peach, sky blue, pink), and 3D layered field pebbles.
- **Perimeter Timber Fence**: Heavy dark-wood corner and interval posts with lighter sunlit top caps and dual horizontal timber rails (north rail drawn behind entities; east/west/south rails drawn in front for true 2.5D overlap).
- **Four Classical Stone Columns**: Tall, fluted cylindrical stone pillars with stepped plinth pedestals, horizontal masonry drum seams, vertical fluting grooves, carved capitals, and sunlit radial-gradient top faces in cool slate grays (`#2d3748` to `#e2e8f0`).

---

## 3. Color Palette & Typography

### UI & HUD Palette
| Token / Role | Color Feel | Representative Value |
|---|---|---|
| Deep Backdrop | Dark forest moss | `hsl(112, 34%, 14%)` |
| Glass Panel Surface | Translucent deep pine (`blur(10px)`) | `hsla(115, 28%, 10%, 0.82)` |
| Panel Border / Rim | Subtle sage hairline + top highlight | `hsla(110, 25%, 65%, 0.22)` |
| Primary Text | Warm parchment off-white | `hsl(48, 38%, 94%)` |
| Secondary / Muted Text | Soft desaturated sage | `hsl(105, 18%, 74%)` / `hsl(108, 12%, 56%)` |
| Primary Accent | Antique heraldic gold | `hsl(42, 88%, 58%)` |
| Secondary Accent | Fiery amber | `hsl(28, 90%, 55%)` |
| Health States | Emerald → Amber → Crimson | `hsl(134, 65%, 46%)` → `hsl(38, 92%, 54%)` → `hsl(4, 82%, 56%)` |

### Typography
- **Display / Headings** (`Cinzel`, serif, bold/extrabold, wide letter-spacing): Used for `HAMMERTIME`, modal headers (`VICTORY!`, `THE WARRIOR HAS FALLEN`), and `OBSERVER MODE` banners to evoke carved medieval heraldry.
- **UI Prose & Controls** (`Inter`, sans-serif): Clean, readable body text, labels, buttons, and leaderboard names.
- **Telemetry & Damage Numbers** (`JetBrains Mono`, monospace, bold): Used for HP readouts, hammer mass/length/speed, countdown timers, leaderboard ranks/scores, and floating canvas damage/status popups with dark drop shadows.

---

## 4. Entity Visual Designs

### Warriors (6 Distinct Heraldic Palettes)
Each joining player cycles through a distinct knightly armor, cape, and helmet plume palette:
- **Knight**: Sky-blue steel (`#63b3ed`), crimson cape, gold plume.
- **Paladin**: Warm amber-gold armor (`#f6ad55`), royal blue cape, ivory plume.
- **Warden**: Emerald armor (`#68d391`), forest cape, warm gold plume.
- **Vanguard**: Lavender-violet armor (`#b794f4`), deep purple cape, blush plume.
- **Berserker**: Coral-crimson armor (`#fc8181`), dark red cape, bright yellow plume.
- **Templar**: Teal armor (`#4fd1c5`), dark teal cape, pure white plume.

**Visual Anatomy**:
- Ground shadow + subtle directional facing indicator ring on the grass (gold for local player, green for allies).
- Layered 2.5D figure: flowing cape (depth-ordered behind or in front depending on north/south facing), striding armored boots, upright cylindrical steel cuirass with gold war-belt, articulated pauldrons/arms, visor helmet with flowing plume, hurt flash tint, and floating name tag.

### Mounts & Bulldozer Transformation
When mounted, the warrior lifts vertically in 2.5D space onto the mount's saddle:
- **Warhorse**: Chestnut muscular body and arched neck, dark flowing mane and tail, golden bridle and trimmed saddle cloth, 4 animated galloping legs.
- **Giant Tortoise**: High-domed emerald/forest-green armored carapace with hexagonal scute seams and golden-tan lower rim, 4 sturdy clawed legs, wrinkly olive neck and wise-eyed reptilian head poking out the front, saddle cushion on top.
- **War Elephant**: Towering slate-gray body and 4 pillar legs, ornate crimson-and-gold war-howdah blanket and forehead frontlet, large flapping ears, swaying trunk, and twin curved ivory tusks.
- **Motorcycle (Chopper)**: Upright front and rear tires with chrome hubs and fenders, telescopic chrome forks, wide handlebars with rubber grips, metallic red teardrop fuel tank with gold badge, finned engine block, dual chrome exhaust pipes emitting motion smoke puffs, leather saddle, and a forward translucent halogen headlight cone on the turf.
- **Bulldozer Transformation**: Oversized heavy construction vehicle (40% larger scale) in Caterpillar hazard yellow (`#ecc94b`) and dark gunmetal—dual animated steel grouser caterpillar tracks, twin hydraulic lift arms pushing a massive curved steel front blade with yellow/black hazard striping, radiator grille, smoking diesel exhaust stack, tinted armored cab with flashing amber roof beacon, and fading twin-tread grass tracks left behind for 20 seconds.

### Iron Chain & Warhammer Variants
- **Suspended Iron Chain**: Ground shadow underneath a catenary-sagging 3D chain of alternating tilted metallic torus links. As elastic tension rises, the steel links heat-shift from cool slate gray toward glowing amber-gold.
- **Default Spikey Mace**: Heavy dark-steel sphere ringed with 8 metallic conical spikes, specular top-left highlight, scaling visually larger as mass increases, leaving translucent motion-blur afterimages at high speed.
- **Whirlwind Visuals**: 5 escalating color tiers for connective wind ribbons, vortex swirl rings, and afterimage trails:
  1. Level 1: Mint (`#a7f3d0`)
  2. Level 2: Emerald (`#34d399`)
  3. Level 3: Cyan (`#38bdf8`)
  4. Level 4: Purple (`#c084fc`)
  5. Level 5: Gold (`#fbbf24`)
  *(Blends with fiery orange-gold when paired with Flame or Jack-o'-Lantern.)*
- **Bomb / Flame Auras**: Pulsing fiery orange aura ring or live flickering flame tongues & rising ember particles.
- **Disco Ball**: Rotating 3D mirrored silver sphere with animated latitude/longitude facet tiles, 4-point star sparkles, rainbow trail sparkles, and 6 rotating translucent colored light beams casting glowing spotlight ovals onto the grass.
- **Jack-o'-Lantern**: Ribbed 3D orange pumpkin gourd with twisted green stem and curly vine, warm flickering candlelight pool on the grass, and glowing carved triangular eyes, nose, and jagged toothy grin that subtly turns with swing direction.
- **Spider Hammer**: Glossy obsidian-black giant Black Widow spider with 8 articulated skittering chitin legs, crimson joint accents, iconic dorsal red hourglass emblem, 8 glowing red eyes, silk-dripping fangs, and wispy white web strands.
- **Thor Hammer (Mjölnir)**: Chiseled rectangular beveled Uru steel warhammer head on a leather-wrapped handle with Nordic gold trim, glowing cyan ground energy pool, crackling electric ring, and animated cyan/yellow lightning arcs.

### Zombies, Special Enemies & Boss Hand
- **Base Zombies (Shambler / Walker / Brute)**: Hunched 2.5D undead silhouettes in muted olive/moss decaying skin tones (`#688f5e` / `#567a4e` / `#486643`) and tattered dark earth-tone coats, outstretched reaching arms, shuffling boots, cranial scars, sunken eye sockets with glowing yellow-red eyes, gaping jaws, and floating miniature health bars when damaged.
- **Armored Mob Zombies**: Clad in forged steel breastplates with chest highlights, gorgets, brass-buckled belts, corner rivets, steel pauldrons/vambraces/gauntlets, and medieval barbute/bascinet helmets with nasal bars.
- **Motorcycle Zombies**: Dark-jacketed undead bikers gripping chopper handlebars with feet on footpegs and forward headlight beams; crashing leaves a toppled, smoking red-and-chrome motorcycle wreck on scraped turf that fades out over 5 seconds.
- **Limb Loss & Spectral Ghosts**: Missing arms show torn sleeves and bloody bone nubs; missing legs change gait to single-leg hopping or torso crawling; headless zombies display severed neck stumps. Severed limbs and slain zombies turn into translucent ethereal ghosts with glowing spectral eyes and wisps that drift upward as they fade.
- **Status Effect Visuals on Zombies**:
  - *Burning*: Engulfed in animated layered orange-red/yellow-white flame tongues, fiery ground ring, and rising ember particles.
  - *Fireproof*: Charred, darkened ashen skin tone after extinguishing.
  - *Feared*: Pale ghostly violet-blue pallor with pulsing violet-cyan aura ring.
  - *Dancing*: Alternating Saturday Night Fever skyward-pointing arms, rhythmic bounce, colorful rotating disco floor spotlight under their feet, and floating musical notes (`♪`). Post-dance immunity displays a subtle dashed silver-magenta floor ring.
  - *Webbed*: Sticky white silk web mat on the turf beneath, arms pinned tight, translucent silk cocoon sheen and crisscrossing bright white silk bindings across torso, limbs, and head.
  - *Knocked Down (Earthquake)*: Full dedicated horizontal sprawled pose lying flat on the grass with dust ring, dizzy X-eyes, and an orbiting golden stun halo with stars.
- **Boss Hand & Twilight Vignette**:
  - **Atmospheric Vignette**: While a Boss Hand is alive, a dual-layer spooky dark-violet radial vignette centers dynamically on the boss hand, dimming and tinting the outer arena edges in pulsing purple twilight to focus dramatic tension.
  - **Anatomical Undead Hand**: Huge hovering pale-lavender/necrotic purple (`#b195c4`) dorsal hand casting a wide floating shadow. Features sculpted thenar/hypothenar muscle contours, branching subcutaneous veins, severed wrist cuff showing exposed muscle fascia and radius/ulna bone cross-sections, taut extensor tendons tracking finger spread, sculpted knuckles, anatomical phalanx segments with skin creases, sharp necrotic claws with pale lunulae on distal tips, and a gleaming gold band with a faceted crimson ruby on the ring finger. Detached segments reveal torn proximal flesh rims and exposed bone condyles; defeat blinks the hand brightly in gold/white before vanishing.

---

## 5. Pickup Tokens & Visual Affordance

All 17 powerups share a unified **2.5D floating obsidian puck** language so players instantly recognize collectibles on the grass:
- Foreshortened ground shadow + softly pulsing colored aura halo.
- Extruded dark-metallic disc bobbing vertically with a color-coded side rim, glowing top border, and crisp miniature vector emblem inside:
  - `link`: Gold interlocked chain rings.
  - `weight`: Silver trapezoid anvil/weight.
  - `health`: Emerald medical cross.
  - `bomb`: Orange round bomb with lit spark fuse.
  - `speed`: Sky-blue double chevrons (`>>`).
  - `flame`: Flickering orange/gold flame droplet.
  - `hammer`: Lavender spiked mace.
  - `horse`: Amber chestnut horse head silhouette.
  - `tortoise`: Emerald domed shell with tiny head & claws.
  - `elephant`: Sky-blue elephant head with trunk & white tusk.
  - `earthquake`: Gold jagged fault crack with tremor arcs.
  - `fear`: Pale violet screaming skull mask.
  - `bulldozer`: Yellow caterpillar dozer silhouette with steel blade.
  - `disco`: Pink/silver faceted mirror ball.
  - `jackolantern`: Carved glowing orange pumpkin.
  - `spider`: White-rimmed black widow spider with red hourglass.
  - `thor`: Beveled steel Mjölnir crossed by a yellow lightning bolt.

---

## 6. UI Layout, Modals & Responsive Behavior

### Viewport Composition
- **Full-Bleed Canvas (`100vw × 100vh`)**: No page scrollbars; `cursor: crosshair` over the arena.
- **Top-Left Panel**: Vital bars (HP, optional Mount/Bulldozer bar), 2x2 monospace physics/kill stat cards, chain tension gradient bar, and alive player count.
- **Top-Right Panel**: Square `Grasslands Radar` minimap (dark green turf, white translucent viewport frame, gray bordered stone columns, black/silver pickups, green zombie dots, colored teammate dots, local warrior dot, and gold mass-scaled hammer dots) stacked directly above the compact Top-10 Leaderboard list.
- **Top-Center Zone**: Reserved for non-blocking transient status overlays (Observer Mode banner, Earthquake / Knockdown canvas banners).
- **Bottom-Right Corner**: Translucent circular gold-rimmed **Touch-Wheel** with dashed inner deadzone ring and glowing amber-gold thumb puck (illuminates border/glow while active).
- **Centered Frosted Modals**: Full-screen dark blurred scrim (`backdrop-filter: blur(6px)`) centering a gold-trimmed dark-pine card for Welcome/Nickname Entry, Victory celebration (with soft golden outer glow), and Game Over summaries.
- **Mobile / Narrow Viewport (`≤ 720px`)**: Compact widths and paddings for the top-left and top-right HUD panels and scaled-down minimap so the center battlefield remains unobstructed.

### Combat VFX & Feedback Language
- **Bomb Blasts**: Multi-stop radial fireball gradient (white-hot center → yellow → orange → crimson) with 12 radiating triangular blast rays, outer blast-radius indicator ring, and an elevated 2.5D rising fireball dome.
- **Thor Lightning Blasts**: Cyan electric field dome, 8 jagged branching radial ground lightning bolts, and a dramatic vertical sky-to-impact white/cyan bolt.
- **Earthquake**: Combined canvas shake, slight canvas rotation, subtle CSS DOM canvas shake/scale, glowing gold screen border pulse, amber-rimmed dark seismic ground fissures, scattered flying dust/pebble particles, and top-center status banner.
- **Floating Text**: Rising, fading bold monospace callouts—white for normal hits, gold/enlarged for big blows (`≥ 50`), cool silver for chain hits, orange for burn/bombs, sky-blue for Thor, crimson for player damage, and color-matched labels on pickup collection.
