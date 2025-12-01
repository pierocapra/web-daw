<script>
  import { audioContextManager } from '../lib/audioContext.js';
  import { createEventDispatcher } from 'svelte';

  export let track = null;
  export let trackNumber = 1;

  const dispatch = createEventDispatcher();

  let fileName = 'No file loaded';
  let isPlaying = false;
  let volume = 1.0;
  let gain = 1.0;
  let lowEQ = 0;
  let midEQ = 0;
  let highEQ = 0;
  let hasAudioBuffer = false;

  $: if (track) {
    volume = track.getVolume();
    gain = track.getGain();
    lowEQ = track.getLowEQ();
    midEQ = track.getMidEQ();
    highEQ = track.getHighEQ();
    isPlaying = track.isPlaying;
    hasAudioBuffer = !!track.audioBuffer;
  }

  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file && track) {
      fileName = file.name;
      track.loadAudioFile(file).then((success) => {
        if (success) {
          hasAudioBuffer = true;
          dispatch('fileLoaded', { trackId: track.id, fileName: file.name });
        }
      });
    }
  }

  async function togglePlayback() {
    if (!track || !track.audioBuffer) return;

    // Ensure audio context is resumed (required for user interaction)
    await audioContextManager.resume();

    if (isPlaying) {
      track.pause();
    } else {
      track.play();
    }
    // Update state from track
    isPlaying = track.isPlaying;
  }

  function handleVolumeChange(event) {
    const value = parseFloat(event.target.value);
    if (track) {
      track.setVolume(value);
      volume = value;
    }
  }

  function handleGainChange(event) {
    const value = parseFloat(event.target.value);
    if (track) {
      track.setGain(value);
      gain = value;
    }
  }

  function handleLowEQChange(event) {
    const value = parseFloat(event.target.value);
    if (track) {
      track.setLowEQ(value);
      lowEQ = value;
    }
  }

  function handleMidEQChange(event) {
    const value = parseFloat(event.target.value);
    if (track) {
      track.setMidEQ(value);
      midEQ = value;
    }
  }

  function handleHighEQChange(event) {
    const value = parseFloat(event.target.value);
    if (track) {
      track.setHighEQ(value);
      highEQ = value;
    }
  }

  function formatDB(value) {
    return value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  }

  function formatPercent(value) {
    return Math.round(value * 100);
  }
</script>

<div class="track">
  <!-- Left Sidebar: Controls -->
  <div class="track-sidebar">
    <div class="sidebar-header">
      <div class="track-info">
        <h3>Track {trackNumber}</h3>
        <span class="file-name">{fileName}</span>
      </div>
      <button
        class="play-button"
        on:click={togglePlayback}
        disabled={!hasAudioBuffer}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
    </div>

    <div class="sidebar-controls">
      <div class="control-group">
        <label for="volume-{trackNumber}">Volume</label>
        <div class="slider-container">
          <input
            id="volume-{trackNumber}"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            on:input={handleVolumeChange}
            class="slider"
          />
          <span class="value">{formatPercent(volume)}%</span>
        </div>
      </div>

      <div class="control-group">
        <label for="gain-{trackNumber}">Gain</label>
        <div class="slider-container">
          <input
            id="gain-{trackNumber}"
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={gain}
            on:input={handleGainChange}
            class="slider"
          />
          <span class="value">{formatPercent(gain / 2)}%</span>
        </div>
      </div>

      <div class="eq-section">
        <h4>3-Band EQ</h4>
        <div class="eq-controls">
          <div class="eq-band">
            <label for="low-eq-{trackNumber}">Low</label>
            <input
              id="low-eq-{trackNumber}"
              type="range"
              min="-12"
              max="12"
              step="0.1"
              value={lowEQ}
              on:input={handleLowEQChange}
              class="eq-slider"
            />
            <span class="eq-value">{formatDB(lowEQ)}dB</span>
          </div>

          <div class="eq-band">
            <label for="mid-eq-{trackNumber}">Mid</label>
            <input
              id="mid-eq-{trackNumber}"
              type="range"
              min="-12"
              max="12"
              step="0.1"
              value={midEQ}
              on:input={handleMidEQChange}
              class="eq-slider"
            />
            <span class="eq-value">{formatDB(midEQ)}dB</span>
          </div>

          <div class="eq-band">
            <label for="high-eq-{trackNumber}">High</label>
            <input
              id="high-eq-{trackNumber}"
              type="range"
              min="-12"
              max="12"
              step="0.1"
              value={highEQ}
              on:input={handleHighEQChange}
              class="eq-slider"
            />
            <span class="eq-value">{formatDB(highEQ)}dB</span>
          </div>
        </div>
      </div>

      <div class="file-upload">
        <label for="file-input-{trackNumber}" class="file-label">
          Load Audio
        </label>
        <input
          id="file-input-{trackNumber}"
          type="file"
          accept="audio/*"
          on:change={handleFileSelect}
          class="file-input"
        />
      </div>
    </div>
  </div>
