#!/bin/bash
PLAYLIST=$1
PLAYLIST_URL="https://www.youtube.com/playlist?list=$PLAYLIST"
json_data=$(yt-dlp -J --flat-playlist "$PLAYLIST_URL")
filename=$(echo "$json_data" | jq -r '.title')

# 提取所有 entries.url 保存成 JSON 数组，并在 jq 中过滤掉私有和删除的视频
echo "$json_data" | jq '[.entries[] | select(.title | test("\\[Private video\\]") | not) | select(.title | test("\\[Deleted video\\]") | not) | .url]' > "${filename}_urls.json"