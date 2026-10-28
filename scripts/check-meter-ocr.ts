import sharp from "sharp";
import {recognizeMeter} from "../backend/src/resident-assistant/assistant.routes.js";
async function main(){
const png=await sharp(Buffer.from('<svg width="900" height="180"><rect width="100%" height="100%" fill="white"/><text x="40" y="125" font-size="100" font-family="Arial" fill="black">12345.678</text></svg>')).png().toBuffer();
console.log("Synthetic numeric image OCR:",await recognizeMeter(png));

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
