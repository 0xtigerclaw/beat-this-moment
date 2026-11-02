// A basic name filter for guest entries, which can appear on the stream overlay.
// It catches common slurs and simple letter swaps. Hosts can remove anything it misses.
const ANYWHERE = ['nigger', 'nigga', 'faggot', 'retard', 'kike', 'tranny', 'chink', 'hitler'];
// These are matched as whole words only, because they appear inside ordinary names.
const WHOLE_WORD = ['fag', 'spic', 'coon', 'cunt', 'rape', 'nazi'];
const SWAPS = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };

const normalize = (name) => name.toLowerCase().replace(/[013457]/g, (digit) => SWAPS[digit]);

export function isBlockedName(name, extra = []) {
  const clean = normalize(String(name));
  const joined = clean.replace(/[^\p{L}]/gu, '');
  const words = clean.split(/[^\p{L}]+/u);
  return (
    ANYWHERE.some((term) => joined.includes(term)) ||
    WHOLE_WORD.some((term) => words.includes(term) || joined === term) ||
    extra.some((term) => joined.includes(normalize(term).replace(/[^\p{L}]/gu, '')))
  );
}
