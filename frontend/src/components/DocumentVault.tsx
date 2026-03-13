import { useEffect, useRef, useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { listDocuments, uploadDocument, deleteDocument } from '../api/documents';
import type { HorseDocument } from '../types';
import { FileText, Upload, Trash2, AlertTriangle, Clock, CheckCircle2, FolderOpen, X } from 'lucide-react';
import { toast } from 'sonner';
import { AuthenticatedImage } from './AuthenticatedImage';

const CATEGORIES = [
  'Insurance',
  'Passport & Registration',
  'Competition Licences',
  'Vet Records',
  'Other',
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  'Insurance':               'bg-blue-100 text-blue-700',
  'Passport & Registration': 'bg-purple-100 text-purple-700',
  'Competition Licences':    'bg-green-100 text-green-700',
  'Vet Records':             'bg-amber-100 text-amber-700',
  'Other':                   'bg-gray-100 text-gray-600',
};

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null;
  const days = daysUntil(expiresAt);
  const date = new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
        <AlertTriangle className="w-3 h-3" /> Expired {date}
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
        <Clock className="w-3 h-3" /> Expires {date}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
      <CheckCircle2 className="w-3 h-3" /> Expires {date}
    </span>
  );
}

interface UploadModalProps {
  horseId: string;
  onSaved: (doc: HorseDocument) => void;
  onClose: () => void;
}

function UploadModal({ horseId, onSaved, onClose }: UploadModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('Other');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) { setError('Please select a file'); return; }
    if (!name.trim()) { setError('Document name is required'); return; }

    setSaving(true);
    setError('');
    try {
      const doc = await uploadDocument(horseId, {
        name: name.trim(),
        category,
        expiresAt: expiresAt || undefined,
        notes: notes.trim() || undefined,
        file,
      });
      toast.success('Document uploaded');
      onSaved(doc);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b">
          <h2 className="font-semibold text-gray-900">Upload Document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* File picker */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-brand-400 transition-colors"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
                <FileText className="w-5 h-5 text-brand-500 shrink-0" />
                <span className="truncate max-w-[260px]">{file.name}</span>
              </div>
            ) : (
              <div className="text-sm text-gray-400">
                <Upload className="w-6 h-6 mx-auto mb-1 text-gray-300" />
                Click to choose a PDF or image
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Document name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Public Liability Insurance 2026"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Expiry date */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Expiry date (optional)</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional details…"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-brand-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface Props {
  horseId: string;
  canEdit: boolean;
}

export default function DocumentVault({ horseId, canEdit }: Props) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<HorseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    listDocuments(horseId)
      .then(setDocs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [horseId]);

  async function handleDelete(docId: string) {
    try {
      await deleteDocument(horseId, docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      toast.success('Document deleted');
    } catch {
      toast.error('Failed to delete document');
    } finally {
      setConfirmDeleteId(null);
    }
  }

  // Group docs by category for counts in the filter bar
  const categoryCounts: Record<string, number> = { All: docs.length };
  for (const doc of docs) {
    categoryCounts[doc.category] = (categoryCounts[doc.category] ?? 0) + 1;
  }

  const filtered = activeCategory === 'All'
    ? docs
    : docs.filter((d) => d.category === activeCategory);

  // Separate into expiring-soon / expired and normal for display order
  const expiringSoon = filtered.filter((d) => d.expiresAt && daysUntil(d.expiresAt) <= 30);
  const normal = filtered.filter((d) => !d.expiresAt || daysUntil(d.expiresAt) > 30);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
            <div className="h-4 w-48 bg-gray-200 rounded mb-2" />
            <div className="h-3 w-24 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Documents</h3>
          <p className="text-xs text-gray-500 mt-0.5">{docs.length} file{docs.length !== 1 ? 's' : ''} stored</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 bg-brand-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-brand-700"
          >
            <Upload className="w-4 h-4" /> Upload
          </button>
        )}
      </div>

      {/* Category filter */}
      {docs.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {['All', ...CATEGORIES].map((cat) => {
            const count = categoryCounts[cat] ?? 0;
            if (cat !== 'All' && count === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                  activeCategory === cat
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {cat} {count > 0 && <span className="opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Expiring / expired section */}
      {expiringSoon.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Needs attention</p>
          {expiringSoon.map((doc) => (
            <DocRow
              key={doc.id}
              doc={doc}
              canEdit={canEdit}
              onDelete={() => setConfirmDeleteId(doc.id)}
              highlight
            />
          ))}
        </div>
      )}

      {/* Normal docs */}
      {normal.length > 0 ? (
        <div className="space-y-2">
          {expiringSoon.length > 0 && (
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">All documents</p>
          )}
          {normal.map((doc) => (
            <DocRow
              key={doc.id}
              doc={doc}
              canEdit={canEdit}
              onDelete={() => setConfirmDeleteId(doc.id)}
            />
          ))}
        </div>
      ) : filtered.length === 0 && (
        <div className="bg-white rounded-xl border p-8 text-center">
          <FolderOpen className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {activeCategory === 'All'
              ? 'No documents uploaded yet.'
              : `No documents in "${activeCategory}".`}
          </p>
          {canEdit && activeCategory === 'All' && (
            <button
              onClick={() => setShowUpload(true)}
              className="mt-2 text-brand-600 text-sm hover:underline"
            >
              Upload the first document
            </button>
          )}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          horseId={horseId}
          onClose={() => setShowUpload(false)}
          onSaved={(doc) => {
            setDocs((prev) => [doc, ...prev]);
            setShowUpload(false);
          }}
        />
      )}

      {/* Delete confirm */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Delete document?</h3>
            <p className="text-sm text-gray-500">This cannot be undone. The file will be permanently removed.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 border rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocRow({
  doc,
  canEdit,
  onDelete,
  highlight,
}: {
  doc: HorseDocument;
  canEdit: boolean;
  onDelete: () => void;
  highlight?: boolean;
}) {
  const isPdf = doc.fileName.toLowerCase().endsWith('.pdf');
  const isImage = /\.(webp|jpg|jpeg|png|gif)$/i.test(doc.fileName);

  return (
    <div className={`bg-white rounded-xl border p-3.5 flex items-start gap-3 ${highlight ? 'border-amber-200 bg-amber-50/30' : ''}`}>
      {/* Thumbnail / icon */}
      <div className="w-10 h-10 rounded-lg overflow-hidden border bg-gray-50 shrink-0 flex items-center justify-center">
        {isImage ? (
          <AuthenticatedImage
            src={doc.fileUrl}
            alt={doc.name}
            className="w-full h-full object-cover"
            fallback={<FileText className="w-5 h-5 text-gray-300" />}
          />
        ) : (
          <FileText className="w-5 h-5 text-gray-400" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <a
            href={doc.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sm text-gray-900 hover:text-brand-600 hover:underline truncate max-w-[240px]"
          >
            {doc.name}
          </a>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[doc.category] ?? 'bg-gray-100 text-gray-600'}`}>
            {doc.category}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <ExpiryBadge expiresAt={doc.expiresAt} />
          <span className="text-xs text-gray-400">{doc.fileName}</span>
        </div>
        {doc.notes && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{doc.notes}</p>}
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1">
        <a
          href={doc.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
          title="Open"
        >
          <FileText className="w-4 h-4" />
        </a>
        {canEdit && (
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
