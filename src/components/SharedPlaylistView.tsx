import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  SkipForward,
} from 'lucide-react';
import type {PlatformId, SharedPlaylist} from '../types';
import {
  PLATFORMS,
  PLATFORM_MAP,
  PlatformLogo,
  downloadPlaylistExport,
  formatDuration,
  formatTotalDuration,
} from '../lib/platforms';

interface SharedPlaylistViewProps {
  shareId: string;
  onNavigateHome: () => void;
}

function buildTrackPlayerUrl(
  player: PlatformId,
  title: string,
  artist: string,
  originalDestPlatform: PlatformId,
  originalDestUrl?: string
): string {
  if (player === originalDestPlatform && originalDestUrl) {
    return originalDestUrl;
  }
  const query = encodeURIComponent(`${artist} ${title}`.trim());
  switch (player) {
    case 'apple':
      return `https://music.apple.com/us/search?term=${query}`;
    case 'spotify':
      return `https://open.spotify.com/search/${query}`;
    case 'youtube':
      return `https://music.youtube.com/search?q=${query}`;
    case 'soundcloud':
      return `https://soundcloud.com/search/sounds?q=${query}`;
  }
}

export function SharedPlaylistView({shareId, onNavigateHome}: SharedPlaylistViewProps) {
  const [playlist, setPlaylist] = useState<SharedPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlayer, setSelectedPlayer] = useState<PlatformId>('apple');
  const [copiedLink, setCopiedLink] = useState(false);

  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [queueIndex, setQueueIndex] = useState(0);
  const [openedTracks, setOpenedTracks] = useState<Record<string, boolean>>({});
  const [resolvingYt, setResolvingYt] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/playlists/${encodeURIComponent(shareId)}`)
      .then(async (res) => {
        const data = (await res.json()) as SharedPlaylist & {error?: string};
        if (!res.ok) throw new Error(data.error || 'Playlist link not found.');
        if (active) {
          setPlaylist(data);
          setSelectedPlayer(data.destinationPlatform);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load playlist.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [shareId]);

  const tracks = useMemo(() => playlist?.rows.filter((r) => r.included) || [], [playlist]);

  const playPreviewAt = (idx: number) => {
    if (idx < 0 || idx >= tracks.length) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingIdx(null);
      return;
    }
    const row = tracks[idx];
    const url = row.match?.previewUrl;
    if (!url) {
      // skip to next track with preview
      const next = tracks.findIndex((r, i) => i > idx && Boolean(r.match?.previewUrl));
      if (next !== -1) playPreviewAt(next);
      else setPlayingIdx(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audio.volume = 0.7;
    audio.onended = () => {
      const next = tracks.findIndex((r, i) => i > idx && Boolean(r.match?.previewUrl));
      if (next !== -1) playPreviewAt(next);
      else setPlayingIdx(null);
    };
    audioRef.current = audio;
    setPlayingIdx(idx);
    void audio.play().catch(() => setPlayingIdx(null));
  };

  const togglePlayIndex = (idx: number) => {
    if (playingIdx === idx) {
      if (audioRef.current) audioRef.current.pause();
      setPlayingIdx(null);
    } else {
      playPreviewAt(idx);
    }
  };

  const handleCopyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleResolveYouTubeQueue = async () => {
    if (!playlist) return;
    setResolvingYt(true);
    try {
      const res = await fetch(`/api/playlists/${encodeURIComponent(playlist.shareId)}/youtube-queue`, {
        method: 'POST',
      });
      const data = (await res.json()) as {nativePlaylistUrl?: string; error?: string};
      if (res.ok && data.nativePlaylistUrl) {
        setPlaylist((prev) => (prev ? {...prev, nativePlaylistUrl: data.nativePlaylistUrl} : prev));
      }
    } finally {
      setResolvingYt(false);
    }
  };

  const currentQueueRow = tracks[queueIndex];
  const currentQueueUrl = currentQueueRow
    ? buildTrackPlayerUrl(
        selectedPlayer,
        currentQueueRow.match?.title || currentQueueRow.source.title,
        currentQueueRow.match?.artist || currentQueueRow.source.artist,
        playlist?.destinationPlatform || 'apple',
        currentQueueRow.match?.destinationUrl
      )
    : '#';

  const handleStepQueue = () => {
    if (!currentQueueRow) return;
    setOpenedTracks((prev) => ({...prev, [currentQueueRow.source.id]: true}));
    if (queueIndex < tracks.length - 1) {
      setQueueIndex(queueIndex + 1);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-neutral-900">
      <header className="sticky top-0 z-30 bg-[#FAFAFA]/90 backdrop-blur-md border-b border-neutral-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Trackshift Studio</span>
          </button>

          <button
            type="button"
            onClick={handleCopyShareUrl}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Link Copied' : 'Copy Playlist Link'}</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {loading ? (
          <div className="bg-white border border-neutral-200 rounded-2xl p-12 flex items-center justify-center gap-3 text-sm text-neutral-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading playlist...</span>
          </div>
        ) : error || !playlist ? (
          <div className="bg-white border border-neutral-200 rounded-2xl p-10 text-center">
            <h1 className="font-display text-xl font-semibold text-neutral-900">Playlist link unavailable</h1>
            <p className="text-sm text-neutral-600 mt-2">{error || 'This shared playlist could not be found.'}</p>
            <button
              type="button"
              onClick={onNavigateHome}
              className="mt-5 px-4 py-2 text-xs font-medium text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 cursor-pointer"
            >
              Create a new transfer
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Playlist Header Card */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-5 min-w-0">
                <img
                  src={playlist.artworkUrl || '/src/assets/images/playlist_cover_minimal_1794840278825.jpg'}
                  alt={playlist.playlistTitle}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = '/src/assets/images/playlist_cover_minimal_1794840278825.jpg';
                  }}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover border border-neutral-200 shrink-0 bg-neutral-100"
                />
                <div className="min-w-0">
                  <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 truncate">
                    {playlist.playlistTitle}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-neutral-500 mt-2">
                    <span className="tabular-nums">{tracks.length} tracks</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{formatTotalDuration(tracks.map((r) => r.match || r.source))}</span>
                    {playlist.creator && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{playlist.creator}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {tracks.some((r) => r.match?.previewUrl) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (playingIdx !== null) togglePlayIndex(playingIdx);
                      else {
                        const first = tracks.findIndex((r) => Boolean(r.match?.previewUrl));
                        if (first !== -1) playPreviewAt(first);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl transition-colors cursor-pointer"
                  >
                    {playingIdx !== null ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{playingIdx !== null ? 'Pause Previews' : 'Play Previews'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    downloadPlaylistExport('m3u8', playlist.playlistTitle, selectedPlayer, playlist.rows)
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-xl transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>M3U8</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadPlaylistExport('csv', playlist.playlistTitle, selectedPlayer, playlist.rows)
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-xl transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
              </div>
            </div>

            {/* Player Selector & Guided Quick-Open Launcher */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-base font-semibold text-neutral-900">Open in Your Music Player</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Choose the app you listen on, then open the full queue or step through each track to save it.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlayer(p.id)}
                      className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        selectedPlayer === p.id
                          ? 'bg-white text-neutral-900 shadow-xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      <PlatformLogo platform={p.id} className="w-3.5 h-3.5" />
                      <span>{p.shortName}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Native Full Playlist Launcher for YouTube / OAuth Playlists */}
              {playlist.nativePlaylistUrl && (selectedPlayer === 'youtube' || playlist.nativePlaylistUrl.includes('spotify')) && (
                <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-neutral-900">
                      Instant {selectedPlayer === 'youtube' ? 'YouTube Music' : PLATFORM_MAP[selectedPlayer].name} Playlist Ready
                    </div>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      Opens the full multi-track playlist directly in the player.
                    </p>
                  </div>
                  <a
                    href={playlist.nativePlaylistUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Open Full Playlist</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {selectedPlayer === 'youtube' && !playlist.nativePlaylistUrl && (
                <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-neutral-600">
                    Generate a 1-click native YouTube playlist link that queues all tracks automatically.
                  </div>
                  <button
                    type="button"
                    disabled={resolvingYt}
                    onClick={handleResolveYouTubeQueue}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    {resolvingYt && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{resolvingYt ? 'Building YouTube Queue...' : 'Generate YouTube Playlist Link'}</span>
                  </button>
                </div>
              )}

              {/* Step-by-Step Guided Track Launcher */}
              {currentQueueRow && (
                <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-neutral-500 tabular-nums">
                      Track {queueIndex + 1} of {tracks.length}
                      {Object.keys(openedTracks).length > 0 && (
                        <> · {Object.keys(openedTracks).length} opened</>
                      )}
                    </div>
                    <div className="font-medium text-sm text-neutral-900 truncate mt-0.5">
                      {currentQueueRow.match?.title || currentQueueRow.source.title} —{' '}
                      <span className="text-neutral-600 font-normal">
                        {currentQueueRow.match?.artist || currentQueueRow.source.artist}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={currentQueueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleStepQueue}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <span>Open in {PLATFORM_MAP[selectedPlayer].shortName}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    {queueIndex < tracks.length - 1 && (
                      <button
                        type="button"
                        onClick={() => setQueueIndex(queueIndex + 1)}
                        aria-label="Skip to next track"
                        className="p-2 text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-100 cursor-pointer"
                      >
                        <SkipForward className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Tracklist Table */}
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
              <div className="divide-y divide-neutral-100">
                {tracks.map((row, idx) => {
                  const title = row.match?.title || row.source.title;
                  const artist = row.match?.artist || row.source.artist;
                  const artwork = row.match?.artworkUrl || row.source.artworkUrl;
                  const duration = row.match?.durationMs || row.source.durationMs;
                  const previewUrl = row.match?.previewUrl;
                  const isPlaying = playingIdx === idx;
                  const isOpened = Boolean(openedTracks[row.source.id]);
                  const trackUrl = buildTrackPlayerUrl(
                    selectedPlayer,
                    title,
                    artist,
                    playlist.destinationPlatform,
                    row.match?.destinationUrl
                  );

                  return (
                    <div
                      key={row.source.id}
                      className="px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-neutral-50/70 transition-colors"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span className="text-xs font-mono tabular-nums text-neutral-400 w-6 shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>

                        {previewUrl ? (
                          <button
                            type="button"
                            onClick={() => togglePlayIndex(idx)}
                            aria-label={isPlaying ? `Pause ${title}` : `Play preview of ${title}`}
                            className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                              isPlaying
                                ? 'bg-neutral-900 text-white border-neutral-900'
                                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                            }`}
                          >
                            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                          </button>
                        ) : null}

                        {artwork ? (
                          <img
                            src={artwork}
                            alt={title}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-md object-cover border border-neutral-200 shrink-0 bg-neutral-100"
                          />
                        ) : null}

                        <div className="min-w-0">
                          <div className="font-medium text-sm text-neutral-900 truncate">{title}</div>
                          <div className="text-xs text-neutral-500 truncate">
                            {artist}
                            {duration ? ` · ${formatDuration(duration)}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {isOpened && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label="Opened" />
                        )}
                        <a
                          href={trackUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setOpenedTracks((prev) => ({...prev, [row.source.id]: true}))}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <span>Open in {PLATFORM_MAP[selectedPlayer].shortName}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
