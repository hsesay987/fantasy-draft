// Data-free so scripts/buildPecking.ts can share it without importing the lists it writes.
/** Text for matching: no case, accents, punctuation, spaces or leading "the". Keeps Nidoran ♀ and ♂ apart. */
export const normName = (text: string): string =>
  text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/♀/g, " f").replace(/♂/g, " m").replace(/&/g, " and ")
    .trim().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "");
