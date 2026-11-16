# Trackshift

A minimalist, zero-login web application for moving and sharing playlists across **Spotify**, **Apple Music**, **YouTube Music**, and **SoundCloud**.

Paste any public playlist link (or raw tracklist), review live catalog matches with 30-second audio previews, and generate a single shareable player link or downloadable playlist file—without requiring account logins or paid developer keys.

## Features

- **Multi-Platform Link Parsing**: Automatically detects and parses public playlist URLs from Spotify, Apple Music, YouTube / YouTube Music, and SoundCloud, plus pasted tracklists, CSV, and M3U8 files.
- **Live Track Matching & Audio Previews**: Matches tracks against live catalog metadata with confidence scoring (`Exact`, `High`, `Review`), inline 30-second audio previews, and an alternate-version switcher.
- **Shareable Player Link (`/p/:id`)**: Generates a dedicated playlist page where recipients can pick their preferred music app, open songs directly, or step through tracks with a guided launcher.
- **Instant YouTube Playlist Queue**: Resolves YouTube video IDs into a native multi-track `watch_videos` link that plays all tracks together in YouTube.
- **Playlist Exports & Local History**: Export matched playlists as **CSV**, **M3U8**, or **JSON**, and revisit past transfers saved locally in your browser.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
- **Backend**: Node.js, Express (`server.ts`)

## Getting Started

### Prerequisites
- Node.js 22+

### Installation & Local Development

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3000`.

### Production Build & Run

```bash
npm run build
NODE_ENV=production npm start
```
