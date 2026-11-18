export type Role='citizen'|'collector'|'admin';
export type Status='reported'|'assigned'|'cleared';
export interface Profile{id:string;name:string;role:Role;points:number}
export interface Complaint{id:string;user_id:string;category:string;description:string;lat:number;lng:number;image_url:string|null;status:Status;collector_id:string|null;resolution_note:string|null;done_image_url:string|null;upvotes:number;created_at:string}
export const CATEGORIES=['Overflowing bin','Illegal dumping','Missed pickup'];
export const LABEL:Record<Status,string>={reported:'Reported',assigned:'Crew on the way',cleared:'Cleared'};
export const COLOR:Record<Status,string>={reported:'#c8402f',assigned:'#2b6cff',cleared:'#2f7d57'};
export const DEPOT:[number,number]=[12.9716,77.5946];
