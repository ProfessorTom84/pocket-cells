# Pocket Dish: feature and tuning reference

Every system in the game, what it does, and the value to change to tune it.

**Where the code is:** the `dish` branch of `pocket-cells_vF`, checked out at
`~/Documents/GitHub/pocket-dish-work`. Paths below are relative to that checkout.
Line numbers are as of commit `baac2ac`; where code moved since (latest commit `191ccc1`), sections name the function instead. "Knob" means the value to change.

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
22. [Generations](#22-generations)
23. [Status labels, stats and the director](#23-status-labels-stats-and-the-director)

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
- **Stirring:** a finger's current reaches about 42 px around the stroke and
  carries cells at 1.1× its speed (anchored wall cells at half). A strong
  current (over 45 px/s) peels sticky cells loose and sets them tumbling; your
  germs give a swirl emote. Before this, a biofilm colony only moved 58% of its
  cells when stirred; now 100%.
- **Personal space:** colonies of 30+ cells keep a little room between cells
  when packed, so they don't ball up (not while basking in your light). Where
  cells are packed, their glow dims so a clump reads as cells, not a white blur.
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
- **Names:** 28 microbe-flavoured names to scroll through (STAPHANIE, MICROBERT,
  E. COLIN, PETRA DISH, SPOROTHY...), and tapping the name box rolls a made-up
  one from a germy front and a silly back ("STREPPOZILLA") (`NAMES[]`,
  `name_roll` in `dish_ui.c`). Plurals are fixed: cocci, bacilli, spirilla
  (`dish_plural_fix`).

---

## 4. Minds: goals and decisions

Files: `common/dish_mind.c` (the translator), `common/llm/advisor_core.c` (the model engine),
`sim/web_mind.c` + `sim/web/mind-worker.js` (the browser), `firmware/main/dish_app.c` (the board).

**Every colony's mind is the project's AI model.** It's the 14-million-parameter model distilled
from gemma4:26b that runs the fish tank (`model/out/model_q4.bin`, schema v4), used as is, with no
new training. It runs in the browser, in the desktop simulator, and on the board.

- **How a colony asks:** every 2.5 s or so, each colony describes its situation in the model's own
  words (`dish_mind_encode`):

  | Model's word | What it means for a colony |
  |---|---|
  | hunger | How empty it is (1 − energy) |
  | energy | Its health |
  | stress | Threats nearby, discomfort, infection |
  | curiosity, bold, social | Its temperament (section 5) |
  | stage | How big it has grown (fry under 4 cells, juv under 15, adult under 60, elder) |
  | trust | How it feels about your colony |
  | bored | How long it has kept its goal |
  | food | The richest food, or the nearest prey for a hunter |
  | friend | The strain it likes most |
  | bubble | Something worth visiting: your light, a crystal, vent, fountain, egg, pollen grain |
  | reef | A stranger or rival |
  | wall | The glass, if it's close |

- **How the answer becomes behaviour** (`read_back`):

  | Model's goal | Colony's goal |
  |---|---|
  | seek_food | Forage; hunt prey if a hunter; come to the light if green; split if full |
  | follow_friend | Visit the friend, or guard it if something hunts it |
  | inspect_reef | Go and meet the stranger, or fight it if they're rivals (or it's prey) |
  | visit_bubbles | Come to your light, or roam to the point of interest |
  | explore | Explore |
  | rest | Rest (spores in a harsh dish) |
  | dart_play | A burst of splitting if full, otherwise a roam |

  The model's urgency and how sure it is (its softmax) carry over.
- **Reflexes, below the mind** (as in the tank): fleeing a predator that is close to a weak or
  outnumbered colony, and turning to spores when the dish is deadly. Viruses and mold aren't
  minds; they keep their simple rules (`dish_brain_rules`).
- **Before a colony's first answer** it keeps the goal it has (a second or so in the browser).
- **Where it runs:**
  - Browser: in a background worker, so a decision never stalls a frame (about 250 ms a
    decision). The page downloads the model once (7.6 MB; on the published page as base64
    text, 10 MB). The sidebar shows "AI model: thinking for every colony" with counts.
  - Desktop simulator window: on the main thread, one decision a frame (about 21 ms).
  - Board: loads the model already in the "model" partition (the installer writes it) with the
    tokenizer already built in, and thinks on core 1 between render bands (about 3.7 s a
    decision on the ESP32-S3, so each colony updates every few seconds to tens of seconds).
    This firmware change has not been compiled or run on a board yet.
- **Checked by** `dishsim --selftest-model`, which runs the real model file: in a 3-minute dish
  with visitors, 147 of 154 decisions came from the model (the rest waited for a first answer),
  spread over seek_food 17%, visit_bubbles 11%, follow_friend 5%, explore 18%, rest 1%,
  dart_play 28%, inspect_reef 18%.
- **The rules mind** (`dish_brain_rules`, with its social layer: mobs, feuds, visits) is still
  in the code. The selftests use it so their numbers are repeatable, and the game falls back to
  it only if the model can't be loaded.
- **The dish-specific model** (`dish_ai.c`, `docs/dish-ai.md`) is unused: it was never trained,
  and isn't needed.

**Alliances and rivalries** (`dish_tick`, after meetings):

- Strains whose cells touch warm to each other once per pair per moment:
  0.004 a second, or 0.012 when one chose to visit the other. Never toward a
  hunter or something hunting it.
- Both feelings above 0.35: an **alliance** (moment card, journal). Allies
  share food on contact (the fuller feeds the hungrier, 0.03 a second) and
  hearts float between them. It breaks if either feeling drops below 0.15.
- Both feelings below −0.4: a **rivalry**. Rivals jostle (shove, red sparks)
  and pick fights. It ends above −0.2.
- A strain without teeth that "hunts" now shoves: 0.035 health a second and a push.
- Measured over six 10-minute dishes: about 18 alliances and 8 rivalries an hour,
  and two kinds of cells touching about 23% of the time.

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
- **Loners** (social below 0.3) keep to the colony's edge, unless they're in your light.
- **The brave few:** when the colony flees, cells with boldness above 0.82 turn
  and face the threat instead.
- **Roles** shown in the microscope lens: BRAVE, CURIOUS, LONER, CLINGY or STEADY.
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

Files: `common/dish_mut.c` (the table `MUTS[]`, the pairings `SYNS[]`, how genes are dealt and picked),
`common/dish.c` (what each gene does), `common/dish_render.c` (`draw_muts`: how each one looks).

### Genes live in the cells

- **Every cell carries its own genes** (`cell_t.mut`: a tier 0–3 for each of the 31 mutations).
  A daughter copies her mother's.
- **The colony's build** (`strain_t.mut`, what the card, the name and the AI see) is each gene at
  the highest tier **a third of the cells carry**. A gene that is already in the build stays
  until fewer than a fifth carry it. When a gene enters or leaves the build, the story and (in
  observer mode) a toast say "X TOOK OVER" or "X FADED OUT".
- **The card shows how much of the colony carries each gene** (the % beside it).
- Older saves (version 11 and before) load with their genes renamed (Zap → Nanowires,
  Virus Tamer → CRISPR, Scouts → Chemotaxis, Grapple → Pili, Quorum → Choir).
  Engulf becomes the Devourer legendary. Mimicry is gone.

### Two ways to evolve

**Keeper mode (you pick):**
- A pick-of-three every 2 generations (`DISH_DRAFT_GENS`), or on a clock: the first at
  45 seconds, then at least every 90 seconds (`DISH_DRAFT_S`). The dish pauses until you pick.
- Cards that answer the dish's current troubles are 1 + 4× more likely. A pressing trouble
  always gets at least one answer.
- Rare cards come up at 0.7×, epic at 0.3×. Upgrading a gene you already have is 1.3× likelier.
- **At most one behaviour card in each hand**, and never both poles of one axis.
- **The new generation carries the pick:** the youngest two in five cells get it at once, and
  every cell born afterwards gets it too (section 22).

**Observer mode (the dish decides):**
- Chosen on the title page (KEEPER / OBSERVER), switchable any time from the pill on the strain card.
  Saved, and kept across runs.
- **No cards, no requests, no waves.** Gene capsules in the shop make a mutant instead of
  dealing a card. When a run ends, a new dish starts by itself after 12 seconds.
- **Mutants are born at division:** a daughter has a `MUTANT_P` (0.06) chance to be a mutant.
  The chance is up to 2.5× higher when the colony is uncomfortable or hurt, and 3× under the UV lamp.
  Resting cells mutate too (`MUTANT_BG`, 0.0002 a second, more under stress), so a colony that
  has stopped growing still evolves.
- **Which gene a mutant gets** is weighted the same way as cards: by what answers the colony's
  troubles now, and by rarity. Behaviour genes come 0.6× as often as body genes.
- **Genes spread sideways:** touching sister cells pass a gene across (`HGT_P`, 0.004 per gene
  per second), 3× faster for a gene that answers a current trouble and up to 7× faster with
  Plasmid Swap. This is what lets a useful mutant take over in a few minutes.
- **Genome room:** a cell holds at most `GENOME_ROOM` (5) different genes. A new one pushes out
  the least useful.
- **Genes that answer nothing fade:** now and then a cell drops a tier of a gene that does not
  help against anything happening now. A daughter can also lose a gene outright (35% of the
  mutant chance).
- **Legendaries can be born:** 1.2% of mutant events in observer mode turn the whole colony
  legendary instead.
- A 20-minute observer run in the tests gives 20–45 mutants, 8–11 genes taking over and 2–4
  synergies (`--selftest-observe`).
- **Mutant animation:** a DNA double helix rises off the cell in the gene's colour, with a
  flash and stars. For three seconds a rainbow ring circles it. Your mutants say "I'M A MUTANT!"
  (at most one every 8 seconds).

### Troubles (pressures)

Hunters, virus, medicine, acid, salt, hunger, darkness, crowding, rivals (`dish_pressures_of`).
Each gene lists the troubles it answers. Keeper cards and observer mutants both lean toward them.

### The 21 body genes

Numbers are per tier unless stated.

| Gene | Role | Rarity | What it does | Its cost | How it looks |
|---|---|---|---|---|---|
| Spikes | Attack | Common | Touching it hurts attackers 0.06/s | Pricks its own when packed | Spines that flare white when it bites |
| Toxin Cloud | Attack | Rare | A haze hurting strangers 0.03/s, wider each tier | Spoils its own food | A bubbling green haze, drips |
| Nanowires | Attack | Rare | Wires share food between touching wired cells; from tier 2 the line shocks strangers (the old Zap) | Each shock costs the wired 0.02 energy | Copper terminals, sparks; live wires drawn between wired sisters with food sparks running along them |
| Pili | Attack | Common | Hooks latch on and drain (tether); from tier 2 it twitches along in jerks | Holding slows it | Hooked hairs that flick |
| Biofilm Wall | Defence | Rare | 12% of cells become anchors that soak up harm | Traps its waste | A slime coat with beads |
| Persisters | Defence | Common | 12% of cells fall asleep at the first harm: 90% less damage (97% at tier 3); wake when it's calm | Sleepers don't eat or grow | Frost crosses; asleep, an ice shell with a slow heartbeat; the frost cracks off as it wakes |
| Spore Burst | Defence | Rare | A dying cell leaves 1–3 spores | Spores wake weak | Spore pods |
| CRISPR | Defence | Rare | Remembers viruses that infected it: later ones are cut apart (snip!). At tier 3 viruses join it | Memory costs 5% more food | A barcode of stripes; tier 3: orbiting virus hexagons |
| Sunlight | Food | Common | Light feeds it | 25% hungrier at night | Chloroplasts that glint in the light |
| Glow Lure | Food | Rare | Draws strangers in from 80 + 30 px (any colony can have it now) | Draws viruses | An antenna with a pulsing orb |
| Chemotaxis | Food | Common | 6% of cells are scouts; they leave a scent trail and the colony follows it to food | Scouts get lost far from home | Twitching feelers puffing scent rings; yellow scent marks on the agar |
| Cheater | Food | Rare | Siphons energy from foreign cells it touches (0.03/s); tier 2+ unnoticed | Eats 20% worse on its own | A purple siphon with stolen crumbs sliding in |
| Jet | Movement | Common | Bursts away from danger | Each jet burns 0.06 energy | Twin nozzles, a plume |
| Swarm Mind | Movement | Common | Swims as one school | Colds spread through the school | Swept fins, a wake |
| Magnetotaxis | Movement | Rare | Steers toward the tilt (north when level); tier 2 chains, tier 3 resists currents | Pulled north when the dish is level | A chain of magnetosomes with a red end; dark links between chained cells |
| Gas Vesicles | Movement | Common | Rides currents 40% further, slides 25% less with the tilt; tier 2 rides currents toward food | Strong currents scatter it | Bubbles rising inside; it bobs |
| Symbiosis | Social | Rare | Friends stay and share; tier 3 they give free genes | Gives food away | Pink heart spots |
| Quorum Choir | Social | Rare | Once 12+ cells, all singers pulse on one beat; tier 2 blooms; tier 3 the song stuns strangers near | Crashes after a bloom | A ring breathing out on the shared beat; music notes |
| Plasmid Swap | Social | Epic | Passes its genes to other strains it touches; tier 2 takes one back | Rivals catch its genes | Little DNA rings circling inside; a bridge with a bead sliding across |
| Startle | Social | Common | A poke or a rap nearby makes it flash and scatter; tier 2 remembers where danger was; tier 3 bites what touches it while startled | Startles at nothing now and then | A false eye on its back; a white flash ring |
| Day Clock | Social | Common | Splits faster by day; slower, safer and thriftier by night | A day-night flip (double-tap) leaves it reeling for 3 s | A clock face with a turning hand; a sun or a moon |

### The 10 behaviour genes (5 axes)

Each axis is a pair of opposite poles. A cell carries only one pole: gaining the other first
wears the one it has down. Behaviour genes move the colony's temperament and what it tells the
AI (stress, boldness, sociability, curiosity), so **the model decides what a hothead does**.

| Gene | What it does | Its cost | How it looks |
|---|---|---|---|
| Pacifist | Never starts fights; others warm to it; its blows are 30% softer; tier 3 hunters lose interest | Can't fight back | A floating halo, a soft calm glow |
| Hothead | Bites anything it touches; meets strangers with a fight; tier 3 charges them | Everyone dislikes it | A throbbing red rim, flush and steam; angry brows |
| Couch Potato | 15% less hunger and 15% slower per tier; lives longer; a model "burst" becomes a nap | Grows slowly | Z's drifting up; heavy lids |
| Speed Freak | 20% hungrier, 15% faster, splits sooner; can't sit still | Ages 15% faster | Speed lines; it jitters |
| Hermit | Keeps its distance from sisters; curious; tier 3 a colony of loners | Alone it's easier prey | A violet hood; a dotted ring of personal space |
| Clingy | Huddles; takes 6% less harm when touching sisters | Crowds, and colds spread | Little arms reaching for the colony |
| Reckless | Reports 25% less danger to the AI; flees less; faster | Takes 8% more harm | A flame tuft licking up |
| Skittish | Reports more danger; bolts from any hunter near it, whatever the AI says | Eats 10% worse | Sweat beads on both sides; it trembles; worried brows |
| Sharer | Feeds hungry sisters it touches (tier 2: allies too) | The full go hungry | Holds out a green crumb |
| Cannibal | Eats weaker sisters when hungry; tier 2 the dying; tier 3 smaller strangers | The whole dish fears it | Fangs and a red drip; angry brows |

### What each tier adds

Every tier does something of its own; the card shows the line for the tier it would give.

| Gene | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Spikes | Touching it hurts (0.06/s) | Hurts twice as much | Attackers are knocked back off the spines and stunned |
| Toxin Cloud | A haze, 0.03/s | Wider and stronger | Half again as deadly, and leaves a hanging fog |
| Nanowires | Wired neighbours share food | The line shocks strangers | The whole wired colony shares one store |
| Pili | Hooks latch on and drain | Twitches along in jerks | Hauls its catch home to the colony's middle |
| Biofilm Wall | 12% become anchors (half harm) | More anchors | A fortress: anchors take a quarter |
| Persisters | Few sleepers, 90% less harm | More sleepers | Sleepers take 97% less |
| Spore Burst | 1 spore | 2 spores | 3 spores |
| CRISPR | Only viruses it has met are cut (memory) | Cuts unknown viruses too | Viruses join it |
| Sunlight | Light feeds it | Dim light counts as brighter | In good light it barely needs food |
| Glow Lure | Draws strangers in | Further and stronger | Those close to it are spellbound and barely swim |
| Chemotaxis | Scouts leave a trail; foragers follow | More scouts, a stronger pull | The whole colony follows its nose, whatever it is doing |
| Cheater | Siphons from those it touches (they notice) | Unnoticed | Siphons from anyone near |
| Jet | Jets away when fleeing | Faster, longer | A hunter's touch sets it off even at rest |
| Swarm Mind | Swims as a school | Tighter | Individual traits all but vanish: one mind |
| Magnetotaxis | Steers to the tilt | Neighbours link into chains | Steers against currents |
| Gas Vesicles | Rides currents 40% further | Rides currents toward food | Rides even weak currents, and sails on toward new ground in still water |
| Symbiosis | Friends stay and share (any colony's friends: allies, or friendly kinds beside your colony) | Shares twice as much | Friends go for whatever hunts it and bite it |
| Quorum Choir | Pulses on a shared beat | Blooms | The song stuns strangers |
| Plasmid Swap | Passes genes to other strains | Takes genes back | Genes spread among its own sisters too, even in keeper mode |
| Startle | Flashes and scatters when poked | Remembers where danger was | A startled cell bites what touches it |
| Day Clock | Splits by day, safer by night | Stronger | Day-night flips no longer leave it reeling |
| Pacifist | Never starts a fight; softer blows | Others warm to it faster | Hunters lose interest |
| Hothead | Picks fights (meets strangers with a hunt) | Bites what it touches | Charges the nearest stranger |
| Couch Potato | Slow, hardly hungry | A model "burst" becomes a nap | Barely moves |
| Speed Freak | Fast and hungry | Splits fast, can't rest | A blur: faster still |
| Hermit | Keeps its distance from sisters | Wanders off from the middle | Spreads wide and keeps no company |
| Clingy | Hugs its sisters | Huddles tighter | Never lets go: a current can't peel it off |
| Reckless | Reports less danger | Explores first | Never flees: it turns on the threat |
| Skittish | Bolts from hunters | Bolts sooner | Bolts from any stranger, and never rests (it huddles, eyes open) |
| Sharer | Feeds hungry sisters | Feeds friends and allies too | The whole colony shares one store |
| Cannibal | Eats its weak when hungry | Eats the dying | Eats anyone smaller |

### The 22 synergies

Any tier of both parts counts. Each is announced the first time with a moment card. A card that
would complete one glows gold, and the colony's name changes to the synergy's.

| Synergy | Parts | Effect | Look |
|---|---|---|---|
| Storm School | Nanowires + Swarm | Each shock jumps to the next stranger | A spark circling |
| Angler | Lure + Pili | Lure +60 px and pulls harder; hooked prey reeled in 1.5× faster | A bait on a stalk |
| Smog Trail | Toxin + Jet | Jets leave poison | — |
| Battering Ram | Spikes + Jet | Rams knock enemies back and stun them | A red glow at the front while jetting |
| Solar Reef | Sunlight + Biofilm | Anchors grow food-making spires | Green spires |
| Spore Bombs | Spore Burst + Toxin | A fallen cell bursts in poison | A pulsing green core |
| Siren | Lure + Cheater | Wears its enemy's colours; bites on it do 40% less | Its colours shift |
| Murmuration | Swarm + Choir | The school wheels in a spiral | A rainbow wake |
| Compass School | Magnetotaxis + Swarm | The school turns to the tilt as one, 20% faster | An arrowhead wake |
| Power Grid | Nanowires + Biofilm | Every wired cell shares one food store | Lit nodes round the wall |
| Light Show | Choir + Lure | Each beat draws strangers in and stuns them | A rainbow flash on the beat |
| Gene Market | Plasmid + Symbiosis | Genes trade both ways with allies, 3× as often | A gold bead going round |
| Ghost Fleet | Gas Vesicles + Persisters | Sleepers drift twice as far on currents and wake far away | A pale ghost-light while asleep |
| Sundial | Day Clock + Sunlight | Light feeds it 1.5× by day; half the harm at night | A gnomon's shadow |
| Sentinels | Startle + Spikes | A startled cell's spines hurt double | A red alarm ring |
| Vampire | Cheater + Pili | Hooks drink twice as deep, and no one minds | A blood-red mouth |
| Berserker | Hothead + Spikes | Spikes hurt 1.5×; charges 25% faster | A pulsing rage aura |
| Sunbather | Couch Potato + Sunlight | Light feeds it 1.4×; 30% less hunger in light | Sunglasses |
| Bullet | Speed Freak + Jet | Jets recharge 2.5× faster | A long tracer |
| Grim Harvest | Cannibal + Spore Burst | Eaten sisters come back as spores | A little soul rising |
| Cuddle Puddle | Clingy + Symbiosis | Touching sisters heal | Hearts floating up |
| Hermit Crab | Hermit + Biofilm | A lone cell takes 40% less harm | A borrowed shell |

### Legendaries

Bought in the GENES tab of the shop, or (observer mode) born as a rare mutant: Blink, Giant,
Prism, Phoenix, Queen, and **Devourer** (220 DNA; the old Engulf: a great red maw that swallows
smaller germs whole). **Phoenix** cells reborn in fire now rise as mutants.

### Adding a gene

1. Add it to the enum in `dish_mut.h` (body genes before `M_BEHAVE`; behaviour poles in pairs).
2. Add a row to `MUTS[]` and bump `DISH_MUT_N` in `dish.h`.
3. Write what it does in `dish.c` (the cell's own genes are `mu` in `cell_tick`).
4. Write how it looks in `draw_muts`.
5. Add a check to `selftest_verbs` in `sim/dish_main.c`. Every gene has one, measured against
   the same dish without it.
6. Saves keep genes by index: append, don't reorder.

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
- **Moment cards** (`moment`, `draw_moment` in `dish_ui.c`): a big card pops
  in over the dish with a slow sunburst behind it for 2.8 s (`MOMENT_S`),
  queued up to three. For: synergies, legendary genes, hatchings, alliances,
  rivalries, a species seen for the first time, the first split, and
  generations 10, 25, 50 and 100.
- **Eyes follow your light:** while you hold a finger down, your germs look at it.
- **Poke boing:** a poked germ squashes and springs back.
- **Eating:** crumbs of food are pulled into hungry cells on rich food.
- **Night stars** twinkle in the agar while the lamp is off.
- **Day/night sweep:** a ring sweeps across the dish from your double-tap.
- **Egg, legendary looks:** see section 15.

---

## 11. Wonders

File: `common/dish.c` (`dish_wonder`, `wonder_tick`, around lines 1405–1470).

- **Timing:** first one after 50–90 seconds, then every 80–150 seconds
  (`dish.c:1455`). At night there's a 50% chance it's glowing plankton.
- **Food rain:** 9 seconds of falling food drops, about 3 per second.
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
- **Corner buttons:**
  - STORY (top left): the journal and charts.
  - DISH (top right): your strain's card, the Microbe-Dex and badges.
  - WALL (bottom left): draw a barrier that lasts 20 seconds; 3 at most, one more every 12 seconds.
  - SAMPLE (bottom right): the dropper.
- **The DNA counter (top, "DNA · SHOP"):** opens the shop. While you're
  placing an item it reads "CANCEL". It is the only thing at the top of the
  screen; the strain's name and mood face are gone.
- **Corner labels** (STORY, DISH, WALL, SAMPLE) show until you've used that
  button once, then hide to keep the dish clear.
- **Web keys:** N lamp, V visitor, F 10× speed, D +50 DNA.

---

## 14. Making things obvious

File: `common/dish_ui.c`.

- **No tutorial.** The tips page, the first-time hint popups, the ghost-finger coach and the
  NEW tags are gone: a returning player doesn't need them. (The web page's side panel still
  lists the controls, outside the dish.)
- **Corner buttons are labelled** until each has been used once (`TRY_*` bits in `d->hints`, saved).
- **The shop pill glows gold** whenever something in it is affordable and useful right now.
- **Tapping things explains them:** a germ (it answers, and the lens shows it), a bubble (who
  said it), a placed item (what it does), the stats chip, a shop item (first tap reads it out).

---

## 15. The shop

Files: `common/dish_prog.c` (`SHOP[]`, `dish_shop_buy`), `common/dish_ui.c`
(`draw_shop`), `common/dish.c` (`dish_place_decor`, `dish_legend_take`, `hatch`).

Open it by tapping the DNA pill at the top. Two tabs. Tap an item once to read
what it does ("… TAP AGAIN TO BUY"), and again to buy. Items marked with a dot
stay; placed items ask where to go. Up to 6 placed items (`DISH_DECOR`).
**Tap a placed item** to see what it is (an egg says how long until it hatches);
**drag it** to move it (`decor_at`, `decor_info` in `dish_ui.c`).

**DISH tab**

| Item | Cost | What it does |
|---|---|---|
| Food drop | 4 | A big drop of food where you tap |
| Dropper refill | 8 | One more drop for SAMPLE (only when it's empty) |
| Food rain | 12 | Starts a food-rain wonder |
| Friend call | 30 | A friendly visitor: diatom, symbiont, ciliate, cyano or donor |
| Mystery egg | 45 | Place it; it rocks harder and cracks, and hatches after 20 s (`EGG_HATCH_S`) into a rare "golden" organism carrying a ready-made synergy at tier 2. Could be a friend or a foe. Moment card on hatching |
| Glow crystal (stays) | 25 | Light around it (+0.6, about 45 px), day and night |
| Warm vent (stays) | 25 | Warmth around it (+0.2 temperature, about 45 px) |
| Food fountain (stays) | 40 | Food bubbles up forever |

**GENES tab**

| Item | Cost | What it does |
|---|---|---|
| Gene capsule | 60 | A mutation draft now |
| Rare capsule | 100 | A draft of rare and epic cards only |
| Blink (legendary) | 120 | A bitten cell teleports 45 px away in a violet flash (4 s recharge per cell) |
| Giant (legendary) | 120 | Cells 1.5× bigger, 40% tougher, 25% slower, hungrier |
| Prism (legendary) | 150 | Rainbow rims; feeds on light (even at night, as if lit at 0.3) |
| Phoenix (legendary) | 180 | 35% of fallen cells are reborn in a burst of fire; embers drift off them |
| Queen (legendary) | 200 | The oldest cell is crowned: 1.8× size, breeds 2.5× faster, slow; workers stay near her |

- Legendary genes are only in the shop, never in drafts. Each can be bought
  once per strain (saved). Buying one plays a moment card and a gold ripple.
- Removed this round: air bubble, rock (old saves' rocks are cleared).

## 16. Quests and waves

File: `common/dish_quest.c`.

| Quest | Goal | Time limit | Reward (DNA) |
|---|---|---|---|
| Light | Shine light on them, 6 units | 40 s | 5 |
| Grow | Grow by a third, at least 5 cells | 150 s | Line 32 |
| Night | Turn the lamp off for 10 seconds (only offered by day) | 40 s | 5 |
| Company | Add a drop of wild water with SAMPLE (only when it has a drop) | 45 s | 5 |
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
- **Save** (version 10, `dish_save` / `dish_load` in `dish.c`): about 6 KB.
  Version 9 added placed items; version 10 adds legendary genes and hatched rarities. Older saves still load. New saved fields go at
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
- **The AI model decides goals; the game's own rules do the rest.** Population control,
  voices and what's said, emotes, the shop and the director are game code, not the model.
- **The model was trained on fish.** It reads each colony as a fish would see its tank, so its
  choices are a fish's instincts in a germ's body. That's the price of no training.
- **Hints and the coach overlap a little.** The older first-time hints (for
  example "hold to shine light") can appear before the coach demonstrates the
  same thing. Consider retiring the gesture hints now the coach covers them.
- **Placed items can be moved but not sold.** A 7th replaces the oldest.
- **Social balance.** Alliances and rivalries are tuned by the 0.35 / −0.4
  thresholds and the familiarity rates in `dish_tick`; mobs only form against
  real hunters within 150 px (`social_goal`).
- **Legendary genes are permanent for the run** and stack (a giant phoenix
  queen is possible). Worth watching for balance once players save up DNA.
- **Shop food earns care DNA.** Buying food for a hungry colony can trigger the
  2-DNA "good care" reward, so it costs 2 instead of 4 now and then.
- **Firmware not built.** The changes pass every selftest, but the board
  firmware hasn't been compiled with them (it needs the ESP-IDF toolchain).
  Emotes, the coach and the shop add drawing work per frame; worth checking the
  frame rate on a real board.
- **Desktop simulator key.** `sim/dish_main.c` still has `O` for a virus
  outbreak; the web build uses `V` for a visitor.
- **Unattended play.** In the selftest that plays 30 runs of 20 minutes with
  no player input, no runs die out now (3 before), helped by the more frequent
  mutation cards.

---

## 22. Generations

Files: `common/dish_mut.c` (`dish_mut_take`), `common/dish.c` (`cell_tick`, `census`).

- When your colony takes a mutation, a new **era** begins (`strain.era`). Cells
  alive at that moment are the **old guard**: they keep the old look
  (`old_morph`, with a silver rim and a greyer body) and **don't** get the new
  mutation's tier. Cells born afterwards are the **new blood**.
- How they get along is chosen from the colony's temperament at that moment:

| Way | When | What happens (for `ERA_CONTEST_S` = 150 s) |
|---|---|---|
| Purge | Ruthless above 0.55 | New blood bites the old guard (0.25 health, 1.5 tries a second) |
| Elders | Social above 0.6 | The old feed the young (0.04 energy a second) and age twice as fast, making way |
| Race | Otherwise | New blood splits sooner (−0.08 energy needed), the old guard later (+0.08) |

- A "NEW GENERATION" moment card announces it, the colony's label says
  "NEW BLOOD VS OLD GUARD" (or "ELDERS FEEDING THE YOUNG" / "OLD AND NEW RACE
  TO GROW") while it lasts, and the lens marks each cell OLD GUARD or NEW BLOOD.
- Only your colony has generations; visitors arrive as one. Saved (v11), though
  a loaded dish starts as one generation.

---

## 23. Status labels, stats and the director

**Colony status labels** (`colony_status`, `labels_tick`, `draw_labels` in `dish_ui.c`):

- A small pill over a colony saying what it's doing and why, e.g.
  "STAPHANIE: HUDDLING, VIBRIO NEARBY", "AMOEBA: HUNTING STAPHANIE",
  "DIATOM: VISITING STAPHANIE", "STAPHANIE: FEASTING", "STAPHANIE: EATING ITS OWN".
- Shown for 4 s when a colony changes its mind (aimed goals, policies,
  generations; your colony always), or when a colony of 15+ cells is packed
  together. At most three at once; each colony waits 6–14 s before showing
  again. Tap one for the longer explanation. A tap squarely on a cell still pokes the cell.

**Live stats:**

- **In the dish:** a chip right of STORY shows your cell count and a trend arrow.
  Tap it for a panel: cells in total, each species' count and change per minute,
  births and deaths per minute, the main cause of death, DNA per minute, and
  how many alliances and rivalries there are.
- **On the web page:** a "Live stats" card in the sidebar with the same numbers,
  a coloured bar per species, and a chart of the cell count over the last three minutes.
- Sampled every 5 s, one minute kept (`stats_tick`; `dish_ui_stats` flattens it
  for the page through `web_stats`).

**The director** (`dish_prog_tick` in `dish_prog.c`):

- It tracks how active you are (each touch adds 1, fading over about 40 s) and
  how long the dish has been quiet (reset by arrivals and wonders).
- When you're active (above 3) and the dish has been quiet for 40 s, it brings
  a surprise, at most every 60–100 s, weighted by the state of the dish:

| Surprise | More likely when |
|---|---|
| A challenger (vibrio, amoeba or myxo, maybe with mutations) | Your colony has 30+ cells and no threats around |
| Help (diatom, symbiont or ciliate) | Your colony is small or hungry |
| A stranger (a dropper-style wild visitor) | There are no visitors |
| An egg falling in | Always possible |
| A feast (food rain) | Your colony is hungry |

- A "SURPRISE!" moment card says what it is. An idle keeper gets none.
- This is the game's own rules reading engagement and the dish's state, not the AI model.
