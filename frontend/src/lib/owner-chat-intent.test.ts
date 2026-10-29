import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeOwnerScope,ownerConfirmation,parseOwnerClarificationReply,namesDifferentOwnerTask,ownerUnknownIntentMessage,ownerQuestionMentionsPeriod,ownerEmptyResultMessage,parseOwnerRoomReminder,isOwnerAvailableRoomsQuestion,ownerQuestionTask,ownerPeriodFreeTasks,shouldContinueUnpaidInvoiceScope,ownerTransactionCode,parseOwnerResidentRequest,isOwnerSensitiveDataRequest,isOwnerResidentProfileLookup,ownerResidentProfileName,ownerSensitiveDataRefusalMessage,isOwnerAffirmativeReply} from './owner-chat-intent';
const catalog={tasks:{unpaid:'Hóa đơn chưa thanh toán',requests:'Yêu cầu từ người thuê'},asOf:'2026-10-28',periods:['2026-10','2026-09'],rooms:['K1-P01','K2-P02']};
test('owner Cloudy recognizes only standalone acknowledgments as confirmations',()=>{
 for(const phrase of ['ok','OK!','u','ừ','được rồi','đúng rồi','đồng ý','tiếp tục','tiếp đi'])assert.equal(isOwnerAffirmativeReply(phrase),true,phrase);
 for(const phrase of ['ok tháng 9','không','ừm'])assert.equal(isOwnerAffirmativeReply(phrase),false,phrase);
});
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
test('elliptical paid-invoice follow-ups retain the prior unpaid query scope only when scope is omitted',()=>{
 assert.equal(shouldContinueUnpaidInvoiceScope('thế đã thanh toán','unpaid','paid'),true);
 assert.equal(shouldContinueUnpaidInvoiceScope('thế tháng 9 đã thanh toán','unpaid','paid'),false);
 assert.equal(shouldContinueUnpaidInvoiceScope('phòng K1-P01 đã thanh toán','unpaid','paid'),false);
 assert.equal(shouldContinueUnpaidInvoiceScope('thế đã thanh toán','utilities','paid'),false);
});
test('demo transaction codes are extracted exactly for a read-only invoice lookup',()=>{
 assert.equal(ownerTransactionCode('Tìm hóa đơn có mã giao dịch DEMO-1793206220292-3A988AA3'),'DEMO-1793206220292-3A988AA3');
 assert.equal(ownerTransactionCode('mã DEMO-1793206220292-3A988AAA'),'DEMO-1793206220292-3A988AAA');
 assert.equal(ownerTransactionCode('tìm mã giao dịch bất kỳ'),null);
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
  ['Phòng nào đang có nhiều xe nhất?','vehicle_counts'],['Phòng nào nhiều xe?','vehicle_counts'],['Thống kê xe gửi theo từng phòng','vehicle_counts'],['T01 đang có mấy xe?','vehicle_counts'],
  ['Phòng nào dùng điện ít nhất tháng 9?','electricity_lowest'],
  ['Phòng nào đang trống để cho thuê?','available_rooms'],['Phòng nào dùng nước nhiều nhất tháng 9?','water_ranking'],['Xếp hạng lượng nước tiêu thụ tháng 9','water_ranking'],
  ['Có bao nhiêu yêu cầu đang chờ/đang xử lý?','open_requests'],['Yêu cầu nào tháng 10 cần xử lý?','actionable_requests'],['Khách đang yêu cầu bổ sung tiện ích gì?','amenity_requests'],['Liệt kê phản ánh về khu vực chung','common_area_requests'],['Phòng nào còn cư dân chưa đăng ký tạm trú?','resident_registration_by_room'],
  ['Tổng cộng có bao nhiêu xe?','vehicle_total'],['Phòng nào có nhiều cư dân nhất?','resident_ranking'],
  ['Phòng nào hay báo hỏng nhất tháng trước?','frequent_requests'],['Phòng nào hay báo hư nhất tháng này?','frequent_requests'],['Phòng nào có nhiều khiếu nại tháng này?','frequent_requests'],
  ['Phòng nào hay báo sửa chữa nhất tháng này?','frequent_requests'],['Tiền điện tháng trước tính ra sao?','utilities'],
  ['Có bao nhiêu tin nhắn phản hồi từ khách?','feedback_messages'],['Thống kê số lượng góp ý từ cư dân tháng này','feedback_messages'],
  ['Kỳ này còn phòng nào chưa có số điện nước để lên bill?','missing'],['Liệt kê phòng chưa có ai thuê nhé.','available_rooms'],
  ['Cho tôi hóa đơn tháng 9','invoices'],['Liệt kê hóa đơn tháng này','invoices'],['Hóa đơn A02 tháng 9 đã chốt chưa?','invoices'],
  ['Hợp đồng nào đã hết hạn?','contract_management'],['Hợp đồng phòng A01 sắp hết hạn','contract_management'],
  ['Phòng nào chưa đóng tiền thuê kỳ này?','unpaid'],['T06 còn phải đóng bao nhiêu tiền tháng 9?','unpaid'],['Thế đã thanh toán thì sao?','paid'],['Hóa đơn nào đã đóng tiền tháng này?','paid'],['Liệt kê các phòng đã thanh toán tháng 9','paid'],['Tìm hóa đơn có mã giao dịch DEMO-1793206220292-3A988AA3','transaction_lookup'],['Tên cư dân ở khu vực An Bình Biên Hòa · Phòng A02','resident_profile_lookup'],['Ai đang thuê phòng A02?','resident_profile_lookup'],['Đang quản lý bao nhiêu khu trọ?','property_total'],['Phòng nào thiếu chỉ số điện/nước?','missing'],['Phòng nào thiếu dữ liệu lập hóa đơn?','missing'],['Trước khi chốt hóa đơn cần kiểm tra gì?','overview'],['Việc cần kiểm tra trong kỳ hóa đơn','overview'],['Kỳ này còn việc gì cần kiểm tra?','overview'],
 ];
 for(const [question,task] of cases)assert.equal(ownerQuestionTask(question),task,question);
 assert.deepEqual(proposeOwnerScope('Cho tôi hóa đơn tháng 9','invoices',catalog),{task:'invoices',period:'2026-09',room:''});
 assert.deepEqual(proposeOwnerScope('Yêu cầu nào tháng 10 cần xử lý?','actionable_requests',catalog),{task:'actionable_requests',period:'2026-10',room:''});
 assert.deepEqual(proposeOwnerScope('Hóa đơn A02 tháng 9 đã chốt chưa?','invoices',{...catalog,rooms:['Khu A / A02 [12]']}),{task:'invoices',period:'2026-09',room:'Khu A / A02 [12]'});
 assert.equal(ownerQuestionTask('Tổng doanh thu năm nay'),null);
 assert.equal(ownerQuestionTask('Xử lý hết mấy việc đó giúp tôi.'),null);
 assert.ok(ownerPeriodFreeTasks.has('vehicle_counts'));
 assert.ok(!ownerPeriodFreeTasks.has('electricity_ranking'));
 assert.match(ownerUnknownIntentMessage('Số xe từng phòng',catalog),/phòng nào đang có nhiều xe nhất/);
});
test('resident create and name-search requests are separated from resident statistics',()=>{
 assert.deepEqual(parseOwnerResidentRequest('Thêm 1 cư dân tên Võ Công Phi'),{kind:'create',name:'Võ Công Phi'});
 assert.deepEqual(parseOwnerResidentRequest('Tìm người thuê Võ Thanh Hà'),{kind:'search',name:'Võ Thanh Hà'});
 assert.deepEqual(parseOwnerResidentRequest('Thêm cư dân'),{kind:'create',name:null});
 for(const question of ['Thống kê cư dân đang ở','Ai chưa hoàn tất đăng ký tạm trú?','Có bao nhiêu người thuê?'])assert.equal(parseOwnerResidentRequest(question),null,question);
});
test('requests to add or expose resident personal data are refused without echoing the submitted values',()=>{
 const sensitiveRequests=[
  'Thêm số điện thoại 0901234567 cho cư dân phòng A01',
  'Bổ sung SĐT cho người thuê',
  'Cập nhật CCCD 079123456789 cho người thuê',
  'Bổ sung ngày sinh và địa chỉ nhà của cư dân',
  'Lưu email cá nhân và số tài khoản ngân hàng của khách thuê',
  'Thêm cư dân tên Võ Công Phi, số điện thoại 0901234567 và CCCD 079123456789',
 ];
 for(const question of sensitiveRequests){
  assert.equal(isOwnerSensitiveDataRequest(question),true,question);
  assert.equal(ownerQuestionTask(question),'sensitive_data_refusal',question);
 }
 assert.equal(isOwnerSensitiveDataRequest('Phòng nào chưa đóng tiền tháng này?'),false);
 assert.equal(isOwnerSensitiveDataRequest('Thêm phòng A06 vào khu trọ An Bình'),false);
 assert.equal(isOwnerSensitiveDataRequest('Thêm 1 cư dân tên Võ Công Phi'),false);
 assert.doesNotMatch(ownerSensitiveDataRefusalMessage,/0901234567|079123456789|Võ Công Phi/);
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
 assert.equal(namesDifferentOwnerTask('thế đã thanh toán','unpaid'),true);
 assert.equal(namesDifferentOwnerTask('chưa thanh toán','paid'),true);
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
 assert.match(ownerEmptyResultMessage('paid'),/hóa đơn đã thanh toán/);
 assert.match(ownerEmptyResultMessage('invoices','2026-09'),/không có hóa đơn nào trong tháng 09\/2026/i);
 assert.match(ownerEmptyResultMessage('invoices'),/Không có hóa đơn nào trong kỳ/);
 assert.match(ownerEmptyResultMessage('unpaid','2026-09'),/tháng 09\/2026.*ngày kết thúc kỳ/);
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

test('scoped resident profile lookup permits one named person and refuses account-wide identity lists',()=>{
 for(const [question,name] of [['Cho tôi CCCD của cư dân Võ Thanh Hà','Võ Thanh Hà'],['Tìm số điện thoại người thuê Nguyễn An','Nguyễn An'],['Xem hồ sơ cư dân tên Lê Minh Anh','Lê Minh Anh'],['Thông tin cư dân Võ Thanh Hà','Võ Thanh Hà']] as const){assert.equal(isOwnerSensitiveDataRequest(question),false,question);assert.equal(isOwnerResidentProfileLookup(question),true,question);assert.equal(ownerQuestionTask(question),'resident_profile_lookup',question);assert.equal(ownerResidentProfileName(question),name,question);}
 assert.equal(ownerQuestionTask('Ai đang thuê phòng A02?'),'resident_profile_lookup');assert.equal(ownerQuestionTask('Liệt kê CCCD của tất cả cư dân'),'sensitive_data_refusal');
});
