import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import type {Request, Response} from 'express';
import {createServer as createViteServer} from 'vite';

dotenv.config();

type PlatformId = 'spotify' | 'apple' | 'youtube' | 'soundcloud';
type MatchConfidence = 'exact' | 'high' | 'review' | 'unmatched';

interface SourceTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  sourceUrl?: string;
  artworkUrl?: string;
}

interface MatchCandidate {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  artworkUrl?: string;
  previewUrl?: string;
  destinationUrl: string;
  destinationUri?: string;
  score: number;
  confidence: MatchConfidence;
  catalogSource: 'itunes' | 'spotify_api' | 'youtube_api' | 'soundcloud_api' | 'search_link';
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

interface SharedPlaylistRecord {
  shareId: string;
  playlistTitle: string;
  creator?: string;
  artworkUrl?: string;
  sourcePlatform: PlatformId;
  destinationPlatform: PlatformId;
  nativePlaylistUrl?: string;
  createdAt: string;
  rows: Array<{
    source: SourceTrack;
    included: boolean;
    status: 'pending' | 'matched' | 'unmatched';
    match?: MatchCandidate | null;
    alternates: MatchCandidate[];
  }>;
}

const DATA_DIR = path.resolve(__dirname, 'data');
const SHARED_FILE = path.join(DATA_DIR, 'shared-playlists.json');
const sharedPlaylists = new Map<string, SharedPlaylistRecord>();

try {
  if (fs.existsSync(SHARED_FILE)) {
    const raw = fs.readFileSync(SHARED_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, SharedPlaylistRecord>;
    for (const [id, rec] of Object.entries(parsed)) {
      sharedPlaylists.set(id, rec);
    }
  }
} catch {
  // start with empty map if file is unreadable
}

function persistSharedPlaylists() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, {recursive: true});
    }
    const obj: Record<string, SharedPlaylistRecord> = {};
    // keep most recent 200 shared playlists
    const entries = [...sharedPlaylists.entries()].slice(-200);
    for (const [k, v] of entries) obj[k] = v;
    fs.writeFileSync(SHARED_FILE, JSON.stringify(obj), 'utf-8');
  } catch {
    // ignore disk write issues in read-only environments
  }
}

