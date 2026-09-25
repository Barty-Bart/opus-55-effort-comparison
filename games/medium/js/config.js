// Game data: units, buildings, technologies, ages.

export const MAP_SIZE = 96;
export const RES_TYPES = ['food', 'wood', 'gold', 'stone'];
export const AGE_NAMES = ['Dark Age', 'Feudal Age', 'Castle Age', 'Imperial Age'];
export const AGE_SHORT = ['I', 'II', 'III', 'IV'];
export const POP_MAX = 200;

export const PLAYER_COLORS = [
  { main: '#2e6be6', dark: '#173b8c', light: '#8fb7ff', name: 'Blue' },
  { main: '#d9352b', dark: '#7a1510', light: '#ff9a8f', name: 'Red' },
];

// Base gather rates (resource / second) and carry capacity
export const GATHER = { wood: 0.42, gold: 0.40, stone: 0.38, berry: 0.34, sheep: 0.40, deer: 0.40, farm: 0.36 };
export const CARRY = 10;

export const RESOURCE_DEFS = {
  tree: { name: 'Tree', res: 'wood', amount: 100 },
  gold: { name: 'Gold Mine', res: 'gold', amount: 800 },
  stone: { name: 'Stone Mine', res: 'stone', amount: 350 },
  berry: { name: 'Forage Bush', res: 'food', amount: 125 },
  sheep: { name: 'Sheep', res: 'food', amount: 100, animal: true, speed: 0.4 },
  deer: { name: 'Deer', res: 'food', amount: 140, animal: true, speed: 0.9 },
};

