const paths={
 overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 reports:'M9 5H5v16h14V5h-4 M9 3h6v4H9z M8 12h8 M8 16h5',
 pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
 cloud:'M7 18a5 5 0 1 1-1-9.9 6 6 0 0 1 11.7-1.4A5.5 5.5 0 0 1 18 18 M12 12v9 M9 18l3 3 3-3',
 plus:'M12 5v14 M5 12h14',
 check:'M5 12l4 4L19 6',
 clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
 truck:'M1 3h14v14H1z M15 8h4l3 4v5h-7 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M21 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 leaf:'M20 3C9 1 2 7 5 15c3 8 17 5 15-12Z M4 21l11-11 M9 16v-6 M9 16h6',
 logout:'M9 21H3V3h6 M14 8l5 4-5 4 M8 12h11',
 search:'M20 20l-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
 menu:'M4 6h16 M4 12h16 M4 18h16',
 shield:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z M8 12l3 3 5-6',
 refresh:'M20 7V3l-3 3a8 8 0 0 0-13 4 M4 17v4l3-3a8 8 0 0 0 13-4 M20 3h-5 M4 21h5',
 camera:'M3 6h4l2-3h6l2 3h4v15H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 close:'M6 6l12 12 M6 18 18 6',
 chart:'M4 3v18h17 M8 16v-5 M13 16V7 M18 16V4',
 download:'M12 3v12 M8 11l4 4 4-4 M4 16v5h16v-5',
 spark:'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z',
};
export type IconName=keyof typeof paths;
export default function Icon({name,size=20}:{name:IconName;size?:number}){
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
