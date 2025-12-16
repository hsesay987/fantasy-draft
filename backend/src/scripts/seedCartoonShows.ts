import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import {
  CartoonAgeRating,
  CartoonCategory,
  CartoonChannel,
} from "@prisma/client";
import prisma from "../lib/prisma";

type RawShowRow = Record<string, string>;

type ShowSeed = {
  name: string;
  channel: CartoonChannel | null;
  category: CartoonCategory;
  ageRating: CartoonAgeRating;
  yearFrom: number;
  yearTo: number | null;
  imdbRating: number | null;
  googleRating: number | null;
};

const DATA_DIR = path.join(process.cwd(), "data", "cartoons");

const curatedOverrides: Record<string, Partial<ShowSeed>> = {
  "Rick and Morty": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.adult,
    channel: CartoonChannel.AdultSwim,
  },
  "The Simpsons": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.adult,
    channel: CartoonChannel.Other,
  },
  "Family Guy": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.adult,
    channel: CartoonChannel.Other,
  },
  "American Dad!": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.adult,
    channel: CartoonChannel.Other,
  },
  Futurama: {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.adult,
    channel: CartoonChannel.Other,
  },
  "BoJack Horseman": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.adult,
    channel: CartoonChannel.Netflix,
  },
  "The Looney Tunes Show": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.kids,
  },
  "Looney Tunes Cartoons": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.kids,
  },
  "Tom and Jerry": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.kids,
  },
  "Tom and Jerry Tales": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.kids,
  },
  "The Tom and Jerry Show": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.kids,
  },
  "SpongeBob SquarePants": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.Nickelodeon,
  },
  "Scooby-Doo, Where Are You!": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.CartoonNetwork,
  },
  "Batman: The Animated Series": {
    category: CartoonCategory.Superhero,
    ageRating: CartoonAgeRating.kids,
  },
  "Justice League": {
    category: CartoonCategory.Superhero,
    ageRating: CartoonAgeRating.kids,
  },
  "Avengers Assemble": {
    category: CartoonCategory.Superhero,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.DisneyXD,
  },
  "X-Men": {
    category: CartoonCategory.Superhero,
    ageRating: CartoonAgeRating.kids,
  },
  "Adventure Time": {
    category: CartoonCategory.Action,
    ageRating: CartoonAgeRating.kids,
  },
  "Steven Universe": {
    category: CartoonCategory.SliceOfLife,
    ageRating: CartoonAgeRating.kids,
  },
  Bluey: {
    category: CartoonCategory.SliceOfLife,
    ageRating: CartoonAgeRating.baby,
    channel: CartoonChannel.Disney,
  },
  "Peppa Pig": {
    category: CartoonCategory.Educational,
    ageRating: CartoonAgeRating.baby,
    channel: CartoonChannel.Nickelodeon,
  },
  Caillou: {
    category: CartoonCategory.Educational,
    ageRating: CartoonAgeRating.baby,
  },
  "Dora the Explorer": {
    category: CartoonCategory.Educational,
    ageRating: CartoonAgeRating.baby,
    channel: CartoonChannel.Nickelodeon,
  },
  Arthur: {
    category: CartoonCategory.Educational,
    ageRating: CartoonAgeRating.kids,
  },
  Franklin: {
    category: CartoonCategory.Educational,
    ageRating: CartoonAgeRating.baby,
  },
  "Little Bear": {
    category: CartoonCategory.SliceOfLife,
    ageRating: CartoonAgeRating.baby,
  },
  "PAW Patrol": {
    category: CartoonCategory.Action,
    ageRating: CartoonAgeRating.baby,
    channel: CartoonChannel.Nickelodeon,
  },
  "Teenage Mutant Ninja Turtles": {
    category: CartoonCategory.Action,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.Nickelodeon,
  },
  "He-Man and the Masters of the Universe": {
    category: CartoonCategory.Action,
    ageRating: CartoonAgeRating.kids,
  },
  "She-Ra: Princess of Power": {
    category: CartoonCategory.Action,
    ageRating: CartoonAgeRating.kids,
  },
  "She-Ra and the Princesses of Power": {
    category: CartoonCategory.Action,
    ageRating: CartoonAgeRating.kids,
  },
  "The Powerpuff Girls": {
    category: CartoonCategory.Superhero,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.CartoonNetwork,
  },
  "Dexter's Laboratory": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.CartoonNetwork,
  },
  "Johnny Bravo": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.CartoonNetwork,
  },
  "Courage the Cowardly Dog": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.CartoonNetwork,
  },
  "Ed, Edd n Eddy": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.CartoonNetwork,
  },
  "The Grim Adventures of Billy & Mandy": {
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.CartoonNetwork,
  },
  "Samurai Jack": {
    category: CartoonCategory.Action,
    ageRating: CartoonAgeRating.kids,
  },
  "Ben 10 (2005)": {
    category: CartoonCategory.Action,
    ageRating: CartoonAgeRating.kids,
  },
  "Danny Phantom": {
    category: CartoonCategory.Superhero,
    ageRating: CartoonAgeRating.kids,
  },
  "Kim Possible": {
    category: CartoonCategory.Action,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.Disney,
  },
  "Avatar: The Last Airbender": {
    category: CartoonCategory.Action,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.Nickelodeon,
  },
  "The Legend of Korra": {
    category: CartoonCategory.Action,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.Nickelodeon,
  },
  Hilda: {
    category: CartoonCategory.SliceOfLife,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.Netflix,
  },
};

