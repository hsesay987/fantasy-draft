/** Records here are keyed by player names, and a name can be "constructor": only a record's own entries ever count. */
export const has = (m: object, key: string): boolean => Object.prototype.hasOwnProperty.call(m, key);
export const own = <T>(m: Record<string, T>, key: string): T | undefined => (has(m, key) ? m[key] : undefined);
