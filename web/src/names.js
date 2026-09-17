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
