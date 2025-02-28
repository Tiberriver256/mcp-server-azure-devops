#!/bin/bash

# Colors for better output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Azure DevOps MCP Server - Environment Setup${NC}"
echo "This script will help you set up your .env file with Azure DevOps credentials."
echo

# Clean up any existing create_pat.json file
if [ -f "create_pat.json" ]; then
    echo -e "${YELLOW}Cleaning up existing create_pat.json file...${NC}"
    rm -f create_pat.json
fi

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI is not installed.${NC}"
    echo "Please install Azure CLI first: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if Azure DevOps extension is installed
echo -e "${YELLOW}Checking for Azure DevOps extension...${NC}"
az devops &> /dev/null
if [ $? -ne 0 ]; then
    echo "Azure DevOps extension not found. Installing..."
    az extension add --name azure-devops
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to install Azure DevOps extension.${NC}"
        exit 1
    else
        echo -e "${GREEN}Azure DevOps extension installed successfully.${NC}"
    fi
else
    echo "Azure DevOps extension is already installed."
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is not installed.${NC}"
    echo "Please install jq first. On Ubuntu/Debian: sudo apt-get install jq"
    echo "On macOS: brew install jq"
    exit 1
fi

# Check if already logged in
echo -e "\n${YELLOW}Step 1: Checking Azure CLI authentication...${NC}"
if ! az account show &> /dev/null; then
    echo "Not logged in. Initiating login..."
    az login --allow-no-subscriptions || { 
        echo -e "${RED}Failed to login to Azure CLI.${NC}" 
        exit 1
    }
else
    echo -e "${GREEN}Already logged in to Azure CLI.${NC}"
fi

# Get Azure DevOps Organizations using REST API
echo -e "\n${YELLOW}Step 2: Fetching your Azure DevOps organizations...${NC}"
echo "This may take a moment..."

# First get the user profile
echo "Getting user profile..."
profile_response=$(az rest --method get --uri "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0" --resource "499b84ac-1321-427f-aa17-267ca6975798" 2>&1)
profile_status=$?

if [ $profile_status -ne 0 ]; then
    echo -e "${RED}Error: Failed to get user profile${NC}"
    echo -e "${RED}Status code: $profile_status${NC}"
    echo -e "${RED}Error response:${NC}"
    echo "$profile_response"
    echo
    echo "Manually provide your organization name instead."
    read -p "Enter your Azure DevOps organization name: " org_name
else
    echo "Profile API response:"
    echo "$profile_response"
    echo
    public_alias=$(echo "$profile_response" | jq -r '.publicAlias')
    
    if [ "$public_alias" == "null" ] || [ -z "$public_alias" ]; then
        echo -e "${RED}Failed to extract publicAlias from response.${NC}"
        echo "Full response was:"
        echo "$profile_response"
        echo
        echo "Manually provide your organization name instead."
        read -p "Enter your Azure DevOps organization name: " org_name
    else
        # Get organizations using the publicAlias
        echo "Fetching organizations..."
        orgs_result=$(az rest --method get --uri "https://app.vssps.visualstudio.com/_apis/accounts?memberId=$public_alias&api-version=6.0" --resource "499b84ac-1321-427f-aa17-267ca6975798")
        
        # Extract organization names from the response using jq
        orgs=$(echo "$orgs_result" | jq -r '.value[].accountName')
        
        if [ -z "$orgs" ]; then
            echo -e "${RED}No organizations found.${NC}"
            echo "Manually provide your organization name instead."
            read -p "Enter your Azure DevOps organization name: " org_name
        else
            # Display organizations for selection
            echo -e "\nYour Azure DevOps organizations:"
            i=1
            OLDIFS=$IFS
            IFS=$'\n'
            orgs_array=($orgs)
            IFS=$OLDIFS
            
            for org in "${orgs_array[@]}"; do
                echo "$i) $org"
                ((i++))
            done
            
            # Prompt for selection
            read -p "Select an organization (1-${#orgs_array[@]}): " org_selection
            
            if [[ "$org_selection" =~ ^[0-9]+$ ]] && [ "$org_selection" -ge 1 ] && [ "$org_selection" -le "${#orgs_array[@]}" ]; then
                org_name=${orgs_array[$((org_selection-1))]}
            else
                echo -e "${RED}Invalid selection. Please run the script again.${NC}"
                exit 1
            fi
        fi
    fi
fi

org_url="https://dev.azure.com/$org_name"
echo -e "${GREEN}Using organization URL: $org_url${NC}"

# Get Default Project (Optional)
echo -e "\n${YELLOW}Step 3: Would you like to set a default project? (y/n)${NC}"
read -p "Select option: " set_default_project

default_project=""
if [[ "$set_default_project" == "y" || "$set_default_project" == "Y" ]]; then
    # Configure az devops to use the selected organization
    az devops configure --defaults organization=$org_url
    
    # List projects
    echo "Fetching projects from $org_name..."
    projects=$(az devops project list --query "value[].name" -o tsv)
    
    if [ $? -ne 0 ] || [ -z "$projects" ]; then
        echo -e "${YELLOW}No projects found or unable to list projects.${NC}"
        read -p "Enter a default project name (leave blank to skip): " default_project
    else
        # Display projects for selection
        echo -e "\nAvailable projects in $org_name:"
        i=1
        OLDIFS=$IFS
        IFS=$'\n'
        projects_array=($projects)
        IFS=$OLDIFS
        
        for project in "${projects_array[@]}"; do
            echo "$i) $project"
            ((i++))
        done
        
        echo "$i) Skip setting a default project"
        
        # Prompt for selection
        read -p "Select a default project (1-$i): " project_selection
        
        if [[ "$project_selection" =~ ^[0-9]+$ ]] && [ "$project_selection" -ge 1 ] && [ "$project_selection" -lt "$i" ]; then
            default_project=${projects_array[$((project_selection-1))]}
            echo -e "${GREEN}Using default project: $default_project${NC}"
        else
            echo "No default project selected."
        fi
    fi
