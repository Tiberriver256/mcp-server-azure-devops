#!/bin/bash

# Check if a branch name is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <branch_name>"
  exit 1
fi

branch_name="$1"

# Fetch latest changes from main
git fetch origin main

# Prune remote-tracking branches that no longer exist on the remote
git remote prune origin

# Check if the branch already exists locally
if git rev-parse --verify --quiet "$branch_name" > /dev/null 2>&1; then
  echo "Error: Branch '$branch_name' already exists locally."
  exit 1
fi

# Check if branch exists on remote
if git ls-remote --heads origin "$branch_name" | grep -q "$branch_name"; then
    echo "Error: Branch '$branch_name' already exists on remote."
    exit 1
fi

# Create the new branch
git checkout -b "$branch_name" origin/main

if [ $? -eq 0 ]; then
  echo "Branch '$branch_name' created successfully."
else
  echo "Failed to create branch '$branch_name'."
  exit 1
fi 