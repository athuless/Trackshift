export type PlatformId = 'spotify' | 'apple' | 'youtube' | 'soundcloud';

export type MatchConfidence = 'exact' | 'high' | 'review' | 'unmatched';

export interface SourceTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  sourceUrl?: string;
  artworkUrl?: string;
}

export interface MatchCandidate {
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

export interface TrackMatchRow {
  source: SourceTrack;
  included: boolean;
  status: 'pending' | 'matched' | 'unmatched';
  match: MatchCandidate | null;
  alternates: MatchCandidate[];
}

export interface ParsedPlaylist {
  title: string;
  description?: string;
  creator?: string;
  artworkUrl?: string;
  sourcePlatform: PlatformId;
  sourceUrl?: string;
  tracks: SourceTrack[];
  parseMethod: 'oauth_api' | 'public_embed' | 'manual_text' | 'sample_preset';
  warnings?: string[];
}

export interface PlatformOAuthStatus {
  platform: PlatformId;
  name: string;
  configured: boolean;
  connected: boolean;
  userDisplayName?: string;
  callbackUrl: string;
}

export interface TransferHistoryEntry {
  id: string;
  shareId?: string;
  shareUrl?: string;
  nativePlaylistUrl?: string;
  playlistTitle: string;
  artworkUrl?: string;
  sourcePlatform: PlatformId;
  destinationPlatform: PlatformId;
  sourceUrl?: string;
  destinationPlaylistUrl?: string;
  mode: 'oauth_synced' | 'hybrid_bundle';
  totalTracks: number;
  matchedTracks: number;
  createdAt: string;
  rows: TrackMatchRow[];
}

export interface SharedPlaylist {
  shareId: string;
  playlistTitle: string;
  creator?: string;
  artworkUrl?: string;
  sourcePlatform: PlatformId;
  destinationPlatform: PlatformId;
  nativePlaylistUrl?: string;
  createdAt: string;
  rows: TrackMatchRow[];
}
