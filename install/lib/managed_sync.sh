run_mkdir() {
  local dir="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return
  fi
  mkdir -p "$dir"
}

run_rm() {
  local path="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: rm -f $path"
    return
  fi
  rm -f "$path"
}

run_ln() {
  local src="$1"
  local dst="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: ln -s $src $dst"
    return
  fi
  ln -s "$src" "$dst"
}

run_cp_a() {
  local src="$1"
  local dst="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: cp -a $src $dst"
    return
  fi
  cp -a "$src" "$dst"
}

run_cp() {
  local src="$1"
  local dst="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: cp $src $dst"
    return
  fi
  cp "$src" "$dst"
}

run_rm_rf() {
  local path="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: rm -rf $path"
    return
  fi
  rm -rf "$path"
}

run_write_file() {
  local path="$1"
  local content="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: write file $path"
    return
  fi
  printf '%s\n' "$content" >"$path"
}

ensure_dir() {
  local dir="$1"
  if [[ -d "$dir" ]]; then
    return
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: mkdir -p $dir"
    return
  fi
  run_mkdir "$dir"
  log "created directory: $dir"
}

is_managed_opencode_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    return 1
  fi
  local first_line
  IFS= read -r first_line <"$path" || true
  [[ "$first_line" == "$MANAGED_OPENCODE_HEADER" ]]
}

is_managed_dir() {
  local path="$1"
  [[ -f "$path/$MANAGED_DIR_MARKER" ]]
}

is_managed_file() {
  local path="$1"
  [[ -f "${path}.ai-config-managed" ]]
}

