export type RoomImageUploadOutcome = { name: string; ok: boolean; error?: unknown };

export async function uploadRoomImagesSequentially(
  roomId: string,
  files: File[],
  upload: (roomId: string, file: File) => Promise<unknown>,
): Promise<RoomImageUploadOutcome[]> {
  const outcomes: RoomImageUploadOutcome[] = [];
  for (const file of files) {
    try {
      await upload(roomId, file);
      outcomes.push({ name: file.name, ok: true });
    } catch (error) {
      outcomes.push({ name: file.name, ok: false, error });
    }
  }
  return outcomes;
}

export async function createRoomWithImages<TRoom>(
  create: () => Promise<TRoom>,
  getRoomId: (room: TRoom) => string,
  files: File[],
  upload: (roomId: string, file: File) => Promise<unknown>,
) {
  const room = await create();
  const outcomes = await uploadRoomImagesSequentially(getRoomId(room), files, upload);
  return { room, outcomes };
}

export async function createRoomsSequentially<TRoom>(
  roomCodes: string[],
  create: (roomCode: string) => Promise<TRoom>,
  onProgress?: (current: number, total: number) => void,
) {
  const successes: Array<{ roomCode: string; room: TRoom }> = [];
  const failures: Array<{ roomCode: string; error: unknown }> = [];
  for (let index = 0; index < roomCodes.length; index += 1) {
    const roomCode = roomCodes[index]!;
    onProgress?.(index + 1, roomCodes.length);
    try { successes.push({ roomCode, room: await create(roomCode) }); }
    catch (error) { failures.push({ roomCode, error }); }
  }
  return { successes, failures };
}

export async function attachImagesToCreatedRooms<TResult>(
  roomIds: string[],
  files: File[],
  attach: (roomIds: string[], files: File[]) => Promise<TResult>,
): Promise<TResult | null> {
  if (roomIds.length === 0 || files.length === 0) return null;
  return attach(roomIds, files);
}
