// app/nflTeamData.ts
// Minimal NFL team data for logos/colors used on the draft board.

import type { TeamData } from "./teamData";

const NFL_TEAM_DATA: TeamData[] = [
  { code: "ARI", name: "Arizona Cardinals", colors: ["#97233F", "#000000", "#FFB612"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ari.png" },
  { code: "ATL", name: "Atlanta Falcons", colors: ["#A71930", "#000000", "#A5ACAF"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/atl.png" },
  { code: "BAL", name: "Baltimore Ravens", colors: ["#241773", "#000000", "#9E7C0C"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/bal.png" },
  { code: "BUF", name: "Buffalo Bills", colors: ["#00338D", "#C60C30", "#FFFFFF"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png" },
  { code: "CAR", name: "Carolina Panthers", colors: ["#0085CA", "#101820", "#BFC0BF"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/car.png" },
  { code: "CHI", name: "Chicago Bears", colors: ["#0B162A", "#C83803"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/chi.png" },
  { code: "CIN", name: "Cincinnati Bengals", colors: ["#FB4F14", "#000000"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/cin.png" },
  { code: "CLE", name: "Cleveland Browns", colors: ["#311D00", "#FF3C00"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/cle.png" },
  { code: "DAL", name: "Dallas Cowboys", colors: ["#041E42", "#869397", "#7F9695"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/dal.png" },
  { code: "DEN", name: "Denver Broncos", colors: ["#FB4F14", "#002244", "#A5ACAF"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/den.png" },
  { code: "DET", name: "Detroit Lions", colors: ["#0076B6", "#B0B7BC", "#000000"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/det.png" },
  { code: "GB", name: "Green Bay Packers", colors: ["#203731", "#FFB612", "#000000"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png" },
  { code: "HOU", name: "Houston Texans", colors: ["#03202F", "#A71930", "#FFFFFF"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png" },
  { code: "IND", name: "Indianapolis Colts", colors: ["#002C5F", "#FFFFFF"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ind.png" },
  { code: "JAX", name: "Jacksonville Jaguars", colors: ["#006778", "#9F792C", "#101820"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/jax.png" },
  { code: "KC", name: "Kansas City Chiefs", colors: ["#E31837", "#FFB81C", "#FFFFFF"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png" },
  { code: "LV", name: "Las Vegas Raiders", colors: ["#000000", "#A5ACAF", "#FFFFFF"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/lv.png" },
  { code: "LAC", name: "Los Angeles Chargers", colors: ["#0080C6", "#FFC20E", "#002A5E"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/lac.png" },
  { code: "LAR", name: "Los Angeles Rams", colors: ["#003594", "#FFA300", "#FFFFFF"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/lar.png" },
  { code: "MIA", name: "Miami Dolphins", colors: ["#008E97", "#FC4C02", "#005778"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/mia.png" },
  { code: "MIN", name: "Minnesota Vikings", colors: ["#4F2683", "#FFC62F", "#0B162A"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/min.png" },
  { code: "NE", name: "New England Patriots", colors: ["#002244", "#C60C30", "#B0B7BC"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ne.png" },
  { code: "NO", name: "New Orleans Saints", colors: ["#D3BC8D", "#101820", "#85714D"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/no.png" },
  { code: "NYG", name: "New York Giants", colors: ["#0B2265", "#A71930", "#FFFFFF"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png" },
  { code: "NYJ", name: "New York Jets", colors: ["#125740", "#000000", "#FFFFFF"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png" },
  { code: "PHI", name: "Philadelphia Eagles", colors: ["#004C54", "#A5ACAF", "#000000"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/phi.png" },
  { code: "PIT", name: "Pittsburgh Steelers", colors: ["#FFB612", "#101820", "#C60C30"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/pit.png" },
  { code: "SEA", name: "Seattle Seahawks", colors: ["#002244", "#69BE28", "#A5ACAF"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png" },
  { code: "SF", name: "San Francisco 49ers", colors: ["#AA0000", "#B3995D", "#000000"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png" },
  { code: "TB", name: "Tampa Bay Buccaneers", colors: ["#D50A0A", "#FF7900", "#0A0A08"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/tb.png" },
  { code: "TEN", name: "Tennessee Titans", colors: ["#0C2340", "#4B92DB", "#C8102E"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/ten.png" },
  { code: "WAS", name: "Washington Commanders", colors: ["#5A1414", "#FFB612", "#000000"], logoUrl: "https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png" },
];

const nflTeamMap = new Map<string, TeamData>();
NFL_TEAM_DATA.forEach((team) => nflTeamMap.set(team.code, team));

export function getNflTeamData(code: string): TeamData | undefined {
  return nflTeamMap.get(code);
}

export default NFL_TEAM_DATA;
