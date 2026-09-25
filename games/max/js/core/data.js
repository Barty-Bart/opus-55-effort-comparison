// Static game definitions: units, buildings, technologies, ages.
// Numbers are modelled on Age of Empires II (game-seconds, tiles, tiles/second).

export const RESOURCES = ['food', 'wood', 'gold', 'stone'];
export const AGE_NAMES = ['Dark Age', 'Feudal Age', 'Castle Age', 'Imperial Age'];
export const AGE_SHORT = ['I', 'II', 'III', 'IV'];
export const POP_MAX = 200;
export const GRID_KEYS = ['Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F', 'G', 'Z', 'X', 'C', 'V', 'B'];

export const START_RESOURCES = {
  standard: { food: 200, wood: 200, gold: 100, stone: 200 },
  medium: { food: 500, wood: 500, gold: 300, stone: 300 },
  high: { food: 1000, wood: 1000, gold: 700, stone: 500 },
};

// Resource node definitions (gaia objects that are gathered).
export const RESOURCE_NODES = {
  tree: { name: 'Tree', res: 'wood', amount: 100, gather: 'wood' },
  gold: { name: 'Gold Mine', res: 'gold', amount: 800, gather: 'gold' },
  stone: { name: 'Stone Mine', res: 'stone', amount: 350, gather: 'stone' },
  berries: { name: 'Forage Bush', res: 'food', amount: 125, gather: 'berries' },
  fish: { name: 'Shore Fish', res: 'food', amount: 200, gather: 'fish', water: true },
  carcass: { name: 'Carcass', res: 'food', amount: 100, gather: 'hunt' },
};

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
const U = (o) => ({
  atkType: 'melee', armor: [0, 0], range: 0, minRange: 0, reload: 2.0, los: 4, pop: 1,
  accuracy: 1, bonus: {}, classes: [], radius: 0.22, age: 0, cost: {}, projectile: null,
  canAttackUnits: true, canAttackBuildings: true, attackDelay: 0.45, ...o,
});

