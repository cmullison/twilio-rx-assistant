# R2 Bucket Setup for Hold Music

This guide helps you set up the R2 bucket for hold music storage.

## 1. Create R2 Bucket

```bash
# Create the 'tracks' bucket
wrangler r2 bucket create tracks
```

## 2. Upload Audio Files

### Expected File Formats

The hold music service supports:

- **Raw audio files** (`.raw`) - μ-law encoded, 8kHz sample rate
- **MP3 files** (`.mp3`) - Will be loaded as-is
- **WAV files** (`.wav`) - Will be loaded as-is

### Default File Names

- `hold-music.raw` - Default hold music file
- `classical.raw` - Classical music option
- `jazz.raw` - Jazz music option
- `ambient.raw` - Ambient music option
- `breakaway.mp3` - Example MP3 file

### Upload Files

```bash
# Upload default hold music
wrangler r2 object put tracks/hold-music.raw --file=/path/to/your/audio/file.raw

# Upload alternative music options
wrangler r2 object put tracks/classical.raw --file=/path/to/classical.raw
wrangler r2 object put tracks/jazz.raw --file=/path/to/jazz.raw
wrangler r2 object put tracks/ambient.raw --file=/path/to/ambient.raw

# Upload MP3 files
wrangler r2 object put tracks/breakaway.mp3 --file=/path/to/breakaway.mp3
```

### List Uploaded Files

```bash
# List all files in the bucket
wrangler r2 object list tracks

# Check specific file
wrangler r2 object get tracks/hold-music.raw --file=downloaded-hold-music.raw
```

## 3. Audio File Conversion

### Converting to μ-law Format

If you have WAV or MP3 files, convert them to μ-law format for best compatibility:

```bash
# Using FFmpeg to convert to μ-law, 8kHz, mono
ffmpeg -i input.mp3 -ar 8000 -ac 1 -f mulaw output.raw

# Or using SoX
sox input.wav -r 8000 -c 1 -t raw -e mu-law output.raw
```

### Example with the Original Breakaway File

If you have the original `breakaway.mp3` from the Node.js version:

```bash
# Convert to raw format
ffmpeg -i breakaway.mp3 -ar 8000 -ac 1 -f mulaw hold-music.raw

# Upload to R2
wrangler r2 object put tracks/hold-music.raw --file=hold-music.raw
```

## 4. Testing Hold Music

### Check Available Files

```bash
curl https://your-worker.your-subdomain.workers.dev/hold-music/files
```

### Frontend Control

The frontend can control hold music via WebSocket messages:

```javascript
// Start default hold music
websocket.send(
  JSON.stringify({
    type: "hold_music.start",
  })
);

// Start specific hold music
websocket.send(
  JSON.stringify({
    type: "hold_music.start",
    holdMusicType: "classical",
  })
);

// Stop hold music
websocket.send(
  JSON.stringify({
    type: "hold_music.stop",
  })
);
```

### Automatic Hold Music

Hold music automatically starts during function calls and stops when complete.

## 5. File Size Considerations

- **R2 Storage**: $0.015 per GB per month
- **Data Transfer**: $0.36 per million Class A operations
- **Recommended**: Keep audio files under 1MB each for optimal performance

## 6. Fallback Behavior

If no audio files are found in R2, the service will:

1. Try to load the default file (`hold-music.raw`)
2. Fall back to a generated sine wave tone (440Hz)
3. Continue streaming until stopped

## 7. Troubleshooting

### Check R2 Bucket Access

```bash
# Verify bucket exists
wrangler r2 bucket list

# Test file upload
echo "test" | wrangler r2 object put tracks/test.txt
```

### Debug Audio Issues

- Check file format compatibility
- Verify file size (Workers have memory limits)
- Check R2 bucket permissions
- Monitor Wrangler logs: `wrangler tail`

### Common Issues

1. **"Audio file not found"**: Check file exists in R2 and name matches exactly
2. **"Audio choppy"**: Ensure 8kHz sample rate and proper format
3. **"Hold music not starting"**: Check WebSocket connection and function call flow

## 8. R2 Bucket Policies (Optional)

For production, you may want to restrict bucket access:

```bash
# Example: Read-only policy for the worker
wrangler r2 bucket create tracks --policy-file=bucket-policy.json
```

Example `bucket-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::tracks/*"
    }
  ]
}
```