function getAppBaseUrl(req: Request): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl !== 'MY_APP_URL') {
    return envUrl.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function detectPlatformFromUrl(url: string): PlatformId | null {
  const lower = url.toLowerCase();
  if (lower.includes('spotify.com') || lower.startsWith('spotify:')) return 'spotify';
  if (lower.includes('music.apple.com') || lower.includes('itunes.apple.com')) return 'apple';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('soundcloud.com')) return 'soundcloud';
  return null;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\((feat\.|ft\.|with|remaster(?:ed)?|live|deluxe|bonus|explicit|radio edit|official.*?)[^)]*\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/feat\.|ft\./gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const setA = new Set(na.split(' ').filter(Boolean));
  const setB = new Set(nb.split(' ').filter(Boolean));
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function computeMatchScore(
  source: SourceTrack,
  candidateTitle: string,
  candidateArtist: string,
  candidateDurationMs?: number
): {score: number; confidence: MatchConfidence} {
  const titleSim = tokenSimilarity(source.title, candidateTitle);
  const artistSim = source.artist ? tokenSimilarity(source.artist, candidateArtist) : 0.7;

  let durationBonus = 0;
  if (source.durationMs && candidateDurationMs) {
    const diffSec = Math.abs(source.durationMs - candidateDurationMs) / 1000;
    if (diffSec <= 4) durationBonus = 0.08;
    else if (diffSec <= 12) durationBonus = 0.03;
    else if (diffSec > 45) durationBonus = -0.15;
  }

  const raw = Math.max(0, Math.min(1, titleSim * 0.58 + artistSim * 0.36 + durationBonus + (titleSim > 0.85 && artistSim > 0.7 ? 0.06 : 0)));
  const score = Math.round(raw * 100);

  let confidence: MatchConfidence = 'unmatched';
  if (score >= 88) confidence = 'exact';
  else if (score >= 68) confidence = 'high';
  else if (score >= 42) confidence = 'review';

  return {score, confidence};
}

function buildSearchFallbackUrl(platform: PlatformId, title: string, artist: string): string {
  const query = encodeURIComponent(`${artist} ${title}`.trim());
  switch (platform) {
    case 'spotify':
      return `https://open.spotify.com/search/${query}`;
    case 'apple':
      return `https://music.apple.com/us/search?term=${query}`;
    case 'youtube':
      return `https://music.youtube.com/search?q=${query}`;
    case 'soundcloud':
      return `https://soundcloud.com/search/sounds?q=${query}`;
  }
}

function splitArtistTitle(rawTitle: string, fallbackAuthor?: string): {title: string; artist: string} {
  const cleaned = rawTitle
    .replace(/\((Official\s*(Music\s*)?Video|Official\s*Audio|Lyric\s*Video|Visualizer|Audio)\)/gi, '')
    .replace(/\[(Official\s*(Music\s*)?Video|Official\s*Audio|Lyric\s*Video|Visualizer|HD|4K)\]/gi, '')
    .trim();

  const separators = [' - ', ' — ', ' – ', ' | '];
  for (const sep of separators) {
    const idx = cleaned.indexOf(sep);
    if (idx > 0 && idx < cleaned.length - sep.length) {
      return {
        artist: cleaned.slice(0, idx).trim(),
        title: cleaned.slice(idx + sep.length).trim(),
      };
    }
  }
  return {
    title: cleaned,
    artist: (fallbackAuthor || '').replace(/\s*-\s*Topic$/i, '').trim() || 'Unknown Artist',
  };
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchTextWithTimeout(url: string, timeoutMs = 10000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} while reading ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function parseSpotifyPlaylist(url: string, oauthToken?: string) {
  const match = url.match(/playlist[:/]([a-zA-Z0-9]+)/);
  if (!match) {
    throw new Error('Could not find a Spotify playlist ID in that link.');
  }
  const playlistId = match[1];

  if (oauthToken) {
    const apiRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      headers: {Authorization: `Bearer ${oauthToken}`},
    });
    if (apiRes.ok) {
      const data = (await apiRes.json()) as {
        name: string;
        description?: string;
        owner?: {display_name?: string};
        images?: Array<{url: string}>;
        tracks?: {
          items?: Array<{
            track?: {
              id?: string;
              name?: string;
              duration_ms?: number;
              external_urls?: {spotify?: string};
              album?: {name?: string; images?: Array<{url: string}>};
              artists?: Array<{name?: string}>;
            };
          }>;
        };
      };
      const tracks: SourceTrack[] = (data.tracks?.items || [])
        .map((item, idx) => {
          const t = item.track;
          if (!t?.name) return null;
          return {
            id: t.id || `sp-${idx}`,
            title: t.name,
            artist: (t.artists || []).map((a) => a.name).filter(Boolean).join(', ') || 'Unknown Artist',
            album: t.album?.name,
            durationMs: t.duration_ms,
            sourceUrl: t.external_urls?.spotify,
            artworkUrl: t.album?.images?.[0]?.url,
          } as SourceTrack;
        })
        .filter((t): t is SourceTrack => Boolean(t));

      return {
        title: data.name || 'Spotify Playlist',
        description: data.description,
        creator: data.owner?.display_name,
        artworkUrl: data.images?.[0]?.url,
        sourcePlatform: 'spotify' as PlatformId,
        sourceUrl: url,
        tracks,
        parseMethod: 'oauth_api' as const,
      };
    }
  }

  // Hybrid public embed parser (no API key required)
  const embedHtml = await fetchTextWithTimeout(`https://open.spotify.com/embed/playlist/${playlistId}`);
  const nextDataMatch = embedHtml.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!nextDataMatch) {
    throw new Error('Spotify did not expose public track data for this playlist. Ensure the playlist is public or connect Spotify OAuth.');
  }

  const nextData = JSON.parse(nextDataMatch[1]) as {
    props?: {
      pageProps?: {
        state?: {
          data?: {
            entity?: {
              name?: string;
              subtitle?: string;
              coverArt?: {sources?: Array<{url?: string}>};
              trackList?: Array<{
                uid?: string;
                uri?: string;
                title?: string;
                subtitle?: string;
                duration?: number;
              }>;
            };
          };
        };
      };
    };
  };

  const entity = nextData.props?.pageProps?.state?.data?.entity;
  const trackList = entity?.trackList || [];
  if (!entity || trackList.length === 0) {
    throw new Error('No tracks were found in this Spotify playlist. If it is private or algorithmic (like Daylist/Discover Weekly), paste the tracklist or connect Spotify OAuth.');
  }

  const tracks: SourceTrack[] = trackList
    .filter((t) => Boolean(t.title))
    .map((t, idx) => ({
      id: t.uid || `sp-embed-${idx}`,
      title: decodeHtmlEntities(t.title || ''),
      artist: decodeHtmlEntities(t.subtitle || 'Unknown Artist'),
      durationMs: t.duration,
      sourceUrl: t.uri ? `https://open.spotify.com/track/${t.uri.split(':').pop()}` : undefined,
    }));

  return {
    title: decodeHtmlEntities(entity.name || 'Spotify Playlist'),
    creator: entity.subtitle ? decodeHtmlEntities(entity.subtitle) : undefined,
    artworkUrl: entity.coverArt?.sources?.[0]?.url,
    sourcePlatform: 'spotify' as PlatformId,
    sourceUrl: url,
    tracks,
    parseMethod: 'public_embed' as const,
    warnings:
      trackList.length >= 100
        ? ['Public Spotify embed previews up to 100 tracks. Connect Spotify OAuth for playlists larger than 100 tracks.']
        : undefined,
  };
}

