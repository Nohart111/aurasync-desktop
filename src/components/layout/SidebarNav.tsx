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
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Heart,
  Check,
} from 'lucide-react';
import { SmartIngestModal } from '@/components/modals/SmartIngestModal';
import { usePlayerStore } from '@/store/usePlayerStore';

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
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(true);
  const [isQuickCreating, setIsQuickCreating] = useState(false);
  const [quickName, setQuickName] = useState('');

  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [isUploadingLocal, setIsUploadingLocal] = useState(false);

  const { isSidebarCollapsed, toggleSidebar } = usePlayerStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

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

  const handleQuickCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickName.trim();
    if (!trimmed) return;

    const newPl: CustomPlaylist = {
      id: `pl-${Date.now()}`,
      name: trimmed,
      trackIds: [],
      createdAt: new Date().toISOString(),
    };
    const updated = [newPl, ...playlists];
    setPlaylists(updated);
    try {
      localStorage.setItem('aurasound_playlists_v1', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('aurasound:playlists-updated'));
    } catch {}
    setQuickName('');
    setIsQuickCreating(false);
    setIsPlaylistOpen(true);
    switchView('library', newPl.id);
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
      <aside
        className={`${
          isSidebarCollapsed ? 'w-20 px-3' : 'w-64 px-4'
        } shrink-0 border-r border-zinc-800/80 bg-[#050508] py-5 flex flex-col justify-between select-none transition-all duration-300 ease-in-out z-30`}
      >
        <div className="space-y-5 overflow-y-auto overflow-x-hidden pr-0.5">
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between px-1'}`}>
            {!isSidebarCollapsed && (
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 shrink-0">
                  <Disc3 className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold tracking-tight text-white">AuraSound</span>
                  <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono text-zinc-400 border border-zinc-800">
                    HI-FI
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={toggleSidebar}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-900/50 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
              title={isSidebarCollapsed ? 'Mở rộng thanh bên (Ctrl+B)' : 'Thu gọn thanh bên (Ctrl+B)'}
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => switchView('deck', null)}
              title="Bàn phát nhạc"
              className={`w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3.5 py-2.5'
              } rounded-xl text-xs font-medium transition-all ${
                activeView === 'deck'
                  ? 'border border-zinc-800 bg-zinc-900/90 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <Compass className="h-4 w-4 shrink-0" />
              {!isSidebarCollapsed && <span>Bàn phát nhạc</span>}
            </button>

            <button
              onClick={() => switchView('library', null)}
              title="Thư viện"
              className={`w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center px-0 py-3' : 'justify-between px-3.5 py-2.5'
              } rounded-xl text-xs font-medium transition-all ${
                activeView === 'library' && !activePlaylistId
                  ? 'border border-zinc-800 bg-zinc-900/90 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <span className="flex items-center gap-3">
                <Library className="h-4 w-4 shrink-0" />
                {!isSidebarCollapsed && <span>Thư viện</span>}
              </span>
              {!isSidebarCollapsed && playlists.length > 0 && (
                <span className="text-[10px] font-mono text-zinc-500">{playlists.length}</span>
              )}
            </button>
          </nav>

          {!isSidebarCollapsed ? (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between px-2 py-1">
                <button
                  onClick={() => setIsPlaylistOpen(!isPlaylistOpen)}
                  className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400 hover:text-zinc-200 transition"
                >
                  {isPlaylistOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                  )}
                  <span>Playlist ({playlists.length})</span>
                </button>

                <button
                  onClick={() => {
                    setIsQuickCreating(!isQuickCreating);
                    setIsPlaylistOpen(true);
                  }}
                  className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                  title="Tạo nhanh Playlist"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {isQuickCreating && (
                <form onSubmit={handleQuickCreatePlaylist} className="px-1 pb-1.5 flex items-center gap-1">
                  <input
                    type="text"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder="Tên playlist mới..."
                    autoFocus
                    className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                  />
                  <button
                    type="submit"
                    disabled={!quickName.trim()}
                    className="p-1.5 rounded-lg bg-zinc-200 text-black hover:bg-white disabled:opacity-40 shrink-0"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}

              {isPlaylistOpen && (
                <div className="space-y-0.5 max-h-48 overflow-y-auto pr-0.5">
                  <button
                    onClick={() => switchView('library', 'LIKED')}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                      activeView === 'library' && activePlaylistId === 'LIKED'
                        ? 'bg-zinc-800/90 text-white font-medium'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Heart className="h-3.5 w-3.5 shrink-0 text-rose-500 fill-rose-500" />
                      <span className="truncate">Yêu thích</span>
                    </span>
                  </button>

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
          ) : (
            <button
              onClick={() => switchView('library', 'LIKED')}
              title="Bài hát yêu thích"
              className={`w-full flex items-center justify-center py-3 rounded-xl transition-all ${
                activeView === 'library' && activePlaylistId === 'LIKED'
                  ? 'border border-zinc-800 bg-zinc-900/90 text-rose-500'
                  : 'text-zinc-400 hover:text-rose-400 hover:bg-zinc-900/40'
              }`}
            >
              <Heart className="h-4 w-4 fill-current" />
            </button>
          )}

          <div className="h-px bg-zinc-800/70" />

          <div className="space-y-2">
            <button
              onClick={() => setIsIngestOpen(true)}
              title="Tải nhạc YouTube"
              className={`w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-2.5 px-3.5 py-2.5'
              } rounded-xl text-xs font-medium transition-all border border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 text-zinc-200 hover:text-white`}
            >
              <CloudDownload className="h-4 w-4 text-zinc-400 shrink-0" />
              {!isSidebarCollapsed && <span>Tải nhạc YouTube</span>}
            </button>

            <label
              title="Tải file từ máy"
              className={`w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-2.5 px-3.5 py-2.5'
              } rounded-xl text-xs font-medium transition-all border border-zinc-800/60 bg-zinc-950/50 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 cursor-pointer`}
            >
              {isUploadingLocal ? (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-400 shrink-0" />
              ) : (
                <Upload className="h-4 w-4 text-zinc-500 shrink-0" />
              )}
              {!isSidebarCollapsed && (
                <span>{isUploadingLocal ? 'Đang tải lên...' : 'Tải file từ máy'}</span>
              )}
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

        <div
          className={`pt-4 border-t border-zinc-900 flex items-center ${
            isSidebarCollapsed ? 'justify-center' : 'justify-between px-1'
          } text-[11px] font-mono text-zinc-500`}
        >
          {!isSidebarCollapsed && <span>CLOUD CDN</span>}
          <span className="flex items-center gap-1.5 text-emerald-400" title="Cloud CDN Online">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {!isSidebarCollapsed && <span>ONLINE</span>}
          </span>
        </div>
      </aside>

      <SmartIngestModal isOpen={isIngestOpen} onClose={() => setIsIngestOpen(false)} />
    </>
  );
}

export default SidebarNav;
