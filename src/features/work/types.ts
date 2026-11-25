import type {
  WorkItem,
  WorkItemLink,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';

export type IterationTimeFrame = 'past' | 'current' | 'future';

export interface ListIterationsOptions {
  projectId: string;
  path?: string;
  depth?: number;
}

export interface IterationNodeAttributes {
  startDate?: string;
  finishDate?: string;
}

export interface IterationNode {
  id?: number;
  identifier?: string;
  name?: string;
  structureType?: string;
  path?: string;
  hasChildren: boolean;
  attributes?: IterationNodeAttributes;
  children?: IterationNode[];
  url?: string;
}

export interface ListTeamIterationsOptions {
  projectId: string;
  teamId?: string;
  timeframe?: IterationTimeFrame;
}

export interface TeamIterationAttributes {
  startDate?: string;
  finishDate?: string;
  timeFrame?: IterationTimeFrame;
}

export interface TeamIteration {
  id?: string;
  name?: string;
  path?: string;
  attributes?: TeamIterationAttributes;
  url?: string;
}

export interface GetTeamSettingsOptions {
  projectId: string;
  teamId?: string;
  includeAreaPaths?: boolean;
}

export interface TeamSettingsIterationRef {
  id?: string;
  name?: string;
  path?: string;
  url?: string;
}

export interface TeamAreaPathValue {
  value?: string;
  includeChildren?: boolean;
}

export interface TeamAreaPaths {
  field?: {
    referenceName?: string;
    url?: string;
  };
  defaultValue?: string;
  values: TeamAreaPathValue[];
  url?: string;
}

export interface TeamSettingsResult {
  backlogIteration?: TeamSettingsIterationRef;
  defaultIteration?: TeamSettingsIterationRef;
  defaultIterationMacro?: string;
  backlogVisibilities?: Record<string, boolean>;
  bugsBehavior?: string;
  workingDays?: string[];
  url?: string;
  areaPaths?: TeamAreaPaths;
}

export interface GetIterationWorkItemsOptions {
  projectId: string;
  teamId?: string;
  iterationId: string;
  includeWorkItemDetails?: boolean;
  fields?: string[];
}

export interface IterationWorkItemsResult {
  iterationId: string;
  projectId: string;
  teamId?: string;
  count: number;
  workItemIds: number[];
  workItemRelations: WorkItemLink[];
  workItems?: WorkItem[];
  url?: string;
}