async function parseAppleMusicPlaylist(url: string) {
  const html = await fetchTextWithTimeout(url);

  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
  let playlistTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]).replace(/\s+by\s+.*$/i, '').trim() : 'Apple Music Playlist';
  let artworkUrl = imageMatch ? imageMatch[1] : undefined;
  let creator: string | undefined;
  const tracks: SourceTrack[] = [];

  // Try JSON-LD MusicPlaylist schema
  const jsonLdMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of jsonLdMatches) {
    try {
      const parsed = JSON.parse(m[1]) as {
        '@type'?: string;
        name?: string;
        author?: {name?: string};
        track?: Array<{name?: string; byArtist?: {name?: string} | Array<{name?: string}>; duration?: string; url?: string}>;
      };
      if (parsed['@type'] === 'MusicPlaylist' || Array.isArray(parsed.track)) {
        if (parsed.name) playlistTitle = decodeHtmlEntities(parsed.name);
        if (parsed.author?.name) creator = decodeHtmlEntities(parsed.author.name);
        for (const [idx, item] of (parsed.track || []).entries()) {
          if (!item.name) continue;
          const artist = Array.isArray(item.byArtist)
            ? item.byArtist.map((a) => a.name).filter(Boolean).join(', ')
            : item.byArtist?.name || 'Unknown Artist';
          let durationMs: number | undefined;
          if (item.duration) {
            const durMatch = item.duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
            if (durMatch) {
              durationMs = ((Number(durMatch[1] || 0) * 60) + Number(durMatch[2] || 0)) * 1000;
            }
          }
          tracks.push({
            id: `am-${idx}`,
            title: decodeHtmlEntities(item.name),
            artist: decodeHtmlEntities(artist),
            durationMs,
            sourceUrl: item.url,
          });
        }
      }
    } catch {
      // continue checking other script blocks
    }
  }

  // Fallback: serialized-server-data JSON embedded in Apple Music pages
  if (tracks.length === 0) {
    const serverDataMatch = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/i);
    if (serverDataMatch) {
      try {
        const raw = serverDataMatch[1];
        const songMatches = [...raw.matchAll(/"title":"([^"]{1,120})","artistName":"([^"]{1,120})"/g)];
        const seen = new Set<string>();
        for (const [idx, sm] of songMatches.entries()) {
          const title = decodeHtmlEntities(sm[1]);
          const artist = decodeHtmlEntities(sm[2]);
          const key = `${title.toLowerCase()}::${artist.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            tracks.push({id: `am-ssr-${idx}`, title, artist});
          }
        }
      } catch {
        // ignore
      }
    }
  }

  if (tracks.length === 0) {
    throw new Error('Could not extract tracks from that Apple Music link. Make sure the playlist is shared publicly, or paste the tracklist directly.');
  }

  return {
    title: playlistTitle,
    creator,
    artworkUrl,
    sourcePlatform: 'apple' as PlatformId,
    sourceUrl: url,
    tracks,
    parseMethod: 'public_embed' as const,
  };
}

async function parseYouTubePlaylist(url: string, oauthToken?: string) {
  const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (!listMatch) {
    throw new Error('Could not find a YouTube playlist ID (?list=...) in that URL.');
  }
  const listId = listMatch[1];

  if (oauthToken) {
    const apiRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(listId)}`,
      {headers: {Authorization: `Bearer ${oauthToken}`}}
    );
    if (apiRes.ok) {
      const data = (await apiRes.json()) as {
        items?: Array<{
          snippet?: {
            title?: string;
            videoOwnerChannelTitle?: string;
            thumbnails?: {medium?: {url?: string}; default?: {url?: string}};
            resourceId?: {videoId?: string};
          };
        }>;
      };
      const tracks: SourceTrack[] = (data.items || [])
        .filter((i) => i.snippet?.title && i.snippet.title !== 'Deleted video' && i.snippet.title !== 'Private video')
        .map((i, idx) => {
          const parsed = splitArtistTitle(i.snippet?.title || '', i.snippet?.videoOwnerChannelTitle);
          return {
            id: i.snippet?.resourceId?.videoId || `yt-api-${idx}`,
            title: parsed.title,
            artist: parsed.artist,
            artworkUrl: i.snippet?.thumbnails?.medium?.url || i.snippet?.thumbnails?.default?.url,
            sourceUrl: i.snippet?.resourceId?.videoId
              ? `https://music.youtube.com/watch?v=${i.snippet.resourceId.videoId}`
              : undefined,
          };
        });

      if (tracks.length > 0) {
        return {
          title: 'YouTube Music Playlist',
          artworkUrl: tracks[0]?.artworkUrl,
          sourcePlatform: 'youtube' as PlatformId,
          sourceUrl: url,
          tracks,
          parseMethod: 'oauth_api' as const,
        };
      }
    }
  }

  const html = await fetchTextWithTimeout(`https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`);
  const ytDataMatch = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!ytDataMatch) {
    throw new Error('YouTube did not return public playlist data. Ensure the playlist is Public or Unlisted.');
  }

  const ytData = JSON.parse(ytDataMatch[1]) as Record<string, unknown>;
  const rawStr = JSON.stringify(ytData);

  // Extract playlist title
  const metaTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
  const metaImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
  const playlistTitle = metaTitleMatch ? decodeHtmlEntities(metaTitleMatch[1]) : 'YouTube Music Playlist';

  // Walk ytInitialData for playlistVideoRenderer nodes
  const tracks: SourceTrack[] = [];
  const seen = new Set<string>();

  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (obj.playlistVideoRenderer && typeof obj.playlistVideoRenderer === 'object') {
      const r = obj.playlistVideoRenderer as {
        videoId?: string;
        title?: {runs?: Array<{text?: string}>; simpleText?: string};
        shortBylineText?: {runs?: Array<{text?: string}>};
        lengthSeconds?: string;
        thumbnail?: {thumbnails?: Array<{url?: string}>};
      };
      const rawTitle = r.title?.runs?.map((t) => t.text).join('') || r.title?.simpleText || '';
      const channel = r.shortBylineText?.runs?.map((t) => t.text).join('') || '';
      if (rawTitle && !seen.has(r.videoId || rawTitle)) {
        seen.add(r.videoId || rawTitle);
        const split = splitArtistTitle(rawTitle, channel);
        tracks.push({
          id: r.videoId || `yt-${tracks.length}`,
          title: split.title,
          artist: split.artist,
          durationMs: r.lengthSeconds ? Number(r.lengthSeconds) * 1000 : undefined,
          artworkUrl: r.thumbnail?.thumbnails?.[0]?.url,
          sourceUrl: r.videoId ? `https://music.youtube.com/watch?v=${r.videoId}` : undefined,
        });
      }
    }
    for (const val of Object.values(obj)) {
      walk(val);
    }
  }

  walk(ytData);

  if (tracks.length === 0) {
    void rawStr;
    throw new Error('No playable tracks found in that YouTube playlist. Ensure it is set to Public or Unlisted.');
  }

  return {
    title: playlistTitle,
    artworkUrl: metaImageMatch?.[1] || tracks[0]?.artworkUrl,
    sourcePlatform: 'youtube' as PlatformId,
    sourceUrl: url,
    tracks,
    parseMethod: 'public_embed' as const,
  };
}

