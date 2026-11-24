import { AstraId } from '../types/world';

/**
 * ============================================================================
 *  DIVINE ASTRAS QUEST — CENTRAL TUNING & BALANCE CONFIGURATION
 * ============================================================================
 *  Adjust all Astra power values, cooldowns, energy costs, VFX scales,
 *  challenge coordinates, mantra settings, and Brahmastra trial difficulty here.
 */

/** Global difficulty multiplier for the 4-stage Brahmastra final trial (1.0 = intended hard challenge). */
export const BRAHMASTRA_TRIAL_DIFFICULTY = 1.0;

/** Shared Astra Energy Pool used whenever Lord Ram fires any unlocked Divyastra. */
export const ASTRA_MAX_ENERGY = 100;
export const ASTRA_ENERGY_REGEN_PER_SEC = 7.5;

/** Order shown in the Divyastra Radial Wheel & Collection Bar. */
export const ASTRA_ORDER: readonly AstraId[] = [
  'AGNEYASTRA',
  'VARUNASTRA',
  'VAYAVYASTRA',
  'NAGASTRA',
  'BRAHMASTRA',
] as const;

export interface AstraPowerConfig {
  id: AstraId;
  name: string;
  sanskritTitle: string;
  gujaratiLabel: string;
  /** Direct / initial impact damage */
  damage: number;
  /** Splash / AoE damage around impact */
  splashDamage: number;
  /** Damage over time per second (Fire burn or Naga venom) */
  dotDamagePerSec: number;
  /** Duration of burn / venom / bind / tornado effect (seconds) */
  effectDurationSec: number;
  /** Area-of-effect radius (meters) */
  radius: number;
  /** Arrow flight speed (meters / second) */
  projectileSpeed: number;
  /** Per-astra cooldown between uses (seconds) */
  cooldownSec: number;
  /** Astra Energy consumed per shot */
  energyCost: number;
  /** Radial knockback impulse (Varunastra / Brahmastra) */
  knockbackForce: number;
  /** Upward lift height (Vayavyastra tornado) */
  liftHeight: number;
  /** Split serpent count (Nagastra) */
  splitCount: number;
  /** Crater radius & depth (Brahmastra) */
  craterRadius: number;
  craterDepth: number;
  craterDurationSec: number;
  /** Heavy dark ash & smoke haze duration (Brahmastra) */
  ashHazeDurationSec: number;
  /** Screen camera shake impulse on detonation */
  cameraShake: number;
  /** Slow-motion scale & duration on Brahmastra lightning impact (HIGH/MEDIUM only) */
  slowMoFactor: number;
  slowMoDurationSec: number;
  /** Signature primary & secondary visual colors */
  primaryHex: number;
  secondaryHex: number;
  cssAccent: string;
  /** Journal & unlock popup story text */
  oneLineStory: string;
  journalStory: string;
  journalHint: string;
}

