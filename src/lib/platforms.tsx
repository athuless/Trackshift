import React from 'react';
import type {PlatformId, SourceTrack, TrackMatchRow} from '../types';

export interface PlatformMeta {
  id: PlatformId;
  name: string;
  shortName: string;
  accentHex: string;
  urlPlaceholder: string;
  urlHint: string;
}

export const PLATFORMS: PlatformMeta[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    shortName: 'Spotify',
    accentHex: '#1DB954',
    urlPlaceholder: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    urlHint: 'Public Spotify playlist links (open.spotify.com/playlist/...)',
  },
  {
    id: 'apple',
    name: 'Apple Music',
    shortName: 'Apple Music',
    accentHex: '#FA243C',
    urlPlaceholder: 'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb',
    urlHint: 'Shared Apple Music playlist links (music.apple.com/.../playlist/...)',
  },
  {
    id: 'youtube',
    name: 'YouTube Music',
    shortName: 'YouTube Music',
    accentHex: '#FF0000',
    urlPlaceholder: 'https://music.youtube.com/playlist?list=RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs',
    urlHint: 'Public or unlisted YouTube / YouTube Music playlist URLs',
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    shortName: 'SoundCloud',
    accentHex: '#FF5500',
    urlPlaceholder: 'https://soundcloud.com/artist/sets/playlist-name',
    urlHint: 'Public SoundCloud set links (soundcloud.com/.../sets/...)',
  },
];

export const PLATFORM_MAP: Record<PlatformId, PlatformMeta> = {
  spotify: PLATFORMS[0],
  apple: PLATFORMS[1],
  youtube: PLATFORMS[2],
  soundcloud: PLATFORMS[3],
};

export function PlatformLogo({platform, className = 'w-5 h-5'}: {platform: PlatformId; className?: string}) {
  switch (platform) {
    case 'spotify':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#1DB954" />
          <path
            d="M7.5 9.6c3.2-.9 6.8-.6 9.6.9M8.2 12.6c2.6-.7 5.5-.5 7.8.8M8.9 15.4c2-.5 4.2-.3 6 .6"
            stroke="#FFFFFF"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'apple':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="5" fill="#FA243C" />
          <path
            d="M15.5 7.2v7.3a2 2 0 1 1-1.3-1.9V9.1l-4.4 1.1v5.3a2 2 0 1 1-1.3-1.9V8.4l7-1.2Z"
            fill="#FFFFFF"
          />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#FF0000" />
          <circle cx="12" cy="12" r="6.2" stroke="#FFFFFF" strokeWidth="1.2" />
          <path d="M10.4 9.4 15 12l-4.6 2.6V9.4Z" fill="#FFFFFF" />
        </svg>
      );
    case 'soundcloud':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="5" fill="#FF5500" />
          <path
            d="M12.2 15.6h4.9a2.1 2.1 0 0 0 .3-4.2 3.3 3.3 0 0 0-6.2-1.1v5.3h1Zm-2.5 0V9.9M7.6 15.6v-4.1M5.6 15.6v-2.4"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

export interface SamplePlaylistPreset {
  id: string;
  label: string;
  title: string;
  creator: string;
  sourcePlatform: PlatformId;
  defaultDestination: PlatformId;
  tracks: SourceTrack[];
}

export const SAMPLE_PRESETS: SamplePlaylistPreset[] = [
  {
    id: 'late-night-studio',
    label: 'Spotify Sample: Late Night Studio',
    title: 'Late Night Studio',
    creator: 'Curated Selection',
    sourcePlatform: 'spotify',
    defaultDestination: 'apple',
    tracks: [
      {id: 's1', title: 'Midnight City', artist: 'M83', album: "Hurry Up, We're Dreaming", durationMs: 243000},
      {id: 's2', title: 'Everything In Its Right Place', artist: 'Radiohead', album: 'Kid A', durationMs: 251000},
      {id: 's3', title: 'Instant Crush', artist: 'Daft Punk', album: 'Random Access Memories', durationMs: 337000},
      {id: 's4', title: 'Nights', artist: 'Frank Ocean', album: 'Blonde', durationMs: 307000},
      {id: 's5', title: 'Innerbloom', artist: 'RÜFÜS DU SOL', album: 'Bloom', durationMs: 578000},
      {id: 's6', title: 'The Less I Know The Better', artist: 'Tame Impala', album: 'Currents', durationMs: 216000},
    ],
  },
  {
    id: 'morning-focus',
    label: 'Apple Music Sample: Morning Acoustics',
    title: 'Morning Acoustics',
    creator: 'Studio Archive',
    sourcePlatform: 'apple',
    defaultDestination: 'spotify',
    tracks: [
      {id: 'a1', title: 'Holocene', artist: 'Bon Iver', album: 'Bon Iver', durationMs: 336000},
      {id: 'a2', title: 'Motion Sickness', artist: 'Phoebe Bridgers', album: 'Stranger in the Alps', durationMs: 229000},
      {id: 'a3', title: 'Bloom', artist: 'The Paper Kites', album: 'Woodland', durationMs: 210000},
      {id: 'a4', title: 'Mystery of Love', artist: 'Sufjan Stevens', album: 'Call Me by Your Name', durationMs: 248000},
      {id: 'a5', title: 'Slow Dancing in a Burning Room', artist: 'John Mayer', album: 'Continuum', durationMs: 242000},
    ],
  },
  {
    id: 'electronic-drive',
    label: 'YouTube Music Sample: Electronic Drive',
    title: 'Electronic Drive',
    creator: 'Session Mix',
    sourcePlatform: 'youtube',
    defaultDestination: 'apple',
    tracks: [
      {id: 'y1', title: 'Strobe', artist: 'deadmau5', album: 'For Lack of a Better Name', durationMs: 634000},
      {id: 'y2', title: 'Breathe', artist: 'Télépopmusik', album: 'Genetic World', durationMs: 279000},
      {id: 'y3', title: 'Archangel', artist: 'Burial', album: 'Untrue', durationMs: 238000},
      {id: 'y4', title: 'Kiara', artist: 'Bonobo', album: 'Black Sands', durationMs: 230000},
      {id: 'y5', title: 'Shelter', artist: 'Porter Robinson', album: 'Shelter', durationMs: 219000},
    ],
  },
];

export function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatTotalDuration(tracks: Array<{durationMs?: number}>): string {
  const totalMs = tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0);
  if (!totalMs) return 'Duration pending';
  const totalMins = Math.round(totalMs / 60000);
  if (totalMins < 60) return `${totalMins} min`;
  const hrs = Math.floor(totalMins / 60);
  const rem = totalMins % 60;
  return `${hrs} hr ${rem} min`;
}