async function parseSoundCloudPlaylist(url: string, oauthToken?: string) {
  if (oauthToken) {
    const resolveRes = await fetch(`https://api.soundcloud.com/resolve?url=${encodeURIComponent(url)}`, {
      headers: {Authorization: `OAuth ${oauthToken}`},
    });
    if (resolveRes.ok) {
      const data = (await resolveRes.json()) as {
        title?: string;
        user?: {username?: string};
        artwork_url?: string;
        tracks?: Array<{
          id: number;
          title?: string;
          duration?: number;
          permalink_url?: string;
          artwork_url?: string;
          user?: {username?: string};
        }>;
      };
      const tracks: SourceTrack[] = (data.tracks || [])
        .filter((t) => Boolean(t.title))
        .map((t) => {
          const split = splitArtistTitle(t.title || '', t.user?.username);
          return {
            id: String(t.id),
            title: split.title,
            artist: split.artist,
            durationMs: t.duration,
            sourceUrl: t.permalink_url,
            artworkUrl: t.artwork_url || data.artwork_url,
          };
        });
      if (tracks.length > 0) {
        return {
          title: data.title || 'SoundCloud Set',
          creator: data.user?.username,
          artworkUrl: data.artwork_url,
          sourcePlatform: 'soundcloud' as PlatformId,
          sourceUrl: url,
          tracks,
          parseMethod: 'oauth_api' as const,
        };
      }
    }
  }

  const html = await fetchTextWithTimeout(url);
  const hydrationMatch = html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
  if (!hydrationMatch) {
    throw new Error('Could not read SoundCloud set data. Ensure the playlist URL points to a public SoundCloud set.');
  }

  const hydration = JSON.parse(hydrationMatch[1]) as Array<{
    hydratable?: string;
    data?: {
      title?: string;
      artwork_url?: string;
      user?: {username?: string};
      tracks?: Array<{
        id?: number;
        title?: string;
        duration?: number;
        permalink_url?: string;
        artwork_url?: string;
        user?: {username?: string};
      }>;
    };
  }>;

  const playlistEntry = hydration.find((h) => h.hydratable === 'playlist' && h.data);
  const data = playlistEntry?.data;
  if (!data) {
    throw new Error('SoundCloud did not return playlist track data for that link.');
  }

  const rawTracks = data.tracks || [];
  const parsedTracks: SourceTrack[] = rawTracks
    .filter((t) => Boolean(t.title))
    .map((t, idx) => {
      const split = splitArtistTitle(t.title || '', t.user?.username);
      return {
        id: String(t.id || `sc-${idx}`),
        title: split.title,
        artist: split.artist,
        durationMs: t.duration,
        sourceUrl: t.permalink_url,
        artworkUrl: t.artwork_url || data.artwork_url,
      };
    });

  if (parsedTracks.length === 0) {
    throw new Error('SoundCloud hid track titles on this unauthenticated embed. Connect SoundCloud OAuth or paste the tracklist.');
  }

  const warnings: string[] = [];
  if (rawTracks.length > parsedTracks.length) {
    warnings.push(
      `SoundCloud's public page returned full metadata for ${parsedTracks.length} of ${rawTracks.length} tracks. Connect SoundCloud OAuth to load all tracks.`
    );
  }

  return {
    title: data.title || 'SoundCloud Playlist',
    creator: data.user?.username,
    artworkUrl: data.artwork_url?.replace('-large.', '-t500x500.'),
    sourcePlatform: 'soundcloud' as PlatformId,
    sourceUrl: url,
    tracks: parsedTracks,
    parseMethod: 'public_embed' as const,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function parseManualTracklist(rawText: string, sourcePlatform: PlatformId) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#EXTM3U'));

  const tracks: SourceTrack[] = [];
  let pendingM3uMeta: {title: string; artist: string; durationMs?: number} | null = null;

  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      const m = line.match(/#EXTINF:(-?\d+),(.+)/);
      if (m) {
        const sec = Number(m[1]);
        const split = splitArtistTitle(m[2].trim());
        pendingM3uMeta = {
          title: split.title,
          artist: split.artist,
          durationMs: sec > 0 ? sec * 1000 : undefined,
        };
      }
      continue;
    }

    if (pendingM3uMeta) {
      tracks.push({
        id: `txt-${tracks.length}`,
        title: pendingM3uMeta.title,
        artist: pendingM3uMeta.artist,
        durationMs: pendingM3uMeta.durationMs,
      });
      pendingM3uMeta = null;
      continue;
    }

    // Handle CSV format: "Title","Artist","Album" or Title,Artist
    if (line.includes(',') && !line.includes(' - ')) {
      const cols = line
        .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
        .map((c) => c.replace(/^"|"$/g, '').trim());
      if (cols[0]?.toLowerCase() === 'title' && cols[1]?.toLowerCase() === 'artist') {
        continue;
      }
      if (cols.length >= 2 && cols[0]) {
        tracks.push({
          id: `csv-${tracks.length}`,
          title: cols[0],
          artist: cols[1] || 'Unknown Artist',
          album: cols[2] || undefined,
        });
        continue;
      }
    }

    const stripped = line.replace(/^\d+[\.\)]\s*/, '');
    const split = splitArtistTitle(stripped);
    tracks.push({
      id: `txt-${tracks.length}`,
      title: split.title,
      artist: split.artist,
    });
  }

  return {
    title: 'Imported Tracklist',
    sourcePlatform,
    tracks,
    parseMethod: 'manual_text' as const,
  };
}