export const ASTRA_CONFIG: Record<AstraId, AstraPowerConfig> = {
  AGNEYASTRA: {
    id: 'AGNEYASTRA',
    name: 'Agneyastra',
    sanskritTitle: 'Astra of Sacred Fire',
    gujaratiLabel: 'આગ્નેયાસ્ત્ર',
    damage: 86,
    splashDamage: 74,
    dotDamagePerSec: 18,
    effectDurationSec: 4.0,
    radius: 8.2,
    projectileSpeed: 46,
    cooldownSec: 4.5,
    energyCost: 22,
    knockbackForce: 5,
    liftHeight: 0,
    splitCount: 1,
    craterRadius: 0,
    craterDepth: 0,
    craterDurationSec: 0,
    ashHazeDurationSec: 0,
    cameraShake: 0.35,
    slowMoFactor: 1,
    slowMoDurationSec: 0,
    primaryHex: 0xff6b1a,
    secondaryHex: 0xffc64b,
    cssAccent: '#FF7A1A',
    oneLineStory: 'Born of Agni Dev’s eternal flame, scorching ashlands and searing all foes in fire.',
    journalStory:
      'Forged in the sacred hearth of Agni, this blazing arrow detonates into a solar fireball, leaving scorched earth and burning wicked Rakshasas.',
    journalHint:
      'Seek the ruined Fire Temple beside the Eastern Demon Village volcanoes. Shoot the four ancient fire bowls in glowing rune order while dodging lava bursts.',
  },
  VARUNASTRA: {
    id: 'VARUNASTRA',
    name: 'Varunastra',
    sanskritTitle: 'Astra of Endless Oceans',
    gujaratiLabel: 'વારુણાસ્ત્ર',
    damage: 54,
    splashDamage: 50,
    dotDamagePerSec: 0,
    effectDurationSec: 2.2,
    radius: 9.0,
    projectileSpeed: 44,
    cooldownSec: 5.0,
    energyCost: 22,
    knockbackForce: 18,
    liftHeight: 0,
    splitCount: 1,
    craterRadius: 0,
    craterDepth: 0,
    craterDurationSec: 0,
    ashHazeDurationSec: 0,
    cameraShake: 0.25,
    slowMoFactor: 1,
    slowMoDurationSec: 0,
    primaryHex: 0x22b8ff,
    secondaryHex: 0xb2f0ff,
    cssAccent: '#38BDF8',
    oneLineStory: 'Commanding the surging Sarayu tides, hurling back armies and quenching cursed flames.',
    journalStory:
      'Blessed by Varuna, Lord of Celestial Waters, this arrow unleashes an expanding ocean wave that slams enemies backward and extinguishes blazing hazards.',
    journalHint:
      'Dive deep into the 20-foot Sarayu River channel south of the northern bridge. Activate the three glowing pearl switches before your breath expires to open the sunken shrine.',
  },
  VAYAVYASTRA: {
    id: 'VAYAVYASTRA',
    name: 'Vayavyastra',
    sanskritTitle: 'Astra of the Tempest',
    gujaratiLabel: 'વાયવ્યાસ્ત્ર',
    damage: 42,
    splashDamage: 24,
    dotDamagePerSec: 18,
    effectDurationSec: 3.4,
    radius: 9.5,
    projectileSpeed: 52,
    cooldownSec: 6.0,
    energyCost: 26,
    knockbackForce: 0,
    liftHeight: 4.8,
    splitCount: 1,
    craterRadius: 0,
    craterDepth: 0,
    craterDurationSec: 0,
    ashHazeDurationSec: 0,
    cameraShake: 0.28,
    slowMoFactor: 1,
    slowMoDurationSec: 0,
    primaryHex: 0x7bffb8,
    secondaryHex: 0xeafff4,
    cssAccent: '#6EE7B7',
    oneLineStory: 'Harnessing Vayu’s howling gale to gather scattered foes into an airborne cyclone.',
    journalStory:
      'Invoking Vayu, Lord of the Winds, this arrow erupts into a roaring whirlwind that drags enemies inward and hoists them helplessly skyward.',
    journalHint:
      'Climb the floating Celestial Wind Spire northwest of Panchavati using shimmering updraft pillars before the sky-seal timer expires.',
  },
  NAGASTRA: {
    id: 'NAGASTRA',
    name: 'Nagastra',
    sanskritTitle: 'Astra of Coiled Serpents',
    gujaratiLabel: 'નાગાસ્ત્ર',
    damage: 38,
    splashDamage: 28,
    dotDamagePerSec: 14,
    effectDurationSec: 2.8,
    radius: 14.0,
    projectileSpeed: 42,
    cooldownSec: 6.5,
    energyCost: 28,
    knockbackForce: 0,
    liftHeight: 0,
    splitCount: 4,
    craterRadius: 0,
    craterDepth: 0,
    craterDurationSec: 0,
    ashHazeDurationSec: 0,
    cameraShake: 0.22,
    slowMoFactor: 1,
    slowMoDurationSec: 0,
    primaryHex: 0x35e86e,
    secondaryHex: 0xa6ff96,
    cssAccent: '#4ADE80',
    oneLineStory: 'Splitting into living emerald cobras that hunt and bind foes in unbreakable coils.',
    journalStory:
      'Woven from the might of Patala’s serpent kings, this arrow splits in flight into glowing cobras that seek out foes, inject venom, and bind them in place.',
    journalHint:
      'Seek the Serpent Temple in southern Panchavati. Its dark stone gate parts only under the cover of night—defeat Takshaka’s guardian within.',
  },
  BRAHMASTRA: {
    id: 'BRAHMASTRA',
    name: 'Brahmastra',
    sanskritTitle: 'Supreme Celestial Lotus Weapon',
    gujaratiLabel: 'બ્રહ્માસ્ત્ર',
    damage: 320,
    splashDamage: 240,
    dotDamagePerSec: 0,
    effectDurationSec: 5.0,
    radius: 18.0,
    projectileSpeed: 64,
    cooldownSec: 28.0,
    energyCost: 65,
    knockbackForce: 28,
    liftHeight: 0,
    splitCount: 1,
    craterRadius: 2.8,
    craterDepth: 1.25,
    craterDurationSec: 5.2,
    ashHazeDurationSec: 4.5,
    cameraShake: 1.15,
    slowMoFactor: 0.35,
    slowMoDurationSec: 0.42,
    primaryHex: 0xffd27a,
    secondaryHex: 0xff5fa2,
    cssAccent: '#FBBF24',
    oneLineStory: 'The supreme cosmic lotus of Brahma, summoned through mantra and thunder to shatter all darkness.',
    journalStory:
      'The ultimate celestial weapon of creation and annihilation. Summoned through sacred namaskar and thunderous lightning from dark cyclone clouds, its golden beam carves a smoldering crater through any army.',
    journalHint: 'The hardest trial in the world.',
  },
};

/** Exact world coordinates for the 5 Astra challenges (clear of existing roads/buildings). */
export const ASTRA_CHALLENGE_LOCATIONS = {
  AGNEYASTRA_TEMPLE: { x: 2562, z: 24 },
  VARUNASTRA_SHRINE: { x: 39.2, z: -28 }, // Deep 20-ft Sarayu River basin between the two bridges
  VAYAVYASTRA_SPIRE: { x: -94, z: -84 },
  NAGASTRA_TEMPLE: { x: -98, z: 50 },
  BRAHMASTRA_ALTAR: { x: 0, z: 22 }, // Mahadev Central Sanctuary Trial Sanctum
} as const;

/** Mantra Voiceover + SpeechSynthesis Configuration for Brahmastra Summoning */
export const BRAHMASTRA_MANTRA_CONFIG = {
  mantraText:
    'Om Brahmaastraaya Namah. Om Brahma Devaaya Namah. Brahmaastra Prasheedha. Om Namo Brahmane',
  lang: 'en-IN',
  pitch: 0.72, // Deep young warrior-prince tone (0.6 - 0.8)
  rate: 0.84,
  volume: 1.0,
  /** Optional custom audio file path (leave empty for pure SpeechSynthesis + Vedic synth drone). */
  customAudioUrl: '',
} as const;
