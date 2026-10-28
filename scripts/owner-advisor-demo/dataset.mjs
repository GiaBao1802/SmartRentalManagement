import {readFileSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL(`../../data/owner-ai/v1/${name}.json`,import.meta.url),'utf8'));
export const dataset={manifest:read('manifest'),rooms:read('rooms'),invoices:read('invoices')};
export function scopeDataset(identity){
 const allowed=identity.role==='admin'&&identity.ownerId===dataset.manifest.ownerId&&identity.accountId===dataset.manifest.accountId;
 return {session:{...identity,asOf:dataset.manifest.asOf,synthetic:true},rooms:allowed?dataset.rooms.filter(r=>r.ownerId===identity.ownerId):[],invoices:allowed?dataset.invoices.filter(r=>r.ownerId===identity.ownerId):[]};
}
