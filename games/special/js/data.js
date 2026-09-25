// ===== Static game data: civilizations, units, buildings, technologies =====
'use strict';
const TW = 64, TH = 32, EH = 14; // tile width/height (iso), elevation step in px
const RES = ['food', 'wood', 'gold', 'stone'];
const AGES = ['Dark Age', 'Feudal Age', 'Castle Age', 'Imperial Age'];
const PLAYER_COLORS = [
  { id: 'blue', name: 'Blue', c: '#2f6fe0', d: '#1b3f8a', l: '#7fa8ff' },
  { id: 'red', name: 'Red', c: '#d8352c', d: '#7e1a14', l: '#ff8a80' },
  { id: 'green', name: 'Green', c: '#2fa33a', d: '#175c1f', l: '#86e28e' },
  { id: 'yellow', name: 'Yellow', c: '#e8c21f', d: '#8a6f0a', l: '#fff08a' },
  { id: 'cyan', name: 'Cyan', c: '#1fc2c8', d: '#0c6b70', l: '#8af4f7' },
  { id: 'purple', name: 'Purple', c: '#9b3fd6', d: '#561e7a', l: '#d39cff' },
  { id: 'orange', name: 'Orange', c: '#f07f1a', d: '#8a430a', l: '#ffc48a' },
  { id: 'grey', name: 'Grey', c: '#9a9a9a', d: '#4d4d4d', l: '#e0e0e0' },
];
const GAIA_COLOR = { c: '#ddd6c0', d: '#8a8474', l: '#fff' };

// Voice data: short historical-language style acknowledgements per civ (spoken by the browser's local TTS voices).
const CIVS = {
  franks: {
    name: 'Franks', lang: 'fr-FR', uu: 'axeman', arch: 'west',
    bonuses: ['Farm upgrades (Horse Collar, Heavy Plow) are free', 'Cavalry +20% hit points', 'Castles 25% cheaper'],
    voice: {
      select: ['Oui?', 'Mon seigneur?', 'Sire?', 'Je vous écoute', 'Qu\'y a-t-il?', 'Présent!'],
      move: ['Allons-y!', 'En avant!', 'D\'accord', 'J\'y vais', 'Bien, sire', 'Tout de suite'],
      gather: ['Au travail!', 'Je m\'en occupe', 'Volontiers', 'À la tâche'],
      build: ['Je bâtis!', 'Construisons!', 'À vos ordres'],
      attack: ['À l\'attaque!', 'Aux armes!', 'Pour le roi!', 'Montjoie!', 'Chargez!'],
    }
  },
  teutons: {
    name: 'Teutons', lang: 'de-DE', uu: 'tknight', arch: 'west',
    bonuses: ['Infantry +1 melee armor', 'Farms 40% cheaper', 'Towers garrison twice as many units'],
    voice: {
      select: ['Ja?', 'Mein Herr?', 'Jawohl?', 'Zu Diensten', 'Was gibt es?', 'Hier!'],
      move: ['Vorwärts!', 'Los geht\'s!', 'Wird gemacht', 'Jawohl!', 'Sofort', 'Ich gehe'],
      gather: ['An die Arbeit!', 'Ich sammle', 'Gerne, Herr'],
      build: ['Ich baue!', 'Wir bauen!', 'Zu Befehl'],
      attack: ['Angriff!', 'Zu den Waffen!', 'Für den Kaiser!', 'Drauf!', 'Sturm!'],
    }
  },
  spanish: {
    name: 'Spanish', lang: 'es-ES', uu: 'conquistador', arch: 'west',
    bonuses: ['Builders work 30% faster', 'Trade units generate +25% gold', 'Starts with +1 villager (4 total)'],
    voice: {
      select: ['¿Sí?', '¿Mi señor?', 'A sus órdenes', '¿Qué deseáis?', 'Presente'],
      move: ['¡Vamos!', '¡Adelante!', 'De acuerdo', 'Ahora mismo', 'Voy'],
      gather: ['¡A trabajar!', 'Con gusto', 'Me pongo a ello'],
      build: ['¡Construyamos!', 'Yo lo levanto', 'Enseguida'],
      attack: ['¡Al ataque!', '¡A las armas!', '¡Santiago!', '¡Por el rey!', '¡Cargad!'],
    }
  },
  italians: {
    name: 'Italians', lang: 'it-IT', uu: 'genoese', arch: 'west',
    bonuses: ['Advancing to the next Age 15% cheaper', 'Fishing Ships 15% cheaper', 'Dock technologies 33% cheaper'],
    voice: {
      select: ['Sì?', 'Mio signore?', 'Comandi', 'Eccomi', 'Dica pure'],
      move: ['Andiamo!', 'Avanti!', 'Va bene', 'Subito', 'Certo'],
      gather: ['Al lavoro!', 'Volentieri', 'Ci penso io'],
      build: ['Costruiamo!', 'Lo costruisco', 'Agli ordini'],
      attack: ['All\'attacco!', 'Alle armi!', 'Per la Repubblica!', 'Carica!'],
    }
  },
  japanese: {
    name: 'Japanese', lang: 'ja-JP', uu: 'samurai', arch: 'east',
    bonuses: ['Infantry attack 25% faster', 'Fishing Ships double HP, +2 pierce armor', 'Lumber, Mining Camps & Mills 50% cheaper'],
    voice: {
      select: ['はい?', '殿?', 'なんでしょう', 'ここに', 'はっ!'],
      move: ['参ります!', '承知', '行くぞ', 'かしこまりました', 'はい、ただいま'],
      gather: ['働きます', 'お任せを', '承知しました'],
      build: ['建てます', '築きましょう', 'お任せください'],
      attack: ['かかれ!', '突撃!', '討ち取れ!', 'いざ!', '覚悟!'],
    }
  },
  chinese: {
    name: 'Chinese', lang: 'zh-CN', uu: 'chukonu', arch: 'east',
    bonuses: ['Start with +3 villagers but -150 food', 'Technologies 10% cheaper', 'Town Centers support 10 population'],
    voice: {
      select: ['是?', '大人?', '在!', '请吩咐', '何事?'],
      move: ['走吧!', '遵命', '前进!', '马上去', '好的'],
      gather: ['干活了', '我去采集', '遵命'],
      build: ['我来建造', '开工!', '是,大人'],
      attack: ['冲啊!', '杀!', '进攻!', '为了皇上!'],
    }
  },
  byzantines: {
    name: 'Byzantines', lang: 'el-GR', uu: 'cataphract', arch: 'med',
    bonuses: ['Spearmen & Skirmishers 25% cheaper', 'Buildings +20% hit points', 'Imperial Age 33% cheaper'],
    voice: {
      select: ['Ναι?', 'Κύριε?', 'Παρών!', 'Διατάξτε', 'Τι θέλετε?'],
      move: ['Πάμε!', 'Εμπρός!', 'Μάλιστα', 'Αμέσως', 'Εντάξει'],
      gather: ['Στη δουλειά!', 'Αναλαμβάνω', 'Ευχαρίστως'],
      build: ['Χτίζω!', 'Ας χτίσουμε', 'Μάλιστα'],
      attack: ['Επίθεση!', 'Στα όπλα!', 'Για τον αυτοκράτορα!', 'Εμπρός!'],
    }
  },
  vikings: {
    name: 'Vikings', lang: 'sv-SE', uu: 'berserk', arch: 'west',
    bonuses: ['Infantry +20% hit points', 'Warships 15% cheaper', 'Wheelbarrow and Hand Cart are free'],
    voice: {
      select: ['Ja?', 'Hövding?', 'Vad vill du?', 'Här!', 'Jarl?'],
      move: ['Framåt!', 'Vi går!', 'Visst', 'Genast', 'Kom igen!'],
      gather: ['Till arbetet!', 'Jag fixar det', 'Gärna'],
      build: ['Jag bygger!', 'Vi bygger!', 'Ska bli'],
      attack: ['Anfall!', 'Till vapen!', 'För Oden!', 'Döda dem!'],
    }
  },
  saracens: {
    name: 'Saracens', lang: 'ar-SA', uu: 'mameluke', arch: 'med',
    bonuses: ['Tribute fee only 10%', 'Archers +2 attack vs buildings', 'Transport Ships double HP and capacity'],
    voice: {
      select: ['نعم؟', 'سيدي؟', 'أمرك', 'حاضر', 'ماذا تريد؟'],
      move: ['هيا بنا!', 'إلى الأمام!', 'حسناً', 'فوراً', 'سمعاً وطاعة'],
      gather: ['إلى العمل!', 'سأجمع', 'بكل سرور'],
      build: ['سأبني!', 'لنبنِ!', 'حاضر'],
      attack: ['هجوم!', 'إلى السلاح!', 'الله أكبر!', 'اهجموا!'],
    }
  },
};