</div>

<style>
  .track {
    display: flex;
    background: #1e1e1e;
    border-radius: 4px;
    margin-bottom: 2px;
    border: 1px solid #2d2d2d;
    min-height: 120px;
    overflow: hidden;
  }

  /* Left Sidebar */
  .track-sidebar {
    width: 280px;
    min-width: 280px;
    background: #252525;
    border-right: 1px solid #2d2d2d;
    display: flex;
    flex-direction: column;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #2d2d2d;
    background: #1f1f1f;
  }

  .track-info h3 {
    font-size: 14px;
    margin: 0 0 4px 0;
    color: #fff;
    font-weight: 600;
  }

  .file-name {
    font-size: 11px;
    color: #888;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }

  .play-button {
    background: #4a9eff;
    border: none;
    color: white;
    width: 36px;
    height: 36px;
    border-radius: 4px;
    font-size: 16px;
    cursor: pointer;
    transition: background 0.15s;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .play-button:hover:not(:disabled) {
    background: #5aaeff;
  }

  .play-button:disabled {
    background: #333;
    cursor: not-allowed;
    opacity: 0.5;
  }

  .sidebar-controls {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
    flex: 1;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .control-group label {
    font-size: 11px;
    font-weight: 500;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .slider-container {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .slider {
    flex: 1;
    height: 4px;
    background: #333;
    border-radius: 2px;
    outline: none;
    -webkit-appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: #4a9eff;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.15s;
  }

  .slider::-webkit-slider-thumb:hover {
    background: #5aaeff;
  }

  .slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: #4a9eff;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    transition: background 0.15s;
  }

  .slider::-moz-range-thumb:hover {
    background: #5aaeff;
  }

  .value {
    min-width: 45px;
    text-align: right;
    font-size: 11px;
    color: #888;
    font-family: 'Courier New', monospace;
  }

  .eq-section {
    background: #1a1a1a;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid #2d2d2d;
    overflow: hidden;
  }

  .eq-section h4 {
    font-size: 10px;
    margin: 0 0 12px 0;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }

  .eq-controls {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .eq-band {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    min-width: 0;
  }

  .eq-band label {
    font-size: 10px;
    color: #888;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .eq-slider {
    width: 80px;
    height: 4px;
    transform: rotate(-90deg);
    background: #333;
    border-radius: 2px;
    outline: none;
    -webkit-appearance: none;
    margin: 30px 0;
  }

  .eq-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: #4a9eff;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.15s;
  }

  .eq-slider::-webkit-slider-thumb:hover {
    background: #5aaeff;
  }

  .eq-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: #4a9eff;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    transition: background 0.15s;
  }

  .eq-slider::-moz-range-thumb:hover {
    background: #5aaeff;
  }

  .eq-value {
    font-size: 10px;
    color: #888;
    text-align: center;
    font-family: 'Courier New', monospace;
  }

  .file-upload {
    margin-top: 4px;
  }

  .file-label {
    display: inline-block;
    padding: 8px 16px;
    background: #333;
    color: #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.15s;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    width: 100%;
    text-align: center;
    border: 1px solid #3a3a3a;
  }

  .file-label:hover {
    background: #3a3a3a;
    border-color: #4a4a4a;
  }

  .file-input {
    display: none;
  }
</style>