export const UNITS = {
  villager: U({
    name: 'Villager', hp: 25, atk: 3, reload: 2.0, speed: 0.8, los: 4, cost: { food: 50 }, time: 25,
    classes: ['villager'], model: 'villager', from: 'townCenter', canBuild: true, canGather: true,
    capacity: 10, bonus: { animal: 2 },
    gatherRates: { wood: 0.39, gold: 0.38, stone: 0.36, farm: 0.33, berries: 0.31, hunt: 0.41, sheep: 0.33, fish: 0.43 },
    desc: 'Gathers resources, constructs and repairs buildings. The backbone of your economy.',
  }),
  // --- Barracks -----------------------------------------------------------
  militia: U({
    name: 'Militia', line: 'militia', hp: 40, atk: 4, armor: [0, 1], speed: 0.9, cost: { food: 60, gold: 20 }, time: 21,
    classes: ['infantry'], model: 'militia', from: 'barracks', bonus: { building: 1 },
    desc: 'Basic infantry. Cheap and sturdy.',
  }),
  manAtArms: U({
    name: 'Man-at-Arms', line: 'militia', hp: 45, atk: 6, armor: [0, 1], speed: 0.9, cost: { food: 60, gold: 20 }, time: 21,
    classes: ['infantry'], model: 'manAtArms', from: 'barracks', age: 1, bonus: { building: 2 },
    desc: 'Infantry with improved attack. Good against buildings and other infantry.',
  }),
  longSwordsman: U({
    name: 'Long Swordsman', line: 'militia', hp: 60, atk: 9, armor: [1, 1], speed: 0.9, cost: { food: 60, gold: 20 }, time: 21,
    classes: ['infantry'], model: 'longSwordsman', from: 'barracks', age: 2, bonus: { building: 3 },
    desc: 'Heavily armed swordsman. Strong against infantry and buildings.',
  }),
  twoHanded: U({
    name: 'Two-Handed Swordsman', line: 'militia', hp: 60, atk: 12, armor: [1, 2], speed: 0.9, cost: { food: 60, gold: 20 }, time: 21,
    classes: ['infantry'], model: 'twoHanded', from: 'barracks', age: 3, bonus: { building: 4 },
    desc: 'Elite infantry wielding a massive blade.',
  }),
  spearman: U({
    name: 'Spearman', line: 'spear', hp: 45, atk: 3, armor: [0, 0], reload: 3.0, speed: 1.0, cost: { food: 35, wood: 25 }, time: 22,
    classes: ['infantry', 'spear'], model: 'spearman', from: 'barracks', age: 1, bonus: { cavalry: 15, building: 1 },
    desc: 'Anti-cavalry infantry. Deals massive bonus damage to cavalry.',
  }),
  pikeman: U({
    name: 'Pikeman', line: 'spear', hp: 55, atk: 4, armor: [0, 0], reload: 3.0, speed: 1.0, cost: { food: 35, wood: 25 }, time: 22,
    classes: ['infantry', 'spear'], model: 'pikeman', from: 'barracks', age: 2, bonus: { cavalry: 22, building: 1 },
    desc: 'Upgraded spearman with a long pike. Counters cavalry.',
  }),
  halberdier: U({
    name: 'Halberdier', line: 'spear', hp: 60, atk: 6, armor: [0, 0], reload: 3.0, speed: 1.0, cost: { food: 35, wood: 25 }, time: 22,
    classes: ['infantry', 'spear'], model: 'halberdier', from: 'barracks', age: 3, bonus: { cavalry: 32, building: 1 },
    desc: 'The ultimate anti-cavalry infantry.',
  }),
  // --- Archery Range ------------------------------------------------------
  archer: U({
    name: 'Archer', line: 'archer', hp: 30, atk: 4, atkType: 'pierce', range: 4, reload: 2.0, speed: 0.96, los: 6,
    accuracy: 0.8, cost: { wood: 25, gold: 45 }, time: 35, classes: ['archer', 'ranged'], model: 'archer',
    from: 'archeryRange', age: 1, projectile: 'arrow', bonus: { spear: 3 }, attackDelay: 0.6,
    desc: 'Ranged foot soldier. Effective against infantry.',
  }),
  crossbowman: U({
    name: 'Crossbowman', line: 'archer', hp: 35, atk: 5, atkType: 'pierce', range: 5, reload: 2.0, speed: 0.96, los: 7,
    accuracy: 0.85, cost: { wood: 25, gold: 45 }, time: 27, classes: ['archer', 'ranged'], model: 'crossbowman',
    from: 'archeryRange', age: 2, projectile: 'bolt', bonus: { spear: 3 }, attackDelay: 0.5,
    desc: 'Ranged infantry armed with a crossbow.',
  }),
  arbalester: U({
    name: 'Arbalester', line: 'archer', hp: 40, atk: 6, atkType: 'pierce', range: 5, reload: 2.0, speed: 0.96, los: 7,
    accuracy: 0.9, cost: { wood: 25, gold: 45 }, time: 27, classes: ['archer', 'ranged'], model: 'arbalester',
    from: 'archeryRange', age: 3, projectile: 'bolt', bonus: { spear: 3 }, attackDelay: 0.5,
    desc: 'Elite crossbowman with a powerful arbalest.',
  }),
  skirmisher: U({
    name: 'Skirmisher', line: 'skirm', hp: 30, atk: 2, atkType: 'pierce', armor: [0, 3], range: 4, reload: 3.0, speed: 0.96,
    los: 6, accuracy: 0.9, cost: { food: 25, wood: 35 }, time: 22, classes: ['archer', 'ranged', 'skirm'], model: 'skirmisher',
    from: 'archeryRange', age: 1, projectile: 'javelin', bonus: { archer: 3, spear: 3 }, attackDelay: 0.55,
    desc: 'Javelin thrower with bonus damage against archers. Resistant to arrows.',
  }),
  eliteSkirmisher: U({
    name: 'Elite Skirmisher', line: 'skirm', hp: 35, atk: 3, atkType: 'pierce', armor: [0, 4], range: 5, reload: 3.0, speed: 0.96,
    los: 7, accuracy: 0.9, cost: { food: 25, wood: 35 }, time: 22, classes: ['archer', 'ranged', 'skirm'], model: 'eliteSkirmisher',
    from: 'archeryRange', age: 2, projectile: 'javelin', bonus: { archer: 4, spear: 3 }, attackDelay: 0.55,
    desc: 'Improved skirmisher. The best counter to massed archers.',
  }),
  cavalryArcher: U({
    name: 'Cavalry Archer', line: 'cavArcher', hp: 50, atk: 6, atkType: 'pierce', range: 4, reload: 2.0, speed: 1.4, los: 5,
    accuracy: 0.65, cost: { wood: 40, gold: 70 }, time: 34, classes: ['cavalry', 'archer', 'ranged'], model: 'cavalryArcher',
    from: 'archeryRange', age: 2, projectile: 'arrow', bonus: { spear: 2 }, radius: 0.34, attackDelay: 0.5,
    desc: 'Fast mounted archer. Excellent for hit-and-run raids.',
  }),
  heavyCavArcher: U({
    name: 'Heavy Cav Archer', line: 'cavArcher', hp: 60, atk: 7, atkType: 'pierce', armor: [1, 0], range: 4, reload: 2.0, speed: 1.4,
    los: 6, accuracy: 0.75, cost: { wood: 40, gold: 70 }, time: 27, classes: ['cavalry', 'archer', 'ranged'], model: 'heavyCavArcher',
    from: 'archeryRange', age: 3, projectile: 'arrow', bonus: { spear: 2 }, radius: 0.34, attackDelay: 0.5,
    desc: 'Armored mounted archer.',
  }),
  // --- Stable -------------------------------------------------------------
  scoutCavalry: U({
    name: 'Scout Cavalry', line: 'scout', hp: 45, atk: 3, armor: [0, 2], speed: 1.3, los: 5, cost: { food: 80 }, time: 30,
    classes: ['cavalry'], model: 'scoutCavalry', from: 'stable', age: 1, radius: 0.34, bonus: { monk: 6 },
    desc: 'Fast, lightly armored cavalry. Ideal for scouting and raiding.',
  }),
  lightCavalry: U({
    name: 'Light Cavalry', line: 'scout', hp: 60, atk: 7, armor: [0, 2], speed: 1.5, los: 8, cost: { food: 80 }, time: 30,
    classes: ['cavalry'], model: 'lightCavalry', from: 'stable', age: 2, radius: 0.34, bonus: { monk: 10 },
    desc: 'Swift raider. Strong against monks and siege weapons.',
  }),
  knight: U({
    name: 'Knight', line: 'knight', hp: 100, atk: 10, armor: [2, 2], reload: 1.8, speed: 1.35, los: 4, cost: { food: 60, gold: 75 },
    time: 30, classes: ['cavalry'], model: 'knight', from: 'stable', age: 2, radius: 0.34,
    desc: 'Heavily armored cavalry. Powerful, but vulnerable to spearmen.',
  }),
  cavalier: U({
    name: 'Cavalier', line: 'knight', hp: 120, atk: 12, armor: [2, 2], reload: 1.8, speed: 1.35, los: 4, cost: { food: 60, gold: 75 },
    time: 30, classes: ['cavalry'], model: 'cavalier', from: 'stable', age: 3, radius: 0.34,
    desc: 'Elite heavy cavalry.',
  }),
  // --- Siege Workshop -----------------------------------------------------
  batteringRam: U({
    name: 'Battering Ram', line: 'ram', hp: 175, atk: 2, armor: [-3, 180], reload: 4.0, speed: 0.5, los: 3, cost: { wood: 160, gold: 75 },
    time: 36, classes: ['siege', 'ram'], model: 'batteringRam', from: 'siegeWorkshop', age: 2, radius: 0.5,
    bonus: { building: 125, siege: 40 }, canAttackUnits: false, pop: 1, attackDelay: 0.55,
    desc: 'Siege weapon that devastates buildings. Nearly immune to arrows, weak against melee.',
  }),
  cappedRam: U({
    name: 'Capped Ram', line: 'ram', hp: 200, atk: 3, armor: [-3, 190], reload: 4.0, speed: 0.5, los: 3, cost: { wood: 160, gold: 75 },
    time: 36, classes: ['siege', 'ram'], model: 'cappedRam', from: 'siegeWorkshop', age: 3, radius: 0.5,
    bonus: { building: 150, siege: 50 }, canAttackUnits: false, attackDelay: 0.55,
    desc: 'Improved battering ram.',
  }),
  mangonel: U({
    name: 'Mangonel', line: 'mangonel', hp: 50, atk: 40, armor: [0, 6], range: 7, minRange: 3, reload: 6.0, speed: 0.6, los: 9,
    accuracy: 1, cost: { wood: 160, gold: 135 }, time: 46, classes: ['siege'], model: 'mangonel', from: 'siegeWorkshop', age: 2,
    radius: 0.45, projectile: 'stone', splash: 0.6, friendlyFire: true, bonus: { building: 35 }, attackDelay: 0.5,
    desc: 'Catapult that hurls stones, damaging all units in the area — including your own.',
  }),
  onager: U({
    name: 'Onager', line: 'mangonel', hp: 60, atk: 50, armor: [0, 7], range: 8, minRange: 3, reload: 6.0, speed: 0.6, los: 10,
    accuracy: 1, cost: { wood: 160, gold: 135 }, time: 46, classes: ['siege'], model: 'onager', from: 'siegeWorkshop', age: 3,
    radius: 0.45, projectile: 'stone', splash: 0.8, friendlyFire: true, bonus: { building: 45 }, attackDelay: 0.5,
    desc: 'Powerful catapult with a larger blast area.',
  }),
  // --- Castle -------------------------------------------------------------
  longbowman: U({
    name: 'Longbowman', line: 'longbow', hp: 35, atk: 6, atkType: 'pierce', armor: [0, 1], range: 6, reload: 2.0, speed: 0.96, los: 8,
    accuracy: 0.85, cost: { wood: 35, gold: 40 }, time: 18, classes: ['archer', 'ranged', 'unique'], model: 'longbowman',
    from: 'castle', age: 2, projectile: 'arrow', bonus: { spear: 2 }, attackDelay: 0.6,
    desc: 'Unique unit. Archer with exceptional range.',
  }),
  trebuchet: U({
    name: 'Trebuchet', line: 'treb', hp: 150, atk: 200, armor: [2, 8], range: 16, minRange: 4, reload: 10.0, speed: 0.8, los: 18,
    accuracy: 0.85, cost: { wood: 200, gold: 200 }, time: 50, classes: ['siege'], model: 'trebuchet', from: 'castle', age: 3,
    radius: 0.55, projectile: 'boulder', canAttackUnits: false, bonus: { building: 150 }, attackDelay: 0.55,
    desc: 'Long-range siege engine that obliterates buildings and castles.',
  }),
  // --- Monastery ----------------------------------------------------------
  monk: U({
    name: 'Monk', line: 'monk', hp: 30, atk: 0, armor: [0, 0], range: 9, reload: 1.0, speed: 0.7, los: 11, cost: { gold: 100 },
    time: 51, classes: ['monk'], model: 'monk', from: 'monastery', age: 2, isMonk: true, healRange: 4,
    desc: 'Heals friendly units and converts enemy units to your side.',
  }),
  // --- Gaia animals -------------------------------------------------------
  sheep: U({
    name: 'Sheep', hp: 7, atk: 0, speed: 0.7, los: 3, classes: ['animal', 'herdable'], model: 'sheep', food: 100, pop: 0,
    radius: 0.2, isAnimal: true, herdable: true, carcassGather: 'sheep',
    desc: 'Herdable livestock. Can be slaughtered for food.',
  }),
  deer: U({
    name: 'Deer', hp: 5, atk: 0, speed: 1.1, los: 4, classes: ['animal', 'huntable'], model: 'deer', food: 140, pop: 0,
    radius: 0.22, isAnimal: true, flees: true, carcassGather: 'hunt',
    desc: 'Wild game. Villagers hunt it with spears.',
  }),
  boar: U({
    name: 'Wild Boar', hp: 50, atk: 5, armor: [0, 1], speed: 0.72, los: 4, classes: ['animal', 'huntable'], model: 'boar',
    food: 340, pop: 0, radius: 0.28, isAnimal: true, aggressiveWhenHit: true, carcassGather: 'hunt',
    desc: 'Dangerous game that fights back. Hunt with several villagers.',
  }),
};

