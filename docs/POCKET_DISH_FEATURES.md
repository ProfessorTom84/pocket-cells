# Pocket Dish: feature and tuning reference

Every system in the game, what it does, and the value to change to tune it.

**Where the code is:** the `dish` branch of `pocket-cells_vF`, checked out at
`~/Documents/GitHub/pocket-dish-work`. Paths below are relative to that checkout.
Line numbers are as of commit `baac2ac`. "Knob" means the value to change.

---

## Contents

1. [How the code is laid out](#1-how-the-code-is-laid-out)
2. [The world](#2-the-world)
3. [Species](#3-species)
4. [Minds: goals and decisions](#4-minds-goals-and-decisions)
5. [Temperament and individual cells](#5-temperament-and-individual-cells)
6. [Population control](#6-population-control)
7. [Mutations and synergies](#7-mutations-and-synergies)
8. [Looks](#8-looks)
9. [Splits](#9-splits)
10. [Emotes and other animations](#10-emotes-and-other-animations)
11. [Wonders](#11-wonders)
12. [Visitors](#12-visitors)
13. [Your controls](#13-your-controls)
14. [Making things obvious](#14-making-things-obvious)
15. [The shop](#15-the-shop)
16. [Quests and waves](#16-quests-and-waves)
17. [Progression](#17-progression)
18. [Talk](#18-talk)
19. [Story, save, web build](#19-story-save-web-build)
20. [Good first knobs to try](#20-good-first-knobs-to-try)
21. [Known gaps and open questions](#21-known-gaps-and-open-questions)

---

## 1. How the code is laid out

| File | What it does |
|---|---|
| `common/dish.c` / `dish.h` | The world: cells, physics, food, deaths, splits, visitors, wonders, placed items, the save file |
| `common/dish_brain.c` | The minds: the line the AI reads, the fallback rules brain, and population control |
| `common/dish_ai.c` | Runs the small AI model on the board (not used in the web build) |
| `common/dish_mut.c` | The 16 mutations, the draft (pick-a-card) system, the 8 synergies |
| `common/dish_talk.c` | All dialogue: voices, meetings, population lines, pokes |
| `common/dish_render.c` | All drawing in the dish: cells, looks, splits, emotes, wonders, placed items |
| `common/dish_ui.c` | Touch, buttons, pages, the shop page, bubbles, the coach, hints, sounds |
| `common/dish_prog.c` | DNA, badges, unlocks, Microbe-Dex, the visitor director, the shop's items |
| `common/dish_quest.c` | Quests and attack waves |
| `common/dish_story.c` | The journal and once-a-minute chart samples |
| `sim/web_main.c`, `sim/web/index.html` | The browser build and its page |
| `sim/dish_main.c` | The desktop simulator and all selftests |

Each frame runs `dish_tick` once. Inside it: the census of every strain, then
each strain's mind, then every cell's update, then the food and waste fields,
wonders, placed items, meetings, quests and the story.

**Checking a change:** from `sim/`, run `make dish-check` (one board shape) or
`make dish-check-all` (all four). There are 12 selftests; all must pass.
`make web` rebuilds the browser version into `sim/web-dist/`.

---

## 2. The world

Files: `common/dish.h:50–59`, `common/dish.c`.

- **Size limits:**
  - Up to 192 cells in the dish (`DISH_MAX_CELLS`), with the last 32 slots kept for viruses (`dish.c:861`).
  - Up to 6 strains at once (`DISH_MAX_STRAINS`), so at most 5 visitors alongside your pet strain.
- **The dish's fields:** 32×32 grids across the dish (`FIELD_N`) for:
  - Food: fresh agar starts at 0.12 and slowly regrows toward 0.06. Food above 0.45 spoils into waste.
  - Waste: fades with a 600-second time constant. Above 0.45 it hurts cells.
  - Antibiotic: only the mold leaks it now; fades with a 90-second time constant.
  - Currents: made by dragging, tilting, or the rotifer.
- **The dish's conditions:**
  - Temperature: about 0.5 by day, 0.42 at night. Warm vents add heat locally.
  - pH: lactobacillus visitors push it sour; it drifts back once they leave.
  - Salt: halophile visitors push it salty; it drifts back once they leave.
- **Light:** the lamp (day), your held finger, and glow crystals (`dish_light_at`).
- **Day and night:** double-tap the dish to switch. Night dims everything and cools it slightly.
- **How cells move:** run-and-tumble. A cell keeps swimming while food gets
  better and turns randomly when it doesn't. On top of that come the strain's
  goal, contact with other cells, currents and tilt.
- **Comfort and stress** (`dish_stress`): how far heat, pH and salt are from
  what the cell's genes prefer. It slowly drains health.
- **Old age:** cells start dying of age somewhere between 360 and 540 seconds (`dish.c:820`).
- **What each cell inherits** (`genome_t` in `dish.h`): speed, size, hue,
  preferred heat, salt tolerance, drug resistance, virus resistance, split
  rate, preferred pH.
  - Small random changes at every split (`mutate`).
  - Changes are 1.5× bigger while the strain is exploring.
  - Visible results: a strain raised warm turns red, raised cold turns blue,
    salty grows a shell, drug-resistant grows armour plates.
- **A cell's energy** is capped at 1.1: light can't overfill it.

---

## 3. Species

File: `common/dish.c:34–51` (the `SP[]` table).

Columns: radius in pixels, speed, metabolism (energy burned per second), how
much it eats, energy from light, and damage per second to cells it touches
while hunting.

| Species | Radius | Speed | Metab. | Eats | Light | Bite | Role |
|---|---|---|---|---|---|---|---|
| coccus | 5.5 | 10 | .0035 | .030 | – | – | Sticky beads; starter, rival visitor |
| bacillus | 4.6 | 30 | .005 | .032 | – | – | Default starter |
| spirillum | 3.4 | 40 | .006 | .030 | – | – | Fast corkscrew, likes warmth |
| cyano | 4.2 | 4 | .003 | .008 | .006 | – | Friendly, feeds on light |
| myxo | 3.8 | 20 | .005 | .010 | – | .12 | Hunter |
| phage | 2.8 | 9 | – | – | – | – | Virus: infects, host bursts |
| mold | 3.6 | 0 | .003 | .020 | – | – | Grows from the edge, leaks antibiotic |
| vibrio | 2.0 | 55 | .006 | .004 | – | .45 | Tiny fast hunter |
| lacto | 3.8 | 14 | .004 | .030 | – | – | Makes the dish sour |
| halophile | 4.0 | 6 | .004 | .026 | – | – | Makes the dish salty |
| symbiont | 3.8 | 18 | .003 | .010 | .004 | – | Friendly, leaves food behind |
| ciliate | 8.5 | 16 | .004 | .010 | – | – | Friendly guardian: eats viruses and hunters |
| donor | 4.2 | 20 | .004 | .025 | – | – | Friendly: touching your germs gives a free mutation |
| **amoeba** | 7.5 | 7 | .0045 | .015 | – | .18 | Swallows cells smaller than 0.7× its size (35% chance per second of contact, `dish.c:1024`) |
| **diatom** | 5.5 | 2 | .002 | .004 | .006 | – | Friendly: tops up food in light (never past 0.35, below the spoil line), heals your germs by 0.05 per second |
| **rotifer** | 9.0 | 15 | .0045 | .014 | – | – | Wild card: pulls a current toward its mouth, eats viruses and spores, eats small cells when hungry |

Other species knobs:

- Colours and preferred conditions: `dish_species_genome`.
- How many arrive per visit: the `N[]` table in `dish_visit`.
- How long visitors stay: friends 300–420 s, others 360–540 s (`dish_visit`).
- Which species count as friendly: `SPECIES_FRIENDLY[]`, top of `dish.c`.
- **Starters:** bacillus, coccus, spirillum, cyano, vibrio, myxo. The last three cost DNA to unlock.

---

## 4. Minds: goals and decisions

Files: `common/dish_brain.c`, `common/dish_ai.c`.

- **When minds decide:** each strain re-decides every 3–4.5 seconds (`ASK_S`, `dish.c:16`).
- **The 12 goals:** forage, cluster, explore, rest, divide, spore, seek light,
  avoid light, hunt, flee, guard, befriend. The last four are aimed at another strain.
- **On the board:** a 14-million-parameter AI model reads a one-line
  description of the strain's situation (`dish_encode`). It answers with a
  goal, a target, an urgency and what to say.
  - The new creatures are described to it as the closest existing species:
    amoeba as myxo, diatom as cyano, rotifer as ciliate (`kind_word`). This
    keeps the existing model working without retraining.
- **In the web build:** a hand-written rules brain (`rules_goal`) makes the
  same kinds of decisions. Rough priorities:
  - Threat nearby: turn to spores if weak, fight if strong, otherwise flee or huddle.
  - Then: low comfort, light, hunger, friends, prey, crowding, night, splitting.
- **What you see:** thought lines (dashed lines toward the target), the
  microscope lens text, and emote bubbles.

---

## 5. Temperament and individual cells

File: `common/dish.c` (`dish_temper` at line 485; per-cell steering around line 935).

- **Four traits per strain**, each 0–1: bold, social, curious, ruthless.
  - A base value per species (the `BASE[]` table in `dish_temper`).
  - ±0.15 of personal variation from the strain's look.
  - Mutations push them:
    - Ruthless: +0.06 per tier of engulf, toxin, spikes, grapple.
    - Social: +0.06 per tier of symbiosis, quorum, biofilm, swarm.
    - Curious: +0.07 per tier of scouts, lure.
    - Bold: +0.05 per tier of zap, spikes; −0.05 per tier of jet, mimic.
- **Each cell also has its own traits**, fixed from its ID, mixed 60/40 with the strain's:
  - Curious cells (above 0.62) swim over to look at the nearest stranger within 170 px.
  - Social cells (above 0.7) return to the colony when more than 45 px away.
  - Speed varies ±15% with boldness.
  - Bold cells split slightly sooner.
- **Swarm mind** cancels 32% of individuality per tier (`indiv`, line 939).

Temperament also picks each strain's voice (section 18) and drives population
control (section 6).

---

## 6. Population control

Files: `common/dish_brain.c:180` (`dish_pop_policy`), `common/dish.c:1226` (`pop_pressure`).

**Pressure, from 0 to 1,** is the largest of:

- Room: how full the dish is, starting at 55% of the 160 non-virus slots.
- Crowding: only counts once the colony passes 25 cells.
- Hunger: low energy with little food nearby, once the colony passes 10 cells.

**When it acts:** colonies of 16 or more cells (`dish_brain.c:183`). A policy
starts above 0.4 pressure and ends below 0.28. It's re-checked every 4–6 seconds.

**Choice:** each option gets a score; the highest wins. The current policy gets
a +0.15 bonus so colonies don't flip back and forth.

| Policy | Score formula (`dish_brain.c:189–193`) | What happens |
|---|---|---|
| Hold back | 0.5 + 0.6·social − 0.3·ruthless | No new splits; blue pulse rings |
| Eat its own | 1.2·ruthless + 0.5 if energy < 0.35 − 0.4·social | Strong hungry cells bite weaker siblings for 0.25 health (2.5 tries a second); splits slower |
| Sacrifice | 0.8·social + 0.3 if energy < 0.4 − 0.5·ruthless | Old cells (over 150 s) or worn cells (under 0.55 health) give themselves up at a 6%-per-second chance, leaving a golden food burst (`dish.c:841`) |
| Settlers | 1.0·curious + 0.4·bold + 0.3 if crowded − 0.5 if threatened | Cells with curiosity above 0.6 travel to the richest far-off spot; a dotted trail and flag show where |
| Sleep it off | 0.4 if a spore-former + 0.6 if uncomfortable + 0.3·(1 − bold) | The timid half turns into spores |

Every policy change gets an emote bubble (tap to read the line); your colony's
also gets a toast and a journal entry.

---

## 7. Mutations and synergies

File: `common/dish_mut.c` (table `MUTS[]`, synergies `SYNS[]`). Effects are in `common/dish.c`.

### Drafts

- A pick-of-three every 2 generations (`DISH_DRAFT_GENS`, `dish.h:59`). The dish pauses until you pick.
- Cards that answer the dish's current troubles are 1 + 4× more likely.
- A pressing trouble always gets at least one card that answers it.
- Rare cards come up at 0.7× and epic at 0.3× the common rate. Upgrading a card you already own is 1.3× more likely.
- Each mutation has 3 tiers.
- **Troubles the draft responds to:** hunters, virus, medicine, acid, salt, hunger, darkness, crowding, rivals.
- **Evolving is visible:** when a mutation is taken, a ripple runs out from
  the colony's middle and every cell boings (section 10).

### The 16 mutations

Numbers are per tier.

| Mutation | What it does | Where in `dish.c` |
|---|---|---|
| Spikes | Touching it hurts attackers 0.06 health per second | 1009 |
| Toxin cloud | A haze hurting nearby cells 0.03 per second; range +6 px per tier | 1010 |
| Zap | Every 7.5 − 1.5 s: stuns and hurts strangers within 30 + 10 px | 1323 |
| Jet | Short bursts of speed away from danger | `case ST_FLEE` in `cell_tick` |
| Engulf | Swallows smaller cells whole (0.6 chance per second); +0.35 energy | 1019 |
| Swarm mind | The colony swims as one school | `M_SWARM` in `cell_tick` |
| Biofilm wall | 12% of cells become anchors that soak up harm | `is_anchor` |
| Sunlight | Light feeds it (+0.005 per tier) | `M_PHOTO` in `cell_tick` |
| Glow lure | Pulls strangers in from 80 + 30 px | 932 |
| Spore burst | A dying cell leaves spores that hatch in 15–25 s | `kill` |
| Virus tamer | 30% chance per tier to turn a virus to its side | `M_TAMER` in `cell_tick` |
| Mimicry | Hunters' bites do 25% less per tier; viruses miss more | `bite_k` |
| Scouts | 6% of cells per tier roam and mark food for the colony | `is_scout` |
| Grapple | Latches on, drains and drags prey home | 1035 |
| Symbiosis | Friends stay and share; at tier 3 they give free mutations | `M_SYMBIOSIS` in `cell_tick` |
| Quorum bloom | At 45 − 5 cells, a 12-second boom in splitting every 80 − 15 s | 1369 |

### The 8 synergies

Any tier of both parts counts. Each is announced the first time, and the card
that would complete one glows gold. The colony's name changes to the synergy's.

| Synergy | Parts | Effect |
|---|---|---|
| Storm School | Zap + Swarm | Each zap jumps on to one more stranger within 45 px |
| Angler | Lure + Engulf | Lure reaches +60 px and pulls 1.5× harder; swallows lured prey without hunting |
| Smog Trail | Toxin + Jet | Jetting leaves poison, 0.25 health per second within 30 px |
| Battering Ram | Spikes + Jet | Jetting into enemies does 1.2 per second, knocks them back and stuns |
| Solar Reef | Sunlight + Biofilm | Anchor cells grow green spires that make food in light |
| Spore Bombs | Spore burst + Toxin | A fallen cell bursts, hurting strangers within 35 px by 0.35 (`dish.c:575`) |
| Siren | Mimicry + Lure | Takes on the nearest enemy's colour; bites do another 40% less, viruses miss 20% more |
| Murmuration | Swarm + Quorum | The school wheels in a spiral, 20% faster, with a rainbow wake |

Adding a synergy: add an entry to the `SYN_*` list in `dish_mut.h` and to
`SYNS[]` in `dish_mut.c`, then write its behaviour in `dish.c` (check
`g_syn[strain] >> SYN_X & 1`) and its look in `draw_muts` in `dish_render.c`.

---

## 8. Looks

Files: `common/dish.c` (`dish_morph_step`), drawn in `common/dish_render.c` (`draw_cell`).

- **Each strain has its own randomly drawn look:** body pattern (plain,
  stripes, spots, inner ring, two-tone), second colour, frills (0–9), eyes
  (one, two or three, pet only), and wobble.
- **Every mutation pick changes one of those features.** The draft card
  previews the creature with that change applied.
- **Visitors get their own random look,** so no two arrivals look alike.

---

## 9. Splits

Files: `common/dish.c` (`divide`, line 605), `common/dish_render.c` (`draw_cell` from line 374; `PT_BURST` at line 748).

A split takes 2.6 s (`DISH_DIV_TIME`, `dish.h:55`) and plays in three acts:

1. **Build-up:** the cell swells to about 1.3× and pulses with a heartbeat that
   quickens as the moment nears. A glow in its colour grows around it. At 45%
   a white seam lights across its middle, and two cores pull apart inside it.
   In the last 30% a white ring closes in on it, and the cell shivers.
2. **The pop:** a white flash, two rings bursting out to about 44 px, and ten
   sparkles flung outward, plus 4 sparks along the seam. The daughter springs
   away at 34 px/s and the mother recoils at 22. For your colony, a "+1" in its
   colour floats up and a little star rises.
3. **Settling:** both cells boing in from about half size, overshoot, and settle (0.7 s).

Extras:

- Every 10th split of your colony, or every 5th generation record: confetti.
- **Shinies:** 1 in 90 of your colony's births (`dish.c:645`). Tap one for +5
  DNA. The lifetime count is saved.
- **Particle cap:** 160 on screen at once (`DISH_MAX_PARTS`).

Knobs: swell and heartbeat in `draw_cell` (the `p0` lines); burst size in
`PT_BURST` (`40 * e` is the outer ring's radius); "+1" height in `divide`.

---

## 10. Emotes and other animations

Files: `common/dish.c` (`dish_emote` at line 170, `every` at line 176),
`common/dish_render.c` (`draw_emote`).

**Emotes** are little icons that pop in over a cell and float up. They're for
your colony only, and come at a rate per colony (not per cell), so a big colony
is no noisier than a small one.

| Emote | When | Rate |
|---|---|---|
| Heart | A friend (diatom, symbiosis partner) touches your germs | 0.4 a second |
| Zzz | Night, while resting or as spores | 0.35 a second |
| ! | A threat arrives, or your colony decides to flee | Once |
| ? | A friendly visitor arrives; a curious cell goes to look at a stranger | Once / 0.25 a second |
| Sweat drop | Uncomfortable (comfort under 0.35) | 0.3 a second |
| Ghost | One of your cells dies (60% of deaths; not sacrifices) | – |
| Music note | Well fed and sitting on rich food | 0.2 a second |

Emotes use their own random-number source (`g_fx`, `dish.c:168`), so they never
change how the simulation plays out.

**Other animations:**

- **Evolution ripple:** taking a mutation sends a wave out from the colony's
  middle; each cell boings as it reaches it (`dish_mut_take`).
- **Visitor arrival:** a flash, a ring and eight sparks in the visitor's
  colour at the glass edge (`dish_visit`).
- **Flying DNA:** earned DNA flies in arcs from where it was earned (the
  colony, or where you tapped) into the counter, which glows on arrival (`draw_flies`).
- **Placed items** drop in with a bounce and push cells aside; each then idles
  (crystal pulses, vent glows and bubbles, fountain ripples).
- **Emote bubbles** pop in big, settle and bob (section 18).

---

## 11. Wonders

File: `common/dish.c` (`dish_wonder`, `wonder_tick`, around lines 1405–1470).

- **Timing:** first one after 50–90 seconds, then every 80–150 seconds
  (`dish.c:1455`). At night there's a 50% chance it's glowing plankton.
- **Food rain:** 9 seconds of falling food drops, about 3 per second.
- **Air bubble:** rises for up to 34 s and pushes cells aside. Tapping it pops
  it for +3 DNA and throws nearby cells outward (`dish.c:1439`).
- **Pollen grain:** 45 seconds, releasing 0.22 food per second while shrinking.
- **Glowing plankton:** 40 seconds of glowing motes, with cells lit up. Night only.
- Switching wonders off (as the tests do): set `wonder_cd = 1e9`.

---

## 12. Visitors

- **Director** (`common/dish_prog.c`):
  - First visitor after 120–180 s, then every 180–360 s. Gaps shrink up to 40% as the run gets later.
  - Early on, friends are more likely; later, threats are.
  - No threats arrive before your first mutation (the coccus and rotifer can).
- **Guest cap:** a visitor strain stops splitting at 40 cells (`GUEST_CAP`,
  `dish.c:17`), so guests can never crowd your colony out of its own dish.
- **Visitors' own mutations** (`dish_visitor_build`, `dish.c:452`): after your
  first mutation, 55% arrive with one random tier-1 mutation, and some of those
  with two. Friendly visitors only get friendly mutations (swarm, biofilm,
  sunlight, scouts, symbiosis, quorum, jet, mimicry, spore burst, lure), so a
  friend can't hurt your colony by hugging it.
- **SAMPLE dropper** (`dish_sample`, `dish.c:462`): holds up to 2 drops,
  refilling one every 45 seconds (`dish.c:1539`).
  - Each new creature is 1.4× likely, friends 1.0, threats 0.7, viruses 0.3.
  - It never picks something already in the dish, or your own species.
  - If 5 visitors are already here, nothing comes and the drop isn't used up.
- **Wild viruses:** after 240–480 seconds (`dish.c:290`).
- **Gene gift:** a free mutation when a donor touches your germs, at most every 45 seconds (`GIFT_CD`, `dish.c:15`).

---

## 13. Your controls

File: `common/dish_ui.c`.

- **Hold:** light. Food grows under it and it warms the spot slightly.
- **Drag:** makes a current.
- **Tap a germ:** pokes it. It jumps, answers you in words, and opens the 5× microscope lens.
- **Tap a shiny germ:** collects it (+5 DNA).
- **Swipe a germ fast:** flicks it (up to 700 px/s).
- **Double-tap:** day or night.
- **Tilt (arrow keys, or a phone's motion sensor):** everything drifts downhill.
- **Tap an emote bubble:** reads what the germ said, and what it's up to.
- **Tap an air bubble:** pops it (+3 DNA).
- **Corner buttons:**
  - STORY (top left): the journal and charts.
  - DISH (top right): your strain's card, the Microbe-Dex and badges.
  - WALL (bottom left): draw a barrier that lasts 20 seconds; 3 at most, one more every 12 seconds.
  - SAMPLE (bottom right): the dropper.
- **The DNA counter (top, "DNA · SHOP"):** opens the shop. While you're
  placing an item it reads "CANCEL".
- **Web keys:** N lamp, V visitor, F 10× speed, D +50 DNA.

---

## 14. Making things obvious

File: `common/dish_ui.c`.

- **The coach** (`draw_coach` at line 1274; timing at line 469): when you've
  been idle for 7 seconds (18 seconds once you've tried holding for light), a
  translucent ghost finger performs a gesture you haven't tried yet, on the
  real target, with a caption in the explanation bar pointing at it. Order:
  hold for light, tap a germ, drag a current, SAMPLE, SHOP, flick, double-tap,
  WALL. SAMPLE is only shown when the dropper has a drop; SHOP when you can
  afford something. Touching the screen dismisses it.
- **Tried gestures** are remembered in the save (`TRY_*` bits in `d->hints`),
  so the coach never repeats something you've done.
- **NEW tags:** a bouncing gold "NEW" and a soft glow on SAMPLE (while it has a
  drop and you haven't used it), on WALL (after the first minute, until used),
  and on the shop pill (until opened, once you have 4 DNA).
- **The shop pill glows gold** whenever something in it is affordable and useful right now.
- **First-use explanations:** the first SAMPLE tells you to watch the edge;
  WALL explains drawing; the shop shows what each item does on the first tap.
- **Older first-time hints** still appear for visitors, quests, waves, the
  STORY and DISH buttons, tilting, shinies and bubbles (`hints_tick`).

---

## 15. The shop

Files: `common/dish_prog.c` (items and prices at line 131, `dish_shop_buy` at
line 152), `common/dish_ui.c` (`draw_shop` at line 1248), `common/dish.c`
(`dish_place_decor` at line 672, and the items' effects in `dish_tick`).

**Buying:** tap an item once to read what it does ("… TAP AGAIN TO BUY"), and
again to buy. Items marked "stays" (a small dot) ask you to tap where in the
dish to put them. Tapping the DNA pill cancels placing.

| Item | Cost | What it does |
|---|---|---|
| Food drop | 4 | A big drop of food where you tap |
| Air bubble | 6 | Starts an air-bubble wonder. Pop it for 3 back |
| Dropper refill | 8 | One more drop for SAMPLE (only when it's empty) |
| Friend call | 30 | A friendly visitor comes: diatom, symbiont, ciliate, cyano or donor |
| Rock (stays) | 15 | A mossy rock, 15 px radius. Nothing passes through it: cover from hunters, a breakwater for currents |
| Glow crystal (stays) | 25 | Light around it (+0.6, about 45 px), day and night; slowly grows food |
| Warm vent (stays) | 25 | Warmth around it (+0.2 temperature, about 45 px); heat-lovers gather |
| Food fountain (stays) | 40 | Food bubbles up forever (0.05 a second, never past 0.6) |
| Gene capsule | 60 | A mutation draft right now |

- Up to 6 placed items at once (`DISH_DECOR`). Placing a 7th replaces the oldest.
- Placed items are saved with the dish.
- Items that wouldn't do anything right now are greyed out (a bubble already
  rising, a full dropper, a full dish).
- **DNA income for comparison:** roughly 5–10 a minute of ordinary play, more
  with quests, badges, bubbles and shinies.

---

## 16. Quests and waves

File: `common/dish_quest.c`.

| Quest | Goal | Time limit | Reward (DNA) |
|---|---|---|---|
| Light | Shine light on them, 6 units | 40 s | 5 |
| Grow | Grow by a third, at least 5 cells | 150 s | Line 32 |
| Herd | Get them into a ring | 60 s | 8 |
| Defend | Lose 4 or fewer | 40 s | 10 |
| Flick | Flick away 3 threats | 40 s | 6 |
| Wall | Block 40 hits with walls | 45 s | 6 |
| Friend | Meet the friendly visitor | 60 s | 6 |

- **Gaps:** 25–45 seconds between quests (`:118`).
- **Waves:** an attack announced 5 seconds ahead, then a 35-second fight
  (`WAVE_WARN_S`, `WAVE_FIGHT_S` in `dish_quest.h`). Every 240–360 seconds
  (`:99`). Lose 6 or fewer to win.

---

## 17. Progression

File: `common/dish_prog.c`.

- **DNA:**
  - 1 for every 4 of your colony's splits.
  - 2–3 for good care (feeding the hungry, curing, cleaning), at most every 15 seconds.
  - 10 per badge (`BADGE_DNA`, `dish_prog.h:18`).
  - Quest rewards, 3 per bubble, 5 per shiny.
  - Spent in the shop (section 15) and on starter unlocks.
- **17 badges:** first split, generation 10 and 50, a hundred cells, comeback,
  survivor, resistant, shelled, fire germ, ice germ, spores, the zoo, long run,
  weathered, epic gene, full build, friendly.
- **Unlocks:** the cyano, vibrio and myxo starters cost 40, 80 and 100 DNA.
- **Microbe-Dex:** 16 species plus 4 evolved forms (warm, icy, shell, armour).
- **Runs:** if your colony dies out, the spore vault brings it back once,
  after 30 seconds (`RESPAWN_S`, `dish.c:12`). A second extinction ends the
  run. DNA, badges, the dex and shinies carry over.

---

## 18. Talk

Files: `common/dish_talk.c` (lines), `common/dish_ui.c` (bubbles, `bubble_put` at line 161).

**Two kinds of bubble:**

- **Emote bubbles** for all ambient chatter: a small round bubble with just the
  emoji, which pops in, bobs and fades after 2.8 s. The words are kept: tap it
  to read what was said and what the germ is up to.
- **Text bubbles** (words, no emoji) only when a germ answers you directly: a
  poke, a flick, a shiny found.

**How often they talk:**

- Your colony speaks its mind every 32 ± 10 seconds (`dish_ui.c:436`).
- A pair of strains can talk at most every 25 seconds (`dish.c:1530`), and only
  one exchange happens across the whole dish every 12 seconds (`dish_ui.c:267`).

**What they say:**

- **Voice** comes from temperament, checked in this order (`dish_talk.c:100`):
  - Ruthless above 0.65: snarky.
  - Social above 0.7 and ruthless below 0.4: sweet.
  - Curious above 0.65: nerdy.
  - Bold above 0.65: dramatic.
  - Otherwise: grumpy.
  - Viruses are always snarky.
- **Subject:** the mind picks it (28 kinds, `SAY_*`); the voice picks the
  wording (`VOICED[]`). 25 subjects have a line in every voice.
- **Meetings:** the relationship is read from feelings (`dish_talk.c:197`):

  | Feeling score | Relationship |
  |---|---|
  | Below −0.45 | Nemesis |
  | Below −0.12 | Wary |
  | Above 0.5 | Best friend |
  | Above 0.15 | Pal |
  | Otherwise | Stranger |

  - Plus a predator/prey exchange when one is hunting the other.
  - Each side's line uses its own feeling, so one-sided crushes happen.
  - Opening lines are in `OPEN[]`, replies in `REPLY[]`; two lines per voice per relationship.
- **Feelings** (`dish_like`):
  - Down: −0.25 per kill, ongoing drops while being bitten, zapped or poisoned.
  - Up: shared food, diatom shelter, guarding.
  - Small daily changes: +0.002 per second just for touching; hunting another strain −0.004 per second.
  - All feelings fade toward neutral with a 900-second time constant (`dish.c:1552`).
- **Population lines:** `POLICY[]`, one per policy per voice.

**Writing new lines:** use only capital letters, digits, spaces and
`? ! . , - : ' / + % ~ < >` (the pixel font has nothing else). Keep a line to
four bubble rows of 15 characters, counting `{T}` (the other strain's name) as
about 9 characters. Lines now mostly appear when tapped, in the explanation bar.

---

## 19. Story, save, web build

- **Journal:** keeps the last 96 events: visits, decisions, mutations,
  synergies, policies, shinies, losses, quests (`common/dish_story.c`).
- **Charts:** the last 120 minutes, sampled once a minute.
- **Save** (version 9, `dish_save` / `dish_load` in `dish.c`): about 6 KB.
  Version 9 adds placed items. Older saves still load. New saved fields go at
  the end of the file.
- **Web build:** one WebAssembly file per board shape. Saves are kept in the
  browser's local storage, and time away is lived through on reload.

---

## 20. Good first knobs to try

| What | Value | Where |
|---|---|---|
| Shiny rarity | `1.0f / 90` | `dish.c:645` |
| How often wonders happen | `80, 150` seconds | `dish.c:1455` |
| Dropper refill time | `/ 45.0f` | `dish.c:1539` |
| How big a visitor can grow | `GUEST_CAP` 40 | `dish.c:17` |
| When colonies start controlling their numbers | `count < 16`, threshold `0.4f` | `dish_brain.c:183` |
| How eager each population policy is | score weights | `dish_brain.c:189–193` |
| How long a split takes | `DISH_DIV_TIME` | `dish.h:55` |
| Energy needed to split | `0.85f` | `dish.c:855` |
| Amoeba bite | `0.18f` | `dish.c:48` |
| Amoeba swallow chance | `0.35f` | `dish.c:1024` |
| How quickly grudges fade | `900.0f` | `dish.c:1552` |
| How often a mutation draft comes | `DISH_DRAFT_GENS` | `dish.h:59` |
| How often visitors come | `180, 360` seconds | the director in `dish_prog.c` |
| Shop prices and items | `SHOP[]` | `dish_prog.c:131` |
| How often your colony talks | `32 + 10 * sinf(...)` | `dish_ui.c:436` |
| Gap between any two conversations | `meet_cd = 12` | `dish_ui.c:267` |
| How long until the coach steps in | `7` / `18` seconds | `dish_ui.c:469` |
| Emote rates | the `every(...)` calls | `cell_tick` in `dish.c` |
| Split burst size | `40 * e` in `PT_BURST` | `dish_render.c:748` |

---

## 21. Known gaps and open questions

- **Unused unlocks.** The pH dial, salt dial, antibiotic and UV lamp unlocks
  still exist in `dish_prog.c` but have no button. They could be cut or
  turned into something else.
- **Leftover drug tools.** `dish_dose`, `dish_antiviral` and `dish_uv` are no
  longer player controls; only the selftests use them.
- **The AI model wasn't retrained.** On the board, the model still picks goals
  and what to say; the new creatures are described to it as existing species.
  Population control, voices, emotes and the shop are the game's own rules, not the model.
- **Hints and the coach overlap a little.** The older first-time hints (for
  example "hold to shine light") can appear before the coach demonstrates the
  same thing. Consider retiring the gesture hints now the coach covers them.
- **Placed items can't be moved or sold.** A 7th replaces the oldest; there's
  no way to pick one up.
- **Shop food earns care DNA.** Buying food for a hungry colony can trigger the
  2-DNA "good care" reward, so it costs 2 instead of 4 now and then.
- **Firmware not built.** The changes pass every selftest, but the board
  firmware hasn't been compiled with them (it needs the ESP-IDF toolchain).
  Emotes, the coach and the shop add drawing work per frame; worth checking the
  frame rate on a real board.
- **Desktop simulator key.** `sim/dish_main.c` still has `O` for a virus
  outbreak; the web build uses `V` for a visitor.
- **Unattended play.** In the selftest that plays 30 runs of 20 minutes with
  no player input, 3 runs die out, the same as before these changes.
