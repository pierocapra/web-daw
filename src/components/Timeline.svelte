<script>
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import { audioContextManager } from '../lib/audioContext.js';

  export let tracks = [];

  let lastTracksSignature = '';

  let timelineCanvas;
  let waveformData = [];
  let currentTime = 0;
  let maxDuration = 0;
  let animationFrameId = null;
  let isPlaying = false;

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

    const containerWidth = Math.max(rect.width - 40, 400);
    const containerHeight = Math.max(tracks.length * 60, 200);

    // Set canvas pixel dimensions (this also clears the canvas)
    canvas.width = containerWidth;
    canvas.height = containerHeight;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const trackHeight = height / tracks.length;

    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, width, height);

    // Debug: Draw a test rectangle to verify canvas is working
    ctx.fillStyle = '#333';
    ctx.fillRect(10, 10, 50, 20);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText(`W:${width} H:${height}`, 15, 25);

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
    if (maxDuration > 0) {
      const playheadX = (currentTime / maxDuration) * width;

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
    if (maxDuration > 0) {
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const markerInterval = maxDuration / 10;
      for (let i = 0; i <= 10; i++) {
        const time = i * markerInterval;
        const x = (time / maxDuration) * width;
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

  function updateTimeline() {
    if (tracks.length === 0) {
      animationFrameId = null;
      return;
    }

    // Get current time from first playing track
    let playingTrack = tracks.find((track) => track && track.isPlaying);

    if (playingTrack) {
      currentTime = playingTrack.getCurrentTime();
      isPlaying = true;
      drawTimeline();

      // Continue animation loop
      animationFrameId = requestAnimationFrame(updateTimeline);
    } else {
      // No track is playing, stop animation
      isPlaying = false;
      animationFrameId = null;

      // Update to show current paused position
      const trackWithAudio = tracks.find((track) => track && track.audioBuffer);
      if (trackWithAudio) {
        currentTime = trackWithAudio.getCurrentTime();
      }
      drawTimeline();
    }
  }

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
    const anyPlaying = tracks.some((track) => track && track.isPlaying);
    console.log('Playback state changed:', {
      anyPlaying,
      animationFrameId,
      signature: playingTracksSignature,
    });

    if (anyPlaying && !animationFrameId) {
      console.log('Starting timeline animation');
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
      const anyPlaying = tracks.some((track) => track && track.isPlaying);
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
    }
  });

  onDestroy(() => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
  });
</script>

<div class="timeline-container">
  {#if tracks.length > 0}
    <canvas bind:this={timelineCanvas} class="timeline-canvas"></canvas>
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
    padding: 20px;
    min-height: 200px;
    overflow-x: auto;
    position: relative;
  }

  .timeline-canvas {
    width: 100%;
    min-height: 200px;
    display: block;
    background: #0f0f0f;
  }

  .timeline-placeholder {
    text-align: center;
    color: #555;
    padding: 60px 20px;
  }

  .timeline-placeholder p {
    font-size: 14px;
  }
</style>
