'use strict';
// ---------- Game definitions ----------
const RES = ['food', 'wood', 'gold', 'stone'];
const AGE_NAMES = ['Dark Age', 'Feudal Age', 'Castle Age', 'Imperial Age'];
const PCOL = [
  { name: 'Nature', main: '#d9d4c4', dark: '#8a8474', light: '#ffffff' },
  { name: 'Blue', main: '#2d68d8', dark: '#173a82', light: '#86b4ff' },
  { name: 'Red', main: '#d23228', dark: '#7a1510', light: '#ff8f84' },
];

// Gather rates (resource per game-second)
const GATHER = { wood: 0.47, gold: 0.45, stone: 0.43, berries: 0.38, sheep: 0.4, hunt: 0.48, farm: 0.4 };

// look: rendering style. cls: armour classes for bonuses
const UNITS = {
  villager: { name: 'Villager', cost: { food: 50 }, time: 25, hp: 25, atk: 3, reload: 2, armor: [0, 0], speed: 0.8, los: 4,
    cls: ['villager'], look: 'villager', radius: 0.22, desc: 'Gathers resources and constructs buildings.' },
  militia: { name: 'Militia', cost: { food: 60, gold: 20 }, time: 21, hp: 40, atk: 4, reload: 2, armor: [0, 1], speed: 0.9, los: 4,
    cls: ['infantry'], look: 'infantry', gear: { helm: 'cap', weapon: 'club', shield: false, armor: '#8a7a5c' }, radius: 0.22, desc: 'Basic infantry. Cheap and quick to train.' },
  man_at_arms: { name: 'Man-at-Arms', cost: { food: 60, gold: 20 }, time: 21, hp: 45, atk: 6, reload: 2, armor: [0, 1], speed: 0.9, los: 4,
    cls: ['infantry'], look: 'infantry', gear: { helm: 'kettle', weapon: 'sword', shield: true, armor: '#8c8f96' }, radius: 0.22, desc: 'Armoured infantry. Good against buildings and archers-in-melee.' },
  long_swordsman: { name: 'Long Swordsman', cost: { food: 60, gold: 20 }, time: 21, hp: 60, atk: 9, reload: 2, armor: [1, 1], speed: 0.9, los: 5,
    cls: ['infantry'], look: 'infantry', gear: { helm: 'full', weapon: 'longsword', shield: true, armor: '#a4a8b0' }, radius: 0.23, desc: 'Strong swordsman.' },
  champion: { name: 'Champion', cost: { food: 60, gold: 20 }, time: 21, hp: 70, atk: 13, reload: 2, armor: [1, 1], speed: 0.9, los: 5,
    cls: ['infantry'], look: 'infantry', gear: { helm: 'great', weapon: 'greatsword', shield: false, armor: '#c4c7ce', plume: true }, radius: 0.24, desc: 'Elite infantry.' },
  spearman: { name: 'Spearman', cost: { food: 35, wood: 25 }, time: 22, hp: 45, atk: 3, reload: 3, armor: [0, 0], speed: 1.0, los: 4,
    cls: ['infantry', 'spear'], bonus: { cavalry: 15 }, look: 'infantry', gear: { helm: 'cap', weapon: 'spear', shield: false, armor: '#7d6a4a' }, radius: 0.22, age: 1, desc: 'Anti-cavalry infantry. Big bonus against mounted units.' },
  pikeman: { name: 'Pikeman', cost: { food: 35, wood: 25 }, time: 22, hp: 55, atk: 4, reload: 3, armor: [0, 0], speed: 1.0, los: 4,
    cls: ['infantry', 'spear'], bonus: { cavalry: 22 }, look: 'infantry', gear: { helm: 'kettle', weapon: 'pike', shield: false, armor: '#8c8f96' }, radius: 0.22, desc: 'Upgraded anti-cavalry infantry.' },
  archer: { name: 'Archer', cost: { wood: 25, gold: 45 }, time: 35, hp: 30, atk: 4, atkType: 'p', range: 4, reload: 2, armor: [0, 0], speed: 0.96, los: 6,
    cls: ['archer'], bonus: { spear: 3 }, look: 'archer', gear: { weapon: 'bow', hood: true, armor: '#6b7a3c' }, radius: 0.22, proj: 'arrow', age: 1, desc: 'Ranged foot soldier. Strong vs infantry, weak vs skirmishers & cavalry.' },
  crossbowman: { name: 'Crossbowman', cost: { wood: 25, gold: 45 }, time: 27, hp: 35, atk: 5, atkType: 'p', range: 5, reload: 2, armor: [0, 0], speed: 0.96, los: 7,
    cls: ['archer'], bonus: { spear: 3 }, look: 'archer', gear: { weapon: 'crossbow', helm: 'kettle', armor: '#7b6a4c' }, radius: 0.22, proj: 'bolt', desc: 'Upgraded archer.' },
  arbalester: { name: 'Arbalester', cost: { wood: 25, gold: 45 }, time: 27, hp: 40, atk: 6, atkType: 'p', range: 5, reload: 2, armor: [0, 0], speed: 0.96, los: 7,
    cls: ['archer'], bonus: { spear: 3 }, look: 'archer', gear: { weapon: 'crossbow', helm: 'full', armor: '#9a9ea6' }, radius: 0.22, proj: 'bolt', desc: 'Elite crossbowman.' },
  skirmisher: { name: 'Skirmisher', cost: { food: 25, wood: 35 }, time: 22, hp: 30, atk: 2, atkType: 'p', range: 4, reload: 3, armor: [0, 3], speed: 0.96, los: 6,
    cls: ['archer', 'skirm'], bonus: { archer: 3, spear: 3 }, look: 'archer', gear: { weapon: 'javelin', hood: false, armor: '#8a6d3c' }, radius: 0.22, proj: 'javelin', age: 1, desc: 'Cheap anti-archer unit with high pierce armour.' },
  elite_skirmisher: { name: 'Elite Skirmisher', cost: { food: 25, wood: 35 }, time: 22, hp: 35, atk: 3, atkType: 'p', range: 5, reload: 3, armor: [0, 4], speed: 0.96, los: 7,
    cls: ['archer', 'skirm'], bonus: { archer: 4, spear: 3 }, look: 'archer', gear: { weapon: 'javelin', helm: 'cap', armor: '#8a6d3c' }, radius: 0.22, proj: 'javelin', desc: 'Upgraded skirmisher.' },
  scout: { name: 'Scout Cavalry', cost: { food: 80 }, time: 30, hp: 45, atk: 3, reload: 2, armor: [0, 2], speed: 1.55, los: 7,
    cls: ['cavalry'], look: 'cavalry', gear: { weapon: 'sword', helm: 'cap', barding: null, horse: '#8b5a2b' }, radius: 0.34, desc: 'Fast, cheap horseman. Great for scouting and raiding.' },
  light_cavalry: { name: 'Light Cavalry', cost: { food: 80 }, time: 30, hp: 60, atk: 7, reload: 2, armor: [0, 2], speed: 1.5, los: 8,
    cls: ['cavalry'], look: 'cavalry', gear: { weapon: 'sword', helm: 'kettle', barding: null, horse: '#6e4a2a' }, radius: 0.34, desc: 'Upgraded scout. Excellent raider.' },
  knight: { name: 'Knight', cost: { food: 60, gold: 75 }, time: 30, hp: 100, atk: 10, reload: 1.8, armor: [2, 2], speed: 1.35, los: 4,
    cls: ['cavalry'], look: 'cavalry', gear: { weapon: 'lance', helm: 'full', barding: 'player', horse: '#e8e0d0' }, radius: 0.36, age: 2, desc: 'Heavily armoured cavalry. Powerful all-rounder.' },
  cavalier: { name: 'Cavalier', cost: { food: 60, gold: 75 }, time: 30, hp: 120, atk: 12, reload: 1.8, armor: [2, 2], speed: 1.35, los: 5,
    cls: ['cavalry'], look: 'cavalry', gear: { weapon: 'lance', helm: 'great', barding: 'player', horse: '#3a2a20', plume: true }, radius: 0.36, desc: 'Upgraded knight.' },
  cavalry_archer: { name: 'Cavalry Archer', cost: { wood: 40, gold: 70 }, time: 34, hp: 50, atk: 6, atkType: 'p', range: 4, reload: 2, armor: [0, 0], speed: 1.4, los: 5,
    cls: ['cavalry', 'archer'], look: 'cavalry', gear: { weapon: 'bow', helm: 'cap', barding: null, horse: '#a0703a' }, radius: 0.34, proj: 'arrow', age: 2, desc: 'Mobile mounted archer.' },
  battering_ram: { name: 'Battering Ram', cost: { wood: 160, gold: 75 }, time: 36, hp: 175, atk: 2, reload: 5, armor: [-3, 180], speed: 0.5, los: 3,
    cls: ['siege'], bonus: { building: 125 }, onlyBld: true, look: 'ram', radius: 0.45, age: 2, desc: 'Siege weapon that smashes buildings. Nearly immune to arrows — kill it with melee.' },
  mangonel: { name: 'Mangonel', cost: { wood: 160, gold: 135 }, time: 46, hp: 50, atk: 40, reload: 6, range: 7, minRange: 3, armor: [0, 6], speed: 0.6, los: 9,
    cls: ['siege'], bonus: { building: 35 }, blast: 1.0, look: 'mangonel', radius: 0.45, proj: 'rock', age: 2, desc: 'Catapult that fires area-damage rocks. Devastating vs massed troops.' },
  trebuchet: { name: 'Trebuchet', cost: { wood: 200, gold: 200 }, time: 50, hp: 150, atk: 200, reload: 10, range: 16, minRange: 4, armor: [1, 150], speed: 0.6, los: 17,
    cls: ['siege'], bonus: { building: 250 }, onlyBld: true, look: 'trebuchet', radius: 0.55, proj: 'boulder', age: 3, desc: 'Long-range siege engine. Destroys buildings from afar.' },
  monk: { name: 'Monk', cost: { gold: 100 }, time: 51, hp: 30, atk: 0, reload: 1, armor: [0, 0], speed: 0.7, los: 11, range: 9,
    cls: ['monk'], look: 'monk', radius: 0.22, age: 2, desc: 'Heals friendly units. Right-click an enemy unit to convert it to your side.' },
  // unique units
  longbowman: { name: 'Longbowman', cost: { wood: 35, gold: 40 }, time: 19, hp: 35, atk: 6, atkType: 'p', range: 6, reload: 2, armor: [0, 1], speed: 0.96, los: 8,
    cls: ['archer'], bonus: { spear: 3 }, look: 'archer', gear: { weapon: 'longbow', hood: true, armor: '#4c6b2c' }, radius: 0.22, proj: 'arrow', age: 2, unique: true, desc: 'Briton unique unit. Archer with exceptional range.' },
  throwing_axeman: { name: 'Throwing Axeman', cost: { food: 55, gold: 25 }, time: 17, hp: 60, atk: 7, range: 3, reload: 2, armor: [0, 0], speed: 1.0, los: 5,
    cls: ['infantry'], look: 'infantry', gear: { helm: 'kettle', weapon: 'axe', shield: true, armor: '#7d6a4a' }, radius: 0.22, proj: 'axe', age: 2, unique: true, desc: 'Frankish unique unit. Infantry that hurls axes (melee damage at range).' },
  teutonic_knight: { name: 'Teutonic Knight', cost: { food: 85, gold: 40 }, time: 12, hp: 80, atk: 12, reload: 2, armor: [5, 2], speed: 0.65, los: 3,
    cls: ['infantry'], look: 'infantry', gear: { helm: 'great', weapon: 'greatsword', shield: false, armor: '#d6d8dc', tabard: '#f0f0f0' }, radius: 0.25, age: 2, unique: true, desc: 'Teuton unique unit. Slow, heavily armoured infantry.' },
  mangudai: { name: 'Mangudai', cost: { wood: 55, gold: 65 }, time: 26, hp: 60, atk: 6, atkType: 'p', range: 4, reload: 2.1, armor: [0, 0], speed: 1.45, los: 6,
    cls: ['cavalry', 'archer'], bonus: { siege: 3 }, look: 'cavalry', gear: { weapon: 'bow', helm: 'fur', barding: null, horse: '#c79a5a' }, radius: 0.34, proj: 'arrow', age: 2, unique: true, desc: 'Mongol unique unit. Fast mounted archer.' },
  // wildlife
  sheep: { name: 'Sheep', hp: 7, atk: 0, reload: 2, armor: [0, 0], speed: 0.7, los: 2, cls: ['animal'], look: 'sheep', radius: 0.25, food: 100, herd: true, desc: 'Herdable livestock. Bring it near your Town Center and task villagers to it.' },
  deer: { name: 'Deer', hp: 5, atk: 0, reload: 2, armor: [0, 2], speed: 1.1, los: 3, cls: ['animal'], look: 'deer', radius: 0.28, food: 140, hunt: true, desc: 'Huntable animal. Villagers can hunt it for food.' },
  boar: { name: 'Wild Boar', hp: 75, atk: 6, reload: 2, armor: [0, 1], speed: 0.9, los: 4, cls: ['animal'], look: 'boar', radius: 0.3, food: 340, hunt: true, fights: true, desc: 'Dangerous! Fights back. Send several villagers to hunt it.' },
};
for (const k in UNITS) { const u = UNITS[k]; u.key = k; u.atkType = u.atkType || 'm'; u.range = u.range || 0; u.bonus = u.bonus || {}; u.cost = u.cost || {}; }

