// Hand-written memberships for the organisations Common Thread names, as ISO 3166-1 alpha-2 codes.
// Wikidata's membership lists are wrong too often (Australia in ASEAN, the United Kingdom in the EU), so these are written by hand.
// AS OF 2026-01. Only countries and territories that are certain members are listed: a disputed, suspended-and-unclear or
// withdrawn member (Venezuela and Nicaragua in the OAS, Cuba in the OAS, Saudi Arabia in BRICS) is left out.

export const MEMBERSHIPS_AS_OF = "2026-01";

export const MEMBERSHIPS: Record<string, string[]> = {
  "European Union": ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"],
  // Timor-Leste became the 11th member in October 2025.
  ASEAN: ["BN", "KH", "ID", "LA", "MY", "MM", "PH", "SG", "TH", "VN", "TL"],
  G7: ["CA", "FR", "DE", "IT", "JP", "GB", "US"],
  // The 19 member countries; the EU and the African Union are members too but are not countries.
  G20: ["AR", "AU", "BR", "CA", "CN", "FR", "DE", "IN", "ID", "IT", "JP", "KR", "MX", "RU", "SA", "ZA", "TR", "GB", "US"],
  // Founding five, then Egypt, Ethiopia, Iran and the UAE (2024) and Indonesia (2025).
  BRICS: ["BR", "RU", "IN", "CN", "ZA", "EG", "ET", "IR", "AE", "ID"],
  "Asia-Pacific Economic Cooperation": ["AU", "BN", "CA", "CL", "CN", "HK", "ID", "JP", "KR", "MY", "MX", "NZ", "PG", "PE", "PH", "RU", "SG", "TW", "TH", "US", "VN"],
  // The 15 full members.
  "Caribbean Community": ["AG", "BS", "BB", "BZ", "DM", "GD", "GY", "HT", "JM", "KN", "LC", "VC", "SR", "TT", "MS"],
  "Commonwealth of Nations": [
    "AG", "AU", "BS", "BD", "BB", "BZ", "BW", "BN", "CM", "CA", "CY", "DM", "SZ", "FJ", "GA", "GM", "GH", "GD", "GY", "IN", "JM", "KE", "KI", "LS", "MW", "MY", "MV", "MT", "MU", "MZ",
    "NA", "NR", "NZ", "NG", "PK", "PG", "RW", "KN", "LC", "VC", "WS", "SC", "SL", "SG", "SB", "ZA", "LK", "TZ", "TG", "TO", "TT", "TV", "UG", "GB", "VU", "ZM",
  ],
  // Member states in good standing; Cuba (not participating), Venezuela and Nicaragua (withdrew) are left out.
  "Organization of American States": ["AG", "AR", "BS", "BB", "BZ", "BO", "BR", "CA", "CL", "CO", "CR", "DM", "DO", "EC", "SV", "GD", "GT", "GY", "HT", "HN", "JM", "MX", "PA", "PY", "PE", "KN", "LC", "VC", "SR", "TT", "US", "UY"],
  "Arab League": ["DZ", "BH", "KM", "DJ", "EG", "IQ", "JO", "KW", "LB", "LY", "MR", "MA", "OM", "PS", "QA", "SA", "SO", "SD", "SY", "TN", "AE", "YE"],
};
