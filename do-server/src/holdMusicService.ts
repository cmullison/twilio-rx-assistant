// Hold music service for Cloudflare Workers using R2 storage

interface HoldMusicState {
  isPlaying: boolean;
  intervalId?: number;
  audioBuffer?: ArrayBuffer;
}

interface HoldMusicConfig {
  defaultAudioFile: string;
  alternatives: Record<string, string>;
}

// Configuration for hold music files in R2
const HOLD_MUSIC_CONFIG: HoldMusicConfig = {
  defaultAudioFile: 'hold-music.raw',
  alternatives: {
    classical: 'classical.raw',
    jazz: 'jazz.raw',
    ambient: 'ambient.raw',
    breakaway: 'breakaway.mp3'
  }
};

export class HoldMusicService {
  private state: HoldMusicState = { isPlaying: false };
  private r2Bucket: any; // R2 bucket binding

  constructor(r2Bucket: any) {
    this.r2Bucket = r2Bucket;
  }

  /**
   * Generate a simple sine wave tone as fallback
   */
  private generateHoldMusicAudio(): ArrayBuffer {
    const sampleRate = 8000;
    const duration = 2; // 2 seconds
    const samples = sampleRate * duration;
    const frequency = 440; // A4 note
    
    const audioData = new Uint8Array(samples);
    for (let i = 0; i < samples; i++) {
      const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
      // Convert to µ-law (simplified approximation)
      const muLawSample = Math.round(sample * 127) + 128;
      audioData[i] = Math.max(0, Math.min(255, muLawSample));
    }
    
    return audioData.buffer;
  }

  /**
   * Load audio file from R2 bucket
   */
  private async loadAudioFromR2(fileName: string): Promise<ArrayBuffer | null> {
    try {
      console.log(`Loading hold music from R2: ${fileName}`);
      const object = await this.r2Bucket.get(fileName);
      
      if (object) {
        return await object.arrayBuffer();
      } else {
        console.warn(`Audio file not found in R2: ${fileName}`);
        return null;
      }
    } catch (error) {
      console.warn(`Error loading audio file ${fileName} from R2:`, error);
      return null;
    }
  }

  /**
   * Start playing hold music via the media stream
   */
  async startHoldMusic(
    onAudioChunk: (audioChunk: string) => void,
    holdMusicType?: string
  ): Promise<boolean> {
    if (this.state.isPlaying) {
      console.log('Hold music is already playing');
      return true;
    }

    try {
      console.log('Starting hold music via media stream');
      
      // Determine which audio file to use
      let fileName = HOLD_MUSIC_CONFIG.defaultAudioFile;
      
      if (holdMusicType) {
        if (holdMusicType in HOLD_MUSIC_CONFIG.alternatives) {
          fileName = HOLD_MUSIC_CONFIG.alternatives[holdMusicType];
        } else {
          // Treat as custom filename
          fileName = holdMusicType;
        }
      }
      
      // Try to load the specified file
      let audioBuffer = await this.loadAudioFromR2(fileName);
      
      // Try default file if custom file not found
      if (!audioBuffer && holdMusicType && fileName !== HOLD_MUSIC_CONFIG.defaultAudioFile) {
        console.log('Custom file not found, trying default...');
        audioBuffer = await this.loadAudioFromR2(HOLD_MUSIC_CONFIG.defaultAudioFile);
      }
      
      // Fall back to generated tone if no audio file found
      if (!audioBuffer) {
        console.log('No audio file found in R2, using generated tone');
        audioBuffer = this.generateHoldMusicAudio();
      }
      
      this.state.audioBuffer = audioBuffer;
      this.state.isPlaying = true;
      
      // Stream the audio in chunks
      this.streamAudioChunks(onAudioChunk);
      
      console.log('Hold music started successfully');
      return true;
    } catch (error) {
      console.error('Error starting hold music:', error);
      return false;
    }
  }

  /**
   * Stream audio chunks at regular intervals
   */
  private streamAudioChunks(onAudioChunk: (audioChunk: string) => void): void {
    const chunkSize = 160; // 20ms of audio at 8kHz
    let position = 0;
    
    const streamInterval = () => {
      if (!this.state.isPlaying || !this.state.audioBuffer) {
        return;
      }
      
      // Extract chunk from buffer
      const remainingBytes = this.state.audioBuffer.byteLength - position;
      const chunkLength = Math.min(chunkSize, remainingBytes);
      
      if (chunkLength === 0) {
        // Loop back to beginning
        position = 0;
        return;
      }
      
      const chunk = new Uint8Array(this.state.audioBuffer, position, chunkLength);
      
      // Convert to base64 and send
      const base64Chunk = this.arrayBufferToBase64(chunk);
      onAudioChunk(base64Chunk);
      
      position += chunkLength;
      
      // Schedule next chunk
      if (this.state.isPlaying) {
        this.state.intervalId = setTimeout(streamInterval, 20) as any;
      }
    };
    
    // Start streaming
    streamInterval();
  }

  /**
   * Convert ArrayBuffer to base64
   */
  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.byteLength; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  /**
   * Stop the currently playing hold music
   */
  async stopHoldMusic(): Promise<boolean> {
    if (!this.state.isPlaying) {
      console.log('No hold music is currently playing');
      return true;
    }

    try {
      console.log('Stopping hold music');
      
      // Clear the interval
      if (this.state.intervalId) {
        clearTimeout(this.state.intervalId);
        this.state.intervalId = undefined;
      }
      
      this.state.isPlaying = false;
      this.state.audioBuffer = undefined;
      
      console.log('Hold music stopped successfully');
      return true;
    } catch (error) {
      console.error('Error stopping hold music:', error);
      return false;
    }
  }

  /**
   * Check if hold music is currently playing
   */
  isHoldMusicPlaying(): boolean {
    return this.state.isPlaying;
  }

  /**
   * Reset hold music state (useful when call ends)
   */
  resetHoldMusicState(): void {
    if (this.state.intervalId) {
      clearTimeout(this.state.intervalId);
      this.state.intervalId = undefined;
    }
    this.state.isPlaying = false;
    this.state.audioBuffer = undefined;
    console.log('Hold music state reset');
  }

  /**
   * Get available hold music options
   */
  getHoldMusicOptions() {
    return {
      generated: 'Generated Tone (Default fallback)',
      default: HOLD_MUSIC_CONFIG.defaultAudioFile,
      ...HOLD_MUSIC_CONFIG.alternatives
    };
  }

  /**
   * List available audio files in R2 bucket
   */
  async listAvailableAudioFiles(): Promise<string[]> {
    try {
      const result = await this.r2Bucket.list({ prefix: '' });
      return result.objects?.map((obj: any) => obj.key) || [];
    } catch (error) {
      console.error('Error listing audio files from R2:', error);
      return [];
    }
  }
} 