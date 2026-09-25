// Game data: units, buildings, technologies, ages and tunables.
// Numbers follow Age of Empires II closely; the simulation runs at BASE_SPEED (AoE2 "normal" is 1.7x).

export const TW = 64; // isometric tile width in world pixels
export const TH = 32; // isometric tile height
export const BASE_SPEED = 1.7;
export const MAX_POP = 200;
export const CARRY_BASE = 10;
export const HOTKEYS = ['Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F', 'G', 'Z', 'X', 'C', 'V', 'B'];
export const RES_TYPES = ['food', 'wood', 'gold', 'stone'];
export const WONDER_TIME = 400; // game seconds a completed wonder must stand

export const GATHER_RATES = { forage: 0.31, sheep: 0.33, hunt: 0.41, farm: 0.32, wood: 0.39, gold: 0.38, stone: 0.36 };

export const PLAYER_COLORS = [
  { id: 'blue', name: 'Blue', main: '#2d64dc', dark: '#17368a', light: '#7eaaff' },
  { id: 'red', name: 'Red', main: '#d8302a', dark: '#851511', light: '#ff8078' },
  { id: 'green', name: 'Green', main: '#2e9c35', dark: '#185a1c', light: '#86de86' },
  { id: 'yellow', name: 'Yellow', main: '#e6c11f', dark: '#8a6f07', light: '#fff27f' },
  { id: 'teal', name: 'Teal', main: '#1fb3ad', dark: '#0c6763', light: '#86f2ec' },
  { id: 'purple', name: 'Purple', main: '#8d3ed0', dark: '#4f1e7b', light: '#cea2f5' },
  { id: 'orange', name: 'Orange', main: '#ee7b1b', dark: '#8e4209', light: '#ffbc7c' },
  { id: 'grey', name: 'Grey', main: '#9a9a9a', dark: '#4a4a4a', light: '#dedede' },
];
export const GAIA_COLOR = { id: 'gaia', name: 'Gaia', main: '#c8c0a8', dark: '#7a735f', light: '#f0ead8' };

export const AGE_NAMES = ['Dark Age', 'Feudal Age', 'Castle Age', 'Imperial Age'];
export const AGE_NUMERALS = ['I', 'II', 'III', 'IV'];

export const DIFFICULTY = {
  easy: { name: 'Easy', think: 2.0, gatherMult: 0.8, villTarget: [16, 24, 30, 34], firstAttack: 1080, waveBase: 6, waveGrow: 2, attackGap: 300, trainMult: 0.8, techs: 0.5, maxMilitary: 30 },
  standard: { name: 'Standard', think: 1.2, gatherMult: 1.0, villTarget: [21, 30, 45, 55], firstAttack: 780, waveBase: 8, waveGrow: 3, attackGap: 210, trainMult: 1.0, techs: 0.85, maxMilitary: 60 },
  hard: { name: 'Hard', think: 0.8, gatherMult: 1.15, villTarget: [23, 33, 55, 70], firstAttack: 540, waveBase: 7, waveGrow: 4, attackGap: 170, trainMult: 1.1, techs: 1, maxMilitary: 90 },
  hardest: { name: 'Hardest', think: 0.5, gatherMult: 1.35, villTarget: [25, 36, 62, 80], firstAttack: 420, waveBase: 6, waveGrow: 5, attackGap: 140, trainMult: 1.25, techs: 1, maxMilitary: 120 },
};