// tags: used for armor/bonus classes and blacksmith upgrades
const UNITS = {
  villager: { name: 'Villager', tags: ['villager', 'land'], hp: 25, atk: 3, ma: 0, pa: 1, range: 0, rof: 2, speed: 0.95, los: 4, cost: { food: 50 }, time: 25, age: 0, from: 'tc', hk: 'Q', desc: 'Gathers resources, builds, repairs. Weak in combat.', draw: 'villager' },
  scout: { name: 'Scout Cavalry', tags: ['cavalry', 'mounted', 'land'], hp: 45, atk: 3, ma: 0, pa: 2, rof: 2, speed: 1.35, los: 8, cost: { food: 80 }, time: 30, age: 1, from: 'stable', hk: 'Q', desc: 'Fast scout. Good vs monks and siege.', bonus: { monk: 6, siege: 3 }, draw: 'scout' },
  lightcav: { name: 'Light Cavalry', tags: ['cavalry', 'mounted', 'land'], hp: 60, atk: 7, ma: 0, pa: 2, rof: 2, speed: 1.5, los: 8, cost: { food: 80 }, time: 30, age: 2, from: 'stable', hk: 'Q', desc: 'Upgraded scout. Raids and hunts monks.', bonus: { monk: 10, siege: 5 }, draw: 'scout' },
  militia: { name: 'Militia', tags: ['infantry', 'land'], hp: 40, atk: 4, ma: 0, pa: 1, rof: 2, speed: 0.9, los: 4, cost: { food: 60, gold: 20 }, time: 21, age: 0, from: 'barracks', hk: 'Q', desc: 'Basic swordsman.', bonus: { building: 2 }, draw: 'sword' },
  manatarms: { name: 'Man-at-Arms', tags: ['infantry', 'land'], hp: 45, atk: 6, ma: 0, pa: 1, rof: 2, speed: 0.9, los: 4, cost: { food: 60, gold: 20 }, time: 21, age: 1, from: 'barracks', hk: 'Q', desc: 'Armored infantry. Good vs other infantry.', bonus: { building: 2 }, draw: 'sword' },
  longsword: { name: 'Long Swordsman', tags: ['infantry', 'land'], hp: 60, atk: 9, ma: 1, pa: 1, rof: 2, speed: 0.9, los: 5, cost: { food: 60, gold: 20 }, time: 21, age: 2, from: 'barracks', hk: 'Q', desc: 'Strong infantry.', bonus: { building: 3 }, draw: 'sword' },
  twohanded: { name: 'Two-Handed Swordsman', tags: ['infantry', 'land'], hp: 60, atk: 12, ma: 2, pa: 1, rof: 2, speed: 0.9, los: 5, cost: { food: 60, gold: 20 }, time: 21, age: 3, from: 'barracks', hk: 'Q', desc: 'Heavy infantry with a great sword.', bonus: { building: 4 }, draw: 'sword' },
  spearman: { name: 'Spearman', tags: ['infantry', 'spear', 'land'], hp: 45, atk: 3, ma: 0, pa: 0, rof: 3, speed: 1.0, los: 4, cost: { food: 35, wood: 25 }, time: 22, age: 1, from: 'barracks', hk: 'W', desc: 'Anti-cavalry. Big bonus vs mounted units.', bonus: { mounted: 15, building: 1 }, draw: 'spear' },
  pikeman: { name: 'Pikeman', tags: ['infantry', 'spear', 'land'], hp: 55, atk: 4, ma: 0, pa: 0, rof: 3, speed: 1.0, los: 4, cost: { food: 35, wood: 25 }, time: 22, age: 2, from: 'barracks', hk: 'W', desc: 'Upgraded anti-cavalry pike infantry.', bonus: { mounted: 22, building: 1 }, draw: 'spear' },
  archer: { name: 'Archer', tags: ['archer', 'land'], hp: 30, atk: 4, ma: 0, pa: 0, range: 4, rof: 2, speed: 0.96, los: 6, cost: { wood: 25, gold: 45 }, time: 35, age: 1, from: 'range', hk: 'Q', proj: 'arrow', desc: 'Ranged. Strong vs infantry, weak vs skirmishers.', bonus: { spear: 3 }, draw: 'bow' },
  crossbow: { name: 'Crossbowman', tags: ['archer', 'land'], hp: 35, atk: 5, ma: 0, pa: 0, range: 5, rof: 2, speed: 0.96, los: 7, cost: { wood: 25, gold: 45 }, time: 27, age: 2, from: 'range', hk: 'Q', proj: 'arrow', desc: 'Upgraded archer.', bonus: { spear: 3 }, draw: 'xbow' },
  arbalest: { name: 'Arbalester', tags: ['archer', 'land'], hp: 40, atk: 6, ma: 0, pa: 0, range: 5, rof: 2, speed: 0.96, los: 7, cost: { wood: 25, gold: 45 }, time: 27, age: 3, from: 'range', hk: 'Q', proj: 'arrow', desc: 'Elite crossbow.', bonus: { spear: 3 }, draw: 'xbow' },
  skirmisher: { name: 'Skirmisher', tags: ['archer', 'skirm', 'land'], hp: 30, atk: 2, ma: 0, pa: 3, range: 4, rof: 3, speed: 0.96, los: 6, cost: { food: 25, wood: 35 }, time: 22, age: 1, from: 'range', hk: 'W', proj: 'javelin', desc: 'Cheap anti-archer javelin thrower.', bonus: { archer: 3, spear: 3 }, draw: 'jav' },
  eskirm: { name: 'Elite Skirmisher', tags: ['archer', 'skirm', 'land'], hp: 35, atk: 3, ma: 0, pa: 4, range: 5, rof: 3, speed: 0.96, los: 7, cost: { food: 25, wood: 35 }, time: 22, age: 2, from: 'range', hk: 'W', proj: 'javelin', desc: 'Upgraded skirmisher.', bonus: { archer: 4, spear: 3 }, draw: 'jav' },
  cavarcher: { name: 'Cavalry Archer', tags: ['archer', 'cavalry', 'mounted', 'land'], hp: 50, atk: 6, ma: 0, pa: 1, range: 4, rof: 2, speed: 1.4, los: 5, cost: { wood: 40, gold: 70 }, time: 34, age: 2, from: 'range', hk: 'E', proj: 'arrow', desc: 'Mounted archer. Fast hit-and-run.', bonus: { spear: 2 }, draw: 'cavarcher' },
  knight: { name: 'Knight', tags: ['cavalry', 'mounted', 'land'], hp: 100, atk: 10, ma: 2, pa: 2, rof: 1.8, speed: 1.35, los: 4, cost: { food: 60, gold: 75 }, time: 30, age: 2, from: 'stable', hk: 'W', desc: 'Heavy cavalry. Strong all-rounder, weak vs pikes.', draw: 'knight' },
  cavalier: { name: 'Cavalier', tags: ['cavalry', 'mounted', 'land'], hp: 120, atk: 12, ma: 2, pa: 2, rof: 1.8, speed: 1.35, los: 4, cost: { food: 60, gold: 75 }, time: 30, age: 3, from: 'stable', hk: 'W', desc: 'Upgraded knight.', draw: 'knight' },
  monk: { name: 'Monk', tags: ['monk', 'land'], hp: 30, atk: 0, ma: 0, pa: 0, range: 9, rof: 1, speed: 0.7, los: 11, cost: { gold: 100 }, time: 51, age: 2, from: 'monastery', hk: 'Q', desc: 'Heals friendly units, converts enemies, carries relics.', draw: 'monk' },
  ram: { name: 'Battering Ram', tags: ['siege', 'machine', 'land'], hp: 175, atk: 2, ma: 0, pa: 180, rof: 5, speed: 0.5, los: 3, cost: { wood: 160, gold: 75 }, time: 36, age: 2, from: 'siege', hk: 'Q', desc: 'Destroys buildings. Nearly immune to arrows.', bonus: { building: 125, siege: 40 }, onlyBld: true, draw: 'ram' },
  mangonel: { name: 'Mangonel', tags: ['siege', 'machine', 'land'], hp: 50, atk: 40, ma: 0, pa: 6, range: 7, minRange: 3, rof: 6, speed: 0.6, los: 9, cost: { wood: 160, gold: 135 }, time: 46, age: 2, from: 'siege', hk: 'W', proj: 'stone', blast: 1, desc: 'Area-damage catapult. Deadly vs groups.', bonus: { building: 35 }, draw: 'mangonel' },
  scorpion: { name: 'Scorpion', tags: ['siege', 'machine', 'land'], hp: 40, atk: 12, ma: 0, pa: 7, range: 7, minRange: 1, rof: 3.6, speed: 0.65, los: 9, cost: { wood: 75, gold: 75 }, time: 30, age: 2, from: 'siege', hk: 'E', proj: 'bolt', desc: 'Giant ballista. Bolts pierce through lines.', draw: 'scorpion' },
  trebuchet: { name: 'Trebuchet', tags: ['siege', 'machine', 'land'], hp: 150, atk: 200, ma: 1, pa: 150, range: 16, minRange: 4, rof: 10, speed: 0.5, los: 18, cost: { wood: 200, gold: 200 }, time: 50, age: 3, from: 'castle', hk: 'W', proj: 'boulder', desc: 'Long-range siege engine. Levels castles.', bonus: { building: 250 }, onlyBld: true, draw: 'trebuchet' },
  tradecart: { name: 'Trade Cart', tags: ['trade', 'land'], hp: 70, atk: 0, ma: 0, pa: 0, rof: 1, speed: 1.0, los: 7, cost: { wood: 100, gold: 50 }, time: 51, age: 1, from: 'market', hk: 'Q', desc: 'Travels to another friendly Market to earn gold. Longer routes pay more.', draw: 'cart' },
  // naval
  fishingship: { name: 'Fishing Ship', tags: ['ship', 'machine', 'naval'], naval: true, hp: 60, atk: 0, ma: 0, pa: 2, rof: 1, speed: 1.2, los: 5, cost: { wood: 75 }, time: 40, age: 0, from: 'dock', hk: 'Q', desc: 'Gathers fish and returns food to a Dock.', draw: 'fishship' },
  transport: { name: 'Transport Ship', tags: ['ship', 'machine', 'naval'], naval: true, hp: 100, atk: 0, ma: 0, pa: 4, rof: 1, speed: 1.4, los: 5, cost: { wood: 125 }, time: 46, age: 0, from: 'dock', hk: 'W', cap: 10, desc: 'Carries up to 10 land units across water.', draw: 'transport' },
  tradecog: { name: 'Trade Cog', tags: ['ship', 'machine', 'naval', 'trade'], naval: true, hp: 80, atk: 0, ma: 0, pa: 3, rof: 1, speed: 1.3, los: 6, cost: { wood: 100, gold: 50 }, time: 36, age: 1, from: 'dock', hk: 'E', desc: 'Trades between friendly Docks for gold.', draw: 'cog' },
  galley: { name: 'Galley', tags: ['ship', 'machine', 'naval', 'warship'], naval: true, hp: 120, atk: 7, ma: 0, pa: 3, range: 5, rof: 3, speed: 1.4, los: 7, cost: { wood: 90, gold: 30 }, time: 60, age: 1, from: 'dock', hk: 'R', proj: 'arrow', desc: 'Arrow-firing warship. Attacks ships and the coast.', bonus: { ship: 3 }, draw: 'galley' },
  wargalley: { name: 'War Galley', tags: ['ship', 'machine', 'naval', 'warship'], naval: true, hp: 135, atk: 7, ma: 0, pa: 4, range: 6, rof: 3, speed: 1.45, los: 8, cost: { wood: 90, gold: 30 }, time: 36, age: 2, from: 'dock', hk: 'R', proj: 'arrow', desc: 'Upgraded galley.', bonus: { ship: 4 }, draw: 'galley' },
  galleon: { name: 'Galleon', tags: ['ship', 'machine', 'naval', 'warship'], naval: true, hp: 165, atk: 8, ma: 0, pa: 5, range: 7, rof: 3, speed: 1.5, los: 9, cost: { wood: 90, gold: 30 }, time: 36, age: 3, from: 'dock', hk: 'R', proj: 'arrow', desc: 'Elite warship.', bonus: { ship: 5 }, draw: 'galley' },
  fireship: { name: 'Fire Ship', tags: ['ship', 'machine', 'naval', 'warship'], naval: true, hp: 100, atk: 2, ma: 0, pa: 3, range: 2.5, rof: 0.25, speed: 1.6, los: 5, cost: { wood: 75, gold: 45 }, time: 36, age: 2, from: 'dock', hk: 'T', proj: 'fire', desc: 'Sprays fire at close range. Deadly vs ships.', bonus: { ship: 2 }, draw: 'fireship' },
  demoship: { name: 'Demolition Ship', tags: ['ship', 'machine', 'naval', 'warship'], naval: true, hp: 50, atk: 110, ma: 0, pa: 2, range: 0.8, rof: 1, speed: 1.6, los: 6, cost: { wood: 70, gold: 50 }, time: 31, age: 2, from: 'dock', hk: 'A', blast: 2, selfDestruct: true, desc: 'Explodes on contact, damaging everything nearby.', bonus: { building: 150 }, draw: 'demoship' },
  // unique units (trained at Castle)
  axeman: { name: 'Throwing Axeman', tags: ['infantry', 'land', 'unique'], hp: 60, atk: 7, ma: 0, pa: 1, range: 3, rof: 2, speed: 1.0, los: 5, cost: { food: 55, gold: 25 }, time: 17, age: 2, from: 'castle', hk: 'Q', proj: 'axe', desc: 'Frankish unique: ranged infantry throwing axes (melee damage).', meleeDmg: true, draw: 'axeman' },
  tknight: { name: 'Teutonic Knight', tags: ['infantry', 'land', 'unique'], hp: 90, atk: 14, ma: 5, pa: 3, rof: 2, speed: 0.7, los: 5, cost: { food: 85, gold: 40 }, time: 20, age: 2, from: 'castle', hk: 'Q', desc: 'Teutonic unique: slow, extremely armored infantry.', bonus: { building: 4 }, draw: 'tknight' },
  conquistador: { name: 'Conquistador', tags: ['cavalry', 'mounted', 'land', 'unique'], hp: 55, atk: 16, ma: 2, pa: 2, range: 6, rof: 2.9, speed: 1.3, los: 8, cost: { food: 60, gold: 70 }, time: 24, age: 2, from: 'castle', hk: 'Q', proj: 'bullet', desc: 'Spanish unique: mounted hand-cannoneer.', draw: 'conq' },
  genoese: { name: 'Genoese Crossbowman', tags: ['archer', 'land', 'unique'], hp: 45, atk: 6, ma: 1, pa: 0, range: 4, rof: 2, speed: 0.96, los: 6, cost: { wood: 45, gold: 40 }, time: 22, age: 2, from: 'castle', hk: 'Q', proj: 'arrow', desc: 'Italian unique: crossbowman with bonus vs cavalry.', bonus: { cavalry: 5 }, draw: 'xbow' },
  samurai: { name: 'Samurai', tags: ['infantry', 'land', 'unique'], hp: 60, atk: 8, ma: 1, pa: 1, rof: 1.45, speed: 1.0, los: 4, cost: { food: 60, gold: 30 }, time: 9, age: 2, from: 'castle', hk: 'Q', desc: 'Japanese unique: fast-attacking swordsman, bonus vs unique units.', bonus: { unique: 10 }, draw: 'samurai' },
  chukonu: { name: 'Chu Ko Nu', tags: ['archer', 'land', 'unique'], hp: 45, atk: 8, ma: 0, pa: 0, range: 4, rof: 2, speed: 0.96, los: 6, cost: { wood: 40, gold: 35 }, time: 16, age: 2, from: 'castle', hk: 'Q', proj: 'arrow', multishot: 3, desc: 'Chinese unique: repeating crossbow firing volleys of bolts.', draw: 'xbow' },
  cataphract: { name: 'Cataphract', tags: ['cavalry', 'mounted', 'land', 'unique'], hp: 110, atk: 9, ma: 2, pa: 1, rof: 1.8, speed: 1.35, los: 4, cost: { food: 70, gold: 75 }, time: 20, age: 2, from: 'castle', hk: 'Q', desc: 'Byzantine unique: heavy cavalry with bonus vs infantry.', bonus: { infantry: 9 }, draw: 'knight' },
  berserk: { name: 'Berserk', tags: ['infantry', 'land', 'unique'], hp: 54, atk: 9, ma: 0, pa: 1, rof: 2, speed: 1.05, los: 3, cost: { food: 65, gold: 25 }, time: 14, age: 2, from: 'castle', hk: 'Q', regen: 1, desc: 'Viking unique: infantry that slowly regenerates.', draw: 'berserk' },
  mameluke: { name: 'Mameluke', tags: ['cavalry', 'mounted', 'land', 'unique', 'camel'], hp: 65, atk: 8, ma: 0, pa: 0, range: 3, rof: 2, speed: 1.4, los: 5, cost: { food: 55, gold: 85 }, time: 23, age: 2, from: 'castle', hk: 'Q', proj: 'jav', meleeDmg: true, desc: 'Saracen unique: camel rider throwing scimitars, bonus vs cavalry.', bonus: { cavalry: 7 }, draw: 'mameluke' },
  // special
  cobra: { name: 'Cobra Car', tags: ['land', 'machine'], hp: 400, atk: 14, ma: 5, pa: 5, range: 5, rof: 0.22, speed: 2.4, los: 8, cost: {}, time: 1, age: 0, proj: 'bullet', desc: 'A mysterious armored automobile from the future. (Cheat unit)', draw: 'cobra' },
  // animals
  sheep: { name: 'Sheep', tags: ['animal', 'herdable', 'land'], hp: 7, atk: 0, ma: 0, pa: 0, rof: 1, speed: 0.7, los: 2, food: 100, animal: true, desc: 'Herdable livestock. Walk a unit near it to claim it.', draw: 'sheep' },
  deer: { name: 'Deer', tags: ['animal', 'land'], hp: 5, atk: 0, ma: 0, pa: 0, rof: 1, speed: 1.15, los: 4, food: 140, animal: true, prey: true, desc: 'Huntable. Flees from danger.', draw: 'deer' },
  boar: { name: 'Wild Boar', tags: ['animal', 'land'], hp: 75, atk: 7, ma: 0, pa: 1, rof: 2, speed: 0.95, los: 3, food: 340, animal: true, fights: true, desc: 'Dangerous huntable animal. Fights back.', draw: 'boar' },
  wolf: { name: 'Wolf', tags: ['animal', 'land'], hp: 25, atk: 3, ma: 0, pa: 0, rof: 1.5, speed: 1.15, los: 6, food: 0, animal: true, predator: true, desc: 'Predator. Attacks nearby units.', draw: 'wolf' },
};

