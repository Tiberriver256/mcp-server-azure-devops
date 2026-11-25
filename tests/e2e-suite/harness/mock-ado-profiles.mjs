/**
 * Declarative Azure DevOps Server (2019 RTM, 2020, 2022) and Services (Cloud)
 * wire-protocol profiles, OPTIONS /_apis/{area} catalogs, ResourceAreas responses,
 * Analytics OData $metadata EDMX XML generators, and server-authentic error payloads.
 */

/**
 * Complete registry of Azure DevOps Resource Area GUIDs used by azure-devops-node-api
 * and direct-HTTP tools. Note: WebApi.getPipelinesApi() in azure-devops-node-api v17
 * passes the `wit` GUID (5264459e-e5e0-4bd8-b118-0985e68a4ec5), so `wit` MUST remain present.
 */
export const RESOURCE_AREAS = Object.freeze([
  Object.freeze({ id: '79134c72-4a58-4b42-976c-04e7115f32bf', name: 'core' }),
  Object.freeze({ id: '5264459e-e5e0-4bd8-b118-0985e68a4ec5', name: 'wit' }),
  Object.freeze({ id: '4e080c62-fa21-4fbc-8fef-2a10a2b38049', name: 'git' }),
  Object.freeze({ id: 'fb13a388-40dd-4a04-b530-013a739c72ef', name: 'policy' }),
  Object.freeze({ id: '965220d5-5bb9-42cf-8d67-9b146df2a5a4', name: 'build' }),
  Object.freeze({ id: 'c2aa639c-3ccc-4740-b3b6-ce2a1e1d984e', name: 'test' }),
  Object.freeze({ id: '1d4f49f9-02b9-4e26-b826-2cdb6195f2a9', name: 'work' }),
  Object.freeze({
    id: 'e4c27205-9d23-4c98-b958-d798bc3f9cd4',
    name: 'testplan',
  }),
  Object.freeze({ id: 'bf7d82a0-8aa5-4613-94ef-6172a5ea01f3', name: 'wiki' }),
  Object.freeze({
    id: 'c83eaf52-edf3-4034-ae11-17d38f25404c',
    name: 'testresults',
  }),
  Object.freeze({ id: 'ea48a0a1-269c-42d8-b8ad-ddc8fcdcf578', name: 'search' }),
  Object.freeze({ id: '8a3d49b8-91f0-46ef-b33d-dda338c25db3', name: 'ims' }),
  Object.freeze({
    id: '8ccfef3d-2b87-4e99-8ccb-66e343d2daa8',
    name: 'profile',
  }),
]);

/**
 * Authoritative server/cloud profile matrix covering Azure DevOps Server 2019 RTM (5.0),
 * Server 2020 (6.0), Server 2022 (7.0), and Azure DevOps Services (7.1 GA / 7.2-preview).
 */
export const PROFILES = Object.freeze({
  'server-2019-rtm': Object.freeze({
    name: 'server-2019-rtm',
    label: 'Azure DevOps Server 2019 RTM',
    deploymentType: 'server',
    connectionDeploymentType: 'onPremises',
    maxApiVersion: '5.0',
    maxGaVersion: '5.0',
    maxPreviewVersion: '5.0-preview',
    maxMajorMinor: Object.freeze([5, 0]),
    maxPreviewMajorMinor: Object.freeze([5, 0]),
    analyticsEnabled: false,
    odataVersions: Object.freeze(['v1.0', 'v2.0', 'v3.0-preview']),
    supportsWitCommentsCrud: false,
    supportsWitCommentMarkdown: false,
    witCommentsResourceVersion: 2,
    supportsBuildStages: false,
    buildStagesPreviewOnly: false,
    supportsPipelinesApi: false,
    pipelinesPreviewOnly: false,
    supportsWikiPagesBatch: false,
    wikiPagesBatchPreviewOnly: false,
    supportsTestPlanApi: false,
    testPlanPreviewOnly: false,
    supportsTestResultsApi: false,
    supportsExpandIdentity: false,
    supportsRefsTopContinuation: false,
    searchPreviewOnly: true,
    searchVersion: '5.0-preview.1',
    iterationWorkItemsPreviewOnly: true,
    allTeamsPreviewOnly: true,
    allTeamsResourceVersion: 2,
    policyPreviewOnly: true,
    locationPreviewOnly: true,
    containerPreviewOnly: true,
  }),
  'server-2020': Object.freeze({
    name: 'server-2020',
    label: 'Azure DevOps Server 2020',
    deploymentType: 'server',
    connectionDeploymentType: 'onPremises',
    maxApiVersion: '6.0',
    maxGaVersion: '6.0',
    maxPreviewVersion: '6.0-preview',
    maxMajorMinor: Object.freeze([6, 0]),
    maxPreviewMajorMinor: Object.freeze([6, 0]),
    analyticsEnabled: true,
    odataVersions: Object.freeze(['v1.0', 'v2.0', 'v3.0-preview']),
    supportsWitCommentsCrud: true,
    supportsWitCommentMarkdown: false,
    witCommentsResourceVersion: 3,
    supportsBuildStages: true,
    buildStagesPreviewOnly: true,
    supportsPipelinesApi: true,
    pipelinesPreviewOnly: true,
    supportsWikiPagesBatch: true,
    wikiPagesBatchPreviewOnly: true,
    supportsTestPlanApi: true,
    testPlanPreviewOnly: true,
    supportsTestResultsApi: false,
    supportsExpandIdentity: true,
    supportsRefsTopContinuation: true,
    searchPreviewOnly: true,
    searchVersion: '6.0-preview.1',
    iterationWorkItemsPreviewOnly: true,
    allTeamsPreviewOnly: true,
    allTeamsResourceVersion: 3,
    policyPreviewOnly: true,
    locationPreviewOnly: true,
    containerPreviewOnly: true,
  }),
  'server-2022': Object.freeze({
    name: 'server-2022',
    label: 'Azure DevOps Server 2022',
    deploymentType: 'server',
    connectionDeploymentType: 'onPremises',
    maxApiVersion: '7.0',
    maxGaVersion: '7.0',
    maxPreviewVersion: '7.0-preview',
    maxMajorMinor: Object.freeze([7, 0]),
    maxPreviewMajorMinor: Object.freeze([7, 0]),
    analyticsEnabled: true,
    odataVersions: Object.freeze([
      'v1.0',
      'v2.0',
      'v3.0-preview',
      'v4.0-preview',
    ]),
    supportsWitCommentsCrud: true,
    supportsWitCommentMarkdown: false,
    witCommentsResourceVersion: 3,
    supportsBuildStages: true,
    buildStagesPreviewOnly: false,
    supportsPipelinesApi: true,
    pipelinesPreviewOnly: false,
    supportsWikiPagesBatch: true,
    wikiPagesBatchPreviewOnly: false,
    supportsTestPlanApi: true,
    testPlanPreviewOnly: false,
    supportsTestResultsApi: false,
    supportsExpandIdentity: true,
    supportsRefsTopContinuation: true,
    searchPreviewOnly: false,
    searchVersion: '7.0',
    iterationWorkItemsPreviewOnly: false,
    allTeamsPreviewOnly: true,
    allTeamsResourceVersion: 3,
    policyPreviewOnly: true,
    locationPreviewOnly: true,
    containerPreviewOnly: true,
  }),
  services: Object.freeze({
    name: 'services',
    label: 'Azure DevOps Services',
    deploymentType: 'services',
    connectionDeploymentType: 'hosted',
    maxApiVersion: '7.1',
    maxGaVersion: '7.1',
    maxPreviewVersion: '7.2-preview',
    maxMajorMinor: Object.freeze([7, 1]),
    maxPreviewMajorMinor: Object.freeze([7, 2]),
    analyticsEnabled: true,
    odataVersions: Object.freeze([
      'v1.0',
      'v2.0',
      'v3.0-preview',
      'v4.0-preview',
    ]),
    supportsWitCommentsCrud: true,
    supportsWitCommentMarkdown: true,
    witCommentsResourceVersion: 4,
    supportsBuildStages: true,
    buildStagesPreviewOnly: false,
    supportsPipelinesApi: true,
    pipelinesPreviewOnly: false,
    supportsWikiPagesBatch: true,
    wikiPagesBatchPreviewOnly: false,
    supportsTestPlanApi: true,
    testPlanPreviewOnly: false,
    supportsTestResultsApi: true,
    supportsExpandIdentity: true,
    supportsRefsTopContinuation: true,
    searchPreviewOnly: false,
    searchVersion: '7.1',
    iterationWorkItemsPreviewOnly: false,
    allTeamsPreviewOnly: true,
    allTeamsResourceVersion: 3,
    policyPreviewOnly: true,
    locationPreviewOnly: true,
    containerPreviewOnly: true,
  }),
});

