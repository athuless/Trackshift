import React from 'react';
import {ArrowRight, Download, ExternalLink, RotateCcw, Trash2} from 'lucide-react';
import type {TransferHistoryEntry} from '../types';
import {PLATFORM_MAP, PlatformLogo, downloadPlaylistExport} from '../data/platforms';

interface HistorySectionProps {
  entries: TransferHistoryEntry[];
  onReload: (entry: TransferHistoryEntry) => void;
  onOpenSharePage: (shareId: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function HistorySection({entries, onReload, onOpenSharePage, onDelete, onClearAll}: HistorySectionProps) {
  return (
    <section id="history" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-neutral-200">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900">
            Recent Transfers
          </h2>
          <p className="text-sm text-neutral-600 mt-1">
            Saved locally in this browser so you can re-export or migrate to another service anytime.
          </p>
        </div>

        {entries.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs font-medium text-neutral-500 hover:text-red-600 transition-colors self-start sm:self-auto cursor-pointer"
          >
            Clear all history
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-2xl p-10 text-center">
          <p className="font-medium text-neutral-900">No saved transfers yet</p>
          <p className="text-sm text-neutral-500 mt-1.5 max-w-md mx-auto">
            Load a playlist link or sample above and prepare a transfer bundle to save a snapshot here.
          </p>
          <a
            href="#workbench"
            className="inline-flex items-center gap-2 mt-5 px-4 py-2 text-xs font-medium text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <span>Start a transfer</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-2xl divide-y divide-neutral-200 overflow-hidden">
          {entries.map((entry) => {
            const src = PLATFORM_MAP[entry.sourcePlatform];
            const dst = PLATFORM_MAP[entry.destinationPlatform];
            const matchRate = entry.totalTracks > 0 ? Math.round((entry.matchedTracks / entry.totalTracks) * 100) : 0;
            const dateLabel = new Date(entry.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <div
                key={entry.id}
                className="p-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-50/70 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <img
                    src={entry.artworkUrl || '/src/assets/images/playlist_cover_minimal_1794840278825.jpg'}
                    alt={entry.playlistTitle}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.src = '/src/assets/images/playlist_cover_minimal_1794840278825.jpg';
                    }}
                    className="w-12 h-12 rounded-lg object-cover border border-neutral-200 shrink-0 bg-neutral-100"
                  />
                  <div className="min-w-0">
                    <h3 className="font-medium text-neutral-900 truncate">{entry.playlistTitle}</h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 mt-1">
                      <span className="inline-flex items-center gap-1.5 text-neutral-700">
                        <PlatformLogo platform={entry.sourcePlatform} className="w-3.5 h-3.5" />
                        <span>{src.shortName}</span>
                      </span>
                      <span aria-hidden="true">→</span>
                      <span className="inline-flex items-center gap-1.5 text-neutral-700">
                        <PlatformLogo platform={entry.destinationPlatform} className="w-3.5 h-3.5" />
                        <span>{dst.shortName}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{entry.totalTracks} tracks</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{matchRate}% matched</span>
                      <span aria-hidden="true">·</span>
                      <span>{dateLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {entry.shareId && (
                    <button
                      type="button"
                      onClick={() => onOpenSharePage(entry.shareId!)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <span>Player Link</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onReload(entry)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Open in Studio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadPlaylistExport('csv', entry.playlistTitle, entry.destinationPlatform, entry.rows)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(entry.id)}
                    aria-label={`Delete ${entry.playlistTitle} from history`}
                    className="p-2 text-neutral-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