const manualShows: ShowSeed[] = [
  {
    name: "Pokemon",
    category: CartoonCategory.AnimeStyle,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.Other,
    yearFrom: 1997,
    yearTo: null,
    imdbRating: 7.5,
    googleRating: null,
  },
  {
    name: "Naruto",
    category: CartoonCategory.AnimeStyle,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.Other,
    yearFrom: 2002,
    yearTo: 2017,
    imdbRating: 8.5,
    googleRating: null,
  },
  {
    name: "One Piece",
    category: CartoonCategory.AnimeStyle,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.Other,
    yearFrom: 1999,
    yearTo: null,
    imdbRating: 9.0,
    googleRating: null,
  },
  {
    name: "Justice League Unlimited",
    category: CartoonCategory.Superhero,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.CartoonNetwork,
    yearFrom: 2004,
    yearTo: 2006,
    imdbRating: 8.7,
    googleRating: null,
  },
  {
    name: "The Walking Dead (Animated)",
    category: CartoonCategory.Action,
    ageRating: CartoonAgeRating.adult,
    channel: CartoonChannel.Other,
    yearFrom: 2010,
    yearTo: 2022,
    imdbRating: 8.0,
    googleRating: null,
  },
  {
    name: "DuckTales",
    category: CartoonCategory.Action,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.Disney,
    yearFrom: 1987,
    yearTo: 1990,
    imdbRating: 8.2,
    googleRating: null,
  },
  {
    name: "Tom and Jerry",
    category: CartoonCategory.Comedy,
    ageRating: CartoonAgeRating.kids,
    channel: CartoonChannel.Other,
    yearFrom: 1940,
    yearTo: 1967,
    imdbRating: 8.0,
    googleRating: null,
  },
];

function readCsv(file: string) {
  const content = fs.readFileSync(path.join(DATA_DIR, file));
  return parse(content, { columns: true, skip_empty_lines: true }) as RawShowRow[];
}

function parseYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeChannel(raw: string | undefined): CartoonChannel | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("adult swim")) return CartoonChannel.AdultSwim;
  if (lower.includes("disney xd")) return CartoonChannel.DisneyXD;
  if (lower.includes("disney")) return CartoonChannel.Disney;
  if (lower.includes("nick")) return CartoonChannel.Nickelodeon;
  if (lower.includes("cartoon network")) return CartoonChannel.CartoonNetwork;
  if (lower.includes("netflix")) return CartoonChannel.Netflix;
  if (lower.trim()) return CartoonChannel.Other;
  return null;
}