render_agent_permission_block() {
  local agent_name="$1"
  local permissions_file="$2"

  awk -v target_agent="$agent_name" '
    function count_indent(s,    i, c) {
      i = 1
      while (i <= length(s)) {
        c = substr(s, i, 1)
        if (c != " ") {
          break
        }
        i++
      }
      return i - 1
    }

    BEGIN {
      in_agents = 0
      current_agent = ""
      capturing_agent = 0
      target_agent_indent = 0
    }

    {
      line = $0
      if (line ~ /^[[:space:]]*$/) {
        next
      }

      indent = count_indent(line)
      trimmed = substr(line, indent + 1)

      if (!in_agents) {
        if (trimmed == "agents:") {
          in_agents = 1
          agents_indent = indent
        }
        next
      }

      if (indent <= agents_indent) {
        in_agents = 0
        next
      }

      if (indent == agents_indent + 2 && match(trimmed, /^([^:#]+):[[:space:]]*$/, m)) {
        key = m[1]
        gsub(/[[:space:]]+$/, "", key)
        current_agent = key
        if (current_agent == target_agent) {
          capturing_agent = 1
          target_agent_indent = indent
          print "permission:"
        } else {
          if (capturing_agent) {
            exit
          }
          capturing_agent = 0
        }
        next
      }

      if (!capturing_agent) {
        next
      }

      if (indent <= target_agent_indent) {
        exit
      }

      if (line ~ /^[[:space:]]*#/) {
        next
      }

      print substr(line, target_agent_indent + 1)
    }
  ' "$permissions_file"
}

render_agent_with_central_permissions() {
  local src_file="$1"
  local dst_file="$2"
  local agent_name="$3"
  local permissions_file="$4"

  local rendered_permission
  rendered_permission="$(render_agent_permission_block "$agent_name" "$permissions_file")"
  if [[ -z "$rendered_permission" ]]; then
    log "error: missing permissions in $permissions_file for agent '$agent_name'"
    exit 1
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: would render centralized permissions: $dst_file"
    return
  fi

  awk -v permission_block="$rendered_permission" '
    BEGIN {
      in_frontmatter = 0
      frontmatter_done = 0
      skipping_permission = 0
      permission_indent = -1
      inserted = 0
    }

    function count_indent(s,    i, c) {
      i = 1
      while (i <= length(s)) {
        c = substr(s, i, 1)
        if (c != " ") {
          break
        }
        i++
      }
      return i - 1
    }

    function print_permission(indent,    n, i, line_count, lines, prefix) {
      prefix = ""
      for (i = 0; i < indent; i++) {
        prefix = prefix " "
      }
      line_count = split(permission_block, lines, "\n")
      for (i = 1; i <= line_count; i++) {
        print prefix lines[i]
      }
      inserted = 1
    }

    {
      line = $0
      if (line == "---") {
        if (!in_frontmatter) {
          in_frontmatter = 1
          print line
          next
        }

        if (in_frontmatter && !frontmatter_done) {
          if (!inserted) {
            print_permission(0)
          }
          frontmatter_done = 1
          in_frontmatter = 0
          print line
          next
        }
      }

      if (!in_frontmatter || frontmatter_done) {
        print line
        next
      }

      indent = count_indent(line)
      trimmed = substr(line, indent + 1)

      if (skipping_permission) {
        if (trimmed == "" || indent > permission_indent) {
          next
        }
        skipping_permission = 0
      }

      if (!inserted && match(trimmed, /^description:[[:space:]]/)) {
        print_permission(indent)
      }

      if (trimmed == "permission:") {
        skipping_permission = 1
        permission_indent = indent
        next
      }

      print line
    }
  ' "$src_file" > "$dst_file"
}

sync_agents_tree_with_permissions() {
  local src_dir="$1"
  local dst_dir="$2"
  local permissions_file="$3"

  sync_managed_tree "$src_dir" "$dst_dir" 1
  if [[ "$SYNC_MANAGED_TREE_LAST_ACTION" != "copied" ]]; then
    return
  fi

  local src_agent
  for src_agent in "$src_dir"/*.md; do
    [[ -f "$src_agent" ]] || continue
    local agent_file
    local agent_name
    local dst_agent
    agent_file="$(basename "$src_agent")"
    agent_name="${agent_file%.md}"
    dst_agent="$dst_dir/$agent_file"
    if ! is_managed_file "$dst_agent"; then
      log "skip conflict with unmanaged path (preserving local content): $dst_agent"
      continue
    fi
    render_agent_with_central_permissions "$src_agent" "$dst_agent" "$agent_name" "$permissions_file"
  done
}

sync_managed_tree() {
  local src="$1"
  local dst="$2"
  local _unused_force_replace_unmanaged="${3:-0}"
  local dst_tree_existed=0
  local dst_tree_was_managed=0
  SYNC_MANAGED_TREE_LAST_ACTION="skipped"

  if [[ ! -d "$src" ]]; then
    log "error: source directory does not exist: $src"
    exit 1
  fi

  if [[ -L "$dst" ]]; then
    log "skip conflict with existing symlink (preserving local content): $dst -> $(readlink "$dst")"
    return
  fi

  if [[ -e "$dst" && ! -d "$dst" ]]; then
    log "skip conflict with non-directory path (preserving local content): $dst"
    return
  fi

  if [[ -d "$dst" ]]; then
    dst_tree_existed=1
    if is_managed_dir "$dst"; then
      dst_tree_was_managed=1
    fi
  fi

  ensure_dir "$dst"

  if [[ "$dst_tree_existed" -eq 0 || "$dst_tree_was_managed" -eq 1 ]] && [[ ! -f "$dst/$MANAGED_DIR_MARKER" ]]; then
    run_write_file "$dst/$MANAGED_DIR_MARKER" "generated-by=ai-config-bootstrap.sh"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log "DRY-RUN: would mark managed tree: $dst"
    else
      log "marked managed tree: $dst"
    fi
  fi

  local src_file
  while IFS= read -r -d '' src_file; do
    local rel_path
    local dst_file
    local dst_parent
    rel_path="${src_file#$src/}"
    dst_file="$dst/$rel_path"
    dst_parent="$(dirname "$dst_file")"

    if [[ -L "$dst_parent" ]] || [[ -e "$dst_parent" && ! -d "$dst_parent" ]]; then
      log "skip conflict with non-directory parent (preserving local content): $dst_parent"
      continue
    fi

    ensure_dir "$dst_parent"

    if [[ -L "$dst_file" ]]; then
      if ! is_managed_file "$dst_file" && [[ "$dst_tree_was_managed" -ne 1 ]]; then
        log "skip conflict with unmanaged path (preserving local content): $dst_file"
        continue
      fi
      run_rm "$dst_file"
      run_cp "$src_file" "$dst_file"
      run_write_file "${dst_file}.ai-config-managed" "generated-by=ai-config-bootstrap.sh"
      SYNC_MANAGED_TREE_LAST_ACTION="copied"
      if [[ "$DRY_RUN" -eq 1 ]]; then
        log "DRY-RUN: would refresh managed file: $dst_file"
      else
        log "refreshed managed file: $dst_file"
      fi
      continue
    fi

    if [[ -e "$dst_file" ]]; then
      if [[ -d "$dst_file" ]]; then
        log "skip conflict with non-file path (preserving local content): $dst_file"
        continue
      fi
      if ! is_managed_file "$dst_file" && [[ "$dst_tree_was_managed" -ne 1 ]]; then
        log "skip conflict with unmanaged path (preserving local content): $dst_file"
        continue
      fi
      run_cp "$src_file" "$dst_file"
      run_write_file "${dst_file}.ai-config-managed" "generated-by=ai-config-bootstrap.sh"
      SYNC_MANAGED_TREE_LAST_ACTION="copied"
      if [[ "$DRY_RUN" -eq 1 ]]; then
        log "DRY-RUN: would refresh managed file: $dst_file"
      else
        log "refreshed managed file: $dst_file"
      fi
      continue
    fi

    run_cp "$src_file" "$dst_file"
    run_write_file "${dst_file}.ai-config-managed" "generated-by=ai-config-bootstrap.sh"
    SYNC_MANAGED_TREE_LAST_ACTION="copied"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      log "DRY-RUN: would create managed file: $dst_file"
    else
      log "created managed file: $dst_file"
    fi
  done < <(find "$src" -type f -print0)

  if [[ "$SYNC_MANAGED_TREE_LAST_ACTION" == "skipped" ]]; then
    log "kept managed tree (no file changes): $dst"
  fi
}

sync_managed_file() {
  local src="$1"
  local dst="$2"
  local parent
  parent="$(dirname "$dst")"

  if [[ ! -f "$src" ]]; then
    log "error: source file does not exist: $src"
    exit 1
  fi

  if [[ -L "$dst" ]]; then
    if [[ "$FORCE" -ne 1 ]]; then
      log "keep existing file (use --force to refresh managed file): $dst"
      return
    fi
    if ! is_managed_file "$dst"; then
      log "skip conflict with unmanaged file (preserving local content): $dst"
      return
    fi
    run_rm "$dst"
  elif [[ -e "$dst" ]]; then
    if [[ "$FORCE" -ne 1 ]]; then
      log "keep existing file (use --force to refresh managed file): $dst"
      return
    fi
    if ! is_managed_file "$dst"; then
      log "skip conflict with unmanaged file (preserving local content): $dst"
      return
    fi
    run_rm "$dst"
  fi

  ensure_dir "$parent"
  run_cp "$src" "$dst"
  run_write_file "${dst}.ai-config-managed" "generated-by=ai-config-bootstrap.sh"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: would copy managed file: $dst"
  else
    log "copied managed file: $dst"
  fi
}
