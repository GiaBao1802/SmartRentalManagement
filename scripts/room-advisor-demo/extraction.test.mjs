import test from 'node:test';
import assert from 'node:assert/strict';
import {numericView} from './numbers.mjs';
import {normalizeQuotes,quoteFields,quoteChoices,sourceQuoteSchema} from './extraction.mjs';
const empty=()=>({...Object.fromEntries(quoteFields.map(k=>[k,null])),required:[],questions:[]});
const run=(note,fields)=>normalizeQuotes(JSON.stringify({...empty(),...fields}),note);
test('quoted full request normalizes eight fields without asking AI for internal codes',()=>{
 const note='1 người, xe máy tới Văn phòng B, 30 phút, về 1 giờ sáng, nấu ăn, chỗ xe, tổng 4 triệu, ưu tiên đi gần';
 const r=run(note,{budget:'tổng 4 triệu',destination:'Văn phòng B',mode:'xe máy',maxMinutes:'30 phút',people:'1 người',late:'về 1 giờ sáng',required:['nấu ăn','chỗ xe'],priority:'ưu tiên đi gần'});
 assert.deepEqual(r.criteria,{budget:4000000,destination:'office',mode:'motorbike',maxMinutes:30,people:1,late:true,priority:'commute',required:['cooking','parking']});assert.deepEqual(r.missing,[]);
});
test('negation cannot be hidden by a model quoting only the positive fragment',()=>{
 const r=run('không nuôi mèo, không cần máy lạnh, cần nấu ăn, 2 người, tổng 3 triệu',{required:['nuôi mèo','máy lạnh','nấu ăn'],people:'2 người',budget:'tổng 3 triệu'});
 assert.deepEqual(r.criteria.required,['cooking']);assert.equal(r.criteria.people,2);assert.equal(r.criteria.budget,3000000);
});
test('contradictory totals, per-person and rent-only amounts do not silently become total budget',()=>{
 for(const [note,q] of [['tối đa 3 triệu, tối thiểu 5 triệu','3 triệu'],['mỗi người 3 triệu','3 triệu'],['giá thuê 3 triệu chưa tính điện nước','3 triệu']])assert.equal(run(note,{budget:q}).criteria.budget,null);
});
test('unknown places and absent quotes stay unknown; no invented room criteria',()=>{
 const r=run('Trường Z, an ninh tuyệt đối',{destination:'Trường Z',people:'2 người',required:['nấu ăn']});assert.equal(r.criteria.destination,null);assert.equal(r.criteria.people,null);assert.equal(r.criteria.required,null);
});
test('Vietnamese decimal budget, unaccented terms and explicit no-late requirement',()=>{
 const r=run('tong 3,5 trieu, Van phong B, xe buyt, khong ve khuya, uu tien gia re',{budget:'3,5 trieu',destination:'Van phong B',mode:'xe buyt',late:'khong ve khuya',priority:'uu tien gia re'});
 assert.equal(r.criteria.budget,3500000);assert.equal(r.criteria.destination,'office');assert.equal(r.criteria.mode,'bus');assert.equal(r.criteria.late,false);assert.equal(r.criteria.priority,'budget');
});
test('optional amenities are not hard requirements and parking is not a pet',()=>{
 const r=run('nếu có máy lạnh thì tốt, cần chỗ xe',{required:['máy lạnh','chỗ xe']});assert.deepEqual(r.criteria.required,['parking']);
});
test('explicit numeric limits still reject out-of-range extracted values',()=>{
 const r=run('20 người, 999 phút, tổng 999 triệu',{people:'20 người',maxMinutes:'999 phút',budget:'999 triệu'});assert.equal(r.criteria.people,null);assert.equal(r.criteria.maxMinutes,null);assert.equal(r.criteria.budget,null);
});

test('similar unknown place names cannot match a known destination by prefix',()=>{
 assert.equal(run('Văn phòng B2',{destination:'Văn phòng B2'}).criteria.destination,null);
});

test('misspelled time prefix recovers only exact unique source time, never invents time',()=>{
 assert.equal(run('về lúc 1 giờ sáng',{late:'véo 1 giờ sáng'}).criteria.late,true);
 assert.equal(run('về lúc 2 giờ sáng',{late:'véo 1 giờ sáng'}).criteria.late,null);
 assert.equal(run('không về lúc 1 giờ sáng',{late:'véo 1 giờ sáng'}).criteria.late,false);
});

test('postposed negation and optional suffix cannot be removed from amenity quotes',()=>{
 const r=run('máy lạnh không cần, nuôi mèo thì không, chỗ xe có cũng được, cần nấu ăn',{required:['máy lạnh','nuôi mèo','chỗ xe','nấu ăn']});assert.deepEqual(r.criteria.required,['cooking']);
});
test('multiple destinations do not silently collapse to one supported place',()=>{
 assert.equal(run('đến cả Trường A và Văn phòng B mỗi ngày',{destination:'Trường A'}).criteria.destination,null);
});

test('source choices preserve decimal amounts and never invent accented or paraphrased text',()=>{
 const note='tong 3,5 trieu, can cho gui xe; khong nuoi meo';
 const choices=quoteChoices(note);assert.ok(choices.includes('tong 3,5 trieu'));assert.ok(choices.includes('can cho gui xe'));assert.ok(choices.every(q=>note.includes(q)));
 assert.deepEqual(sourceQuoteSchema(note).properties.required.items.enum,['can cho gui xe','khong nuoi meo']);
 assert.equal(run(note,{budget:'tong 3,5 trieu'}).criteria.budget,3500000);
});
test('case/accent-only reconciliation keeps the original source and rejects word substitutions',()=>{
 const r=run('toi can bep, Van phong B',{required:['Tôi cần bếp'],destination:'Văn phòng B'});
 assert.deepEqual(r.criteria.required,['cooking']);assert.equal(r.evidence.destination,'Van phong B');
 assert.equal(run('cần nấu ăn',{required:['cần bếp']}).criteria.required,null);
});

