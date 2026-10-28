// Validate the existing backend session on every request; never trust client roles.
export class AccessError extends Error {
 constructor(status,message){super(message);this.status=status;}
}
export async function requireOwner(req,{fetchImpl=fetch,apiBase=process.env.OWNER_ADVISOR_API_BASE||'http://localhost:4000/api/v1'}={}){
 const cookies=(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('gt_session='));
 if(cookies.length!==1||!/^gt_session=[A-Za-z0-9_%.-]{1,2048}$/.test(cookies[0]))throw new AccessError(401,'Vui lòng đăng nhập tài khoản chủ trọ tại http://localhost:3000/login rồi mở lại trang này.');
 const endpoint=new URL(apiBase.replace(/\/$/,'')+'/auth/me');
 if(endpoint.protocol!=='http:'||!['localhost','127.0.0.1'].includes(endpoint.hostname)||endpoint.username||endpoint.password)throw new AccessError(503,'Cấu hình máy chủ xác thực local không hợp lệ.');
 let response,data;
 try{
  response=await fetchImpl(endpoint,{headers:{Cookie:cookies[0]},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(response.status===401)throw new AccessError(401,'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  if(response.status===403)throw new AccessError(403,'Tính năng chỉ dành cho chủ trọ đã đăng nhập.');
  if(!response.ok)throw new Error('auth unavailable');
  data=(await response.json()).data;
 }catch(error){if(error instanceof AccessError)throw error;throw new AccessError(503,'Chưa kết nối được máy chủ xác thực. Vui lòng chạy backend quản lý.');}
 if(data?.account?.role!=='admin'||data.account.status!=='active'||!/^\d+$/.test(data.profile?.owner_id||'')||!/^\d+$/.test(data.account.account_id||''))throw new AccessError(403,'Tính năng chỉ dành cho chủ trọ đã đăng nhập.');
 return {ownerId:data.profile.owner_id,accountId:data.account.account_id,role:'admin'};
}
