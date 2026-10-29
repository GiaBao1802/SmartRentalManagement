import AdminShell from '../../components/admin-shell';
import {OwnerRoomRequests} from '../../components/room-requests';
export const metadata={title:'Yêu cầu & Khiếu nại'};
export default function RequestsPage(){return <AdminShell active="/admin/requests"><main className="admin-main admin-requests-page"><OwnerRoomRequests/></main></AdminShell>;}
