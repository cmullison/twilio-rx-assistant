import * as fs from 'fs';
import * as path from 'path';

// Configuration for hold music
const HOLD_MUSIC_CONFIG = {
  // Default hold music file path (relative to websocket-server directory)
  defaultAudioFile: path.join(__dirname, '../assets/audio/hold-music.raw'),
  // Alternative files you can configure
  alternatives: {
    classical: path.join(__dirname, '../assets/audio/classical.raw'),
    jazz: path.join(__dirname, '../assets/audio/jazz.raw'),
    ambient: path.join(__dirname, '../assets/audio/ambient.raw'),
  }
};

// Track current hold music state
interface HoldMusicState {
  isPlaying: boolean;
  holdMusicBuffer?: Buffer;
  intervalId?: NodeJS.Timeout;
}

let holdMusicState: HoldMusicState = {
  isPlaying: false,
};

// Default hold music - a simple sine wave tone
// You can replace this with actual audio file data
function generateHoldMusicAudio(): Buffer {
  // Generate a simple sine wave as µ-law encoded audio
  // This creates a pleasant holding tone
  const sampleRate = 8000;
  const duration = 2; // 2 seconds
  const samples = sampleRate * duration;
  const frequency = 440; // A4 note
  
  const audioData = new Array(samples);
  for (let i = 0; i < samples; i++) {
    const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
    // Convert to µ-law (simplified approximation)
    const muLawSample = Math.round(sample * 127) + 128;
    audioData[i] = Math.max(0, Math.min(255, muLawSample));
  }
  
  return Buffer.from(audioData);
}

/**
 * Load audio file from disk
 * @param filePath - Path to the audio file
 * @returns Buffer containing the audio data or null if file not found
 */
function loadAudioFile(filePath: string): Buffer | null {
  try {
    if (fs.existsSync(filePath)) {
      console.log(`Loading hold music from: ${filePath}`);
      return fs.readFileSync(filePath);
    }
  } catch (error) {
    console.warn(`Error loading audio file ${filePath}:`, error);
  }
  return null;
}

/**
 * Start playing hold music via the media stream
 * @param onAudioChunk - Callback function to send audio chunks to the media stream
 * @param holdMusicType - Type of hold music ('default', 'classical', 'jazz', 'ambient') or custom file path
 * @returns Promise<boolean> - Success status
 */
export async function startHoldMusic(
  onAudioChunk: (audioChunk: string) => void, 
  holdMusicType?: string
): Promise<boolean> {
  if (holdMusicState.isPlaying) {
    console.log('Hold music is already playing');
    return true;
  }

  try {
    console.log('Starting hold music via media stream');
    
    // Load or generate hold music audio
    let audioBuffer: Buffer | null = null;
    
    // Determine which audio file to use
    if (holdMusicType) {
      if (holdMusicType in HOLD_MUSIC_CONFIG.alternatives) {
        // Use predefined alternative
        const filePath = HOLD_MUSIC_CONFIG.alternatives[holdMusicType as keyof typeof HOLD_MUSIC_CONFIG.alternatives];
        audioBuffer = loadAudioFile(filePath);
      } else if (holdMusicType.includes('/') || holdMusicType.includes('\\')) {
        // Custom file path provided
        audioBuffer = loadAudioFile(holdMusicType);
      } else {
        // Try as filename in default directory
        const filePath = path.join(path.dirname(HOLD_MUSIC_CONFIG.defaultAudioFile), holdMusicType);
        audioBuffer = loadAudioFile(filePath);
      }
    }
    
    // Try default file if no custom audio loaded
    if (!audioBuffer) {
      audioBuffer = loadAudioFile(HOLD_MUSIC_CONFIG.defaultAudioFile);
    }
    
    // Fall back to generated tone if no audio file found
    if (!audioBuffer) {
      console.log('No audio file found, using generated tone');
      audioBuffer = generateHoldMusicAudio();
    }
    
    holdMusicState.holdMusicBuffer = audioBuffer;
    holdMusicState.isPlaying = true;
    
    // Stream the audio in chunks
    const chunkSize = 160; // 20ms of audio at 8kHz
    let position = 0;
    
    holdMusicState.intervalId = setInterval(() => {
      if (!holdMusicState.isPlaying || !holdMusicState.holdMusicBuffer) {
        return;
      }
      
      const chunk = holdMusicState.holdMusicBuffer.slice(position, position + chunkSize);
      if (chunk.length === 0) {
        // Loop back to beginning
        position = 0;
        return;
      }
      
      // Convert to base64 and send via callback
      const base64Chunk = chunk.toString('base64');
      onAudioChunk(base64Chunk);
      
      position += chunkSize;
    }, 20); // Send a chunk every 20ms
    
    console.log('Hold music started successfully via media stream');
    return true;
  } catch (error) {
    console.error('Error starting hold music:', error);
    return false;
  }
}

/**
 * Stop the currently playing hold music
 * @returns Promise<boolean> - Success status
 */
export async function stopHoldMusic(): Promise<boolean> {
  if (!holdMusicState.isPlaying) {
    console.log('No hold music is currently playing');
    return true;
  }

  try {
    console.log('Stopping hold music');
    
    // Clear the interval and reset state
    if (holdMusicState.intervalId) {
      clearInterval(holdMusicState.intervalId);
      holdMusicState.intervalId = undefined;
    }
    
    holdMusicState.isPlaying = false;
    holdMusicState.holdMusicBuffer = undefined;
    
    console.log('Hold music stopped successfully');
    return true;
  } catch (error) {
    console.error('Error stopping hold music:', error);
    return false;
  }
}

/**
 * Check if hold music is currently playing
 * @returns boolean - Whether hold music is playing
 */
export function isHoldMusicPlaying(): boolean {
  return holdMusicState.isPlaying;
}

/**
 * Reset hold music state (useful when call ends)
 */
export function resetHoldMusicState(): void {
  if (holdMusicState.intervalId) {
    clearInterval(holdMusicState.intervalId);
    holdMusicState.intervalId = undefined;
  }
  holdMusicState.isPlaying = false;
  holdMusicState.holdMusicBuffer = undefined;
  console.log('Hold music state reset');
}

/**
 * Get available hold music options
 * @returns Object with available hold music types and their file paths
 */
export function getHoldMusicOptions() {
  return {
    generated: 'Generated Tone (Default fallback)',
    default: HOLD_MUSIC_CONFIG.defaultAudioFile,
    ...HOLD_MUSIC_CONFIG.alternatives
  };
} 