fi

# Create PAT
echo -e "\n${YELLOW}Step 4: Creating a Personal Access Token (PAT)...${NC}"

# Two methods to create PAT: REST API or browser
echo "Would you like to create a PAT using:"
echo "1) REST API (automated, requires appropriate permissions)"
echo "2) Web browser (manual, more reliable)"
read -p "Select option (1/2): " pat_method

pat_token=""

if [ "$pat_method" == "1" ]; then
    # Create temporary JSON file for PAT creation
    temp_pat_json=$(mktemp)
    # Calculate date 7 days from now in ISO format
    expiry_date=$(date -u -d "+7 days" "+%Y-%m-%dT%H:%M:%S.000Z")
    cat > "$temp_pat_json" << EOF
{
  "displayName": "MCP-Server-Integration",
  "scope": "vso.code vso.build_execute vso.work vso.project vso.profile",
  "validTo": "$expiry_date",
  "allOrgs": false
}
EOF

    # Create PAT using REST API
    echo "Generating PAT for $org_name organization..."
    pat_response=$(az rest --method post --uri "https://vssps.dev.azure.com/$org_name/_apis/tokens/pats?api-version=7.1-preview.1" --resource "499b84ac-1321-427f-aa17-267ca6975798" --body @"$temp_pat_json" 2>&1)
    pat_status=$?

    # Clean up temp file
    rm -f "$temp_pat_json"

    if [ $pat_status -ne 0 ]; then
        echo -e "${RED}Error: Failed to create PAT${NC}"
        echo -e "${RED}Status code: $pat_status${NC}"
        echo -e "${RED}Error response:${NC}"
        echo "$pat_response"
        echo
        echo "Switching to manual PAT creation..."
        pat_method="2"
    else
        echo "PAT API response:"
        echo "$pat_response"
        echo
        # Extract token from response using jq
        pat_token=$(echo "$pat_response" | jq -r '.patToken.token')
        
        if [ "$pat_token" == "null" ] || [ -z "$pat_token" ]; then
            echo -e "${RED}Failed to extract token from response.${NC}"
            echo "Full response was:"
            echo "$pat_response"
            echo
            echo "Switching to manual PAT creation..."
            pat_method="2"
        fi
    fi
fi

if [ "$pat_method" == "2" ]; then
    # Open browser for manual PAT creation
    pat_url="https://dev.azure.com/$org_name/_usersSettings/tokens"
    
    echo -e "${YELLOW}Opening browser to create a PAT manually...${NC}"
    echo "Please create a PAT with the following scopes:"
    echo "- Code (read) - vso.code"
    echo "- Build (read and execute) - vso.build_execute"
    echo "- Work items (read) - vso.work"
    echo "- Project and Team (read) - vso.project"
    echo "- User profile (read) - vso.profile"
    
    # Try to open browser using various commands
    if command -v xdg-open &> /dev/null; then
        xdg-open "$pat_url" &> /dev/null &
    elif command -v open &> /dev/null; then
        open "$pat_url" &> /dev/null &
    elif command -v start &> /dev/null; then
        start "$pat_url" &> /dev/null &
    else
        echo -e "${YELLOW}Could not open browser automatically.${NC}"
        echo "Please visit: $pat_url"
    fi
    
    echo -e "\nAfter creating the PAT, copy it and paste it here:"
    read -p "Enter your PAT: " pat_token
fi

if [ -z "$pat_token" ]; then
    echo -e "${RED}No PAT provided. Cannot continue.${NC}"
    exit 1
fi

# Create .env file
echo -e "\n${YELLOW}Step 5: Creating .env file...${NC}"

cat > .env << EOF
# Azure DevOps MCP Server - Environment Variables

# Azure DevOps Organization Name (selected from your available organizations)
AZURE_DEVOPS_ORG=$org_name

# Azure DevOps Organization URL (required)
AZURE_DEVOPS_ORG_URL=$org_url

# Azure DevOps Personal Access Token (required)
# Created via Azure CLI on $(date +"%b %d, %Y")
# Scopes: vso.code vso.build_execute vso.work vso.project vso.profile
AZURE_DEVOPS_PAT=$pat_token
EOF

# Add default project if specified
if [ ! -z "$default_project" ]; then
cat >> .env << EOF

# Default Project to use when not specified
AZURE_DEVOPS_DEFAULT_PROJECT=$default_project
EOF
else
cat >> .env << EOF

# Default Project to use when not specified (optional)
# AZURE_DEVOPS_DEFAULT_PROJECT=your-default-project
EOF
fi

# Add remaining configuration
cat >> .env << EOF

# API Version to use (optional, defaults to latest)
# AZURE_DEVOPS_API_VERSION=6.0

# Server Configuration
PORT=3000
HOST=localhost

# Logging Level (debug, info, warn, error)
LOG_LEVEL=info
EOF

echo -e "\n${GREEN}Environment setup completed successfully!${NC}"
echo "Your .env file has been created with the following configuration:"
echo "- Organization: $org_name"
echo "- Organization URL: $org_url"
if [ ! -z "$default_project" ]; then
    echo "- Default Project: $default_project"
fi
echo "- PAT: Created with expanded scopes for full integration"
echo
echo "You can now run your Azure DevOps MCP Server with:"
echo "  npm run dev"
echo
echo "You can also run integration tests with:"
echo "  npm run test:integration" 