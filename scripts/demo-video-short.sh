#!/usr/bin/env bash
# Post-processes the newest submission/demo-raw/*.webm into
# submission/demo_short.mp4 (~30s): short title card, persistent honesty
# banner, closing card. Run after scripts/record-demo-short.ts.
set -euo pipefail
cd "$(dirname "$0")/.."

RAW=$(ls -t submission/demo-raw/*.webm | head -1)
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
FONTB=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
TXT='Pretext'
SUB='mock agent / recorded replay — live AssemblyAI verification pending'
END='Pretext · github.com/sharonbasovich/pretext'
BANNER='mock agent / recorded replay — live AssemblyAI verification pending'

ffmpeg -y -f lavfi -i "color=c=0x0b0f14:s=1920x1080:d=2.5" \
  -vf "drawtext=fontfile=$FONTB:text='$TXT':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2-30,drawtext=fontfile=$FONT:text='$SUB':fontcolor=0xf59e0b:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2+60" \
  -c:v libx264 -pix_fmt yuv420p /tmp/pretext-short-title.mp4

ffmpeg -y -i "$RAW" \
  -vf "drawbox=y=ih-52:w=iw:h=52:color=0x0b0f14@0.85:t=fill,drawtext=fontfile=$FONT:text='$BANNER':fontcolor=0xf59e0b:fontsize=26:x=(w-text_w)/2:y=h-40" \
  -c:v libx264 -pix_fmt yuv420p -preset fast /tmp/pretext-short-body.mp4

ffmpeg -y -f lavfi -i "color=c=0x0b0f14:s=1920x1080:d=2.5" \
  -vf "drawtext=fontfile=$FONT:text='$END':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2" \
  -c:v libx264 -pix_fmt yuv420p /tmp/pretext-short-end.mp4

printf "file '/tmp/pretext-short-title.mp4'\nfile '/tmp/pretext-short-body.mp4'\nfile '/tmp/pretext-short-end.mp4'\n" > /tmp/pretext-short-concat.txt
ffmpeg -y -f concat -safe 0 -i /tmp/pretext-short-concat.txt -c copy submission/demo_short.mp4

dur=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 submission/demo_short.mp4)
echo "demo_short.mp4: ${dur}s (target ~30s)"