// Unit upgrade lines (tiers) — the building shows the currently unlocked tier.
export const LINES = {
  militia: ['militia', 'manAtArms', 'longSwordsman', 'twoHanded'],
  spear: ['spearman', 'pikeman', 'halberdier'],
  archer: ['archer', 'crossbowman', 'arbalester'],
  skirm: ['skirmisher', 'eliteSkirmisher'],
  cavArcher: ['cavalryArcher', 'heavyCavArcher'],
  scout: ['scoutCavalry', 'lightCavalry'],
  knight: ['knight', 'cavalier'],
  ram: ['batteringRam', 'cappedRam'],
  mangonel: ['mangonel', 'onager'],
  longbow: ['longbowman'], treb: ['trebuchet'], monk: ['monk'], villager: ['villager'],
};
for (const [id, u] of Object.entries(UNITS)) { u.id = id; if (!u.line) u.line = id; }

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------
const B = (o) => ({
  armor: [0, 7], los: 4, pop: 0, age: 0, trains: [], researches: [], dropSite: [], garrison: 0,
  attack: null, classes: ['building'], requires: [], ...o,
});

export const BUILDINGS = {
  townCenter: B({
    name: 'Town Center', size: 4, hp: 2400, armor: [3, 5], cost: { wood: 275, stone: 100 }, time: 150, los: 8, pop: 5,
    age: 2, startAge: 0, dropSite: ['food', 'wood', 'gold', 'stone'], garrison: 15, trains: ['villager'],
    researches: ['feudalAge', 'castleAge', 'imperialAge', 'loom', 'wheelbarrow', 'handCart', 'townWatch'],
    attack: { atk: 5, range: 6, reload: 2.0, arrows: 1, garrisonArrows: true },
    classes: ['building', 'tc'], desc: 'The heart of your civilization. Trains villagers, accepts all resources and advances ages.',
  }),
  house: B({
    name: 'House', size: 2, hp: 550, cost: { wood: 25 }, time: 25, los: 2, pop: 5,
    desc: 'Increases your population limit by 5.',
  }),
  mill: B({
    name: 'Mill', size: 2, hp: 600, cost: { wood: 100 }, time: 35, dropSite: ['food'],
    researches: ['horseCollar', 'heavyPlow', 'cropRotation'], desc: 'Drop-off point for food. Research farming technologies.',
  }),
  lumberCamp: B({
    name: 'Lumber Camp', size: 2, hp: 600, cost: { wood: 100 }, time: 35, dropSite: ['wood'],
    researches: ['doubleBitAxe', 'bowSaw', 'twoManSaw'], desc: 'Drop-off point for wood. Research woodcutting technologies.',
  }),
  miningCamp: B({
    name: 'Mining Camp', size: 2, hp: 600, cost: { wood: 100 }, time: 35, dropSite: ['gold', 'stone'],
    researches: ['goldMining', 'stoneMining', 'goldShaftMining', 'stoneShaftMining'],
    desc: 'Drop-off point for gold and stone. Research mining technologies.',
  }),
  farm: B({
    name: 'Farm', size: 3, hp: 480, armor: [0, 0], cost: { wood: 60 }, time: 15, los: 1, walkable: true, isFarm: true,
    desc: 'Renewable source of food. Automatically reseeded while you have wood.',
  }),
  barracks: B({
    name: 'Barracks', size: 3, hp: 1200, cost: { wood: 175 }, time: 50, los: 5,
    trains: ['militia', 'spear'], researches: ['manAtArms', 'longSwordsman', 'twoHanded', 'pikeman', 'halberdier'],
    desc: 'Trains infantry and researches infantry upgrades.',
  }),
  archeryRange: B({
    name: 'Archery Range', size: 3, hp: 1500, cost: { wood: 175 }, time: 50, age: 1, los: 5, requires: ['barracks'],
    trains: ['archer', 'skirm', 'cavArcher'], researches: ['crossbowman', 'arbalester', 'eliteSkirmisher', 'heavyCavArcher', 'thumbRing'],
    desc: 'Trains archers and researches archer upgrades.',
  }),
  stable: B({
    name: 'Stable', size: 3, hp: 1500, cost: { wood: 175 }, time: 50, age: 1, los: 5, requires: ['barracks'],
    trains: ['scout', 'knight'], researches: ['bloodlines', 'husbandry', 'lightCavalry', 'cavalier'],
    desc: 'Trains cavalry and researches cavalry upgrades.',
  }),
  blacksmith: B({
    name: 'Blacksmith', size: 3, hp: 1800, armor: [1, 7], cost: { wood: 150 }, time: 40, age: 1, los: 5,
    researches: ['forging', 'scaleMail', 'scaleBarding', 'fletching', 'paddedArcherArmor', 'ironCasting', 'chainMail',
      'chainBarding', 'bodkinArrow', 'leatherArcherArmor', 'blastFurnace', 'plateMail', 'plateBarding', 'bracer', 'ringArcherArmor'],
    desc: 'Researches attack and armor upgrades for your army.',
  }),
  market: B({
    name: 'Market', size: 4, hp: 2100, armor: [1, 7], cost: { wood: 175 }, time: 60, age: 1, los: 6, requires: ['mill'],
    isMarket: true, desc: 'Buy and sell resources in exchange for gold.',
  }),
  watchTower: B({
    name: 'Watch Tower', size: 1, hp: 1020, armor: [1, 7], cost: { wood: 25, stone: 125 }, time: 80, age: 1, los: 10,
    garrison: 5, attack: { atk: 5, range: 8, reload: 2.0, arrows: 1, garrisonArrows: true }, classes: ['building', 'tower'],
    desc: 'Defensive tower that fires arrows at enemies. Garrison units to add arrows.',
  }),
  guardTower: B({
    name: 'Guard Tower', size: 1, hp: 1500, armor: [1, 8], cost: { wood: 25, stone: 125 }, time: 80, age: 2, los: 10, hidden: true,
    garrison: 5, attack: { atk: 6, range: 8, reload: 2.0, arrows: 1, garrisonArrows: true }, classes: ['building', 'tower'],
    desc: 'Stronger defensive tower.',
  }),
  keep: B({
    name: 'Keep', size: 1, hp: 2250, armor: [2, 9], cost: { wood: 25, stone: 125 }, time: 80, age: 3, los: 11, hidden: true,
    garrison: 5, attack: { atk: 7, range: 8, reload: 2.0, arrows: 1, garrisonArrows: true }, classes: ['building', 'tower'],
    desc: 'The strongest defensive tower.',
  }),
  palisadeWall: B({
    name: 'Palisade Wall', size: 1, hp: 250, armor: [2, 5], cost: { wood: 2 }, time: 5, los: 2, isWall: true,
    classes: ['building', 'wall'], desc: 'Cheap wooden wall. Drag to build a line of wall.',
  }),
  stoneWall: B({
    name: 'Stone Wall', size: 1, hp: 1800, armor: [8, 10], cost: { stone: 5 }, time: 8, age: 1, los: 2, isWall: true,
    classes: ['building', 'wall'], desc: 'Strong stone wall. Drag to build a line of wall.',
  }),
  palisadeGate: B({
    name: 'Palisade Gate', size: 1, hp: 400, armor: [2, 5], cost: { wood: 20 }, time: 15, los: 2, isWall: true, isGate: true,
    classes: ['building', 'wall'], desc: 'Wooden gate: your units pass through, enemies are kept out. Can be placed over an existing palisade.',
  }),
  gate: B({
    name: 'Stone Gate', size: 1, hp: 2750, armor: [6, 6], cost: { stone: 30 }, time: 20, age: 1, los: 3, isWall: true, isGate: true,
    classes: ['building', 'wall'], desc: 'Stone gate: your units pass through, enemies are kept out. Can be placed over an existing stone wall.',
  }),
  castle: B({
    name: 'Castle', size: 4, hp: 4800, armor: [8, 11], cost: { stone: 650 }, time: 200, age: 2, los: 11, pop: 20, garrison: 20,
    trains: ['longbow', 'treb'], researches: ['hoardings', 'conscription'],
    attack: { atk: 11, range: 8, reload: 2.0, arrows: 4, garrisonArrows: true }, classes: ['building', 'castle'],
    desc: 'Massive fortification. Trains unique units and trebuchets. Fires a hail of arrows.',
  }),
  monastery: B({
    name: 'Monastery', size: 3, hp: 2100, cost: { wood: 175 }, time: 40, age: 2, los: 6,
    trains: ['monk'], researches: ['fervor', 'sanctity', 'illumination'],
    desc: 'Trains monks, who heal allies and convert enemies.',
  }),
  university: B({
    name: 'University', size: 3, hp: 2100, cost: { wood: 200 }, time: 60, age: 2, los: 6, requires: ['blacksmith'],
    researches: ['masonry', 'treadmillCrane', 'ballistics', 'guardTowerTech', 'architecture', 'chemistry', 'keepTech'],
    desc: 'Researches building and siege technologies.',
  }),
  siegeWorkshop: B({
    name: 'Siege Workshop', size: 4, hp: 2100, cost: { wood: 200 }, time: 40, age: 2, los: 6, requires: ['blacksmith'],
    trains: ['ram', 'mangonel'], researches: ['cappedRam', 'onager'],
    desc: 'Constructs siege weapons.',
  }),
  wonder: B({
    name: 'Wonder', size: 5, hp: 4800, armor: [8, 11], cost: { wood: 1000, gold: 1000, stone: 1000 }, time: 400, age: 3, los: 8,
    isWonder: true, classes: ['building', 'wonder'],
    desc: 'A monument to your civilization. Defend it for 5 minutes to win the game.',
  }),
};
for (const [id, b] of Object.entries(BUILDINGS)) b.id = id;

