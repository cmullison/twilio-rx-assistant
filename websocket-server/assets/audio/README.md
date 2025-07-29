# Hold Music Audio Files

This directory contains audio files for hold music during calls.

## 📁 File Structure

Place your audio files in this directory:

```
websocket-server/assets/audio/
├── hold-music.raw        # Default hold music
├── classical.raw         # Classical music option
├── jazz.raw             # Jazz music option
├── ambient.raw          # Ambient music option
└── README.md            # This file
```

## 🎵 Audio Format Requirements

Your audio files **must** be in the following format:

- **Format**: Raw µ-law (mu-law) encoded audio
- **Sample Rate**: 8000 Hz (8 kHz)
- **Channels**: Mono (1 channel)
- **Bit Depth**: 8-bit
- **File Extension**: `.raw`

## 🔄 Converting Your Audio Files

### Using FFmpeg (Recommended)

If you have an MP3, WAV, or other audio file, convert it using FFmpeg:

```bash
# Convert any audio file to the required format
ffmpeg -i your-music.mp3 -ar 8000 -ac 1 -f mulaw hold-music.raw

# Examples for different input formats:
ffmpeg -i classical-music.mp3 -ar 8000 -ac 1 -f mulaw classical.raw
ffmpeg -i jazz-song.wav -ar 8000 -ac 1 -f mulaw jazz.raw
ffmpeg -i ambient-sound.m4a -ar 8000 -ac 1 -f mulaw ambient.raw
```

### Using SoX (Alternative)

```bash
# Convert using SoX
sox your-music.mp3 -r 8000 -c 1 -t ul hold-music.raw

# For different input formats:
sox classical-music.mp3 -r 8000 -c 1 -t ul classical.raw
```

### Online Conversion

If you don't have FFmpeg or SoX installed, you can:

1. Use online audio converters to convert to 8kHz mono WAV first
2. Then use FFmpeg to convert to µ-law format

## 🎛️ Configuration

The hold music types are configured in `websocket-server/src/holdMusicService.ts`:

```typescript
const HOLD_MUSIC_CONFIG = {
  defaultAudioFile: path.join(__dirname, "../assets/audio/hold-music.raw"),
  alternatives: {
    classical: path.join(__dirname, "../assets/audio/classical.raw"),
    jazz: path.join(__dirname, "../assets/audio/jazz.raw"),
    ambient: path.join(__dirname, "../assets/audio/ambient.raw"),
  },
};
```

To add new music types:

1. Add your `.raw` file to this directory
2. Add an entry to the `alternatives` object
3. Add the option to the frontend dropdown in `session-configuration-panel.tsx`

## 🔧 Usage

### Automatic (During Function Calls)

Hold music will automatically play when AI functions are executed, using the "default" type.

### Manual Control

1. Start a call in the application
2. In the Session Configuration panel, select your preferred music type
3. Click "Start Hold" to begin playing hold music
4. Click "Stop Hold" to stop the music

## 📝 Tips

- **File Size**: Keep files reasonably small (under 1MB) for faster loading
- **Duration**: 30-60 seconds is ideal as the audio will loop automatically
- **Volume**: Ensure your audio isn't too loud or too quiet
- **Quality**: Phone-quality audio (8kHz) is sufficient for hold music
- **Test**: Always test your audio files with a real phone call

## 🚨 Fallback

If no audio file is found, the system will automatically generate a pleasant sine wave tone as fallback hold music.
