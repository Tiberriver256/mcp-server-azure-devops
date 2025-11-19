#!/usr/bin/env python3
"""
Search for specific endpoints across Azure DevOps API specifications.

Usage:
    python find_endpoint.py "pull request"
    python find_endpoint.py "repository" --area git
    python find_endpoint.py "pipeline" --version 7.2
"""

import json
import sys
import os
from pathlib import Path
import argparse

def search_specs(search_term, api_area=None, version=None):
    """Search for endpoints matching the search term."""
    specs_dir = Path("/tmp/vsts-rest-api-specs/specification")
    
    if not specs_dir.exists():
        print("❌ vsts-rest-api-specs not found at /tmp/vsts-rest-api-specs")
        print("Run clone_specs.sh first")
        return
    
    results = []
    
    # Determine which areas to search
    areas_to_search = [api_area] if api_area else [d.name for d in specs_dir.iterdir() if d.is_dir()]
    
    for area in areas_to_search:
        area_path = specs_dir / area
        if not area_path.exists():
            continue
            
        # Determine which versions to search
        versions_to_search = [version] if version else [d.name for d in area_path.iterdir() if d.is_dir()]
        
        for ver in versions_to_search:
            spec_file = area_path / ver / f"{area}.json"
            if not spec_file.exists():
                continue
                
            try:
                with open(spec_file, 'r', encoding='utf-8-sig') as f:
                    spec = json.load(f)
                    
                # Search in paths
                if 'paths' in spec:
                    for path, methods in spec['paths'].items():
                        for method, details in methods.items():
                            if isinstance(details, dict):
                                # Check if search term is in path, operation ID, or summary
                                searchable = f"{path} {details.get('operationId', '')} {details.get('summary', '')}".lower()
                                if search_term.lower() in searchable:
                                    results.append({
                                        'area': area,
                                        'version': ver,
                                        'method': method.upper(),
                                        'path': path,
                                        'operationId': details.get('operationId', 'N/A'),
                                        'summary': details.get('summary', 'N/A')
                                    })
            except Exception as e:
                print(f"⚠️  Error reading {spec_file}: {e}")
    
    # Display results
    if not results:
        print(f"No endpoints found matching '{search_term}'")
        return
    
    print(f"Found {len(results)} endpoint(s) matching '{search_term}':\n")
    
    for r in results:
        print(f"📍 {r['area']}/{r['version']}")
        print(f"   {r['method']} {r['path']}")
        print(f"   Operation: {r['operationId']}")
        print(f"   Summary: {r['summary']}")
        print()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Search Azure DevOps API specifications")
    parser.add_argument("search_term", help="Search term to find in endpoints")
    parser.add_argument("--area", help="Specific API area to search (e.g., git, build)")
    parser.add_argument("--version", help="Specific version to search (e.g., 7.2)")
    
    args = parser.parse_args()
    search_specs(args.search_term, args.area, args.version)
