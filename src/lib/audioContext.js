/**
 * Web Audio API Context Manager
 * Handles the creation and management of the AudioContext
 */
class AudioContextManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.destination = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return this.context;

    try {
      // Create AudioContext with proper error handling
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create master gain node for overall volume control
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 1.0;
      this.masterGain.connect(this.context.destination);
      
      this.destination = this.masterGain;
      this.initialized = true;
      
      return this.context;
    } catch (error) {
      console.error('Failed to initialize AudioContext:', error);
      throw error;
    }
  }

  resume() {
    if (this.context && this.context.state === 'suspended') {
      return this.context.resume();
    }
    return Promise.resolve();
  }

  getContext() {
    return this.context;
  }

  getDestination() {
    return this.destination;
  }

  setMasterVolume(value) {
    if (this.masterGain) {
      this.masterGain.gain.value = value;
    }
  }

  getMasterVolume() {
    return this.masterGain ? this.masterGain.gain.value : 1.0;
  }
}

export const audioContextManager = new AudioContextManager();