export const ECON_BUILDINGS = ['house', 'mill', 'lumberCamp', 'miningCamp', 'farm', 'market', 'blacksmith', 'monastery', 'university', 'townCenter', 'wonder'];
export const MIL_BUILDINGS = ['barracks', 'archeryRange', 'stable', 'siegeWorkshop', 'castle', 'watchTower', 'palisadeWall', 'stoneWall', 'palisadeGate', 'gate'];

// Buildings from the previous age required to advance (need 2 distinct; a castle counts as 2).
export const AGE_REQUIREMENTS = {
  1: ['barracks', 'mill', 'lumberCamp', 'miningCamp'],
  2: ['archeryRange', 'stable', 'blacksmith', 'market'],
  3: ['castle', 'monastery', 'university', 'siegeWorkshop'],
};

// ---------------------------------------------------------------------------
// Technologies
// effect types:
//   {t:'stat', on:'class:x'|'unit:id'|'line:id'|'bclass:x'|'building:id', stat, add|mul}
//   {t:'eco', stat, add|mul}
//   {t:'upgrade', line, to}          unit line upgrade
//   {t:'bupgrade', from, to}         building upgrade (towers)
//   {t:'age', age}
// ---------------------------------------------------------------------------
const T = (o) => ({ requires: [], effects: [], ...o });
const INF = 'class:infantry', CAV = 'class:cavalry', ARCH = 'class:archer';

