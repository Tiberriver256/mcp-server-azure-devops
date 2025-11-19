#!/bin/bash
# Clone or update the vsts-rest-api-specs repository

REPO_DIR="/tmp/vsts-rest-api-specs"

if [ -d "$REPO_DIR" ]; then
    echo "Updating existing vsts-rest-api-specs repository..."
    cd "$REPO_DIR"
    git pull
else
    echo "Cloning vsts-rest-api-specs repository..."
    cd /tmp
    git clone --depth 1 https://github.com/MicrosoftDocs/vsts-rest-api-specs.git
fi

echo "✅ vsts-rest-api-specs available at: $REPO_DIR"
echo ""
echo "API areas available:"
ls -d "$REPO_DIR/specification"/*/ | xargs -n1 basename | sort