async function searchItunesCatalog(track: SourceTrack, destinationPlatform: PlatformId): Promise<MatchCandidate[]> {
  const query = `${track.title} ${track.artist !== 'Unknown Artist' ? track.artist : ''}`.trim();
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=4`;

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: Array<{
      trackId: number;
      trackName: string;
      artistName: string;
      collectionName?: string;
      trackTimeMillis?: number;
      artworkUrl100?: string;
      previewUrl?: string;
      trackViewUrl?: string;
    }>;
  };

  const candidates: MatchCandidate[] = (data.results || []).map((item) => {
    const {score, confidence} = computeMatchScore(track, item.trackName, item.artistName, item.trackTimeMillis);
    const destinationUrl =
      destinationPlatform === 'apple' && item.trackViewUrl
        ? item.trackViewUrl
        : buildSearchFallbackUrl(destinationPlatform, item.trackName, item.artistName);

    return {
      id: `itunes-${item.trackId}`,
      title: item.trackName,
      artist: item.artistName,
      album: item.collectionName,
      durationMs: item.trackTimeMillis,
      artworkUrl: item.artworkUrl100?.replace('100x100bb', '200x200bb'),
      previewUrl: item.previewUrl,
      destinationUrl,
      destinationUri: destinationPlatform === 'apple' ? String(item.trackId) : undefined,
      score,
      confidence,
      catalogSource: 'itunes',
    };
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

async function searchSpotifyOAuth(track: SourceTrack, accessToken: string): Promise<MatchCandidate[]> {
  const q = encodeURIComponent(`track:${track.title} artist:${track.artist}`);
  const res = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=3`, {
    headers: {Authorization: `Bearer ${accessToken}`},
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    tracks?: {
      items?: Array<{
        id: string;
        uri: string;
        name: string;
        duration_ms: number;
        external_urls?: {spotify?: string};
        album?: {name?: string; images?: Array<{url: string}>};
        artists?: Array<{name: string}>;
      }>;
    };
  };

  return (data.tracks?.items || [])
    .map((item) => {
      const artist = item.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';
      const {score, confidence} = computeMatchScore(track, item.name, artist, item.duration_ms);
      return {
        id: `sp-${item.id}`,
        title: item.name,
        artist,
        album: item.album?.name,
        durationMs: item.duration_ms,
        artworkUrl: item.album?.images?.[0]?.url,
        destinationUrl: item.external_urls?.spotify || buildSearchFallbackUrl('spotify', item.name, artist),
        destinationUri: item.uri,
        score,
        confidence,
        catalogSource: 'spotify_api' as const,
      };
    })
    .sort((a, b) => b.score - a.score);
}