// tc = technology class (which blacksmith / economy upgrades affect the unit)
// classes = armor classes for bonus damage
export const UNITS = {
  villager: {
    name: 'Villager', cost: { food: 50 }, time: 25, hp: 25, atk: 3, atkType: 'melee', armor: [0, 0], range: 0, rof: 2,
    speed: 0.8, los: 4, radius: 0.2, tc: 'villager', classes: ['villager'], sprite: 'villager',
    desc: 'Gathers resources and constructs or repairs buildings. The backbone of your economy.',
  },
  militia: {
    name: 'Militia', cost: { food: 60, gold: 20 }, time: 21, hp: 40, atk: 4, atkType: 'melee', armor: [0, 1], range: 0, rof: 2,
    speed: 0.9, los: 4, radius: 0.22, tc: 'infantry', classes: ['infantry'], sprite: 'sword', gear: 0, bonus: { building: 1 },
    desc: 'Basic swordsman. Cheap and sturdy; good against buildings and trash units.',
  },
  manatarms: {
    name: 'Man-at-Arms', cost: { food: 60, gold: 20 }, time: 21, hp: 45, atk: 6, atkType: 'melee', armor: [0, 1], range: 0, rof: 2,
    speed: 0.9, los: 4, radius: 0.22, tc: 'infantry', classes: ['infantry'], sprite: 'sword', gear: 1, bonus: { building: 2 },
    desc: 'Armored swordsman. Strong early infantry.',
  },
  longswordsman: {
    name: 'Long Swordsman', cost: { food: 60, gold: 20 }, time: 21, hp: 60, atk: 9, atkType: 'melee', armor: [1, 1], range: 0, rof: 2,
    speed: 0.9, los: 4, radius: 0.22, tc: 'infantry', classes: ['infantry'], sprite: 'sword', gear: 2, bonus: { building: 3 },
    desc: 'Heavy infantry with a long blade.',
  },
  twohanded: {
    name: 'Two-Handed Swordsman', cost: { food: 60, gold: 20 }, time: 21, hp: 60, atk: 12, atkType: 'melee', armor: [1, 1], range: 0, rof: 2,
    speed: 0.9, los: 5, radius: 0.22, tc: 'infantry', classes: ['infantry'], sprite: 'sword', gear: 3, bonus: { building: 4 },
    desc: 'Elite infantry wielding a massive two-handed sword.',
  },
  spearman: {
    name: 'Spearman', cost: { food: 35, wood: 25 }, time: 22, hp: 45, atk: 3, atkType: 'melee', armor: [0, 0], range: 0, rof: 3,
    speed: 1.0, los: 4, radius: 0.22, tc: 'infantry', classes: ['infantry', 'spear'], sprite: 'spear', gear: 0, bonus: { cavalry: 15 },
    desc: 'Cheap anti-cavalry infantry. Deals massive bonus damage to cavalry.',
  },
  pikeman: {
    name: 'Pikeman', cost: { food: 35, wood: 25 }, time: 22, hp: 55, atk: 4, atkType: 'melee', armor: [0, 0], range: 0, rof: 3,
    speed: 1.0, los: 4, radius: 0.22, tc: 'infantry', classes: ['infantry', 'spear'], sprite: 'spear', gear: 1, bonus: { cavalry: 22 },
    desc: 'Improved anti-cavalry infantry.',
  },
  halberdier: {
    name: 'Halberdier', cost: { food: 35, wood: 25 }, time: 22, hp: 60, atk: 6, atkType: 'melee', armor: [1, 0], range: 0, rof: 3,
    speed: 1.0, los: 4, radius: 0.22, tc: 'infantry', classes: ['infantry', 'spear'], sprite: 'spear', gear: 2, bonus: { cavalry: 32 },
    desc: 'The ultimate cavalry killer.',
  },
  archer: {
    name: 'Archer', cost: { wood: 25, gold: 45 }, time: 35, hp: 30, atk: 4, atkType: 'pierce', armor: [0, 0], range: 4, rof: 2,
    speed: 0.96, los: 6, radius: 0.2, tc: 'archer', classes: ['archer'], sprite: 'archer', gear: 0, bonus: { spear: 3 },
    projectile: 'arrow', accuracy: 0.8, desc: 'Ranged foot soldier. Strong against infantry, weak against skirmishers and cavalry.',
  },
  crossbowman: {
    name: 'Crossbowman', cost: { wood: 25, gold: 45 }, time: 27, hp: 35, atk: 5, atkType: 'pierce', armor: [0, 0], range: 5, rof: 2,
    speed: 0.96, los: 7, radius: 0.2, tc: 'archer', classes: ['archer'], sprite: 'archer', gear: 1, bonus: { spear: 3 },
    projectile: 'arrow', accuracy: 0.85, desc: 'Improved archer with a crossbow.',
  },
  arbalester: {
    name: 'Arbalester', cost: { wood: 25, gold: 45 }, time: 27, hp: 40, atk: 6, atkType: 'pierce', armor: [0, 0], range: 5, rof: 2,
    speed: 0.96, los: 7, radius: 0.2, tc: 'archer', classes: ['archer'], sprite: 'archer', gear: 2, bonus: { spear: 3 },
    projectile: 'arrow', accuracy: 0.9, desc: 'Elite crossbowman.',
  },
  skirmisher: {
    name: 'Skirmisher', cost: { food: 25, wood: 35 }, time: 22, hp: 30, atk: 2, atkType: 'pierce', armor: [0, 3], range: 4, rof: 3,
    speed: 0.96, los: 6, radius: 0.2, tc: 'archer', classes: ['archer', 'skirm'], sprite: 'skirm', gear: 0, bonus: { archer: 3, spear: 1 },
    projectile: 'javelin', accuracy: 0.9, desc: 'Cheap anti-archer unit. High pierce armor.',
  },
  eliteskirmisher: {
    name: 'Elite Skirmisher', cost: { food: 25, wood: 35 }, time: 22, hp: 35, atk: 3, atkType: 'pierce', armor: [0, 4], range: 5, rof: 3,
    speed: 0.96, los: 7, radius: 0.2, tc: 'archer', classes: ['archer', 'skirm'], sprite: 'skirm', gear: 1, bonus: { archer: 4, spear: 2 },
    projectile: 'javelin', accuracy: 0.9, desc: 'Improved skirmisher.',
  },
  cavarcher: {
    name: 'Cavalry Archer', cost: { wood: 40, gold: 70 }, time: 34, hp: 50, atk: 6, atkType: 'pierce', armor: [0, 0], range: 4, rof: 2,
    speed: 1.4, los: 5, radius: 0.32, tc: 'archer', classes: ['cavalry', 'archer'], sprite: 'cavarcher', gear: 0,
    projectile: 'arrow', accuracy: 0.6, desc: 'Fast mounted archer. Hit and run.',
  },
  scout: {
    name: 'Scout Cavalry', cost: { food: 80 }, time: 30, hp: 45, atk: 3, atkType: 'melee', armor: [0, 2], range: 0, rof: 2,
    speed: 1.55, los: 5, radius: 0.32, tc: 'cavalry', classes: ['cavalry'], sprite: 'scout', gear: 0, bonus: { monk: 6 },
    desc: 'Fast, cheap cavalry for scouting and raiding.',
  },
  lightcav: {
    name: 'Light Cavalry', cost: { food: 80 }, time: 30, hp: 60, atk: 7, atkType: 'melee', armor: [0, 2], range: 0, rof: 2,
    speed: 1.5, los: 7, radius: 0.32, tc: 'cavalry', classes: ['cavalry'], sprite: 'scout', gear: 1, bonus: { monk: 10 },
    desc: 'Improved scout cavalry. Great raider, deadly to monks.',
  },
  knight: {
    name: 'Knight', cost: { food: 60, gold: 75 }, time: 30, hp: 100, atk: 10, atkType: 'melee', armor: [2, 2], range: 0, rof: 1.8,
    speed: 1.35, los: 4, radius: 0.34, tc: 'cavalry', classes: ['cavalry'], sprite: 'knight', gear: 0,
    desc: 'Heavily armored cavalry. Powerful all-rounder, weak to spearmen.',
  },
  cavalier: {
    name: 'Cavalier', cost: { food: 60, gold: 75 }, time: 30, hp: 120, atk: 12, atkType: 'melee', armor: [2, 2], range: 0, rof: 1.8,
    speed: 1.35, los: 4, radius: 0.34, tc: 'cavalry', classes: ['cavalry'], sprite: 'knight', gear: 1,
    desc: 'Improved knight.',
  },
  paladin: {
    name: 'Paladin', cost: { food: 60, gold: 75 }, time: 30, hp: 160, atk: 14, atkType: 'melee', armor: [2, 3], range: 0, rof: 1.8,
    speed: 1.35, los: 5, radius: 0.34, tc: 'cavalry', classes: ['cavalry'], sprite: 'knight', gear: 2,
    desc: 'The pinnacle of heavy cavalry.',
  },
  ram: {
    name: 'Battering Ram', cost: { wood: 160, gold: 75 }, time: 36, hp: 175, atk: 2, atkType: 'melee', armor: [-3, 180], range: 0, rof: 5,
    speed: 0.5, los: 3, radius: 0.45, tc: 'siege', classes: ['siege', 'ram'], sprite: 'ram', gear: 0, bonus: { building: 125 },
    onlyBuildings: true, pop: 1, desc: 'Siege weapon that devastates buildings. Nearly immune to arrows; vulnerable to melee.',
  },
  cappedram: {
    name: 'Capped Ram', cost: { wood: 160, gold: 75 }, time: 36, hp: 200, atk: 3, atkType: 'melee', armor: [-3, 190], range: 0, rof: 5,
    speed: 0.5, los: 3, radius: 0.45, tc: 'siege', classes: ['siege', 'ram'], sprite: 'ram', gear: 1, bonus: { building: 150 },
    onlyBuildings: true, desc: 'Improved battering ram.',
  },
  mangonel: {
    name: 'Mangonel', cost: { wood: 160, gold: 135 }, time: 46, hp: 50, atk: 40, atkType: 'melee', armor: [0, 6], range: 7, minRange: 3, rof: 6,
    speed: 0.6, los: 9, radius: 0.42, tc: 'siege', classes: ['siege'], sprite: 'mangonel', gear: 0, bonus: { building: 35 },
    projectile: 'stone', accuracy: 1, splash: 0.9, desc: 'Catapult hurling stones that damage all units in an area. Beware of friendly fire.',
  },
  onager: {
    name: 'Onager', cost: { wood: 160, gold: 135 }, time: 46, hp: 60, atk: 50, atkType: 'melee', armor: [0, 7], range: 8, minRange: 3, rof: 6,
    speed: 0.6, los: 10, radius: 0.42, tc: 'siege', classes: ['siege'], sprite: 'mangonel', gear: 1, bonus: { building: 45 },
    projectile: 'stone', accuracy: 1, splash: 1.1, desc: 'Improved mangonel.',
  },
  trebuchet: {
    name: 'Trebuchet', cost: { wood: 200, gold: 200 }, time: 50, hp: 150, atk: 200, atkType: 'melee', armor: [1, 150], range: 16, minRange: 4, rof: 10,
    speed: 0.7, los: 19, radius: 0.5, tc: 'siege', classes: ['siege'], sprite: 'trebuchet', gear: 0, bonus: { building: 250 },
    projectile: 'boulder', accuracy: 1, onlyBuildings: true, desc: 'Long-range siege engine that outranges towers and castles.',
  },
  monk: {
    name: 'Monk', cost: { gold: 100 }, time: 51, hp: 30, atk: 0, atkType: 'melee', armor: [0, 0], range: 9, rof: 1,
    speed: 0.7, los: 11, radius: 0.2, tc: 'monk', classes: ['monk'], sprite: 'monk', gear: 0,
    desc: 'Heals friendly units and converts enemy units to your side.',
  },
  longbowman: {
    name: 'Longbowman', cost: { wood: 35, gold: 40 }, time: 19, hp: 35, atk: 6, atkType: 'pierce', armor: [0, 1], range: 5, rof: 2,
    speed: 0.96, los: 7, radius: 0.2, tc: 'archer', classes: ['archer'], sprite: 'longbow', gear: 0, bonus: { spear: 3 },
    projectile: 'arrow', accuracy: 0.8, desc: 'Unique unit: archer with exceptional range.',
  },
  elitelongbowman: {
    name: 'Elite Longbowman', cost: { wood: 35, gold: 40 }, time: 19, hp: 40, atk: 7, atkType: 'pierce', armor: [0, 1], range: 6, rof: 2,
    speed: 0.96, los: 8, radius: 0.2, tc: 'archer', classes: ['archer'], sprite: 'longbow', gear: 1, bonus: { spear: 3 },
    projectile: 'arrow', accuracy: 0.9, desc: 'Elite longbowman.',
  },
  // ----- animals (owned by Gaia or captured) -----
  sheep: {
    name: 'Sheep', cost: {}, time: 0, hp: 7, atk: 0, atkType: 'melee', armor: [0, 0], range: 0, rof: 2, speed: 0.7, los: 2,
    radius: 0.22, tc: 'animal', classes: ['animal'], sprite: 'sheep', animal: 'herd', food: 100, pop: 0,
    desc: 'Herdable animal. Slaughter it with villagers for food.',
  },
  deer: {
    name: 'Deer', cost: {}, time: 0, hp: 5, atk: 0, atkType: 'melee', armor: [0, 0], range: 0, rof: 2, speed: 1.1, los: 3,
    radius: 0.25, tc: 'animal', classes: ['animal'], sprite: 'deer', animal: 'hunt', food: 140, pop: 0,
    desc: 'Wild animal. Hunt it with villagers for food.',
  },
};

