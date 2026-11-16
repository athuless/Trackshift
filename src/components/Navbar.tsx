import React from 'react';

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 bg-[#FAFAFA]/90 backdrop-blur-md border-b border-neutral-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        <a
          href="#top"
          className="font-display text-lg font-bold tracking-tight text-neutral-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 rounded"
        >
          Trackshift
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-600">
          <a
            href="#workbench"
            className="hover:text-neutral-900 transition-colors whitespace-nowrap shrink-0 py-1"
          >
            Transfer
          </a>
          <a
            href="#platforms"
            className="hover:text-neutral-900 transition-colors whitespace-nowrap shrink-0 py-1"
          >
            Platforms
          </a>
          <a
            href="#history"
            className="hover:text-neutral-900 transition-colors whitespace-nowrap shrink-0 py-1"
          >
            History
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <a
            href="#workbench"
            className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            New Transfer
          </a>
        </div>
      </div>
    </header>
  );
}
