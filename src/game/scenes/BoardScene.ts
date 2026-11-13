import Phaser from 'phaser';
import type { Battle } from '../core/battle';
import type { Cell, Placement, Unit } from '../core/types';
import { characterById } from '../data/characters';
export interface BoardBridge { placements:()=>Placement[]; battle:()=>Battle|null; selected:()=>string|null; animations:()=>boolean; quality:()=>boolean; click:(cell:Cell,id?:string)=>void; drop:(cell:Cell,id:string)=>void; inspect:(id:string)=>void; bench:(id:string)=>void; update:(delta:number)=>void }
export const TILE=66, OX=29, OY=20, WIDTH=520, HEIGHT=568;
export function screenCell(x:number,y:number):Cell{return {x:Math.floor((x-OX)/TILE),y:Math.floor((y-OY)/TILE)};}
export class BoardScene extends Phaser.Scene {
 private ink!:Phaser.GameObjects.Graphics;private labels:Phaser.GameObjects.Text[]=[];private hover:Cell|null=null;private down:{x:number;y:number;id?:string}|null=null;
 constructor(private bridge:BoardBridge){super('battle');}
 create(){this.ink=this.add.graphics();this.input.mouse?.disableContextMenu();
 this.input.on('pointermove',(p:Phaser.Input.Pointer)=>{this.hover=screenCell(p.x,p.y);});
 this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>{const c=screenCell(p.x,p.y),u=this.current().find(u=>u.x===c.x&&u.y===c.y&&(!('hp'in u)||u.hp>0));if(p.rightButtonDown()){if(u)this.bridge.inspect(u.characterId);return;}this.down={x:p.x,y:p.y,id:u?.id};});
 this.input.on('pointerup',(p:Phaser.Input.Pointer)=>{if(!this.down)return;const d=this.down;this.down=null;const c=screenCell(p.x,p.y);if(d.id&&Math.hypot(p.x-d.x,p.y-d.y)>10){if(c.y>=8||c.x<0||c.x>=7)this.bridge.bench(d.id);else this.bridge.drop(c,d.id);}else this.bridge.click(c,d.id);});
 }
 private current(): (Placement|Unit)[]{return this.bridge.battle()?.units??this.bridge.placements();}
 private text(x:number,y:number,value:string,size=12,color='#e7e8ff'){const t=this.add.text(x,y,value,{fontFamily:'"Microsoft JhengHei", sans-serif',fontSize:size,color}).setOrigin(0.5);this.labels.push(t);}
 update(_time:number,delta:number){this.bridge.update(delta/1000);if(!this.ink)return;const g=this.ink;g.clear();this.labels.forEach(t=>t.destroy());this.labels=[];
 for(let y=0;y<8;y++)for(let x=0;x<7;x++){const px=OX+x*TILE,py=OY+y*TILE,hover=this.hover?.x===x&&this.hover.y===y;
 g.fillStyle(hover?0x414267:y<4?0x242338:0x172f42,hover?1:0.92);g.fillRoundedRect(px+2,py+2,TILE-4,TILE-4,7);g.lineStyle(1,hover?0xe4c58a:0x4a526e,hover?0.9:0.3);g.strokeRoundedRect(px+2,py+2,TILE-4,TILE-4,7);this.text(px+9,py+9,`${String.fromCharCode(65+x)}${y+1}`,8,'#77829d');}
 g.lineStyle(2,0xc8a771,0.8);g.lineBetween(OX,OY+4*TILE,OX+7*TILE,OY+4*TILE);
 const b=this.bridge.battle();
 for(const u of this.current()){
 const data=characterById[u.characterId],live='hp'in u?u:null;let alpha=1;
 if(live&&live.hp<=0){const death=b?.events.find(e=>e.kind==='death'&&e.target===u.id);if(!death||!this.bridge.animations())continue;alpha=Math.max(0,1-((b?.time??0)-death.time)/0.55);if(alpha===0)continue;}
 const px=OX+u.x*TILE+TILE/2,py=OY+u.y*TILE+30,selected=this.bridge.selected()===u.id;
 g.fillStyle(u.team==='player'?0x163e53:0x522e46,alpha);g.fillCircle(px,py,23);g.lineStyle(selected?3:2,selected?0xffdf9d:data.color,alpha);if(data.class==='守護者')g.strokeRoundedRect(px-21,py-21,42,42,7);else g.strokeCircle(px,py,21);
 if(live&&live.shield>0){g.lineStyle(2,0x9be4ff,alpha*.8);g.strokeCircle(px,py,25);}
 this.text(px,py-3,data.symbol,22,`#${data.color.toString(16).padStart(6,'0')}`);this.labels[this.labels.length-1].setAlpha(alpha);
 this.text(px,py+17,'★ '+data.name,8);this.labels[this.labels.length-1].setAlpha(alpha);
 const hp=live?live.hp/data.maxHP:1,mana=live?live.mana/data.maxMana:data.startingMana/data.maxMana;
 g.fillStyle(0x080e1c,alpha);g.fillRect(px-23,py+26,46,7);g.fillStyle(u.team==='player'?0x7bd8bc:0xf198a0,alpha);g.fillRect(px-23,py+26,46*hp,4);g.fillStyle(0xa69cff,alpha);g.fillRect(px-23,py+31,46*mana,2);
 }
 if(b&&this.bridge.animations())for(const e of b.events){const age=b.time-e.time;if(age>0.8)continue;const target=b.units.find(u=>u.id===e.target),source=b.units.find(u=>u.id===e.source);const px=OX+e.x*TILE+33,py=OY+e.y*TILE+28;
 if(e.kind==='attack'&&age<0.2&&target&&source){g.lineStyle(2,0xffd9a1,1-age/0.2);g.lineBetween(OX+source.x*TILE+33,OY+source.y*TILE+28,px,py);}
 if(e.kind==='skill'){g.lineStyle(this.bridge.quality()?3:1,0xc4a2ff,1-age/0.8);g.strokeCircle(px,py,22+age*45);this.text(px,py-37-age*15,e.label??'',11,'#e7bbff');}
 if(['damage','heal','shield'].includes(e.kind)){this.text(px,py-28-age*32,`${e.kind==='heal'?'+':e.kind==='shield'?'◈':'−'}${e.value}`,14,e.kind==='heal'?'#85f1c6':e.kind==='shield'?'#94dfff':'#ffe1ba');this.labels[this.labels.length-1].setAlpha(1-age/0.8);}
 }
 }
}
