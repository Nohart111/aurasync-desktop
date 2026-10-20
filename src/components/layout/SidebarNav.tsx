'use client';

import React, { useState, useEffect } from 'react';
import {
  Compass,
  Library,
  Disc3,
  CloudDownload,
  Upload,
  Loader2,
  ListMusic,
  Plus,
} from 'lucide-react';
import { SmartIngestModal } from '@/components/modals/SmartIngestModal';

export interface CustomPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: string;
}

interface SidebarNavProps {
  currentView?: string;
  onViewChange?: (view: string) => void;
  onFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function SidebarNav({ onViewChange, onFileUpload }: SidebarNavProps) {
  const [activeView, setActiveView] = useState<'deck' | 'library'>('deck');
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<CustomPlaylist[]>([]);
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [isUploadingLocal, setIsUploadingLocal] = useState(false);

  useEffect(() => {
    const loadPlaylists = () => {
      try {
        const raw = localStorage.getItem('aurasound_playlists_v1');
        if (raw) setPlaylists(JSON.parse(raw));
      } catch {}
    };
    loadPlaylists();

    const handlePlaylistUpdated = () => loadPlaylists();
    const handleExternalViewChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.view) setActiveView(detail.view);
      if (detail?.playlistId !== undefined) setActivePlaylistId(detail.playlistId);
    };

    window.addEventListener('aurasound:playlists-updated', handlePlaylistUpdated);
    window.addEventListener('aurasound:navigate', handleExternalViewChange);
    return () => {
      window.removeEventListener('aurasound:playlists-updated', handlePlaylistUpdated);
      window.removeEventListener('aurasound:navigate', handleExternalViewChange);
    };
  }, []);

  const switchView = (view: 'deck' | 'library', playlistId: string | null = null) => {
    setActiveView(view);
    setActivePlaylistId(playlistId);
    if (onViewChange) onViewChange(view);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aurasound:view-change', {
          detail: { view, playlistId },
        })
      );
    }
  };

  const handleLocalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onFileUpload) {
      onFileUpload(e);
      return;
    }
    const file = e.target.files?.[0];
    if (!file || isUploadingLocal) return;

    setIsUploadingLocal(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/tracks/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('aurasound:track-added', { detail: data.track }));
        }
      }
    } catch (err) {
      console.error('Lỗi tải file:', err);
    } finally {
      setIsUploadingLocal(false);
      e.target.value = '';
    }
  };

  return (
    <>
      <aside className="w-60 shrink-0 border-r border-zinc-800/80 bg-[#050508] p-5 flex flex-col justify-between select-none">
        <div className="space-y-6 overflow-y-auto pr-0.5">
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200">
              <Disc3 className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tracking-tight text-white">AuraSound</span>
              <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono text-zinc-400 border border-zinc-800">
                HI-FI
              </span>
            </div>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => switchView('deck', null)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeView === 'deck'
                  ? 'border border-zinc-800 bg-zinc-900/90 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <Compass className="h-4 w-4" />
              <span>Bàn phát nhạc</span>
            </button>

            <button
              onClick={() => switchView('library', null)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeView === 'library' && !activePlaylistId
                  ? 'border border-zinc-800 bg-zinc-900/90 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <span className="flex items-center gap-3">
                <Library className="h-4 w-4" />
                <span>Thư viện</span>
              </span>
              {playlists.length > 0 && (
                <span className="text-[10px] font-mono text-zinc-500">{playlists.length}</span>
              )}
            </button>
          </nav>

          {/* DANH SÁCH PLAYLIST NHANH */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              <span>Playlist</span>
              <button
                onClick={() => switchView('library', 'CREATE_NEW')}
                className="flex items-center gap-0.5 text-zinc-400 hover:text-white transition"
                title="Tạo playlist mới"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tạo mới</span>
              </button>
            </div>

            {playlists.length === 0 ? (
              <button
                onClick={() => switchView('library', 'CREATE_NEW')}
                className="w-full text-left px-3 py-2 rounded-xl border border-dashed border-zinc-800/80 text-[11px] text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition"
              >
                + Tạo playlist đầu tiên
              </button>
            ) : (
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {playlists.map((pl) => {
                  const isSelected = activeView === 'library' && activePlaylistId === pl.id;
                  return (
                    <button
                      key={pl.id}
                      onClick={() => switchView('library', pl.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                        isSelected
                          ? 'bg-zinc-800/90 text-white font-medium'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate pr-2">
                        <ListMusic className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                        <span className="truncate">{pl.name}</span>
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                        {pl.trackIds.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="h-px bg-zinc-800/70" />

          <div className="space-y-2">
            <button
              onClick={() => setIsIngestOpen(true)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all border border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 text-zinc-200 hover:text-white"
            >
              <CloudDownload className="h-4 w-4 text-zinc-400" />
              <span>Tải nhạc YouTube</span>
            </button>

            <label className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all border border-zinc-800/60 bg-zinc-950/50 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 cursor-pointer">
              {isUploadingLocal ? (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              ) : (
                <Upload className="h-4 w-4 text-zinc-500" />
              )}
              <span>{isUploadingLocal ? 'Đang tải lên...' : 'Tải file từ máy'}</span>
              <input
                type="file"
                accept="audio/*"
                onChange={handleLocalFileChange}
                disabled={isUploadingLocal}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-900 flex items-center justify-between text-[11px] font-mono text-zinc-500 px-1">
          <span>CLOUD CDN</span>
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            ONLINE
          </span>
        </div>
      </aside>

      <SmartIngestModal isOpen={isIngestOpen} onClose={() => setIsIngestOpen(false)} />
    </>
  );
}

export default SidebarNav;
