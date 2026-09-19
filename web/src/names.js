// Usernames are a colour plus a fruit, like PinkApple. Players spin until they like one; nobody types their own.
export const NAME_COLORS = [
  ['Red', '#D7263D'], ['Orange', '#F2622A'], ['Yellow', '#D9A400'], ['Gold', '#C9A227'], ['Amber', '#E08E0B'],
  ['Green', '#1B8A4C'], ['Lime', '#6FA80F'], ['Mint', '#2FA57A'], ['Olive', '#6B7A1F'], ['Teal', '#0E7C7B'],
  ['Turquoise', '#16A89C'], ['Cyan', '#0A9DC0'], ['Sky', '#3B96D1'], ['Blue', '#2F5BEA'], ['Navy', '#1B2A6B'],
  ['Indigo', '#4B3FA6'], ['Purple', '#7B2CBF'], ['Violet', '#8A3FFC'], ['Pink', '#E3367A'], ['Magenta', '#C2185B'],
  ['Coral', '#EE6352'], ['Crimson', '#B0142D'], ['Maroon', '#7A1F2B'], ['Brown', '#8B5A2B'], ['Black', '#222222'],
  ['White', '#8A8F94'], ['Silver', '#7D878F'], ['Grey', '#5F6368'],
];
export const NAME_FRUITS = [
  ['Apple', '🍎'], ['Banana', '🍌'], ['Orange', '🍊'], ['Mango', '🥭'], ['Kiwi', '🥝'], ['Cherry', '🍒'], ['Grape', '🍇'],
  ['Lemon', '🍋'], ['Lime', '🍋'], ['Peach', '🍑'], ['Pear', '🍐'], ['Melon', '🍈'], ['Watermelon', '🍉'], ['Pineapple', '🍍'],
  ['Coconut', '🥥'], ['Strawberry', '🍓'], ['Blueberry', '🫐'], ['Avocado', '🥑'], ['Tomato', '🍅'], ['Olive', '🫒'],
  ['Plum', '🍑'], ['Fig', '🍈'], ['Papaya', '🥭'], ['Lychee', '🍒'], ['Apricot', '🍑'], ['Raspberry', '🍓'],
  ['Blackberry', '🫐'], ['Tangerine', '🍊'], ['Grapefruit', '🍊'], ['Dragonfruit', '🍉'], ['Pomegranate', '🍎'], ['Guava', '🍐'],
];
// "pinkapple" -> { name: "PinkApple", color, fruit, emoji } or null if it isn't a colour + a fruit
export function parseName(raw) {
  const s = String(raw || '').trim().toLowerCase();
  for (const [c, hex] of NAME_COLORS) {
    if (!s.startsWith(c.toLowerCase())) continue;
    const rest = s.slice(c.length), f = NAME_FRUITS.find(([fr]) => fr.toLowerCase() === rest);
    if (f && f[0] !== c) return { name: c + f[0], color: hex, fruit: f[0], emoji: f[1] };
  }
  return null;
}
export function randomName() {
  for (;;) {
    const c = NAME_COLORS[Math.floor(Math.random() * NAME_COLORS.length)], f = NAME_FRUITS[Math.floor(Math.random() * NAME_FRUITS.length)];
    if (c[0] !== f[0]) return c[0] + f[0];
  }
}

// ---- nickname filter
// Nicknames are free text that everyone sees, so the obvious abuse is refused before it is saved. Text is folded
// first, so "F.u_c k", "fvck", "5h1t" and Cyrillic look-alikes all read the same. ROOTS are refused anywhere in the
// name, EDGES only where a word starts or ends (Bullshit, but not Toshitaka), WORDS only on their own (Ass, but not
// Cassandra). ALLOW is cut out first, so Scunthorpe, Therapist, Peacock and Canal stay fine.
const LOOKALIKE = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b', '9': 'g', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ν': 'v', 'ο': 'o', 'α': 'a', 'ρ': 'p' };
// Cyrillic is read twice: as Russian (сука → suka) and as look-alike Latin letters (сука → cyka)
const CYR = { 'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ы': 'y', 'э': 'e', 'ю': 'yu', 'я': 'ya', 'ь': '', 'ъ': '' };
const CYR_LOOK = { 'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x' };
const ROOTS = ['fuck', 'fvck', 'phuck', 'cunt', 'nigg', 'niga', 'faggot', 'fagot', 'bitch', 'whore', 'slut', 'retard', 'hitler', 'porn', 'pussy', 'penis', 'vagina', 'dildo', 'wank', 'jizz', 'twat', 'molest', 'pedo', 'paedo', 'rapist', 'kkk', 'blowjob', 'handjob', 'cock', 'boob', 'anal', 'orgasm', 'horny',
  'blyat', 'blyad', 'pizd', 'pidor', 'pidar', 'xyu', 'xuy', 'khuy', 'yeban', 'mudak', 'gandon', 'shlyuha', 'cyka'];
const EDGES = ['shit', 'shlt', 'bastard'];
const WORDS = ['ass', 'arse', 'asshole', 'dick', 'dik', 'fag', 'fags', 'fuk', 'fuq', 'rape', 'raped', 'cum', 'tit', 'tits', 'sex', 'sexy', 'nude', 'nudes', 'hoe', 'hoes', 'isis', 'jihad', 'coon', 'spic', 'chink', 'kike', 'gook', 'wetback', 'tranny', 'dyke', 'heil', 'suka', 'huy', 'blya', 'ebat', 'eban', 'nazi', 'nazis'];
const ALLOW = ['therapist', 'torpedo', 'canal', 'analy', 'banal', 'peacock', 'hitchcock', 'babcock', 'hancock', 'woodcock', 'cockpit', 'cockatoo', 'cockerel', 'shuttlecock', 'booby', 'shitake', 'shiitake', 'penistone', 'scunthorpe', 'swank', 'thorny', 'pedometer'];
// Cyrillic goes first: taking the accents off й would turn it into и
const readings = nick => { const s = String(nick).toLowerCase(); return [CYR, CYR_LOOK].map(map => s.replace(/./gu, c => map[c] ?? c).normalize('NFKD').replace(/\p{M}/gu, '').replace(/./gu, c => LOOKALIKE[c] ?? c)); };
const squeeze = w => w.replace(/(.)\1+/g, '$1');
function readingProblem(text) {
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  // single letters spaced out ("f u c k") are read as one word
  const merged = []; for (const w of words) { if (w.length === 1 && merged.length && merged[merged.length - 1].solo) merged[merged.length - 1].w += w; else merged.push({ w, solo: w.length === 1 }); }
  const all = merged.map(x => x.w);
  let joined = all.join(''); for (const a of ALLOW) joined = joined.split(a).join('_');
  if (ROOTS.some(r => joined.includes(r) || squeeze(joined).includes(r))) return true;
  const cut = all.map(w => { for (const a of ALLOW) w = w.split(a).join('_'); return w; });
  if (cut.some(w => EDGES.some(e => [w, squeeze(w)].some(x => x.startsWith(e) || x.endsWith(e))))) return true;
  return all.some(w => WORDS.includes(w) || WORDS.includes(squeeze(w)));
}
export function nickProblem(nick) {
  return readings(nick).some(readingProblem) ? 'That nickname isn’t allowed. Pick something else.' : null;
}