// Buildings. size in tiles. cat: eco or mil build menu.
const BUILDINGS = {
  tc: { name: 'Town Center', size: 4, hp: 2400, ma: 3, pa: 5, cost: { wood: 275, stone: 100 }, time: 150, age: 1, cat: 'eco', hk: 'T', pop: 5, drop: ['food', 'wood', 'gold', 'stone'], garrison: 15, atk: 5, range: 6, los: 8, trains: ['villager'], desc: 'Trains villagers, researches Ages. Drop-off for all resources. Garrison villagers to fire more arrows.' },
  house: { name: 'House', size: 2, hp: 550, ma: 0, pa: 7, cost: { wood: 25 }, time: 25, age: 0, cat: 'eco', hk: 'Q', pop: 5, los: 2, desc: 'Supports 5 population.' },
  mill: { name: 'Mill', size: 2, hp: 600, ma: 0, pa: 7, cost: { wood: 100 }, time: 35, age: 0, cat: 'eco', hk: 'W', drop: ['food'], los: 6, desc: 'Food drop-off. Farm technologies.' },
  lumbercamp: { name: 'Lumber Camp', size: 2, hp: 600, ma: 0, pa: 7, cost: { wood: 100 }, time: 35, age: 0, cat: 'eco', hk: 'E', drop: ['wood'], los: 6, desc: 'Wood drop-off. Wood-cutting technologies.' },
  miningcamp: { name: 'Mining Camp', size: 2, hp: 600, ma: 0, pa: 7, cost: { wood: 100 }, time: 35, age: 0, cat: 'eco', hk: 'R', drop: ['gold', 'stone'], los: 6, desc: 'Gold and stone drop-off. Mining technologies.' },
  farm: { name: 'Farm', size: 3, hp: 480, ma: 0, pa: 0, cost: { wood: 60 }, time: 15, age: 0, cat: 'eco', hk: 'A', req: ['mill'], farm: true, los: 1, desc: 'Renewable food source (175 food). Villagers walk on it.' },
  dock: { name: 'Dock', size: 3, hp: 1800, ma: 0, pa: 7, cost: { wood: 150 }, time: 35, age: 0, cat: 'eco', hk: 'S', drop: ['food'], water: true, los: 6, desc: 'Must be built on shoreline water. Trains ships; fishing ships return food here.' },
  market: { name: 'Market', size: 3, hp: 2100, ma: 0, pa: 7, cost: { wood: 175 }, time: 60, age: 1, cat: 'eco', hk: 'D', req: ['mill'], los: 6, desc: 'Trains Trade Carts. Enables trade and tribute technologies.' },
  blacksmith: { name: 'Blacksmith', size: 3, hp: 2100, ma: 0, pa: 7, cost: { wood: 150 }, time: 40, age: 1, cat: 'eco', hk: 'F', los: 6, desc: 'Researches attack and armor upgrades.' },
  university: { name: 'University', size: 3, hp: 2100, ma: 0, pa: 7, cost: { wood: 200 }, time: 60, age: 2, cat: 'eco', hk: 'Z', req: ['blacksmith'], los: 6, desc: 'Researches building and ballistics technologies.' },
  monastery: { name: 'Monastery', size: 3, hp: 2100, ma: 0, pa: 7, cost: { wood: 175 }, time: 40, age: 2, cat: 'eco', hk: 'X', los: 6, trains: ['monk'], desc: 'Trains monks. Store relics here for gold.' },
  barracks: { name: 'Barracks', size: 3, hp: 1200, ma: 0, pa: 7, cost: { wood: 175 }, time: 50, age: 0, cat: 'mil', hk: 'Q', los: 6, desc: 'Trains infantry.' },
  range: { name: 'Archery Range', size: 3, hp: 1500, ma: 0, pa: 7, cost: { wood: 175 }, time: 50, age: 1, cat: 'mil', hk: 'W', req: ['barracks'], los: 6, desc: 'Trains archers and skirmishers.' },
  stable: { name: 'Stable', size: 3, hp: 1500, ma: 0, pa: 7, cost: { wood: 175 }, time: 50, age: 1, cat: 'mil', hk: 'E', req: ['barracks'], los: 6, desc: 'Trains cavalry.' },
  siege: { name: 'Siege Workshop', size: 3, hp: 1500, ma: 0, pa: 7, cost: { wood: 200 }, time: 40, age: 2, cat: 'mil', hk: 'R', req: ['blacksmith'], los: 6, desc: 'Builds siege engines.' },
  tower: { name: 'Watch Tower', size: 1, hp: 700, ma: 1, pa: 7, cost: { wood: 25, stone: 125 }, time: 80, age: 1, cat: 'mil', hk: 'T', garrison: 5, atk: 5, range: 7, los: 9, desc: 'Defensive tower. Garrison units for extra arrows.' },
  castle: { name: 'Castle', size: 4, hp: 4800, ma: 8, pa: 11, cost: { stone: 650 }, time: 200, age: 2, cat: 'mil', hk: 'A', garrison: 20, atk: 11, range: 8, los: 11, pop: 20, trains: [], desc: 'Fortress. Trains the unique unit and trebuchets. Fires many arrows.' },
  palisade: { name: 'Palisade Wall', size: 1, hp: 250, ma: 2, pa: 5, cost: { wood: 2 }, time: 5, age: 0, cat: 'mil', hk: 'S', wall: true, los: 1, desc: 'Cheap wooden wall. Drag to build a line.' },
  wall: { name: 'Stone Wall', size: 1, hp: 1800, ma: 8, pa: 10, cost: { stone: 5 }, time: 8, age: 1, cat: 'mil', hk: 'D', wall: true, los: 1, desc: 'Strong wall. Drag to build a line.' },
  gate: { name: 'Gate', size: 1, hp: 2750, ma: 6, pa: 6, cost: { stone: 30 }, time: 30, age: 1, cat: 'mil', hk: 'F', gate: true, los: 3, desc: 'Lets your own and allied units pass; blocks enemies.' },
  outpost: { name: 'Outpost', size: 1, hp: 500, ma: 0, pa: 0, cost: { wood: 25, stone: 25 }, time: 15, age: 0, cat: 'mil', hk: 'G', los: 10, desc: 'Lookout post with long line of sight.' },
};
BUILDINGS.tc.trains = ['villager'];
const TRAIN = {
  tc: ['villager'], barracks: ['militia', 'spearman'], range: ['archer', 'skirmisher', 'cavarcher'], stable: ['scout', 'knight'],
  siege: ['ram', 'mangonel', 'scorpion'], monastery: ['monk'], market: ['tradecart'],
  dock: ['fishingship', 'transport', 'tradecog', 'galley', 'fireship', 'demoship'], castle: ['__uu', 'trebuchet'],
};
// Buildings needed in the current age to advance
const AGE_REQ = { 1: ['barracks', 'mill', 'lumbercamp', 'miningcamp', 'dock'], 2: ['range', 'stable', 'blacksmith', 'market'], 3: ['university', 'monastery', 'siege', 'castle'] };