test('a budget statement alone cannot become an inferred budget priority',()=>{
 assert.equal(run('ngân sách tổng 4 triệu',{priority:'ngân sách tổng 4 triệu'}).criteria.priority,null);
 assert.deepEqual(sourceQuoteSchema('ngân sách tổng 4 triệu').properties.priority.enum,[null]);
});

test('alternative transport and occupant ranges require confirmation even if AI quotes one option',()=>{
 assert.equal(run('Đi xe máy hoặc xe buýt đều được',{mode:'xe máy'}).criteria.mode,null);
 assert.equal(run('có thể ở 2 hoặc 3 người',{people:'3 người'}).criteria.people,null);
 assert.equal(run('ở 2-3 người',{people:'3 người'}).criteria.people,null);
});

test('mixed positive and negative amenities preserve the requested amenity only',()=>{
 const note='Cần nấu ăn không cần máy lạnh';
 assert.deepEqual(run(note,{required:[note]}).criteria.required,['cooking']);
 assert.deepEqual(run(note,{required:['nấu ăn','máy lạnh']}).criteria.required,['cooking']);
 assert.equal(run('không cần máy lạnh và bếp',{required:['bếp']}).criteria.required,null);
});

test('Vietnamese word numbers normalize with original source evidence',()=>{
 const note='Hai người ở, tổng ba triệu rưỡi, hai mươi lăm phút';
 const r=run(note,{people:'Hai người ở',budget:'tổng ba triệu rưỡi',maxMinutes:'hai mươi lăm phút'});
 assert.equal(r.criteria.people,2);assert.equal(r.criteria.budget,3500000);assert.equal(r.criteria.maxMinutes,25);
 assert.equal(r.evidence.budget,'tổng ba triệu rưỡi');
 assert.ok(sourceQuoteSchema(note).properties.budget.enum.includes('tổng ba triệu rưỡi'));
 assert.ok(sourceQuoteSchema(note).properties.people.enum.includes('Hai người ở'));
 assert.equal(run(note,{people:'2 người'}).criteria.people,null);
});

test('word numbers support tens and hundreds, unaccented text and half currency units',()=>{
 for(const [q,expected] of [['mười lăm phút',15],['hai mươi mốt phút',21],['một trăm linh năm phút',105],['một trăm hai mươi phút',120],['mot tram le nam phut',105]])assert.equal(run(q,{maxMinutes:q}).criteria.maxMinutes,expected);
 assert.equal(run('tong bon trieu ruoi',{budget:'tong bon trieu ruoi'}).criteria.budget,4500000);
 assert.equal(numericView('hai ba người'),'hai ba nguoi');
 assert.equal(run('hai ba người',{people:'hai ba người'}).criteria.people,null);
});

test('word and mixed numeric conflicts or ranges remain unresolved',()=>{
 for(const note of ['hai hoặc ba người','từ hai đến ba người','hai người hoặc 3 người'])assert.equal(run(note,{people:note}).criteria.people,null);
 for(const note of ['ba triệu hoặc 4 triệu','ba triệu rưỡi hoặc bốn triệu','từ hai đến ba triệu','hai hoặc 3 triệu','mỗi người ba triệu','giá thuê ba triệu'])assert.equal(run(note,{budget:note}).criteria.budget,null);
 for(const note of ['hai mươi đến ba mươi phút','hai mươi phút rưỡi'])assert.equal(run(note,{maxMinutes:note}).criteria.maxMinutes,null);
 assert.equal(run('không ở hai người',{people:'hai người'}).criteria.people,null);
});

test('compound money adds adjacent explicit million and thousand units only',()=>{
 for(const note of ['ba triệu năm trăm nghìn','3 triệu 500 nghìn','ba trieu nam tram ngan'])assert.equal(run(note,{budget:note}).criteria.budget,3500000);
 for(const note of ['ba triệu hoặc năm trăm nghìn','ba triệu, năm trăm nghìn','ba triệu 1500 nghìn','ba triệu năm trăm nghìn hoặc bốn triệu'])assert.equal(run(note,{budget:note}).criteria.budget,null);
});

test('approximate and lower-bound numbers cannot silently become exact filters',()=>{
 for(const note of ['khoảng ba triệu','hơn 3 triệu','gần bốn triệu','ít nhất ba triệu'])assert.equal(run(note,{budget:note}).criteria.budget,null);
 for(const note of ['hơn hai người','khoảng 2 người','ít nhất ba người'])assert.equal(run(note,{people:note}).criteria.people,null);
 for(const note of ['khoảng hai mươi phút','hơn 20 phút','ít nhất ba mươi phút'])assert.equal(run(note,{maxMinutes:note}).criteria.maxMinutes,null);
 assert.equal(run('khoảng 3 triệu',{budget:'3 triệu'}).criteria.budget,null);
 assert.equal(run('tối đa ba triệu',{budget:'tối đa ba triệu'}).criteria.budget,3000000);
 assert.equal(run('tối đa tám mươi phút',{maxMinutes:'tối đa tám mươi phút'}).criteria.maxMinutes,80);
});