function inferCategory(name: string): CartoonCategory {
  const lower = name.toLowerCase();
  if (
    lower.includes("batman") ||
    lower.includes("superman") ||
    lower.includes("spider-man") ||
    lower.includes("avenger") ||
    lower.includes("justice league") ||
    lower.includes("x-men") ||
    lower.includes("powerpuff") ||
    lower.includes("ben 10") ||
    lower.includes("green lantern")
  ) {
    return CartoonCategory.Superhero;
  }
  if (
    lower.includes("dragon ball") ||
    lower.includes("naruto") ||
    lower.includes("one piece") ||
    lower.includes("anime")
  ) {
    return CartoonCategory.AnimeStyle;
  }
  if (
    lower.includes("samurai") ||
    lower.includes("ninja") ||
    lower.includes("adventure") ||
    lower.includes("quest") ||
    lower.includes("sword") ||
    lower.includes("korra")
  ) {
    return CartoonCategory.Action;
  }
  if (
    lower.includes("school") ||
    lower.includes("learn") ||
    lower.includes("explorer")
  ) {
    return CartoonCategory.Educational;
  }
  if (lower.includes("family") || lower.includes("life")) {
    return CartoonCategory.SliceOfLife;
  }
  return CartoonCategory.Comedy;
}

function inferAgeRating(
  name: string,
  rawChannel: string | undefined,
  channel: CartoonChannel | null
): CartoonAgeRating {
  const lower = name.toLowerCase();
  if (
    lower.includes("rick and morty") ||
    lower.includes("bojack") ||
    lower.includes("family guy") ||
    lower.includes("american dad") ||
    lower.includes("dead") ||
    (rawChannel && rawChannel.toLowerCase().includes("adult")) ||
    channel === CartoonChannel.AdultSwim
  ) {
    return CartoonAgeRating.adult;
  }
  if (
    lower.includes("baby") ||
    lower.includes("bluey") ||
    lower.includes("peppa") ||
    lower.includes("caillou") ||
    lower.includes("paw patrol") ||
    lower.includes("little bear") ||
    lower.includes("franklin") ||
    (rawChannel && rawChannel.toLowerCase().includes("junior"))
  ) {
    return CartoonAgeRating.baby;
  }
  return CartoonAgeRating.kids;
}

async function main() {
  const shows = new Map<string, ShowSeed>();
  const files = [
    "1948 - 1986.csv",
    "1987 - 2022.csv",
    "2023.csv",
  ];

  for (const file of files) {
    const rows = readCsv(file);
    for (const row of rows) {
      const title = (row["Title"] || "").trim();
      if (!title) continue;

      const key = title.toLowerCase();
      const rawChannel =
        row["Original Channel"] ||
        row["Original channel"] ||
        row["Original Channel "] ||
        row["Original channel "] ||
        "";

      const channel =
        curatedOverrides[title]?.channel ?? normalizeChannel(rawChannel);
      const yearFrom =
        parseYear(row["Premiere Year"]) ?? parseYear(row["Year"]) ?? null;
      if (!yearFrom) continue;
      const yearTo =
        parseYear(row["Final Year"]) ??
        parseYear(row["Final year"]) ??
        parseYear(row["Year"]) ??
        null;

      const category =
        curatedOverrides[title]?.category ?? inferCategory(title);
      const ageRating =
        curatedOverrides[title]?.ageRating ??
        inferAgeRating(title, rawChannel, channel);

      const next: ShowSeed = {
        name: title,
        channel,
        category,
        ageRating,
        yearFrom,
        yearTo,
        imdbRating: curatedOverrides[title]?.imdbRating ?? null,
        googleRating: curatedOverrides[title]?.googleRating ?? null,
      };

      const existing = shows.get(key);
      if (existing) {
        existing.yearFrom = Math.min(existing.yearFrom, next.yearFrom);
        existing.yearTo = existing.yearTo ?? next.yearTo ?? null;
        if (next.yearTo) {
          existing.yearTo = Math.max(existing.yearTo ?? next.yearTo, next.yearTo);
        }
        existing.channel = existing.channel ?? next.channel;
        existing.imdbRating = existing.imdbRating ?? next.imdbRating;
        existing.googleRating = existing.googleRating ?? next.googleRating;
      } else {
        shows.set(key, next);
      }
    }
  }

  for (const manual of manualShows) {
    const key = manual.name.toLowerCase();
    const existing = shows.get(key);
    if (existing) {
      shows.set(key, { ...existing, ...manual });
    } else {
      shows.set(key, manual);
    }
  }

  const seeds = Array.from(shows.values());

  console.log(`Seeding ${seeds.length} cartoon shows...`);
  await prisma.cartoonShow.createMany({
    data: seeds,
    skipDuplicates: true,
  });

  console.log("✅ Cartoon shows seeded");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
