// NBA franchises by the abbreviations used in the player database (Basketball-Reference style), with city name and
// the colours people associate with the team. Colours are only used for blind-auction clues.
export const NBA_TEAMS: Record<string, { name: string; colors: string[] }> = {
  ATL: { name: "Atlanta Hawks", colors: ["red", "white"] }, BOS: { name: "Boston Celtics", colors: ["green", "white"] },
  BRK: { name: "Brooklyn Nets", colors: ["black", "white"] }, NJN: { name: "New Jersey Nets", colors: ["navy", "red"] },
  CHO: { name: "Charlotte Hornets", colors: ["teal", "purple"] }, CHH: { name: "Charlotte Hornets", colors: ["teal", "purple"] }, CHA: { name: "Charlotte Bobcats", colors: ["orange", "blue"] },
  CHI: { name: "Chicago Bulls", colors: ["red", "black"] }, CLE: { name: "Cleveland Cavaliers", colors: ["wine", "gold"] },
  DAL: { name: "Dallas Mavericks", colors: ["blue", "silver"] }, DEN: { name: "Denver Nuggets", colors: ["light blue", "gold"] },
  DET: { name: "Detroit Pistons", colors: ["red", "white", "blue"] }, GSW: { name: "Golden State Warriors", colors: ["blue", "gold"] },
  HOU: { name: "Houston Rockets", colors: ["red", "white"] }, IND: { name: "Indiana Pacers", colors: ["navy", "gold"] },
  LAC: { name: "Los Angeles Clippers", colors: ["red", "blue"] }, SDC: { name: "San Diego Clippers", colors: ["red", "blue"] }, BUF: { name: "Buffalo Braves", colors: ["blue", "orange"] },
  LAL: { name: "Los Angeles Lakers", colors: ["purple", "gold"] }, MNL: { name: "Minneapolis Lakers", colors: ["blue", "gold"] },
  MEM: { name: "Memphis Grizzlies", colors: ["navy", "light blue"] }, VAN: { name: "Vancouver Grizzlies", colors: ["teal", "bronze"] },
  MIA: { name: "Miami Heat", colors: ["red", "black"] }, MIL: { name: "Milwaukee Bucks", colors: ["green", "cream"] },
  MIN: { name: "Minnesota Timberwolves", colors: ["blue", "green"] }, NOP: { name: "New Orleans Pelicans", colors: ["navy", "gold", "red"] },
  NOH: { name: "New Orleans Hornets", colors: ["teal", "purple", "gold"] }, NOK: { name: "New Orleans/Oklahoma City Hornets", colors: ["teal", "purple", "gold"] },
  NYK: { name: "New York Knicks", colors: ["blue", "orange"] }, OKC: { name: "Oklahoma City Thunder", colors: ["blue", "orange"] },
  SEA: { name: "Seattle SuperSonics", colors: ["green", "gold"] }, ORL: { name: "Orlando Magic", colors: ["blue", "black"] },
  PHI: { name: "Philadelphia 76ers", colors: ["blue", "red"] }, PHO: { name: "Phoenix Suns", colors: ["purple", "orange"] },
  POR: { name: "Portland Trail Blazers", colors: ["red", "black"] }, SAC: { name: "Sacramento Kings", colors: ["purple", "silver"] },
  KCK: { name: "Kansas City Kings", colors: ["blue", "red"] }, CIN: { name: "Cincinnati Royals", colors: ["blue", "white"] },
  SAS: { name: "San Antonio Spurs", colors: ["silver", "black"] }, TOR: { name: "Toronto Raptors", colors: ["red", "black"] },
  UTA: { name: "Utah Jazz", colors: ["purple", "green", "gold"] }, WAS: { name: "Washington Wizards", colors: ["navy", "red"] },
  WSB: { name: "Washington Bullets", colors: ["red", "white", "blue"] }, BAL: { name: "Baltimore Bullets", colors: ["red", "white", "blue"] },
  PHW: { name: "Philadelphia Warriors", colors: ["blue", "gold"] }, SFW: { name: "San Francisco Warriors", colors: ["blue", "gold"] },
  STL: { name: "St. Louis Hawks", colors: ["blue", "gold"] }, SYR: { name: "Syracuse Nationals", colors: ["green", "white"] },
  FTW: { name: "Fort Wayne Pistons", colors: ["blue", "white"] }, ROC: { name: "Rochester Royals", colors: ["blue", "white"] },
};
export const teamName = (abbr: string) => NBA_TEAMS[abbr]?.name ?? abbr;