// cls: villager | infantry | archer | cavalry | siege
export const UNITS = {
  villager: {
    name: 'Villager', cls: 'villager', hp: 25, atk: 3, atkType: 'melee', range: 0, rate: 2, armor: [0, 0],
    speed: 0.9, los: 4, cost: { food: 50 }, time: 25, radius: 0.22,
    desc: 'Gathers resources and constructs buildings. The backbone of your economy.',
  },
  militia: {
    name: 'Militia', cls: 'infantry', line: 'militia', hp: 40, atk: 4, atkType: 'melee', range: 0, rate: 2, armor: [0, 1],
    speed: 0.9, los: 4, cost: { food: 60, gold: 20 }, time: 21, radius: 0.24, gear: 'sword',
    desc: 'Basic infantry. Cheap, sturdy swordsman.',
  },
  manatarms: {
    name: 'Man-at-Arms', cls: 'infantry', line: 'militia', hp: 45, atk: 6, atkType: 'melee', range: 0, rate: 2, armor: [0, 1],
    speed: 0.9, los: 4, cost: { food: 60, gold: 20 }, time: 21, radius: 0.24, gear: 'sword', helm: 1,
    desc: 'Upgraded infantry with better attack.',
  },
  longswordsman: {
    name: 'Long Swordsman', cls: 'infantry', line: 'militia', hp: 60, atk: 9, atkType: 'melee', range: 0, rate: 2, armor: [1, 1],
    speed: 0.9, los: 4, cost: { food: 60, gold: 20 }, time: 21, radius: 0.24, gear: 'sword', helm: 2,
    desc: 'Strong armored infantry.',
  },
  twohanded: {
    name: 'Two-Handed Swordsman', cls: 'infantry', line: 'militia', hp: 60, atk: 12, atkType: 'melee', range: 0, rate: 2, armor: [1, 1],
    speed: 0.9, los: 5, cost: { food: 60, gold: 20 }, time: 21, radius: 0.24, gear: 'greatsword', helm: 2,
    desc: 'Elite infantry wielding a massive blade.',
  },
  spearman: {
    name: 'Spearman', cls: 'infantry', line: 'spear', hp: 45, atk: 3, atkType: 'melee', range: 0, rate: 3, armor: [0, 0],
    bonus: { cavalry: 15 }, speed: 1.0, los: 4, cost: { food: 35, wood: 25 }, time: 22, age: 1, radius: 0.24, gear: 'spear',
    desc: 'Anti-cavalry infantry. Big bonus damage vs cavalry.',
  },
  pikeman: {
    name: 'Pikeman', cls: 'infantry', line: 'spear', hp: 55, atk: 4, atkType: 'melee', range: 0, rate: 3, armor: [0, 0],
    bonus: { cavalry: 22 }, speed: 1.0, los: 4, cost: { food: 35, wood: 25 }, time: 22, age: 1, radius: 0.24, gear: 'spear', helm: 1,
    desc: 'Upgraded anti-cavalry infantry.',
  },
  archer: {
    name: 'Archer', cls: 'archer', line: 'archer', hp: 30, atk: 4, atkType: 'pierce', range: 4, rate: 2, armor: [0, 0],
    speed: 0.96, los: 6, cost: { wood: 25, gold: 45 }, time: 27, age: 1, radius: 0.22, gear: 'bow', proj: 'arrow',
    desc: 'Ranged infantry. Strong against slow infantry.',
  },
  crossbowman: {
    name: 'Crossbowman', cls: 'archer', line: 'archer', hp: 35, atk: 5, atkType: 'pierce', range: 5, rate: 2, armor: [0, 0],
    speed: 0.96, los: 7, cost: { wood: 25, gold: 45 }, time: 27, age: 1, radius: 0.22, gear: 'crossbow', proj: 'arrow',
    desc: 'Upgraded ranged unit with longer range.',
  },
  arbalest: {
    name: 'Arbalest', cls: 'archer', line: 'archer', hp: 40, atk: 6, atkType: 'pierce', range: 5, rate: 2, armor: [0, 0],
    speed: 0.96, los: 7, cost: { wood: 25, gold: 45 }, time: 27, age: 1, radius: 0.22, gear: 'crossbow', proj: 'arrow', helm: 1,
    desc: 'Elite ranged infantry.',
  },
  skirmisher: {
    name: 'Skirmisher', cls: 'archer', line: 'skirm', hp: 30, atk: 2, atkType: 'pierce', range: 4, rate: 3, armor: [0, 3],
    bonus: { archer: 3 }, speed: 0.96, los: 6, cost: { food: 25, wood: 35 }, time: 22, age: 1, radius: 0.22, gear: 'javelin', proj: 'javelin',
    desc: 'Cheap anti-archer unit with high pierce armor.',
  },
  eliteskirmisher: {
    name: 'Elite Skirmisher', cls: 'archer', line: 'skirm', hp: 35, atk: 3, atkType: 'pierce', range: 5, rate: 3, armor: [0, 4],
    bonus: { archer: 4 }, speed: 0.96, los: 7, cost: { food: 25, wood: 35 }, time: 22, age: 1, radius: 0.22, gear: 'javelin', proj: 'javelin', helm: 1,
    desc: 'Upgraded anti-archer unit.',
  },
  scout: {
    name: 'Scout Cavalry', cls: 'cavalry', line: 'scout', hp: 45, atk: 3, atkType: 'melee', range: 0, rate: 2, armor: [0, 2],
    speed: 1.55, los: 6, cost: { food: 80 }, time: 30, age: 1, radius: 0.34, gear: 'sword', horse: 'light',
    desc: 'Fast, light cavalry. Great for scouting and raiding.',
  },
  lightcav: {
    name: 'Light Cavalry', cls: 'cavalry', line: 'scout', hp: 60, atk: 7, atkType: 'melee', range: 0, rate: 2, armor: [0, 2],
    speed: 1.5, los: 8, cost: { food: 80 }, time: 30, age: 1, radius: 0.34, gear: 'sword', horse: 'light', helm: 1,
    desc: 'Upgraded fast cavalry. Effective raider.',
  },
  knight: {
    name: 'Knight', cls: 'cavalry', line: 'knight', hp: 100, atk: 10, atkType: 'melee', range: 0, rate: 1.8, armor: [2, 2],
    speed: 1.35, los: 4, cost: { food: 60, gold: 75 }, time: 30, age: 2, radius: 0.36, gear: 'lance', horse: 'heavy', helm: 2,
    desc: 'Heavily armored cavalry. Powerful all-rounder.',
  },
  cavalier: {
    name: 'Cavalier', cls: 'cavalry', line: 'knight', hp: 120, atk: 12, atkType: 'melee', range: 0, rate: 1.8, armor: [2, 2],
    speed: 1.35, los: 5, cost: { food: 60, gold: 75 }, time: 30, age: 2, radius: 0.36, gear: 'lance', horse: 'heavy', helm: 3,
    desc: 'Elite heavy cavalry.',
  },
  longbowman: {
    name: 'Longbowman', cls: 'archer', line: 'longbow', hp: 35, atk: 6, atkType: 'pierce', range: 6, rate: 2, armor: [0, 1],
    speed: 0.96, los: 8, cost: { wood: 35, gold: 40 }, time: 19, age: 2, radius: 0.22, gear: 'longbow', proj: 'arrow', hood: 1,
    desc: 'Unique unit. Archer with exceptional range.',
  },
  elitelongbowman: {
    name: 'Elite Longbowman', cls: 'archer', line: 'longbow', hp: 40, atk: 7, atkType: 'pierce', range: 7, rate: 2, armor: [0, 1],
    speed: 0.96, los: 9, cost: { wood: 35, gold: 40 }, time: 19, age: 2, radius: 0.22, gear: 'longbow', proj: 'arrow', hood: 1, helm: 1,
    desc: 'Elite unique archer with devastating range.',
  },
  ram: {
    name: 'Battering Ram', cls: 'siege', line: 'ram', hp: 175, atk: 2, atkType: 'melee', range: 0, rate: 5, armor: [0, 180],
    bonus: { building: 125 }, speed: 0.55, los: 3, cost: { wood: 160, gold: 75 }, time: 36, age: 2, radius: 0.45, onlyBuildings: true,
    desc: 'Siege weapon. Devastating against buildings, immune to arrows.',
  },
  mangonel: {
    name: 'Mangonel', cls: 'siege', line: 'mangonel', hp: 50, atk: 40, atkType: 'melee', range: 7, rate: 6, armor: [0, 6],
    bonus: { building: 30 }, speed: 0.6, los: 8, cost: { wood: 160, gold: 135 }, time: 46, age: 2, radius: 0.45, proj: 'stone', splash: 1.0,
    desc: 'Siege weapon that hurls rocks, dealing area damage to groups.',
  },
};

