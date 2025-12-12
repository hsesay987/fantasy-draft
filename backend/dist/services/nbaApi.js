"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllModernPlayers = getAllModernPlayers;
exports.getPlayerSeasonTotals = getPlayerSeasonTotals;
const node_fetch_1 = __importDefault(require("node-fetch"));
const BASE = "https://stats.nba.com/stats/";
const NBA_API_TIMEOUT_MS = Number(process.env.NBA_API_TIMEOUT_MS ?? 12000);
const NBA_API_RETRIES = Number(process.env.NBA_API_RETRIES ?? 3);
const BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "application/json, text/plain, */*",
    Referer: "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    Connection: "keep-alive",
};
async function withRetry(fn, label) {
    let lastErr;
    for (let i = 1; i <= NBA_API_RETRIES; i++) {
        try {
            if (NBA_API_RETRIES > 1) {
                console.log(`NBA API ${label} attempt ${i}/${NBA_API_RETRIES}...`);
            }
            return await fn();
        }
        catch (err) {
            lastErr = err;
            if (i === NBA_API_RETRIES)
                break;
            await new Promise((res) => setTimeout(res, 500 * i));
        }
    }
    throw new Error(`${label} failed after ${NBA_API_RETRIES} attempts: ${lastErr}`);
}
async function nbaFetch(endpoint, params) {
    const url = BASE + endpoint + "?" + new URLSearchParams(params).toString();
    const doFetch = async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), NBA_API_TIMEOUT_MS);
        try {
            const res = await (0, node_fetch_1.default)(url, {
                method: "GET",
                headers: BROWSER_HEADERS,
                signal: controller.signal,
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`NBA API error ${res.status} fetching ${endpoint}: ${text.slice(0, 200)}`);
            }
            return res.json();
        }
        catch (err) {
            if (err?.name === "AbortError") {
                throw new Error(`NBA API timeout after ${NBA_API_TIMEOUT_MS}ms on ${endpoint}`);
            }
            throw err;
        }
        finally {
            clearTimeout(timer);
        }
    };
    return withRetry(doFetch, endpoint);
}
async function getAllModernPlayers() {
    const data = await nbaFetch("commonallplayers", {
        LeagueID: "00",
        Season: "2023-24",
        IsOnlyCurrentSeason: 0,
    });
    const rows = data.resultSets[0]?.rowSet || [];
    return rows
        .map((r) => ({
        playerId: Number(r[0]),
        fullName: r[2],
        fromYear: Number(r[4]),
        toYear: Number(r[5]),
    }))
        .filter((p) => p.toYear >= 1980);
}
async function getPlayerSeasonTotals(playerId) {
    const data = await nbaFetch("playerprofilev2", {
        PlayerID: playerId,
    });
    const totals = data.resultSets.find((rs) => rs.name === "SeasonTotalsRegularSeason");
    const rows = totals?.rowSet || [];
    const headers = totals?.headers || [];
    const get = (row, name) => {
        const idx = headers.indexOf(name);
        if (idx === -1)
            return null;
        const val = row[idx];
        if (val === null || val === undefined || val === "")
            return null;
        return Number(val);
    };
    return rows.map((row) => {
        const seasonStr = row[1]; // "2018-19"
        const seasonYear = parseInt(String(seasonStr).slice(0, 4));
        const gp = get(row, "GP") ?? 0;
        return {
            season: seasonYear,
            team: row[3] || "",
            games: gp,
            pts: get(row, "PTS") ?? 0,
            ast: get(row, "AST") ?? 0,
            trb: get(row, "REB") ?? 0,
            stl: get(row, "STL") ?? 0,
            blk: get(row, "BLK") ?? 0,
            fga: get(row, "FGA") ?? 0,
            fta: get(row, "FTA") ?? 0,
            fg3a: get(row, "FG3A") ?? 0,
            ppg: gp ? (get(row, "PTS") ?? 0) / gp : 0,
            apg: gp ? (get(row, "AST") ?? 0) / gp : 0,
            rpg: gp ? (get(row, "REB") ?? 0) / gp : 0,
            spg: gp ? (get(row, "STL") ?? 0) / gp : 0,
            bpg: gp ? (get(row, "BLK") ?? 0) / gp : 0,
        };
    });
}
// import axios from "axios";
// import https from "https";
// import fetch from "node-fetch";
// const BASE = "https://stats.nba.com/stats/";
// async function nbaFetch(endpoint: string, params: Record<string, any>) {
//   const url = BASE + endpoint + "?" + new URLSearchParams(params).toString();
//   const res = await fetch(url, {
//     method: "GET",
//     headers: {
//       "User-Agent":
//         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
//       "Accept-Language": "en-US,en;q=0.9",
//       Accept: "application/json, text/plain, */*",
//       Referer: "https://www.nba.com/",
//       "x-nba-stats-origin": "stats",
//       "x-nba-stats-token": "true",
//       Connection: "keep-alive",
//     },
//   });
//   if (!res.ok) {
//     throw new Error("NBA API error: " + res.status);
//   }
//   return res.json();
// }
// const client = axios.create({
//   baseURL: "https://stats.nba.com/stats/",
//   timeout: 15000,
//   httpsAgent: new https.Agent({ keepAlive: true }),
//   headers: {
//     Host: "stats.nba.com",
//     Connection: "keep-alive",
//     Accept: "application/json, text/plain, */*",
//     "x-nba-stats-origin": "stats",
//     "x-nba-stats-token": "true",
//     "User-Agent":
//       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0",
//     Referer: "https://www.nba.com/",
//     "Accept-Encoding": "gzip, deflate, br",
//   },
// });
// async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
//   const attempts = 3;
//   let lastErr: any;
//   for (let i = 1; i <= attempts; i++) {
//     try {
//       return await fn();
//     } catch (err) {
//       lastErr = err;
//       // ECONNRESET and similar transient network errors—retry with backoff
//       const delay = 500 * i;
//       await new Promise((res) => setTimeout(res, delay));
//       if (i === attempts) {
//         throw new Error(`${label} failed after ${attempts} attempts: ${err}`);
//       }
//     }
//   }
//   throw lastErr;
// }
// export type NbaPlayerMeta = {
//   playerId: number;
//   fullName: string;
//   fromYear: number;
//   toYear: number;
// };
// export async function getAllModernPlayers() {
//   const data = await nbaFetch("commonallplayers", {
//     LeagueID: "00",
//     Season: "2023-24",
//     IsOnlyCurrentSeason: 0,
//   });
//   const rows = data.resultSets[0].rowSet as any[];
//   return rows
//     .map((r) => ({
//       playerId: Number(r[0]),
//       fullName: r[2],
//       fromYear: Number(r[4]),
//       toYear: Number(r[5]),
//     }))
//     .filter((p) => p.toYear >= 1980);
// }
// export async function getPlayerSeasonTotals(playerId: number) {
//   const data = await nbaFetch("playerprofilev2", {
//     PlayerID: playerId,
//   });
//   const totals = data.resultSets.find(
//     (x: any) => x.name === "SeasonTotalsRegularSeason"
//   );
//   const rows = totals?.rowSet || [];
//   const headers = totals?.headers || [];
//   function byField(row: any[], field: string) {
//     const idx = headers.indexOf(field);
//     if (idx === -1) return null;
//     return row[idx];
//   }
//   return rows.map((row: any[]) => {
//     const season = parseInt(String(row[1]).slice(0, 4));
//     return {
//       season,
//       team: row[3] || "",
//       games: byField(row, "GP") ?? 0,
//       pts: byField(row, "PTS") ?? 0,
//       ast: byField(row, "AST") ?? 0,
//       trb: byField(row, "REB") ?? 0,
//       stl: byField(row, "STL") ?? 0,
//       blk: byField(row, "BLK") ?? 0,
//       fga: byField(row, "FGA") ?? 0,
//       fta: byField(row, "FTA") ?? 0,
//       fg3a: byField(row, "FG3A") ?? 0,
//       ppg: (byField(row, "PTS") ?? 0) / (byField(row, "GP") || 1),
//       apg: (byField(row, "AST") ?? 0) / (byField(row, "GP") || 1),
//       rpg: (byField(row, "REB") ?? 0) / (byField(row, "GP") || 1),
//       spg: (byField(row, "STL") ?? 0) / (byField(row, "GP") || 1),
//       bpg: (byField(row, "BLK") ?? 0) / (byField(row, "GP") || 1),
//     };
//   });
// }
//# sourceMappingURL=nbaApi.js.map