export const PROFILE_NAMES = Object.freeze(Object.keys(PROFILES));

/**
 * Look up a declarative profile by name (or pass through an existing profile object).
 *
 * @param {string | typeof PROFILES[keyof typeof PROFILES]} name
 * @returns {typeof PROFILES[keyof typeof PROFILES]}
 */
export function getProfile(name) {
  if (
    name &&
    typeof name === 'object' &&
    typeof name.name === 'string' &&
    Object.hasOwn(PROFILES, name.name)
  ) {
    return PROFILES[name.name];
  }
  if (typeof name === 'string' && Object.hasOwn(PROFILES, name)) {
    return PROFILES[name];
  }
  throw new Error(
    `Unknown mock ADO profile "${String(name)}". Expected one of: ${PROFILE_NAMES.join(', ')}`,
  );
}

/**
 * Build an authentic GET /_apis/ResourceAreas response payload for the given profile.
 * On-prem profiles return `{ count: 0, value: null }` so WebApi falls back to serverUrl;
 * Services returns the complete area registry pointing at `baseUrl`.
 *
 * @param {string | object} profileInput
 * @param {string} baseUrl
 * @returns {{ count: number, value: Array<{ id: string, name: string, locationUrl: string }> | null }}
 */
export function buildResourceAreasResponse(profileInput, baseUrl) {
  const profile = getProfile(profileInput);
  if (profile.deploymentType === 'server') {
    return { count: 0, value: null };
  }
  const cleanBase = String(baseUrl || '').replace(/\/+$/, '');
  const value = RESOURCE_AREAS.map((area) => ({
    id: area.id,
    name: area.name,
    locationUrl: cleanBase,
  }));
  return { count: value.length, value };
}

/**
 * Build a VsoClient-compliant ApiResourceLocation entry.
 * For GA endpoints, `releasedVersion === maxVersion` (exact string equality required by VsoClient.js).
 * For preview-only endpoints, `releasedVersion === '0.0'`.
 */
function loc(
  id,
  area,
  resourceName,
  routeTemplate,
  resourceVersion,
  maxVersion,
  isPreviewOnly,
  minVersion = '1.0',
) {
  return {
    id,
    area,
    resourceName,
    routeTemplate,
    resourceVersion,
    minVersion,
    maxVersion,
    releasedVersion: isPreviewOnly ? '0.0' : maxVersion,
  };
}

/**
 * Generate the full (or area-filtered) `OPTIONS /_apis/{area}` ApiResourceLocation catalog
 * for the given server/services profile.
 *
 * @param {string | object} profileInput
 * @param {string} [baseUrl]
 * @param {string} [area] Case-insensitive area name filter (e.g. 'Location', 'Test', 'wit')
 * @returns {{ count: number, value: Array<object> }}
 */
