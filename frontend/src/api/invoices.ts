import { api } from './client';
import type { Invoice, CostDashboardData, InvoiceStatus, RecurringInvoice } from '../types';

export interface CreateInvoicePayload {
  type?: 'OWNER' | 'STABLE';
  supplier?: string;
  category: string;
  date: string;
  totalAmount: number;
  notes?: string;
  status?: InvoiceStatus;
  stableId?: string;
  splits: { horseId: string; ownerId?: string; amount: number }[];
  file?: File;
}

export async function listInvoices(params?: {
  status?: InvoiceStatus;
  category?: string;
  from?: string;
  to?: string;
  horseId?: string;
}): Promise<Invoice[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.category) qs.set('category', params.category);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.horseId) qs.set('horseId', params.horseId);
  const query = qs.toString() ? `?${qs}` : '';
  return api<Invoice[]>(`/invoices${query}`);
}

export async function getInvoice(id: string): Promise<Invoice> {
  return api<Invoice>(`/invoices/${id}`);
}

export async function listHorseInvoices(horseId: string): Promise<Invoice[]> {
  return api<Invoice[]>(`/invoices/horse/${horseId}`);
}

export async function createInvoice(payload: CreateInvoicePayload): Promise<Invoice> {
  const form = new FormData();
  if (payload.type) form.append('type', payload.type);
  if (payload.supplier) form.append('supplier', payload.supplier);
  form.append('category', payload.category);
  form.append('date', payload.date);
  form.append('totalAmount', String(payload.totalAmount));
  if (payload.notes) form.append('notes', payload.notes);
  if (payload.status) form.append('status', payload.status);
  if (payload.stableId) form.append('stableId', payload.stableId);
  form.append('splits', JSON.stringify(payload.splits));
  if (payload.file) form.append('file', payload.file);

  return api<Invoice>('/invoices', { method: 'POST', body: form });
}

export async function updateInvoice(
  id: string,
  payload: Partial<CreateInvoicePayload>
): Promise<Invoice> {
  const form = new FormData();
  if (payload.supplier !== undefined) form.append('supplier', payload.supplier || '');
  if (payload.category) form.append('category', payload.category);
  if (payload.date) form.append('date', payload.date);
  if (payload.totalAmount !== undefined) form.append('totalAmount', String(payload.totalAmount));
  if (payload.notes !== undefined) form.append('notes', payload.notes || '');
  if (payload.status) form.append('status', payload.status);
  if (payload.splits) form.append('splits', JSON.stringify(payload.splits));
  if (payload.file) form.append('file', payload.file);

  return api<Invoice>(`/invoices/${id}`, { method: 'PUT', body: form });
}

export async function updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
  return api<Invoice>(`/invoices/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteInvoice(id: string): Promise<void> {
  await api(`/invoices/${id}`, { method: 'DELETE' });
}

// ─── Recurring invoices ───────────────────────────────────────

export interface CreateRecurringPayload {
  type?: 'OWNER' | 'STABLE';
  supplier?: string;
  category: string;
  totalAmount: number;
  notes?: string;
  dayOfMonth: number;
  startDate: string;
  endDate?: string;
  stableId?: string;
  splits: { horseId: string; ownerId?: string; amount: number }[];
}

export async function listRecurringInvoices(): Promise<RecurringInvoice[]> {
  return api<RecurringInvoice[]>('/invoices/recurring');
}

export async function createRecurringInvoice(payload: CreateRecurringPayload): Promise<RecurringInvoice> {
  return api<RecurringInvoice>('/invoices/recurring', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRecurringInvoice(id: string, payload: Partial<CreateRecurringPayload>): Promise<RecurringInvoice> {
  return api<RecurringInvoice>(`/invoices/recurring/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function toggleRecurringInvoice(id: string): Promise<RecurringInvoice> {
  return api<RecurringInvoice>(`/invoices/recurring/${id}/toggle`, { method: 'PATCH' });
}

export async function deleteRecurringInvoice(id: string): Promise<void> {
  await api(`/invoices/recurring/${id}`, { method: 'DELETE' });
}

// ─── Cost summary ─────────────────────────────────────────────

export async function getCostSummary(params?: {
  year?: number;
  horseId?: string;
}): Promise<CostDashboardData> {
  const qs = new URLSearchParams();
  if (params?.year) qs.set('year', String(params.year));
  if (params?.horseId) qs.set('horseId', params.horseId);
  const query = qs.toString() ? `?${qs}` : '';
  return api<CostDashboardData>(`/invoices/costs/summary${query}`);
}
