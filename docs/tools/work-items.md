# Work Item Tools

This document describes the tools available for working with Azure DevOps work items.

## Table of Contents

- [`get_work_item`](#get_work_item) - Retrieve a specific work item by ID
- [`create_work_item`](#create_work_item) - Create a new work item
- [`list_work_items`](#list_work_items) - List work items in a project
- [`create_work_item_attachment`](#create_work_item_attachment) - Upload and attach a file to a work item
- [`get_work_item_attachment`](#get_work_item_attachment) - Download an attachment from Azure DevOps
- [`delete_work_item_attachment`](#delete_work_item_attachment) - Delete an attachment from a work item

## get_work_item

Retrieves a work item by its ID.

### Parameters

| Parameter    | Type   | Required | Description                                                                       |
| ------------ | ------ | -------- | --------------------------------------------------------------------------------- |
| `workItemId` | number | Yes      | The ID of the work item to retrieve                                               |
| `expand`     | string | No       | Controls the level of detail in the response. Defaults to "All" if not specified. Other values: "Relations", "Fields", "None" |

PLACEHOLDER_REST_FROM_MAIN_AND_APPENDIX
