#!/bin/bash

# ymp.sh - YouTube URL Extractor
# Usage:
#   ./ymp.sh playlist <PLAYLIST_ID>     # Extract URLs from a YouTube playlist
#   ./ymp.sh channel <CHANNEL_URL>      # Extract URLs from all videos in a channel
#   ./ymp.sh @channel_name              # Shorthand for channel mode

MODE=${1:-playlist}
INPUT=${2:-$1}

# Function to extract URLs from playlist
extract_from_playlist() {
  local playlist_id=$1
  local playlist_url="https://www.youtube.com/playlist?list=$playlist_id"
  
  echo "📺 Extracting from playlist: $playlist_url"
  json_data=$(yt-dlp -J --flat-playlist "$playlist_url")
  filename=$(echo "$json_data" | jq -r '.title')
  
  # Ensure output directory exists
  mkdir -p out
  
  # 提取所有 entries.url 保存成 JSON 数组，并在 jq 中过滤掉私有和删除的视频，去重并过滤空值
  # 使用 jq 的 unique() 对数组去重（按字符串排序），并移除 null/空字符串
  echo "$json_data" | jq '[.entries[]
    | select(.title | test("\\[Private video\\]") | not)
    | select(.title | test("\\[Deleted video\\]") | not)
    | select(.availability != "subscriber_only")
    | .url
  ]
  | map(select(. != null and . != ""))
  | unique
' > "out/${filename}_urls.json"
  
  echo "✅ Saved: out/${filename}_urls.json"
}

# Function to extract URLs from channel
extract_from_channel() {
  local channel_input=$1
  
  # Handle @channel_name format
  if [[ "$channel_input" == @* ]]; then
    channel_url="https://www.youtube.com/$channel_input/videos"
  else
    channel_url="$channel_input"
  fi
  
  echo "📺 Extracting from channel: $channel_url"
  json_data=$(yt-dlp -J --flat-playlist "$channel_url")
  channel_name=$(echo "$json_data" | jq -r '.title // "channel"')
  
  # Ensure output directory exists
  mkdir -p out
  
  # Extract all video URLs, filter out private/deleted, dedupe
  echo "$json_data" | jq '[.entries[]
    | select(.title | test("\\[Private video\\]") | not)
    | select(.title | test("\\[Deleted video\\]") | not)
    | select(.availability != "subscriber_only")
    | .url
  ]
  | map(select(. != null and . != ""))
  | unique
' > "out/${channel_name}_urls.json"
  
  count=$(jq 'length' "out/${channel_name}_urls.json")
  echo "✅ Saved: out/${channel_name}_urls.json (${count} videos)"
}

# Main logic
case "$MODE" in
  playlist)
    if [ -z "$INPUT" ]; then
      echo "Usage: $0 playlist <PLAYLIST_ID>"
      exit 1
    fi
    extract_from_playlist "$INPUT"
    ;;
  channel|@*)
    # If first arg starts with @, treat entire first arg as channel name
    if [[ "$1" == @* ]]; then
      extract_from_channel "$1"
    else
      if [ -z "$INPUT" ]; then
        echo "Usage: $0 channel <CHANNEL_URL|@CHANNEL_NAME>"
        echo "  Example: $0 channel https://www.youtube.com/@LaoFanGu/videos"
        echo "  Example: $0 @LaoFanGu"
        exit 1
      fi
      extract_from_channel "$INPUT"
    fi
    ;;
  *)
    # If no mode specified, try to guess based on input format
    if [[ "$MODE" == @* ]]; then
      # @channel_name format
      extract_from_channel "$MODE"
    elif [[ "$MODE" == *"youtube.com"* ]]; then
      # URL format
      extract_from_channel "$MODE"
    else
      # Assume it's a playlist ID
      extract_from_playlist "$MODE"
    fi
    ;;
esac