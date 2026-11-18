import type { SpeciesRecord } from './index';

/**
 * Anatomy notes are general, well-established features of the organism's group
 * (class level), never invented per-species detail. Species-specific facts are
 * listed separately from the species record.
 */
const ANATOMY: Record<string, readonly string[]> = {
  mammal: ['head', 'limbs', 'body', 'tail'],
  bird: ['head', 'wings', 'limbs', 'tail'],
  fish: ['head', 'fins', 'body', 'tail'],
  reptile: ['head', 'limbs', 'body', 'tail'],
  amphibian: ['head', 'limbs', 'body', 'tail'],
  insect: ['head', 'wings', 'limbs', 'body'],
  plant: ['leaves', 'reproduction', 'stem', 'roots'],
  fern: ['fronds', 'reproduction', 'stem', 'roots'],
};

export function anatomyNotes(species: SpeciesRecord): { part: string; note: string }[] {
  const group = species.category in ANATOMY ? species.category : 'plant';
  return ANATOMY[group]!.map((part) => ({ part: `inspect.part.${part}`, note: `inspect.note.${group}.${part}` }));
}
