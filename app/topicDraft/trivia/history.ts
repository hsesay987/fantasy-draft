import type { TriviaSet } from "./types";

export const history: TriviaSet = {
  quiz: [
    ["Leaders", 1, "Who was the first President of the United States?", "George Washington", "Abraham Lincoln", "Thomas Jefferson", "John Adams"],
    ["Leaders", 2, "Which French emperor was exiled to Saint Helena?", "Napoleon Bonaparte", "Louis XIV", "Charlemagne", "Charles de Gaulle"],
    ["Leaders", 3, "Who was Britain's Prime Minister for most of World War II?", "Winston Churchill", "Neville Chamberlain", "Clement Attlee", "Margaret Thatcher"],
    ["Leaders", 4, "Which Mongol leader founded the largest contiguous land empire?", "Genghis Khan", "Attila", "Tamerlane", "Suleiman"],
    ["Scientists", 1, "Who developed the theory of relativity?", "Albert Einstein", "Isaac Newton", "Galileo", "Nikola Tesla"],
    ["Scientists", 2, "Who discovered gravity after an apple fell, according to legend?", "Isaac Newton", "Galileo", "Copernicus", "Kepler"],
    ["Scientists", 3, "Who discovered penicillin?", "Alexander Fleming", "Louis Pasteur", "Marie Curie", "Edward Jenner"],
    ["Scientists", 4, "Which scientist won Nobel Prizes in both Physics and Chemistry?", "Marie Curie", "Albert Einstein", "Niels Bohr", "Rosalind Franklin"],
    ["Artists & Thinkers", 1, "Who painted the Mona Lisa?", "Leonardo da Vinci", "Michelangelo", "Raphael", "Van Gogh"],
    ["Artists & Thinkers", 2, "Who wrote Romeo and Juliet?", "William Shakespeare", "Charles Dickens", "Christopher Marlowe", "Geoffrey Chaucer"],
    ["Artists & Thinkers", 3, "Which Greek philosopher taught Alexander the Great?", "Aristotle", "Socrates", "Plato", "Pythagoras"],
    ["Artists & Thinkers", 4, "Which composer wrote the Ninth Symphony while almost completely deaf?", "Ludwig van Beethoven", "Wolfgang Mozart", "Johann Bach", "Franz Schubert"],
    ["Events", 1, "In which year did World War II end?", "1945", "1918", "1939", "1950"],
    ["Events", 2, "Which ship sank in 1912 after hitting an iceberg?", "Titanic", "Lusitania", "Bismarck", "Britannic"],
    ["Events", 3, "Which wall fell in 1989?", "The Berlin Wall", "Hadrian's Wall", "The Great Wall", "The Western Wall"],
    ["Events", 4, "Which battle ended Napoleon's rule in 1815?", "Waterloo", "Austerlitz", "Trafalgar", "Borodino"],
  ],
  surveys: [
    ["Name a famous US president", "George Washington|Abraham Lincoln|Thomas Jefferson|Theodore Roosevelt|John F. Kennedy", "Benjamin Franklin|Alexander Hamilton|Winston Churchill|Napoleon"],
    ["Name a famous scientist", "Albert Einstein|Isaac Newton|Marie Curie|Galileo|Charles Darwin", "Julius Caesar|Napoleon|Cleopatra|Shakespeare"],
    ["Name an ancient Roman figure", "Julius Caesar|Augustus|Nero|Caligula|Marcus Aurelius", "Alexander the Great|Cleopatra|Pericles|Ramses"],
    ["Name a famous painter", "Leonardo da Vinci|Vincent van Gogh|Pablo Picasso|Michelangelo|Claude Monet", "Mozart|Shakespeare|Galileo|Darwin"],
    ["Name a famous explorer", "Christopher Columbus|Marco Polo|Ferdinand Magellan|Neil Armstrong|Amelia Earhart", "Napoleon|Genghis Khan|Cleopatra|Isaac Newton"],
    ["Name a queen or empress", "Cleopatra|Queen Victoria|Elizabeth I|Catherine the Great|Marie Antoinette", "Julius Caesar|Napoleon|Alexander the Great|Genghis Khan"],
  ],
};
