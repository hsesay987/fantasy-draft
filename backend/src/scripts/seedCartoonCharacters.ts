import fs from "fs";
import path from "path";
import {
  CartoonGender,
  CartoonCharacter,
  CartoonShow,
} from "@prisma/client";
import prisma from "../lib/prisma";

type CharacterSeed = {
  name: string;
  showName: string;
  gender: CartoonGender;
  isMainCharacter: boolean;
  isSuperhero: boolean;
};

const CHAR_LOOKUP = new Map<string, CharacterSeed>();

function normalizeName(name: string) {
  return name
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .trim();
}

function addCharacters(
  showName: string,
  entries: Array<[string, CartoonGender, boolean?, boolean?]>,
  defaults: { isMainCharacter?: boolean; isSuperhero?: boolean } = {}
) {
  for (const [name, gender, isMainOverride, isSuperheroOverride] of entries) {
    const normalized = normalizeName(name);
    CHAR_LOOKUP.set(normalized, {
      name: normalized,
      showName,
      gender,
      isMainCharacter:
        isMainOverride ?? defaults.isMainCharacter ?? true,
      isSuperhero: isSuperheroOverride ?? defaults.isSuperhero ?? false,
    });
  }
}

/* ---------------------------- CHARACTER GROUPS ---------------------------- */

addCharacters("Rick and Morty", [
  ["Rick Sanchez", "male"],
  ["Morty Smith", "male"],
  ["Summer Smith", "female"],
  ["Beth Smith", "female"],
  ["Jerry Smith", "male"],
]);

addCharacters("The Simpsons", [
  ["Homer Simpson", "male"],
  ["Marge Simpson", "female"],
  ["Bart Simpson", "male"],
  ["Lisa Simpson", "female"],
  ["Maggie Simpson", "female"],
]);

addCharacters("Family Guy", [
  ["Peter Griffin", "male"],
  ["Lois Griffin", "female"],
  ["Stewie Griffin", "male"],
  ["Brian Griffin", "male"],
  ["Meg Griffin", "female"],
  ["Chris Griffin", "male"],
]);

addCharacters("American Dad!", [
  ["Stan Smith", "male"],
  ["Francine Smith", "female"],
  ["Steve Smith", "male"],
  ["Roger Smith", "male"],
  ["Klaus Heissler", "male"],
]);

addCharacters("Futurama", [
  ["Fry", "male"],
  ["Leela", "female"],
  ["Bender", "male"],
  ["Professor Farnsworth", "male"],
  ["Amy Wong", "female"],
  ["Nibbler", "other"],
]);

addCharacters("SpongeBob SquarePants", [
  ["SpongeBob SquarePants", "male"],
  ["Patrick Star", "male"],
  ["Squidward Tentacles", "male"],
  ["Mr. Krabs", "male"],
  ["Sandy Cheeks", "female"],
  ["Plankton", "male"],
  ["Gary the Snail", "male"],
  ["SpongeBob's Bubble Buddy", "other"],
  ["Patrick's Rock", "other", false, false],
  ["Karen (Plankton's Computer Wife)", "female", false, false],
]);

addCharacters("Scooby-Doo, Where Are You!", [
  ["Scooby-Doo", "male"],
  ["Shaggy Rogers", "male"],
  ["Fred Jones", "male"],
  ["Daphne Blake", "female"],
  ["Velma Dinkley", "female"],
  ["Scooby-Dum", "male", false],
]);

addCharacters("Looney Tunes Cartoons", [
  ["Bugs Bunny", "male"],
  ["Daffy Duck", "male"],
  ["Porky Pig", "male"],
  ["Elmer Fudd", "male"],
  ["Yosemite Sam", "male"],
  ["Tweety", "male"],
  ["Sylvester", "male"],
]);

addCharacters("Tom and Jerry", [
  ["Tom", "male"],
  ["Jerry", "male"],
]);

addCharacters("Popeye the Sailor", [
  ["Popeye", "male", true, true],
  ["Olive Oyl", "female"],
  ["Bluto", "male", false, true],
]);

addCharacters("Mickey Mouse", [
  ["Mickey Mouse", "male"],
  ["Donald Duck", "male"],
  ["Goofy", "male"],
  ["Pluto", "male"],
  ["Minnie Mouse", "female"],
]);

