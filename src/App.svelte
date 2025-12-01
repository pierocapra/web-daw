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
  let timelineComponent;
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

  async function playAll() {
    if (!hasAnyAudioLoaded) return;
    await audioContextManager.resume();

    tracks.forEach((track) => {
      if (track.audioBuffer && !track.isPlaying) {
        track.play();
      }
    });

    setTimeout(() => {
      isPlayingAll = tracks.some((track) => track.isPlaying);
    }, 10);
  }

  function pauseAll() {
    tracks.forEach((track) => {
      if (track.isPlaying) {
        track.pause();
      }
    });
    isPlayingAll = false;
  }

  function stopAll() {
    tracks.forEach((track) => {
      if (track.audioBuffer) {
        track.stop();
      }
    });
    isPlayingAll = false;
    // Force timeline update to show position 0
    if (timelineComponent) {
      setTimeout(() => {
        timelineComponent.forceUpdate();
      }, 10);
    }
  }

  function fastForwardAll(seconds = 5) {
    tracks.forEach((track) => {
      if (track.audioBuffer) {
        track.fastForward(seconds);
      }
    });
    // Force timeline update to show new position
    if (timelineComponent) {
      setTimeout(() => {
        timelineComponent.forceUpdate();
      }, 10);
    }
  }

  function rewindAll(seconds = 5) {
    tracks.forEach((track) => {
      if (track.audioBuffer) {
        track.rewind(seconds);
      }
    });
    // Force timeline update to show new position
    if (timelineComponent) {
      setTimeout(() => {
        timelineComponent.forceUpdate();
      }, 10);
    }
  }
</script>

<div class="daw-container">
  <header class="daw-header">
    <h1>Web DAW</h1>
    <div class="master-controls">
      <div class="transport-controls">
        <button
          class="transport-button play-button"
          on:click={playAll}
          disabled={!hasAnyAudioLoaded}
          aria-label="Play"
        >
          ▶
        </button>
        <button
          class="transport-button pause-button"
          on:click={pauseAll}
          disabled={!hasAnyAudioLoaded || !isPlayingAll}
          aria-label="Pause"
        >
          ⏸
        </button>
        <button
          class="transport-button stop-button"
          on:click={stopAll}
          disabled={!hasAnyAudioLoaded}
          aria-label="Stop"
        >
          ⏹
        </button>
        <button
          class="transport-button rewind-button"
          on:click={() => rewindAll(5)}
          disabled={!hasAnyAudioLoaded}
          aria-label="Rewind 5 seconds"
        >
          ⏪
        </button>
        <button
          class="transport-button forward-button"
          on:click={() => fastForwardAll(5)}
          disabled={!hasAnyAudioLoaded}
          aria-label="Fast forward 5 seconds"
        >
          ⏩
        </button>
      </div>
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
          <Timeline {tracks} key={timelineKey} bind:this={timelineComponent} />
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
    gap: 30px;
  }

  .transport-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #1a1a1a;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid #333;
  }

  .transport-button {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    color: white;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    font-size: 18px;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .transport-button:hover:not(:disabled) {
    background: #3a3a3a;
    border-color: #4a4a4a;
    transform: scale(1.05);
  }

  .transport-button:active:not(:disabled) {
    transform: scale(0.95);
  }

  .transport-button:disabled {
    background: #1a1a1a;
    border-color: #2a2a2a;
    cursor: not-allowed;
    opacity: 0.4;
  }

  .play-button {
    background: #4a9eff;
    border-color: #4a9eff;
  }

  .play-button:hover:not(:disabled) {
    background: #5aaeff;
    border-color: #5aaeff;
  }

  .pause-button {
    background: #f39c12;
    border-color: #f39c12;
  }

  .pause-button:hover:not(:disabled) {
    background: #e67e22;
    border-color: #e67e22;
  }

  .stop-button {
    background: #e74c3c;
    border-color: #e74c3c;
  }

  .stop-button:hover:not(:disabled) {
    background: #c0392b;
    border-color: #c0392b;
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
    display: flex;
    flex-direction: row;
    gap: 8px;
    padding: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    align-items: stretch;
  }
</style>
