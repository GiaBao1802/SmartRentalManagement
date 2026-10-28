// Independent synthetic billing snapshots. Never inferred from the room dataset.
export const context={ownerId:'DEMO-OWNER-A',role:'admin',asOf:'2026-10-28',synthetic:true};
const lines=[{kind:'rent',label:'Tiền phòng',amount:3000000},{kind:'electricity',label:'Điện',opening:1000,closing:1120,unit:'kWh',tariff:'DEMO-E-2026-10',segments:[{quantity:50,rate:2000,amount:100000},{quantity:50,rate:2500,amount:125000},{quantity:20,rate:3000,amount:60000}],amount:285000},{kind:'water',label:'Nước',opening:50,closing:58,unit:'m³',tariff:'DEMO-W-2026-10',segments:[{quantity:8,rate:15000,amount:120000}],amount:120000}];
const invoice=(id,room,status,due,overrides={})=>({id,ownerId:context.ownerId,property:'Nhà Hiên Nắng',room,period:'2026-10',periodStart:'2026-09-21',periodEnd:'2026-10-20',status,finalizedAt:status==='draft'?null:'2026-10-20',dueDate:due,total:status==='draft'?null:3405000,items:status==='draft'?[]:structuredClone(lines),missing:[],...overrides});
export const invoices=[
 invoice('DEMO-I01','A01','unpaid','2026-10-25'),
 invoice('DEMO-I02','A02','unpaid','2026-10-28',{finalizedAt:'2026-10-23'}),
 invoice('DEMO-I03','A03','paid','2026-10-25'),
 invoice('DEMO-I04','A04','draft',null,{missing:['Chỉ số điện cuối kỳ','Đơn giá nước có hiệu lực đầu kỳ']}),
 invoice('DEMO-I05','A05','unpaid','2026-10-30',{finalizedAt:'2026-10-25'}),
 invoice('DEMO-I06','A06','draft',null,{missing:['Chỉ số nước đầu kỳ cùng hợp đồng']}),
 invoice('DEMO-I07','A01','paid','2026-09-25',{period:'2026-09',periodStart:'2026-08-21',periodEnd:'2026-09-20',finalizedAt:'2026-09-20'}),
 invoice('DEMO-OTHER','A01','unpaid','2026-10-25',{ownerId:'DEMO-OWNER-B',property:'Khu khác'}),
];
