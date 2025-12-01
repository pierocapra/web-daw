<script>
  import Knob from './Knob.svelte';

  export let track = null;
  export let trackNumber = 1;
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
    hasAudioBuffer = !!track.audioBuffer;
  }

  function handleVolumeChange(event) {
    const value = parseFloat(event.target.value);
    if (track) {
      track.setVolume(value);
      volume = value;
    }
  }

  // Knob value change handlers
  function handleGainChange() {
    if (track) {
      track.setGain(gain);
    }
  }

  function handleLowEQChange() {
    if (track) {
      track.setLowEQ(lowEQ);
    }
  }

  function handleMidEQChange() {
    if (track) {
      track.setMidEQ(midEQ);
    }
  }

  function handleHighEQChange() {
    if (track) {
      track.setHighEQ(highEQ);
    }
  }

  // Watch for knob value changes
  $: if (track && gain !== undefined) {
    handleGainChange();
  }

  $: if (track && lowEQ !== undefined) {
    handleLowEQChange();
  }

  $: if (track && midEQ !== undefined) {
    handleMidEQChange();
  }

  $: if (track && highEQ !== undefined) {
    handleHighEQChange();
  }

  function formatDB(value) {
    return value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  }

  function formatPercent(value) {
    return Math.round(value * 100);
  }
</script>

<div class="track">
  <div class="track-header">
    <div class="track-info">
      <h3>Track {trackNumber}</h3>
    </div>
  </div>

  <div class="track-controls">
    <!-- Gain Knob -->
    <div class="control-knob">
      <Knob
        bind:value={gain}
        min={0}
        max={2}
        step={0.01}
        label="Gain"
        unit=""
        size={70}
        on:change={(e) => {
          gain = e.detail;
          handleGainChange();
        }}
      />
    </div>

    <!-- EQ Knobs -->
    <div class="eq-knobs">
      <Knob
        bind:value={lowEQ}
        min={-12}
        max={12}
        step={0.1}
        label="Low"
        unit="dB"
        size={60}
        on:change={(e) => {
          lowEQ = e.detail;
          handleLowEQChange();
        }}
      />
      <Knob
        bind:value={midEQ}
        min={-12}
        max={12}
        step={0.1}
        label="Mid"
        unit="dB"
        size={60}
        on:change={(e) => {
          midEQ = e.detail;
          handleMidEQChange();
        }}
      />
      <Knob
        bind:value={highEQ}
        min={-12}
        max={12}
        step={0.1}
        label="High"
        unit="dB"
        size={60}
        on:change={(e) => {
          highEQ = e.detail;
          handleHighEQChange();
        }}
      />
    </div>
  </div>

  <!-- Volume at bottom -->
  <div class="volume-control">
    <label for="volume-{trackNumber}">Volume</label>
    <div class="volume-slider-container">
      <input
        id="volume-{trackNumber}"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        on:input={handleVolumeChange}
        class="volume-slider"
      />
      <span class="volume-value">{formatPercent(volume)}%</span>
    </div>
  </div>
</div>

<style>
  .track {
    display: flex;
    flex-direction: column;
    background: #1e1e1e;
    border-radius: 4px;
    border: 1px solid #2d2d2d;
    min-width: 200px;
    width: 100%;
    overflow: hidden;
  }

  .track-header {
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

  .track-controls {
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    flex: 1;
  }

  .control-knob {
    display: flex;
    justify-content: center;
  }

  .eq-knobs {
    display: flex;
    gap: 16px;
    justify-content: center;
  }

  .volume-control {
    padding: 12px 16px;
    border-top: 1px solid #2d2d2d;
    background: #1a1a1a;
  }

  .volume-control label {
    display: block;
    font-size: 10px;
    font-weight: 500;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .volume-slider-container {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .volume-slider {
    flex: 1;
    height: 4px;
    background: #333;
    border-radius: 2px;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
  }

  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: #4a9eff;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.15s;
  }

  .volume-slider::-webkit-slider-thumb:hover {
    background: #5aaeff;
  }

  .volume-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: #4a9eff;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    transition: background 0.15s;
  }

  .volume-slider::-moz-range-thumb:hover {
    background: #5aaeff;
  }

  .volume-value {
    min-width: 45px;
    text-align: right;
    font-size: 11px;
    color: #888;
    font-family: 'Courier New', monospace;
  }
</style>
