import { describe, expect, it } from 'vitest';
import { BIOMES, BIOME_IDS } from '../data/biomes/biomes';
import { ANIMAL_CATEGORIES, CATEGORIES, SPECIES, getSpecies, isAnimal, requireSpecies, searchSpecies, speciesByCategory, speciesText, validateSpecies } from '../data/species';
import { ANIMAL_MODELS, getRigDef } from '../entities/wildlife/models';
import { HABITATS, PROFILES } from '../entities/wildlife/profiles';
import { PLANT_META, getPlantGeometry } from '../world/vegetation/plantModels';

describe('species catalog', () => {
  it('holds at least 30 species with unique ids and scientific names', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    expect(new Set(SPECIES.map((s) => s.scientificName)).size).toBe(SPECIES.length);
  });

  it('passes schema validation for every record', () => {
    const errors = SPECIES.flatMap(validateSpecies);
    expect(errors).toEqual([]);
  });

  it('covers every required group', () => {
    for (const cat of ['mammal', 'bird', 'fish', 'insect', 'tree', 'flower', 'fern'] as const) {
      expect(speciesByCategory(cat).length, cat).toBeGreaterThan(0);
    }
    expect(speciesByCategory('reptile').length + speciesByCategory('amphibian').length).toBeGreaterThan(0);
    for (const s of SPECIES) expect(CATEGORIES).toContain(s.category);
  });

  it('only lists habitats that are real biomes', () => {
    for (const s of SPECIES) for (const h of s.habitats) expect(BIOME_IDS, `${s.id}: ${h}`).toContain(h);
  });

  it('never marks a record verified without a source, and flags unverified ones', () => {
    for (const s of SPECIES) {
      if (s.verification.taxonomy === 'verified') expect(s.verification.sources.length, s.id).toBeGreaterThan(0);
      for (const src of s.verification.sources) expect(src.url).toMatch(/^https:\/\//);
    }
  });

  it('rejects a broken record', () => {
    const broken = { ...requireSpecies('rusa-unicolor'), scientificName: 'rusa Unicolor', habitats: [], conservationStatus: 'SAFE' };
    const errors = validateSpecies(broken);
    expect(errors.some((e) => e.includes('binomial'))).toBe(true);
    expect(errors.some((e) => e.includes('habitats'))).toBe(true);
    expect(errors.some((e) => e.includes('IUCN'))).toBe(true);
  });
});

describe('species lookup', () => {
  it('finds species by id and reports unknown ids', () => {
    expect(getSpecies('rusa-unicolor')?.scientificName).toBe('Rusa unicolor');
    expect(getSpecies('nope')).toBeUndefined();
    expect(() => requireSpecies('nope')).toThrow();
  });

  it('searches Vietnamese, English and scientific names', () => {
    expect(searchSpecies('nai').map((s) => s.id)).toContain('rusa-unicolor');
    expect(searchSpecies('kingfisher').map((s) => s.id)).toEqual(['alcedo-atthis']);
    expect(searchSpecies('Cervidae').length).toBe(2);
    expect(searchSpecies('').length).toBe(SPECIES.length);
  });

  it('returns localised text for both languages', () => {
    const s = requireSpecies('buceros-bicornis');
    expect(speciesText.name(s, 'vi')).toBe('Hồng hoàng');
    expect(speciesText.name(s, 'en')).toBe('Great hornbill');
    expect(speciesText.altName(s, 'vi')).toBe('Great hornbill');
    expect(speciesText.adaptations(s, 'vi').length).toBe(speciesText.adaptations(s, 'en').length);
  });
});

describe('species wiring', () => {
  it('gives every animal a model recipe, a behaviour profile and a habitat', () => {
    for (const s of SPECIES.filter(isAnimal)) {
      expect(ANIMAL_MODELS, s.id).toContain(s.model);
      expect(PROFILES[s.id], s.id).toBeDefined();
      expect(HABITATS.some((h) => h.speciesId === s.id), s.id).toBe(true);
      const rig = getRigDef(s.model);
      expect(rig.parts.length).toBeGreaterThan(0);
      expect(rig.radius).toBeGreaterThan(0);
    }
    expect(ANIMAL_CATEGORIES.length).toBe(6);
  });

  it('gives every plant a model and at least one biome where it grows', () => {
    const planted = new Set(BIOME_IDS.flatMap((b) => [...BIOMES[b].trees, ...BIOMES[b].understory].map((r) => r.speciesId)));
    for (const s of SPECIES.filter((x) => !isAnimal(x))) {
      expect(PLANT_META[s.model], s.id).toBeDefined();
      expect(planted.has(s.id), s.id).toBe(true);
      expect(getPlantGeometry(s.model).getAttribute('position').count).toBeGreaterThan(20);
    }
  });

  it('only spawns animals of known species', () => {
    for (const h of HABITATS) expect(getSpecies(h.speciesId), h.speciesId).toBeDefined();
  });
});
