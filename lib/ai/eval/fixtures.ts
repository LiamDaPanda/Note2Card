/**
 * Evaluation fixtures.
 *
 * Each case is a piece of study material plus what a good card set must and must
 * not contain. These exist to answer one question with evidence rather than
 * hope: can a cheaper model take over the generation stage without the cards
 * getting worse?
 *
 * `mustCover` are concepts the set is expected to test in some wording.
 * `mustNotClaim` are facts absent from the material — if they appear, the model
 * is drawing on its own knowledge instead of the student's notes, which is the
 * single worst failure mode here.
 */
export interface EvalCase {
  id: string;
  subject: string;
  source: string;
  mustCover: string[][];
  mustNotClaim: string[];
}

export const CASES: EvalCase[] = [
  {
    id: "bio-photosynthesis",
    subject: "Biology",
    source: `Photosynthesis converts light energy into chemical energy in plants.
The light-dependent reactions take place in the thylakoid membrane and produce ATP and NADPH.
The Calvin cycle takes place in the stroma and fixes carbon dioxide into glucose.
Chlorophyll absorbs light most strongly in the blue and red parts of the spectrum, which is why leaves appear green.`,
    mustCover: [
      ["thylakoid"],
      ["calvin", "stroma"],
      ["chlorophyll"],
    ],
    // Real photosynthesis facts that this passage never states.
    mustNotClaim: ["rubisco", "photosystem ii", "6co2", "c4"],
  },
  {
    id: "chem-bonding",
    subject: "Chemistry",
    source: `Ionic bonds form when electrons transfer from a metal to a non-metal, creating oppositely charged ions.
Covalent bonds form when two non-metals share a pair of electrons.
Metallic bonding involves a lattice of positive ions in a sea of delocalised electrons, which is why metals conduct electricity.
Electronegativity is the tendency of an atom to attract a shared pair of electrons.`,
    mustCover: [
      ["ionic"],
      ["covalent"],
      ["delocalis", "delocaliz", "sea of electrons"],
      ["electronegativity"],
    ],
    mustNotClaim: ["pauling", "hydrogen bond", "van der waals"],
  },
  {
    id: "history-causes",
    subject: "History",
    source: `Four long-term causes of the First World War are usually given as militarism, alliances, imperialism and nationalism.
The alliance system divided Europe into the Triple Entente and the Triple Alliance.
The immediate trigger was the assassination of Archduke Franz Ferdinand in Sarajevo in June 1914.
Germany's Schlieffen Plan aimed to defeat France quickly before turning east against Russia.`,
    mustCover: [
      ["militarism", "nationalism", "imperialism"],
      ["franz ferdinand", "sarajevo"],
      ["schlieffen"],
    ],
    mustNotClaim: ["treaty of versailles", "lusitania", "trench foot"],
  },
  {
    id: "ocr-damaged",
    subject: "Biology (scanned)",
    source: `The rnitochondria is the site of aerobic respiration in the cell.
Glycolysis occurs in the cytoplasm and produces two molecules of pyruvate.
The [unclear] cycle occurs in the mitochondrial matrix.
ATP is the main energy [unclear] of the cell.`,
    mustCover: [["glycolysis"], ["pyruvate", "cytoplasm"]],
    // "Krebs" is the obvious completion of the redacted word — filling it in is
    // exactly the confident invention the prompt forbids.
    mustNotClaim: ["krebs", "citric acid cycle"],
  },
  {
    id: "sparse",
    subject: "Minimal material",
    source: `Osmosis is the movement of water across a semi-permeable membrane.`,
    mustCover: [["osmosis"]],
    mustNotClaim: ["hypertonic", "hypotonic", "turgor"],
  },
];
