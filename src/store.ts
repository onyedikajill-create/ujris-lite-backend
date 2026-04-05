// Shared in-memory store (replace with database in production)
export const fileStore = new Map<string, {
  id: string;
  name: string;
  size: number;
  type: string;
  buffer: Buffer;
  caseId: string;
  uploadedAt: string;
}>();
