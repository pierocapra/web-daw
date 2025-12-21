<script>
  import { onMount, onDestroy } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import Knob from './Knob.svelte';

  export let track = null;
  export let trackNumber = 1;

  const dispatch = createEventDispatcher();

  function handleDelete() {
    if (confirm('Are you sure you want to delete this track?')) {
      dispatch('delete');
    }
  }

  let eqCanvas;
  let volume = 1.0;
  let gain = 1.0;
  let lowEQ = 0;
  let midEQ = 0;
  let highEQ = 0;
  let lowFreq = 250;
  let midFreq = 1000;
  let highFreq = 4000;
  let hasAudioBuffer = false;

  $: if (track) {
    volume = track.getVolume();
    gain = track.getGain();
    lowEQ = track.getLowEQ();
    midEQ = track.getMidEQ();
    highEQ = track.getHighEQ();
    lowFreq = track.getLowFrequency();
    midFreq = track.getMidFrequency();
    highFreq = track.getHighFrequency();
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

  function handleLowFreqChange(event) {
    const value = parseFloat(event.target.value);
    if (track) {
      track.setLowFrequency(value);
      lowFreq = value;
    }
  }

  function handleMidFreqChange(event) {
    const value = parseFloat(event.target.value);
    if (track) {
      track.setMidFrequency(value);
      midFreq = value;
    }
  }

  function handleHighFreqChange(event) {
    const value = parseFloat(event.target.value);
    if (track) {
      track.setHighFrequency(value);
      highFreq = value;
    }
  }

  function formatFrequency(freq) {
    if (freq >= 1000) {
      return `${(freq / 1000).toFixed(1)}k`;
    }
    return Math.round(freq).toString();
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

  function drawEQ() {
    if (!eqCanvas || !track) return;

    const canvas = eqCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;

    // Horizontal center line (0dB)
    const centerY = height / 2;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Frequency range (logarithmic): 20Hz to 20kHz
    const minFreq = 20;
    const maxFreq = 20000;

    // Draw frequency response curve
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const points = [];
    for (let i = 0; i < width; i++) {
      const freq = minFreq * Math.pow(maxFreq / minFreq, i / width);

      // Calculate response for each filter
      let response = 0;

      // Low shelf response (simplified)
      if (freq <= lowFreq) {
        response += lowEQ;
      } else if (freq <= lowFreq * 2) {
        response += lowEQ * (1 - (freq - lowFreq) / lowFreq);
      }

      // Mid peaking response (simplified)
      const midDist = Math.abs(Math.log2(freq / midFreq));
      if (midDist < 1.5) {
        const bell = Math.cos(((midDist / 1.5) * Math.PI) / 2);
        response += midEQ * bell;
      }

      // High shelf response (simplified)
      if (freq >= highFreq) {
        response += highEQ;
      } else if (freq >= highFreq / 2) {
        response += highEQ * ((freq - highFreq / 2) / (highFreq / 2));
      }

      // Convert dB to linear and clamp
      const linearGain = Math.pow(10, response / 20);
      const clampedGain = Math.max(0.1, Math.min(10, linearGain));

      // Convert to dB for display (clamped to -24dB to +24dB)
      const displayGain = Math.max(-24, Math.min(24, response));

      // Map to canvas coordinates
      const y = centerY - (displayGain / 24) * (height / 2 - 10);
      points.push({ x: i, y });

      if (i === 0) {
        ctx.moveTo(i, y);
      } else {
        ctx.lineTo(i, y);
      }
    }

    ctx.stroke();

    // Draw frequency markers
    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // const markerFreqs = [100, 1000, 10000];
    // markerFreqs.forEach((freq) => {
    //   const x =
    //     (Math.log(freq / minFreq) / Math.log(maxFreq / minFreq)) * width;
    //   ctx.beginPath();
    //   ctx.moveTo(x, height - 15);
    //   ctx.lineTo(x, height);
    //   ctx.stroke();
    //   ctx.fillText(formatFrequency(freq), x, height - 12);
    // });

    // // Draw gain markers
    // ctx.textAlign = 'right';
    // ctx.textBaseline = 'middle';
    // [-12, 0, 12].forEach((db) => {
    //   const y = centerY - (db / 24) * (height / 2 - 10);
    //   ctx.fillText(`${db > 0 ? '+' : ''}${db}dB`, width - 5, y);
    // });
  }

  onMount(() => {
    if (eqCanvas) {
      const rect = eqCanvas.getBoundingClientRect();
      eqCanvas.width = rect.width * (window.devicePixelRatio || 1);
      eqCanvas.height = rect.height * (window.devicePixelRatio || 1);
      const ctx = eqCanvas.getContext('2d');
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
      drawEQ();
    }
  });

  $: if (track && eqCanvas) {
    drawEQ();
  }
</script>

<div class="track">
  <div class="track-header">
    <div class="track-info">
      <h3>Track {trackNumber}</h3>
    </div>
    <button
      class="delete-track-button"
      on:click={handleDelete}
      title="Delete Track"
      aria-label="Delete Track"
    >
      ×
    </button>
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
        size={40}
        color="#ff4444"
        on:change={(e) => {
          gain = e.detail;
          handleGainChange();
        }}
      />
    </div>

    <!-- EQ Controls -->
    <div class="eq-section">
      <!-- EQ Display -->
      <div class="eq-display-container">
        <canvas bind:this={eqCanvas} class="eq-canvas"></canvas>
      </div>

      <!-- EQ Knobs and Frequency Controls -->
      <div class="eq-controls">
        <!-- Low EQ -->
        <div class="eq-band">
          <Knob
            bind:value={lowEQ}
            min={-12}
            max={12}
            step={0.1}
            label="Low"
            unit="dB"
            size={30}
            color="#4a9eff"
            on:change={(e) => {
              lowEQ = e.detail;
              handleLowEQChange();
              drawEQ();
            }}
          />
          <div class="freq-control">
            <input
              id="low-freq-{trackNumber}"
              type="range"
              min="20"
              max="500"
              step="1"
              value={lowFreq}
              on:input={handleLowFreqChange}
              on:change={(e) => {
                handleLowFreqChange(e);
                drawEQ();
              }}
              class="freq-slider freq-slider-low"
            />
            <span class="freq-value">{formatFrequency(lowFreq)}Hz</span>
          </div>
        </div>

        <!-- Mid EQ -->
        <div class="eq-band">
          <Knob
            bind:value={midEQ}
            min={-12}
            max={12}
            step={0.1}
            label="Mid"
            unit="dB"
            size={30}
            color="#ffd700"
            on:change={(e) => {
              midEQ = e.detail;
              handleMidEQChange();
              drawEQ();
            }}
          />
          <div class="freq-control">
            <input
              id="mid-freq-{trackNumber}"
              type="range"
              min="200"
              max="5000"
              step="10"
              value={midFreq}
              on:input={handleMidFreqChange}
              on:change={(e) => {
                handleMidFreqChange(e);
                drawEQ();
              }}
              class="freq-slider freq-slider-mid"
            />
            <span class="freq-value">{formatFrequency(midFreq)}Hz</span>
          </div>
        </div>

        <!-- High EQ -->
        <div class="eq-band">
          <Knob
            bind:value={highEQ}
            min={-12}
            max={12}
            step={0.1}
            label="High"
            unit="dB"
            size={30}
            color="#4caf50"
            on:change={(e) => {
              highEQ = e.detail;
              handleHighEQChange();
              drawEQ();
            }}
          />
          <div class="freq-control">
            <input
              id="high-freq-{trackNumber}"
              type="range"
              min="1000"
              max="20000"
              step="100"
              value={highFreq}
              on:input={handleHighFreqChange}
              on:change={(e) => {
                handleHighFreqChange(e);
                drawEQ();
              }}
              class="freq-slider freq-slider-high"
            />
            <span class="freq-value">{formatFrequency(highFreq)}Hz</span>
          </div>
        </div>
      </div>
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
    /* border-radius: 4px; */
    border-right: 1px solid #2d2d2d;
    border-left: 1px solid #2d2d2d;
    max-width: 100px;
    width: 100%;
    overflow: hidden;
  }

  .track-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 8px;
    border-bottom: 1px solid #2d2d2d;
    background: #1f1f1f;
  }

  .track-info h3 {
    font-size: 10px;
    margin: 0 0 4px 0;
    color: #fff;
    font-weight: 600;
  }

  .delete-track-button {
    background: transparent;
    border: none;
    color: #888;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    transition: all 0.15s;
    opacity: 0.6;
  }

  .delete-track-button:hover {
    background: #e74c3c;
    color: #fff;
    opacity: 1;
  }

  .delete-track-button:active {
    transform: scale(0.9);
  }

  .track-controls {
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    flex: 1;
  }

  .control-knob {
    display: flex;
    justify-content: center;
  }

  .eq-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .eq-display-container {
    width: 100%;
    height: 30px;
    background: #0f0f0f;
    border: 1px solid #2d2d2d;
    border-radius: 4px;
    overflow: hidden;
  }

  .eq-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .eq-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    justify-content: center;
  }

  .eq-band {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .freq-control {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
  }

  .freq-slider {
    width: 100%;
    height: 4px;
    background: #333;
    border-radius: 2px;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
  }

  .freq-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    background: #4a9eff;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.15s;
  }

  .freq-slider::-webkit-slider-thumb:hover {
    background: #5aaeff;
  }

  .freq-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: #4a9eff;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    transition: background 0.15s;
  }

  .freq-slider::-moz-range-thumb:hover {
    background: #5aaeff;
  }

  /* Low frequency slider - Blue */
  .freq-slider-low::-webkit-slider-thumb {
    background: #4a9eff;
  }

  .freq-slider-low::-webkit-slider-thumb:hover {
    background: #5aaeff;
  }

  .freq-slider-low::-moz-range-thumb {
    background: #4a9eff;
  }

  .freq-slider-low::-moz-range-thumb:hover {
    background: #5aaeff;
  }

  /* Mid frequency slider - Yellow */
  .freq-slider-mid::-webkit-slider-thumb {
    background: #ffd700;
  }

  .freq-slider-mid::-webkit-slider-thumb:hover {
    background: #ffed4e;
  }

  .freq-slider-mid::-moz-range-thumb {
    background: #ffd700;
  }

  .freq-slider-mid::-moz-range-thumb:hover {
    background: #ffed4e;
  }

  /* High frequency slider - Green */
  .freq-slider-high::-webkit-slider-thumb {
    background: #4caf50;
  }

  .freq-slider-high::-webkit-slider-thumb:hover {
    background: #66bb6a;
  }

  .freq-slider-high::-moz-range-thumb {
    background: #4caf50;
  }

  .freq-slider-high::-moz-range-thumb:hover {
    background: #66bb6a;
  }

  .freq-value {
    font-size: 9px;
    color: #aaa;
    font-family: 'Courier New', monospace;
    min-width: 50px;
    text-align: center;
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
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .volume-slider {
    width: 4px;
    height: 120px;
    background: #333;
    border-radius: 2px;
    outline: none;
    -webkit-appearance: slider-vertical; /* WebKit */
    writing-mode: bt-lr; /* IE */
    appearance: slider-vertical;
  }

  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: #ffffff;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.15s;
  }

  .volume-slider::-webkit-slider-thumb:hover {
    background: #f0f0f0;
  }

  .volume-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: #ffffff;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    transition: background 0.15s;
  }

  .volume-slider::-moz-range-thumb:hover {
    background: #f0f0f0;
  }

  .volume-value {
    min-width: 45px;
    text-align: center;
    font-size: 11px;
    color: #888;
    font-family: 'Courier New', monospace;
  }
</style>