async function searchYouTubeOAuth(track: SourceTrack, accessToken: string): Promise<MatchCandidate[]> {
  const q = encodeURIComponent(`${track.artist} ${track.title}`);
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=3&q=${q}`,
    {headers: {Authorization: `Bearer ${accessToken}`}}
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    items?: Array<{
      id?: {videoId?: string};
      snippet?: {title?: string; channelTitle?: string; thumbnails?: {medium?: {url?: string}}};
    }>;
  };

  return (data.items || [])
    .filter((i) => i.id?.videoId && i.snippet?.title)
    .map((item) => {
      const split = splitArtistTitle(item.snippet?.title || '', item.snippet?.channelTitle);
      const {score, confidence} = computeMatchScore(track, split.title, split.artist);
      return {
        id: `yt-${item.id!.videoId}`,
        title: split.title,
        artist: split.artist,
        artworkUrl: item.snippet?.thumbnails?.medium?.url,
        destinationUrl: `https://music.youtube.com/watch?v=${item.id!.videoId}`,
        destinationUri: item.id!.videoId,
        score,
        confidence,
        catalogSource: 'youtube_api' as const,
      };
    })
    .sort((a, b) => b.score - a.score);
}

async function searchYouTubePublicVideoId(title: string, artist: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(`${artist !== 'Unknown Artist' ? artist : ''} ${title} official audio`.trim());
    const html = await fetchTextWithTimeout(`https://www.youtube.com/results?search_query=${q}`, 7000);
    const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, () => worker()));
  return results;
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '2mb'}));

  app.get('/robots.txt', (req, res) => {
    const baseUrl = getAppBaseUrl(req);
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
  });

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = getAppBaseUrl(req);
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `  <url>\n` +
        `    <loc>${baseUrl}/</loc>\n` +
        `    <changefreq>weekly</changefreq>\n` +
        `    <priority>1.0</priority>\n` +
        `  </url>\n` +
        `</urlset>\n`
    );
  });

  // Public Playlist Link Parser
  app.post('/api/playlist/parse', async (req, res) => {
    const {url, text, sourcePlatform} = req.body as {
      url?: string;
      text?: string;
      sourcePlatform?: PlatformId;
    };

    try {
      if (text && text.trim()) {
        const parsed = parseManualTracklist(text, sourcePlatform || 'spotify');
        if (parsed.tracks.length === 0) {
          res.status(400).json({error: 'No tracks detected in the pasted text. Try formatting each line as "Artist - Song Title".'});
          return;
        }
        res.json(parsed);
        return;
      }

      const trimmedUrl = (url || '').trim();
      if (!trimmedUrl) {
        res.status(400).json({error: 'Please enter a playlist URL or switch to the Paste Tracklist tab.'});
        return;
      }

      const detected = detectPlatformFromUrl(trimmedUrl) || sourcePlatform || 'spotify';

      if (detected === 'spotify') {
        res.json(await parseSpotifyPlaylist(trimmedUrl));
        return;
      }
      if (detected === 'apple') {
        res.json(await parseAppleMusicPlaylist(trimmedUrl));
        return;
      }
      if (detected === 'youtube') {
        res.json(await parseYouTubePlaylist(trimmedUrl));
        return;
      }
      if (detected === 'soundcloud') {
        res.json(await parseSoundCloudPlaylist(trimmedUrl));
        return;
      }

      res.status(400).json({error: 'Unsupported playlist link.'});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to parse that playlist link.';
      res.status(422).json({error: message});
    }
  });

  // Cross-Platform Track Matcher
  app.post('/api/tracks/match', async (req, res) => {
    const {tracks, destinationPlatform} = req.body as {
      tracks?: SourceTrack[];
      destinationPlatform?: PlatformId;
    };

    if (!Array.isArray(tracks) || tracks.length === 0 || !destinationPlatform) {
      res.status(400).json({error: 'Tracks array and destinationPlatform are required.'});
      return;
    }

    const cappedTracks = tracks.slice(0, 150);

    const rows = await mapWithConcurrency(cappedTracks, 5, async (source) => {
      let candidates: MatchCandidate[] = [];

      try {
        candidates = await searchItunesCatalog(source, destinationPlatform);
      } catch {
        candidates = [];
      }

      if (candidates.length === 0) {
        return {
          source,
          included: true,
          status: 'unmatched' as const,
          match: {
            id: `search-${source.id}`,
            title: source.title,
            artist: source.artist,
            album: source.album,
            durationMs: source.durationMs,
            artworkUrl: source.artworkUrl,
            destinationUrl: buildSearchFallbackUrl(destinationPlatform, source.title, source.artist),
            score: 0,
            confidence: 'unmatched' as const,
            catalogSource: 'search_link' as const,
          },
          alternates: [],
        };
      }

      const [best, ...rest] = candidates;

      if (destinationPlatform === 'youtube' && !best.destinationUri) {
        const videoId = await searchYouTubePublicVideoId(best.title, best.artist);
        if (videoId) {
          best.destinationUri = videoId;
          best.destinationUrl = `https://music.youtube.com/watch?v=${videoId}`;
        }
      }

      return {
        source,
        included: true,
        status: best.confidence === 'unmatched' ? ('unmatched' as const) : ('matched' as const),
        match: best,
        alternates: rest,
      };
    });

    res.json({rows});
  });

  // Read Shared Playlist
  app.get('/api/playlists/:shareId', (req, res) => {
    const record = sharedPlaylists.get(req.params.shareId);
    if (!record) {
      res.status(404).json({error: 'Shared playlist not found or expired.'});
      return;
    }
    res.json(record);
  });

  // Resolve native YouTube watch_videos queue URL for a shared playlist on demand
  app.post('/api/playlists/:shareId/youtube-queue', async (req, res) => {
    const record = sharedPlaylists.get(req.params.shareId);
    if (!record) {
      res.status(404).json({error: 'Shared playlist not found.'});
      return;
    }
    if (record.nativePlaylistUrl) {
      res.json({nativePlaylistUrl: record.nativePlaylistUrl});
      return;
    }
    const included = record.rows.filter((r) => r.included).slice(0, 50);
    const ids = await mapWithConcurrency(included, 5, async (r) => {
      if (r.match?.destinationUri && /^[a-zA-Z0-9_-]{11}$/.test(r.match.destinationUri)) {
        return r.match.destinationUri;
      }
      return searchYouTubePublicVideoId(r.match?.title || r.source.title, r.match?.artist || r.source.artist);
    });
    const validIds = ids.filter((id): id is string => Boolean(id));
    if (validIds.length === 0) {
      res.status(422).json({error: 'Could not resolve YouTube tracks for this playlist.'});
      return;
    }
    const nativePlaylistUrl = `https://www.youtube.com/watch_videos?video_ids=${validIds.join(',')}`;
    record.nativePlaylistUrl = nativePlaylistUrl;
    persistSharedPlaylists();
    res.json({nativePlaylistUrl});
  });

  // Execute Transfer (Save Shareable Playlist Link & Optional Native YouTube Queue)
  app.post('/api/transfer/execute', async (req, res) => {
    const {playlistTitle, creator, artworkUrl, sourcePlatform, destinationPlatform, rows} = req.body as {
      playlistTitle: string;
      creator?: string;
      artworkUrl?: string;
      sourcePlatform?: PlatformId;
      destinationPlatform: PlatformId;
      rows: Array<{
        included: boolean;
        status: 'pending' | 'matched' | 'unmatched';
        match?: MatchCandidate | null;
        source: SourceTrack;
        alternates: MatchCandidate[];
      }>;
    };
    const baseUrl = getAppBaseUrl(req);

    const selected = (rows || []).filter((r) => r.included);
    if (selected.length === 0) {
      res.status(400).json({error: 'Select at least one track to transfer.'});
      return;
    }

    const shareId = crypto.randomBytes(4).toString('hex');
    const shareUrl = `${baseUrl}/p/${shareId}`;

    const ytIds = selected
      .map((r) => r.match?.destinationUri)
      .filter((id): id is string => Boolean(id && /^[a-zA-Z0-9_-]{11}$/.test(id)))
      .slice(0, 50);
    const nativePlaylistUrl =
      destinationPlatform === 'youtube' && ytIds.length > 0
        ? `https://www.youtube.com/watch_videos?video_ids=${ytIds.join(',')}`
        : undefined;

    sharedPlaylists.set(shareId, {
      shareId,
      playlistTitle: playlistTitle || 'Transferred Playlist',
      creator,
      artworkUrl: artworkUrl || selected.find((r) => r.match?.artworkUrl)?.match?.artworkUrl,
      sourcePlatform: sourcePlatform || 'spotify',
      destinationPlatform,
      nativePlaylistUrl,
      createdAt: new Date().toISOString(),
      rows: selected.map((r) => ({
        source: r.source,
        included: r.included,
        status: r.status || (r.match ? 'matched' : 'unmatched'),
        match: r.match || null,
        alternates: r.alternates || [],
      })),
    });
    persistSharedPlaylists();

    res.json({
      mode: 'hybrid_bundle',
      shareId,
      shareUrl,
      nativePlaylistUrl,
      addedCount: selected.length,
    });
  });

  // Vite dev middleware or static production build
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Trackshift server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Trackshift server:', err);
  process.exit(1);
});
