import { api } from './client';
import type { HorseDocument } from '../types';

export async function listDocuments(horseId: string): Promise<HorseDocument[]> {
  return api<HorseDocument[]>(`/horses/${horseId}/documents`);
}

export interface UploadDocumentPayload {
  name: string;
  category: string;
  expiresAt?: string;
  notes?: string;
  file: File;
}

export async function uploadDocument(
  horseId: string,
  payload: UploadDocumentPayload
): Promise<HorseDocument> {
  const form = new FormData();
  form.append('name', payload.name);
  form.append('category', payload.category);
  if (payload.expiresAt) form.append('expiresAt', payload.expiresAt);
  if (payload.notes) form.append('notes', payload.notes);
  form.append('file', payload.file);
  return api<HorseDocument>(`/horses/${horseId}/documents`, { method: 'POST', body: form });
}

export async function deleteDocument(horseId: string, docId: string): Promise<void> {
  await api(`/horses/${horseId}/documents/${docId}`, { method: 'DELETE' });
}

export async function listExpiringDocuments(): Promise<HorseDocument[]> {
  return api<HorseDocument[]>('/documents/expiring');
}
