import React, {useCallback, useEffect, useState} from 'react';
import {Navbar} from './components/Navbar';
import {TransferWorkbench} from './components/TransferWorkbench';
import {PlatformsSection} from './components/PlatformsSection';
import {HistorySection} from './components/HistorySection';
import {SharedPlaylistView} from './components/SharedPlaylistView';
import type {PlatformId, TransferHistoryEntry} from './types';

const HISTORY_STORAGE_KEY = 'trackshift_history_v1';

function getShareIdFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/p\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export default function App() {
  const [activeShareId, setActiveShareId] = useState<string | null>(() => getShareIdFromPath());
  const [sourcePlatform, setSourcePlatform] = useState<PlatformId>('spotify');
  const [destinationPlatform, setDestinationPlatform] = useState<PlatformId>('apple');
  const [history, setHistory] = useState<TransferHistoryEntry[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as TransferHistoryEntry[]) : [];
    } catch {
      return [];
    }
  });
  const [reloadedEntry, setReloadedEntry] = useState<TransferHistoryEntry | null>(null);

  useEffect(() => {
    const onPopState = () => {
      setActiveShareId(getShareIdFromPath());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToSharePage = useCallback((shareId: string) => {
    window.history.pushState({}, '', `/p/${shareId}`);
    setActiveShareId(shareId);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }, []);

  const navigateHome = useCallback(() => {
    window.history.pushState({}, '', '/');
    setActiveShareId(null);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }, []);

  const persistHistory = (next: TransferHistoryEntry[]) => {
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next.slice(0, 20)));
    } catch {
      // ignore storage quota errors
    }
  };

  const handleSaveHistory = (entry: TransferHistoryEntry) => {
    persistHistory([entry, ...history.filter((h) => h.id !== entry.id)]);
  };

  const handleDeleteHistory = (id: string) => {
    persistHistory(history.filter((h) => h.id !== id));
  };

  const handleClearHistory = () => {
    persistHistory([]);
  };

  if (activeShareId) {
    return <SharedPlaylistView shareId={activeShareId} onNavigateHome={navigateHome} />;
  }

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#FAFAFA] text-neutral-900">
      <Navbar />

      <main className="flex-1">
        {/* Crisp Minimalist Editorial Hero */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-8 sm:pt-16 sm:pb-10">
          <div className="max-w-2xl">
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-neutral-900 leading-[1.1] [text-wrap:balance]">
              Move your playlists across music apps without losing a track.
            </h1>
            <p className="mt-4 text-base sm:text-lg text-neutral-600 leading-relaxed max-w-xl">
              Share a playlist link from Spotify, Apple Music, YouTube Music, or SoundCloud, verify every track match with audio previews, and get a clean player link or export.
            </p>
          </div>
        </section>

        {/* Primary Focal Anchor: Transfer Workbench */}
        <TransferWorkbench
          sourcePlatform={sourcePlatform}
          onChangeSourcePlatform={setSourcePlatform}
          destinationPlatform={destinationPlatform}
          onChangeDestinationPlatform={setDestinationPlatform}
          onSaveHistory={handleSaveHistory}
          onOpenSharePage={navigateToSharePage}
          reloadedEntry={reloadedEntry}
          onClearReloadedEntry={() => setReloadedEntry(null)}
        />

        {/* Supported Platforms & Studio Context */}
        <PlatformsSection onSelectSource={(p) => setSourcePlatform(p)} />

        {/* Zero-Login Local Transfer History */}
        <HistorySection
          entries={history}
          onReload={(entry) => {
            setReloadedEntry(entry);
            document.getElementById('workbench')?.scrollIntoView({behavior: 'smooth'});
          }}
          onOpenSharePage={navigateToSharePage}
          onDelete={handleDeleteHistory}
          onClearAll={handleClearHistory}
        />
      </main>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-neutral-500">
          <div className="flex items-center gap-3">
            <span className="font-display font-semibold text-neutral-900">Trackshift</span>
            <span aria-hidden="true">·</span>
            <span>Spotify, Apple Music, YouTube Music & SoundCloud</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#workbench" className="hover:text-neutral-900 transition-colors">
              Transfer
            </a>
            <a href="#platforms" className="hover:text-neutral-900 transition-colors">
              Platforms
            </a>
            <a href="#history" className="hover:text-neutral-900 transition-colors">
              History
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