// Buildings. size = footprint in tiles.
const BUILDINGS = {
  town_center: { name: 'Town Center', size: 4, hp: 2400, armor: [3, 5], cost: { wood: 275, stone: 100 }, time: 150, age: 2, pop: 5, los: 8,
    drop: ['food', 'wood', 'gold', 'stone'], trains: ['villager'], techs: ['loom', 'wheelbarrow', 'hand_cart', 'feudal_age', 'castle_age', 'imperial_age'],
    attack: { atk: 5, range: 6, reload: 2, arrows: 1 }, garrison: 15, desc: 'Trains villagers, researches ages. Villagers drop off all resources here.' },
  house: { name: 'House', size: 2, hp: 550, armor: [0, 7], cost: { wood: 25 }, time: 25, age: 0, pop: 5, los: 2, desc: 'Supports 5 population.' },
  mill: { name: 'Mill', size: 2, hp: 600, armor: [0, 7], cost: { wood: 100 }, time: 35, age: 0, los: 6, drop: ['food'], techs: ['horse_collar', 'heavy_plow'], desc: 'Drop-off for food. Build near berries and farms.' },
  lumber_camp: { name: 'Lumber Camp', size: 2, hp: 600, armor: [0, 7], cost: { wood: 100 }, time: 35, age: 0, los: 6, drop: ['wood'], techs: ['double_bit_axe', 'bow_saw'], desc: 'Drop-off for wood. Build next to a forest.' },
  mining_camp: { name: 'Mining Camp', size: 2, hp: 600, armor: [0, 7], cost: { wood: 100 }, time: 35, age: 0, los: 6, drop: ['gold', 'stone'], techs: ['gold_mining', 'stone_mining', 'gold_shaft'], desc: 'Drop-off for gold and stone. Build next to mines.' },
  farm: { name: 'Farm', size: 3, hp: 480, armor: [0, 0], cost: { wood: 60 }, time: 15, age: 0, los: 1, noBlock: true, food: 175, desc: 'Renewable food source worked by one villager. Requires a Mill or Town Center.' },
  barracks: { name: 'Barracks', size: 3, hp: 1200, armor: [1, 8], cost: { wood: 175 }, time: 50, age: 0, los: 5, trains: ['militia', 'spearman'], techs: ['man_at_arms', 'long_swordsman', 'champion', 'pikeman'], desc: 'Trains infantry.' },
  archery_range: { name: 'Archery Range', size: 3, hp: 1500, armor: [1, 8], cost: { wood: 175 }, time: 50, age: 1, los: 5, trains: ['archer', 'skirmisher', 'cavalry_archer'], techs: ['crossbowman', 'arbalester', 'elite_skirmisher'], desc: 'Trains archers.' },
  stable: { name: 'Stable', size: 3, hp: 1500, armor: [1, 8], cost: { wood: 175 }, time: 50, age: 1, los: 5, trains: ['scout', 'knight'], techs: ['bloodlines', 'light_cavalry', 'cavalier'], desc: 'Trains cavalry.' },
  blacksmith: { name: 'Blacksmith', size: 3, hp: 1800, armor: [1, 8], cost: { wood: 150 }, time: 40, age: 1, los: 5,
    techs: ['forging', 'iron_casting', 'scale_mail', 'chain_mail', 'scale_barding', 'chain_barding', 'fletching', 'bodkin_arrow', 'padded_armor', 'leather_armor'], desc: 'Researches attack and armour upgrades.' },
  market: { name: 'Market', size: 3, hp: 1800, armor: [0, 7], cost: { wood: 175 }, time: 60, age: 1, los: 5, market: true, desc: 'Buy and sell resources for gold.' },
  watch_tower: { name: 'Watch Tower', size: 1, hp: 1020, armor: [1, 7], cost: { wood: 25, stone: 125 }, time: 80, age: 1, los: 10,
    attack: { atk: 5, range: 8, reload: 2, arrows: 1 }, garrison: 5, desc: 'Defensive tower that fires arrows.' },
  palisade: { name: 'Palisade Wall', size: 1, hp: 250, armor: [2, 5], cost: { wood: 2 }, time: 6, age: 0, los: 2, wall: true, desc: 'Cheap wooden wall. Drag to build a line.' },
  stone_wall: { name: 'Stone Wall', size: 1, hp: 1800, armor: [8, 10], cost: { stone: 5 }, time: 10, age: 1, los: 2, wall: true, desc: 'Strong stone wall. Drag to build a line.' },
  siege_workshop: { name: 'Siege Workshop', size: 3, hp: 1500, armor: [1, 8], cost: { wood: 200 }, time: 40, age: 2, los: 5, trains: ['battering_ram', 'mangonel'], desc: 'Builds siege weapons.' },
  monastery: { name: 'Monastery', size: 3, hp: 2100, armor: [3, 8], cost: { wood: 175 }, time: 40, age: 2, los: 6, trains: ['monk'], garrison: 10, desc: 'Trains monks who heal and convert.' },
  castle: { name: 'Castle', size: 4, hp: 4800, armor: [8, 11], cost: { stone: 650 }, time: 200, age: 2, pop: 20, los: 11,
    attack: { atk: 11, range: 8, reload: 2, arrows: 4 }, garrison: 20, trains: ['UU', 'trebuchet'], desc: 'Mighty fortress. Trains your unique unit and trebuchets.' },
  wonder: { name: 'Wonder', size: 5, hp: 4800, armor: [1, 8], cost: { wood: 1000, gold: 1000, stone: 1000 }, time: 450, age: 3, los: 8, wonder: true, desc: 'Build and defend it for 5 minutes to win the game.' },
};
for (const k in BUILDINGS) { const b = BUILDINGS[k]; b.key = k; b.trains = b.trains || []; b.techs = b.techs || []; b.drop = b.drop || []; }