export function buildOptionsCatalog(profileInput, baseUrl = '', area) {
  const profile = getProfile(profileInput);
  const v = profile.maxGaVersion; // '5.0' | '6.0' | '7.0' | '7.1'
  void baseUrl; // VsoClient joins baseUrl + basePath + relative routeTemplate

  /** @type {Array<object>} */
  const locations = [
    // --- Location ---
    loc(
      '00d9565f-ed9c-4a06-9a50-00e7896ccab4',
      'Location',
      'ConnectionData',
      '_apis/connectionData',
      1,
      v,
      profile.locationPreviewOnly,
    ),
    loc(
      'e81700f7-3be2-46de-8624-2eb35882fcaa',
      'Location',
      'ResourceAreas',
      '_apis/ResourceAreas/{areaId}',
      1,
      v,
      profile.locationPreviewOnly,
    ),

    // --- core ---
    loc(
      '603fe2ac-9723-48b9-88ad-09305aa6c6e1',
      'core',
      'projects',
      '_apis/projects/{projectId}',
      4,
      v,
      false,
    ),
    loc(
      '4976a71a-4487-49aa-8aab-a1eda469037a',
      'core',
      'properties',
      '_apis/projects/{projectId}/properties',
      1,
      v,
      false,
    ),
    loc(
      'd30a3dd1-f8ba-442a-b86a-bd0c0c383e59',
      'core',
      'teams',
      '_apis/projects/{projectId}/teams/{teamId}',
      3,
      v,
      false,
    ),
    loc(
      '7a4d9ee9-3433-4347-b47a-7a80f1cf307e',
      'core',
      'teams',
      '_apis/teams',
      profile.allTeamsResourceVersion,
      v,
      profile.allTeamsPreviewOnly,
    ),
    loc(
      '294c494c-2600-4d7e-b76c-3dd50c3c95be',
      'core',
      'members',
      '_apis/projects/{projectId}/teams/{teamId}/members',
      2,
      v,
      false,
    ),

    // --- ims (Identities) ---
    loc(
      '28010c54-d0c0-4c89-a5b0-1c9e188b9fb7',
      'ims',
      'identities',
      '_apis/identities',
      1,
      v,
      false,
    ),

    // --- wit (Work Item Tracking) ---
    loc(
      '72c7ddf8-2cdc-4f60-90cd-ab71c14a399b',
      'wit',
      'workItems',
      '{project}/_apis/wit/workItems/{id}',
      3,
      v,
      false,
    ),
    loc(
      '62d3d110-0047-428c-ad3c-4fe872c91c74',
      'wit',
      'workItems',
      '{project}/_apis/wit/workItems/${type}',
      3,
      v,
      false,
    ),
    loc(
      '908509b6-4248-4475-a1cd-829139ba419f',
      'wit',
      'workItemsBatch',
      '{project}/_apis/wit/workItemsBatch',
      1,
      v,
      false,
    ),
    loc(
      '1a9c53f7-f243-4447-b110-35ef023636e4',
      'wit',
      'wiql',
      '{project}/{team}/_apis/wit/wiql',
      2,
      v,
      false,
    ),
    loc(
      'a02355f5-5f8a-4671-8e32-369d23aac83d',
      'wit',
      'wiql',
      '{project}/{team}/_apis/wit/wiql/{id}',
      2,
      v,
      false,
    ),
    loc(
      'a00c85a5-80fa-4565-99c3-bcd2181434bb',
      'wit',
      'revisions',
      '{project}/_apis/wit/workItems/{id}/revisions/{revisionNumber}',
      3,
      v,
      false,
    ),
    loc(
      '7c8d7a76-4a09-43e8-b5df-bd792f4ac6aa',
      'wit',
      'workItemTypes',
      '{project}/_apis/wit/workItemTypes/{type}',
      2,
      v,
      false,
    ),
    loc(
      'bd293ce5-3d25-4192-8e67-e8092e879efb',
      'wit',
      'workItemTypesField',
      '{project}/_apis/wit/workItemTypes/{type}/fields/{field}',
      3,
      v,
      false,
    ),
    loc(
      'e07b5fa4-1499-494d-a496-64b860fd64ff',
      'wit',
      'attachments',
      '{project}/_apis/wit/attachments/{id}',
      3,
      v,
      false,
    ),
    loc(
      '5a172953-1b41-49d3-840a-33f79c3ce89f',
      'wit',
      'classificationNodes',
      '{project}/_apis/wit/classificationNodes/{structureGroup}/{*path}',
      2,
      v,
      false,
    ),
    loc(
      'a70579d1-f53a-48ee-a5be-7be8659023b9',
      'wit',
      'classificationNodes',
      '{project}/_apis/wit/classificationNodes',
      2,
      v,
      false,
    ),

    // --- git ---
    loc(
      '225f7195-f9c7-4d14-ab28-a83f7ff77e1f',
      'git',
      'repositories',
      '{project}/_apis/git/repositories/{repositoryId}',
      2,
      v,
      false,
    ),
    loc(
      'd5b216de-d8d5-4d32-ae76-51df755b16d3',
      'git',
      'stats',
      '{project}/_apis/git/repositories/{repositoryId}/stats/branches',
      2,
      v,
      false,
    ),
    loc(
      '2d874a60-a811-4f62-9c9f-963a6ea0a55b',
      'git',
      'refs',
      '{project}/_apis/git/repositories/{repositoryId}/refs',
      2,
      v,
      false,
    ),
    loc(
      'fb93c0db-47ed-4a31-8c20-47552878fb44',
      'git',
      'items',
      '{project}/_apis/git/repositories/{repositoryId}/items',
      1,
      v,
      false,
    ),
    loc(
      '7b28e929-2c99-405d-9c5c-6167a06e6816',
      'git',
      'blobs',
      '{project}/_apis/git/repositories/{repositoryId}/blobs/{sha1}',
      1,
      v,
      false,
    ),
    loc(
      'c2570c3b-5b3f-41b8-98bf-5407bfde8d58',
      'git',
      'commits',
      '{project}/_apis/git/repositories/{repositoryId}/commits/{commitId}',
      2,
      v,
      false,
    ),
    loc(
      '5bf884f5-3e07-42e9-afb8-1b872267bf16',
      'git',
      'changes',
      '{project}/_apis/git/repositories/{repositoryId}/commits/{commitId}/changes',
      1,
      v,
      false,
    ),
    loc(
      'ea98d07b-3c87-4971-8ede-a613694ffb55',
      'git',
      'pushes',
      '{project}/_apis/git/repositories/{repositoryId}/pushes/{pushId}',
      3,
      v,
      false,
    ),
    loc(
      '01a46dea-7d46-4d40-bc84-319e7c260d99',
      'git',
      'pullRequests',
      '{project}/_apis/git/pullrequests/{pullRequestId}',
      2,
      v,
      false,
    ),
    loc(
      '9946fd70-0d40-406e-b686-b4744cbbcc37',
      'git',
      'pullRequests',
      '{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}',
      2,
      v,
      false,
    ),
    loc(
      'd43911ee-6958-46b0-a42b-8445b8a0d004',
      'git',
      'iterations',
      '{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}/iterations/{iterationId}',
      2,
      v,
      false,
    ),
    loc(
      '4216bdcf-b6b1-4d59-8b82-c34cc183fc8b',
      'git',
      'iterationChanges',
      '{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}/iterations/{iterationId}/changes',
      1,
      v,
      false,
    ),
    loc(
      'b5f6bb4f-8d1e-4d79-8d11-4c9172c99c35',
      'git',
      'statuses',
      '{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}/statuses/{statusId}',
      2,
      v,
      false,
    ),
    loc(
      'ab6e2e5d-a0b7-4153-b64a-a4efe0d49449',
      'git',
      'threads',
      '{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}/threads/{threadId}',
      1,
      v,
      false,
    ),
    loc(
      '965a3ec7-5ed8-455a-bdcb-835a5ea7fe7b',
      'git',
      'comments',
      '{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}/threads/{threadId}/comments/{commentId}',
      1,
      v,
      false,
    ),
    loc(
      'f22387e3-984e-4c52-9c6d-fbb8f14c812d',
      'git',
      'labels',
      '{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}/labels/{labelIdOrName}',
      1,
      v,
      false,
    ),
    loc(
      '4b6702c7-aa35-4b89-9c96-b9abf6d3e540',
      'git',
      'reviewers',
      '{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}/reviewers/{reviewerId}',
      1,
      v,
      false,
    ),

    // --- policy ---
    loc(
      'c23ddff5-229c-4d04-a80b-0fdce9f360c8',
      'policy',
      'evaluations',
      '{project}/_apis/policy/evaluations/{evaluationId}',
      1,
      v,
      profile.policyPreviewOnly,
    ),

    // --- build ---
    loc(
      '0cd358e1-9217-4d94-8269-1c1ee6f93dcf',
      'build',
      'builds',
      '{project}/_apis/build/builds/{buildId}',
      7,
      v,
      false,
    ),
    loc(
      'dbeaf647-6167-421a-bda9-c9327b25e2e6',
      'build',
      'definitions',
      '{project}/_apis/build/definitions/{definitionId}',
      7,
      v,
      false,
    ),
    loc(
      '1db06c96-014e-44e1-ac91-90b2d4b3e984',
      'build',
      'artifacts',
      '{project}/_apis/build/builds/{buildId}/artifacts',
      5,
      v,
      false,
    ),
    loc(
      '35a80daf-7f30-45fc-86e8-6b813d9c90df',
      'build',
      'logs',
      '{project}/_apis/build/builds/{buildId}/logs/{logId}',
      2,
      v,
      false,
    ),
    loc(
      '8baac422-4c6e-4de5-8532-db96d92acffa',
      'build',
      'timeline',
      '{project}/_apis/build/builds/{buildId}/timeline/{timelineId}',
      3,
      v,
      false,
    ),

    // --- Container ---
    loc(
      'e4f5c81e-e250-447b-9fef-bd48471bea5e',
      'Container',
      'Containers',
      '_apis/resources/Containers/{containerId}/{*itemPath}',
      4,
      v,
      profile.containerPreviewOnly,
    ),

    // --- Test ---
    loc(
      'cadb3810-d47d-4a3c-a234-fe5f3be50138',
      'Test',
      'runs',
      '{project}/_apis/test/runs/{runId}',
      3,
      v,
      false,
    ),
    loc(
      '4637d869-3a76-4468-8057-0bb02aa385cf',
      'Test',
      'results',
      '{project}/_apis/test/Runs/{runId}/results/{testCaseResultId}',
      6,
      v,
      false,
    ),

    // --- work ---
    loc(
      'c9175577-28a1-4b06-9197-8636af9f64ad',
      'work',
      'iterations',
      '{project}/{team}/_apis/work/teamsettings/iterations/{id}',
      1,
      v,
      false,
    ),
    loc(
      'c3c1012b-bea7-49d7-b45e-1664e566f84c',
      'work',
      'teamsettings',
      '{project}/{team}/_apis/work/teamsettings',
      1,
      v,
      false,
    ),
    loc(
      '07ced576-58ed-49e6-9c1e-5cb53ab8bf2a',
      'work',
      'teamfieldvalues',
      '{project}/{team}/_apis/work/teamsettings/teamfieldvalues',
      1,
      v,
      false,
    ),
    loc(
      '5b3ef1a6-d3ab-44cd-bafd-c7f45db850fa',
      'work',
      'workitems',
      '{project}/{team}/_apis/work/teamsettings/iterations/{iterationId}/workitems',
      1,
      v,
      profile.iterationWorkItemsPreviewOnly,
    ),

    // --- wiki (base) ---
    loc(
      '288d122c-dbd4-451d-aa5f-7dbbba070728',
      'wiki',
      'wikis',
      '{project}/_apis/wiki/wikis/{wikiIdentifier}',
      2,
      v,
      false,
    ),
    loc(
      '25d3fbc7-fe3d-46cb-b5a5-0b6f79caf27b',
      'wiki',
      'pages',
      '{project}/_apis/wiki/wikis/{wikiIdentifier}/pages',
      1,
      v,
      false,
    ),

    // --- search ---
    loc(
      'e7f29993-5b82-4fca-9386-f5cfe683d524',
      'search',
      'codeSearchResults',
      '{project}/_apis/search/codesearchresults',
      1,
      v,
      profile.searchPreviewOnly,
    ),
    loc(
      'e90e7664-7049-4100-9a86-66b161d81080',
      'search',
      'wikiSearchResults',
      '{project}/_apis/search/wikisearchresults',
      1,
      v,
      profile.searchPreviewOnly,
    ),
    loc(
      '73b2c9e2-ff9e-4447-8cda-5f5b21ff7cae',
      'search',
      'workItemSearchResults',
      '{project}/_apis/search/workitemsearchresults',
      1,
      v,
      profile.searchPreviewOnly,
    ),
  ];

  // --- Profile-conditional locations ---

  // WIT comments: legacy read-only loc on Server 2019 RTM vs CRUD loc on 2020/2022/Services
  if (profile.supportsWitCommentsCrud) {
    const commentsMax = profile.name === 'services' ? '7.2' : v;
    locations.push(
      loc(
        '608aac0a-32e1-4493-a863-b9cf4566d257',
        'wit',
        'comments',
        '{project}/_apis/wit/workItems/{workItemId}/comments/{commentId}',
        profile.witCommentsResourceVersion,
        commentsMax,
        true, // Preview-only across ALL versions (never graduated to GA!)
        '5.1',
      ),
    );
  } else {
    // Server 2019 RTM (5.0): legacy read-only comments location ONLY
    locations.push(
      loc(
        '19335ae7-22f7-4308-93d8-261f9384b7cf',
        'wit',
        'comments',
        '{project}/_apis/wit/workItems/{id}/comments/{revision}',
        2,
        '5.0',
        true,
        '3.0',
      ),
    );
  }

  // Build stages (added in Server 2020)
  if (profile.supportsBuildStages) {
    locations.push(
      loc(
        'b8aac6c9-744b-46e1-88fc-3550969f9313',
        'build',
        'stages',
        '{project}/_apis/build/builds/{buildId}/stages/{stageRefName}',
        1,
        v,
        profile.buildStagesPreviewOnly,
        '6.0',
      ),
    );
  }

  // Pipelines API (added in Server 2020)
  if (profile.supportsPipelinesApi) {
    locations.push(
      loc(
        '28e1305e-2afe-47bf-abaf-cbb0e6a91988',
        'pipelines',
        'pipelines',
        '{project}/_apis/pipelines/{pipelineId}',
        1,
        v,
        profile.pipelinesPreviewOnly,
        '6.0',
      ),
      loc(
        '7859261e-d2e9-4a68-b820-a5d84cc5bb3d',
        'pipelines',
        'runs',
        '{project}/_apis/pipelines/{pipelineId}/runs/{runId}',
        1,
        v,
        profile.pipelinesPreviewOnly,
        '6.0',
      ),
      loc(
        '85023071-bd5e-4438-89b0-2a5bf362a19d',
        'pipelines',
        'artifacts',
        '{project}/_apis/pipelines/{pipelineId}/runs/{runId}/artifacts',
        1,
        v,
        profile.pipelinesPreviewOnly,
        '6.0',
      ),
    );
  }

  // Wiki pagesbatch (added in Server 2020)
  if (profile.supportsWikiPagesBatch) {
    locations.push(
      loc(
        '32e4214e-09a0-4673-a10d-619091005a33',
        'wiki',
        'pagesBatch',
        '{project}/_apis/wiki/wikis/{wikiIdentifier}/pagesbatch',
        1,
        v,
        profile.wikiPagesBatchPreviewOnly,
        '6.0',
      ),
    );
  }

  // TestPlan API (added in Server 2020)
  if (profile.supportsTestPlanApi) {
    locations.push(
      loc(
        '0e292477-a0c2-47f3-a9b6-34f153d627f4',
        'testplan',
        'plans',
        '{project}/_apis/testplan/plans/{planId}',
        1,
        v,
        profile.testPlanPreviewOnly,
        '6.0',
      ),
      loc(
        '1046d5d3-ab61-4ca7-a65a-36118a978256',
        'testplan',
        'suites',
        '{project}/_apis/testplan/Plans/{planId}/suites/{suiteId}',
        1,
        v,
        profile.testPlanPreviewOnly,
        '6.0',
      ),
      loc(
        'a9bd61ac-45cf-4d13-9441-43dcd01edf8d',
        'testplan',
        'TestCase',
        '{project}/_apis/testplan/Plans/{planId}/Suites/{suiteId}/TestCase/{testCaseIds}',
        3,
        v,
        profile.testPlanPreviewOnly,
        '6.0',
      ),
    );
  }

  // TestResults API (Cloud Services preview)
  if (profile.supportsTestResultsApi) {
    locations.push(
      loc(
        'a518c749-4524-45b2-a7ef-1ac009b312cd',
        'testresults',
        'resultdetailsbybuild',
        '{project}/_apis/testresults/resultdetailsbybuild',
        1,
        '7.2',
        true,
        '6.0',
      ),
    );
  }

  const filtered =
    typeof area === 'string' && area.trim().length > 0
      ? locations.filter(
          (entry) => entry.area.toLowerCase() === area.trim().toLowerCase(),
        )
      : locations;

  return { count: filtered.length, value: filtered };
}

