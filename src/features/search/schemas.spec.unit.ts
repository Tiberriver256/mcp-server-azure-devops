import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SearchCodeSchema } from './schemas.ts';

void describe('search schemas', () => {
  const originalDefaultProject = process.env.AZURE_DEVOPS_DEFAULT_PROJECT;
  const originalOrgUrl = process.env.AZURE_DEVOPS_ORG_URL;

  afterEach(() => {
    if (originalDefaultProject === undefined) {
      delete process.env.AZURE_DEVOPS_DEFAULT_PROJECT;
    } else {
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT = originalDefaultProject;
    }
    if (originalOrgUrl === undefined) {
      delete process.env.AZURE_DEVOPS_ORG_URL;
    } else {
      process.env.AZURE_DEVOPS_ORG_URL = originalOrgUrl;
    }
  });

  void describe('SearchCodeSchema', () => {
    void it('does not inject a placeholder projectId when projectId is omitted and AZURE_DEVOPS_DEFAULT_PROJECT is unset', () => {
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT = '';

      const parsed = SearchCodeSchema.parse({
        searchText: 'hello',
      });

      assert.strictEqual(parsed.projectId, undefined);
    });

    void it('does not inject a placeholder organizationId when organizationId is omitted and AZURE_DEVOPS_ORG_URL is unset', () => {
      process.env.AZURE_DEVOPS_ORG_URL = '';

      const parsed = SearchCodeSchema.parse({
        searchText: 'hello',
      });

      assert.strictEqual(parsed.organizationId, undefined);
    });
  });
});
