import type { Cell, Placement } from "./types";
import { inside } from "../ai/grid";
import { characterById } from "../data/characters";
export class Deployment {
  placements: Placement[] = [];
  locked = false;
  private serial = 0;
  place(characterId: string, cell: Cell, movingId?: string): boolean {
    if (
      this.locked ||
      !inside(cell) ||
      cell.y < 4 ||
      !characterById[characterId]
    )
      return false;
    const moving = this.placements.find((p) => p.id === movingId),
      occupied = this.placements.find((p) => p.x === cell.x && p.y === cell.y);
    if (moving) {
      if (occupied && occupied !== moving) {
        occupied.x = moving.x;
        occupied.y = moving.y;
      }
      Object.assign(moving, cell);
      return true;
    }
    if (occupied || this.placements.length >= 5) return false;
    this.placements.push({
      id: `p${this.serial++}`,
      characterId,
      team: "player",
      ...cell,
    });
    return true;
  }
  remove(id: string) {
    if (!this.locked)
      this.placements = this.placements.filter((p) => p.id !== id);
  }
  reset() {
    if (!this.locked) this.placements = [];
  }
}
