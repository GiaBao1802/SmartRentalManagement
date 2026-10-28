import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeOwnerScope,ownerConfirmation,parseOwnerClarificationReply,namesDifferentOwnerTask,ownerUnknownIntentMessage,ownerQuestionMentionsPeriod,ownerEmptyResultMessage,parseOwnerRoomReminder,isOwnerAvailableRoomsQuestion,ownerQuestionTask,ownerPeriodFreeTasks} from './owner-chat-intent';
const catalog={tasks:{unpaid:'Hóa đơn chưa thanh toán',requests:'Yêu cầu từ người thuê'},asOf:'2026-10-28',periods:['2026-10','2026-09'],rooms:['K1-P01','K2-P02']};
test('explicit task and scope are restated for confirmation, never marked confirmed',()=>{
 const p=proposeOwnerScope('Chưa đóng tiền tháng 10 phòng K1-P01','unpaid',catalog);
 assert.deepEqual(p,{task:'unpaid',period:'2026-10',room:'K1-P01'});
 assert.match(ownerConfirmation(p,catalog),/tháng 10\/2026, phòng K1-P01/);
 assert.equal(Object.hasOwn(p,'confirmed'),false);
});
test('missing/unsupported/ambiguous month asks instead of silently choosing a period',()=>{
 for(const q of ['chưa đóng tiền','tháng 8','tháng 10/2025','tháng 9 và 10','tháng 9 đến tháng 10'])assert.equal(proposeOwnerScope(q,'unpaid',catalog).period,'',q);
 assert.equal(proposeOwnerScope('tháng này','unpaid',catalog).period,'2026-10');
 assert.equal(proposeOwnerScope('tháng trước','unpaid',catalog).period,'2026-09');
});
test('only questions with no month reference receive the current-month default',()=>{
 assert.equal(ownerQuestionMentionsPeriod('Phòng nào chưa đóng tiền?'),false);
 for(const q of ['tháng 8','tháng này','kỳ trước','2026-09','tháng 9 và 10'])assert.equal(ownerQuestionMentionsPeriod(q),true,q);
});
test('vacant-room questions are recognized explicitly and stay separate from invoice questions',()=>{
 for(const q of ['danh sach cac phong con trong','Liệt kê phòng trống','phòng nào chưa có người thuê?','Phòng 302 còn trống không'])assert.equal(isOwnerAvailableRoomsQuestion(q),true,q);
 for(const q of ['phòng nào còn thiếu dữ liệu lập hóa đơn?','phòng nào chưa đóng tiền?','xem hóa đơn tháng này'])assert.equal(isOwnerAvailableRoomsQuestion(q),false,q);
 assert.equal(proposeOwnerScope('danh sach cac phong con trong','available_rooms',catalog).room,'');
 assert.match(ownerConfirmation({task:'available_rooms',period:'',room:''},catalog),/tất cả khu trọ/);
 assert.match(ownerEmptyResultMessage('available_rooms'),/không có phòng nào còn trống/);
});
test('common owner questions route to the matching live read task',()=>{
 const cases:[string,string][]=[
  ['Ai chưa đăng ký tạm trú?','residents'],['Ai chưa hoàn tất hồ sơ lưu trú?','residents'],['Ai chưa đăng ký hồ sơ?','residents'],
  ['Phòng nào xài điện nhiều nhất tháng này?','electricity_ranking'],['Phòng nào tiêu thụ nhiều kWh nhất tháng 10?','electricity_ranking'],
  ['Phòng nào đang có nhiều xe nhất?','vehicle_counts'],['Phòng nào nhiều xe?','vehicle_counts'],
  ['Phòng nào hay báo hỏng nhất tháng trước?','frequent_requests'],['Phòng nào hay báo hư nhất tháng này?','frequent_requests'],['Phòng nào có nhiều khiếu nại tháng này?','frequent_requests'],
  ['Phòng nào hay báo sửa chữa nhất tháng này?','frequent_requests'],['Tiền điện tháng trước tính ra sao?','utilities'],
  ['Kỳ này còn phòng nào chưa có số điện nước để lên bill?','missing'],['Liệt kê phòng chưa có ai thuê nhé.','available_rooms'],
  ['Phòng nào chưa đóng tiền thuê kỳ này?','unpaid'],['Kỳ này còn việc gì cần kiểm tra?','overview'],
 ];
 for(const [question,task] of cases)assert.equal(ownerQuestionTask(question),task,question);
 assert.equal(ownerQuestionTask('Tổng doanh thu năm nay'),null);
 assert.equal(ownerQuestionTask('Xử lý hết mấy việc đó giúp tôi.'),null);
 assert.ok(ownerPeriodFreeTasks.has('vehicle_counts'));
 assert.ok(!ownerPeriodFreeTasks.has('electricity_ranking'));
 assert.match(ownerUnknownIntentMessage('Số xe từng phòng',catalog),/phòng nào đang có nhiều xe nhất/);
});
test('unknown or multiple named rooms require clarification; no room means explicit all-room proposal',()=>{
 for(const q of ['phòng A01','phòng K9-P99','phòng K1-P01 và K2-P02'])assert.equal(proposeOwnerScope(q,'unpaid',catalog).room,null,q);
 assert.equal(proposeOwnerScope('phòng nào chưa đóng tiền','unpaid',catalog).room,'');
 assert.match(ownerConfirmation({task:'requests',period:'2026-10',room:''},catalog),/tất cả phòng thuộc tài khoản/);
});
test('natural clarification replies resolve only a listed month and one unambiguous room',()=>{
 assert.deepEqual(parseOwnerClarificationReply('tháng 9','period',catalog),{resolved:true,value:'2026-09'});
 assert.deepEqual(parseOwnerClarificationReply('tháng 8','period',catalog),{resolved:false,value:null});
 assert.deepEqual(parseOwnerClarificationReply('phòng K1-P01','room',catalog),{resolved:true,value:'K1-P01'});
 assert.deepEqual(parseOwnerClarificationReply('tất cả phòng','room',catalog),{resolved:true,value:''});
 assert.deepEqual(parseOwnerClarificationReply('phòng K1-P01 và K2-P02','room',catalog),{resolved:false,value:null});
 assert.deepEqual(parseOwnerClarificationReply('phòng K9-P99','room',catalog),{resolved:false,value:null});
 const liveCatalog={...catalog,rooms:['Nhà A / K1-P01 [101]','Nhà B / K2-P02 [202]']};
 assert.deepEqual(parseOwnerClarificationReply('K2-P02','room',liveCatalog),{resolved:true,value:'Nhà B / K2-P02 [202]'});
});
test('a different supported task starts a new interpretation but the current task wording does not',()=>{
 assert.equal(namesDifferentOwnerTask('xem tiền điện tháng 10','unpaid'),true);
 assert.equal(namesDifferentOwnerTask('xem phòng nào chưa đóng tiền tháng 10','unpaid'),false);
 assert.equal(namesDifferentOwnerTask('kiểm tra yêu cầu từ người thuê','utilities'),true);
 assert.equal(namesDifferentOwnerTask('thống kê cư dân đang ở','unpaid'),true);
 assert.equal(namesDifferentOwnerTask('danh sách các phòng còn trống','unpaid'),true);
 assert.match(ownerConfirmation({task:'residents',period:'2026-10',room:''},catalog),/thống kê cư dân hiện tại/);
});
test('unknown owner questions say they are not understood and suggest supported topics',()=>{
 const message=ownerUnknownIntentMessage('Tạo chỗ sạc xe điện tháng sau',catalog);
 assert.match(message,/chưa hiểu yêu cầu “Tạo chỗ sạc xe điện tháng sau”/);
 assert.match(message,/chưa được cập nhật/);
 assert.match(message,/Có phải bạn muốn hỏi/);
 assert.match(message,/hóa đơn chưa thanh toán/);
 assert.match(message,/tạo tiện ích miễn phí hoặc có phí/);
 const clipped=ownerUnknownIntentMessage('x'.repeat(140),catalog);
 assert.ok(clipped.includes('“'+'x'.repeat(120)+'”'));
 assert.ok(!clipped.includes('x'.repeat(121)));
});
test('empty results use copy that matches the selected owner task',()=>{
 assert.match(ownerEmptyResultMessage('unpaid'),/hóa đơn.*chưa thanh toán/);
 assert.match(ownerEmptyResultMessage('requests'),/yêu cầu tiện ích hoặc khiếu nại/);
 assert.match(ownerEmptyResultMessage('missing'),/dữ liệu lập hóa đơn.*còn thiếu/);
 assert.match(ownerEmptyResultMessage('utilities'),/điện nước/);
 assert.match(ownerEmptyResultMessage('overview'),/hóa đơn cần kiểm tra/);
});
test('room reminder requests extract a specific room and editable notice text',()=>{
 assert.deepEqual(parseOwnerRoomReminder('Tôi muốn cảnh báo phòng 302 quên khóa cửa'),{roomCode:'302',message:'Vui lòng kiểm tra và khóa cửa phòng khi ra ngoài.'});
 assert.deepEqual(parseOwnerRoomReminder('Nhắc phòng A-02: nhớ đóng cổng'),{roomCode:'A-02',message:'Chủ trọ nhắc: nhớ đóng cổng.'});
 assert.deepEqual(parseOwnerRoomReminder('Thông báo phòng'),{roomCode:null,message:''});
 assert.equal(parseOwnerRoomReminder('Xem phòng 302 có hóa đơn không'),null);
});
