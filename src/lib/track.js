/**
 * Track class - manages audio playback, EQ, gain, and volume for a single track
 */
export class Track {
  constructor(audioContext, destination, id) {
    this.id = id;
    this.audioContext = audioContext;
    this.destination = destination;
    this.audioBuffer = null;
    this.source = null;
    this.isPlaying = false;
    this.startTime = 0;
    this.pauseTime = 0;
    this.offset = 0;
    this.fileName = null;
    this.isMuted = false;
    this.isSoloed = false;
    this.userVolume = 1.0; // User-set volume (0.0 to 1.0) - always preserved
    this.preMuteVolume = 1.0; // Store volume before mute (for solo/mute functionality)

    // Create audio nodes
    this.gainNode = audioContext.createGain();
    this.volumeNode = audioContext.createGain();

    // 3-band EQ nodes
    this.lowFilter = audioContext.createBiquadFilter();
    this.midFilter = audioContext.createBiquadFilter();
    this.highFilter = audioContext.createBiquadFilter();

    // Configure EQ filters
    this.lowFilter.type = 'lowshelf';
    this.lowFilter.frequency.value = 250;
    this.lowFilter.gain.value = 0;

    this.midFilter.type = 'peaking';
    this.midFilter.frequency.value = 1000;
    this.midFilter.Q.value = 1;
    this.midFilter.gain.value = 0;

    this.highFilter.type = 'highshelf';
    this.highFilter.frequency.value = 4000;
    this.highFilter.gain.value = 0;

    // Connect nodes: source -> gain -> low -> mid -> high -> volume -> destination
    this.gainNode.connect(this.lowFilter);
    this.lowFilter.connect(this.midFilter);
    this.midFilter.connect(this.highFilter);
    this.highFilter.connect(this.volumeNode);
    this.volumeNode.connect(destination);

    // Initialize values
    this.setGain(1.0);
    this.setVolume(1.0); // This will also set userVolume
  }