addCharacters("DuckTales", [
  ["Scrooge McDuck", "male"],
  ["Huey Duck", "male", true],
  ["Dewey Duck", "male", true],
  ["Louie Duck", "male", true],
]);

addCharacters(
  "Pokemon",
  [
    ["Ash Ketchum", "male"],
    ["Pikachu", "other"],
    ["Misty", "female"],
    ["Brock", "male"],
    ["Charizard", "other"],
  ],
  { isSuperhero: false }
);

addCharacters(
  "Dragon Ball",
  [
    ["Goku", "male", true, true],
    ["Vegeta", "male", true, true],
    ["Gohan", "male", true, true],
    ["Piccolo", "male", true, true],
    ["Frieza", "male", false, true],
  ],
  { isSuperhero: true }
);

addCharacters(
  "Naruto",
  [
    ["Naruto Uzumaki", "male", true, true],
    ["Sasuke Uchiha", "male", true, true],
    ["Sakura Haruno", "female", true, true],
    ["Kakashi Hatake", "male", true, true],
  ],
  { isSuperhero: true }
);

addCharacters(
  "One Piece",
  [
    ["Luffy", "male", true, true],
    ["Zoro", "male", true, true],
    ["Nami", "female", true, true],
    ["Sanji", "male", true, true],
    ["Tony Tony Chopper", "male", true, true],
  ],
  { isSuperhero: true }
);

addCharacters(
  "Batman: The Animated Series",
  [
    ["Batman", "male", true, true],
    ["Joker", "male", false, true],
    ["Robin", "male", true, true],
    ["Harley Quinn", "female", false, true],
  ]
);

addCharacters(
  "Justice League",
  [
    ["Superman", "male", true, true],
    ["Wonder Woman", "female", true, true],
    ["Flash", "male", true, true],
    ["Green Lantern", "male", true, true],
    ["Aquaman", "male", true, true],
  ],
  { isSuperhero: true }
);

addCharacters(
  "Spider-Man",
  [["Spider-Man", "male", true, true]],
  { isSuperhero: true }
);

addCharacters(
  "Avengers Assemble",
  [
    ["Iron Man", "male", true, true],
    ["Captain America", "male", true, true],
    ["Hulk", "male", true, true],
    ["Thor", "male", true, true],
  ],
  { isSuperhero: true }
);

addCharacters(
  "X-Men",
  [
    ["Wolverine", "male", true, true],
    ["Deadpool", "male", false, true],
    ["Professor X", "male", true, true],
    ["Magneto", "male", false, true],
    ["Cyclops", "male", true, true],
    ["Storm", "female", true, true],
  ],
  { isSuperhero: true }
);

addCharacters("Adventure Time", [
  ["Finn the Human", "male"],
  ["Jake the Dog", "male"],
  ["Princess Bubblegum", "female"],
  ["Marceline", "female"],
  ["Ice King", "male"],
]);

addCharacters("Steven Universe", [
  ["Steven Universe", "male"],
  ["Garnet", "female"],
  ["Amethyst", "female"],
  ["Pearl", "female"],
  ["Peridot", "female"],
]);

addCharacters("The Walking Dead (Animated)", [
  ["Rick Grimes (animated)", "male", true, true],
]);

addCharacters("BoJack Horseman", [
  ["BoJack Horseman", "male"],
  ["Todd Chavez", "male"],
  ["Princess Carolyn", "female"],
  ["Mr. Peanutbutter", "male"],
]);

addCharacters("Hilda", [["Hilda", "female"]]);

addCharacters("Bluey", [
  ["Bluey", "female"],
  ["Bingo", "female"],
]);

addCharacters("Peppa Pig", [
  ["Peppa Pig", "female"],
  ["George Pig", "male"],
]);

addCharacters("Caillou", [["Caillou", "male"]]);

addCharacters("Arthur", [
  ["Arthur Read", "male"],
  ["DW Read", "female"],
]);

addCharacters("Franklin", [["Franklin Turtle", "male"]]);

addCharacters("Little Bear", [["Little Bear", "male"]]);

addCharacters("Dora the Explorer", [
  ["Dora the Explorer", "female", true, false],
  ["Boots", "male"],
  ["Swiper", "male", false],
]);

addCharacters("PAW Patrol", [
  ["Paw Patrol Chase", "male", true],
  ["Paw Patrol Marshall", "male", true],
  ["Paw Patrol Skye", "female", true],
]);

