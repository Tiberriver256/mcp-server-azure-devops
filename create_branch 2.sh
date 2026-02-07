#!/bin/bash

# --- Configuration ---
# Set the default remote name (usually 'origin')
REMOTE_NAME="origin"
# Set to 'true' if you want to force delete (-D) unmerged stale branches.
# Set to 'false' to use safe delete (-d) which requires branches to be merged.
FORCE_DELETE_STALE=false
# ---------------------

# Check if a branch name was provided as an argument
if [ -z "$1" ]; then
  echo "Error: No branch name specified."
  echo "Usage: $0 <new-branch-name>"
  exit 1
fi

NEW_BRANCH_NAME="$1"

# --- Pruning Section ---
echo "--- Pruning stale branches ---"

# 1. Update from remote and prune remote-tracking branches that no longer exist on the remote
echo "Fetching updates from '$REMOTE_NAME' and pruning remote-tracking refs..."
git fetch --prune "$REMOTE_NAME"
echo "Fetch and prune complete."
echo

# 2. Identify and delete local branches whose upstream is gone
echo "Checking for local branches tracking deleted remote branches..."

# Get list of local branches marked as 'gone' relative to the specified remote
# Use awk to correctly extract the branch name, handling the '*' for the current branch
GONE_BRANCHES=$(git branch -vv | grep "\[$REMOTE_NAME/.*: gone\]" | awk '/^\*/ {print $2} ! /^\*/ {print $1}')

if [ -z "$GONE_BRANCHES" ]; then
  echo "No stale local branches found to delete."
else
  echo "Found stale local branches:"
  echo "$GONE_BRANCHES"
  echo

  DELETE_CMD="git branch -d"
  if [ "$FORCE_DELETE_STALE" = true ]; then
      echo "Attempting to force delete (-D) stale local branches..."
      DELETE_CMD="git branch -D"
  else
      echo "Attempting to safely delete (-d) stale local branches (will skip unmerged branches)..."
  fi

  # Loop through and delete each branch, handling potential errors
  echo "$GONE_BRANCHES" | while IFS= read -r branch; do
      # Check if the branch to be deleted is the current branch
      CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
      if [ "$branch" = "$CURRENT_BRANCH" ]; then
          echo "Skipping deletion of '$branch' because it is the current branch."
          continue
      fi

      echo "Deleting local branch '$branch'..."
      # Use the chosen delete command (-d or -D)
      $DELETE_CMD "$branch"
  done
  echo "Stale branch cleanup finished."
fi
echo "--- Pruning complete ---"
echo

# --- Branch Creation Section ---
echo "Creating and checking out new branch: '$NEW_BRANCH_NAME'..."
git checkout -b "$NEW_BRANCH_NAME"

# Check if checkout was successful (it might fail if the branch already exists locally)
if [ $? -ne 0 ]; then
  echo "Error: Failed to create or checkout branch '$NEW_BRANCH_NAME'."
  echo "It might already exist locally."
  exit 1
fi

echo ""
echo "Successfully created and switched to branch '$NEW_BRANCH_NAME'."
# Optional: Suggest pushing and setting upstream
# echo "To push and set the upstream: git push -u $REMOTE_NAME $NEW_BRANCH_NAME"

exit 0