/**
 * Entity sets available at each Azure DevOps Analytics OData version.
 */
export const ODATA_ENTITY_SETS_BY_VERSION = Object.freeze({
  'v1.0': Object.freeze([
    { name: 'WorkItems', type: 'WorkItem' },
    { name: 'WorkItemRevisions', type: 'WorkItemRevision' },
    { name: 'WorkItemSnapshot', type: 'WorkItemSnapshot' },
    { name: 'WorkItemBoardSnapshot', type: 'WorkItemBoardSnapshot' },
    { name: 'WorkItemLinks', type: 'WorkItemLink' },
    { name: 'Areas', type: 'Area' },
    { name: 'Iterations', type: 'Iteration' },
    { name: 'BoardLocations', type: 'BoardLocation' },
    { name: 'Dates', type: 'CalendarDate' },
    { name: 'Tags', type: 'Tag' },
    { name: 'Teams', type: 'Team' },
    { name: 'Users', type: 'User' },
  ]),
  'v2.0': Object.freeze([
    { name: 'WorkItems', type: 'WorkItem' },
    { name: 'WorkItemRevisions', type: 'WorkItemRevision' },
    { name: 'WorkItemSnapshot', type: 'WorkItemSnapshot' },
    { name: 'WorkItemBoardSnapshot', type: 'WorkItemBoardSnapshot' },
    { name: 'WorkItemLinks', type: 'WorkItemLink' },
    { name: 'Areas', type: 'Area' },
    { name: 'Iterations', type: 'Iteration' },
    { name: 'BoardLocations', type: 'BoardLocation' },
    { name: 'Dates', type: 'CalendarDate' },
    { name: 'Tags', type: 'Tag' },
    { name: 'Teams', type: 'Team' },
    { name: 'Users', type: 'User' },
    { name: 'Processes', type: 'Process' },
  ]),
  'v3.0-preview': Object.freeze([
    { name: 'WorkItems', type: 'WorkItem' },
    { name: 'WorkItemRevisions', type: 'WorkItemRevision' },
    { name: 'WorkItemSnapshot', type: 'WorkItemSnapshot' },
    { name: 'WorkItemBoardSnapshot', type: 'WorkItemBoardSnapshot' },
    { name: 'WorkItemLinks', type: 'WorkItemLink' },
    { name: 'Areas', type: 'Area' },
    { name: 'Iterations', type: 'Iteration' },
    { name: 'BoardLocations', type: 'BoardLocation' },
    { name: 'Dates', type: 'CalendarDate' },
    { name: 'Tags', type: 'Tag' },
    { name: 'Teams', type: 'Team' },
    { name: 'Users', type: 'User' },
    { name: 'Processes', type: 'Process' },
    { name: 'Pipelines', type: 'Pipeline' },
    { name: 'PipelineRuns', type: 'PipelineRun' },
    { name: 'PipelineJobs', type: 'PipelineJob' },
    { name: 'PipelineRunActivityResults', type: 'PipelineRunActivityResult' },
    { name: 'PipelineTasks', type: 'PipelineTask' },
    { name: 'Branches', type: 'Branch' },
    { name: 'TestRuns', type: 'TestRun' },
    { name: 'TestResults', type: 'TestResult' },
    { name: 'TestResultsDaily', type: 'TestResultDaily' },
    { name: 'Tests', type: 'Test' },
    { name: 'TestPoints', type: 'TestPoint' },
    { name: 'TestPointHistorySnapshots', type: 'TestPointHistorySnapshot' },
    { name: 'TestSuites', type: 'TestSuite' },
    { name: 'TestConfigurations', type: 'TestConfiguration' },
  ]),
  'v4.0-preview': Object.freeze([
    { name: 'WorkItems', type: 'WorkItem' },
    { name: 'WorkItemRevisions', type: 'WorkItemRevision' },
    { name: 'WorkItemSnapshot', type: 'WorkItemSnapshot' },
    { name: 'WorkItemBoardSnapshot', type: 'WorkItemBoardSnapshot' },
    { name: 'WorkItemLinks', type: 'WorkItemLink' },
    { name: 'Areas', type: 'Area' },
    { name: 'Iterations', type: 'Iteration' },
    { name: 'BoardLocations', type: 'BoardLocation' },
    { name: 'Dates', type: 'CalendarDate' },
    { name: 'Tags', type: 'Tag' },
    { name: 'Teams', type: 'Team' },
    { name: 'Users', type: 'User' },
    { name: 'Processes', type: 'Process' },
    { name: 'Pipelines', type: 'Pipeline' },
    { name: 'PipelineRuns', type: 'PipelineRun' },
    { name: 'PipelineJobs', type: 'PipelineJob' },
    { name: 'PipelineRunActivityResults', type: 'PipelineRunActivityResult' },
    { name: 'PipelineTasks', type: 'PipelineTask' },
    { name: 'Branches', type: 'Branch' },
    { name: 'TestRuns', type: 'TestRun' },
    { name: 'TestResults', type: 'TestResult' },
    { name: 'TestResultsDaily', type: 'TestResultDaily' },
    { name: 'Tests', type: 'Test' },
    { name: 'TestPoints', type: 'TestPoint' },
    { name: 'TestPointHistorySnapshots', type: 'TestPointHistorySnapshot' },
    { name: 'TestSuites', type: 'TestSuite' },
    { name: 'TestConfigurations', type: 'TestConfiguration' },
    {
      name: 'ParallelPipelineJobsSnapshot',
      type: 'ParallelPipelineJobsSnapshot',
    },
    { name: 'TaskAgentPoolSizeSnapshots', type: 'TaskAgentPoolSizeSnapshot' },
    { name: 'TaskAgentRequestSnapshots', type: 'TaskAgentRequestSnapshot' },
  ]),
});

