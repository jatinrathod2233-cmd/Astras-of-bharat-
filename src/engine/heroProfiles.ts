import { PlayableHeroId } from '../types/world';

export interface HeroProfileConfig {
  id: PlayableHeroId;
  name: string;
  sanskritTitle: string;
  accentHex: string;
  badgeBgHex: string;
  maxHp: number;
  walkSpeed: number;
  sprintSpeed: number;
  flySpeed: number;
  canFly: boolean;
  jumpVelocity: number;
  scale: number;
  weaponLabel: string;
  specialName: string;
  specialShort: string;
  specialCooldownSec: number;
  specialDamage: number;
  specialDescription: string;
  powerRating: number; // 1..100
  speedRating: number; // 1..100
  defenseRating: number; // 1..100
}

export const PLAYABLE_HERO_ORDER: readonly PlayableHeroId[] = [
  'HANUMAN',
  'RAM',
  'LAKSHMAN',
  'BHARAT',
] as const;

export const HERO_PROFILES: Record<PlayableHeroId, HeroProfileConfig> = {
  RAM: {
    id: 'RAM',
    name: 'Lord Ram',
    sanskritTitle: 'Maryada Purushottam · Suryavanshi',
    accentHex: '#F6C343',
    badgeBgHex: '#281F10',
    maxHp: 100,
    walkSpeed: 9.4,
    sprintSpeed: 14.5,
    flySpeed: 0,
    canFly: false,
    jumpVelocity: 9.2,
    scale: 1.0,
    weaponLabel: 'Sharnga Dhanush & Agni Sword',
    specialName: 'Surya Blade Wave',
    specialShort: 'Wave',
    specialCooldownSec: 4.5,
    specialDamage: 145,
    specialDescription:
      'Unleashes a blazing solar fire slash across nearby demons with high burn damage.',
    powerRating: 88,
    speedRating: 82,
    defenseRating: 80,
  },
  HANUMAN: {
    id: 'HANUMAN',
    name: 'Lord Hanuman',
    sanskritTitle: 'Bajrangbali · Pawanputra',
    accentHex: '#FB923C',
    badgeBgHex: '#2C160C',
    maxHp: 165,
    walkSpeed: 11.4,
    sprintSpeed: 18.6,
    flySpeed: 28.5,
    canFly: true,
    jumpVelocity: 13.5,
    scale: 1.24,
    weaponLabel: 'Colossal Golden Vajra Gada',
    specialName: 'Vajra-Gada Meteor Slam',
    specialShort: 'Slam',
    specialCooldownSec: 3.5,
    specialDamage: 235,
    specialDescription:
      'Soars freely through the sky (Fly / double-Jump) and crushes demon armies with a devastating shockwave slam.',
    powerRating: 100,
    speedRating: 96,
    defenseRating: 98,
  },
  LAKSHMAN: {
    id: 'LAKSHMAN',
    name: 'Lakshman',
    sanskritTitle: 'Seshanaga Avatar · Prince',
    accentHex: '#38BDF8',
    badgeBgHex: '#0F2233',
    maxHp: 115,
    walkSpeed: 10.6,
    sprintSpeed: 16.8,
    flySpeed: 0,
    canFly: false,
    jumpVelocity: 10.2,
    scale: 0.99,
    weaponLabel: 'Seshanaga Bow & Celestial Khadga',
    specialName: 'Seshanaga 3x Volley',
    specialShort: 'Volley',
    specialCooldownSec: 3.2,
    specialDamage: 130,
    specialDescription:
      'Fires three fanned spectral serpent arrows that lock onto foes at blistering velocity.',
    powerRating: 86,
    speedRating: 94,
    defenseRating: 78,
  },
  BHARAT: {
    id: 'BHARAT',
    name: 'Bharat',
    sanskritTitle: 'Dharma-Rakshak · Nandigram',
    accentHex: '#34D399',
    badgeBgHex: '#0E261E',
    maxHp: 140,
    walkSpeed: 9.6,
    sprintSpeed: 15.2,
    flySpeed: 0,
    canFly: false,
    jumpVelocity: 9.4,
    scale: 1.03,
    weaponLabel: 'Dharma-Chakra Halberd & Sun Shield',
    specialName: 'Dharma Aegis Cleave',
    specialShort: 'Aegis',
    specialCooldownSec: 5.0,
    specialDamage: 165,
    specialDescription:
      'Sweeps a 360-degree emerald shockwave knocking foes back while restoring Health & Prana.',
    powerRating: 84,
    speedRating: 76,
    defenseRating: 95,
  },
};

export function normalizeHeroId(rawHeroId?: string | null): PlayableHeroId {
  const upper = (rawHeroId ?? '').toUpperCase();
  if (upper === 'HANUMAN' || upper === 'LAKSHMAN' || upper === 'BHARAT') {
    return upper;
  }
  return 'RAM';
}
