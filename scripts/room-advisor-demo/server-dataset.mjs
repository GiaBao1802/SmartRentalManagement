import {createDemoServer} from './server.mjs';
import {datasetInventory} from './dataset.mjs';
const port=Number(process.env.ROOM_ADVISOR_PORT||4326);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid port');
createDemoServer({inventoryFor:datasetInventory,datasetMode:true}).listen(port,'127.0.0.1',()=>console.log(`Demo 300 phòng giả lập: http://127.0.0.1:${port}`));
