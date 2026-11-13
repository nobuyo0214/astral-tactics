export type Team = "player" | "enemy";
export interface Cell {
  x: number;
  y: number;
}
export interface Character {
  id: string;
  name: string;
  cost: number;
  faction: string;
  class: string;
  maxHP: number;
  attack: number;
  defense: number;
  attackSpeed: number;
  attackRange: number;
  moveSpeed: number;
  maxMana: number;
  startingMana: number;
  skillId: string;
  starLevel: number;
  description: string;
  color: number;
  symbol: string;
}
export type SkillKind =
  | "empower"
  | "shield"
  | "area"
  | "heal"
  | "haste"
  | "armor"
  | "multi"
  | "nova"
  | "chain"
  | "blast"
  | "ward"
  | "execute";
export interface Skill {
  id: string;
  name: string;
  description: string;
  kind: SkillKind;
  power: number;
  duration: number;
}
export interface Placement extends Cell {
  characterId: string;
  id: string;
  team: Team;
}
export interface Unit extends Placement {
  data: Character;
  hp: number;
  mana: number;
  shield: number;
  attackTimer: number;
  moveTimer: number;
  castTimer: number;
  buffUntil: number;
  buff: SkillKind | null;
  empowered: boolean;
  damage: number;
  taken: number;
  healing: number;
}
export interface BattleEvent {
  id: number;
  time: number;
  kind: "attack" | "damage" | "heal" | "shield" | "skill" | "death" | "move";
  source: string;
  target: string;
  value: number;
  label?: string;
  x: number;
  y: number;
}
export interface Result {
  winner: Team | "draw";
  reason: "elimination" | "timeout";
  time: number;
  playerAlive: number;
  enemyAlive: number;
  damage: number;
  taken: number;
  healing: number;
}
// P2 extension boundary; no economy or shop rules in P1.
export interface RosterState {
  placements: Placement[];
  bench: string[];
  economy?: { gold: number; level: number };
  inventory?: string[];
}