export const TECHS = {
  feudalAge: T({ name: 'Feudal Age', cost: { food: 500 }, time: 130, age: 0, icon: 'age1', effects: [{ t: 'age', age: 1 }],
    desc: 'Advance to the Feudal Age. Requires two Dark Age buildings.', isAge: true }),
  castleAge: T({ name: 'Castle Age', cost: { food: 800, gold: 200 }, time: 160, age: 1, icon: 'age2', effects: [{ t: 'age', age: 2 }],
    desc: 'Advance to the Castle Age. Requires two Feudal Age buildings.', isAge: true }),
  imperialAge: T({ name: 'Imperial Age', cost: { food: 1000, gold: 800 }, time: 190, age: 2, icon: 'age3', effects: [{ t: 'age', age: 3 }],
    desc: 'Advance to the Imperial Age. Requires two Castle Age buildings (or a Castle).', isAge: true }),

  loom: T({ name: 'Loom', cost: { gold: 50 }, time: 25, age: 0, icon: 'loom',
    effects: [{ t: 'stat', on: 'unit:villager', stat: 'hp', add: 15 }, { t: 'stat', on: 'unit:villager', stat: 'armorM', add: 1 }, { t: 'stat', on: 'unit:villager', stat: 'armorP', add: 2 }],
    desc: 'Villagers +15 HP, +1 melee armor, +2 pierce armor.' }),
  wheelbarrow: T({ name: 'Wheelbarrow', cost: { food: 175, wood: 50 }, time: 75, age: 1, icon: 'wheelbarrow',
    effects: [{ t: 'eco', stat: 'villSpeed', mul: 1.1 }, { t: 'eco', stat: 'capacity', mul: 1.25 }],
    desc: 'Villagers move 10% faster and carry 25% more.' }),
  handCart: T({ name: 'Hand Cart', cost: { food: 300, wood: 200 }, time: 55, age: 2, icon: 'handcart', requires: ['wheelbarrow'],
    effects: [{ t: 'eco', stat: 'villSpeed', mul: 1.1 }, { t: 'eco', stat: 'capacity', mul: 1.2 }],
    desc: 'Villagers move 10% faster and carry 20% more.' }),
  townWatch: T({ name: 'Town Watch', cost: { food: 75 }, time: 25, age: 1, icon: 'townwatch',
    effects: [{ t: 'stat', on: 'bclass:building', stat: 'los', add: 4 }], desc: 'Buildings +4 line of sight.' }),

  horseCollar: T({ name: 'Horse Collar', cost: { food: 75, wood: 75 }, time: 20, age: 1, icon: 'horsecollar',
    effects: [{ t: 'eco', stat: 'farmFood', add: 75 }], desc: 'Farms produce +75 food.' }),
  heavyPlow: T({ name: 'Heavy Plow', cost: { food: 125, wood: 125 }, time: 40, age: 2, icon: 'heavyplow', requires: ['horseCollar'],
    effects: [{ t: 'eco', stat: 'farmFood', add: 125 }, { t: 'eco', stat: 'farm', mul: 1.1 }], desc: 'Farms produce +125 food; farmers work 10% faster.' }),
  cropRotation: T({ name: 'Crop Rotation', cost: { food: 250, wood: 250 }, time: 70, age: 3, icon: 'croprotation', requires: ['heavyPlow'],
    effects: [{ t: 'eco', stat: 'farmFood', add: 175 }], desc: 'Farms produce +175 food.' }),

  doubleBitAxe: T({ name: 'Double-Bit Axe', cost: { food: 100, wood: 50 }, time: 25, age: 1, icon: 'axe1',
    effects: [{ t: 'eco', stat: 'wood', mul: 1.2 }], desc: 'Lumberjacks work 20% faster.' }),
  bowSaw: T({ name: 'Bow Saw', cost: { food: 150, wood: 100 }, time: 50, age: 2, icon: 'axe2', requires: ['doubleBitAxe'],
    effects: [{ t: 'eco', stat: 'wood', mul: 1.2 }], desc: 'Lumberjacks work 20% faster.' }),
  twoManSaw: T({ name: 'Two-Man Saw', cost: { food: 300, wood: 200 }, time: 100, age: 3, icon: 'axe3', requires: ['bowSaw'],
    effects: [{ t: 'eco', stat: 'wood', mul: 1.1 }], desc: 'Lumberjacks work 10% faster.' }),

  goldMining: T({ name: 'Gold Mining', cost: { food: 100, wood: 75 }, time: 30, age: 1, icon: 'gold1',
    effects: [{ t: 'eco', stat: 'gold', mul: 1.15 }], desc: 'Gold miners work 15% faster.' }),
  goldShaftMining: T({ name: 'Gold Shaft Mining', cost: { food: 200, wood: 100 }, time: 75, age: 2, icon: 'gold2', requires: ['goldMining'],
    effects: [{ t: 'eco', stat: 'gold', mul: 1.15 }], desc: 'Gold miners work 15% faster.' }),
  stoneMining: T({ name: 'Stone Mining', cost: { food: 100, wood: 75 }, time: 30, age: 1, icon: 'stone1',
    effects: [{ t: 'eco', stat: 'stone', mul: 1.15 }], desc: 'Stone miners work 15% faster.' }),
  stoneShaftMining: T({ name: 'Stone Shaft Mining', cost: { food: 200, wood: 100 }, time: 75, age: 2, icon: 'stone2', requires: ['stoneMining'],
    effects: [{ t: 'eco', stat: 'stone', mul: 1.15 }], desc: 'Stone miners work 15% faster.' }),

  // Blacksmith
  forging: T({ name: 'Forging', cost: { food: 150 }, time: 50, age: 1, icon: 'forge1', line: 'bsAtk', tier: 1,
    effects: [{ t: 'stat', on: INF, stat: 'atk', add: 1 }, { t: 'stat', on: 'meleeCav', stat: 'atk', add: 1 }], desc: 'Infantry and cavalry +1 attack.' }),
  ironCasting: T({ name: 'Iron Casting', cost: { food: 220, gold: 120 }, time: 75, age: 2, icon: 'forge2', line: 'bsAtk', tier: 2, requires: ['forging'],
    effects: [{ t: 'stat', on: INF, stat: 'atk', add: 1 }, { t: 'stat', on: 'meleeCav', stat: 'atk', add: 1 }], desc: 'Infantry and cavalry +1 attack.' }),
  blastFurnace: T({ name: 'Blast Furnace', cost: { food: 275, gold: 225 }, time: 100, age: 3, icon: 'forge3', line: 'bsAtk', tier: 3, requires: ['ironCasting'],
    effects: [{ t: 'stat', on: INF, stat: 'atk', add: 2 }, { t: 'stat', on: 'meleeCav', stat: 'atk', add: 2 }], desc: 'Infantry and cavalry +2 attack.' }),
  scaleMail: T({ name: 'Scale Mail Armor', cost: { food: 100 }, time: 40, age: 1, icon: 'infarmor1', line: 'bsInf', tier: 1,
    effects: [{ t: 'stat', on: INF, stat: 'armorM', add: 1 }, { t: 'stat', on: INF, stat: 'armorP', add: 1 }], desc: 'Infantry +1/+1 armor.' }),
  chainMail: T({ name: 'Chain Mail Armor', cost: { food: 200, gold: 100 }, time: 55, age: 2, icon: 'infarmor2', line: 'bsInf', tier: 2, requires: ['scaleMail'],
    effects: [{ t: 'stat', on: INF, stat: 'armorM', add: 1 }, { t: 'stat', on: INF, stat: 'armorP', add: 1 }], desc: 'Infantry +1/+1 armor.' }),
  plateMail: T({ name: 'Plate Mail Armor', cost: { food: 300, gold: 150 }, time: 70, age: 3, icon: 'infarmor3', line: 'bsInf', tier: 3, requires: ['chainMail'],
    effects: [{ t: 'stat', on: INF, stat: 'armorM', add: 1 }, { t: 'stat', on: INF, stat: 'armorP', add: 2 }], desc: 'Infantry +1/+2 armor.' }),
  scaleBarding: T({ name: 'Scale Barding Armor', cost: { food: 150 }, time: 45, age: 1, icon: 'cavarmor1', line: 'bsCav', tier: 1,
    effects: [{ t: 'stat', on: CAV, stat: 'armorM', add: 1 }, { t: 'stat', on: CAV, stat: 'armorP', add: 1 }], desc: 'Cavalry +1/+1 armor.' }),
  chainBarding: T({ name: 'Chain Barding Armor', cost: { food: 250, gold: 150 }, time: 60, age: 2, icon: 'cavarmor2', line: 'bsCav', tier: 2, requires: ['scaleBarding'],
    effects: [{ t: 'stat', on: CAV, stat: 'armorM', add: 1 }, { t: 'stat', on: CAV, stat: 'armorP', add: 1 }], desc: 'Cavalry +1/+1 armor.' }),
  plateBarding: T({ name: 'Plate Barding Armor', cost: { food: 350, gold: 200 }, time: 75, age: 3, icon: 'cavarmor3', line: 'bsCav', tier: 3, requires: ['chainBarding'],
    effects: [{ t: 'stat', on: CAV, stat: 'armorM', add: 1 }, { t: 'stat', on: CAV, stat: 'armorP', add: 2 }], desc: 'Cavalry +1/+2 armor.' }),
  fletching: T({ name: 'Fletching', cost: { food: 100, gold: 50 }, time: 30, age: 1, icon: 'arrow1', line: 'bsArch', tier: 1,
    effects: [{ t: 'stat', on: ARCH, stat: 'atk', add: 1 }, { t: 'stat', on: ARCH, stat: 'range', add: 1 }, { t: 'stat', on: 'bclass:arrows', stat: 'atk', add: 1 }, { t: 'stat', on: 'bclass:arrows', stat: 'range', add: 1 }],
    desc: 'Archers, towers and Town Centers +1 attack and +1 range.' }),
  bodkinArrow: T({ name: 'Bodkin Arrow', cost: { food: 200, gold: 100 }, time: 35, age: 2, icon: 'arrow2', line: 'bsArch', tier: 2, requires: ['fletching'],
    effects: [{ t: 'stat', on: ARCH, stat: 'atk', add: 1 }, { t: 'stat', on: ARCH, stat: 'range', add: 1 }, { t: 'stat', on: 'bclass:arrows', stat: 'atk', add: 1 }, { t: 'stat', on: 'bclass:arrows', stat: 'range', add: 1 }],
    desc: 'Archers, towers and Town Centers +1 attack and +1 range.' }),
  bracer: T({ name: 'Bracer', cost: { food: 300, gold: 200 }, time: 40, age: 3, icon: 'arrow3', line: 'bsArch', tier: 3, requires: ['bodkinArrow'],
    effects: [{ t: 'stat', on: ARCH, stat: 'atk', add: 1 }, { t: 'stat', on: ARCH, stat: 'range', add: 1 }, { t: 'stat', on: 'bclass:arrows', stat: 'atk', add: 1 }, { t: 'stat', on: 'bclass:arrows', stat: 'range', add: 1 }],
    desc: 'Archers, towers and Town Centers +1 attack and +1 range.' }),
  paddedArcherArmor: T({ name: 'Padded Archer Armor', cost: { food: 100 }, time: 40, age: 1, icon: 'archarmor1', line: 'bsArchArm', tier: 1,
    effects: [{ t: 'stat', on: ARCH, stat: 'armorM', add: 1 }, { t: 'stat', on: ARCH, stat: 'armorP', add: 1 }], desc: 'Archers +1/+1 armor.' }),
  leatherArcherArmor: T({ name: 'Leather Archer Armor', cost: { food: 150, gold: 150 }, time: 55, age: 2, icon: 'archarmor2', line: 'bsArchArm', tier: 2, requires: ['paddedArcherArmor'],
    effects: [{ t: 'stat', on: ARCH, stat: 'armorM', add: 1 }, { t: 'stat', on: ARCH, stat: 'armorP', add: 1 }], desc: 'Archers +1/+1 armor.' }),
  ringArcherArmor: T({ name: 'Ring Archer Armor', cost: { food: 250, gold: 250 }, time: 70, age: 3, icon: 'archarmor3', line: 'bsArchArm', tier: 3, requires: ['leatherArcherArmor'],
    effects: [{ t: 'stat', on: ARCH, stat: 'armorM', add: 1 }, { t: 'stat', on: ARCH, stat: 'armorP', add: 2 }], desc: 'Archers +1/+2 armor.' }),

  // Barracks
  manAtArms: T({ name: 'Man-at-Arms', cost: { food: 100, gold: 40 }, time: 40, age: 1, icon: 'unit:manAtArms', effects: [{ t: 'upgrade', line: 'militia', to: 'manAtArms' }], desc: 'Upgrade Militia to Man-at-Arms.' }),
  longSwordsman: T({ name: 'Long Swordsman', cost: { food: 200, gold: 65 }, time: 45, age: 2, icon: 'unit:longSwordsman', requires: ['manAtArms'], effects: [{ t: 'upgrade', line: 'militia', to: 'longSwordsman' }], desc: 'Upgrade Men-at-Arms to Long Swordsmen.' }),
  twoHanded: T({ name: 'Two-Handed Swordsman', cost: { food: 300, gold: 100 }, time: 75, age: 3, icon: 'unit:twoHanded', requires: ['longSwordsman'], effects: [{ t: 'upgrade', line: 'militia', to: 'twoHanded' }], desc: 'Upgrade Long Swordsmen to Two-Handed Swordsmen.' }),
  pikeman: T({ name: 'Pikeman', cost: { food: 215, gold: 90 }, time: 45, age: 2, icon: 'unit:pikeman', effects: [{ t: 'upgrade', line: 'spear', to: 'pikeman' }], desc: 'Upgrade Spearmen to Pikemen.' }),
  halberdier: T({ name: 'Halberdier', cost: { food: 300, gold: 600 }, time: 50, age: 3, icon: 'unit:halberdier', requires: ['pikeman'], effects: [{ t: 'upgrade', line: 'spear', to: 'halberdier' }], desc: 'Upgrade Pikemen to Halberdiers.' }),
  // Archery range
  crossbowman: T({ name: 'Crossbowman', cost: { food: 125, gold: 75 }, time: 35, age: 2, icon: 'unit:crossbowman', effects: [{ t: 'upgrade', line: 'archer', to: 'crossbowman' }], desc: 'Upgrade Archers to Crossbowmen.' }),
  arbalester: T({ name: 'Arbalester', cost: { food: 350, gold: 300 }, time: 50, age: 3, icon: 'unit:arbalester', requires: ['crossbowman'], effects: [{ t: 'upgrade', line: 'archer', to: 'arbalester' }], desc: 'Upgrade Crossbowmen to Arbalesters.' }),
  eliteSkirmisher: T({ name: 'Elite Skirmisher', cost: { wood: 200, gold: 100 }, time: 50, age: 2, icon: 'unit:eliteSkirmisher', effects: [{ t: 'upgrade', line: 'skirm', to: 'eliteSkirmisher' }], desc: 'Upgrade Skirmishers to Elite Skirmishers.' }),
  heavyCavArcher: T({ name: 'Heavy Cav Archer', cost: { food: 900, gold: 500 }, time: 50, age: 3, icon: 'unit:heavyCavArcher', effects: [{ t: 'upgrade', line: 'cavArcher', to: 'heavyCavArcher' }], desc: 'Upgrade Cavalry Archers to Heavy Cavalry Archers.' }),
  thumbRing: T({ name: 'Thumb Ring', cost: { food: 300, wood: 250 }, time: 45, age: 2, icon: 'thumbring',
    effects: [{ t: 'stat', on: ARCH, stat: 'accuracy', add: 0.15 }, { t: 'stat', on: ARCH, stat: 'reload', mul: 0.88 }], desc: 'Archers fire faster and more accurately.' }),
  // Stable
  bloodlines: T({ name: 'Bloodlines', cost: { food: 150, gold: 100 }, time: 50, age: 1, icon: 'bloodlines',
    effects: [{ t: 'stat', on: CAV, stat: 'hp', add: 20 }], desc: 'Cavalry +20 HP.' }),
  husbandry: T({ name: 'Husbandry', cost: { food: 150 }, time: 40, age: 2, icon: 'husbandry',
    effects: [{ t: 'stat', on: CAV, stat: 'speed', mul: 1.1 }], desc: 'Cavalry move 10% faster.' }),
  lightCavalry: T({ name: 'Light Cavalry', cost: { food: 150, gold: 50 }, time: 45, age: 2, icon: 'unit:lightCavalry', effects: [{ t: 'upgrade', line: 'scout', to: 'lightCavalry' }], desc: 'Upgrade Scout Cavalry to Light Cavalry.' }),
  cavalier: T({ name: 'Cavalier', cost: { food: 300, gold: 300 }, time: 100, age: 3, icon: 'unit:cavalier', effects: [{ t: 'upgrade', line: 'knight', to: 'cavalier' }], desc: 'Upgrade Knights to Cavaliers.' }),
  // Siege workshop
  cappedRam: T({ name: 'Capped Ram', cost: { food: 300 }, time: 50, age: 3, icon: 'unit:cappedRam', effects: [{ t: 'upgrade', line: 'ram', to: 'cappedRam' }], desc: 'Upgrade Battering Rams to Capped Rams.' }),
  onager: T({ name: 'Onager', cost: { food: 800, gold: 500 }, time: 75, age: 3, icon: 'unit:onager', effects: [{ t: 'upgrade', line: 'mangonel', to: 'onager' }], desc: 'Upgrade Mangonels to Onagers.' }),
  // University
  masonry: T({ name: 'Masonry', cost: { food: 175, wood: 150 }, time: 50, age: 2, icon: 'masonry',
    effects: [{ t: 'stat', on: 'bclass:building', stat: 'hp', mul: 1.1 }, { t: 'stat', on: 'bclass:building', stat: 'armorM', add: 1 }, { t: 'stat', on: 'bclass:building', stat: 'armorP', add: 1 }],
    desc: 'Buildings +10% HP, +1/+1 armor.' }),
  architecture: T({ name: 'Architecture', cost: { food: 300, wood: 200 }, time: 70, age: 3, icon: 'architecture', requires: ['masonry'],
    effects: [{ t: 'stat', on: 'bclass:building', stat: 'hp', mul: 1.1 }, { t: 'stat', on: 'bclass:building', stat: 'armorM', add: 1 }, { t: 'stat', on: 'bclass:building', stat: 'armorP', add: 1 }],
    desc: 'Buildings +10% HP, +1/+1 armor.' }),
  treadmillCrane: T({ name: 'Treadmill Crane', cost: { food: 200, wood: 300 }, time: 50, age: 2, icon: 'crane',
    effects: [{ t: 'eco', stat: 'buildSpeed', mul: 1.2 }], desc: 'Villagers construct buildings 20% faster.' }),
  ballistics: T({ name: 'Ballistics', cost: { wood: 300, gold: 175 }, time: 60, age: 2, icon: 'ballistics',
    effects: [{ t: 'stat', on: ARCH, stat: 'accuracy', add: 0.1 }, { t: 'stat', on: 'bclass:arrows', stat: 'accuracy', add: 0.1 }], desc: 'Archers and buildings fire more accurately.' }),
  chemistry: T({ name: 'Chemistry', cost: { food: 300, gold: 200 }, time: 100, age: 3, icon: 'chemistry',
    effects: [{ t: 'stat', on: ARCH, stat: 'atk', add: 1 }, { t: 'stat', on: 'bclass:arrows', stat: 'atk', add: 1 }, { t: 'stat', on: 'class:siege', stat: 'atk', add: 1 }],
    desc: 'Missile units, towers and siege +1 attack.' }),
  guardTowerTech: T({ name: 'Guard Tower', cost: { food: 100, wood: 250 }, time: 30, age: 2, icon: 'building:guardTower',
    effects: [{ t: 'bupgrade', from: 'watchTower', to: 'guardTower' }], desc: 'Upgrade Watch Towers to Guard Towers.' }),
  keepTech: T({ name: 'Keep', cost: { food: 500, wood: 350 }, time: 75, age: 3, icon: 'building:keep', requires: ['guardTowerTech'],
    effects: [{ t: 'bupgrade', from: 'guardTower', to: 'keep' }, { t: 'bupgrade', from: 'watchTower', to: 'keep' }], desc: 'Upgrade Guard Towers to Keeps.' }),
  // Monastery
  fervor: T({ name: 'Fervor', cost: { gold: 140 }, time: 50, age: 2, icon: 'fervor',
    effects: [{ t: 'stat', on: 'class:monk', stat: 'speed', mul: 1.15 }], desc: 'Monks move 15% faster.' }),
  sanctity: T({ name: 'Sanctity', cost: { gold: 120 }, time: 60, age: 2, icon: 'sanctity',
    effects: [{ t: 'stat', on: 'class:monk', stat: 'hp', add: 15 }], desc: 'Monks +15 HP.' }),
  illumination: T({ name: 'Illumination', cost: { gold: 120 }, time: 65, age: 3, icon: 'illumination',
    effects: [{ t: 'stat', on: 'class:monk', stat: 'reload', mul: 0.67 }], desc: 'Monks regain their faith 50% faster.' }),
  // Castle
  hoardings: T({ name: 'Hoardings', cost: { food: 400, wood: 400 }, time: 75, age: 3, icon: 'hoardings',
    effects: [{ t: 'stat', on: 'bclass:castle', stat: 'hp', mul: 1.21 }], desc: 'Castles +21% HP.' }),
  conscription: T({ name: 'Conscription', cost: { food: 150, gold: 150 }, time: 60, age: 3, icon: 'conscription',
    effects: [{ t: 'eco', stat: 'trainSpeed', mul: 1.33 }], desc: 'Military units train 33% faster.' }),
};
for (const [id, t] of Object.entries(TECHS)) t.id = id;

