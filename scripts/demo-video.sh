#!/usr/bin/env bash
# Post-processes submission/demo-raw/*.webm into submission/demo.mp4
# (1920x1080, <=3 min): intro title card, persistent honesty banner,
# closing card. Run after scripts/record-demo.ts.
set -euo pipefail
cd "$(dirname "$0")/.."

RAW=$(ls -t submission/demo-raw/*.webm | head -1)
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
FONTB=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
TXT='Pretext — AI sparring partner for frontline staff'
SUB='recorded replay + mock agent — live AssemblyAI verification pending'
END='Pretext · github.com/sharonbasovich/pretext · MIT'
BANNER='mock agent / recorded replay — live AssemblyAI verification pending'

# Title card: 4s, dark ops-console bg (#0b0f14), big title + disclaimer sub.
ffmpeg -y -f lavfi -i "color=c=0x0b0f14:s=1920x1080:d=4" \
  -vf "drawtext=fontfile=$FONTB:text='$TXT':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=fontfile=$FONT:text='$SUB':fontcolor=0xf59e0b:fontsize=30:x=(w-text_w)/2:y=(h-text_h)/2+60" \
  -c:v libx264 -pix_fmt yuv420p /tmp/pretext-title.mp4

# Body: raw capture + persistent bottom banner.
ffmpeg -y -i "$RAW" \
  -vf "drawbox=y=ih-52:w=iw:h=52:color=0x0b0f14@0.85:t=fill,drawtext=fontfile=$FONT:text='$BANNER':fontcolor=0xf59e0b:fontsize=26:x=(w-text_w)/2:y=h-40" \
  -c:v libx264 -pix_fmt yuv420p -preset fast /tmp/pretext-body.mp4

# Closing card: 3s.
ffmpeg -y -f lavfi -i "color=c=0x0b0f14:s=1920x1080:d=3" \
  -vf "drawtext=fontfile=$FONT:text='$END':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2" \
  -c:v libx264 -pix_fmt yuv420p /tmp/pretext-end.mp4

printf "file '/tmp/pretext-title.mp4'\nfile '/tmp/pretext-body.mp4'\nfile '/tmp/pretext-end.mp4'\n" > /tmp/pretext-concat.txt
ffmpeg -y -f concat -safe 0 -i /tmp/pretext-concat.txt -c copy submission/demo.mp4

dur=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 submission/demo.mp4)
echo "demo.mp4: ${dur}s (cap 180s)"
