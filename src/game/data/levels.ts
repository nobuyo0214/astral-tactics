import type { Placement } from '../core/types';
export const levels = [
 {name:'初階試煉',subtitle:'01 / 灰燼邊境',description:'穿過灰燼，熟悉前線與後排。',ids:['flame','ember','leaf'],cells:[[2,2],[4,2],[3,0]]},
 {name:'進階試煉',subtitle:'02 / 雷雨迴廊',description:'守住前線，突破遠程交叉火力。',ids:['oak','bolt','thunder','spark'],cells:[[2,2],[4,2],[1,0],[5,0]]},
 {name:'星界試煉',subtitle:'03 / 破碎星庭',description:'治療、星環護盾與流星的最終試煉。',ids:['lumen','judge','grove','plume','astral'],cells:[[2,2],[4,2],[3,0],[1,1],[5,1]]}
];
export function enemies(level:number):Placement[] { return levels[level].ids.map((characterId,i)=>({id:`e${i}`,characterId,team:'enemy',x:levels[level].cells[i][0],y:levels[level].cells[i][1]})); }
