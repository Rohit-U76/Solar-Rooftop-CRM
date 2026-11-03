import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { fetchProtectedBillObjectUrl } from '../lib/apiClient.ts';
import type { WorkspaceMode } from '../types/domain.ts';

interface ProtectedBillImageProps {
  storageRef: string;
  alt: string;
  workspaceMode?: WorkspaceMode;
  className?: string;
}

export function ProtectedBillImage({
  storageRef,
  alt,
  workspaceMode,
  className = 'w-full h-auto rounded-lg object-contain max-h-[540px]',
}: ProtectedBillImageProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [failed, setFailed] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    let objectUrlToRevoke: string | null = null;

    async function load() {
      if (!storageRef) {
        setFailed(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setFailed(false);
      try {
        const url = await fetchProtectedBillObjectUrl(storageRef, workspaceMode);
        if (!active) {
          if (url.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        if (url.startsWith('blob:')) {
          objectUrlToRevoke = url;
        }
        setResolvedUrl(url);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [storageRef, workspaceMode]);

  if (loading) {
    return (
      <div className="w-full min-h-[280px] bg-slate-100 border border-slate-200 rounded-lg flex flex-col items-center justify-center gap-2 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-800" />
        <span className="text-xs">Loading protected electricity bill document...</span>
      </div>
    );
  }

  if (failed || !resolvedUrl) {
    return (
      <div className="w-full min-h-[280px] bg-slate-100 border border-slate-200 rounded-lg flex flex-col items-center justify-center gap-2 p-6 text-center">
        <FileText className="w-8 h-8 text-slate-400" />
        <p className="text-sm font-medium text-slate-700">Electricity Bill Document Preview</p>
        <p className="text-xs text-slate-500 max-w-xs">
          Protected bill image unavailable or restricted. Authorized users may upload a replacement scan.
        </p>
      </div>
    );
  }

  return (
    <img
      src={resolvedUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
