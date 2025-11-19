/**
 * Available domains for tool filtering
 */
export enum Domain {
  CORE = 'core',
  WORK_ITEMS = 'work-items',
  REPOSITORIES = 'repositories',
  PULL_REQUESTS = 'pull-requests',
  PIPELINES = 'pipelines',
  WIKIS = 'wikis',
  SEARCH = 'search',
}

/**
 * All available domains
 */
export const ALL_DOMAINS = Object.values(Domain);
