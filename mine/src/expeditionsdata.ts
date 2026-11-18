/**
 * Fly Pet expeditions: the places and the items (2026-11-18, flypet/EXPEDITIONS-PLAN.md). Data only: add a place or an
 * item here and the server and the pet pick it up (the pet gets this through GET /api/pet/exp). Names are in the site's 6
 * languages, in this order: en, zh-Hans, zh-Hant, ko, tr, es.
 *
 * Placeholder art (phase 1): an item is drawn as its `glyph` (an emoji) on the fly, a bubble skin as its colors. Real
 * pixel art can replace a glyph with an `img` later without touching the rules.
 */
export type Names = [string, string, string, string, string, string];
export type Rarity = "common" | "uncommon" | "rare" | "legendary";
export type Slot = "hat" | "wings" | "trail" | "bubble" | "acc" | "junk";
export const SLOTS: Slot[] = ["hat", "wings", "trail", "bubble", "acc"];
export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "legendary"];

export interface Place {
  id: string;
  level: number;            // the pet level that opens it
  lengths: number[];        // minutes
  risk: number;             // the chance it gets swatted, before Guard
  weights: Record<Rarity, number>;
  names: Names;
}
export const PLACES: Place[] = [
  { id: "fruit", level: 1, lengths: [15, 60], risk: 0, weights: { common: 80, uncommon: 18, rare: 2, legendary: 0 },
    names: ["Fruit Bowl", "果盘", "果盤", "과일 그릇", "Meyve Kasesi", "Frutero"] },
  { id: "bin", level: 3, lengths: [60, 240], risk: 0.08, weights: { common: 65, uncommon: 27, rare: 7, legendary: 1 },
    names: ["Kitchen Bin", "厨房垃圾桶", "廚房垃圾桶", "주방 쓰레기통", "Mutfak Çöpü", "Cubo de la cocina"] },
  { id: "picnic", level: 6, lengths: [240, 480], risk: 0.12, weights: { common: 50, uncommon: 33, rare: 14, legendary: 3 },
    names: ["Picnic Blanket", "野餐毯", "野餐毯", "피크닉 담요", "Piknik Örtüsü", "Mantel de pícnic"] },
  { id: "compost", level: 10, lengths: [480], risk: 0.15, weights: { common: 40, uncommon: 35, rare: 20, legendary: 5 },
    names: ["Compost Heap", "堆肥堆", "堆肥堆", "퇴비 더미", "Kompost Yığını", "Montón de compost"] },
];