// Default economic modifiers for a player.
export function defaultEco() {
  return {
    wood: 1, gold: 1, stone: 1, farm: 1, berries: 1, hunt: 1, sheep: 1, fish: 1,
    capacity: 1, villSpeed: 1, farmFood: 250, buildSpeed: 1, trainSpeed: 1,
  };
}

// Pretty cost string helper (used in tooltips & logs).
export function costEntries(cost) {
  return RESOURCES.filter((r) => cost && cost[r] > 0).map((r) => [r, cost[r]]);
}

export const PLAYER_COLORS = [
  { name: 'Blue', main: '#2f6fe0', dark: '#173a82', light: '#8fb6ff', css: '#4a84ff' },
  { name: 'Red', main: '#d12a2a', dark: '#6e1010', light: '#ff8a80', css: '#ff4a4a' },
  { name: 'Green', main: '#2e9e3a', dark: '#135018', light: '#8ee39a', css: '#46c255' },
  { name: 'Yellow', main: '#e3c21d', dark: '#7a6508', light: '#fff08a', css: '#ffd930' },
  { name: 'Cyan', main: '#1fb8c4', dark: '#0b5b61', light: '#8ff0f5', css: '#3fd8e4' },
  { name: 'Purple', main: '#8a3ccf', dark: '#431867', light: '#d0a4ff', css: '#a95cf0' },
  { name: 'Orange', main: '#e8801c', dark: '#76400a', light: '#ffc07a', css: '#ff9a3a' },
  { name: 'Grey', main: '#8c8c8c', dark: '#404040', light: '#dddddd', css: '#b0b0b0' },
];
