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

    // Recording state
    this.isRecording = false;
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.recordedChunks = [];
    this.recordingStartTime = 0;

    // Audio level monitoring
    this.analyserNode = null; // For input monitoring (recording)
    this.playbackAnalyserNode = null; // For playback monitoring
    this.audioLevel = 0; // 0.0 to 1.0
    this.levelUpdateInterval = null;
    this.isMonitoringLevels = false;

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

    // Create analyser node for playback monitoring
    this.playbackAnalyserNode = audioContext.createAnalyser();
    this.playbackAnalyserNode.fftSize = 256;
    this.playbackAnalyserNode.smoothingTimeConstant = 0.8;

    // Connect nodes: source -> gain -> low -> mid -> high -> volume -> analyser -> destination
    this.gainNode.connect(this.lowFilter);
    this.lowFilter.connect(this.midFilter);
    this.midFilter.connect(this.highFilter);
    this.highFilter.connect(this.volumeNode);
    this.volumeNode.connect(this.playbackAnalyserNode);
    this.playbackAnalyserNode.connect(destination);

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

    // Start level monitoring for playback
    this.startLevelMonitoring();
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

  async startRecording(deviceId = null) {
    if (this.isRecording) {
      console.warn('Already recording');
      return false;
    }

    try {
      // Request microphone/input access
      const constraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Create analyser node for audio level monitoring
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;

      // Create MediaStreamAudioSourceNode from the media stream
      const sourceNode = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );
      sourceNode.connect(this.analyserNode);

      // Start monitoring audio levels (will monitor input)
      this.startLevelMonitoring();

      // Create MediaRecorder
      const options = {
        mimeType: 'audio/webm;codecs=opus',
      };

      // Fallback to default if webm not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          delete options.mimeType; // Use browser default
        }
      }

      // Set recording start time BEFORE creating MediaRecorder to ensure it's available immediately
      this.recordingStartTime = this.audioContext.currentTime;

      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        // Convert recorded chunks to AudioBuffer
        const blob = new Blob(this.recordedChunks, {
          type: this.mediaRecorder.mimeType,
        });
        const success = await this.loadRecordedAudio(blob);

        // Stop all tracks in the media stream
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach((track) => track.stop());
          this.mediaStream = null;
        }
        this.stopLevelMonitoring();
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.recordingStartTime = 0;
        this.audioLevel = 0;

        if (!success) {
          console.error('Failed to load recorded audio');
        }
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      return true;
    } catch (error) {
      console.error('Error starting recording:', error);
      this.isRecording = false;
      return false;
    }
  }

  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      return false;
    }

    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    this.isRecording = false;
    return true;
  }

  async loadRecordedAudio(blob) {
    try {
      // Convert blob to array buffer
      const arrayBuffer = await blob.arrayBuffer();

      // Decode audio data
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.fileName = `Recording ${new Date().toLocaleTimeString()}`;
      return true;
    } catch (error) {
      console.error('Error loading recorded audio:', error);
      return false;
    }
  }

  startLevelMonitoring() {
    if (this.isMonitoringLevels) return;
    this.isMonitoringLevels = true;

    const updateLevel = () => {
      let level = 0;
      let hasData = false;

      // Check input level (recording)
      if (this.analyserNode) {
        const inputDataArray = new Uint8Array(
          this.analyserNode.frequencyBinCount
        );
        this.analyserNode.getByteFrequencyData(inputDataArray);
        let sum = 0;
        for (let i = 0; i < inputDataArray.length; i++) {
          sum += inputDataArray[i];
        }
        const inputLevel = sum / inputDataArray.length / 255;
        if (inputLevel > level) {
          level = inputLevel;
          hasData = true;
        }
      }

      // Check playback level
      if (this.playbackAnalyserNode && this.isPlaying) {
        const playbackDataArray = new Uint8Array(
          this.playbackAnalyserNode.frequencyBinCount
        );
        this.playbackAnalyserNode.getByteFrequencyData(playbackDataArray);
        let sum = 0;
        for (let i = 0; i < playbackDataArray.length; i++) {
          sum += playbackDataArray[i];
        }
        const playbackLevel = sum / playbackDataArray.length / 255;
        if (playbackLevel > level) {
          level = playbackLevel;
          hasData = true;
        }
      }

      this.audioLevel = level;

      // Continue monitoring if recording, playing, or has media stream
      if (this.isRecording || this.mediaStream || this.isPlaying) {
        requestAnimationFrame(updateLevel);
      } else {
        this.isMonitoringLevels = false;
        // Gradually fade out the level
        if (this.audioLevel > 0) {
          this.audioLevel = Math.max(0, this.audioLevel - 0.05);
          requestAnimationFrame(updateLevel);
        }
      }
    };

    updateLevel();
  }

  stopLevelMonitoring() {
    this.isMonitoringLevels = false;
    if (this.analyserNode) {
      this.analyserNode = null;
    }
    // Don't disconnect playbackAnalyserNode as it's part of the audio chain
  }

  getAudioLevel() {
    return this.audioLevel;
  }

  getRecordingState() {
    return {
      isRecording: this.isRecording,
      duration: this.isRecording
        ? this.audioContext.currentTime - this.recordingStartTime
        : 0,
    };
  }

  cleanup() {
    // Stop recording if active
    if (this.isRecording) {
      this.stopRecording();
    }

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

    // Stop media stream if active
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.stopLevelMonitoring();

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