// Unit lines: trained units always come out as the current tier of their line.
export const LINES = {
  villager: ['villager'],
  sword: ['militia', 'manatarms', 'longswordsman', 'twohanded'],
  spear: ['spearman', 'pikeman', 'halberdier'],
  archer: ['archer', 'crossbowman', 'arbalester'],
  skirm: ['skirmisher', 'eliteskirmisher'],
  cavarcher: ['cavarcher'],
  scout: ['scout', 'lightcav'],
  knight: ['knight', 'cavalier', 'paladin'],
  ram: ['ram', 'cappedram'],
  mangonel: ['mangonel', 'onager'],
  trebuchet: ['trebuchet'],
  monk: ['monk'],
  longbow: ['longbowman', 'elitelongbowman'],
};
// minimum age to train a line
export const LINE_AGE = {
  villager: 0, sword: 0, spear: 1, archer: 1, skirm: 1, cavarcher: 2, scout: 1, knight: 2,
  ram: 2, mangonel: 2, trebuchet: 3, monk: 2, longbow: 2,
};
export const LINE_OF_TYPE = {};
for (const [line, members] of Object.entries(LINES)) for (const m of members) LINE_OF_TYPE[m] = line;

export const BUILDINGS = {
  towncenter: {
    name: 'Town Center', size: 4, hp: 2400, armor: [3, 5], cost: { wood: 275, stone: 100 }, time: 150, age: 2, los: 8, pop: 5,
    drop: ['food', 'wood', 'gold', 'stone'], attack: { atk: 5, range: 6, rof: 2, arrows: 1 }, garrison: 15, height: 110,
    cmds: [
      { slot: 0, line: 'villager' }, { slot: 1, techs: ['loom'] }, { slot: 2, techs: ['wheelbarrow', 'handcart'] },
      { slot: 4, age: true }, { slot: 12, action: 'bell' }, { slot: 13, action: 'ungarrison' },
    ],
    desc: 'Trains villagers, researches economy technologies and advances you through the ages. Villagers drop off any resource here.',
    menu: 'eco', menuSlot: 10,
  },
  house: { name: 'House', size: 2, hp: 550, armor: [0, 7], cost: { wood: 25 }, time: 25, age: 0, los: 2, pop: 5, height: 50, menu: 'eco', menuSlot: 0, desc: 'Supports 5 population.' },
  mill: {
    name: 'Mill', size: 2, hp: 600, armor: [0, 7], cost: { wood: 100 }, time: 35, age: 0, los: 6, drop: ['food'], height: 60, menu: 'eco', menuSlot: 1,
    cmds: [{ slot: 0, techs: ['horsecollar', 'heavyplow', 'croprotation'] }],
    desc: 'Drop-off point for food. Enables farms and farming technologies.',
  },
  lumbercamp: {
    name: 'Lumber Camp', size: 2, hp: 600, armor: [0, 7], cost: { wood: 100 }, time: 35, age: 0, los: 6, drop: ['wood'], height: 45, menu: 'eco', menuSlot: 2,
    cmds: [{ slot: 0, techs: ['doublebitaxe', 'bowsaw', 'twomansaw'] }],
    desc: 'Drop-off point for wood. Researches woodcutting technologies.',
  },
  miningcamp: {
    name: 'Mining Camp', size: 2, hp: 600, armor: [0, 7], cost: { wood: 100 }, time: 35, age: 0, los: 6, drop: ['gold', 'stone'], height: 45, menu: 'eco', menuSlot: 3,
    cmds: [{ slot: 0, techs: ['goldmining', 'goldshaft'] }, { slot: 1, techs: ['stonemining', 'stoneshaft'] }],
    desc: 'Drop-off point for gold and stone. Researches mining technologies.',
  },
  farm: {
    name: 'Farm', size: 3, hp: 480, armor: [0, 0], cost: { wood: 60 }, time: 15, age: 0, los: 1, walkable: true, requires: 'mill', height: 4, menu: 'eco', menuSlot: 4,
    desc: 'Renewable food source worked by one villager. Automatically reseeded for 60 wood when exhausted.',
  },
  blacksmith: {
    name: 'Blacksmith', size: 3, hp: 2100, armor: [1, 7], cost: { wood: 150 }, time: 40, age: 1, los: 6, height: 70, menu: 'eco', menuSlot: 5,
    cmds: [
      { slot: 0, techs: ['forging', 'ironcasting', 'blastfurnace'] },
      { slot: 1, techs: ['scalemail', 'chainmail', 'platemail'] },
      { slot: 2, techs: ['scalebarding', 'chainbarding', 'platebarding'] },
      { slot: 5, techs: ['fletching', 'bodkin', 'bracer'] },
      { slot: 6, techs: ['paddedarcher', 'leatherarcher', 'ringarcher'] },
    ],
    desc: 'Researches attack and armor upgrades for your army.',
  },
  market: {
    name: 'Market', size: 4, hp: 2100, armor: [0, 7], cost: { wood: 175 }, time: 60, age: 1, los: 6, requires: 'mill', height: 60, menu: 'eco', menuSlot: 6,
    cmds: [
      { slot: 0, trade: 'buy', res: 'food' }, { slot: 1, trade: 'buy', res: 'wood' }, { slot: 2, trade: 'buy', res: 'stone' },
      { slot: 5, trade: 'sell', res: 'food' }, { slot: 6, trade: 'sell', res: 'wood' }, { slot: 7, trade: 'sell', res: 'stone' },
    ],
    desc: 'Buy and sell resources for gold. Prices change with every trade.',
  },
  monastery: {
    name: 'Monastery', size: 3, hp: 2100, armor: [3, 7], cost: { wood: 175 }, time: 40, age: 2, los: 6, height: 90, menu: 'eco', menuSlot: 7,
    cmds: [{ slot: 0, line: 'monk' }],
    desc: 'Trains monks, who heal your units and convert enemies.',
  },
  wonder: {
    name: 'Wonder', size: 5, hp: 4800, armor: [3, 10], cost: { wood: 1000, food: 1000, gold: 1000, stone: 1000 }, time: 350, age: 3, los: 8, height: 170, menu: 'eco', menuSlot: 11,
    desc: 'A monument to your civilization. If it stands long enough after completion, you win the game.',
  },
  barracks: {
    name: 'Barracks', size: 3, hp: 1200, armor: [0, 7], cost: { wood: 175 }, time: 50, age: 0, los: 6, height: 62, menu: 'mil', menuSlot: 0,
    cmds: [
      { slot: 0, line: 'sword' }, { slot: 1, line: 'spear' },
      { slot: 5, techs: ['up_manatarms', 'up_longsword', 'up_twohanded'] }, { slot: 6, techs: ['up_pikeman', 'up_halberdier'] },
    ],
    desc: 'Trains infantry.',
  },
  archeryrange: {
    name: 'Archery Range', size: 3, hp: 1500, armor: [0, 7], cost: { wood: 175 }, time: 50, age: 1, los: 6, requires: 'barracks', height: 62, menu: 'mil', menuSlot: 1,
    cmds: [
      { slot: 0, line: 'archer' }, { slot: 1, line: 'skirm' }, { slot: 2, line: 'cavarcher' },
      { slot: 5, techs: ['up_crossbow', 'up_arbalester'] }, { slot: 6, techs: ['up_eliteskirm'] },
    ],
    desc: 'Trains archers, skirmishers and cavalry archers.',
  },
  stable: {
    name: 'Stable', size: 3, hp: 1500, armor: [0, 7], cost: { wood: 175 }, time: 50, age: 1, los: 6, requires: 'barracks', height: 62, menu: 'mil', menuSlot: 2,
    cmds: [
      { slot: 0, line: 'scout' }, { slot: 1, line: 'knight' },
      { slot: 5, techs: ['up_lightcav'] }, { slot: 6, techs: ['up_cavalier', 'up_paladin'] },
    ],
    desc: 'Trains cavalry.',
  },
  siegeworkshop: {
    name: 'Siege Workshop', size: 4, hp: 2100, armor: [0, 7], cost: { wood: 200 }, time: 40, age: 2, los: 6, requires: 'blacksmith', height: 72, menu: 'mil', menuSlot: 3,
    cmds: [{ slot: 0, line: 'ram' }, { slot: 1, line: 'mangonel' }, { slot: 5, techs: ['up_cappedram'] }, { slot: 6, techs: ['up_onager'] }],
    desc: 'Builds siege weapons.',
  },
  watchtower: {
    name: 'Watch Tower', size: 1, hp: 1020, armor: [1, 7], cost: { wood: 25, stone: 125 }, time: 80, age: 1, los: 10,
    attack: { atk: 5, range: 8, rof: 2, arrows: 1 }, garrison: 5, height: 120, menu: 'mil', menuSlot: 5,
    cmds: [{ slot: 13, action: 'ungarrison' }],
    desc: 'Defensive tower that fires arrows at enemies. Garrison units to add arrows.',
  },
  palisade: { name: 'Palisade Wall', size: 1, hp: 250, armor: [2, 5], cost: { wood: 2 }, time: 5, age: 0, los: 2, wall: true, height: 40, menu: 'mil', menuSlot: 6, desc: 'Cheap wooden wall. Drag to build a line. Walls block all units, your own included; delete a segment to open a passage.' },
  stonewall: { name: 'Stone Wall', size: 1, hp: 1800, armor: [8, 10], cost: { stone: 5 }, time: 8, age: 1, los: 2, wall: true, height: 48, menu: 'mil', menuSlot: 7, desc: 'Sturdy stone wall. Drag to build a line. Walls block all units, your own included; delete a segment to open a passage.' },
  castle: {
    name: 'Castle', size: 4, hp: 4800, armor: [8, 11], cost: { stone: 650 }, time: 200, age: 2, los: 11, pop: 20,
    attack: { atk: 11, range: 8, rof: 2, arrows: 4 }, garrison: 20, height: 140, menu: 'mil', menuSlot: 10,
    cmds: [
      { slot: 0, line: 'longbow' }, { slot: 1, line: 'trebuchet' }, { slot: 5, techs: ['up_elitelongbow'] },
      { slot: 13, action: 'ungarrison' },
    ],
    desc: 'Mighty fortress that fires volleys of arrows, supports 20 population and trains Longbowmen and Trebuchets.',
  },
};

