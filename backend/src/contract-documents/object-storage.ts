export type ObjectStorageObject = {
  storageKey: string;
  checksumSha256: string;
  fileName: string;
  mimeType: string;
  fileSize: bigint;
};

/** Binary storage stays behind this boundary; keys are never part of an API DTO. */
export interface ObjectStorage {
  readonly available: boolean;
  stage(input: { fileName: string; mimeType: string; bytes: AsyncIterable<Uint8Array> }): Promise<ObjectStorageObject & { cleanup(): Promise<void> }>;
  createReadUrl(storageKey: string): Promise<string>;
}

export class UnconfiguredObjectStorage implements ObjectStorage {
  readonly available = false;
  async stage(): Promise<never> { throw new Error("Object storage is not configured."); }
  async createReadUrl(): Promise<never> { throw new Error("Object storage is not configured."); }
}

/** Test-only adapter. Never wire this adapter into a production runtime. */
export class FakeObjectStorage implements ObjectStorage {
  readonly available = true;
  private readonly objects = new Map<string, Uint8Array>();
  async stage(input: { fileName: string; mimeType: string; bytes: AsyncIterable<Uint8Array> }) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of input.bytes) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const storageKey = `fake/${crypto.randomUUID()}`;
    this.objects.set(storageKey, bytes);
    return {
      storageKey, checksumSha256: (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex"),
      fileName: input.fileName, mimeType: input.mimeType, fileSize: BigInt(bytes.length),
      cleanup: async () => { this.objects.delete(storageKey); },
    };
  }
  async createReadUrl(storageKey: string) {
    if (!this.objects.has(storageKey)) throw new Error("Object does not exist.");
    return `https://fake.invalid/${encodeURIComponent(storageKey)}?expires=short`;
  }
}