const ODATA_ENTITY_TYPES = {
  WorkItem: {
    key: 'WorkItemId',
    properties: [
      ['WorkItemId', 'Edm.Int32', false],
      ['Title', 'Edm.String', true],
      ['WorkItemType', 'Edm.String', true],
      ['State', 'Edm.String', true],
      ['StateCategory', 'Edm.String', true],
      ['Priority', 'Edm.Int32', true],
      ['Severity', 'Edm.String', true],
      ['StoryPoints', 'Edm.Double', true],
      ['Effort', 'Edm.Double', true],
      ['RemainingWork', 'Edm.Double', true],
      ['CompletedWork', 'Edm.Double', true],
      ['LeadTimeDays', 'Edm.Double', true],
      ['CycleTimeDays', 'Edm.Double', true],
      ['CreatedDate', 'Edm.DateTimeOffset', true],
      ['ChangedDate', 'Edm.DateTimeOffset', true],
      ['CompletedDate', 'Edm.DateTimeOffset', true],
      ['CompletedDateSK', 'Edm.Int32', true],
      ['InProgressDate', 'Edm.DateTimeOffset', true],
      ['TagNames', 'Edm.String', true],
      ['Custom_Team', 'Edm.String', true],
      ['Custom_RiskScore', 'Edm.Int32', true],
    ],
    navs: [
      ['Area', 'Microsoft.VisualStudio.Services.Analytics.Model.Area'],
      [
        'Iteration',
        'Microsoft.VisualStudio.Services.Analytics.Model.Iteration',
      ],
      ['AssignedTo', 'Microsoft.VisualStudio.Services.Analytics.Model.User'],
      ['CreatedBy', 'Microsoft.VisualStudio.Services.Analytics.Model.User'],
      ['ChangedBy', 'Microsoft.VisualStudio.Services.Analytics.Model.User'],
      ['Parent', 'Microsoft.VisualStudio.Services.Analytics.Model.WorkItem'],
      [
        'Children',
        'Collection(Microsoft.VisualStudio.Services.Analytics.Model.WorkItem)',
      ],
      [
        'Tags',
        'Collection(Microsoft.VisualStudio.Services.Analytics.Model.Tag)',
      ],
      [
        'Teams',
        'Collection(Microsoft.VisualStudio.Services.Analytics.Model.Team)',
      ],
    ],
  },
  WorkItemRevision: {
    key: 'WorkItemRevisionSK',
    properties: [
      ['WorkItemRevisionSK', 'Edm.Int32', false],
      ['WorkItemId', 'Edm.Int32', false],
      ['Revision', 'Edm.Int32', false],
      ['Title', 'Edm.String', true],
      ['State', 'Edm.String', true],
      ['RevisedDateSK', 'Edm.Int32', true],
      ['ChangedDate', 'Edm.DateTimeOffset', true],
    ],
    navs: [['Area', 'Microsoft.VisualStudio.Services.Analytics.Model.Area']],
  },
  WorkItemSnapshot: {
    key: 'DateSK',
    properties: [
      ['DateSK', 'Edm.Int32', false],
      ['DateValue', 'Edm.DateTimeOffset', true],
      ['WorkItemId', 'Edm.Int32', false],
      ['WorkItemType', 'Edm.String', true],
      ['State', 'Edm.String', true],
      ['StateCategory', 'Edm.String', true],
      ['StoryPoints', 'Edm.Double', true],
      ['RemainingWork', 'Edm.Double', true],
    ],
    navs: [
      ['Area', 'Microsoft.VisualStudio.Services.Analytics.Model.Area'],
      [
        'Iteration',
        'Microsoft.VisualStudio.Services.Analytics.Model.Iteration',
      ],
    ],
  },
  WorkItemBoardSnapshot: {
    key: 'DateSK',
    properties: [
      ['DateSK', 'Edm.Int32', false],
      ['ColumnName', 'Edm.String', true],
      ['BoardName', 'Edm.String', true],
      ['Count', 'Edm.Int32', true],
    ],
    navs: [['Area', 'Microsoft.VisualStudio.Services.Analytics.Model.Area']],
  },
  WorkItemLink: {
    key: 'WorkItemLinkSK',
    properties: [
      ['WorkItemLinkSK', 'Edm.Int64', false],
      ['SourceWorkItemId', 'Edm.Int32', false],
      ['TargetWorkItemId', 'Edm.Int32', false],
      ['LinkTypeName', 'Edm.String', true],
    ],
    navs: [
      [
        'SourceWorkItem',
        'Microsoft.VisualStudio.Services.Analytics.Model.WorkItem',
      ],
      [
        'TargetWorkItem',
        'Microsoft.VisualStudio.Services.Analytics.Model.WorkItem',
      ],
    ],
  },
  Area: {
    key: 'AreaSK',
    properties: [
      ['AreaSK', 'Edm.Guid', false],
      ['AreaId', 'Edm.Guid', false],
      ['AreaName', 'Edm.String', true],
      ['AreaPath', 'Edm.String', true],
    ],
    navs: [],
  },
  Iteration: {
    key: 'IterationSK',
    properties: [
      ['IterationSK', 'Edm.Guid', false],
      ['IterationId', 'Edm.Guid', false],
      ['IterationName', 'Edm.String', true],
      ['IterationPath', 'Edm.String', true],
      ['StartDate', 'Edm.DateTimeOffset', true],
      ['EndDate', 'Edm.DateTimeOffset', true],
    ],
    navs: [],
  },
  BoardLocation: {
    key: 'BoardLocationSK',
    properties: [
      ['BoardLocationSK', 'Edm.Int32', false],
      ['BoardName', 'Edm.String', true],
      ['ColumnName', 'Edm.String', true],
    ],
    navs: [],
  },
  CalendarDate: {
    key: 'DateSK',
    properties: [
      ['DateSK', 'Edm.Int32', false],
      ['Date', 'Edm.DateTimeOffset', false],
      ['Year', 'Edm.Int32', false],
      ['MonthOfYear', 'Edm.Int32', false],
    ],
    navs: [],
  },
  Tag: {
    key: 'TagSK',
    properties: [
      ['TagSK', 'Edm.Guid', false],
      ['TagName', 'Edm.String', true],
    ],
    navs: [],
  },
  Team: {
    key: 'TeamSK',
    properties: [
      ['TeamSK', 'Edm.Guid', false],
      ['TeamId', 'Edm.Guid', false],
      ['TeamName', 'Edm.String', true],
    ],
    navs: [],
  },
  User: {
    key: 'UserSK',
    properties: [
      ['UserSK', 'Edm.Guid', false],
      ['UserId', 'Edm.Guid', true],
      ['UserName', 'Edm.String', true],
      ['UserEmail', 'Edm.String', true],
    ],
    navs: [],
  },
  Process: {
    key: 'ProcessSK',
    properties: [
      ['ProcessSK', 'Edm.Guid', false],
      ['WorkItemType', 'Edm.String', true],
      ['State', 'Edm.String', true],
      ['StateCategory', 'Edm.String', true],
    ],
    navs: [],
  },
  Pipeline: {
    key: 'PipelineSK',
    properties: [
      ['PipelineSK', 'Edm.Int32', false],
      ['PipelineId', 'Edm.Int32', false],
      ['PipelineName', 'Edm.String', true],
    ],
    navs: [],
  },
  PipelineRun: {
    key: 'PipelineRunSK',
    properties: [
      ['PipelineRunSK', 'Edm.Int32', false],
      ['PipelineRunId', 'Edm.Int32', false],
      ['PipelineId', 'Edm.Int32', false],
      ['RunNumber', 'Edm.String', true],
      ['SucceededCount', 'Edm.Int32', false],
      ['FailedCount', 'Edm.Int32', false],
      ['PartiallySucceededCount', 'Edm.Int32', false],
      ['CanceledCount', 'Edm.Int32', false],
      ['TotalDurationSeconds', 'Edm.Double', true],
      ['QueueDurationSeconds', 'Edm.Double', true],
      ['RunDurationSeconds', 'Edm.Double', true],
      ['CompletedDate', 'Edm.DateTimeOffset', true],
      ['CompletedDateSK', 'Edm.Int32', true],
    ],
    navs: [
      ['Pipeline', 'Microsoft.VisualStudio.Services.Analytics.Model.Pipeline'],
      ['Branch', 'Microsoft.VisualStudio.Services.Analytics.Model.Branch'],
      [
        'CompletedOn',
        'Microsoft.VisualStudio.Services.Analytics.Model.CalendarDate',
      ],
    ],
  },
  PipelineJob: {
    key: 'PipelineJobSK',
    properties: [
      ['PipelineJobSK', 'Edm.Int32', false],
      ['JobName', 'Edm.String', true],
      ['TotalDurationSeconds', 'Edm.Double', true],
    ],
    navs: [
      ['Pipeline', 'Microsoft.VisualStudio.Services.Analytics.Model.Pipeline'],
    ],
  },
  PipelineRunActivityResult: {
    key: 'PipelineRunActivityResultSK',
    properties: [
      ['PipelineRunActivityResultSK', 'Edm.Int64', false],
      ['TaskDurationSeconds', 'Edm.Double', true],
      ['Outcome', 'Edm.String', true],
    ],
    navs: [
      ['Pipeline', 'Microsoft.VisualStudio.Services.Analytics.Model.Pipeline'],
      ['Task', 'Microsoft.VisualStudio.Services.Analytics.Model.PipelineTask'],
    ],
  },
  PipelineTask: {
    key: 'PipelineTaskSK',
    properties: [
      ['PipelineTaskSK', 'Edm.Int32', false],
      ['TaskName', 'Edm.String', true],
    ],
    navs: [],
  },
  Branch: {
    key: 'BranchSK',
    properties: [
      ['BranchSK', 'Edm.Int32', false],
      ['BranchName', 'Edm.String', true],
      ['RepositoryId', 'Edm.String', true],
    ],
    navs: [],
  },
  TestRun: {
    key: 'TestRunSK',
    properties: [
      ['TestRunSK', 'Edm.Int32', false],
      ['TestRunId', 'Edm.Int32', false],
      ['Title', 'Edm.String', true],
      ['ResultCount', 'Edm.Int32', true],
      ['ResultPassCount', 'Edm.Int32', true],
      ['ResultFailCount', 'Edm.Int32', true],
    ],
    navs: [
      ['Pipeline', 'Microsoft.VisualStudio.Services.Analytics.Model.Pipeline'],
    ],
  },
  TestResult: {
    key: 'TestResultSK',
    properties: [
      ['TestResultSK', 'Edm.Int64', false],
      ['TestResultId', 'Edm.Int32', false],
      ['Outcome', 'Edm.String', true],
      ['DurationSeconds', 'Edm.Double', true],
      ['IsFlaky', 'Edm.Boolean', true],
    ],
    navs: [
      ['Test', 'Microsoft.VisualStudio.Services.Analytics.Model.Test'],
      ['TestRun', 'Microsoft.VisualStudio.Services.Analytics.Model.TestRun'],
    ],
  },
  TestResultDaily: {
    key: 'DateSK',
    properties: [
      ['DateSK', 'Edm.Int32', false],
      ['Workflow', 'Edm.String', true],
      ['ResultCount', 'Edm.Int32', false],
      ['ResultPassCount', 'Edm.Int32', false],
      ['ResultFailCount', 'Edm.Int32', false],
      ['ResultNotExecutedCount', 'Edm.Int32', false],
      ['ResultNotImpactedCount', 'Edm.Int32', false],
      ['ResultFlakyCount', 'Edm.Int32', false],
      ['DurationSeconds', 'Edm.Double', true],
    ],
    navs: [
      ['Test', 'Microsoft.VisualStudio.Services.Analytics.Model.Test'],
      ['Pipeline', 'Microsoft.VisualStudio.Services.Analytics.Model.Pipeline'],
      ['Branch', 'Microsoft.VisualStudio.Services.Analytics.Model.Branch'],
      ['Date', 'Microsoft.VisualStudio.Services.Analytics.Model.CalendarDate'],
    ],
  },
  Test: {
    key: 'TestSK',
    properties: [
      ['TestSK', 'Edm.Int32', false],
      ['TestName', 'Edm.String', true],
      ['FullyQualifiedTestName', 'Edm.String', true],
      ['ContainerName', 'Edm.String', true],
    ],
    navs: [],
  },
  TestPoint: {
    key: 'TestPointSK',
    properties: [
      ['TestPointSK', 'Edm.Int32', false],
      ['TestPointId', 'Edm.Int32', false],
      ['LastResultOutcome', 'Edm.String', true],
    ],
    navs: [
      [
        'TestSuite',
        'Microsoft.VisualStudio.Services.Analytics.Model.TestSuite',
      ],
      [
        'TestConfiguration',
        'Microsoft.VisualStudio.Services.Analytics.Model.TestConfiguration',
      ],
    ],
  },
  TestPointHistorySnapshot: {
    key: 'DateSK',
    properties: [
      ['DateSK', 'Edm.Int32', false],
      ['ResultOutcome', 'Edm.String', true],
      ['TotalCount', 'Edm.Int32', true],
    ],
    navs: [
      [
        'TestSuite',
        'Microsoft.VisualStudio.Services.Analytics.Model.TestSuite',
      ],
    ],
  },
  TestSuite: {
    key: 'TestSuiteSK',
    properties: [
      ['TestSuiteSK', 'Edm.Int32', false],
      ['TestSuiteId', 'Edm.Int32', false],
      ['Title', 'Edm.String', true],
    ],
    navs: [],
  },
  TestConfiguration: {
    key: 'TestConfigurationSK',
    properties: [
      ['TestConfigurationSK', 'Edm.Int32', false],
      ['TestConfigurationId', 'Edm.Int32', false],
      ['Name', 'Edm.String', true],
    ],
    navs: [],
  },
  ParallelPipelineJobsSnapshot: {
    key: 'DateSK',
    properties: [
      ['DateSK', 'Edm.Int32', false],
      ['AgentPoolName', 'Edm.String', true],
      ['ParallelJobCount', 'Edm.Int32', true],
    ],
    navs: [],
  },
  TaskAgentPoolSizeSnapshot: {
    key: 'DateSK',
    properties: [
      ['DateSK', 'Edm.Int32', false],
      ['PoolName', 'Edm.String', true],
      ['AgentCount', 'Edm.Int32', true],
    ],
    navs: [],
  },
  TaskAgentRequestSnapshot: {
    key: 'DateSK',
    properties: [
      ['DateSK', 'Edm.Int32', false],
      ['PoolName', 'Edm.String', true],
      ['QueuedCount', 'Edm.Int32', true],
      ['RunningCount', 'Edm.Int32', true],
    ],
    navs: [],
  },
};