export interface Item {
  id: string;
  slot: Slot;
  rarity: Rarity;
  places: string[] | "any";   // where it drops ("any": everywhere); [] = never from a roll (the bandage)
  set?: string;
  glyph: string;
  colors?: { bg: string; ink: string };   // a bubble skin
  names: Names;
}
export const ITEMS: Item[] = [
  // junk: recycled into pet XP
  { id: "crumb", slot: "junk", rarity: "common", places: "any", glyph: "🍞", names: ["Crumb", "面包屑", "麵包屑", "빵부스러기", "Kırıntı", "Miga"] },
  { id: "cap", slot: "junk", rarity: "common", places: "any", glyph: "🔘", names: ["Bottle cap", "瓶盖", "瓶蓋", "병뚜껑", "Şişe kapağı", "Chapa"] },
  { id: "peel", slot: "junk", rarity: "common", places: ["fruit", "bin", "compost"], glyph: "🍌", names: ["Banana peel", "香蕉皮", "香蕉皮", "바나나 껍질", "Muz kabuğu", "Cáscara de plátano"] },
  { id: "lint", slot: "junk", rarity: "common", places: ["bin", "picnic"], glyph: "☁️", names: ["Lint", "绒毛", "絨毛", "보풀", "Tüy yumağı", "Pelusa"] },
  { id: "bandage", slot: "acc", rarity: "common", places: [], glyph: "🩹", names: ["Bandage", "创可贴", "OK繃", "반창고", "Yara bandı", "Tirita"] },

  // Fruit Bowl (the Fruit set: cherry hat, juice trail, peach bubble)
  { id: "hat_leaf", slot: "hat", rarity: "common", places: ["fruit"], glyph: "🍃", names: ["Leaf hat", "叶子帽", "葉子帽", "잎사귀 모자", "Yaprak şapka", "Sombrero de hoja"] },
  { id: "acc_seed", slot: "acc", rarity: "common", places: ["fruit"], glyph: "🌱", names: ["Lucky seed", "幸运种子", "幸運種子", "행운의 씨앗", "Şanslı tohum", "Semilla de la suerte"] },
  { id: "trail_juice", slot: "trail", rarity: "common", places: ["fruit"], set: "fruit", glyph: "💧", names: ["Juice drips", "果汁滴", "果汁滴", "주스 방울", "Meyve suyu damlası", "Gotas de zumo"] },
  { id: "hat_cherry", slot: "hat", rarity: "uncommon", places: ["fruit"], set: "fruit", glyph: "🍒", names: ["Cherry hat", "樱桃帽", "櫻桃帽", "체리 모자", "Kiraz şapka", "Sombrero de cereza"] },
  { id: "bubble_peach", slot: "bubble", rarity: "uncommon", places: ["fruit"], set: "fruit", glyph: "🍑", colors: { bg: "#ffb38a", ink: "#2a1306" },
    names: ["Peach bubble", "蜜桃气泡", "蜜桃氣泡", "복숭아 말풍선", "Şeftali balon", "Burbuja de melocotón"] },
  { id: "wings_petal", slot: "wings", rarity: "uncommon", places: ["fruit", "picnic"], glyph: "🌸", names: ["Petal wings", "花瓣翅膀", "花瓣翅膀", "꽃잎 날개", "Taç yaprağı kanatlar", "Alas de pétalo"] },
  { id: "hat_grape", slot: "hat", rarity: "rare", places: ["fruit"], glyph: "🍇", names: ["Grape crown", "葡萄王冠", "葡萄王冠", "포도 왕관", "Üzüm tacı", "Corona de uvas"] },

  // Kitchen Bin
  { id: "hat_can", slot: "hat", rarity: "common", places: ["bin"], glyph: "🥫", names: ["Tin can hat", "罐头帽", "罐頭帽", "깡통 모자", "Teneke şapka", "Sombrero de lata"] },
  { id: "trail_stink", slot: "trail", rarity: "common", places: ["bin", "compost"], glyph: "💨", names: ["Stink cloud", "臭气云", "臭氣雲", "냄새 구름", "Koku bulutu", "Nube apestosa"] },
  { id: "hat_bag", slot: "hat", rarity: "uncommon", places: ["bin"], glyph: "🛍️", names: ["Paper bag hat", "纸袋帽", "紙袋帽", "종이봉투 모자", "Kese kağıdı şapka", "Gorro de bolsa"] },
  { id: "wings_foil", slot: "wings", rarity: "uncommon", places: ["bin"], glyph: "✨", names: ["Foil wings", "锡纸翅膀", "錫紙翅膀", "호일 날개", "Folyo kanatlar", "Alas de papel de aluminio"] },
  { id: "bubble_news", slot: "bubble", rarity: "uncommon", places: ["bin"], glyph: "📰", colors: { bg: "#ece6d4", ink: "#1b1b1b" },
    names: ["Newsprint bubble", "报纸气泡", "報紙氣泡", "신문지 말풍선", "Gazete balon", "Burbuja de periódico"] },
  { id: "acc_ring", slot: "acc", rarity: "rare", places: ["bin"], glyph: "💍", names: ["Ring pull ring", "易拉环戒指", "易開環戒指", "캔따개 반지", "Kapak halkası yüzük", "Anillo de anilla"] },
  { id: "hat_binking", slot: "hat", rarity: "legendary", places: ["bin"], glyph: "👑", names: ["Bin King crown", "垃圾桶之王王冠", "垃圾桶之王王冠", "쓰레기통 왕관", "Çöp Kralı tacı", "Corona del Rey del Cubo"] },

  // Picnic Blanket (the Picnic set: sun hat, basket, gingham bubble)
  { id: "trail_ants", slot: "trail", rarity: "common", places: ["picnic"], glyph: "🐜", names: ["Ant parade", "蚂蚁游行", "螞蟻遊行", "개미 행렬", "Karınca geçidi", "Desfile de hormigas"] },
  { id: "hat_melon", slot: "hat", rarity: "uncommon", places: ["picnic"], glyph: "🍉", names: ["Melon helmet", "西瓜头盔", "西瓜頭盔", "수박 헬멧", "Karpuz kask", "Casco de sandía"] },
  { id: "acc_basket", slot: "acc", rarity: "uncommon", places: ["picnic"], set: "picnic", glyph: "🧺", names: ["Tiny basket", "小篮子", "小籃子", "작은 바구니", "Minik sepet", "Cestita"] },
  { id: "hat_sun", slot: "hat", rarity: "rare", places: ["picnic"], set: "picnic", glyph: "👒", names: ["Picnic sun hat", "野餐遮阳帽", "野餐遮陽帽", "피크닉 밀짚모자", "Piknik hasır şapka", "Pamela de pícnic"] },
  { id: "bubble_gingham", slot: "bubble", rarity: "rare", places: ["picnic"], set: "picnic", glyph: "🟥", colors: { bg: "#e04848", ink: "#ffffff" },
    names: ["Gingham bubble", "格子布气泡", "格子布氣泡", "깅엄 말풍선", "Kareli balon", "Burbuja de cuadros"] },
  { id: "wings_butterfly", slot: "wings", rarity: "rare", places: ["picnic"], glyph: "🦋", names: ["Butterfly wings", "蝴蝶翅膀", "蝴蝶翅膀", "나비 날개", "Kelebek kanatlar", "Alas de mariposa"] },
  { id: "wings_gold", slot: "wings", rarity: "legendary", places: ["picnic", "compost"], glyph: "🪽", names: ["Golden wings", "黄金翅膀", "黃金翅膀", "황금 날개", "Altın kanatlar", "Alas doradas"] },

  // Compost Heap (the Compost set: mushroom hat, autumn wings, spore trail)
  { id: "acc_worm", slot: "acc", rarity: "common", places: ["compost"], glyph: "🪱", names: ["Worm buddy", "蚯蚓伙伴", "蚯蚓夥伴", "지렁이 친구", "Solucan dostu", "Amigo gusano"] },
  { id: "hat_mush", slot: "hat", rarity: "uncommon", places: ["compost"], set: "compost", glyph: "🍄", names: ["Mushroom cap", "蘑菇帽", "蘑菇帽", "버섯 모자", "Mantar şapka", "Gorro de seta"] },
  { id: "bubble_moss", slot: "bubble", rarity: "uncommon", places: ["compost"], glyph: "🌿", colors: { bg: "#2f5d3a", ink: "#eaffef" },
    names: ["Moss bubble", "苔藓气泡", "苔蘚氣泡", "이끼 말풍선", "Yosun balon", "Burbuja de musgo"] },
  { id: "wings_leaf", slot: "wings", rarity: "rare", places: ["compost"], set: "compost", glyph: "🍂", names: ["Autumn wings", "秋叶翅膀", "秋葉翅膀", "가을 날개", "Sonbahar kanatlar", "Alas de otoño"] },
  { id: "trail_spores", slot: "trail", rarity: "rare", places: ["compost"], set: "compost", glyph: "🌀", names: ["Spore swirl", "孢子漩涡", "孢子漩渦", "포자 소용돌이", "Spor girdabı", "Remolino de esporas"] },
  { id: "trail_firefly", slot: "trail", rarity: "legendary", places: ["compost"], glyph: "💫", names: ["Firefly trail", "萤火虫轨迹", "螢火蟲軌跡", "반딧불 자취", "Ateşböceği izi", "Estela de luciérnagas"] },
];

export const SETS: { id: string; names: Names }[] = [
  { id: "fruit", names: ["Fruit set", "水果套装", "水果套裝", "과일 세트", "Meyve seti", "Conjunto fruta"] },
  { id: "picnic", names: ["Picnic set", "野餐套装", "野餐套裝", "피크닉 세트", "Piknik seti", "Conjunto pícnic"] },
  { id: "compost", names: ["Compost set", "堆肥套装", "堆肥套裝", "퇴비 세트", "Kompost seti", "Conjunto compost"] },
];

/** pet XP for recycling one item, by rarity */
export const RECYCLE_XP: Record<Rarity, number> = { common: 3, uncommon: 10, rare: 30, legendary: 100 };
