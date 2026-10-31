/*
 * What the app knows about each seed opportunity beyond the feed shape (SPEC § 4.2 columns that
 * the feed does not carry): format, team rule, skill tags for the fit score, structured
 * eligibility rules for the verdict, and the prestige weight. Unknown ids get the defaults.
 */

export type Format = 'online' | 'inPerson' | 'residential';
export type Team = 'solo' | 'team' | 'either';

export interface EligibilityRules {
  minAge?: number;
  maxAge?: number;
  /** Day the age counts on: "YYYY-MM-DD", or the main deadline when absent. */
  ageOn?: string;
  birthYears?: [number, number];
  grades?: number[]; // US-equivalent grades allowed now
}

export interface Extras {
  format: Format;
  team: Team;
  /** robotics, physics, cs, mathModeling, math, water, entrepreneurship, writing, research, frostpure, tagylym, visa */
  tags: string[];
  rules?: EligibilityRules;
  weight: number; // prestige 0–100, user-editable later
}

const X = (format: Format, team: Team, tags: string[], weight: number, rules?: EligibilityRules): Extras => ({ format, team, tags, weight, rules });

export const EXTRAS: Record<string, Extras> = {
  'himcm-2026': X('online', 'team', ['mathModeling', 'math'], 65),
  'amc-2026-27': X('inPerson', 'solo', ['math'], 70, { minAge: 13 }),
  'lumiere-winter-2026': X('online', 'solo', ['research'], 40),
  'physics-brawl-2026': X('online', 'team', ['physics'], 45),
  'cern-bl4s-2027': X('online', 'team', ['physics', 'research'], 75),
  'rsi-2027': X('residential', 'solo', ['research', 'physics', 'math', 'visa'], 100, { grades: [9, 10, 11] }),
  'ucsb-sra-2027': X('residential', 'solo', ['research', 'visa'], 55, { minAge: 14, maxAge: 17, grades: [9, 10, 11] }),
  'usaco-2026-27': X('online', 'solo', ['cs'], 70),
  'yygs-2027': X('residential', 'solo', ['research', 'writing', 'visa'], 85, { minAge: 16, maxAge: 18, ageOn: '2027-07-18', grades: [10, 11] }),
  'conrad-2026-27': X('online', 'team', ['frostpure', 'water', 'entrepreneurship', 'research'], 80, { minAge: 13, maxAge: 18 }),
  'imagine-cup-2027': X('online', 'team', ['cs', 'entrepreneurship'], 60, { minAge: 18 }),
  'earth-prize-2027': X('online', 'either', ['frostpure', 'water', 'entrepreneurship'], 75, { birthYears: [2007, 2014] }),
  'diamond-2027': X('online', 'team', ['frostpure', 'entrepreneurship'], 70, { minAge: 14, maxAge: 18 }),
  'rise-2027': X('online', 'solo', ['entrepreneurship', 'writing'], 75, { minAge: 15, maxAge: 17 }),
  'ssp-2027': X('residential', 'team', ['research', 'physics', 'visa'], 85),
  'kz-water-prize-2027': X('inPerson', 'either', ['frostpure', 'water', 'research'], 70, { minAge: 14, maxAge: 18 }),
  'im2c-2027': X('online', 'team', ['mathModeling', 'math'], 60),
  'sumac-2027': X('residential', 'solo', ['math', 'visa'], 85, { minAge: 15, grades: [10, 11] }),
  'aime-2027': X('inPerson', 'solo', ['math'], 70, { minAge: 13 }),
  'gmu-assip-2027': X('inPerson', 'solo', ['research', 'visa'], 55, { minAge: 15 }),
  'texas-hsmc-2027': X('residential', 'solo', ['math', 'visa'], 55, { grades: [9, 10, 11] }),
  'blue-ocean-2027': X('online', 'either', ['frostpure', 'entrepreneurship'], 55, { minAge: 14, maxAge: 18 }),
  'mathcamp-2027': X('residential', 'solo', ['math', 'visa'], 80, { minAge: 13, maxAge: 18 }),
  'promys-2027': X('residential', 'solo', ['math', 'visa'], 85),
  'genius-2027': X('online', 'either', ['frostpure', 'water', 'research', 'writing'], 60, { grades: [8, 9, 10, 11, 12] }),
  'swb-challenge-2027': X('online', 'solo', ['writing'], 30),
  'samsung-sft-kz-2027': X('online', 'team', ['frostpure', 'water', 'robotics', 'entrepreneurship'], 60, { maxAge: 17 }),
  'ross-2027': X('residential', 'solo', ['math', 'visa'], 85),
  'ichc-2027': X('online', 'solo', ['research'], 40),
  'pioneer-2027': X('online', 'solo', ['research', 'writing'], 50, { grades: [9, 10, 11, 12] }),
  'picoctf-2027': X('online', 'team', ['cs'], 45),
  'lumiere-summer-2027': X('online', 'solo', ['research'], 40),
  'ucsc-sip-2027': X('inPerson', 'solo', ['research', 'visa'], 55, { minAge: 14, maxAge: 17 }),
  'garcia-2027': X('inPerson', 'solo', ['research', 'visa'], 70, { minAge: 16, ageOn: '2027-07-04' }),
  'iaac-2027': X('online', 'solo', ['physics'], 40, { maxAge: 18 }),
  'hcssim-2027': X('residential', 'solo', ['math', 'visa'], 70, { grades: [9, 10, 11] }),
  'purple-comet-2027': X('online', 'team', ['math'], 35),
  'cty-2027': X('online', 'solo', ['math'], 40),
  'collegeadvisor-2027': X('online', 'solo', ['writing'], 40, { grades: [11] }),
  'bow-seat-2027': X('online', 'solo', ['writing', 'water'], 45, { minAge: 11, maxAge: 18 }),
  'yau-asia-2027': X('online', 'team', ['frostpure', 'research', 'math'], 80),
  'zayed-2027': X('online', 'team', ['frostpure', 'water', 'entrepreneurship'], 60),
  'yau-global-2027': X('online', 'team', ['frostpure', 'research', 'math'], 80),
  'wharton-2027': X('online', 'team', ['entrepreneurship'], 50),
  'hmmt-2027': X('inPerson', 'team', ['math', 'visa'], 40),
  'breakthrough-2027': X('online', 'solo', ['physics', 'writing'], 80, { minAge: 13, maxAge: 18 }),
  'iymc-2027': X('online', 'solo', ['math'], 35),
  'stamps-2027-28': X('inPerson', 'solo', ['writing'], 90),
  'jefferson-2027-28': X('inPerson', 'solo', ['writing'], 90),
  'educationusa-ofp': X('inPerson', 'solo', ['writing'], 70),
  'project-access': X('online', 'solo', ['writing'], 40),
  'kz-science-fairs': X('inPerson', 'either', ['frostpure', 'research'], 50),
  'isef-2027': X('inPerson', 'either', ['frostpure', 'research', 'water'], 95),
  'kz-republican-olympiads-2027': X('inPerson', 'solo', ['physics', 'math'], 80),
  'launchx-2027': X('online', 'team', ['entrepreneurship'], 50),
};

export const DEFAULT_EXTRAS: Extras = { format: 'online', team: 'either', tags: [], weight: 50 };
export const extrasFor = (id: string): Extras => EXTRAS[id] ?? DEFAULT_EXTRAS;

/** Ids of the seed rows the Claude scheduled task should keep under watch. */
export const SEED_IDS = Object.keys(EXTRAS);
