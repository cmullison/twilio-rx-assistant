#!/bin/bash

# Hold Music Audio Converter
# This script converts audio files to the required µ-law format for Twilio hold music

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if FFmpeg is installed
check_ffmpeg() {
    if ! command -v ffmpeg &> /dev/null; then
        print_error "FFmpeg is not installed. Please install it first:"
        echo "  macOS: brew install ffmpeg"
        echo "  Ubuntu: sudo apt update && sudo apt install ffmpeg"
        echo "  Windows: Download from https://ffmpeg.org/download.html"
        exit 1
    fi
}

# Convert audio file
convert_audio() {
    local input_file="$1"
    local output_name="$2"
    
    if [[ ! -f "$input_file" ]]; then
        print_error "Input file '$input_file' not found!"
        return 1
    fi
    
    local output_file="${output_name}.raw"
    
    print_status "Converting '$input_file' to '$output_file'..."
    
    # Convert to µ-law format required by Twilio
    if ffmpeg -i "$input_file" -ar 8000 -ac 1 -f mulaw "$output_file" -y; then
        print_success "Converted '$input_file' → '$output_file'"
        
        # Show file info
        local size=$(ls -lh "$output_file" | awk '{print $5}')
        print_status "Output file size: $size"
        
        return 0
    else
        print_error "Failed to convert '$input_file'"
        return 1
    fi
}

# Main function
main() {
    echo "🎵 Hold Music Audio Converter"
    echo "================================"
    echo
    
    check_ffmpeg
    
    if [[ $# -eq 0 ]]; then
        echo "Usage: $0 <input-audio-file> [output-name]"
        echo
        echo "Examples:"
        echo "  $0 my-song.mp3 hold-music"
        echo "  $0 classical.wav classical"
        echo "  $0 jazz-track.m4a jazz"
        echo
        echo "Available preset names:"
        echo "  - hold-music (default)"
        echo "  - classical"
        echo "  - jazz"
        echo "  - ambient"
        echo
        exit 1
    fi
    
    local input_file="$1"
    local output_name="${2:-hold-music}"
    
    convert_audio "$input_file" "$output_name"
    
    echo
    print_success "Conversion complete!"
    print_status "Your hold music file is ready to use."
    print_status "Restart your WebSocket server to load the new audio file."
}

# Batch convert function
convert_batch() {
    print_status "Batch converting common hold music files..."
    
    local files=("classical" "jazz" "ambient" "hold-music")
    local extensions=("mp3" "wav" "m4a" "flac")
    
    for name in "${files[@]}"; do
        for ext in "${extensions[@]}"; do
            local input_file="${name}.${ext}"
            if [[ -f "$input_file" ]]; then
                convert_audio "$input_file" "$name"
                break
            fi
        done
    done
}

# Check for batch mode
if [[ "$1" == "--batch" ]]; then
    convert_batch
else
    main "$@"
fi 