/**
 * Data-driven biome configuration. Adding a biome or changing which species grow
 * where is a data edit here; the placement and rendering code reads this table.
 */

export const BIOME_IDS = ['grassland', 'rainforest', 'freshwater', 'mountain', 'ruins'] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

export interface PlantRule {
  speciesId: string;
  weight: number;
  /** Allowed ground height range relative to water level (m). */
  minH?: number;
  maxH?: number;
  /** Upper limit for terrain steepness (0 flat .. 1 vertical). */
  maxSlope?: number;
}

export interface BiomeDef {
  id: BiomeId;
  /** Map colour (CSS). */
  mapColor: string;
  /** Probability that an 8 m tree cell holds a tree. */
  treeDensity: number;
  trees: PlantRule[];
  /** Probability that a 4 m understory cell holds a plant. */
  understoryDensity: number;
  understory: PlantRule[];
  rockDensity: number;
  /** Decorative grass coverage 0..1. */
  grass: number;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  grassland: {
    id: 'grassland',
    mapColor: '#9dbb5f',
    treeDensity: 0.035,
    trees: [{ speciesId: 'bombax-ceiba', weight: 1, minH: 1.2 }],
    understoryDensity: 0.14,
    understory: [
      { speciesId: 'imperata-cylindrica', weight: 5, minH: 0.8 },
      { speciesId: 'melastoma-malabathricum', weight: 2.2, minH: 0.8 },
    ],
    rockDensity: 0.03,
    grass: 1,
  },
  rainforest: {
    id: 'rainforest',
    mapColor: '#2f6b3a',
    treeDensity: 0.62,
    trees: [
      { speciesId: 'dipterocarpus-alatus', weight: 5, minH: 1.2 },
      { speciesId: 'caryota-mitis', weight: 2, minH: 1.2 },
      { speciesId: 'bambusa-vulgaris', weight: 1.2, minH: 1.2 },
    ],
    understoryDensity: 0.3,
    understory: [
      { speciesId: 'dicranopteris-linearis', weight: 4, minH: 0.8 },
      { speciesId: 'alocasia-macrorrhizos', weight: 2, minH: 0.8 },
      { speciesId: 'asplenium-nidus', weight: 1.5, minH: 0.8 },
      { speciesId: 'melastoma-malabathricum', weight: 0.5, minH: 0.8 },
    ],
    rockDensity: 0.12,
    grass: 0.25,
  },
  freshwater: {
    id: 'freshwater',
    mapColor: '#4c9bc4',
    treeDensity: 0.14,
    trees: [
      { speciesId: 'bambusa-vulgaris', weight: 2, minH: 0.9 },
      { speciesId: 'caryota-mitis', weight: 1, minH: 0.9 },
    ],
    understoryDensity: 0.3,
    understory: [
      { speciesId: 'colocasia-esculenta', weight: 5, minH: -0.05, maxH: 0.75 },
      { speciesId: 'nelumbo-nucifera', weight: 5, minH: -1.5, maxH: -0.3, maxSlope: 0.5 },
      { speciesId: 'imperata-cylindrica', weight: 2, minH: 0.9 },
    ],
    rockDensity: 0.1,
    grass: 0.5,
  },
  mountain: {
    id: 'mountain',
    mapColor: '#8d8a7c',
    treeDensity: 0.3,
    trees: [{ speciesId: 'pinus-kesiya', weight: 1, minH: 1.2, maxSlope: 0.72 }],
    understoryDensity: 0.12,
    understory: [
      { speciesId: 'rhododendron-simsii', weight: 3, minH: 1 },
      { speciesId: 'dicranopteris-linearis', weight: 1.4, minH: 1 },
      { speciesId: 'imperata-cylindrica', weight: 1, minH: 1 },
    ],
    rockDensity: 0.4,
    grass: 0.35,
  },
  ruins: {
    id: 'ruins',
    mapColor: '#6f7d58',
    treeDensity: 0.6,
    trees: [
      { speciesId: 'dipterocarpus-alatus', weight: 3, minH: 1.2 },
      { speciesId: 'ficus-religiosa', weight: 1.6, minH: 1.2 },
      { speciesId: 'caryota-mitis', weight: 1.5, minH: 1.2 },
    ],
    understoryDensity: 0.34,
    understory: [
      { speciesId: 'asplenium-nidus', weight: 3, minH: 0.8 },
      { speciesId: 'dicranopteris-linearis', weight: 2, minH: 0.8 },
      { speciesId: 'alocasia-macrorrhizos', weight: 2, minH: 0.8 },
    ],
    rockDensity: 0.2,
    grass: 0.2,
  },
};

export const biomeIndex = (id: BiomeId): number => BIOME_IDS.indexOf(id);
