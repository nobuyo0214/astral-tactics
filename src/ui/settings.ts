export interface Settings { sound:boolean; animations:boolean; quality:'high'|'low' }
const defaults:Settings={sound:true,animations:true,quality:'high'};
export function loadSettings():Settings {try{const x=JSON.parse(localStorage.getItem('astral-settings')||'null');return {sound:typeof x?.sound==='boolean'?x.sound:true,animations:typeof x?.animations==='boolean'?x.animations:true,quality:x?.quality==='low'?'low':'high'};}catch{return {...defaults};}}
export function saveSettings(s:Settings){try{localStorage.setItem('astral-settings',JSON.stringify(s));}catch{/* Private browsing / quota: settings remain available in memory. */}}
let context:AudioContext|undefined;
export function tone(enabled:boolean,frequency=520){if(!enabled)return;try{context??=new AudioContext();void context.resume();const o=context.createOscillator(),g=context.createGain();o.frequency.value=frequency;g.gain.setValueAtTime(0.025,context.currentTime);g.gain.exponentialRampToValueAtTime(0.001,context.currentTime+0.09);o.connect(g);g.connect(context.destination);o.start();o.stop(context.currentTime+0.1);}catch{/* Audio is optional. */}}
