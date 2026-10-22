'use client';

import React, { useState, useEffect } from 'react';
import {
  Radio,
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
import { playMechanicalSound } from '@/core/audio/SoundEffects';

interface SidebarNavProps {
  currentView?: string;
  onViewChange?: (view: string) => void;
  onFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function SidebarNav({ onViewChange, onFileUpload }: SidebarNavProps) {
  const [activeView, setActiveView] = useState<string>('vault');
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(true);
  const [isQuickCreating, setIsQuickCreating] = useState(false);
  const [quickName, setQuickName] = useState('');

  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const [isUploadingLocal, setIsUploadingLocal] = useState(false);

  const {
    isSidebarCollapsed,
    toggleSidebar,
    customPlaylists,
    likedTrackIds,
    createPlaylist,
  } = usePlayerStore();

  const playlists = customPlaylists || [];

  // Lắng nghe phím tắt Ctrl+B để mở/thu gọn thanh bên
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        playMechanicalSound('toggle');
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  // Đồng bộ view active với page.tsx qua CustomEvent
  useEffect(() => {
    const handleSwitchView = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) {
        setActiveView(detail);
      }
    };
    window.addEventListener('aurasound:switch-view', handleSwitchView);
    return () => {
      window.removeEventListener('aurasound:switch-view', handleSwitchView);
    };
  }, []);

  const handleDeckClick = () => {
    playMechanicalSound('switch');
    setActiveView('vault');
    if (onViewChange) onViewChange('vault');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aurasound:switch-view', { detail: 'vault' }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleExploreClick = () => {
    playMechanicalSound('switch');
    setActiveView('explore');
    if (onViewChange) onViewChange('explore');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aurasound:switch-view', { detail: 'explore' }));
      const el = document.getElementById('catalog-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleVaultClick = () => {
    playMechanicalSound('switch');
    setActiveView('vault');
    if (onViewChange) onViewChange('vault');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aurasound:switch-view', { detail: 'vault' }));
      const el = document.getElementById('catalog-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleFavoritesClick = () => {
    playMechanicalSound('switch');
    setActiveView('favorites');
    if (onViewChange) onViewChange('favorites');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aurasound:switch-view', { detail: 'favorites' }));
      const el = document.getElementById('catalog-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handlePlaylistClick = (playlistId: string) => {
    playMechanicalSound('switch');
    setActiveView(playlistId);
    if (onViewChange) onViewChange(playlistId);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aurasound:switch-view', { detail: playlistId }));
      const el = document.getElementById('catalog-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleQuickCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickName.trim();
    if (!trimmed) return;

    playMechanicalSound('toggle');
    const newId = createPlaylist(trimmed);
    setQuickName('');
    setIsQuickCreating(false);
    setIsPlaylistOpen(true);
    handlePlaylistClick(newId);
  };

  const handleLocalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    playMechanicalSound('switch');
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
        playMechanicalSound('beep');
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
        } shrink-0 border-r border-white/[0.08] bg-[#050508]/95 backdrop-blur-xl py-5 hidden md:flex flex-col justify-between select-none transition-all duration-300 ease-in-out z-30`}
      >
        <div className="space-y-5 overflow-y-auto overflow-x-hidden pr-0.5">
          {/* Header & Logo */}
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between px-1'}`}>
            {!isSidebarCollapsed && (
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-amber-400 shrink-0 shadow-inner">
                  <Disc3 className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold tracking-tight text-white font-display">AuraSound</span>
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-mono text-zinc-300 border border-white/15">
                    HI-FI
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={() => {
                playMechanicalSound('toggle');
                toggleSidebar();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0 active:scale-95"
              title={isSidebarCollapsed ? 'Mở rộng thanh bên (Ctrl+B)' : 'Thu gọn thanh bên (Ctrl+B)'}
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1">
            {/* 1. Bàn phát nhạc (Deck) */}
            <button
              onClick={handleDeckClick}
              title="Bàn phát nhạc"
              className={`w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3.5 py-2.5'
              } rounded-xl text-xs font-mono transition-all active:scale-95 cursor-pointer ${
                activeView === 'vault'
                  ? 'border border-white/20 bg-white/[0.08] text-white font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <Radio className={`h-4 w-4 shrink-0 ${activeView === 'vault' ? 'text-amber-400' : 'text-zinc-400'}`} />
              {!isSidebarCollapsed && <span>Bàn phát nhạc</span>}
            </button>

            {/* 2. Khám phá (Explore) */}
            <button
              onClick={handleExploreClick}
              title="Khám phá Thịnh hành"
              className={`w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3.5 py-2.5'
              } rounded-xl text-xs font-mono transition-all active:scale-95 cursor-pointer ${
                activeView === 'explore'
                  ? 'border border-white/20 bg-white/[0.08] text-white font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <Compass className={`h-4 w-4 shrink-0 ${activeView === 'explore' ? 'text-amber-400' : 'text-zinc-400'}`} />
              {!isSidebarCollapsed && <span>Khám phá</span>}
            </button>

            {/* 3. Kho nhạc (Library / Vault) */}
            <button
              onClick={handleVaultClick}
              title="Kho nhạc lưu trữ"
              className={`w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center px-0 py-3' : 'justify-between px-3.5 py-2.5'
              } rounded-xl text-xs font-mono font-medium transition-all active:scale-95 cursor-pointer ${
                activeView === 'vault'
                  ? 'border border-white/20 bg-white/[0.08] text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              <span className="flex items-center gap-3">
                <Library className="h-4 w-4 shrink-0" />
                {!isSidebarCollapsed && <span>Kho nhạc</span>}
              </span>
              {!isSidebarCollapsed && playlists.length > 0 && (
                <span className="text-[10px] font-mono text-zinc-500">{playlists.length} PL</span>
              )}
            </button>
          </nav>

          {/* Playlist Section */}
          {!isSidebarCollapsed ? (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between px-2 py-1">
                <button
                  onClick={() => {
                    playMechanicalSound('toggle');
                    setIsPlaylistOpen(!isPlaylistOpen);
                  }}
                  className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
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
                    playMechanicalSound('toggle');
                    setIsQuickCreating(!isQuickCreating);
                    setIsPlaylistOpen(true);
                  }}
                  className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer active:scale-95"
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
                    className="w-full px-2.5 py-1.5 rounded-lg border border-white/20 bg-black/60 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/50 shadow-sm font-mono"
                  />
                  <button
                    type="submit"
                    disabled={!quickName.trim()}
                    className="p-1.5 rounded-lg bg-white text-black hover:bg-zinc-200 disabled:opacity-40 shrink-0 cursor-pointer transition active:scale-95"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}

              {isPlaylistOpen && (
                <div className="space-y-0.5 max-h-48 overflow-y-auto pr-0.5">
                  {/* Bài hát yêu thích */}
                  <button
                    onClick={handleFavoritesClick}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono transition-all cursor-pointer active:scale-95 ${
                      activeView === 'favorites'
                        ? 'border border-rose-500/40 bg-rose-500/15 text-rose-300 font-semibold shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Heart className="h-3.5 w-3.5 shrink-0 text-rose-500 fill-rose-500" />
                      <span className="truncate">Yêu thích</span>
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                      {(likedTrackIds || []).length}
                    </span>
                  </button>

                  {/* Playlists cá nhân */}
                  {playlists.map((pl) => {
                    const isSelected = activeView === pl.id;
                    return (
                      <button
                        key={pl.id}
                        onClick={() => handlePlaylistClick(pl.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono transition-all cursor-pointer active:scale-95 ${
                          isSelected
                            ? 'border border-amber-400/40 bg-amber-400/15 text-amber-200 font-semibold shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate pr-2">
                          <ListMusic className="h-3.5 w-3.5 shrink-0 text-amber-400" />
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
              onClick={handleFavoritesClick}
              title="Bài hát yêu thích"
              className={`w-full flex items-center justify-center py-3 rounded-xl transition-all cursor-pointer active:scale-95 ${
                activeView === 'favorites'
                  ? 'border border-rose-500/40 bg-rose-500/20 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                  : 'text-zinc-400 hover:text-rose-400 hover:bg-white/[0.04]'
              }`}
            >
              <Heart className="h-4 w-4 fill-current text-rose-500" />
            </button>
          )}

          <div className="h-px bg-white/[0.08]" />

          {/* Action Buttons: Tải nhạc YouTube & Upload File */}
          <div className="space-y-2">
            <button
              onClick={() => {
                playMechanicalSound('switch');
                setIsIngestOpen(true);
              }}
              title="Tải nhạc YouTube"
              className={`btn-cyberdeck w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-2.5 px-3.5 py-2.5'
              } rounded-xl text-xs font-mono font-medium transition-all text-zinc-200 hover:text-white cursor-pointer`}
            >
              <CloudDownload className="h-4 w-4 text-amber-400 shrink-0" />
              {!isSidebarCollapsed && <span>Tải nhạc YouTube</span>}
            </button>

            <label
              title="Tải file từ máy"
              className={`btn-cyberdeck w-full flex items-center ${
                isSidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-2.5 px-3.5 py-2.5'
              } rounded-xl text-xs font-mono font-medium transition-all text-zinc-400 hover:text-zinc-200 cursor-pointer`}
            >
              {isUploadingLocal ? (
                <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
              ) : (
                <Upload className="h-4 w-4 text-zinc-400 shrink-0" />
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

        {/* Footer: CLOUD CDN Indicator */}
        <div
          className={`pt-4 border-t border-white/[0.08] flex items-center ${
            isSidebarCollapsed ? 'justify-center' : 'justify-between px-1'
          } text-[11px] font-mono text-zinc-500`}
        >
          {!isSidebarCollapsed && <span className="tracking-wider">CLOUD CDN</span>}
          <span className="flex items-center gap-1.5 text-emerald-400" title="Cloud CDN Online (44.1kHz High-Fidelity)">
            <span className="led-status text-emerald-400" />
            {!isSidebarCollapsed && <span className="text-[10px] tracking-wider font-bold">ONLINE</span>}
          </span>
        </div>
      </aside>

      <SmartIngestModal isOpen={isIngestOpen} onClose={() => setIsIngestOpen(false)} />
    </>
  );
}

export default SidebarNav;