// Buildings that count toward age advancement requirements.
export const AGE_BUILDINGS = [
  ['barracks', 'mill', 'lumbercamp', 'miningcamp'],
  ['archeryrange', 'stable', 'blacksmith', 'market'],
  ['siegeworkshop', 'monastery', 'castle'],
];

// Technology effects:
//  gather:{res:mult} atk:{tc:+n} arm:{tc:[m,p]} range:{tc:+n} farm:+n carry:+n villSpeed:mult villHp:+n villArm:[m,p]
//  line:[line, tier] (upgrades existing units)  age:n  bldAtk/bldRange
export const TECHS = {
  feudal: { name: 'Feudal Age', cost: { food: 500 }, time: 130, age: 0, ageUp: 1, desc: 'Advance to the Feudal Age. Requires 2 Dark Age buildings.' },
  castle: { name: 'Castle Age', cost: { food: 800, gold: 200 }, time: 160, age: 1, ageUp: 2, desc: 'Advance to the Castle Age. Requires 2 Feudal Age buildings.' },
  imperial: { name: 'Imperial Age', cost: { food: 1000, gold: 800 }, time: 190, age: 2, ageUp: 3, desc: 'Advance to the Imperial Age. Requires 2 Castle Age buildings (a Castle counts as 2).' },
  loom: { name: 'Loom', cost: { gold: 50 }, time: 25, age: 0, fx: { villHp: 15, villArm: [1, 2] }, desc: 'Villagers +15 HP, +1 melee / +2 pierce armor.' },
  wheelbarrow: { name: 'Wheelbarrow', cost: { food: 175, wood: 50 }, time: 75, age: 1, fx: { villSpeed: 1.1, carry: 3 }, desc: 'Villagers move 10% faster and carry +3 resources.' },
  handcart: { name: 'Hand Cart', cost: { food: 300, wood: 200 }, time: 55, age: 2, fx: { villSpeed: 1.1, carry: 5 }, desc: 'Villagers move 10% faster and carry +5 resources.' },
  horsecollar: { name: 'Horse Collar', cost: { food: 75, wood: 75 }, time: 20, age: 1, fx: { farm: 75 }, desc: 'Farms produce +75 food.' },
  heavyplow: { name: 'Heavy Plow', cost: { food: 125, wood: 125 }, time: 40, age: 2, fx: { farm: 125, gather: { farm: 1.1 } }, desc: 'Farms produce +125 food; farmers work 10% faster.' },
  croprotation: { name: 'Crop Rotation', cost: { food: 250, wood: 250 }, time: 70, age: 3, fx: { farm: 175 }, desc: 'Farms produce +175 food.' },
  doublebitaxe: { name: 'Double-Bit Axe', cost: { food: 100, wood: 50 }, time: 25, age: 1, fx: { gather: { wood: 1.2 } }, desc: 'Lumberjacks work 20% faster.' },
  bowsaw: { name: 'Bow Saw', cost: { food: 150, wood: 100 }, time: 50, age: 2, fx: { gather: { wood: 1.2 } }, desc: 'Lumberjacks work 20% faster.' },
  twomansaw: { name: 'Two-Man Saw', cost: { food: 300, wood: 200 }, time: 100, age: 3, fx: { gather: { wood: 1.1 } }, desc: 'Lumberjacks work 10% faster.' },
  goldmining: { name: 'Gold Mining', cost: { food: 100, wood: 75 }, time: 30, age: 1, fx: { gather: { gold: 1.15 } }, desc: 'Gold miners work 15% faster.' },
  goldshaft: { name: 'Gold Shaft Mining', cost: { food: 200, wood: 150 }, time: 75, age: 2, fx: { gather: { gold: 1.15 } }, desc: 'Gold miners work 15% faster.' },
  stonemining: { name: 'Stone Mining', cost: { food: 100, wood: 75 }, time: 30, age: 1, fx: { gather: { stone: 1.15 } }, desc: 'Stone miners work 15% faster.' },
  stoneshaft: { name: 'Stone Shaft Mining', cost: { food: 200, wood: 150 }, time: 75, age: 2, fx: { gather: { stone: 1.15 } }, desc: 'Stone miners work 15% faster.' },
  forging: { name: 'Forging', cost: { food: 150 }, time: 50, age: 1, fx: { atk: { infantry: 1, cavalry: 1 } }, desc: 'Infantry and cavalry +1 attack.' },
  ironcasting: { name: 'Iron Casting', cost: { food: 220, gold: 120 }, time: 75, age: 2, fx: { atk: { infantry: 1, cavalry: 1 } }, desc: 'Infantry and cavalry +1 attack.' },
  blastfurnace: { name: 'Blast Furnace', cost: { food: 275, gold: 225 }, time: 100, age: 3, fx: { atk: { infantry: 2, cavalry: 2 } }, desc: 'Infantry and cavalry +2 attack.' },
  scalemail: { name: 'Scale Mail Armor', cost: { food: 100 }, time: 40, age: 1, fx: { arm: { infantry: [1, 1] } }, desc: 'Infantry +1 melee / +1 pierce armor.' },
  chainmail: { name: 'Chain Mail Armor', cost: { food: 200, gold: 100 }, time: 55, age: 2, fx: { arm: { infantry: [1, 1] } }, desc: 'Infantry +1 melee / +1 pierce armor.' },
  platemail: { name: 'Plate Mail Armor', cost: { food: 300, gold: 150 }, time: 70, age: 3, fx: { arm: { infantry: [1, 2] } }, desc: 'Infantry +1 melee / +2 pierce armor.' },
  scalebarding: { name: 'Scale Barding Armor', cost: { food: 150 }, time: 45, age: 1, fx: { arm: { cavalry: [1, 1] } }, desc: 'Cavalry +1 melee / +1 pierce armor.' },
  chainbarding: { name: 'Chain Barding Armor', cost: { food: 250, gold: 150 }, time: 60, age: 2, fx: { arm: { cavalry: [1, 1] } }, desc: 'Cavalry +1 melee / +1 pierce armor.' },
  platebarding: { name: 'Plate Barding Armor', cost: { food: 350, gold: 200 }, time: 75, age: 3, fx: { arm: { cavalry: [1, 2] } }, desc: 'Cavalry +1 melee / +2 pierce armor.' },
  fletching: { name: 'Fletching', cost: { food: 100, gold: 50 }, time: 30, age: 1, fx: { atk: { archer: 1 }, range: { archer: 1 }, bldAtk: 1, bldRange: 1 }, desc: 'Archers, towers and town centers +1 attack and +1 range.' },
  bodkin: { name: 'Bodkin Arrow', cost: { food: 200, gold: 100 }, time: 35, age: 2, fx: { atk: { archer: 1 }, range: { archer: 1 }, bldAtk: 1, bldRange: 1 }, desc: 'Archers, towers and town centers +1 attack and +1 range.' },
  bracer: { name: 'Bracer', cost: { food: 300, gold: 200 }, time: 40, age: 3, fx: { atk: { archer: 1 }, range: { archer: 1 }, bldAtk: 1, bldRange: 1 }, desc: 'Archers, towers and town centers +1 attack and +1 range.' },
  paddedarcher: { name: 'Padded Archer Armor', cost: { food: 100 }, time: 40, age: 1, fx: { arm: { archer: [1, 1] } }, desc: 'Archers +1 melee / +1 pierce armor.' },
  leatherarcher: { name: 'Leather Archer Armor', cost: { food: 150, gold: 150 }, time: 55, age: 2, fx: { arm: { archer: [1, 1] } }, desc: 'Archers +1 melee / +1 pierce armor.' },
  ringarcher: { name: 'Ring Archer Armor', cost: { food: 250, gold: 250 }, time: 70, age: 3, fx: { arm: { archer: [1, 2] } }, desc: 'Archers +1 melee / +2 pierce armor.' },
  up_manatarms: { name: 'Man-at-Arms', cost: { food: 100, gold: 40 }, time: 40, age: 1, fx: { line: ['sword', 1] }, desc: 'Upgrade Militia to Man-at-Arms.' },
  up_longsword: { name: 'Long Swordsman', cost: { food: 200, gold: 65 }, time: 45, age: 2, fx: { line: ['sword', 2] }, desc: 'Upgrade Men-at-Arms to Long Swordsmen.' },
  up_twohanded: { name: 'Two-Handed Swordsman', cost: { food: 300, gold: 100 }, time: 75, age: 3, fx: { line: ['sword', 3] }, desc: 'Upgrade Long Swordsmen to Two-Handed Swordsmen.' },
  up_pikeman: { name: 'Pikeman', cost: { food: 215, gold: 90 }, time: 45, age: 2, fx: { line: ['spear', 1] }, desc: 'Upgrade Spearmen to Pikemen.' },
  up_halberdier: { name: 'Halberdier', cost: { food: 300, gold: 600 }, time: 50, age: 3, fx: { line: ['spear', 2] }, desc: 'Upgrade Pikemen to Halberdiers.' },
  up_crossbow: { name: 'Crossbowman', cost: { food: 125, gold: 75 }, time: 35, age: 2, fx: { line: ['archer', 1] }, desc: 'Upgrade Archers to Crossbowmen.' },
  up_arbalester: { name: 'Arbalester', cost: { food: 350, gold: 300 }, time: 50, age: 3, fx: { line: ['archer', 2] }, desc: 'Upgrade Crossbowmen to Arbalesters.' },
  up_eliteskirm: { name: 'Elite Skirmisher', cost: { wood: 200, gold: 100 }, time: 50, age: 2, fx: { line: ['skirm', 1] }, desc: 'Upgrade Skirmishers to Elite Skirmishers.' },
  up_lightcav: { name: 'Light Cavalry', cost: { food: 150, gold: 50 }, time: 45, age: 2, fx: { line: ['scout', 1] }, desc: 'Upgrade Scout Cavalry to Light Cavalry.' },
  up_cavalier: { name: 'Cavalier', cost: { food: 300, gold: 300 }, time: 100, age: 3, fx: { line: ['knight', 1] }, desc: 'Upgrade Knights to Cavaliers.' },
  up_paladin: { name: 'Paladin', cost: { food: 1300, gold: 750 }, time: 170, age: 3, fx: { line: ['knight', 2] }, desc: 'Upgrade Cavaliers to Paladins.' },
  up_cappedram: { name: 'Capped Ram', cost: { food: 300 }, time: 50, age: 3, fx: { line: ['ram', 1] }, desc: 'Upgrade Battering Rams to Capped Rams.' },
  up_onager: { name: 'Onager', cost: { food: 800, gold: 500 }, time: 75, age: 3, fx: { line: ['mangonel', 1] }, desc: 'Upgrade Mangonels to Onagers.' },
  up_elitelongbow: { name: 'Elite Longbowman', cost: { food: 850, gold: 850 }, time: 60, age: 3, fx: { line: ['longbow', 1] }, desc: 'Upgrade Longbowmen to Elite Longbowmen.' },
};

export const VILLAGER_MENUS = {
  eco: ['house', 'mill', 'lumbercamp', 'miningcamp', 'farm', 'blacksmith', 'market', 'monastery', null, null, 'towncenter', 'wonder'],
  mil: ['barracks', 'archeryrange', 'stable', 'siegeworkshop', null, 'watchtower', 'palisade', 'stonewall', null, null, 'castle'],
};

export const GARRISON_ARROW_TC = ['villager', 'infantry', 'archer'];
