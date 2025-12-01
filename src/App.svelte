<script>
  import { onMount } from 'svelte';
  import { audioContextManager } from './lib/audioContext.js';
  import { Track } from './lib/track.js';
  import TrackComponent from './components/Track.svelte';
  import Timeline from './components/Timeline.svelte';

  let tracks = [];
  let initialized = false;
  let masterVolume = 1.0;
  let isPlayingAll = false;
  let loadedTracksCount = 0;
  const NUM_TRACKS = 4; // Start with 4 tracks, easily scalable

  onMount(async () => {
    try {
      await audioContextManager.init();
      initialized = true;

      // Create initial tracks
      const destination = audioContextManager.getDestination();
      const context = audioContextManager.getContext();

      for (let i = 0; i < NUM_TRACKS; i++) {
        const track = new Track(context, destination, i + 1);
        tracks = [...tracks, track];
      }
    } catch (error) {
      console.error('Failed to initialize DAW:', error);
      alert(
        'Failed to initialize audio. Please check your browser compatibility.'
      );
    }
  });

  let timelineKey = 0; // Key to force timeline re-render

  function handleFileLoaded(event) {
    console.log('File loaded on track:', event.detail);
    // Force update by incrementing and recalculating
    // This ensures reactivity works even though we're checking object properties
    loadedTracksCount = tracks.filter(
      (track) => track.audioBuffer !== null
    ).length;
    // Force timeline to update by changing key
    timelineKey++;
  }

  function handleMasterVolumeChange(event) {
    const value = parseFloat(event.target.value);
    masterVolume = value;
    audioContextManager.setMasterVolume(value);
  }

  function formatPercent(value) {
    return Math.round(value * 100);
  }

  // Reactive statement to check if any audio is loaded
  // This will update when loadedTracksCount changes
  $: hasAnyAudioLoaded = loadedTracksCount > 0;

  // Sync global play state with individual track states
  $: {
    const anyPlaying = tracks.some((track) => track.isPlaying);
    if (anyPlaying !== isPlayingAll) {
      isPlayingAll = anyPlaying;
    }
  }

  async function togglePlayAll() {
    if (!hasAnyAudioLoaded) return;

    // Ensure audio context is resumed
    await audioContextManager.resume();

    if (isPlayingAll) {
      // Pause all tracks
      tracks.forEach((track) => {
        if (track.isPlaying) {
          track.pause();
        }
      });
      isPlayingAll = false;
    } else {
      // Play all tracks that have audio loaded
      tracks.forEach((track) => {
        if (track.audioBuffer && !track.isPlaying) {
          track.play();
        }
      });
      // Update state after a brief delay to allow tracks to start
      setTimeout(() => {
        isPlayingAll = tracks.some((track) => track.isPlaying);
      }, 10);
    }
  }
</script>

<div class="daw-container">
  <header class="daw-header">
    <h1>Web DAW</h1>
    <div class="master-controls">
      <button
        class="play-all-button"
        on:click={togglePlayAll}
        disabled={!hasAnyAudioLoaded}
        aria-label={isPlayingAll ? 'Pause All' : 'Play All'}
      >
        {isPlayingAll ? '⏸' : '▶'} All
      </button>
      <div class="master-volume-control">
        <label>Master Volume</label>
        <div class="master-slider-container">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={masterVolume}
            on:input={handleMasterVolumeChange}
            class="master-slider"
          />
          <span class="master-value">{formatPercent(masterVolume)}%</span>
        </div>
      </div>
    </div>
  </header>

  <main class="daw-main">
    {#if !initialized}
      <div class="loading">Initializing audio engine...</div>
    {:else}
      <div class="daw-workspace">
        <div class="timeline-wrapper">
          <Timeline {tracks} key={timelineKey} />
        </div>
        <div class="tracks-container">
          {#each tracks as track, index}
            <TrackComponent
              {track}
              trackNumber={index + 1}
              on:fileLoaded={handleFileLoaded}
            />
          {/each}
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  .daw-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .daw-header {
    background: #252525;
    padding: 20px 40px;
    border-bottom: 2px solid #333;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .daw-header h1 {
    font-size: 28px;
    color: #fff;
    font-weight: 600;
  }

  .master-controls {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .play-all-button {
    background: #4a9eff;
    border: none;
    color: white;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .play-all-button:hover:not(:disabled) {
    background: #5aaeff;
  }

  .play-all-button:disabled {
    background: #444;
    cursor: not-allowed;
    opacity: 0.5;
  }

  .master-volume-control {
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .master-volume-control label {
    font-size: 14px;
    color: #ccc;
  }

  .master-slider-container {
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .master-slider {
    width: 200px;
    height: 6px;
    background: #3a3a3a;
    border-radius: 3px;
    outline: none;
    -webkit-appearance: none;
  }

  .master-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    background: #ff6b6b;
    border-radius: 50%;
    cursor: pointer;
  }

  .master-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    background: #ff6b6b;
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }

  .master-value {
    min-width: 50px;
    text-align: right;
    font-size: 14px;
    color: #999;
  }

  .daw-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .loading {
    text-align: center;
    padding: 100px 20px;
    font-size: 18px;
    color: #999;
  }

  .daw-workspace {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .timeline-wrapper {
    flex-shrink: 0;
    background: #1a1a1a;
  }

  .tracks-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }
</style>
