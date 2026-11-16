import React from 'react';
import {PLATFORMS, PlatformLogo} from '../data/platforms';
import type {PlatformId} from '../types';

interface PlatformsSectionProps {
  onSelectSource: (platform: PlatformId) => void;
}

const PLATFORM_CAPABILITIES: Record<PlatformId, {read: string; share: string; note: string}> = {
  spotify: {
    read: 'Public Spotify playlist links',
    share: 'Shareable player link, track links & M3U8 / CSV export',
    note: 'Supports public playlists and pasted tracklists without login.',
  },
  apple: {
    read: 'Shared Apple Music playlist URLs',
    share: 'Direct Apple Music song links & M3U8 / CSV export',
    note: 'Matches against live Apple Music catalog IDs with 30s audio previews.',
  },
  youtube: {
    read: 'Public & unlisted YouTube / YT Music playlists',
    share: 'Instant playable YouTube queue link & song links',
    note: 'Strips "(Official Video)" noise and builds a playable watch queue.',
  },
  soundcloud: {
    read: 'Public SoundCloud set URLs & tracklists',
    share: 'Verified SoundCloud track links & M3U8 / CSV export',
    note: 'Ideal for moving indie mixes, edits, and sets across services.',
  },
};

export function PlatformsSection({onSelectSource}: PlatformsSectionProps) {
  return (
    <section id="platforms" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-neutral-200">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        <div className="lg:col-span-5 flex flex-col justify-between gap-6">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900 [text-wrap:balance]">
              Four major music libraries, unified in one clean pass.
            </h2>
            <p className="text-sm sm:text-base text-neutral-600 mt-3 leading-relaxed">
              Paste any public playlist link to extract tracks immediately without creating an account or connecting credentials. Match every song, preview audio, and share one clean link that opens in any player.
            </p>
          </div>

          <div className="relative rounded-2xl overflow-hidden border border-neutral-200 bg-neutral-100 aspect-16/10 lg:aspect-auto lg:flex-1 min-h-[220px]">
            <img
              src="/src/assets/images/hero_audio_studio_1794840278374.jpg"
              alt="Minimalist architectural audio listening studio"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLATFORMS.map((platform) => {
            const cap = PLATFORM_CAPABILITIES[platform.id];

            return (
              <div
                key={platform.id}
                className="bg-white border border-neutral-200 rounded-2xl p-5 flex flex-col justify-between gap-5"
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <PlatformLogo platform={platform.id} className="w-7 h-7 shrink-0" />
                      <h3 className="font-display font-semibold text-neutral-900">{platform.name}</h3>
                    </div>
                    <span className="text-xs text-neutral-500">Zero-login</span>
                  </div>

                  <dl className="mt-4 space-y-2.5 text-xs">
                    <div>
                      <dt className="text-neutral-400">Import</dt>
                      <dd className="text-neutral-700 mt-0.5">{cap.read}</dd>
                    </div>
                    <div>
                      <dt className="text-neutral-400">Transfer</dt>
                      <dd className="text-neutral-700 mt-0.5">{cap.share}</dd>
                    </div>
                  </dl>
                  <p className="text-xs text-neutral-500 mt-3 pt-3 border-t border-neutral-100 leading-relaxed">
                    {cap.note}
                  </p>
                </div>

                <div className="pt-1">
                  <a
                    href="#workbench"
                    onClick={() => onSelectSource(platform.id)}
                    className="text-xs font-medium text-neutral-900 hover:text-blue-600 transition-colors whitespace-nowrap"
                  >
                    Use as source →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
