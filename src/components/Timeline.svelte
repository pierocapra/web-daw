<script>
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import { audioContextManager } from '../lib/audioContext.js';
  import { createEventDispatcher } from 'svelte';

  export let tracks = [];

  const dispatch = createEventDispatcher();

  // Force update counter to trigger reactivity
  let updateCounter = 0;

  // Reactive signature for track states (mute/solo/loaded/recording) to force updates
  $: tracksStateSignature =
    tracks
      .map((track, i) => {
        if (!track) return `${i}-null`;
        const level = track.getAudioLevel ? track.getAudioLevel() : 0;
        return `${i}-mute:${track.isMuted}-solo:${track.isSoloed}-loaded:${!!track.audioBuffer}-recording:${track.isRecording}-level:${Math.floor(level * 10)}`;
      })
      .join('|') +
    '-' +
    updateCounter;

  function handleMuteClick(track, index) {
    if (!track) return;
    const newMuteState = !track.isMuted;
    track.setMute(newMuteState);
    // Update solo states if needed
    updateSoloStates();
    // Force reactivity update
    updateCounter++;
    dispatch('trackUpdated', { trackIndex: index });
  }

  function handleSoloClick(track, index) {
    if (!track) return;
    const newSoloState = !track.isSoloed;
    track.setSolo(newSoloState);
    // Update solo states for all tracks
    updateSoloStates();
    // Force reactivity update
    updateCounter++;
    dispatch('trackUpdated', { trackIndex: index });
  }

  async function enumerateInputDevices() {
    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const devices = await navigator.mediaDevices.enumerateDevices();
      inputDevices = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device) => ({
          deviceId: device.deviceId,
          label:
            device.label || `Microphone ${device.deviceId.substring(0, 8)}`,
        }));
    } catch (error) {
      console.error('Error enumerating input devices:', error);
      inputDevices = [];
    }
  }

  async function startRecording(track, index) {
    if (!track) return;

    const deviceId =
      !selectedInputDevices[index] || selectedInputDevices[index] === 'default'
        ? null
        : selectedInputDevices[index];

    const success = await track.startRecording(deviceId);

    if (success) {
      // Force update the reactive signature to trigger animation
      updateCounter++;
      // Start timeline animation if not already running
      // Use setTimeout to ensure the reactive statement has processed
      setTimeout(() => {
        if (!animationFrameId) {
          console.log('Starting timeline animation for recording');
          updateTimeline();
        }
      }, 50);
      dispatch('trackUpdated', { trackIndex: index });
    } else {
      alert('Failed to start recording. Please check microphone permissions.');
    }
  }

  function stopRecording(track, index) {
    if (!track) return;

    track.stopRecording();
    updateCounter++;

    // Dispatch event after a delay to allow audio buffer to load
    setTimeout(() => {
      if (track && track.audioBuffer) {
        dispatch('fileLoaded', { trackId: track.id, fileName: track.fileName });
      }
      updateCounter++;
    }, 1000);
  }

  function toggleInputSelector(index) {
    showInputSelectors[index] = !showInputSelectors[index];
    if (showInputSelectors[index] && inputDevices.length === 0) {
      enumerateInputDevices();
    }
    updateCounter++;
  }

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Update audio levels for all tracks
  function updateAudioLevels() {
    let hasUpdate = false;
    tracks.forEach((track, index) => {
      if (track) {
        const level = track.getAudioLevel ? track.getAudioLevel() : 0;
        const currentLevel = audioLevels[index] || 0;
        // Update if level changed significantly (more than 0.5%)
        if (Math.abs(currentLevel - level) > 0.005) {
          audioLevels[index] = level;
          hasUpdate = true;
        }

        // Start level monitoring if track is playing or recording
        if (
          (track.isPlaying || track.isRecording || track.mediaStream) &&
          !track.isMonitoringLevels
        ) {
          track.startLevelMonitoring();
        }
      } else {
        if (audioLevels[index] !== undefined && audioLevels[index] !== 0) {
          audioLevels[index] = 0;
          hasUpdate = true;
        }
      }
    });
    if (hasUpdate) {
      updateCounter++;
      // Force reactivity
      audioLevels = { ...audioLevels };
    }
  }

  // Update recording timers for all tracks
  function updateRecordingTimers() {
    let hasUpdate = false;
    tracks.forEach((track, index) => {
      if (
        track &&
        track.isRecording &&
        track.recordingStartTime !== undefined
      ) {
        const elapsed =
          track.audioContext.currentTime - track.recordingStartTime;
        if (recordingTimers[index] !== elapsed) {
          recordingTimers[index] = elapsed;
          hasUpdate = true;
        }
      } else {
        if (recordingTimers[index] !== undefined) {
          recordingTimers[index] = undefined;
          hasUpdate = true;
        }
      }
    });
    if (hasUpdate) {
      // Force reactivity
      recordingTimers = { ...recordingTimers };
      updateCounter++;
    }
  }

  function updateSoloStates() {
    const anySoloed = tracks.some((t) => t && t.isSoloed);

    tracks.forEach((track) => {
      if (!track) return;

      if (anySoloed) {
        // If any track is soloed
        if (track.isSoloed) {
          // Soloed tracks: apply user volume if not manually muted
          if (!track.isMuted) {
            track.volumeNode.gain.value = track.userVolume;
          } else {
            // Manually muted tracks stay muted
            track.volumeNode.gain.value = 0;
          }
        } else {
          // Non-soloed tracks: mute them (unless they were manually muted, then keep them muted)
          if (!track.isMuted) {
            // Store user volume before muting due to solo (if not already stored)
            if (track.volumeNode.gain.value > 0) {
              track.preMuteVolume = track.userVolume;
            }
            track.volumeNode.gain.value = 0;
          } else {
            // Manually muted tracks stay muted
            track.volumeNode.gain.value = 0;
          }
        }
      } else {
        // No solo active: restore user volumes for tracks that were muted by solo only
        if (!track.isMuted) {
          // Restore user volume if it was muted by solo
          track.volumeNode.gain.value = track.userVolume;
        } else {
          // Manually muted tracks stay muted
          track.volumeNode.gain.value = 0;
        }
      }
    });
  }

  let lastTracksSignature = '';

  let timelineCanvas;
  let waveformData = [];
  let currentTime = 0;
  let maxDuration = 0;
  let animationFrameId = null;
  let isPlaying = false;
  let trackHeight = 80; // Height of each track row

  // Recording state
  let inputDevices = [];
  let selectedInputDevices = {}; // Track index -> device ID
  let showInputSelectors = {}; // Track index -> boolean
  let levelUpdateInterval = null;
  let audioLevels = {}; // Track index -> audio level (0-1)

  // Create a reactive signature of playing tracks to detect changes
  $: playingTracksSignature = tracks
    .map((track, i) =>
      track && track.isPlaying ? `${i}-playing` : `${i}-stopped`
    )
    .join('|');

  // Generate waveform data for all tracks
  function generateWaveforms() {
    waveformData = [];
    maxDuration = 0;

    tracks.forEach((track, index) => {
      if (track && track.audioBuffer) {
        try {
          const duration = track.getDuration();
          if (duration > maxDuration) {
            maxDuration = duration;
          }

          const channelData = track.audioBuffer.getChannelData(0);
          const samples = 2000;
          const blockSize = Math.floor(channelData.length / samples);
          const waveform = [];
          let maxSample = 0;

          for (let i = 0; i < samples; i++) {
            let sum = 0;
            const startIdx = i * blockSize;
            for (
              let j = 0;
              j < blockSize && startIdx + j < channelData.length;
              j++
            ) {
              sum += Math.abs(channelData[startIdx + j] || 0);
            }
            const avg = sum / blockSize;
            waveform.push(avg);
            if (avg > maxSample) maxSample = avg;
          }

          // Normalize waveform data to 0-1 range
          if (maxSample > 0) {
            for (let i = 0; i < waveform.length; i++) {
              waveform[i] = waveform[i] / maxSample;
            }
          }

          console.log(`Generated waveform for track ${index}:`, {
            samples: waveform.length,
            maxValue: maxSample,
            duration: duration,
            hasData: waveform.some((v) => v > 0),
          });

          waveformData.push({
            trackIndex: index,
            data: waveform,
            duration: duration,
            color: getTrackColor(index),
          });
        } catch (error) {
          console.error('Error generating waveform for track', index, error);
          waveformData.push({
            trackIndex: index,
            data: null,
            duration: 0,
            color: getTrackColor(index),
          });
        }
      } else {
        waveformData.push({
          trackIndex: index,
          data: null,
          duration: 0,
          color: getTrackColor(index),
        });
      }
    });

    console.log(
      'Waveform data generated:',
      waveformData.map((w) => ({
        hasData: w.data !== null,
        dataLength: w.data?.length || 0,
        maxValue: w.data ? Math.max(...w.data) : 0,
      }))
    );
  }

  function getTrackColor(index) {
    const colors = [
      '#4a9eff',
      '#9b59b6',
      '#e74c3c',
      '#f39c12',
      '#2ecc71',
      '#1abc9c',
    ];
    return colors[index % colors.length];
  }

  function drawTimeline() {
    if (!timelineCanvas) return;

    const canvas = timelineCanvas;
    const container = canvas.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();

    // Ensure container has dimensions
    if (rect.width === 0 || rect.height === 0) {
      // Retry after a short delay if container isn't ready
      setTimeout(() => drawTimeline(), 100);
      return;
    }

    // Container is already the canvas wrapper, so use its full width
    const containerWidth = Math.max(rect.width, 400);
    // Calculate height based on number of tracks, ensuring it matches the sidebar height exactly
    const containerHeight = tracks.length > 0 ? tracks.length * 80 : 80;

    // Set canvas pixel dimensions (this also clears the canvas)
    canvas.width = containerWidth;
    canvas.height = containerHeight;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    trackHeight = height / tracks.length;

    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let i = 0; i < tracks.length; i++) {
      const y = i * trackHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw waveforms for each track
    let waveformsDrawn = 0;
    waveformData.forEach((waveform, index) => {
      if (!waveform || !waveform.data || waveform.data.length === 0) return;

      const y = index * trackHeight;
      const trackY = y + trackHeight / 2;
      const waveformHeight = trackHeight * 0.8; // Use more of the track height

      ctx.fillStyle = waveform.color;

      // Scale waveform width based on its duration relative to maxDuration
      const durationRatio =
        maxDuration > 0 ? waveform.duration / maxDuration : 1;
      const waveformWidth = width * durationRatio;
      const barWidth = waveformWidth / waveform.data.length;

      waveform.data.forEach((sample, i) => {
        // Sample is already normalized 0-1, use it directly
        const normalizedSample = Math.max(0, Math.min(1, sample || 0));
        const barHeight = normalizedSample * waveformHeight;
        const x = i * barWidth;

        // Draw even small bars - they're normalized so should be visible
        if (barHeight > 0 && x < width) {
          // Only draw if within canvas bounds
          ctx.fillRect(
            x,
            trackY - barHeight / 2,
            Math.max(barWidth - 0.5, 0.5),
            Math.max(barHeight, 1) // Ensure at least 1px height
          );
          waveformsDrawn++;
        }
      });
    });

    // Debug: log drawing info
    console.log('Drew timeline:', {
      waveformsDrawn,
      canvasWidth: width,
      canvasHeight: height,
      trackHeight,
      waveformDataCount: waveformData.filter((w) => w && w.data).length,
    });

    // Draw playhead
    // Use a minimum duration if recording and maxDuration is 0
    const effectiveMaxDuration =
      maxDuration > 0
        ? maxDuration
        : currentTime > 0
          ? Math.max(currentTime, 10)
          : 10;
    if (effectiveMaxDuration > 0 && currentTime >= 0) {
      const playheadX = (currentTime / effectiveMaxDuration) * width;

      // Draw playhead line across all tracks
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Draw playhead handle at top
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(playheadX, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw time markers
    if (effectiveMaxDuration > 0) {
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const markerInterval = effectiveMaxDuration / 10;
      for (let i = 0; i <= 10; i++) {
        const time = i * markerInterval;
        const x = (time / effectiveMaxDuration) * width;
        const timeStr = formatTime(time);
        ctx.fillText(timeStr, x + 2, 2);
      }
    }
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function handleFileSelect(event, track, trackIndex) {
    const file = event.target.files[0];
    if (file && track) {
      dispatch('fileLoaded', { track, trackIndex, fileName: file.name, file });
      // Reset input so same file can be selected again
      event.target.value = '';
    }
  }

  function updateTimeline() {
    if (tracks.length === 0) {
      animationFrameId = null;
      return;
    }

    // Get current time from first playing track, or first track with audio
    let playingTrack = tracks.find((track) => track && track.isPlaying);
    let recordingTrack = tracks.find((track) => track && track.isRecording);
    let trackWithAudio = tracks.find((track) => track && track.audioBuffer);

    // Debug logging
    if (recordingTrack) {
      console.log('Recording track found in updateTimeline:', {
        isRecording: recordingTrack.isRecording,
        recordingStartTime: recordingTrack.recordingStartTime,
        currentTime: recordingTrack.audioContext.currentTime,
      });
    }

    if (playingTrack) {
      currentTime = playingTrack.getCurrentTime();
      isPlaying = true;
      drawTimeline();

      // Continue animation loop
      animationFrameId = requestAnimationFrame(updateTimeline);
    } else if (recordingTrack) {
      // Advance timeline during recording
      // Ensure recordingStartTime is set (should be set in startRecording)
      if (
        !recordingTrack.recordingStartTime ||
        recordingTrack.recordingStartTime === 0
      ) {
        // Fallback: initialize if not set yet (shouldn't happen, but handle edge case)
        recordingTrack.recordingStartTime =
          recordingTrack.audioContext.currentTime;
      }

      const recordingDuration = Math.max(
        0,
        recordingTrack.audioContext.currentTime -
          recordingTrack.recordingStartTime
      );
      currentTime = recordingDuration;

      // Update maxDuration to accommodate recording if needed
      // Add some padding (20%) to show future recording space
      const requiredDuration = recordingDuration * 1.2;
      if (requiredDuration > maxDuration) {
        maxDuration = requiredDuration;
      }

      isPlaying = true; // Keep timeline moving
      drawTimeline();

      // Continue animation loop
      animationFrameId = requestAnimationFrame(updateTimeline);
    } else {
      // No track is playing or recording, stop animation
      isPlaying = false;
      animationFrameId = null;

      // Update to show current paused position
      if (trackWithAudio) {
        currentTime = trackWithAudio.getCurrentTime();
      }
      drawTimeline();
    }
  }

  // Force update timeline (useful for seeking when paused)
  function forceUpdate() {
    const trackWithAudio = tracks.find((track) => track && track.audioBuffer);
    if (trackWithAudio) {
      currentTime = trackWithAudio.getCurrentTime();
      drawTimeline();
    }
  }

  // Expose forceUpdate function
  export { forceUpdate };

  // Create a string representation of tracks with audio to detect changes
  $: tracksAudioSignature = tracks
    .map((track, i) =>
      track && track.audioBuffer
        ? `${i}-${track.audioBuffer.length}-${track.audioBuffer.duration}`
        : `${i}-null`
    )
    .join('|');

  // Force update when signature changes
  $: if (tracksAudioSignature && tracks.length > 0) {
    console.log('Tracks audio signature changed:', tracksAudioSignature);
    updateWaveformsAndDraw();
  }

  // Watch for canvas element and draw when ready
  $: if (timelineCanvas && tracks.length > 0) {
    console.log('Canvas ready, updating waveforms');
    updateWaveformsAndDraw();
  }

  function updateWaveformsAndDraw() {
    if (tracks.length === 0) {
      console.log('No tracks, skipping update');
      return;
    }

    const tracksWithAudio = tracks.filter((t) => t && t.audioBuffer);
    console.log(
      `Updating waveforms: ${tracksWithAudio.length} tracks with audio out of ${tracks.length} total`
    );

    generateWaveforms();

    if (timelineCanvas) {
      // Use multiple strategies to ensure drawing happens
      requestAnimationFrame(() => {
        setTimeout(() => {
          console.log(
            'Drawing timeline, waveformData length:',
            waveformData.length
          );
          drawTimeline();
        }, 100);
      });
    } else {
      console.log('Canvas not ready yet');
    }
  }

  // Watch for playback state changes using the signature
  $: if (playingTracksSignature) {
    const anyPlaying = tracks.some(
      (track) => track && (track.isPlaying || track.isRecording)
    );
    const anyRecording = tracks.some((track) => track && track.isRecording);
    console.log('Playback state changed:', {
      anyPlaying,
      anyRecording,
      animationFrameId,
      signature: playingTracksSignature,
    });

    if (anyPlaying && !animationFrameId) {
      console.log('Starting timeline animation (playing or recording)');
      updateTimeline();
    } else if (!anyPlaying && animationFrameId) {
      console.log('Stopping timeline animation');
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
      // Update one final time to show paused position
      if (tracks.length > 0) {
        const trackWithAudio = tracks.find(
          (track) => track && track.audioBuffer
        );
        if (trackWithAudio) {
          currentTime = trackWithAudio.getCurrentTime();
        }
      }
      drawTimeline();
    }
  }

  onMount(() => {
    console.log('Timeline mounted with tracks:', tracks.length);

    // Generate and draw waveforms on mount
    const initTimeline = () => {
      console.log('Initializing timeline, checking for audio buffers...');
      const tracksWithAudio = tracks.filter((t) => t && t.audioBuffer);
      console.log(`Found ${tracksWithAudio.length} tracks with audio`);
      updateWaveformsAndDraw();
    };

    // Try multiple times to ensure it works (file loading is async)
    initTimeline();
    setTimeout(initTimeline, 50);
    setTimeout(initTimeline, 100);
    setTimeout(initTimeline, 200);
    setTimeout(initTimeline, 500);
    setTimeout(initTimeline, 1000); // Extra delay for slow file loads

    // Also set up an interval to check periodically (will be cleaned up)
    const checkInterval = setInterval(() => {
      // Check for new audio buffers
      const hasNewAudio = tracks.some((track, i) => {
        const hadAudio = waveformData[i] && waveformData[i].data !== null;
        const hasAudio = track && track.audioBuffer;
        return hasAudio && !hadAudio;
      });

      if (hasNewAudio) {
        console.log('Detected new audio buffer, updating...');
        updateWaveformsAndDraw();
      }

      // Check if playback started but animation didn't
      const anyPlaying = tracks.some(
        (track) => track && (track.isPlaying || track.isRecording)
      );
      if (anyPlaying && !animationFrameId) {
        console.log('Detected playback but no animation, starting...');
        updateTimeline();
      } else if (!anyPlaying && animationFrameId) {
        console.log('Detected stop but animation still running, stopping...');
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    }, 100); // Check more frequently for playback state

    const handleResize = () => {
      if (timelineCanvas) {
        updateWaveformsAndDraw();
      }
    };

    window.addEventListener('resize', handleResize);

    // Enumerate input devices
    enumerateInputDevices();

    // Listen for device changes
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener(
        'devicechange',
        enumerateInputDevices
      );
    }

    // Start audio level monitoring (update more frequently for smoother visualization)
    levelUpdateInterval = setInterval(updateAudioLevels, 30);

    return () => {
      clearInterval(checkInterval);
      window.removeEventListener('resize', handleResize);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  });

  afterUpdate(() => {
    // Check if tracks have changed after each update
    const currentSignature = tracks
      .map((track, i) =>
        track && track.audioBuffer
          ? `${i}-hasAudio-${track.audioBuffer.length}`
          : `${i}-noAudio`
      )
      .join('|');

    if (currentSignature !== lastTracksSignature) {
      console.log('afterUpdate: tracks changed', {
        old: lastTracksSignature,
        new: currentSignature,
      });
      lastTracksSignature = currentSignature;
      updateWaveformsAndDraw();
      // Force UI update when audio buffers change
      updateCounter++;
    }
  });

  onDestroy(() => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    if (levelUpdateInterval) {
      clearInterval(levelUpdateInterval);
    }
    if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
      navigator.mediaDevices.removeEventListener(
        'devicechange',
        enumerateInputDevices
      );
    }
  });
</script>

<div class="timeline-container">
  {#if tracks.length > 0}
    <div class="timeline-wrapper">
      <div class="track-info-sidebar">
        {#each tracks as track, index (tracksStateSignature + '-' + index)}
          <div
            class="track-info-panel"
            class:last-track={index === tracks.length - 1}
            style="min-height: {Math.max(trackHeight, 80)}px;"
          >
            <div class="track-info-content">
              <div class="track-info-main">
                <div class="track-header-row">
                  {#if track && track.audioBuffer}
                    <div class="track-status-indicator loaded"></div>
                  {:else}
                    <div class="track-status-indicator empty"></div>
                  {/if}
                  <div class="track-number">T{index + 1}</div>
                </div>
                {#if track && track.audioBuffer}
                  <div class="track-filename" title={track.fileName || ''}>
                    {track.fileName || 'Loaded'}
                  </div>
                {:else}
                  <label
                    for="timeline-file-input-{index}"
                    class="load-button-small"
                  >
                    Load
                  </label>
                  <input
                    id="timeline-file-input-{index}"
                    type="file"
                    accept="audio/*"
                    on:change={(e) => handleFileSelect(e, track, index)}
                    class="file-input"
                  />
                {/if}
                <div class="track-controls-row">
                  <button
                    class="control-button mute-button"
                    class:muted={track && track.isMuted === true}
                    on:click={() => handleMuteClick(track, index)}
                    title="Mute"
                  >
                    M
                  </button>
                  <button
                    class="control-button solo-button"
                    class:soloed={track && track.isSoloed === true}
                    on:click={() => handleSoloClick(track, index)}
                    title="Solo"
                  >
                    S
                  </button>
                  {#if !track || !track.isRecording}
                    <button
                      class="control-button record-button"
                      on:click={() => startRecording(track, index)}
                      title="Start Recording"
                    >
                      ●
                    </button>
                  {:else}
                    <button
                      class="control-button stop-recording-button"
                      on:click={() => stopRecording(track, index)}
                      title="Stop Recording"
                    >
                      ■
                    </button>
                  {/if}
                  <button
                    class="control-button input-selector-button"
                    on:click={() => toggleInputSelector(index)}
                    title="Select Input Device"
                  >
                    i
                  </button>
                </div>
              </div>
              <!-- Audio Level Meter -->
              <div class="audio-level-meter">
                <div
                  class="audio-level-bar"
                  style="height: {(audioLevels[index] !== undefined
                    ? audioLevels[index]
                    : 0) * 100}%"
                  class:recording={track && track.isRecording}
                ></div>
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Input Selector Popup -->
      {#each tracks as track, index}
        {#if showInputSelectors[index]}
          <div
            class="popup-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="popup-title-{index}"
          >
            <button
              class="popup-backdrop"
              on:click={() => toggleInputSelector(index)}
              aria-label="Close dialog"
            ></button>
            <div class="popup-content">
              <div class="popup-header">
                <h3 id="popup-title-{index}">Select Input Device</h3>
                <button
                  class="popup-close"
                  on:click={() => toggleInputSelector(index)}
                  title="Close"
                  aria-label="Close dialog"
                >
                  ×
                </button>
              </div>
              <div class="popup-body">
                <select
                  bind:value={selectedInputDevices[index]}
                  on:change={() => {
                    toggleInputSelector(index);
                  }}
                  class="popup-select"
                >
                  <option value="default">Default Microphone</option>
                  {#each inputDevices as device}
                    <option value={device.deviceId}>{device.label}</option>
                  {/each}
                </select>
              </div>
            </div>
          </div>
        {/if}
      {/each}
      <div class="timeline-canvas-wrapper">
        <canvas bind:this={timelineCanvas} class="timeline-canvas"></canvas>
      </div>
    </div>
  {:else}
    <div class="timeline-placeholder">
      <p>Load audio files to see the timeline</p>
    </div>
  {/if}
</div>

<style>
  .timeline-container {
    width: 100%;
    background: #1a1a1a;
    border-bottom: 2px solid #2d2d2d;
    min-height: 80px;
    overflow: hidden;
  }

  .timeline-wrapper {
    display: flex;
    flex-direction: row;
    position: relative;
  }

  .track-info-sidebar {
    width: 120px;
    min-width: 120px;
    background: #1f1f1f;
    border-right: 1px solid #2d2d2d;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    align-self: flex-start;
  }

  .track-info-panel {
    border-bottom: 1px solid #2d2d2d;
    display: flex;
    align-items: flex-start;
    /* padding: 6px 8px; */
    background: #1f1f1f;
    transition: background 0.15s;
    min-height: 80px;
    justify-content: center;
    position: relative;
  }

  .track-info-panel.last-track {
    border-bottom: none;
  }

  .track-info-panel:hover {
    background: #252525;
  }

  .track-info-content {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 6px;
    box-sizing: border-box;
    position: relative;
  }

  .track-info-main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    flex: 1;
    min-width: 0;
    position: relative;
  }

  .track-number {
    font-size: 10px;
    font-weight: 700;
    color: #666;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .track-header-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
  }

  .track-status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .track-status-indicator.loaded {
    background: #2ecc71;
    box-shadow: 0 0 4px rgba(46, 204, 113, 0.5);
  }

  .track-status-indicator.empty {
    background: #444;
  }

  .track-filename {
    font-size: 9px;
    color: #aaa;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
    line-height: 1.3;
    min-height: 12px;
  }

  .load-button-small {
    font-size: 8px;
    padding: 3px 6px;
    background: #333;
    color: #999;
    border-radius: 3px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: all 0.15s;
    border: 1px solid #3a3a3a;
    display: inline-block;
  }

  .load-button-small:hover {
    background: #3a3a3a;
    color: #ccc;
    border-color: #4a4a4a;
  }

  .file-input {
    display: none;
  }

  .track-controls-row {
    display: flex;
    gap: 4px;
    margin-top: auto;
    width: 100%;
    padding-top: 4px;
  }

  .control-button {
    flex: 1;
    padding: 2px 4px;
    font-size: 8px;
    font-weight: 600;
    color: #888;
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    border-radius: 2px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: all 0.15s;
    min-width: 0;
  }

  .control-button:hover {
    background: #333;
    color: #aaa;
    border-color: #4a4a4a;
  }

  .control-button.mute-button.muted {
    background: #ff4444 !important;
    color: #fff !important;
    border-color: #ff6666 !important;
  }

  .control-button.mute-button.muted:hover {
    background: #ff5555 !important;
  }

  .control-button.solo-button.soloed {
    background: #ffaa00 !important;
    color: #fff !important;
    border-color: #ffbb33 !important;
  }

  .control-button.solo-button.soloed:hover {
    background: #ffbb11 !important;
  }

  .control-button.record-button {
    color: #e74c3c;
    font-size: 10px;
  }

  .control-button.record-button:hover {
    background: #e74c3c;
    color: #fff;
  }

  .control-button.stop-recording-button {
    background: #e74c3c !important;
    color: #fff !important;
    border-color: #e74c3c !important;
    animation: pulse-recording 1s ease-in-out infinite;
    box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.8);
    font-weight: 700;
  }

  .control-button.stop-recording-button:hover {
    background: #c0392b !important;
  }

  @keyframes pulse-recording {
    0% {
      opacity: 1;
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.8);
    }
    50% {
      opacity: 0.9;
      transform: scale(1.15);
      box-shadow: 0 0 0 10px rgba(231, 76, 60, 0.2);
    }
    100% {
      opacity: 1;
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.8);
    }
  }

  .control-button.input-selector-button {
    font-size: 10px;
    padding: 2px;
    font-weight: 600;
    font-style: italic;
  }

  .popup-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .popup-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .popup-content {
    position: relative;
    z-index: 1001;
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    border-radius: 8px;
    padding: 20px;
    min-width: 300px;
    max-width: 90%;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  .popup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .popup-header h3 {
    margin: 0;
    font-size: 16px;
    color: #fff;
    font-weight: 600;
  }

  .popup-close {
    background: transparent;
    border: none;
    color: #888;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .popup-close:hover {
    background: #3a3a3a;
    color: #fff;
  }

  .popup-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .popup-select {
    width: 100%;
    background: #1a1a1a;
    border: 1px solid #3a3a3a;
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    outline: none;
  }

  .popup-select:hover {
    border-color: #4a4a4a;
  }

  .popup-select:focus {
    border-color: #4a9eff;
  }

  .audio-level-meter {
    width: 4px;
    height: 60px;
    background: #1a1a1a;
    border: 1px solid #2d2d2d;
    border-radius: 2px;
    position: relative;
    overflow: hidden;
    align-self: center;
    flex-shrink: 0;
  }

  .audio-level-bar {
    position: absolute;
    bottom: 0;
    width: 100%;
    background: linear-gradient(to top, #4caf50 0%, #ffd700 70%, #e74c3c 100%);
    transition: height 0.05s linear;
    min-height: 2px;
  }

  .audio-level-bar.recording {
    background: linear-gradient(to top, #4caf50 0%, #ffd700 50%, #e74c3c 80%);
    box-shadow: 0 0 4px rgba(231, 76, 60, 0.5);
  }

  .timeline-canvas-wrapper {
    flex: 1;
    position: relative;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0;
    align-self: flex-start;
  }

  .timeline-canvas {
    width: 100%;
    height: 100%;
    display: block;
    background: #0f0f0f;
  }

  .timeline-placeholder {
    text-align: center;
    color: #555;
    padding: 60px 20px;
    width: 100%;
  }

  .timeline-placeholder p {
    font-size: 14px;
  }
</style>
