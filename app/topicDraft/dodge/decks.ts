// Dodge's category decks. Every category is everyday and has a few obvious first answers, so the room can guess what
// the chosen player will say and try not to say it. Nothing here is secret: phones show each category as it comes up.

export type DodgeDeck = { id: string; title: string; blurb: string; categories: string[] };

export const DODGE_DECKS: DodgeDeck[] = [
  {
    id: "food", title: "Food and drink", blurb: "Toppings, snacks, drinks and what's for dinner.",
    categories: [
      "Pizza toppings", "Breakfast cereals", "Things in a fridge", "Fruits", "Vegetables", "Sandwich fillings",
      "Ice cream flavors", "Fast food chains", "Sodas", "Things you put on toast", "Candy bars", "Hot drinks",
      "Salad toppings", "Cheeses", "Sauces", "Breakfast foods", "Desserts", "Burger toppings", "Nuts", "Cocktails",
      "Red fruits", "Yellow foods", "Things you put in coffee", "Pasta shapes", "Soups", "Cookies",
      "Movie theater snacks", "Spices", "Things at a barbecue", "Herbs", "Juice flavors", "Donut toppings",
      "Kinds of bread", "Potato chip flavors", "Pies", "Seafood", "Cake flavors", "Berries", "Things in a lunchbox",
      "Pizza chains",
    ],
  },
  {
    id: "home", title: "Around the house", blurb: "Rooms, kitchen drawers, bathroom shelves.",
    categories: [
      "Rooms in a house", "Things in a kitchen drawer", "Things in a bathroom", "Furniture", "Things in a bedroom",
      "Kitchen appliances", "Cleaning products", "Things under the sink", "Things in a backyard", "Things in a garage",
      "Things on a desk", "Things in a purse", "Things in a wallet", "Things you find in a couch",
      "Things with a remote control", "Things that beep", "Things you charge every night", "Things in a medicine cabinet",
      "Things you hang on a wall", "Things in a toolbox", "Things on a bed", "Things people always lose",
      "Things in a junk drawer", "Things you recycle", "Things in a laundry basket", "Things in a pantry",
      "Things on a kitchen counter", "Things in a freezer", "Things in a living room",
    ],
  },
  {
    id: "everyday", title: "Everyday", blurb: "Colors, clothes, school and the rest of life.",
    categories: [
      "Colors", "Days of the week", "Months of the year", "Kinds of shoes", "Hats", "Jobs in a hospital",
      "School subjects", "Shapes", "Things that are round", "Things that are red", "Things that are cold",
      "Things that are hot", "Things that are sticky", "Things that smell nice", "Things that smell bad",
      "Things in a school backpack", "Things in a classroom", "Musical instruments", "Things with wheels", "Body parts",
      "Things you can be allergic to", "Things that make you sneeze", "Things at a birthday party",
      "Things people are scared of", "Things at a wedding", "Things in a pencil case", "Clothes", "Jewelry",
      "Things in a makeup bag", "Car brands", "Things with a screen", "Things in an office", "Holidays",
      "Things at a doctor's office", "Things with keys", "Phone brands",
    ],
  },
  {
    id: "popculture", title: "Pop culture", blurb: "Movies, songs, superheroes and famous faces.",
    categories: [
      "Superheroes", "Disney movies", "Cartoon characters", "Disney princesses", "Harry Potter characters",
      "Video games", "Social media apps", "Famous singers", "TV shows everyone has seen", "Movie villains",
      "Star Wars characters", "Famous movie dogs", "Pixar movies", "Christmas movies", "Horror movie monsters",
      "Fairy tale characters", "Nursery rhymes", "Famous bands", "Streaming services", "Things a pirate has",
      "Things a superhero wears", "Famous detectives", "Toys", "Fictional bears", "Mario characters", "Pokémon",
      "Famous robots", "Christmas songs", "Famous mice", "Halloween costumes", "Simpsons characters",
      "Sesame Street characters", "Shrek characters", "Cartoon cats",
    ],
  },
  {
    id: "nature", title: "Animals and nature", blurb: "Pets, farm animals, weather and the outdoors.",
    categories: [
      "Pets", "Farm animals", "Zoo animals", "Sea creatures", "Birds", "Insects", "Animals with stripes",
      "Animals that hop", "Big cats", "Things in the sky", "Weather", "Flowers", "Trees", "Things at the beach",
      "Things in a forest", "Things that fly", "Things that sting", "Things in space", "Planets", "Slow animals",
      "Pink animals", "Animals with shells", "Things in a pond", "Things that bite", "Dog breeds", "Reptiles",
      "Australian animals", "Jungle animals", "Desert animals", "Nocturnal animals", "Kinds of fish", "Gemstones",
    ],
  },
  {
    id: "sport", title: "Sports and games", blurb: "Ball sports, board games, things in a gym.",
    categories: [
      "Sports with a ball", "Things in a gym", "Playground games", "Water sports", "Winter sports",
      "Things a referee has", "Sports played with a racket", "Things you throw", "Things you kick", "Party games",
      "Things at a carnival", "Camping gear", "Things in a gym bag", "Lawn games", "Things you can ride", "Board games",
      "Card games", "Monopoly pieces", "Chess pieces", "Martial arts", "Gym exercises", "Track and field events",
      "Things at a stadium", "Things at a bowling alley",
    ],
  },
  {
    id: "places", title: "Places and travel", blurb: "Countries, cities, stores and how to get there.",
    categories: [
      "Countries in Europe", "Capital cities", "Things at an airport", "Kinds of boats", "Stores at a mall",
      "Places in a town", "Famous landmarks", "Things in a hotel room", "Things at a train station", "Things on a plane",
      "Things in a car", "Languages", "Things at a gas station", "Things in a supermarket", "Things at a hospital",
      "Places you have to be quiet", "Things at a movie theater", "Islands", "Things you pack in a suitcase", "US states",
      "Countries in Asia", "Countries in South America", "Things in a park", "Things in a library",
      "Things at a restaurant", "Big US cities",
    ],
  },
];

export const DODGE_DECK_IDS: string[] = DODGE_DECKS.map((d) => d.id);

export const dodgeDeckOf = (id: string): DodgeDeck | undefined => DODGE_DECKS.find((d) => d.id === id);

/** What a room's `seen` list keeps for a category, so a rematch deals new ones first. */
export const categoryKey = (text: string): string => `dg:${text.toLowerCase()}`;
