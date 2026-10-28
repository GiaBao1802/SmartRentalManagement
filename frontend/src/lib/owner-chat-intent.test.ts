import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeOwnerScope,ownerConfirmation} from './owner-chat-intent';
const catalog={tasks:{unpaid:'Hóa đơn chưa thanh toán',requests:'Yêu cầu từ người thuê'},asOf:'2026-10-28',periods:['2026-10','2026-09'],rooms:['K1-P01','K2-P02']};
test('explicit task and scope are restated for confirmation, never marked confirmed',()=>{
 const p=proposeOwnerScope('Chưa đóng tiền tháng 10 phòng K1-P01','unpaid',catalog);
 assert.deepEqual(p,{task:'unpaid',period:'2026-10',room:'K1-P01'});
 assert.match(ownerConfirmation(p,catalog),/2026-10, phòng K1-P01/);
 assert.equal(Object.hasOwn(p,'confirmed'),false);
});
test('missing/unsupported/ambiguous month asks instead of silently choosing a period',()=>{
 for(const q of ['chưa đóng tiền','tháng 8','tháng 10/2025','tháng 9 và 10','tháng 9 đến tháng 10'])assert.equal(proposeOwnerScope(q,'unpaid',catalog).period,'',q);
 assert.equal(proposeOwnerScope('tháng này','unpaid',catalog).period,'2026-10');
 assert.equal(proposeOwnerScope('tháng trước','unpaid',catalog).period,'2026-09');
});
test('unknown or multiple named rooms require clarification; no room means explicit all-room proposal',()=>{
 for(const q of ['phòng A01','phòng K9-P99','phòng K1-P01 và K2-P02'])assert.equal(proposeOwnerScope(q,'unpaid',catalog).room,null,q);
 assert.equal(proposeOwnerScope('phòng nào chưa đóng tiền','unpaid',catalog).room,'');
 assert.match(ownerConfirmation({task:'requests',period:'2026-10',room:''},catalog),/tất cả phòng thuộc tài khoản/);
});
