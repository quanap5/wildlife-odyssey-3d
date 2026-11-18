#!/bin/sh
# Turns the frames written by record-demo.mjs (12 per second of game time) into the GIFs in docs/media/.
# Needs ffmpeg. Usage: sh qa/demo/encode-demo.sh [width] [colours] [fps] [scene ...]
# The README clips were made with:
#   sh qa/demo/encode-demo.sh 480 128 10 explore photo
#   sh qa/demo/encode-demo.sh 560 128 10 journal      (wider, so the journal page stays readable)
set -e
WIDTH="${1:-480}"
COLOURS="${2:-128}"
FPS="${3:-10}"
[ "$#" -gt 3 ] && shift 3 || set --
[ "$#" -gt 0 ] || set -- explore photo journal
mkdir -p docs/media
for scene in "$@"; do
  dir="qa/out/demo/$scene"
  [ -f "$dir/f-000.png" ] || { echo "no frames for $scene, skipping"; continue; }
  ffmpeg -loglevel error -y -framerate 12 -i "$dir/f-%03d.png" \
    -vf "fps=$FPS,scale=$WIDTH:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=$COLOURS:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
    "docs/media/demo-$scene.gif"
  ls -l "docs/media/demo-$scene.gif" | awk '{printf "%s  %.1f MB\n", $9, $5 / 1048576}'
done
