import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import type {
  ParsedPlaylist,
  PlatformId,
  SourceTrack,
  TrackMatchRow,
  TransferHistoryEntry,
} from '../types';
import {
  PLATFORMS,
  PLATFORM_MAP,
  PlatformLogo,
  SAMPLE_PRESETS,
  detectPlatformFromInput,
  downloadPlaylistExport,
  formatDuration,
  formatTotalDuration,
} from '../lib/platforms';

interface TransferWorkbenchProps {
  sourcePlatform: PlatformId;
  onChangeSourcePlatform: (p: PlatformId) => void;
  destinationPlatform: PlatformId;
  onChangeDestinationPlatform: (p: PlatformId) => void;
  onSaveHistory: (entry: TransferHistoryEntry) => void;
  onOpenSharePage: (shareId: string) => void;
  reloadedEntry: TransferHistoryEntry | null;
  onClearReloadedEntry: () => void;
}

type InputMode = 'link' | 'text';
type MatchFilter = 'all' | 'matched' | 'review' | 'unmatched';

export function TransferWorkbench({
  sourcePlatform,
  onChangeSourcePlatform,
  destinationPlatform,
  onChangeDestinationPlatform,
  onSaveHistory,
  onOpenSharePage,
  reloadedEntry,
  onClearReloadedEntry,
}: TransferWorkbenchProps) {
  const [inputMode, setInputMode] = useState<InputMode>('link');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [rawTracklist, setRawTracklist] = useState('');
  const [autoDetectedNotice, setAutoDetectedNotice] = useState<string | null>(null);

  const [isLoadingParse, setIsLoadingParse] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const [parseError, setParseError] = useState<string | null>(null);
  const [playlistMeta, setPlaylistMeta] = useState<ParsedPlaylist | null>(null);
  const [playlistTitleEdit, setPlaylistTitleEdit] = useState('');
  const [rows, setRows] = useState<TrackMatchRow[]>([]);

  const [filter, setFilter] = useState<MatchFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newTrackInput, setNewTrackInput] = useState('');

  const [playingRowId, setPlayingRowId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [transferResult, setTransferResult] = useState<{
    mode: 'oauth_synced' | 'hybrid_bundle';
    playlistUrl?: string;
    shareId?: string;
    shareUrl?: string;
    nativePlaylistUrl?: string;
    addedCount: number;
  } | null>(null);
  const [copiedList, setCopiedList] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Load history entry into workbench if user clicked "Open in Studio"
  useEffect(() => {
    if (!reloadedEntry) return;
    onChangeSourcePlatform(reloadedEntry.sourcePlatform);
    onChangeDestinationPlatform(reloadedEntry.destinationPlatform);
    setPlaylistUrl(reloadedEntry.sourceUrl || '');
    setPlaylistTitleEdit(reloadedEntry.playlistTitle);
    setPlaylistMeta({
      title: reloadedEntry.playlistTitle,
      artworkUrl: reloadedEntry.artworkUrl,
      sourcePlatform: reloadedEntry.sourcePlatform,
      sourceUrl: reloadedEntry.sourceUrl,
      tracks: reloadedEntry.rows.map((r) => r.source),
      parseMethod: 'sample_preset',
    });
    setRows(reloadedEntry.rows);
    setTransferResult(null);
    setParseError(null);
    onClearReloadedEntry();
  }, [reloadedEntry, onChangeSourcePlatform, onChangeDestinationPlatform, onClearReloadedEntry]);

  const stopPreviewAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingRowId(null);
  };

  const handleTogglePreview = (rowId: string, previewUrl?: string) => {
    if (!previewUrl) return;
    if (playingRowId === rowId) {
      stopPreviewAudio();
      return;
    }
    stopPreviewAudio();
    const audio = new Audio(previewUrl);
    audio.volume = 0.7;
    audio.onended = () => setPlayingRowId(null);
    audio.onerror = () => setPlayingRowId(null);
    audioRef.current = audio;
    setPlayingRowId(rowId);
    void audio.play().catch(() => setPlayingRowId(null));
  };

  const handleUrlInputChange = (val: string) => {
    setPlaylistUrl(val);
    setParseError(null);
    const detected = detectPlatformFromInput(val);
    if (detected && detected !== sourcePlatform) {
      onChangeSourcePlatform(detected);
      if (destinationPlatform === detected) {
        onChangeDestinationPlatform(detected === 'apple' ? 'spotify' : 'apple');
      }
      setAutoDetectedNotice(`Detected ${PLATFORM_MAP[detected].name} link`);
    } else if (!val.trim()) {
      setAutoDetectedNotice(null);
    }
  };

  const handleSwapPlatforms = async () => {
    const nextSrc = destinationPlatform;
    const nextDst = sourcePlatform;
    onChangeSourcePlatform(nextSrc);
    onChangeDestinationPlatform(nextDst);
    setTransferResult(null);

    if (rows.length > 0) {
      await runMatch(
        rows.map((r) => r.source),
        nextDst
      );
    }
  };

  const handleSelectDestination = async (nextDst: PlatformId) => {
    if (nextDst === sourcePlatform) {
      onChangeSourcePlatform(destinationPlatform);
    }
    onChangeDestinationPlatform(nextDst);
    setTransferResult(null);

    if (rows.length > 0) {
      await runMatch(
        rows.map((r) => r.source),
        nextDst
      );
    }
  };

  const runMatch = async (tracks: SourceTrack[], targetPlatform: PlatformId) => {
    if (tracks.length === 0) return;
    setIsMatching(true);
    setTransferResult(null);
    stopPreviewAudio();

    try {
      const res = await fetch('/api/tracks/match', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({tracks, destinationPlatform: targetPlatform}),
      });
      const data = (await res.json()) as {rows?: TrackMatchRow[]; error?: string};
      if (!res.ok || !data.rows) {
        throw new Error(data.error || 'Failed to match tracks.');
      }
      setRows(data.rows);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Unable to match tracks across catalog.');
    } finally {
      setIsMatching(false);
    }
  };

  const handleLoadPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    setParseError(null);
    setTransferResult(null);
    stopPreviewAudio();

    setIsLoadingParse(true);
    try {
      const body =
        inputMode === 'link'
          ? {url: playlistUrl, sourcePlatform}
          : {text: rawTracklist, sourcePlatform};

      const res = await fetch('/api/playlist/parse', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ParsedPlaylist & {error?: string};
      if (!res.ok || !data.tracks) {
        throw new Error(data.error || 'Could not load playlist.');
      }

      setPlaylistMeta(data);
      setPlaylistTitleEdit(data.title);
      onChangeSourcePlatform(data.sourcePlatform);
      setRows(
        data.tracks.map((t) => ({
          source: t,
          included: true,
          status: 'pending',
          match: null,
          alternates: [],
        }))
      );
      setIsLoadingParse(false);
      await runMatch(data.tracks, destinationPlatform);
    } catch (err) {
      setIsLoadingParse(false);
      setParseError(err instanceof Error ? err.message : 'Could not parse playlist.');
    }
  };

  const handleLoadSample = async (presetId: string) => {
    const preset = SAMPLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setParseError(null);
    setTransferResult(null);
    setAutoDetectedNotice(null);
    onChangeSourcePlatform(preset.sourcePlatform);
    const nextDest =
      destinationPlatform === preset.sourcePlatform ? preset.defaultDestination : destinationPlatform;
    onChangeDestinationPlatform(nextDest);

    const meta: ParsedPlaylist = {
      title: preset.title,
      creator: preset.creator,
      sourcePlatform: preset.sourcePlatform,
      tracks: preset.tracks,
      parseMethod: 'sample_preset',
    };
    setPlaylistMeta(meta);
    setPlaylistTitleEdit(preset.title);
    setRows(
      preset.tracks.map((t) => ({
        source: t,
        included: true,
        status: 'pending',
        match: null,
        alternates: [],
      }))
    );
    await runMatch(preset.tracks, nextDest);
  };

  const handleAddInlineTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = newTrackInput.trim();
    if (!raw) return;

    const parts = raw.split(/\s+[-—–]\s+/);
    const newSource: SourceTrack =
      parts.length >= 2
        ? {id: `custom-${Date.now()}`, artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim()}
        : {id: `custom-${Date.now()}`, title: raw, artist: 'Unknown Artist'};

    setNewTrackInput('');
    const pendingRow: TrackMatchRow = {
      source: newSource,
      included: true,
      status: 'pending',
      match: null,
      alternates: [],
    };
    setRows((prev) => [...prev, pendingRow]);

    try {
      const res = await fetch('/api/tracks/match', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({tracks: [newSource], destinationPlatform}),
      });
      const data = (await res.json()) as {rows?: TrackMatchRow[]};
      if (res.ok && data.rows?.[0]) {
        const matched = data.rows[0];
        setRows((prev) => prev.map((r) => (r.source.id === newSource.id ? matched : r)));
      }
    } catch {
      // keep row as pending
    }
  };

  const handleSwapAlternate = (sourceId: string, alternateId: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.source.id !== sourceId || !row.match) return row;
        const chosen = row.alternates.find((a) => a.id === alternateId);
        if (!chosen) return row;
        const nextAlternates = [row.match, ...row.alternates.filter((a) => a.id !== alternateId)];
        return {
          ...row,
          status: chosen.confidence === 'unmatched' ? 'unmatched' : 'matched',
          match: chosen,
          alternates: nextAlternates,
        };
      })
    );
  };

  const handleToggleInclude = (sourceId: string) => {
    setRows((prev) => prev.map((r) => (r.source.id === sourceId ? {...r, included: !r.included} : r)));
  };

  const handleExecuteTransfer = async () => {
    if (rows.length === 0) return;
    setIsExecuting(true);
    setParseError(null);

    try {
      const res = await fetch('/api/transfer/execute', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          playlistTitle: playlistTitleEdit || playlistMeta?.title || 'Transferred Playlist',
          creator: playlistMeta?.creator,
          artworkUrl: playlistMeta?.artworkUrl,
          sourcePlatform,
          destinationPlatform,
          rows,
        }),
      });
      const data = (await res.json()) as {
        mode?: 'oauth_synced' | 'hybrid_bundle';
        playlistUrl?: string;
        shareId?: string;
        shareUrl?: string;
        nativePlaylistUrl?: string;
        addedCount?: number;
        error?: string;
      };
      if (!res.ok || !data.mode) {
        throw new Error(data.error || 'Transfer failed.');
      }

      const result = {
        mode: data.mode,
        playlistUrl: data.playlistUrl,
        shareId: data.shareId,
        shareUrl: data.shareUrl,
        nativePlaylistUrl: data.nativePlaylistUrl,
        addedCount: data.addedCount || 0,
      };
      setTransferResult(result);

      const includedRows = rows.filter((r) => r.included);
      const matchedCount = includedRows.filter((r) => r.match && r.match.confidence !== 'unmatched').length;

      onSaveHistory({
        id: `tr-${Date.now()}`,
        shareId: result.shareId,
        shareUrl: result.shareUrl,
        nativePlaylistUrl: result.nativePlaylistUrl,
        playlistTitle: playlistTitleEdit || playlistMeta?.title || 'Transferred Playlist',
        artworkUrl: playlistMeta?.artworkUrl || includedRows[0]?.match?.artworkUrl,
        sourcePlatform,
        destinationPlatform,
        sourceUrl: playlistMeta?.sourceUrl,
        destinationPlaylistUrl: result.playlistUrl,
        mode: result.mode,
        totalTracks: includedRows.length,
        matchedTracks: matchedCount,
        createdAt: new Date().toISOString(),
        rows,
      });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Unable to execute transfer.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!transferResult?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(transferResult.shareUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyTracklist = async () => {
    const lines = rows
      .filter((r) => r.included)
      .map((r) => {
        const m = r.match;
        const artist = m?.artist || r.source.artist;
        const title = m?.title || r.source.title;
        return m?.destinationUrl ? `${artist} - ${title} (${m.destinationUrl})` : `${artist} - ${title}`;
      });
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedList(true);
      setTimeout(() => setCopiedList(false), 2000);
    } catch {
      // ignore
    }
  };

  const counts = useMemo(() => {
    const total = rows.length;
    const included = rows.filter((r) => r.included).length;
    const exactOrHigh = rows.filter(
      (r) => r.match && (r.match.confidence === 'exact' || r.match.confidence === 'high')
    ).length;
    const review = rows.filter((r) => r.match?.confidence === 'review').length;
    const unmatched = rows.filter((r) => !r.match || r.match.confidence === 'unmatched').length;
    return {total, included, exactOrHigh, review, unmatched};
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'matched' && (!r.match || r.match.confidence === 'review' || r.match.confidence === 'unmatched')) {
        return false;
      }
      if (filter === 'review' && r.match?.confidence !== 'review') {
        return false;
      }
      if (filter === 'unmatched' && r.match && r.match.confidence !== 'unmatched') {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${r.source.title} ${r.source.artist} ${r.match?.title || ''} ${r.match?.artist || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, searchQuery]);

  return (
    <section id="workbench" className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        {/* Step 1: Platform Routing & Source Input */}
        <div className="p-5 sm:p-8 border-b border-neutral-200">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-end">
            {/* Source Platform Selector */}
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-2">From Platform</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-2">
                {PLATFORMS.map((p) => {
                  const active = sourcePlatform === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onChangeSourcePlatform(p.id);
                        if (destinationPlatform === p.id) {
                          onChangeDestinationPlatform(p.id === 'apple' ? 'spotify' : 'apple');
                        }
                      }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer min-h-[42px] ${
                        active
                          ? 'bg-neutral-900 text-white border-neutral-900'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                      }`}
                    >
                      <PlatformLogo platform={p.id} className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-medium whitespace-nowrap truncate">{p.shortName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Swap Button */}
            <div className="flex justify-center lg:pb-0.5">
              <button
                type="button"
                onClick={handleSwapPlatforms}
                aria-label="Swap source and destination platforms"
                className="p-2.5 rounded-xl border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
            </div>

            {/* Destination Platform Selector */}
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-2">To Platform</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-2">
                {PLATFORMS.map((p) => {
                  const active = destinationPlatform === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectDestination(p.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer min-h-[42px] ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                      }`}
                    >
                      <PlatformLogo platform={p.id} className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-medium whitespace-nowrap truncate">{p.shortName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Input Mode Segmented Toggle */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
              <button
                type="button"
                onClick={() => setInputMode('link')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  inputMode === 'link' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Playlist Link
              </button>
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  inputMode === 'text' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Paste Tracklist / CSV
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-neutral-400">Try sample:</span>
              {SAMPLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleLoadSample(preset.id)}
                  className="text-neutral-600 hover:text-neutral-900 underline underline-offset-4 decoration-neutral-300 hover:decoration-neutral-900 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {preset.title}
                </button>
              ))}
            </div>
          </div>

          {/* Form Input */}
          <form onSubmit={handleLoadPlaylist} className="mt-4">
            {inputMode === 'link' ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <input
                    type="url"
                    value={playlistUrl}
                    onChange={(e) => handleUrlInputChange(e.target.value)}
                    placeholder={PLATFORM_MAP[sourcePlatform].urlPlaceholder}
                    aria-label="Playlist URL"
                    className="w-full h-12 px-4 text-sm text-neutral-900 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoadingParse || isMatching}
                  className="h-12 px-6 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-60 rounded-xl transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isLoadingParse ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Reading Playlist...</span>
                    </>
                  ) : (
                    <>
                      <span>Load Playlist</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  rows={5}
                  value={rawTracklist}
                  onChange={(e) => setRawTracklist(e.target.value)}
                  placeholder={`Paste tracks one per line (Artist - Title) or CSV:\nM83 - Midnight City\nFrank Ocean - Nights\nDaft Punk - Instant Crush`}
                  aria-label="Paste tracklist or CSV"
                  className="w-full p-4 text-sm text-neutral-900 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 transition-colors font-mono"
                />
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs text-neutral-500">
                    Supports plain text (<span className="font-mono">Artist - Title</span>), numbered lists, CSV, and M3U8.
                  </p>
                  <button
                    type="submit"
                    disabled={isLoadingParse || isMatching}
                    className="h-11 px-5 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-60 rounded-xl transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isLoadingParse ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Parsing...</span>
                      </>
                    ) : (
                      <span>Parse & Match Tracks</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>

          {autoDetectedNotice && (
            <p className="mt-2.5 text-xs text-blue-700">{autoDetectedNotice}</p>
          )}

          {!autoDetectedNotice && inputMode === 'link' && (
            <p className="mt-2.5 text-xs text-neutral-500">{PLATFORM_MAP[sourcePlatform].urlHint}</p>
          )}

          {parseError && (
            <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-sm text-red-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{parseError}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInputMode('text');
                  setParseError(null);
                }}
                className="text-xs font-medium text-red-900 underline underline-offset-4 whitespace-nowrap self-start sm:self-auto cursor-pointer"
              >
                Paste tracklist instead
              </button>
            </div>
          )}
        </div>

        {/* Step 2: Loaded Playlist & Track Matching Workspace */}
        {rows.length > 0 ? (
          <div>
            {/* Playlist Summary Header */}
            <div className="px-5 sm:px-8 py-5 bg-neutral-50/60 border-b border-neutral-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <img
                  src={
                    playlistMeta?.artworkUrl ||
                    rows.find((r) => r.match?.artworkUrl)?.match?.artworkUrl ||
                    '/src/assets/images/playlist_cover_minimal_1794840278825.jpg'
                  }
                  alt={playlistTitleEdit || 'Playlist cover'}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = '/src/assets/images/playlist_cover_minimal_1794840278825.jpg';
                  }}
                  className="w-14 h-14 rounded-xl object-cover border border-neutral-200 bg-white shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={playlistTitleEdit}
                    onChange={(e) => setPlaylistTitleEdit(e.target.value)}
                    aria-label="Destination playlist name"
                    className="font-display text-lg font-semibold text-neutral-900 bg-transparent border-b border-transparent hover:border-neutral-300 focus:border-blue-600 focus:outline-none w-full max-w-md py-0.5"
                  />
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 mt-1">
                    <span>{PLATFORM_MAP[sourcePlatform].name}</span>
                    <span aria-hidden="true">→</span>
                    <span className="font-medium text-neutral-800">{PLATFORM_MAP[destinationPlatform].name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{counts.total} tracks</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{formatTotalDuration(rows.map((r) => r.source))}</span>
                    {playlistMeta?.creator && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{playlistMeta.creator}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isMatching}
                  onClick={() =>
                    runMatch(
                      rows.map((r) => r.source),
                      destinationPlatform
                    )
                  }
                  className="px-3.5 py-2 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  {isMatching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{isMatching ? 'Matching...' : 'Re-match Catalog'}</span>
                </button>
              </div>
            </div>

            {playlistMeta?.warnings?.map((w, i) => (
              <div key={i} className="px-5 sm:px-8 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900">
                {w}
              </div>
            ))}

            {/* Filter & Search Toolbar */}
            <div className="px-5 sm:px-8 py-3.5 border-b border-neutral-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg self-start overflow-x-auto max-w-full">
                {(
                  [
                    {id: 'all', label: `All (${counts.total})`},
                    {id: 'matched', label: `Matched (${counts.exactOrHigh})`},
                    {id: 'review', label: `Review (${counts.review})`},
                    {id: 'unmatched', label: `Unmatched (${counts.unmatched})`},
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      filter === tab.id ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter tracks..."
                    aria-label="Filter tracks"
                    className="h-9 pl-8 pr-3 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600 w-full sm:w-48"
                  />
                </div>

                <form onSubmit={handleAddInlineTrack} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newTrackInput}
                    onChange={(e) => setNewTrackInput(e.target.value)}
                    placeholder="Add: Artist - Title"
                    aria-label="Add track"
                    className="h-9 px-3 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600 w-full sm:w-44"
                  />
                  <button
                    type="submit"
                    aria-label="Add track to list"
                    className="h-9 px-2.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-lg transition-colors shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>

            {/* Track Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs font-medium text-neutral-500 bg-neutral-50/40">
                    <th className="py-3 pl-5 sm:pl-8 pr-2 w-10">
                      <input
                        type="checkbox"
                        aria-label="Toggle all tracks"
                        checked={rows.length > 0 && rows.every((r) => r.included)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setRows((prev) => prev.map((r) => ({...r, included: checked})));
                        }}
                        className="rounded border-neutral-300 text-neutral-900 focus:ring-blue-600 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-2 w-10">#</th>
                    <th className="py-3 px-3">Source Track</th>
                    <th className="py-3 px-2 w-12 text-center">Audio</th>
                    <th className="py-3 px-3">{PLATFORM_MAP[destinationPlatform].shortName} Match</th>
                    <th className="py-3 px-3 text-right">Confidence</th>
                    <th className="py-3 pl-3 pr-5 sm:pr-8 text-right">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-sm">
                  {filteredRows.map((row, idx) => {
                    const match = row.match;
                    const isPlaying = playingRowId === row.source.id;
                    const confidenceLabel =
                      row.status === 'pending'
                        ? 'Matching...'
                        : !match || match.confidence === 'unmatched'
                          ? 'Search fallback'
                          : match.confidence === 'exact'
                            ? `${match.score}% Exact`
                            : match.confidence === 'high'
                              ? `${match.score}% High`
                              : `${match.score}% Review`;

                    const confidenceColor =
                      row.status === 'pending'
                        ? 'text-neutral-400'
                        : !match || match.confidence === 'unmatched'
                          ? 'text-neutral-500'
                          : match.confidence === 'exact'
                            ? 'text-emerald-700'
                            : match.confidence === 'high'
                              ? 'text-neutral-700'
                              : 'text-amber-700';

                    return (
                      <tr
                        key={row.source.id}
                        className={`transition-colors ${row.included ? 'hover:bg-neutral-50/70' : 'opacity-50 bg-neutral-50/40'}`}
                      >
                        <td className="py-3 pl-5 sm:pl-8 pr-2 align-middle">
                          <input
                            type="checkbox"
                            checked={row.included}
                            onChange={() => handleToggleInclude(row.source.id)}
                            aria-label={`Include ${row.source.title}`}
                            className="rounded border-neutral-300 text-neutral-900 focus:ring-blue-600 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-2 text-xs font-mono tabular-nums text-neutral-400 align-middle">
                          {String(idx + 1).padStart(2, '0')}
                        </td>
                        <td className="py-3 px-3 align-middle min-w-[200px]">
                          <div className="font-medium text-neutral-900 truncate max-w-[260px]">{row.source.title}</div>
                          <div className="text-xs text-neutral-500 truncate max-w-[260px]">
                            <span>{row.source.artist}</span>
                            {row.source.durationMs ? (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span className="font-mono tabular-nums">{formatDuration(row.source.durationMs)}</span>
                              </>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 px-2 align-middle text-center">
                          {match?.previewUrl ? (
                            <button
                              type="button"
                              onClick={() => handleTogglePreview(row.source.id, match.previewUrl)}
                              aria-label={isPlaying ? `Pause preview of ${match.title}` : `Play 30s preview of ${match.title}`}
                              className={`w-8 h-8 inline-flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                                isPlaying
                                  ? 'bg-neutral-900 text-white border-neutral-900'
                                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                              }`}
                            >
                              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                            </button>
                          ) : (
                            <span className="text-xs text-neutral-300">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 align-middle min-w-[230px]">
                          {row.status === 'pending' ? (
                            <div className="flex items-center gap-2 text-xs text-neutral-400">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Searching catalog...</span>
                            </div>
                          ) : match ? (
                            <div className="flex items-center gap-3">
                              {match.artworkUrl ? (
                                <img
                                  src={match.artworkUrl}
                                  alt={match.title}
                                  referrerPolicy="no-referrer"
                                  className="w-9 h-9 rounded-md object-cover border border-neutral-200 shrink-0 bg-neutral-100"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-md border border-neutral-200 bg-neutral-100 shrink-0 flex items-center justify-center">
                                  <PlatformLogo platform={destinationPlatform} className="w-4 h-4 opacity-70" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-medium text-neutral-900 truncate max-w-[230px]">{match.title}</div>
                                <div className="text-xs text-neutral-500 truncate max-w-[230px]">
                                  {match.artist}
                                  {match.album ? ` · ${match.album}` : ''}
                                </div>
                                {row.alternates.length > 0 && (
                                  <select
                                    aria-label={`Alternate matches for ${row.source.title}`}
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value) handleSwapAlternate(row.source.id, e.target.value);
                                    }}
                                    className="mt-1 text-[11px] text-blue-700 bg-transparent border-0 p-0 focus:outline-none cursor-pointer"
                                  >
                                    <option value="">Switch version ({row.alternates.length} options)</option>
                                    {row.alternates.map((alt) => (
                                      <option key={alt.id} value={alt.id}>
                                        {alt.title} — {alt.artist} ({alt.score}%)
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </td>
                        <td className="py-3 px-3 align-middle text-right whitespace-nowrap">
                          <span className={`text-xs font-medium tabular-nums ${confidenceColor}`}>
                            {confidenceLabel}
                          </span>
                        </td>
                        <td className="py-3 pl-3 pr-5 sm:pr-8 align-middle text-right whitespace-nowrap">
                          {match?.destinationUrl ? (
                            <a
                              href={match.destinationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
                            >
                              <span>Open</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Step 3: Transfer Execution Bar */}
            <div className="px-5 sm:px-8 py-5 bg-neutral-50 border-t border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs sm:text-sm text-neutral-600">
                <span className="font-medium text-neutral-900 tabular-nums">{counts.included}</span> of{' '}
                <span className="tabular-nums">{counts.total}</span> tracks selected for{' '}
                <span className="font-medium text-neutral-900">{PLATFORM_MAP[destinationPlatform].name}</span>
                <span className="mx-2 text-neutral-300" aria-hidden="true">·</span>
                <span className="text-neutral-500">Shareable player link & exports ready</span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={isExecuting || isMatching || counts.included === 0}
                  onClick={handleExecuteTransfer}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating Link...</span>
                    </>
                  ) : (
                    <span>Create Playlist Link & Export</span>
                  )}
                </button>
              </div>
            </div>

            {/* Transfer Result Strip */}
            {transferResult && (
              <div className="px-5 sm:px-8 py-6 bg-emerald-50/70 border-t border-emerald-200 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-medium text-neutral-900 text-sm">
                        {transferResult.mode === 'oauth_synced'
                          ? `Playlist created in ${PLATFORM_MAP[destinationPlatform].name} (${transferResult.addedCount} tracks synced)`
                          : `Shareable playlist link ready (${transferResult.addedCount} tracks)`}
                      </h3>
                      <p className="text-xs text-neutral-600 mt-0.5">
                        {transferResult.mode === 'oauth_synced'
                          ? 'Your destination library now contains the matched tracks, plus a shareable link below.'
                          : 'Share this playlist link or open it to launch every song directly in your music player.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {transferResult.playlistUrl && (
                      <a
                        href={transferResult.playlistUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <span>Open in {PLATFORM_MAP[destinationPlatform].shortName}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {transferResult.nativePlaylistUrl && !transferResult.playlistUrl && (
                      <a
                        href={transferResult.nativePlaylistUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <span>Open Full YouTube Playlist</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        downloadPlaylistExport('csv', playlistTitleEdit || 'Playlist', destinationPlatform, rows)
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-800 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadPlaylistExport('m3u8', playlistTitleEdit || 'Playlist', destinationPlatform, rows)
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-800 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>M3U8</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadPlaylistExport('json', playlistTitleEdit || 'Playlist', destinationPlatform, rows)
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-800 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>JSON</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyTracklist}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-800 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {copiedList ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                      <span>{copiedList ? 'Copied' : 'Copy List'}</span>
                    </button>
                  </div>
                </div>

                {transferResult.shareUrl && transferResult.shareId && (
                  <div className="p-3.5 rounded-xl bg-white border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium text-neutral-500">Shareable Playlist Link</div>
                      <div className="text-xs font-mono text-neutral-900 truncate mt-0.5">{transferResult.shareUrl}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyShareUrl}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {copiedShareLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                        <span>{copiedShareLink ? 'Copied' : 'Copy Link'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenSharePage(transferResult.shareId!)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <span>Open Player Page</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Clean Empty / Ready State inside Workbench */
          <div className="px-5 sm:px-8 py-10 bg-neutral-50/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h3 className="font-medium text-neutral-900 text-sm">How a transfer works</h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                <span>01. Paste any public playlist link</span>
                <span aria-hidden="true">·</span>
                <span>02. Review & preview catalog matches</span>
                <span aria-hidden="true">·</span>
                <span>03. Sync via OAuth or export M3U8 / CSV</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleLoadSample('late-night-studio')}
              className="px-4 py-2 text-xs font-medium text-neutral-800 bg-white border border-neutral-200 hover:border-neutral-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Load Sample Spotify Playlist →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
