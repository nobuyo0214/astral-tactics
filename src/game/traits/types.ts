import type { Unit, Team } from "../core/types";
export type TraitKind =
  | "burn"
  | "frost"
  | "lightning"
  | "astral"
  | "steel"
  | "abyss"
  | "nature"
  | "gold"
  | "guardian"
  | "warrior"
  | "assassin"
  | "ranger"
  | "mage"
  | "healer"
  | "summoner"
  | "tactician";
export interface TraitEffect {
  kind: TraitKind;
  value: number;
  secondary?: number;
  interval?: number;
  duration?: number;
  cooldown?: number;
  freezeDuration?: number;
  radius?: number;
  threshold?: number;
}
export interface TraitTier {
  count: number;
  description: string;
  effect: TraitEffect;
}
export interface TraitDefinition {
  id: TraitKind;
  name: string;
  type: "faction" | "class";
  description: string;
  icon: string;
  color: number;
  tiers: TraitTier[];
}
export interface ActiveTrait {
  definition: TraitDefinition;
  count: number;
  tier: TraitTier | null;
  next: number | null;
  members: string[];
}
export type TraitSnapshot = Readonly<Record<Team, readonly ActiveTrait[]>>;
export type DamageKind = "attack" | "skill" | "dot" | "trigger";
export type HookName =
  | "onBattleStart"
  | "onAttack"
  | "onDamageDealt"
  | "onDamageTaken"
  | "onSkillCast"
  | "onHeal"
  | "onUnitDeath"
  | "onTick"
  | "onBattleEnd";
export interface TraitEffectContext {
  unit: Unit;
  target?: Unit;
  kind?: DamageKind;
  amount?: number;
  first?: boolean;
}
export interface BattleModifier {
  defense: number;
  attack: number;
  attackSpeed: number;
  skill: number;
  skillDamage: number;
  healing: number;
  cooldown: number;
}
export interface StatusEffect {
  id: "burn" | "slow" | "freeze";
  source: string;
  duration: number;
  remaining: number;
  power: number;
  nextTick: number;
  stacking: "refresh-strongest";
}