// Buildings. w/h in tiles.
export const BUILDINGS = {
  towncenter: {
    name: 'Town Center', w: 4, h: 4, hp: 2400, armor: [3, 5], cost: { wood: 275, stone: 100 }, time: 150, age: 2,
    pop: 5, drop: ['food', 'wood', 'gold', 'stone'], los: 8, attack: { atk: 5, range: 6, rate: 2, shots: 1 },
    trains: ['villager'], techs: ['feudal', 'castle', 'imperial', 'loom', 'wheelbarrow', 'handcart'], cat: 'eco',
    desc: 'Trains villagers, researches ages. Accepts all resources. Fires arrows at enemies.',
  },
  house: { name: 'House', w: 2, h: 2, hp: 550, armor: [0, 7], cost: { wood: 25 }, time: 25, pop: 5, los: 2, cat: 'eco', desc: 'Supports 5 population.' },
  lumbercamp: {
    name: 'Lumber Camp', w: 2, h: 2, hp: 600, armor: [0, 7], cost: { wood: 100 }, time: 35, los: 4, drop: ['wood'], cat: 'eco',
    techs: ['doublebit', 'bowsaw', 'twoman'], desc: 'Drop-off point for wood. Researches woodcutting upgrades.',
  },
  mill: {
    name: 'Mill', w: 2, h: 2, hp: 600, armor: [0, 7], cost: { wood: 100 }, time: 35, los: 4, drop: ['food'], cat: 'eco',
    techs: ['horsecollar', 'heavyplow', 'croprotation'], desc: 'Drop-off point for food. Researches farming upgrades.',
  },
  miningcamp: {
    name: 'Mining Camp', w: 2, h: 2, hp: 600, armor: [0, 7], cost: { wood: 100 }, time: 35, los: 4, drop: ['gold', 'stone'], cat: 'eco',
    techs: ['goldmining', 'stonemining', 'goldshaft'], desc: 'Drop-off point for gold and stone.',
  },
  farm: { name: 'Farm', w: 3, h: 3, hp: 480, armor: [0, 0], cost: { wood: 60 }, time: 15, los: 1, cat: 'eco', walkable: true, desc: 'Renewable food source. Auto-reseeds when wood is available.' },
  barracks: {
    name: 'Barracks', w: 3, h: 3, hp: 1200, armor: [0, 7], cost: { wood: 175 }, time: 50, los: 5, cat: 'mil',
    trains: ['militia', 'spearman'], techs: ['manatarms', 'longswordsman', 'twohanded', 'pikeman'], desc: 'Trains infantry.',
  },
  archeryrange: {
    name: 'Archery Range', w: 3, h: 3, hp: 1200, armor: [0, 7], cost: { wood: 175 }, time: 50, los: 5, age: 1, cat: 'mil',
    trains: ['archer', 'skirmisher'], techs: ['crossbowman', 'arbalest', 'eliteskirmisher'], desc: 'Trains archers and skirmishers.',
  },
  stable: {
    name: 'Stable', w: 3, h: 3, hp: 1200, armor: [0, 7], cost: { wood: 175 }, time: 50, los: 5, age: 1, cat: 'mil',
    trains: ['scout', 'knight'], techs: ['lightcav', 'cavalier', 'bloodlines'], desc: 'Trains cavalry.',
  },
  blacksmith: {
    name: 'Blacksmith', w: 3, h: 3, hp: 1200, armor: [0, 7], cost: { wood: 150 }, time: 40, los: 5, age: 1, cat: 'mil',
    techs: ['forging', 'ironcasting', 'blastfurnace', 'scalemail', 'chainmail', 'platemail', 'fletching', 'bodkin', 'bracer',
      'paddedarcher', 'leatherarcher', 'scalebarding', 'chainbarding'],
    desc: 'Researches attack and armor upgrades.',
  },
  siegeworkshop: {
    name: 'Siege Workshop', w: 3, h: 3, hp: 1500, armor: [0, 7], cost: { wood: 200 }, time: 40, los: 5, age: 2, cat: 'mil',
    trains: ['ram', 'mangonel'], techs: [], desc: 'Builds siege weapons.',
  },
  tower: {
    name: 'Watch Tower', w: 1, h: 1, hp: 1020, armor: [1, 7], cost: { wood: 25, stone: 125 }, time: 60, los: 9, age: 1, cat: 'mil',
    attack: { atk: 5, range: 8, rate: 2, shots: 1 }, techs: ['guardtower'], desc: 'Defensive tower that shoots arrows.',
  },
  castle: {
    name: 'Castle', w: 4, h: 4, hp: 4800, armor: [8, 11], cost: { stone: 650 }, time: 200, los: 11, age: 2, cat: 'mil',
    pop: 20, attack: { atk: 11, range: 8, rate: 2, shots: 3 }, trains: ['longbowman'], techs: ['elitelongbowman', 'masonry'],
    desc: 'Mighty fortress. Fires volleys of arrows, trains Longbowmen.',
  },
};