/**
 * Generate an authentic OData v4 CSDL/EDMX XML document scoped to `profile` and `version`.
 *
 * @param {string | object} profileInput
 * @param {string} [version] e.g. 'v1.0', 'v2.0', 'v3.0-preview', 'v4.0-preview'
 * @returns {string}
 */
export function buildODataMetadataXml(profileInput, version) {
  const profile = getProfile(profileInput);
  const resolvedVersion =
    version || profile.odataVersions[profile.odataVersions.length - 1];
  const entitySets = Object.hasOwn(
    ODATA_ENTITY_SETS_BY_VERSION,
    resolvedVersion,
  )
    ? ODATA_ENTITY_SETS_BY_VERSION[resolvedVersion]
    : undefined;
  if (!entitySets) {
    throw new Error(
      `Unsupported OData version "${resolvedVersion}". Known versions: ${Object.keys(ODATA_ENTITY_SETS_BY_VERSION).join(', ')}`,
    );
  }

  const includedTypes = new Set(entitySets.map((es) => es.type));
  const entityTypeXml = [];

  for (const typeName of includedTypes) {
    const def = Object.hasOwn(ODATA_ENTITY_TYPES, typeName)
      ? ODATA_ENTITY_TYPES[typeName]
      : undefined;
    if (!def) {
      continue;
    }
    const propsXml = def.properties
      .map(
        ([name, edmType, nullable]) =>
          `        <Property Name="${name}" Type="${edmType}"${nullable ? '' : ' Nullable="false"'} />`,
      )
      .join('\n');
    const navsXml = def.navs
      .map(
        ([name, target]) =>
          `        <NavigationProperty Name="${name}" Type="${target}" />`,
      )
      .join('\n');
    entityTypeXml.push(
      `      <EntityType Name="${typeName}">\n` +
        `        <Key>\n` +
        `          <PropertyRef Name="${def.key}" />\n` +
        `        </Key>\n` +
        `${propsXml}` +
        (navsXml ? `\n${navsXml}` : '') +
        `\n      </EntityType>`,
    );
  }

  const entitySetsXml = entitySets
    .map(
      (es) =>
        `        <EntitySet Name="${es.name}" EntityType="Microsoft.VisualStudio.Services.Analytics.Model.${es.type}" />`,
    )
    .join('\n');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">',
    '  <edmx:DataServices>',
    '    <Schema Namespace="Microsoft.VisualStudio.Services.Analytics.Model" xmlns="http://docs.oasis-open.org/odata/ns/edm">',
    ...entityTypeXml,
    '      <EntityContainer Name="Analytics">',
    entitySetsXml,
    '      </EntityContainer>',
    '    </Schema>',
    '  </edmx:DataServices>',
    '</edmx:Edmx>',
  ].join('\n');
}

