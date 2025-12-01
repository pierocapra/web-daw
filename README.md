# Web DAW

A Digital Audio Workstation built with Svelte.js and Web Audio API.

## Features

- **Multiple Tracks**: Support for multiple audio tracks (currently 4 tracks, easily scalable)
- **Audio File Loading**: Load audio files (WAV, MP3, etc.) onto tracks
- **3-Band EQ**: Low, Mid, and High frequency controls per track (-12dB to +12dB)
- **Gain Control**: Adjustable gain per track (0 to 200%)
- **Volume Fader**: Individual volume control per track (0-100%)
- **Master Volume**: Global volume control
- **Playback Controls**: Play/pause functionality per track

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Build

```bash
npm run build
```

## Architecture

- **AudioContextManager** (`src/lib/audioContext.js`): Manages the Web Audio API context and master gain node
- **Track** (`src/lib/track.js`): Handles individual track audio processing, EQ, gain, and volume
- **Track Component** (`src/components/Track.svelte`): UI component for track controls
- **App** (`src/App.svelte`): Main application component

## Web Audio API Structure

Each track uses the following node chain:
```
AudioBufferSource → Gain (pre-EQ) → Low Shelf Filter → Peaking Filter (Mid) → High Shelf Filter → Volume Gain → Master Gain → Destination
```

## Future Enhancements

- Timeline/transport controls
- Recording functionality
- MIDI support
- Effects (reverb, delay, etc.)
- Automation
- Export/import projects
- More EQ bands or parametric EQ
- Visual waveform display