export const ECO_BUILD = ['house', 'mill', 'lumbercamp', 'miningcamp', 'farm', 'towncenter'];
export const MIL_BUILD = ['barracks', 'archeryrange', 'stable', 'blacksmith', 'siegeworkshop', 'tower', 'castle'];

const add = (obj, cls, v) => { for (const c of cls) obj[c] += v; };
const addArmor = (p, cls, m, pr) => { for (const c of cls) { p.mods.armor[c][0] += m; p.mods.armor[c][1] += pr; } };

export const TECHS = {
  feudal: {
    name: 'Feudal Age', icon: '🏰', cost: { food: 500 }, time: 130, age: 0, ageUp: 1,
    reqBuildings: { list: ['barracks', 'mill', 'lumbercamp', 'miningcamp'], n: 2 },
    desc: 'Advance to the Feudal Age. Requires 2 of: Barracks, Mill, Lumber Camp, Mining Camp.',
  },
  castle: {
    name: 'Castle Age', icon: '🏯', cost: { food: 800, gold: 200 }, time: 160, age: 1, ageUp: 2,
    reqBuildings: { list: ['archeryrange', 'stable', 'blacksmith'], n: 2 },
    desc: 'Advance to the Castle Age. Requires 2 of: Archery Range, Stable, Blacksmith.',
  },
  imperial: {
    name: 'Imperial Age', icon: '👑', cost: { food: 1000, gold: 800 }, time: 190, age: 2, ageUp: 3,
    reqBuildings: { list: ['siegeworkshop', 'castle'], n: 1 },
    desc: 'Advance to the Imperial Age. Requires a Siege Workshop or Castle.',
  },
  loom: {
    name: 'Loom', icon: '🧵', cost: { gold: 50 }, time: 25, age: 0, desc: 'Villagers +15 HP, +1 melee / +2 pierce armor.',
    apply: (p) => { p.mods.hp.villager += 15; addArmor(p, ['villager'], 1, 2); },
  },
  wheelbarrow: {
    name: 'Wheelbarrow', icon: '🛒', cost: { food: 175, wood: 50 }, time: 75, age: 1, desc: 'Villagers move 10% faster and carry 25% more.',
    apply: (p) => { p.mods.speed.villager *= 1.1; p.mods.carry += 3; },
  },
  handcart: {
    name: 'Hand Cart', icon: '🛞', cost: { food: 300, wood: 200 }, time: 55, age: 2, req: 'wheelbarrow', desc: 'Villagers move 10% faster and carry 50% more.',
    apply: (p) => { p.mods.speed.villager *= 1.1; p.mods.carry += 5; },
  },
  doublebit: { name: 'Double-Bit Axe', icon: '🪓', cost: { food: 100, wood: 50 }, time: 25, age: 1, desc: 'Lumberjacks work 20% faster.', apply: (p) => { p.mods.gather.wood *= 1.2; } },
  bowsaw: { name: 'Bow Saw', icon: '🪚', cost: { food: 150, wood: 100 }, time: 50, age: 2, req: 'doublebit', desc: 'Lumberjacks work 20% faster.', apply: (p) => { p.mods.gather.wood *= 1.2; } },
  twoman: { name: 'Two-Man Saw', icon: '🪵', cost: { food: 300, wood: 200 }, time: 100, age: 3, req: 'bowsaw', desc: 'Lumberjacks work 10% faster.', apply: (p) => { p.mods.gather.wood *= 1.1; } },
  horsecollar: { name: 'Horse Collar', icon: '🐴', cost: { food: 75, wood: 75 }, time: 20, age: 1, desc: 'Farms +75 food.', apply: (p) => { p.mods.farmFood += 75; } },
  heavyplow: { name: 'Heavy Plow', icon: '🌾', cost: { food: 125, wood: 125 }, time: 40, age: 2, req: 'horsecollar', desc: 'Farms +125 food, farmers work 10% faster.', apply: (p) => { p.mods.farmFood += 125; p.mods.gather.farm *= 1.1; } },
  croprotation: { name: 'Crop Rotation', icon: '🌻', cost: { food: 250, wood: 250 }, time: 70, age: 3, req: 'heavyplow', desc: 'Farms +175 food, farmers work 10% faster.', apply: (p) => { p.mods.farmFood += 175; p.mods.gather.farm *= 1.1; } },
  goldmining: { name: 'Gold Mining', icon: '⛏️', cost: { food: 100, wood: 75 }, time: 30, age: 1, desc: 'Gold miners work 15% faster.', apply: (p) => { p.mods.gather.gold *= 1.15; } },
  stonemining: { name: 'Stone Mining', icon: '🪨', cost: { food: 100, wood: 75 }, time: 30, age: 1, desc: 'Stone miners work 15% faster.', apply: (p) => { p.mods.gather.stone *= 1.15; } },
  goldshaft: { name: 'Gold Shaft Mining', icon: '💰', cost: { food: 200, wood: 100 }, time: 75, age: 2, req: 'goldmining', desc: 'Gold miners work 15% faster.', apply: (p) => { p.mods.gather.gold *= 1.15; } },

  forging: { name: 'Forging', icon: '🔨', cost: { food: 150 }, time: 50, age: 1, desc: 'Infantry and cavalry +1 attack.', apply: (p) => add(p.mods.atk, ['infantry', 'cavalry'], 1) },
  ironcasting: { name: 'Iron Casting', icon: '⚒️', cost: { food: 220, gold: 120 }, time: 75, age: 2, req: 'forging', desc: 'Infantry and cavalry +1 attack.', apply: (p) => add(p.mods.atk, ['infantry', 'cavalry'], 1) },
  blastfurnace: { name: 'Blast Furnace', icon: '🔥', cost: { food: 275, gold: 225 }, time: 100, age: 3, req: 'ironcasting', desc: 'Infantry and cavalry +2 attack.', apply: (p) => add(p.mods.atk, ['infantry', 'cavalry'], 2) },
  scalemail: { name: 'Scale Mail Armor', icon: '🛡️', cost: { food: 100 }, time: 40, age: 1, desc: 'Infantry +1/+1 armor.', apply: (p) => addArmor(p, ['infantry'], 1, 1) },
  chainmail: { name: 'Chain Mail Armor', icon: '⛓️', cost: { food: 200, gold: 100 }, time: 55, age: 2, req: 'scalemail', desc: 'Infantry +1/+1 armor.', apply: (p) => addArmor(p, ['infantry'], 1, 1) },
  platemail: { name: 'Plate Mail Armor', icon: '🦾', cost: { food: 300, gold: 150 }, time: 70, age: 3, req: 'chainmail', desc: 'Infantry +1/+2 armor.', apply: (p) => addArmor(p, ['infantry'], 1, 2) },
  fletching: { name: 'Fletching', icon: '🏹', cost: { food: 100, gold: 50 }, time: 30, age: 1, desc: 'Archers, towers and Town Centers +1 attack, +1 range.', apply: (p) => { add(p.mods.atk, ['archer', 'building'], 1); add(p.mods.range, ['archer', 'building'], 1); } },
  bodkin: { name: 'Bodkin Arrow', icon: '🎯', cost: { food: 200, gold: 100 }, time: 35, age: 2, req: 'fletching', desc: 'Archers, towers and Town Centers +1 attack, +1 range.', apply: (p) => { add(p.mods.atk, ['archer', 'building'], 1); add(p.mods.range, ['archer', 'building'], 1); } },
  bracer: { name: 'Bracer', icon: '💪', cost: { food: 300, gold: 200 }, time: 40, age: 3, req: 'bodkin', desc: 'Archers, towers and Town Centers +1 attack, +1 range.', apply: (p) => { add(p.mods.atk, ['archer', 'building'], 1); add(p.mods.range, ['archer', 'building'], 1); } },
  paddedarcher: { name: 'Padded Archer Armor', icon: '🧥', cost: { food: 100 }, time: 40, age: 1, desc: 'Archers +1/+1 armor.', apply: (p) => addArmor(p, ['archer'], 1, 1) },
  leatherarcher: { name: 'Leather Archer Armor', icon: '🦺', cost: { food: 150, gold: 150 }, time: 55, age: 2, req: 'paddedarcher', desc: 'Archers +1/+1 armor.', apply: (p) => addArmor(p, ['archer'], 1, 1) },
  scalebarding: { name: 'Scale Barding Armor', icon: '🐎', cost: { food: 150 }, time: 45, age: 1, desc: 'Cavalry +1/+1 armor.', apply: (p) => addArmor(p, ['cavalry'], 1, 1) },
  chainbarding: { name: 'Chain Barding Armor', icon: '🏇', cost: { food: 250, gold: 150 }, time: 60, age: 2, req: 'scalebarding', desc: 'Cavalry +1/+1 armor.', apply: (p) => addArmor(p, ['cavalry'], 1, 1) },

  manatarms: { name: 'Man-at-Arms', unitIcon: 'manatarms', cost: { food: 100, gold: 40 }, time: 40, age: 1, upgrade: ['militia', 'manatarms'], desc: 'Upgrade Militia to Man-at-Arms.' },
  longswordsman: { name: 'Long Swordsman', unitIcon: 'longswordsman', cost: { food: 200, gold: 65 }, time: 45, age: 2, req: 'manatarms', upgrade: ['manatarms', 'longswordsman'], desc: 'Upgrade Men-at-Arms to Long Swordsmen.' },
  twohanded: { name: 'Two-Handed Swordsman', unitIcon: 'twohanded', cost: { food: 300, gold: 100 }, time: 75, age: 3, req: 'longswordsman', upgrade: ['longswordsman', 'twohanded'], desc: 'Upgrade Long Swordsmen to Two-Handed Swordsmen.' },
  pikeman: { name: 'Pikeman', unitIcon: 'pikeman', cost: { food: 215, gold: 90 }, time: 45, age: 2, upgrade: ['spearman', 'pikeman'], desc: 'Upgrade Spearmen to Pikemen.' },
  crossbowman: { name: 'Crossbowman', unitIcon: 'crossbowman', cost: { food: 125, gold: 75 }, time: 35, age: 2, upgrade: ['archer', 'crossbowman'], desc: 'Upgrade Archers to Crossbowmen.' },
  arbalest: { name: 'Arbalest', unitIcon: 'arbalest', cost: { food: 350, gold: 300 }, time: 50, age: 3, req: 'crossbowman', upgrade: ['crossbowman', 'arbalest'], desc: 'Upgrade Crossbowmen to Arbalests.' },
  eliteskirmisher: { name: 'Elite Skirmisher', unitIcon: 'eliteskirmisher', cost: { wood: 200, gold: 100 }, time: 50, age: 2, upgrade: ['skirmisher', 'eliteskirmisher'], desc: 'Upgrade Skirmishers to Elite Skirmishers.' },
  lightcav: { name: 'Light Cavalry', unitIcon: 'lightcav', cost: { food: 150, gold: 50 }, time: 45, age: 2, upgrade: ['scout', 'lightcav'], desc: 'Upgrade Scout Cavalry to Light Cavalry.' },
  cavalier: { name: 'Cavalier', unitIcon: 'cavalier', cost: { food: 300, gold: 300 }, time: 100, age: 3, upgrade: ['knight', 'cavalier'], desc: 'Upgrade Knights to Cavaliers.' },
  bloodlines: { name: 'Bloodlines', icon: '🩸', cost: { food: 150, gold: 100 }, time: 50, age: 1, desc: 'Cavalry +20 HP.', apply: (p) => { p.mods.hp.cavalry += 20; } },
  elitelongbowman: { name: 'Elite Longbowman', unitIcon: 'elitelongbowman', cost: { food: 600, gold: 500 }, time: 60, age: 3, upgrade: ['longbowman', 'elitelongbowman'], desc: 'Upgrade Longbowmen to Elite Longbowmen.' },
  guardtower: { name: 'Guard Tower', icon: '🗼', cost: { food: 100, wood: 250 }, time: 30, age: 2, desc: 'Towers +500 HP and +2 attack.', apply: (p) => { p.mods.towerHp += 500; p.mods.towerAtk += 2; } },
  masonry: { name: 'Masonry', icon: '🧱', cost: { wood: 175, stone: 150 }, time: 50, age: 2, desc: 'Buildings +10% HP, +1/+1 armor.', apply: (p) => { p.mods.bldHp *= 1.1; p.mods.armor.building[0] += 1; p.mods.armor.building[1] += 1; } },
};

export function newMods() {
  const cls = ['villager', 'infantry', 'archer', 'cavalry', 'siege', 'building'];
  const o = (v) => Object.fromEntries(cls.map((c) => [c, typeof v === 'function' ? v() : v]));
  return {
    hp: o(0), atk: o(0), range: o(0), armor: o(() => [0, 0]), speed: o(1),
    gather: { food: 1, wood: 1, gold: 1, stone: 1, farm: 1 },
    carry: 0, farmFood: 0, towerHp: 0, towerAtk: 0, bldHp: 1,
  };
}

// Hotkey grid layout: 5 columns x 3 rows
export const GRID_KEYS = ['Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F', 'G', 'Z', 'X', 'C', 'V', 'B'];