/**
 * Build an authentic Azure DevOps HTTP 400 VssVersionOutOfRangeException payload.
 *
 * @param {string} requestedVersion
 * @param {string} maxVersion
 * @returns {object}
 */
export function buildVssVersionOutOfRangeError(requestedVersion, maxVersion) {
  return {
    $id: '1',
    innerException: null,
    message: `The requested REST API version of ${requestedVersion} is out of range for this server. The latest REST API version this server supports is ${maxVersion}.`,
    typeName:
      'Microsoft.VisualStudio.Services.WebApi.VssVersionOutOfRangeException, Microsoft.VisualStudio.Services.WebApi',
    typeKey: 'VssVersionOutOfRangeException',
    errorCode: 0,
    eventId: 3000,
  };
}

/**
 * Build an authentic Azure DevOps HTTP 400 preview-version-required payload.
 *
 * @param {string} requestedVersion
 * @param {string} [hintVersion]
 * @returns {object}
 */
export function buildVssInvalidPreviewVersionError(
  requestedVersion,
  hintVersion,
) {
  const hint = hintVersion
    ? ` Please specify '${hintVersion}' (or include '-preview').`
    : " This API is in preview; please specify '-preview'.";
  return {
    $id: '1',
    innerException: null,
    message: `The requested REST API version of ${requestedVersion} is invalid.${hint}`,
    typeName:
      'Microsoft.VisualStudio.Services.WebApi.VssInvalidPreviewVersionException, Microsoft.VisualStudio.Services.WebApi',
    typeKey: 'VssInvalidPreviewVersionException',
    errorCode: 0,
    eventId: 3000,
  };
}

/**
 * Build an authentic Azure DevOps Analytics OData error payload.
 *
 * @param {string} code e.g. 'VS403483', 'VS403494', 'VS403522', 'VS403670'
 * @param {string} message
 * @returns {{ error: { code: string, message: string, innererror: { message: string, type: string } } }}
 */
export function buildODataError(code, message) {
  const normalizedCode = String(code);
  const fullMessage = message.includes(normalizedCode)
    ? message
    : `${normalizedCode}: ${message}`;
  return {
    error: {
      code: normalizedCode,
      message: fullMessage,
      innererror: {
        message: fullMessage,
        type: 'Microsoft.VisualStudio.Services.Analytics.OData.ODataException',
      },
    },
  };
}
