import test from 'node:test';
import assert from 'node:assert/strict';
import {isOwnerRoomCreationRequest,nextOwnerRoomCreateStep,normalizeOwnerRoomCreateValue,parseOwnerRoomCreateDraft,validateOwnerRoomCreateValue} from './owner-room-creation';

const properties=[{property_id:'1',name:'An Bình Biên Hòa',province:'Đồng Nai'},{property_id:'2',name:'An Bình Biên Hòa',province:'TP.HCM'},{property_id:'3',name:'Vườn Xanh',province:'Đồng Nai'}];

test('recognizes add-room commands but not room questions',()=>{
 assert.equal(isOwnerRoomCreationRequest('Thêm 1 phòng A06 vào khu vực An Bình Biên Hòa'),true);
 assert.equal(isOwnerRoomCreationRequest('Tạo phòng'),true);
 assert.equal(isOwnerRoomCreationRequest('Phòng nào còn trống?'),false);
 assert.equal(isOwnerRoomCreationRequest('Danh sách phòng còn trống'),false);
});

test('prefills a unique owner property and room code, but asks when property is ambiguous',()=>{
 const draft=parseOwnerRoomCreateDraft('Thêm 1 phòng A06 vào khu vực An Bình Biên Hòa',[properties[2]]);
 assert.deepEqual(draft,{propertyId:'3',roomCode:'A06',area:'',rent:'',capacity:''});
 assert.equal(nextOwnerRoomCreateStep(draft),'area');
 assert.equal(parseOwnerRoomCreateDraft('Thêm phòng A06 vào An Bình Biên Hòa',properties).propertyId,'');
 assert.equal(nextOwnerRoomCreateStep(parseOwnerRoomCreateDraft('Thêm phòng A06 vào An Bình Biên Hòa',properties)),'property');
});

test('validates and normalizes room creation fields without inventing area or rent',()=>{
 assert.match(validateOwnerRoomCreateValue('area','0'),/lớn hơn 0/);
 assert.equal(validateOwnerRoomCreateValue('area','25,5'),'');
 assert.equal(normalizeOwnerRoomCreateValue('area','25,5'),'25.5');
 assert.match(validateOwnerRoomCreateValue('rent','2.5 triệu'),/số nguyên VND/);
 assert.equal(normalizeOwnerRoomCreateValue('rent','2.500.000 đ'),'2500000');
 assert.match(validateOwnerRoomCreateValue('capacity','0'),/từ 1/);
 assert.equal(normalizeOwnerRoomCreateValue('capacity','2 người'),'2');
});
