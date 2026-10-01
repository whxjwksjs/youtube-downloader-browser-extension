#!/usr/bin/env bash
# E2E harness for the embed-metadata handler logic.
# Mirrors tryRemuxWithoutCover / tryEmbedWithCover / tryRemuxWithPictureTag
# arg-for-arg using system ffmpeg.
set -u
cd "$(dirname "$0")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0; fail=0
check() { # name, actual, expected
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "PASS $1";
  else fail=$((fail+1)); echo "FAIL $1 — got '$2', want '$3'"; fi
}

# Fixtures: 5s Opus-in-WebM (like a YouTube audio stream) + widescreen 1280x720 JPEG.
ffmpeg -v error -y -f lavfi -i "sine=frequency=440:duration=5" -c:a libopus -b:a 64k -f webm "$WORK/input.weba"
ffmpeg -v error -y -f lavfi -i "testsrc=size=1280x720:duration=1" -frames:v 1 "$WORK/cover.jpg"

WATCH="https://www.youtube.com/watch?v=TESTVIDEOID"

echo "--- Test 1: opus output (the v2.5.3 bug) ---"
# Mirrors tryRemuxWithoutCover: -f matroska -i input.weba -map 0:a -c:a copy (opus is native for opus) + metadata, NO cover.
ffmpeg -v error -y -f matroska -i "$WORK/input.weba" -map 0:a -c:a copy \
  -metadata title="Test Title" -metadata comment="$WATCH" "$WORK/out.opus"
rc=$?
check "opus remux exit code" "$rc" "0"
if [ $rc -eq 0 ]; then
  acodec=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$WORK/out.opus")
  check "opus file has opus audio" "$acodec" "opus"
  vstreams=$(ffprobe -v error -select_streams v -show_entries stream=index -of csv=p=0 "$WORK/out.opus" | wc -l)
  check "opus file has no video/cover streams" "$vstreams" "0"
  comment=$(ffprobe -v error -select_streams a:0 -show_entries stream_tags=comment -of csv=p=0 "$WORK/out.opus")
  check "opus file keeps watch-url comment (vorbis stream tag)" "$comment" "$WATCH"
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WORK/out.opus" | cut -d. -f1)
  check "opus file has ~5s duration" "$dur" "5"
fi

echo "--- Test 2: m4a output with widescreen cover ---"
# Mirrors tryEmbedWithCover: opus -> aac (fallback codec for m4a), cover attached as attached_pic.
ffmpeg -v error -y -f matroska -i "$WORK/input.weba" -f image2 -i "$WORK/cover.jpg" \
  -map 0:a -map 1 -c:v copy -disposition:v attached_pic -c:a aac \
  -metadata title="Test Title" -metadata comment="$WATCH" "$WORK/out.m4a"
rc=$?
check "m4a embed exit code" "$rc" "0"
if [ $rc -eq 0 ]; then
  acodec=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$WORK/out.m4a")
  check "m4a file has aac audio" "$acodec" "aac"
  cwidth=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$WORK/out.m4a")
  cheight=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$WORK/out.m4a")
  check "cover art width (widescreen, not square)" "$cwidth" "1280"
  check "cover art height (widescreen, not square)" "$cheight" "720"
  disp=$(ffprobe -v error -select_streams v:0 -show_entries stream=disposition:stream_disposition=attached_pic -of csv=p=0 "$WORK/out.m4a" | head -1)
  check "cover stream is attached_pic" "$disp" "1"
  comment=$(ffprobe -v error -show_entries format_tags=comment -of csv=p=0 "$WORK/out.m4a")
  check "m4a file keeps watch-url comment" "$comment" "$WATCH"
fi

echo "--- Test 3: the OLD buggy opus+cover path must fail (proves the fix was needed) ---"
ffmpeg -v error -y -f matroska -i "$WORK/input.weba" -f image2 -i "$WORK/cover.jpg" \
  -map 0:a -map 1 -c:v mjpeg -disposition:v attached_pic -c:a copy "$WORK/bad.opus" 2>/dev/null
rc=$?
check "opus+cover attach fails as expected" "$([ $rc -ne 0 ] && echo nonzero || echo zero)" "nonzero"

echo "--- Test 4: opus output with cover via METADATA_BLOCK_PICTURE ---"
# Mirrors tryRemuxWithPictureTag: base64 FLAC picture block as vorbis comment.
PICTURE_B64=$(python3 - "$WORK/cover.jpg" <<'EOF'
import struct, base64, sys
img = open(sys.argv[1], 'rb').read()
mime = b'image/jpeg'
block = struct.pack('>I', 3) + struct.pack('>I', len(mime)) + mime + struct.pack('>I', 0)
block += struct.pack('>IIII', 0, 0, 0, 0) + struct.pack('>I', len(img)) + img
print(base64.b64encode(block).decode())
EOF
)
ffmpeg -v error -y -f matroska -i "$WORK/input.weba" -map 0:a -c:a copy \
  -metadata title="Test Title" -metadata comment="$WATCH" \
  -metadata "METADATA_BLOCK_PICTURE=$PICTURE_B64" "$WORK/out-pic.opus"
rc=$?
check "opus picture-tag remux exit code" "$rc" "0"
if [ $rc -eq 0 ]; then
  vcodec=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$WORK/out-pic.opus")
  check "opus file exposes cover as picture stream" "$vcodec" "mjpeg"
  cwidth=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$WORK/out-pic.opus")
  check "opus cover width (widescreen, not square)" "$cwidth" "1280"
fi

echo "--- Test 5: mp3 output with widescreen cover (stream attach) ---"
# Mirrors tryEmbedWithCover for mp3: cover attached as attached_pic (ID3 APIC).
ffmpeg -v error -y -f matroska -i "$WORK/input.weba" -f image2 -i "$WORK/cover.jpg" \
  -map 0:a -map 1 -c:v copy -disposition:v attached_pic -c:a libmp3lame \
  -metadata title="Test Title" -metadata comment="$WATCH" "$WORK/out.mp3"
rc=$?
check "mp3 embed exit code" "$rc" "0"
if [ $rc -eq 0 ]; then
  acodec=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$WORK/out.mp3")
  check "mp3 file has mp3 audio" "$acodec" "mp3"
  cwidth=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$WORK/out.mp3")
  check "mp3 cover width (widescreen, not square)" "$cwidth" "1280"
fi

echo
echo "passed=$pass failed=$fail"
[ $fail -eq 0 ]
