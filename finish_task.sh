#!/bin/bash

# Check if a PR title is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <pr_title> [pr_description]"
  echo "Example: $0 \"Add user authentication\" \"This PR implements user login and registration\""
  exit 1
fi

PR_TITLE="$1"
PR_DESCRIPTION="${2:-"No description provided."}"

# Get current branch name
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
if [ "$CURRENT_BRANCH" = "main" ]; then
  echo "Error: You are on the main branch. Please switch to a feature branch."
  exit 1
fi

# Stage all changes
echo "Staging all changes..."
git add .

# Check if there are any changes to commit
if git diff --staged --quiet; then
  echo "No changes to commit. Have you made any changes?"
  exit 1
fi

# Commit changes
echo "Committing changes with title: $PR_TITLE"
git commit -m "$PR_TITLE" -m "$PR_DESCRIPTION"

if [ $? -ne 0 ]; then
  echo "Failed to commit changes."
  exit 1
fi

# Push changes to remote
echo "Pushing changes to origin/$CURRENT_BRANCH..."
git push -u origin "$CURRENT_BRANCH"

if [ $? -ne 0 ]; then
  echo "Failed to push changes to remote."
  exit 1
fi

# Create PR using GitHub CLI
echo "Creating pull request..."
if command -v gh &> /dev/null; then
  PR_URL=$(gh pr create --title "$PR_TITLE" --body "$PR_DESCRIPTION" --base main --head "$CURRENT_BRANCH")
  
  if [ $? -eq 0 ]; then
    echo "Pull request created successfully!"
    echo "PR URL: $PR_URL"
    
    # Try to open the PR URL in the default browser
    if command -v xdg-open &> /dev/null; then
      xdg-open "$PR_URL" &> /dev/null &  # Linux
    elif command -v open &> /dev/null; then
      open "$PR_URL" &> /dev/null &  # macOS
    elif command -v start &> /dev/null; then
      start "$PR_URL" &> /dev/null &  # Windows
    else
      echo "Could not automatically open the PR in your browser."
    fi
  else
    echo "Failed to create pull request using GitHub CLI."
    echo "Please create a PR manually at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:\/]\(.*\)\.git/\1/')/pull/new/$CURRENT_BRANCH"
  fi
else
  echo "GitHub CLI (gh) not found. Please install it to create PRs from the command line."
  echo "You can create a PR manually at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:\/]\(.*\)\.git/\1/')/pull/new/$CURRENT_BRANCH"
fi

echo "Task completion workflow finished!" 