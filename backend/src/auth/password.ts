import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

const deriveKey = (password: string, salt: string, length: number) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, length, (error, key) => error ? reject(error) : resolve(key as Buffer));
});

const dummySalt = randomBytes(16).toString("hex");
const dummyHash = `scrypt$${dummySalt}$${scryptSync(randomBytes(32).toString("hex"), dummySalt, 64).toString("hex")}`;

export async function verifyPassword(password: string, encodedHash: string | null | undefined): Promise<boolean> {
  const stored = encodedHash ?? dummyHash;
  const [algorithm, salt, hash, extra] = stored.split("$");
  const validEncoding = algorithm === "scrypt" && /^[a-f\d]{32}$/i.test(salt ?? "") && /^[a-f\d]{128}$/i.test(hash ?? "") && extra === undefined;
  const expected = validEncoding ? Buffer.from(hash!, "hex") : Buffer.from(dummyHash.split("$")[2]!, "hex");
  const actual = await deriveKey(password, validEncoding ? salt! : dummySalt, expected.length);
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
  return Boolean(encodedHash) && validEncoding && matches;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await deriveKey(password, salt, 64)).toString("hex")}`;
}