// Mods structure is defined in createPlayer (entities.js)
const TECHS = {
  loom: { name: 'Loom', cost: { gold: 50 }, time: 25, age: 0, icon: '🧶', desc: 'Villagers +15 HP, +1/+2 armour.', apply: p => { p.mods.vil.hp += 15; p.mods.vil.am += 1; p.mods.vil.ap += 2; } },
  wheelbarrow: { name: 'Wheelbarrow', cost: { food: 175, wood: 50 }, time: 75, age: 1, icon: '🛒', desc: 'Villagers move 10% faster and carry 25% more.', apply: p => { p.mods.vil.speed += 0.1; p.mods.vil.carry += 3; } },
  hand_cart: { name: 'Hand Cart', cost: { food: 300, wood: 200 }, time: 55, age: 2, req: ['wheelbarrow'], icon: '🛞', desc: 'Villagers move 10% faster and carry 50% more.', apply: p => { p.mods.vil.speed += 0.1; p.mods.vil.carry += 5; } },
  feudal_age: { name: 'Feudal Age', cost: { food: 500 }, time: 100, age: 0, ageUp: 1, icon: '🏰', reqB: ['barracks', 'mill', 'lumber_camp', 'mining_camp'], desc: 'Advance to the Feudal Age. Requires two of: Barracks, Mill, Lumber Camp, Mining Camp.' },
  castle_age: { name: 'Castle Age', cost: { food: 800, gold: 200 }, time: 130, age: 1, ageUp: 2, icon: '🏯', reqB: ['archery_range', 'stable', 'blacksmith', 'market'], desc: 'Advance to the Castle Age. Requires two of: Archery Range, Stable, Blacksmith, Market.' },
  imperial_age: { name: 'Imperial Age', cost: { food: 1000, gold: 800 }, time: 150, age: 2, ageUp: 3, icon: '👑', reqB: ['siege_workshop', 'monastery', 'castle'], desc: 'Advance to the Imperial Age. Requires two of: Siege Workshop, Monastery, Castle.' },
  double_bit_axe: { name: 'Double-Bit Axe', cost: { food: 100, wood: 50 }, time: 25, age: 1, icon: '🪓', desc: 'Lumberjacks work 20% faster.', apply: p => { p.mods.gather.wood += 0.2; } },
  bow_saw: { name: 'Bow Saw', cost: { food: 150, wood: 100 }, time: 50, age: 2, req: ['double_bit_axe'], icon: '🪚', desc: 'Lumberjacks work 20% faster.', apply: p => { p.mods.gather.wood += 0.2; } },
  gold_mining: { name: 'Gold Mining', cost: { food: 100, wood: 75 }, time: 30, age: 1, icon: '⛏️', desc: 'Gold miners work 15% faster.', apply: p => { p.mods.gather.gold += 0.15; } },
  gold_shaft: { name: 'Gold Shaft Mining', cost: { food: 200, wood: 100 }, time: 75, age: 2, req: ['gold_mining'], icon: '💰', desc: 'Gold miners work 15% faster.', apply: p => { p.mods.gather.gold += 0.15; } },
  stone_mining: { name: 'Stone Mining', cost: { food: 100, wood: 75 }, time: 30, age: 1, icon: '🪨', desc: 'Stone miners work 15% faster.', apply: p => { p.mods.gather.stone += 0.15; } },
  horse_collar: { name: 'Horse Collar', cost: { food: 75, wood: 75 }, time: 20, age: 1, icon: '🐴', desc: 'Farms hold +75 food.', apply: p => { p.mods.farmFood += 75; } },
  heavy_plow: { name: 'Heavy Plow', cost: { food: 125, wood: 125 }, time: 40, age: 2, req: ['horse_collar'], icon: '🌾', desc: 'Farms hold +125 food; farmers work 10% faster.', apply: p => { p.mods.farmFood += 125; p.mods.gather.farm += 0.1; } },
  forging: { name: 'Forging', cost: { food: 150 }, time: 50, age: 1, icon: '⚒️', desc: 'Infantry and cavalry +1 attack.', apply: p => { p.mods.inf.atk++; p.mods.cav.atk++; } },
  iron_casting: { name: 'Iron Casting', cost: { food: 220, gold: 120 }, time: 75, age: 2, req: ['forging'], icon: '🔨', desc: 'Infantry and cavalry +1 attack.', apply: p => { p.mods.inf.atk++; p.mods.cav.atk++; } },
  scale_mail: { name: 'Scale Mail Armor', cost: { food: 100 }, time: 40, age: 1, icon: '🛡️', desc: 'Infantry +1/+1 armour.', apply: p => { p.mods.inf.am++; p.mods.inf.ap++; } },
  chain_mail: { name: 'Chain Mail Armor', cost: { food: 200, gold: 100 }, time: 55, age: 2, req: ['scale_mail'], icon: '⛓️', desc: 'Infantry +1/+1 armour.', apply: p => { p.mods.inf.am++; p.mods.inf.ap++; } },
  scale_barding: { name: 'Scale Barding', cost: { food: 150 }, time: 45, age: 1, icon: '🐎', desc: 'Cavalry +1/+1 armour.', apply: p => { p.mods.cav.am++; p.mods.cav.ap++; } },
  chain_barding: { name: 'Chain Barding', cost: { food: 250, gold: 150 }, time: 60, age: 2, req: ['scale_barding'], icon: '🏇', desc: 'Cavalry +1/+1 armour.', apply: p => { p.mods.cav.am++; p.mods.cav.ap++; } },
  fletching: { name: 'Fletching', cost: { food: 100, gold: 50 }, time: 30, age: 1, icon: '🏹', desc: 'Archers, towers and Town Centers +1 attack and +1 range.', apply: p => { p.mods.arc.atk++; p.mods.arc.range++; p.mods.bld.atk++; p.mods.bld.range++; } },
  bodkin_arrow: { name: 'Bodkin Arrow', cost: { food: 200, gold: 100 }, time: 35, age: 2, req: ['fletching'], icon: '🎯', desc: 'Archers, towers and Town Centers +1 attack and +1 range.', apply: p => { p.mods.arc.atk++; p.mods.arc.range++; p.mods.bld.atk++; p.mods.bld.range++; } },
  padded_armor: { name: 'Padded Archer Armor', cost: { food: 100 }, time: 40, age: 1, icon: '🧥', desc: 'Archers +1/+1 armour.', apply: p => { p.mods.arc.am++; p.mods.arc.ap++; } },
  leather_armor: { name: 'Leather Archer Armor', cost: { food: 150, gold: 150 }, time: 55, age: 2, req: ['padded_armor'], icon: '🦺', desc: 'Archers +1/+1 armour.', apply: p => { p.mods.arc.am++; p.mods.arc.ap++; } },
  bloodlines: { name: 'Bloodlines', cost: { food: 150, gold: 100 }, time: 50, age: 1, icon: '🩸', desc: 'Cavalry +20 HP.', apply: p => { p.mods.cav.hp += 20; } },
  man_at_arms: { name: 'Man-at-Arms', cost: { food: 100, gold: 40 }, time: 40, age: 1, upgrade: ['militia', 'man_at_arms'], desc: 'Upgrade Militia to Man-at-Arms.' },
  long_swordsman: { name: 'Long Swordsman', cost: { food: 200, gold: 65 }, time: 45, age: 2, req: ['man_at_arms'], upgrade: ['militia', 'long_swordsman'], desc: 'Upgrade to Long Swordsman.' },
  champion: { name: 'Champion', cost: { food: 750, gold: 350 }, time: 100, age: 3, req: ['long_swordsman'], upgrade: ['militia', 'champion'], desc: 'Upgrade to Champion.' },
  pikeman: { name: 'Pikeman', cost: { food: 215, gold: 90 }, time: 45, age: 2, upgrade: ['spearman', 'pikeman'], desc: 'Upgrade Spearmen to Pikemen.' },
  crossbowman: { name: 'Crossbowman', cost: { food: 125, gold: 75 }, time: 35, age: 2, upgrade: ['archer', 'crossbowman'], desc: 'Upgrade Archers to Crossbowmen.' },
  arbalester: { name: 'Arbalester', cost: { food: 350, gold: 300 }, time: 50, age: 3, req: ['crossbowman'], upgrade: ['archer', 'arbalester'], desc: 'Upgrade to Arbalester.' },
  elite_skirmisher: { name: 'Elite Skirmisher', cost: { wood: 200, gold: 100 }, time: 50, age: 2, upgrade: ['skirmisher', 'elite_skirmisher'], desc: 'Upgrade Skirmishers.' },
  light_cavalry: { name: 'Light Cavalry', cost: { food: 150, gold: 50 }, time: 45, age: 2, upgrade: ['scout', 'light_cavalry'], desc: 'Upgrade Scout Cavalry to Light Cavalry.' },
  cavalier: { name: 'Cavalier', cost: { food: 300, gold: 300 }, time: 100, age: 3, upgrade: ['knight', 'cavalier'], desc: 'Upgrade Knights to Cavaliers.' },
};
for (const k in TECHS) { TECHS[k].key = k; TECHS[k].req = TECHS[k].req || []; }

