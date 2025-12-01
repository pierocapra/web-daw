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
    this.setVolume(1.0);
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

    // Stop existing source if playing
    this.stop();

    // Create new source
    this.source = this.audioContext.createBufferSource();
    this.source.buffer = this.audioBuffer;
    this.source.connect(this.gainNode);

    // Calculate offset for resume
    const currentTime = this.audioContext.currentTime;
    this.startTime = currentTime - this.offset;
    this.source.start(0, this.offset);

    this.isPlaying = true;
  }

  pause() {
    if (!this.isPlaying || !this.source) return;

    this.offset = this.audioContext.currentTime - this.startTime;
    this.stop();
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
    this.volumeNode.gain.value = value;
  }

  getVolume() {
    return this.volumeNode.gain.value;
  }

  setLowEQ(value) {
    // EQ gain: -12dB to +12dB
    this.lowFilter.gain.value = value;
  }

  getLowEQ() {
    return this.lowFilter.gain.value;
  }

  setMidEQ(value) {
    this.midFilter.gain.value = value;
  }

  getMidEQ() {
    return this.midFilter.gain.value;
  }

  setHighEQ(value) {
    this.highFilter.gain.value = value;
  }

  getHighEQ() {
    return this.highFilter.gain.value;
  }

  getDuration() {
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }

  getCurrentTime() {
    if (!this.isPlaying) return this.offset;
    return this.audioContext.currentTime - this.startTime;
  }
}

