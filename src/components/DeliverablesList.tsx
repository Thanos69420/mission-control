/**
 * DeliverablesList Component
 * Displays deliverables (files, URLs, artifacts) for a task
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { FileText, Link as LinkIcon, Package, ExternalLink, Eye, FolderSearch, X, FileDown } from 'lucide-react';
import { debug } from '@/lib/debug';
import type { TaskDeliverable } from '@/lib/types';

interface DeliverablesListProps {
  taskId: string;
}

export function DeliverablesList({ taskId }: DeliverablesListProps) {
  const [deliverables, setDeliverables] = useState<TaskDeliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  const loadDeliverables = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/deliverables`);
      if (res.ok) {
        const data = await res.json();
        setDeliverables(data);
      }
    } catch (error) {
      console.error('Failed to load deliverables:', error);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadDeliverables();
  }, [loadDeliverables]);

  const getDeliverableIcon = (type: string) => {
    switch (type) {
      case 'file':
        return <FileText className="w-5 h-5" />;
      case 'url':
        return <LinkIcon className="w-5 h-5" />;
      case 'artifact':
        return <Package className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const handleOpen = async (deliverable: TaskDeliverable) => {
    if (!deliverable.path) return;

    // URLs open directly in new tab
    if (deliverable.deliverable_type === 'url') {
      window.open(deliverable.path, '_blank');
      return;
    }

    // For files, prefer in-dashboard/browser-accessible preview/download endpoint
    const previewUrl = `/api/files/preview?path=${encodeURIComponent(deliverable.path)}`;
    const downloadUrl = `/api/files/download?path=${encodeURIComponent(deliverable.path)}&raw=true`;

    try {
      debug.file('Opening file preview endpoint', { path: deliverable.path });
      const probe = await fetch(previewUrl, { method: 'GET' });
      if (probe.ok) {
        window.open(previewUrl, '_blank');
      } else {
        // Fallback for non-previewable file types
        window.open(downloadUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to open file in browser:', error);
      window.open(downloadUrl, '_blank');
    }
  };

  const handleReveal = async (deliverable: TaskDeliverable) => {
    if (!deliverable.path) return;

    try {
      const res = await fetch('/api/files/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: deliverable.path }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error?.error || 'Failed to reveal file');
      }
    } catch {
      alert('Could not reveal file location on this server.');
    }
  };

  const handlePreview = (deliverable: TaskDeliverable) => {
    if (deliverable.path) {
      debug.file('Opening inline preview', { path: deliverable.path });
      setPreviewPath(deliverable.path);
      setPreviewTitle(deliverable.title || 'Preview');
    }
  };

  const handleGeneratePdf = async (deliverable: TaskDeliverable) => {
    setGeneratingPdfId(deliverable.id);
    try {
      const res = await fetch(`/api/tasks/${taskId}/deliverables/${deliverable.id}/pdf`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate PDF');
      }

      await loadDeliverables();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to generate PDF');
    } finally {
      setGeneratingPdfId(null);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-mc-text-secondary">Loading deliverables...</div>
      </div>
    );
  }

  if (deliverables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-mc-text-secondary">
        <div className="text-4xl mb-2">📦</div>
        <p>No deliverables yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {deliverables.map((deliverable) => (
          <div
            key={deliverable.id}
            className="flex gap-3 p-3 bg-mc-bg rounded-lg border border-mc-border hover:border-mc-accent transition-colors"
          >
            {/* Icon */}
            <div className="flex-shrink-0 text-mc-accent">
              {getDeliverableIcon(deliverable.deliverable_type)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Title - clickable for URLs */}
              <div className="flex items-start justify-between gap-2">
                {deliverable.deliverable_type === 'url' && deliverable.path ? (
                  <a
                    href={deliverable.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-mc-accent hover:text-mc-accent/80 hover:underline flex items-center gap-1.5"
                  >
                    {deliverable.title}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <h4 className="font-medium text-mc-text">{deliverable.title}</h4>
                )}
                <div className="flex items-center gap-1">
                  {/* Preview + PDF buttons for HTML files */}
                  {deliverable.deliverable_type === 'file' && /\.html?$/i.test(deliverable.path || '') && (
                    <>
                      <button
                        onClick={() => handlePreview(deliverable)}
                        className="flex-shrink-0 p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-accent-cyan"
                        title="Preview inline"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleGeneratePdf(deliverable)}
                        disabled={generatingPdfId === deliverable.id}
                        className="flex-shrink-0 p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-accent-yellow disabled:opacity-50"
                        title="Generate PDF"
                      >
                        <FileDown className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {/* Open button */}
                  {deliverable.path && (
                    <button
                      onClick={() => handleOpen(deliverable)}
                      className="flex-shrink-0 p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-accent"
                      title={deliverable.deliverable_type === 'url' ? 'Open URL' : 'Open in browser'}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}
                  {/* Reveal on server button (local desktop/server only) */}
                  {deliverable.deliverable_type === 'file' && deliverable.path && (
                    <button
                      onClick={() => handleReveal(deliverable)}
                      className="flex-shrink-0 p-1.5 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
                      title="Reveal on server"
                    >
                      <FolderSearch className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Description */}
              {deliverable.description && (
                <p className="text-sm text-mc-text-secondary mt-1">
                  {deliverable.description}
                </p>
              )}

              {/* Path - clickable for URLs */}
              {deliverable.path && (
                deliverable.deliverable_type === 'url' ? (
                  <a
                    href={deliverable.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 p-2 bg-mc-bg-tertiary rounded text-xs text-mc-accent hover:text-mc-accent/80 font-mono break-all block hover:bg-mc-bg-tertiary/80"
                  >
                    {deliverable.path}
                  </a>
                ) : (
                  <div className="mt-2 p-2 bg-mc-bg-tertiary rounded text-xs text-mc-text-secondary font-mono break-all">
                    {deliverable.path}
                  </div>
                )
              )}

              {/* Metadata */}
              <div className="flex items-center gap-4 mt-2 text-xs text-mc-text-secondary">
                <span className="capitalize">{deliverable.deliverable_type}</span>
                <span>•</span>
                <span>{formatTimestamp(deliverable.created_at)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Inline preview modal */}
      {previewPath && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl h-[85vh] bg-mc-bg border border-mc-border rounded-lg overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-mc-border bg-mc-bg-secondary">
              <div className="text-sm font-medium text-mc-text truncate">{previewTitle}</div>
              <button
                onClick={() => {
                  setPreviewPath(null);
                  setPreviewTitle('');
                }}
                className="p-1.5 rounded hover:bg-mc-bg-tertiary text-mc-text-secondary"
                title="Close preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe
              src={`/api/files/preview?path=${encodeURIComponent(previewPath)}`}
              className="w-full h-full bg-white"
              title="Deliverable preview"
            />
          </div>
        </div>
      )}
    </>
  );
}
