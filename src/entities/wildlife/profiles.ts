/**
 * Species-specific behaviour parameters and spawn groups. Adding an animal is
 * data: a catalog entry, a profile here, a habitat group and a model recipe.
 */
import type { SpeciesProfile } from './types';

export const PROFILES: Record<string, SpeciesProfile> = {
  'rusa-unicolor': { cls: 'walker', locomotion: 'walk', walkSpeed: 1.3, runSpeed: 9.5, awareness: 30, fleeDistance: 11, activity: 'crepuscular', drinks: true, callInterval: [40, 90], voice: 'honk' },
  'muntiacus-vaginalis': { cls: 'walker', locomotion: 'walk', walkSpeed: 1.0, runSpeed: 8, awareness: 24, fleeDistance: 10, activity: 'crepuscular', drinks: true, callInterval: [35, 80], voice: 'bark' },
  'sus-scrofa': { cls: 'walker', locomotion: 'walk', walkSpeed: 1.2, runSpeed: 8.5, awareness: 20, fleeDistance: 8, activity: 'crepuscular', drinks: true },
  'lepus-peguensis': { cls: 'walker', locomotion: 'hop', walkSpeed: 1.6, runSpeed: 11, awareness: 16, fleeDistance: 7, activity: 'crepuscular' },
  'callosciurus-erythraeus': { cls: 'walker', locomotion: 'hop', walkSpeed: 1.8, runSpeed: 6, awareness: 12, fleeDistance: 5, activity: 'diurnal', callInterval: [25, 60], voice: 'chatter' },
  'gallus-gallus': { cls: 'walker', locomotion: 'walk', walkSpeed: 0.9, runSpeed: 5.5, awareness: 18, fleeDistance: 7, activity: 'diurnal', callInterval: [30, 70], voice: 'crow' },
  'alcedo-atthis': { cls: 'bird', locomotion: 'fly', walkSpeed: 9, runSpeed: 13, awareness: 18, fleeDistance: 7, activity: 'diurnal', perch: 'waterside', flightHeight: 1.2, callInterval: [18, 40], voice: 'whistle' },
  'egretta-garzetta': { cls: 'bird', locomotion: 'wade', walkSpeed: 8, runSpeed: 11, awareness: 26, fleeDistance: 10, activity: 'diurnal', perch: 'shallows', flightHeight: 6 },
  'pycnonotus-jocosus': { cls: 'bird', locomotion: 'fly', walkSpeed: 7, runSpeed: 10, awareness: 14, fleeDistance: 5, activity: 'diurnal', perch: 'tree', flightHeight: 4, callInterval: [8, 22], voice: 'whistle' },
  'buceros-bicornis': { cls: 'bird', locomotion: 'fly', walkSpeed: 10, runSpeed: 13, awareness: 30, fleeDistance: 12, activity: 'diurnal', perch: 'tree', flightHeight: 10, callInterval: [30, 70], voice: 'honk' },
  'spilornis-cheela': { cls: 'soarer', locomotion: 'soar', walkSpeed: 11, runSpeed: 11, awareness: 0, fleeDistance: 0, activity: 'diurnal', flightHeight: 60, callInterval: [20, 45], voice: 'whistle' },
  'channa-striata': { cls: 'fish', locomotion: 'swim', walkSpeed: 0.35, runSpeed: 3.2, awareness: 6, fleeDistance: 3.5, activity: 'crepuscular', swimDepth: 0.8 },
  'barbonymus-gonionotus': { cls: 'fish', locomotion: 'swim', walkSpeed: 0.8, runSpeed: 3.6, awareness: 7, fleeDistance: 4.5, activity: 'diurnal', swimDepth: 0.55 },
  'trichopodus-trichopterus': { cls: 'fish', locomotion: 'swim', walkSpeed: 0.3, runSpeed: 2.2, awareness: 5, fleeDistance: 3, activity: 'diurnal', swimDepth: 0.25 },
  'calotes-versicolor': { cls: 'walker', locomotion: 'crawl', walkSpeed: 0.7, runSpeed: 4.5, awareness: 9, fleeDistance: 3.5, activity: 'diurnal' },
  'physignathus-cocincinus': { cls: 'walker', locomotion: 'crawl', walkSpeed: 0.6, runSpeed: 5, awareness: 11, fleeDistance: 4.5, activity: 'diurnal' },
  'duttaphrynus-melanostictus': { cls: 'walker', locomotion: 'hop', walkSpeed: 0.35, runSpeed: 1.4, awareness: 4, fleeDistance: 1.6, activity: 'nocturnal', callInterval: [25, 60], voice: 'croak' },
  'papilio-demoleus': { cls: 'insect', locomotion: 'fly', walkSpeed: 2.2, runSpeed: 3.5, awareness: 4, fleeDistance: 1.8, activity: 'diurnal', flightHeight: 1.1 },
  'danaus-genutia': { cls: 'insect', locomotion: 'fly', walkSpeed: 1.2, runSpeed: 2.4, awareness: 3, fleeDistance: 1.4, activity: 'diurnal', flightHeight: 1.0 },
  'apis-cerana': { cls: 'insect', locomotion: 'fly', walkSpeed: 2.6, runSpeed: 3.5, awareness: 2, fleeDistance: 0.8, activity: 'diurnal', flightHeight: 0.8, voice: 'buzz' },
  'crocothemis-servilia': { cls: 'insect', locomotion: 'fly', walkSpeed: 3.2, runSpeed: 5, awareness: 4, fleeDistance: 1.8, activity: 'diurnal', flightHeight: 0.8 },
  'xylotrupes-gideon': { cls: 'walker', locomotion: 'crawl', walkSpeed: 0.06, runSpeed: 0.12, awareness: 0, fleeDistance: 0, activity: 'nocturnal' },
};

