import { characterById, skills } from "../data/characters";
import { STAR_ATTACK, STAR_HP, STAR_SKILL } from "../run/config";
import type { Character, Skill } from "./types";
import type { UnitStarLevel } from "../run/types";
export function effectiveCharacter(
  id: string,
  star: UnitStarLevel = 1,
): Character {
  const c = characterById[id];
  if (!Object.hasOwn(characterById, id)) throw new Error("未知角色");
  return {
    ...c,
    starLevel: star,
    maxHP: Math.round(c.maxHP * STAR_HP[star - 1]),
    attack: Math.round(c.attack * STAR_ATTACK[star - 1]),
  };
}
export function effectiveSkill(id: string, star: UnitStarLevel = 1): Skill {
  if (!Object.hasOwn(skills, id)) throw new Error("未知技能");
  const s = skills[id];
  return { ...s, power: s.power * STAR_SKILL[star - 1] };
}