// Technologies. fx(p) applied once researched. upg: unit line upgrade.
const TECHS = {
  feudal: { name: 'Feudal Age', at: 'tc', age: 0, cost: { food: 500 }, time: 130, hk: 'W', icon: 'age1', desc: 'Advance to the Feudal Age. Requires 2 Dark Age buildings.', ageUp: 1 },
  castleage: { name: 'Castle Age', at: 'tc', age: 1, cost: { food: 800, gold: 200 }, time: 160, hk: 'W', icon: 'age2', desc: 'Advance to the Castle Age. Requires 2 Feudal Age buildings.', ageUp: 2 },
  imperial: { name: 'Imperial Age', at: 'tc', age: 2, cost: { food: 1000, gold: 800 }, time: 190, hk: 'W', icon: 'age3', desc: 'Advance to the Imperial Age. Requires 2 Castle Age buildings.', ageUp: 3 },
  loom: { name: 'Loom', at: 'tc', age: 0, cost: { gold: 50 }, time: 25, hk: 'E', icon: 'loom', desc: 'Villagers +15 HP, +1/+1 armor.', fx: p => addUp(p, 'villager', { hp: 15, ma: 1, pa: 1 }) },
  wheelbarrow: { name: 'Wheelbarrow', at: 'tc', age: 1, cost: { food: 175, wood: 50 }, time: 75, hk: 'R', icon: 'wheel', desc: 'Villagers carry +25% and move +10% faster.', fx: p => { p.carry += 3; addUp(p, 'villager', { speed: 0.08 }); } },
  handcart: { name: 'Hand Cart', at: 'tc', age: 2, cost: { food: 300, wood: 200 }, time: 55, hk: 'R', icon: 'cart', req: ['wheelbarrow'], desc: 'Villagers carry +50% and move +10% faster.', fx: p => { p.carry += 5; addUp(p, 'villager', { speed: 0.08 }); } },
  townwatch: { name: 'Town Watch', at: 'tc', age: 1, cost: { food: 75 }, time: 25, hk: 'D', icon: 'eye', desc: 'Buildings +4 line of sight.', fx: p => p.bldLos += 4 },
  horsecollar: { name: 'Horse Collar', at: 'mill', age: 1, cost: { food: 75, wood: 75 }, time: 20, hk: 'Q', icon: 'collar', desc: 'Farms +75 food.', fx: p => p.farmFood += 75 },
  heavyplow: { name: 'Heavy Plow', at: 'mill', age: 2, cost: { food: 125, wood: 125 }, time: 40, hk: 'W', icon: 'plow', req: ['horsecollar'], desc: 'Farms +125 food, farmers carry +1.', fx: p => { p.farmFood += 125; p.gather.farm *= 1.1; } },
  doublebit: { name: 'Double-Bit Axe', at: 'lumbercamp', age: 1, cost: { food: 100, wood: 50 }, time: 25, hk: 'Q', icon: 'axe', desc: 'Lumberjacks work 20% faster.', fx: p => p.gather.wood *= 1.2 },
  bowsaw: { name: 'Bow Saw', at: 'lumbercamp', age: 2, cost: { food: 150, wood: 100 }, time: 50, hk: 'W', icon: 'saw', req: ['doublebit'], desc: 'Lumberjacks work 20% faster.', fx: p => p.gather.wood *= 1.2 },
  goldmining: { name: 'Gold Mining', at: 'miningcamp', age: 1, cost: { food: 100, wood: 75 }, time: 30, hk: 'Q', icon: 'gold', desc: 'Gold miners work 15% faster.', fx: p => p.gather.gold *= 1.15 },
  stonemining: { name: 'Stone Mining', at: 'miningcamp', age: 1, cost: { food: 100, wood: 75 }, time: 30, hk: 'W', icon: 'stone', desc: 'Stone miners work 15% faster.', fx: p => p.gather.stone *= 1.15 },
  forging: { name: 'Forging', at: 'blacksmith', age: 1, cost: { food: 150 }, time: 50, hk: 'Q', icon: 'sword', desc: 'Infantry and cavalry +1 attack.', fx: p => { addUp(p, 'infantry', { atk: 1 }); addUp(p, 'cavalry', { atk: 1 }); } },
  ironcasting: { name: 'Iron Casting', at: 'blacksmith', age: 2, cost: { food: 220, gold: 120 }, time: 75, hk: 'Q', req: ['forging'], icon: 'sword2', desc: 'Infantry and cavalry +1 attack.', fx: p => { addUp(p, 'infantry', { atk: 1 }); addUp(p, 'cavalry', { atk: 1 }); } },
  scalemail: { name: 'Scale Mail Armor', at: 'blacksmith', age: 1, cost: { food: 100 }, time: 40, hk: 'W', icon: 'armor', desc: 'Infantry +1/+1 armor.', fx: p => addUp(p, 'infantry', { ma: 1, pa: 1 }) },
  chainmail: { name: 'Chain Mail Armor', at: 'blacksmith', age: 2, cost: { food: 200, gold: 100 }, time: 55, hk: 'W', req: ['scalemail'], icon: 'armor2', desc: 'Infantry +1/+1 armor.', fx: p => addUp(p, 'infantry', { ma: 1, pa: 1 }) },
  scalebarding: { name: 'Scale Barding', at: 'blacksmith', age: 1, cost: { food: 150 }, time: 45, hk: 'E', icon: 'horse', desc: 'Cavalry +1/+1 armor.', fx: p => addUp(p, 'cavalry', { ma: 1, pa: 1 }) },
  fletching: { name: 'Fletching', at: 'blacksmith', age: 1, cost: { food: 100, gold: 50 }, time: 30, hk: 'R', icon: 'arrow', desc: 'Archers, towers, TCs and galleys +1 attack and +1 range.', fx: p => { addUp(p, 'archer', { atk: 1, range: 1 }); addUp(p, 'warship', { atk: 1, range: 1 }); p.bldAtk += 1; p.bldRange += 1; } },
  bodkin: { name: 'Bodkin Arrow', at: 'blacksmith', age: 2, cost: { food: 200, gold: 100 }, time: 35, hk: 'R', req: ['fletching'], icon: 'arrow2', desc: 'Archers, towers, TCs and galleys +1 attack and +1 range.', fx: p => { addUp(p, 'archer', { atk: 1, range: 1 }); addUp(p, 'warship', { atk: 1, range: 1 }); p.bldAtk += 1; p.bldRange += 1; } },
  paddedarcher: { name: 'Padded Archer Armor', at: 'blacksmith', age: 1, cost: { food: 100 }, time: 40, hk: 'T', icon: 'armor', desc: 'Archers +1/+1 armor.', fx: p => addUp(p, 'archer', { ma: 1, pa: 1 }) },
  masonry: { name: 'Masonry', at: 'university', age: 2, cost: { food: 150, stone: 175 }, time: 50, hk: 'Q', icon: 'brick', desc: 'Buildings +10% HP, +1/+1 armor.', fx: p => { p.bldHp *= 1.1; p.bldArmor += 1; } },
  ballistics: { name: 'Ballistics', at: 'university', age: 2, cost: { wood: 300, gold: 175 }, time: 60, hk: 'W', icon: 'target', desc: 'Ranged units and buildings lead moving targets: projectiles never miss.', fx: p => p.ballistics = true },
  murderholes: { name: 'Murder Holes', at: 'university', age: 2, cost: { food: 200, stone: 100 }, time: 60, hk: 'E', icon: 'tower', desc: 'Towers and castles have no minimum range; +1 attack.', fx: p => p.bldAtk += 1 },
  guardtower: { name: 'Guard Tower', at: 'university', age: 2, cost: { food: 100, stone: 250 }, time: 30, hk: 'R', icon: 'tower', desc: 'Towers +50% HP and +2 attack.', fx: p => p.towerLvl = 1 },
  keep: { name: 'Keep', at: 'university', age: 3, cost: { food: 500, wood: 350 }, time: 75, hk: 'R', req: ['guardtower'], icon: 'tower', desc: 'Towers +100% HP and +4 attack.', fx: p => p.towerLvl = 2 },
  chemistry: { name: 'Chemistry', at: 'university', age: 3, cost: { food: 300, gold: 200 }, time: 100, hk: 'T', icon: 'flask', desc: 'Missile units +1 attack.', fx: p => { addUp(p, 'archer', { atk: 1 }); addUp(p, 'siege', { atk: 1 }); p.bldAtk += 1; } },
  fervor: { name: 'Fervor', at: 'monastery', age: 2, cost: { gold: 140 }, time: 50, hk: 'W', icon: 'monk', desc: 'Monks move 15% faster.', fx: p => addUp(p, 'monk', { speed: 0.1 }) },
  sanctity: { name: 'Sanctity', at: 'monastery', age: 2, cost: { gold: 120 }, time: 60, hk: 'E', icon: 'monk', desc: 'Monks +15 HP.', fx: p => addUp(p, 'monk', { hp: 15 }) },
  illumination: { name: 'Illumination', at: 'monastery', age: 3, cost: { gold: 120 }, time: 65, hk: 'R', icon: 'monk', desc: 'Monks recover 50% faster after converting.', fx: p => p.monkRecharge *= 0.66 },
  cartography: { name: 'Cartography', at: 'market', age: 1, cost: { food: 100, gold: 100 }, time: 50, hk: 'W', icon: 'map', desc: 'Share line of sight with allies.', fx: p => p.sharedVision = true },
  caravan: { name: 'Caravan', at: 'market', age: 2, cost: { food: 200, gold: 200 }, time: 40, hk: 'E', icon: 'cart', desc: 'Trade units move 50% faster.', fx: p => { addUp(p, 'trade', { speed: 0.5 }); } },
  coinage: { name: 'Coinage', at: 'market', age: 2, cost: { food: 200, gold: 100 }, time: 50, hk: 'R', icon: 'gold', desc: 'Tribute fee reduced by 10 percentage points.', fx: p => p.tributeFee = Math.max(0, p.tributeFee - 0.1) },
  careening: { name: 'Careening', at: 'dock', age: 2, cost: { food: 250, gold: 150 }, time: 50, hk: 'Z', icon: 'ship', desc: 'Ships +1 pierce armor, transports +5 capacity.', fx: p => { addUp(p, 'ship', { pa: 1 }); p.transportCap += 5; } },
  gillnets: { name: 'Gillnets', at: 'dock', age: 1, cost: { food: 150, wood: 200 }, time: 45, hk: 'X', icon: 'fish', desc: 'Fishing Ships work 25% faster.', fx: p => p.gather.fish *= 1.25 },
  // unit line upgrades
  up_manatarms: { name: 'Man-at-Arms', at: 'barracks', age: 1, cost: { food: 100, gold: 40 }, time: 40, hk: 'Z', upg: ['militia', 'manatarms'], icon: 'unit:manatarms', desc: 'Upgrade Militia to Man-at-Arms.' },
  up_longsword: { name: 'Long Swordsman', at: 'barracks', age: 2, cost: { food: 200, gold: 65 }, time: 45, hk: 'Z', upg: ['manatarms', 'longsword'], req: ['up_manatarms'], icon: 'unit:longsword', desc: 'Upgrade to Long Swordsman.' },
  up_twohanded: { name: 'Two-Handed Swordsman', at: 'barracks', age: 3, cost: { food: 300, gold: 100 }, time: 75, hk: 'Z', upg: ['longsword', 'twohanded'], req: ['up_longsword'], icon: 'unit:twohanded', desc: 'Upgrade to Two-Handed Swordsman.' },
  up_pikeman: { name: 'Pikeman', at: 'barracks', age: 2, cost: { food: 215, gold: 90 }, time: 45, hk: 'X', upg: ['spearman', 'pikeman'], icon: 'unit:pikeman', desc: 'Upgrade Spearmen to Pikemen.' },
  up_crossbow: { name: 'Crossbowman', at: 'range', age: 2, cost: { food: 125, gold: 75 }, time: 35, hk: 'Z', upg: ['archer', 'crossbow'], icon: 'unit:crossbow', desc: 'Upgrade Archers to Crossbowmen.' },
  up_arbalest: { name: 'Arbalester', at: 'range', age: 3, cost: { food: 350, gold: 300 }, time: 50, hk: 'Z', upg: ['crossbow', 'arbalest'], req: ['up_crossbow'], icon: 'unit:arbalest', desc: 'Upgrade to Arbalester.' },
  up_eskirm: { name: 'Elite Skirmisher', at: 'range', age: 2, cost: { wood: 230, gold: 130 }, time: 50, hk: 'X', upg: ['skirmisher', 'eskirm'], icon: 'unit:eskirm', desc: 'Upgrade Skirmishers.' },
  up_lightcav: { name: 'Light Cavalry', at: 'stable', age: 2, cost: { food: 150, gold: 50 }, time: 45, hk: 'Z', upg: ['scout', 'lightcav'], icon: 'unit:lightcav', desc: 'Upgrade Scout Cavalry to Light Cavalry.' },
  up_cavalier: { name: 'Cavalier', at: 'stable', age: 3, cost: { food: 300, gold: 300 }, time: 100, hk: 'X', upg: ['knight', 'cavalier'], icon: 'unit:cavalier', desc: 'Upgrade Knights to Cavaliers.' },
  up_wargalley: { name: 'War Galley', at: 'dock', age: 2, cost: { food: 230, gold: 100 }, time: 50, hk: 'C', upg: ['galley', 'wargalley'], icon: 'unit:wargalley', desc: 'Upgrade Galleys to War Galleys.' },
  up_galleon: { name: 'Galleon', at: 'dock', age: 3, cost: { food: 400, wood: 315 }, time: 65, hk: 'C', upg: ['wargalley', 'galleon'], req: ['up_wargalley'], icon: 'unit:galleon', desc: 'Upgrade War Galleys to Galleons.' },
  elite_uu: { name: 'Elite Unique Unit', at: 'castle', age: 3, cost: { food: 900, gold: 650 }, time: 60, hk: 'Z', icon: 'uu', desc: 'Your unique unit gains +30% HP and +2 attack.', fx: p => addUp(p, 'unique', { hpPct: 0.3, atk: 2 }) },
};
TRAIN.tc_techs = null;
function addUp(p, key, o) {
  const u = p.up[key] || (p.up[key] = {});
  for (const k in o) u[k] = (u[k] || 0) + o[k];
}
const TECHS_AT = {};
for (const id in TECHS) { const t = TECHS[id]; (TECHS_AT[t.at] = TECHS_AT[t.at] || []).push(id); }

