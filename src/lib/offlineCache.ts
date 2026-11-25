export function readCache<T>(key:string,fallback:T):T{
 try{return JSON.parse(localStorage.getItem(`kerbside:${key}`)||'null')??fallback}catch{return fallback}
}
export function writeCache(key:string,value:unknown){
 try{localStorage.setItem(`kerbside:${key}`,JSON.stringify(value))}catch{/* Offline drafts use IndexedDB and report storage failures separately. */}
}