const CIVS = {
  britons: { name: 'Britons', uu: 'longbowman', color: '#3d7a3a', desc: 'Archer civilization. Foot archers +1 range from the Castle Age. Shepherds work 25% faster. Unique unit: Longbowman.' },
  franks: { name: 'Franks', uu: 'throwing_axeman', color: '#3a5aa8', desc: 'Cavalry civilization. Cavalry +20% HP. Farm upgrades are free. Unique unit: Throwing Axeman.' },
  teutons: { name: 'Teutons', uu: 'teutonic_knight', color: '#555', desc: 'Infantry civilization. Infantry +1 melee armour. Towers and Town Centers +1 range. Unique unit: Teutonic Knight.' },
  mongols: { name: 'Mongols', uu: 'mangudai', color: '#9a6a2a', desc: 'Cavalry archer civilization. Mounted archers fire 25% faster. Hunters work 40% faster. Unique unit: Mangudai.' },
};

const HOTKEYS = ['Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F', 'G', 'Z', 'X', 'C', 'V', 'B'];
const BUILD_PAGES = {
  eco: ['house', 'mill', 'lumber_camp', 'mining_camp', 'farm', 'market', 'blacksmith', 'palisade', 'stone_wall', 'watch_tower', 'town_center', 'wonder'],
  mil: ['barracks', 'archery_range', 'stable', 'siege_workshop', 'monastery', 'castle', 'watch_tower', 'palisade', 'stone_wall'],
};
