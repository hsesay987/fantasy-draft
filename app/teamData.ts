// app/teamData.ts
// This file is a utility to provide team colors and logos to the frontend.

export interface TeamData {
  code: string;
  name: string;
  colors: [string, string, string?];
  logoUrl: string;
}

const TEAM_DATA: TeamData[] = [
  {
    "code": "ATL",
    "name": "Atlanta Hawks",
    "colors": ["#E03A3E", "#C1D32F", "#26282A"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612737/primary/L/logo.svg"
  },
  {
    "code": "BOS",
    "name": "Boston Celtics",
    "colors": ["#007A33", "#BA9653", "#993333"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612738/primary/L/logo.svg"
  },
  {
    "code": "BKN",
    "name": "Brooklyn Nets",
    "colors": ["#000000", "#FFFFFF"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612751/primary/L/logo.svg"
  },
  {
    "code": "CHA",
    "name": "Charlotte Hornets",
    "colors": ["#1D1160", "#00788C", "#A1A1A4"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612766/primary/L/logo.svg"
  },
  {
    "code": "CHI",
    "name": "Chicago Bulls",
    "colors": ["#CE1141", "#000000"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612741/primary/L/logo.svg"
  },
  {
    "code": "CLE",
    "name": "Cleveland Cavaliers",
    "colors": ["#6F263D", "#FFB81C", "#041E42"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612739/primary/L/logo.svg"
  },
  {
    "code": "DAL",
    "name": "Dallas Mavericks",
    "colors": ["#00538C", "#00285E", "#B8C4CA"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612742/primary/L/logo.svg"
  },
  {
    "code": "DEN",
    "name": "Denver Nuggets",
    "colors": ["#0E2240", "#FEC524", "#8B2131"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612743/primary/L/logo.svg"
  },
  {
    "code": "DET",
    "name": "Detroit Pistons",
    "colors": ["#C8102E", "#006FA6", "#041E42"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612765/primary/L/logo.svg"
  },
  {
    "code": "GSW",
    "name": "Golden State Warriors",
    "colors": ["#1D428A", "#FFC72C"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612744/primary/L/logo.svg"
  },
  {
    "code": "HOU",
    "name": "Houston Rockets",
    "colors": ["#CE1141", "#000000", "#C4CED4"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612745/primary/L/logo.svg"
  },
  {
    "code": "IND",
    "name": "Indiana Pacers",
    "colors": ["#002D62", "#FFC633", "#A5ACAF"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612754/primary/L/logo.svg"
  },
  {
    "code": "LAC",
    "name": "LA Clippers",
    "colors": ["#C8102E", "#146EB4", "#000000"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612746/primary/L/logo.svg"
  },
  {
    "code": "LAL",
    "name": "Los Angeles Lakers",
    "colors": ["#552583", "#FDB927", "#000000"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612747/primary/L/logo.svg"
  },
  {
    "code": "MEM",
    "name": "Memphis Grizzlies",
    "colors": ["#5D76A9", "#12173F", "#F5B112"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612763/primary/L/logo.svg"
  },
  {
    "code": "MIA",
    "name": "Miami Heat",
    "colors": ["#98002E", "#F9A01B", "#000000"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612748/primary/L/logo.svg"
  },
  {
    "code": "MIL",
    "name": "Milwaukee Bucks",
    "colors": ["#00471B", "#EEE1C6", "#0077C0"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612749/primary/L/logo.svg"
  },
  {
    "code": "MIN",
    "name": "Minnesota Timberwolves",
    "colors": ["#0C2340", "#236192", "#9EA2A2"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612750/primary/L/logo.svg"
  },
  {
    "code": "NOP",
    "name": "New Orleans Pelicans",
    "colors": ["#002D62", "#B4975A", "#85714D"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612740/primary/L/logo.svg"
  },
  {
    "code": "NYK",
    "name": "New York Knicks",
    "colors": ["#006BB6", "#F58426", "#BEC0C2"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612752/primary/L/logo.svg"
  },
  {
    "code": "OKC",
    "name": "Oklahoma City Thunder",
    "colors": ["#007AC1", "#EF3B24", "#FDBB30"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612760/primary/L/logo.svg"
  },
  {
    "code": "ORL",
    "name": "Orlando Magic",
    "colors": ["#0077C0", "#C4CED4", "#000000"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612753/primary/L/logo.svg"
  },
  {
    "code": "PHI",
    "name": "Philadelphia 76ers",
    "colors": ["#006BB6", "#ED174B", "#002D62"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612755/primary/L/logo.svg"
  },
  {
    "code": "PHX",
    "name": "Phoenix Suns",
    "colors": ["#1D1160", "#E56020", "#F9AD1D"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612756/primary/L/logo.svg"
  },
  {
    "code": "POR",
    "name": "Portland Trail Blazers",
    "colors": ["#E03A3E", "#000000", "#B0B6B7"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612757/primary/L/logo.svg"
  },
  {
    "code": "SAC",
    "name": "Sacramento Kings",
    "colors": ["#5A2D81", "#63727A", "#000000"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612758/primary/L/logo.svg"
  },
  {
    "code": "SAS",
    "name": "San Antonio Spurs",
    "colors": ["#C4CED4", "#000000"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612759/primary/L/logo.svg"
  },
  {
    "code": "TOR",
    "name": "Toronto Raptors",
    "colors": ["#CE1141", "#000000", "#A1A1A4"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612761/primary/L/logo.svg"
  },
  {
    "code": "UTA",
    "name": "Utah Jazz",
    "colors": ["#002B5C", "#00471B", "#F9A01B"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612762/primary/L/logo.svg"
  },
  {
    "code": "WAS",
    "name": "Washington Wizards",
    "colors": ["#002B5C", "#E31837", "#C4CED4"],
    "logoUrl": "https://cdn.nba.com/logos/nba/1610612764/primary/L/logo.svg"
  },
  {
    "code": "TOT",
    "name": "Multiple Teams",
    "colors": ["#000000", "#C4CED4"],
    "logoUrl": ""
  }
];

const teamMap = new Map<string, TeamData>();
TEAM_DATA.forEach(team => teamMap.set(team.code, team));

export function getTeamData(teamCode: string): TeamData | undefined {
  return teamMap.get(teamCode);
}

export default TEAM_DATA;