export interface HabitatGroup {
  speciesId: string;
  /** Centre of the home range. */
  x: number;
  z: number;
  radius: number;
  count: number;
}

/** Where each population lives. Positions match the terrain layout. */
export const HABITATS: readonly HabitatGroup[] = [
  { speciesId: 'rusa-unicolor', x: -52, z: 104, radius: 34, count: 4 },
  { speciesId: 'rusa-unicolor', x: -8, z: -84, radius: 40, count: 4 },
  { speciesId: 'muntiacus-vaginalis', x: -230, z: 120, radius: 48, count: 3 },
  { speciesId: 'muntiacus-vaginalis', x: -290, z: 240, radius: 36, count: 2 },
  { speciesId: 'sus-scrofa', x: -190, z: -60, radius: 42, count: 4 },
  { speciesId: 'lepus-peguensis', x: 42, z: 146, radius: 38, count: 5 },
  { speciesId: 'lepus-peguensis', x: 150, z: -40, radius: 36, count: 3 },
  { speciesId: 'callosciurus-erythraeus', x: -150, z: 62, radius: 34, count: 3 },
  { speciesId: 'callosciurus-erythraeus', x: -300, z: 318, radius: 30, count: 2 },
  { speciesId: 'gallus-gallus', x: -106, z: 22, radius: 32, count: 4 },
  { speciesId: 'alcedo-atthis', x: 100, z: -8, radius: 34, count: 2 },
  { speciesId: 'alcedo-atthis', x: 204, z: 162, radius: 34, count: 2 },
  { speciesId: 'egretta-garzetta', x: 208, z: 190, radius: 46, count: 4 },
  { speciesId: 'egretta-garzetta', x: 150, z: 70, radius: 34, count: 2 },
  { speciesId: 'pycnonotus-jocosus', x: -44, z: 44, radius: 44, count: 4 },
  { speciesId: 'pycnonotus-jocosus', x: -120, z: 150, radius: 40, count: 3 },
  { speciesId: 'buceros-bicornis', x: -262, z: -18, radius: 55, count: 2 },
  { speciesId: 'buceros-bicornis', x: -330, z: 322, radius: 50, count: 2 },
  { speciesId: 'spilornis-cheela', x: -60, z: -318, radius: 70, count: 2 },
  { speciesId: 'channa-striata', x: 60, z: -48, radius: 16, count: 3 },
  { speciesId: 'channa-striata', x: 262, z: 214, radius: 34, count: 4 },
  { speciesId: 'barbonymus-gonionotus', x: 296, z: 230, radius: 40, count: 9 },
  { speciesId: 'barbonymus-gonionotus', x: 140, z: 56, radius: 14, count: 6 },
  { speciesId: 'barbonymus-gonionotus', x: 70, z: -190, radius: 9, count: 5 },
  { speciesId: 'trichopodus-trichopterus', x: 236, z: 196, radius: 26, count: 8 },
  { speciesId: 'trichopodus-trichopterus', x: 172, z: 92, radius: 12, count: 6 },
  { speciesId: 'calotes-versicolor', x: 16, z: 84, radius: 16, count: 2 },
  { speciesId: 'calotes-versicolor', x: -312, z: 292, radius: 24, count: 3 },
  { speciesId: 'physignathus-cocincinus', x: 84, z: -86, radius: 26, count: 2 },
  { speciesId: 'physignathus-cocincinus', x: 56, z: -166, radius: 22, count: 2 },
  { speciesId: 'duttaphrynus-melanostictus', x: -8, z: 72, radius: 14, count: 2 },
  { speciesId: 'duttaphrynus-melanostictus', x: -180, z: 150, radius: 30, count: 3 },
  { speciesId: 'duttaphrynus-melanostictus', x: -326, z: 306, radius: 22, count: 2 },
  { speciesId: 'papilio-demoleus', x: 30, z: 112, radius: 30, count: 6 },
  { speciesId: 'papilio-demoleus', x: -30, z: -22, radius: 30, count: 4 },
  { speciesId: 'danaus-genutia', x: 92, z: 150, radius: 32, count: 5 },
  { speciesId: 'danaus-genutia', x: -40, z: -206, radius: 34, count: 4 },
  { speciesId: 'apis-cerana', x: 18, z: 124, radius: 30, count: 5 },
  { speciesId: 'apis-cerana', x: -22, z: -150, radius: 30, count: 4 },
  { speciesId: 'crocothemis-servilia', x: 112, z: 22, radius: 22, count: 4 },
  { speciesId: 'crocothemis-servilia', x: 222, z: 182, radius: 30, count: 5 },
  { speciesId: 'xylotrupes-gideon', x: -170, z: 100, radius: 26, count: 3 },
  { speciesId: 'xylotrupes-gideon', x: -318, z: 306, radius: 20, count: 2 },
];