  async loadAudioFile(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return true;
    } catch (error) {
      console.error('Error loading audio file:', error);
      return false;
    }
  }

  play() {
    if (!this.audioBuffer) return;

    // Resume context if suspended (required for user interaction)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Stop existing source if playing, but preserve offset
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
        // Source may already be stopped
      }
      this.source.disconnect();
      this.source = null;
    }
    this.isPlaying = false;

    // Create new source
    this.source = this.audioContext.createBufferSource();
    this.source.buffer = this.audioBuffer;
    this.source.connect(this.gainNode);

    // Calculate start time based on current offset (preserved from pause)
    const currentTime = this.audioContext.currentTime;
    this.startTime = currentTime - this.offset;
    this.source.start(0, this.offset);

    this.isPlaying = true;
  }

  pause() {
    if (!this.isPlaying || !this.source) return;

    // Save current position before stopping
    this.offset = this.audioContext.currentTime - this.startTime;

    // Stop the source but keep the offset
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
        // Source may already be stopped
      }
      this.source.disconnect();
      this.source = null;
    }
    this.isPlaying = false;
    // Don't reset offset or startTime - keep them for resume
  }

  stop() {
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
        // Source may already be stopped
      }
      this.source.disconnect();
      this.source = null;
    }
    this.isPlaying = false;
    this.offset = 0;
    this.startTime = 0;
  }

  setGain(value) {
    // Gain: 0.0 to 2.0 (0dB to +6dB)
    this.gainNode.gain.value = value;
  }

  getGain() {
    return this.gainNode.gain.value;
  }

  setVolume(value) {
    // Volume: 0.0 to 1.0
    // Store the user's intended volume
    this.userVolume = Math.max(0, Math.min(1, value));
    // Apply the volume, respecting mute/solo state
    this._applyEffectiveVolume();
  }

  getVolume() {
    // Return the user-set volume, not the effective volume
    return this.userVolume;
  }

  getEffectiveVolume() {
    // Return the actual volume being applied (after mute/solo)
    return this.volumeNode.gain.value;
  }

  _applyEffectiveVolume() {
    // Apply the effective volume based on mute/solo state and user volume
    if (this.isMuted) {
      // Track is manually muted
      this.volumeNode.gain.value = 0;
    } else {
      // Use the user's volume setting
      this.volumeNode.gain.value = this.userVolume;
    }
  }

  setMute(muted) {
    this.isMuted = muted;
    // Apply effective volume (will respect mute state and user volume)
    this._applyEffectiveVolume();
  }

  setSolo(soloed) {
    this.isSoloed = soloed;
  }

  getMute() {
    return this.isMuted;
  }

  getSolo() {
    return this.isSoloed;
  }

  setLowEQ(value) {
    // EQ gain: -12dB to +12dB
    this.lowFilter.gain.value = value;
  }

  getLowEQ() {
    return this.lowFilter.gain.value;
  }

  setLowFrequency(value) {
    // Frequency: 20Hz to 500Hz for low shelf
    this.lowFilter.frequency.value = Math.max(20, Math.min(500, value));
  }

  getLowFrequency() {
    return this.lowFilter.frequency.value;
  }

  setMidEQ(value) {
    this.midFilter.gain.value = value;
  }

  getMidEQ() {
    return this.midFilter.gain.value;
  }

  setMidFrequency(value) {
    // Frequency: 200Hz to 5000Hz for mid peaking
    this.midFilter.frequency.value = Math.max(200, Math.min(5000, value));
  }

  getMidFrequency() {
    return this.midFilter.frequency.value;
  }

  setHighEQ(value) {
    this.highFilter.gain.value = value;
  }

  getHighEQ() {
    return this.highFilter.gain.value;
  }

  setHighFrequency(value) {
    // Frequency: 1000Hz to 20000Hz for high shelf
    this.highFilter.frequency.value = Math.max(1000, Math.min(20000, value));
  }

  getHighFrequency() {
    return this.highFilter.frequency.value;
  }

  getDuration() {
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }

  getCurrentTime() {
    if (!this.isPlaying) return this.offset;
    return this.audioContext.currentTime - this.startTime;
  }

  seek(time) {
    // Seek to a specific time position
    const wasPlaying = this.isPlaying;
    const duration = this.getDuration();

    // Clamp time to valid range
    const clampedTime = Math.max(0, Math.min(time, duration));

    // Stop current source if playing
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
        // Source may already be stopped
      }
      this.source.disconnect();
      this.source = null;
    }

    // Update offset to the new position
    this.offset = clampedTime;
    this.isPlaying = false;

    // If it was playing, resume from new position
    if (wasPlaying && this.audioBuffer) {
      this.play();
    }
  }

  fastForward(seconds = 5) {
    if (!this.audioBuffer) return;

    const currentTime = this.getCurrentTime();
    const duration = this.getDuration();
    const newTime = Math.min(currentTime + seconds, duration);
    this.seek(newTime);
  }

  rewind(seconds = 5) {
    if (!this.audioBuffer) return;

    const currentTime = this.getCurrentTime();
    const newTime = Math.max(currentTime - seconds, 0);
    this.seek(newTime);
  }

  cleanup() {
    // Stop playback if playing
    if (this.isPlaying) {
      this.stop();
    }

    // Disconnect all audio nodes
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
        // Source may already be stopped
      }
      this.source.disconnect();
      this.source = null;
    }

    // Disconnect gain and volume nodes
    if (this.gainNode) {
      this.gainNode.disconnect();
    }
    if (this.volumeNode) {
      this.volumeNode.disconnect();
    }
    if (this.lowFilter) {
      this.lowFilter.disconnect();
    }
    if (this.midFilter) {
      this.midFilter.disconnect();
    }
    if (this.highFilter) {
      this.highFilter.disconnect();
    }

    // Clear audio buffer reference
    this.audioBuffer = null;
  }
}
