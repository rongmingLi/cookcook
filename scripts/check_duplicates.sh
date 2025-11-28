#!/usr/bin/env bash
set -euo pipefail

# check_duplicates.sh
# Scan all *_urls.json files in the workspace and report duplicate URLs per-file and across files.
# Usage:
#   ./scripts/check_duplicates.sh           # scan repository for *_urls.json
#   ./scripts/check_duplicates.sh ./dir     # scan a specific directory

# Parse optional flags: --fix to deduplicate files in-place, --sort to sort+unique instead of preserving order
FIX=false
GLOBAL_FIX=false
PRESERVE_ORDER=true

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --fix)
      FIX=true; shift ;;
    --global-fix)
      GLOBAL_FIX=true; shift ;;
    --sort)
      PRESERVE_ORDER=false; shift ;;
    -h|--help)
      echo "Usage: $0 [SEARCH_DIR] [--fix] [--global-fix] [--sort]";
      echo "  --fix        : deduplicate within each file (in-place)";
      echo "  --global-fix : remove URLs that appear in multiple files (keep only first occurrence)";
      echo "  --sort       : when used with --fix, sort+unique instead of preserving original order";
      exit 0 ;;
    *)
      # first non-flag arg is search dir
      SEARCH_DIR=$1; shift ;;
  esac
done

# default search dir
SEARCH_DIR=${SEARCH_DIR:-.}

# Find files (null-separated to handle spaces in filenames)
mapfile -t files < <(find "${SEARCH_DIR}" -type f -name '*_urls.json' -print)

if [ ${#files[@]} -eq 0 ]; then
  echo "No *_urls.json files found under: ${SEARCH_DIR}"
  exit 0
fi

any_dup_found=0

echo "Found ${#files[@]} file(s). Scanning for duplicates..."

for f in "${files[@]}"; do
  echo
  echo "File: $f"

  # Extract URLs (jq -r '.[]'), remove empty lines, then get counts
  # Use awk to print entries with count >1
  dup_counts=$(jq -r '.[]' "$f" 2>/dev/null | sed '/^[[:space:]]*$/d' | sort | uniq -c | awk '$1>1{print $1 "x " substr($0, index($0,$2))}') || true

  if [ -z "$dup_counts" ]; then
    echo "  OK: no duplicates"
  else
    any_dup_found=1
    echo "  Duplicates:" 
    echo "$dup_counts" | sed 's/^/    /'
    # If requested, fix (dedupe) the file in-place
    if [ "$FIX" = true ]; then
      echo "    Fixing duplicates in $f (preserve_order=$PRESERVE_ORDER)..."
      if [ "$PRESERVE_ORDER" = true ]; then
        # Preserve first occurrence order when deduping
        jq 'map(select(. != null and . != "")) | reduce .[] as $item ( []; if ( index($item) == null ) then . + [$item] else . end )' "$f" > "$f.tmp" && mv "$f.tmp" "$f" || echo "    Failed to fix $f"
      else
        # Sort and unique
        jq 'map(select(. != null and . != "")) | unique' "$f" > "$f.tmp" && mv "$f.tmp" "$f" || echo "    Failed to fix $f"
      fi
    fi
  fi
done

# Check duplicates across all files combined
echo
echo "Checking duplicates across all files combined..."

tmpfile=$(mktemp)
jq -r '.[]' "${files[0]}" >/dev/null 2>&1 || true
# Collect from all files, remove empty, sort and count
for f in "${files[@]}"; do
  jq -r '.[]' "$f" 2>/dev/null | sed '/^[[:space:]]*$/d' >> "$tmpfile" || true
done

global_dups=$(sort "$tmpfile" | uniq -c | awk '$1>1{print $1 "x " substr($0, index($0,$2))}') || true
rm -f "$tmpfile"

if [ -z "$global_dups" ]; then
  echo "  No global duplicates found."
else
  any_dup_found=1
  echo "Global duplicates (across files):"
  echo "$global_dups" | sed 's/^/  /'
fi

# Apply fixes based on flags
if [ "$FIX" = true ] || [ "$GLOBAL_FIX" = true ]; then
  echo
  echo "Applying deduplication fixes..."
  
  if [ "$GLOBAL_FIX" = true ]; then
    # Global fix: collect all URLs across all files, determine which appear in multiple files
    # Remove those URLs from all files (keeping only first occurrence file)
    echo "Processing global duplicates (removing URLs that appear in multiple files)..."
    
    # Build a mapping of URL -> list of files containing it
    declare -A url_files
    for f in "${files[@]}"; do
      while IFS= read -r url; do
        [ -z "$url" ] && continue
        if [ -z "${url_files[$url]:-}" ]; then
          url_files[$url]="$f"
        else
          url_files[$url]="${url_files[$url]}|$f"
        fi
      done < <(jq -r '.[]' "$f" 2>/dev/null | sed '/^[[:space:]]*$/d')
    done
    
    # For each file, remove URLs that appear in other files
    for f in "${files[@]}"; do
      echo "  Processing $f..."
      jq_expr='map(select('
      first_cond=true
      for url in "${!url_files[@]}"; do
        file_list="${url_files[$url]}"
        # Check if this URL appears in multiple files
        file_count=$(echo "$file_list" | tr '|' '\n' | wc -l)
        if [ "$file_count" -gt 1 ]; then
          # Check if current file is NOT the first file containing this URL
          first_file=$(echo "$file_list" | cut -d'|' -f1)
          if [ "$f" != "$first_file" ]; then
            if [ "$first_cond" = true ]; then
              jq_expr+="(. != \"$(printf '%s\n' "$url" | sed 's/"/\\"/g')\""
              first_cond=false
            else
              jq_expr+=" and . != \"$(printf '%s\n' "$url" | sed 's/"/\\"/g')\""
            fi
          fi
        fi
      done
      if [ "$first_cond" = false ]; then
        jq_expr+=")"
      fi
      jq_expr+="))"
      
      if [ "$jq_expr" != "map(select())" ]; then
        jq "$jq_expr" "$f" > "$f.tmp" && mv "$f.tmp" "$f" || echo "    Failed to process $f"
      fi
    done
  fi
  
  if [ "$FIX" = true ]; then
    echo "Processing local duplicates (within each file)..."
    for f in "${files[@]}"; do
      if [ "$PRESERVE_ORDER" = true ]; then
        # Preserve first occurrence order when deduping
        jq 'map(select(. != null and . != "")) | reduce .[] as $item ( []; if ( index($item) == null ) then . + [$item] else . end )' "$f" > "$f.tmp" && mv "$f.tmp" "$f" || echo "    Failed to fix $f"
      else
        # Sort and unique
        jq 'map(select(. != null and . != "")) | unique' "$f" > "$f.tmp" && mv "$f.tmp" "$f" || echo "    Failed to fix $f"
      fi
    done
  fi
  
  echo "Fixes applied."
fi

if [ "$any_dup_found" -eq 1 ]; then
  echo
  echo "Summary: Duplicates found. Exit code 2."
  exit 2
else
  echo
  echo "Summary: No duplicates found. Exit code 0."
  exit 0
fi