export function detectPlatformFromInput(url: string): PlatformId | null {
  const lower = url.toLowerCase();
  if (lower.includes('spotify.com') || lower.startsWith('spotify:')) return 'spotify';
  if (lower.includes('music.apple.com') || lower.includes('itunes.apple.com')) return 'apple';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('soundcloud.com')) return 'soundcloud';
  return null;
}

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], {type: mimeType});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeFileSlug(name: string): string {
  return (name || 'playlist')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'playlist';
}

export function downloadPlaylistExport(
  format: 'csv' | 'm3u8' | 'json',
  playlistTitle: string,
  destinationPlatform: PlatformId,
  rows: TrackMatchRow[]
) {
  const included = rows.filter((r) => r.included);
  const slug = safeFileSlug(playlistTitle);

  if (format === 'csv') {
    const header = 'Title,Artist,Album,Duration,Match Confidence,Destination URL';
    const body = included.map((r) => {
      const m = r.match;
      const title = (m?.title || r.source.title).replace(/"/g, '""');
      const artist = (m?.artist || r.source.artist).replace(/"/g, '""');
      const album = (m?.album || r.source.album || '').replace(/"/g, '""');
      const dur = formatDuration(m?.durationMs || r.source.durationMs);
      const conf = m ? `${m.score}% (${m.confidence})` : 'unmatched';
      const link = m?.destinationUrl || '';
      return `"${title}","${artist}","${album}","${dur}","${conf}","${link}"`;
    });
    triggerDownload(`${slug}-${destinationPlatform}.csv`, [header, ...body].join('\n'), 'text/csv;charset=utf-8');
    return;
  }

  if (format === 'm3u8') {
    const lines = ['#EXTM3U', `#PLAYLIST:${playlistTitle}`];
    for (const r of included) {
      const m = r.match;
      const secs = Math.round((m?.durationMs || r.source.durationMs || 0) / 1000);
      const artist = m?.artist || r.source.artist;
      const title = m?.title || r.source.title;
      lines.push(`#EXTINF:${secs > 0 ? secs : -1},${artist} - ${title}`);
      lines.push(m?.destinationUrl || `${artist} - ${title}`);
    }
    triggerDownload(`${slug}-${destinationPlatform}.m3u8`, lines.join('\n'), 'audio/x-mpegurl;charset=utf-8');
    return;
  }

  const payload = {
    playlistTitle,
    destinationPlatform,
    exportedAt: new Date().toISOString(),
    tracks: included.map((r) => ({
      source: r.source,
      matched: r.match,
    })),
  };
  triggerDownload(`${slug}-${destinationPlatform}.json`, JSON.stringify(payload, null, 2), 'application/json');
}
