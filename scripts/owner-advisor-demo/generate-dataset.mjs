import {mkdir,writeFile} from 'node:fs/promises';
const directory=new URL('../../data/owner-ai/v1/',import.meta.url);
const ownerId='1',accountId='1';
const properties=Array.from({length:5},(_,i)=>({id:`SYN-P${i+1}`,ownerId,name:`Khu trọ mẫu ${i+1}`,synthetic:true}));
const rooms=[],invoices=[];
for(let i=0;i<100;i++){
 const property=properties[Math.floor(i/20)],number=i%20+1;
 const room={id:`SYN-R${String(i+1).padStart(3,'0')}`,ownerId,propertyId:property.id,code:`K${Math.floor(i/20)+1}-P${String(number).padStart(2,'0')}`,areaM2:18+(i%8)*2,capacity:2+i%3,rent:2200000+(i%10)*200000,status:number<=16?'occupied':number<=18?'available':'inactive',synthetic:true};
 rooms.push(room);
 if(room.status!=='occupied')continue;
 for(const month of [9,10]){
  const period=`2026-${String(month).padStart(2,'0')}`,scenario=month===9?0:i%5;
  const status=scenario===0?'paid':scenario===4?'draft':'unpaid';
  const finalDay=scenario===2?'23':scenario===3?'25':'20',dueDay=scenario===2?'28':scenario===3?'30':'25';
  const electricity=45+(i*17)%180,water=3+i%13;
  let remaining=electricity;
  const segments=[{limit:50,rate:2000},{limit:50,rate:2500},{limit:Infinity,rate:3000}].flatMap(({limit,rate})=>{const quantity=Math.min(remaining,limit);remaining-=quantity;return quantity?[{quantity,rate,amount:quantity*rate}]:[];});
  const electricOpening=1000+i*100+(month===10?electricity:0),waterOpening=50+i*10+(month===10?water:0);
  const items=status==='draft'?[]:[{kind:'rent',label:'Tiền phòng',amount:room.rent},{kind:'electricity',label:'Điện',opening:electricOpening,closing:electricOpening+electricity,unit:'kWh',tariff:'SYN-E-TIER',segments,amount:segments.reduce((n,s)=>n+s.amount,0)},{kind:'water',label:'Nước',opening:waterOpening,closing:waterOpening+water,unit:'m³',tariff:'SYN-W-FLAT',segments:[{quantity:water,rate:15000,amount:water*15000}],amount:water*15000}];
  invoices.push({id:`SYN-I-${room.id}-${period}`,ownerId,roomId:room.id,propertyId:property.id,property:property.name,room:room.code,period,periodStart:`2026-${String(month-1).padStart(2,'0')}-21`,periodEnd:`${period}-20`,status,finalizedAt:status==='draft'?null:`${period}-${finalDay}`,dueDate:status==='draft'?null:`${period}-${dueDay}`,total:status==='draft'?null:items.reduce((n,x)=>n+x.amount,0),items,missing:status==='draft'?[i%2?'Chỉ số nước cuối kỳ':'Chỉ số điện cuối kỳ']:[],synthetic:true});
 }
}
const manifest={version:1,synthetic:true,asOf:'2026-10-28',ownerId,accountId,accountEmail:'admin.one@example.test',roomCount:rooms.length,invoiceCount:invoices.length,note:'JSON-only test fixtures. Account/Owner IDs verified read-only locally. All properties, rooms, invoices and rates are synthetic; never import as real debt.'};
await mkdir(directory,{recursive:true});
for(const [name,value] of Object.entries({manifest,properties,rooms,invoices}))await writeFile(new URL(name+'.json',directory),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({rooms:rooms.length,invoices:invoices.length,ownerId,accountId}));