addCharacters(
  "Teenage Mutant Ninja Turtles",
  [
    ["TMNT Leonardo", "male", true, true],
    ["TMNT Michelangelo", "male", true, true],
    ["TMNT Donatello", "male", true, true],
    ["TMNT Raphael", "male", true, true],
  ],
  { isSuperhero: true }
);

addCharacters(
  "He-Man and the Masters of the Universe",
  [
    ["He-Man", "male", true, true],
    ["Skeletor", "male", false, true],
  ],
  { isSuperhero: true }
);

addCharacters(
  "She-Ra: Princess of Power",
  [["She-Ra", "female", true, true]],
  { isSuperhero: true }
);

addCharacters(
  "The Powerpuff Girls",
  [
    ["Powerpuff Blossom", "female", true, true],
    ["Powerpuff Bubbles", "female", true, true],
    ["Powerpuff Buttercup", "female", true, true],
  ],
  { isSuperhero: true }
);

addCharacters("Dexter's Laboratory", [
  ["Dexter", "male"],
  ["Dee Dee", "female"],
]);

addCharacters("Johnny Bravo", [["Johnny Bravo", "male"]]);

addCharacters("Courage the Cowardly Dog", [
  ["Courage the Cowardly Dog", "male"],
]);

addCharacters("Ed, Edd n Eddy", [
  ["Ed", "male"],
  ["Edd", "male"],
  ["Eddy", "male"],
]);

addCharacters("The Grim Adventures of Billy & Mandy", [
  ["Grim", "male"],
  ["Billy", "male"],
  ["Mandy", "female"],
]);

addCharacters(
  "Samurai Jack",
  [
    ["Samurai Jack", "male", true, true],
    ["Aku", "male", false, true],
  ],
  { isSuperhero: true }
);

addCharacters(
  "Ben 10 (2005)",
  [
    ["Ben Tennyson", "male", true, true],
    ["Gwen Tennyson", "female", true, true],
    ["Kevin Levin", "male", true, true],
  ],
  { isSuperhero: true }
);

addCharacters(
  "Danny Phantom",
  [
    ["Danny Phantom", "male", true, true],
    ["Danny Fenton", "male", true, true],
  ],
  { isSuperhero: true }
);

addCharacters(
  "Kim Possible",
  [
    ["Kim Possible", "female", true, true],
    ["Ron Stoppable", "male", true, true],
  ],
  { isSuperhero: true }
);

addCharacters(
  "Avatar: The Last Airbender",
  [
    ["Avatar Aang", "male", true, true],
    ["Katara", "female", true, true],
    ["Sokka", "male", true, true],
    ["Toph", "female", true, true],
    ["Zuko", "male", true, true],
  ],
  { isSuperhero: true }
);

addCharacters(
  "The Legend of Korra",
  [["Korra", "female", true, true]],
  { isSuperhero: true }
);

async function main() {
  const characterPath = path.join(
    process.cwd(),
    "data",
    "cartoons",
    "characters.txt"
  );
  const lines = fs
    .readFileSync(characterPath, "utf8")
    .split(/\r?\n/)
    .map(normalizeName)
    .filter(Boolean);

  const shows = await prisma.cartoonShow.findMany();
  const showMap = new Map<string, CartoonShow>();
  for (const show of shows) {
    showMap.set(show.name.toLowerCase(), show);
  }

  const seeds: Omit<CartoonCharacter, "id" | "createdAt">[] = [];

  for (const rawName of lines) {
    const entry = CHAR_LOOKUP.get(rawName);
    if (!entry) {
      throw new Error(`No mapping for character "${rawName}"`);
    }
    const show = showMap.get(entry.showName.toLowerCase());
    if (!show) {
      throw new Error(
        `Show "${entry.showName}" not found for character "${rawName}". Seed shows first.`
      );
    }

    seeds.push({
      name: rawName,
      showId: show.id,
      gender: entry.gender,
      isMainCharacter: entry.isMainCharacter,
      isSuperhero: entry.isSuperhero,
      fitTopPicEligible: true,
    });
  }

  console.log("Clearing existing cartoon characters...");
  await prisma.cartoonDraftPick.deleteMany();
  await prisma.cartoonCharacter.deleteMany();

  console.log(`Seeding ${seeds.length} cartoon characters...`);
  await prisma.cartoonCharacter.createMany({
    data: seeds,
    skipDuplicates: true,
  });

  console.log("✅ Cartoon characters seeded");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