const HELP_TEXT = `
<h2>How to play</h2>
<p><b>Goal:</b> destroy every enemy unit and building. Players you are <i>allied</i> with share victory: when all remaining players are allied with you, you win together.
Players at <i>peace</i> (neutral) still block victory — declare war on them or ally with them before the match can end. Animals never count.</p>
<h3>Controls</h3>
<ul>
<li><b>Left click</b> select, <b>drag</b> box-select, <b>double-click</b> selects all of that type on screen, <b>Shift</b> adds to selection.</li>
<li><b>Right click</b> context command: move, gather, build, repair, attack, garrison (on TC/Tower/Castle/Transport), heal/convert (monks), trade (Trade Cart on a Market).</li>
<li><b>Arrow keys</b> / screen edges scroll, <b>mouse wheel</b> zooms, click the minimap to jump.</li>
<li>Command hotkeys are printed on each button. Villagers: <b>B</b> economic buildings, <b>V</b> military buildings. <b>H</b> selects your Town Center, <b>.</b> idle villager, <b>Del</b> deletes, <b>Ctrl+1..9</b> make groups, <b>1..9</b> recall.</li>
<li><b>Enter</b> opens chat / cheat input. <b>F1</b> help, <b>F3</b> pause, <b>F10</b> menu.</li>
</ul>
<h3>Economy</h3>
<p>Villagers gather food (sheep, berries, hunting, farms), wood (trees), gold and stone, and carry it to the nearest drop site (Town Center, Mill, Lumber Camp, Mining Camp). Fishing Ships return fish to a Dock. Houses give +5 population (max 200).</p>
<h3>Sheep</h3>
<p>Neutral sheep become yours when one of your units comes within <b>4 tiles</b>. A sheep that already has an owner can only be captured when <b>none of the owner's units are within 4 tiles</b> (it is unguarded) and a single rival player has had a unit within 4 tiles for <b>1.5 seconds</b>. If several players contest, the sheep keeps its owner — so ownership never flickers.</p>
<h3>Elevation</h3>
<p>Hills are real terrain. A unit attacking from <b>higher ground deals +25% damage</b>; attacking <b>uphill deals −25%</b>. Ranged units on higher ground also gain <b>+1 range</b>. Level differences of 2+ between neighbouring tiles are <b>cliffs</b> that block movement. Units walk slower uphill.</p>
<h3>Water</h3>
<p>Docks must be placed on water touching the shore. Transport Ships: select land units and right-click the transport to board, then select the transport, press <b>Unload</b> (U) and click a shore. Land units cannot cross deep water; ships cannot enter land.</p>
<h3>Monks & Relics</h3>
<p>Monks heal friendly living units (not ships, siege or buildings — villagers <b>repair</b> those using wood/stone). Right-click an enemy unit to convert it: the monk chants for a few seconds, then must rest before converting again. Pick up relics and bring them to a Monastery: each stored relic yields gold. If a monk dies or the Monastery is destroyed, relics drop to the ground.</p>
<h3>Diplomacy & Trade</h3>
<p>Open the Diplomacy panel to propose alliance or peace, or declare war. Computer players judge proposals based on relative strength and history. Allied players never target each other. Tribute resources to anyone (a fee applies; Coinage lowers it). Trade Carts travel between two of your/your allies' Markets; Trade Cogs between Docks — the longer the route, the more gold per trip.</p>
<h3>Cheat codes</h3>
<p>Enable "Allow cheats" in game setup, then press Enter and type (case-insensitive):</p>
<ul>
<li><code>cheese steak jimmy's</code> +10,000 food</li>
<li><code>lumberjack</code> +10,000 wood</li>
<li><code>robin hood</code> +10,000 gold</li>
<li><code>rock on</code> +10,000 stone</li>
<li><code>marco</code> reveal the map (toggle)</li>
<li><code>polo</code> remove fog of war (toggle)</li>
<li><code>aegis</code> instant build/train/research (toggle)</li>
<li><code>how do you turn this on</code> spawns a Cobra Car near your Town Center (the AoE II cheat car — not AoE I's BIGDADDY)</li>
</ul>
`;
