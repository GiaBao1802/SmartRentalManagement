import { apiRequest } from "./apiClient";

export type RoomImage = {
  image_id: string;
  url: string;
  is_cover: boolean;
  sort_order: number;
  created_at: string;
};

export type BulkRoomImageResult = {
  file_index: number;
  status: "attached" | "failed";
  association_count?: number;
  code?: string;
};

export type BulkRoomImageResponse = {
  room_ids: string[];
  image_results: BulkRoomImageResult[];
};

export type DeleteRoomImageResponse = {
  deleted_image_id: string;
  promoted_cover_image_id: string | null;
  physical_cleanup_pending: boolean;
};

const roomImagesPath = (propertyId: string, roomId: string) =>
  `/properties/${encodeURIComponent(propertyId)}/rooms/${encodeURIComponent(roomId)}/images`;

export const roomImageApi = {
  list(propertyId: string, roomId: string) {
    return apiRequest<RoomImage[]>(roomImagesPath(propertyId, roomId));
  },
  upload(propertyId: string, roomId: string, file: File) {
    const body = new FormData();
    body.append("file", file);
    return apiRequest<RoomImage>(roomImagesPath(propertyId, roomId), { method: "POST", body });
  },
  bulkAttach(propertyId: string, roomIds: string[], files: File[]) {
    const body = new FormData();
    body.append("room_ids", JSON.stringify(roomIds));
    files.forEach((file) => body.append("files", file));
    return apiRequest<BulkRoomImageResponse>(`/properties/${encodeURIComponent(propertyId)}/rooms/images/bulk-attach`, { method: "POST", body });
  },
  reorder(propertyId: string, roomId: string, imageIds: string[]) {
    return apiRequest<RoomImage[]>(`${roomImagesPath(propertyId, roomId)}/order`, { method: "PUT", body: JSON.stringify({ image_ids: imageIds }) });
  },
  setCover(propertyId: string, roomId: string, imageId: string) {
    return apiRequest<RoomImage>(`${roomImagesPath(propertyId, roomId)}/${encodeURIComponent(imageId)}/cover`, { method: "PUT", body: JSON.stringify({}) });
  },
  delete(propertyId: string, roomId: string, imageId: string) {
    return apiRequest<DeleteRoomImageResponse>(`${roomImagesPath(propertyId, roomId)}/${encodeURIComponent(imageId)}`, { method: "DELETE" });
  },
};

