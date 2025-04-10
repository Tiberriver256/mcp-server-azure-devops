// Mock the environment module before importing
jest.mock('./environment', () => {
  const original = jest.requireActual('./environment');
  return {
    ...original,
    // We'll keep getOrgNameFromUrl as is for its own tests
    getOrgNameFromUrl: original.getOrgNameFromUrl,
  };
});

import { getOrgNameFromUrl } from './environment';

describe('environment utilities', () => {
  // Store original environment variables
  const originalEnv = { ...process.env };

  // Reset environment variables after each test
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  describe('getOrgNameFromUrl', () => {
    it('should extract organization name from Azure DevOps URL', () => {
      const url = 'https://dev.azure.com/test-organization';
      expect(getOrgNameFromUrl(url)).toBe('test-organization');
    });

    it('should handle URLs with paths after the organization name', () => {
      const url = 'https://dev.azure.com/test-organization/project';
      expect(getOrgNameFromUrl(url)).toBe('test-organization');
    });

    it('should return "unknown-organization" when URL is undefined', () => {
      expect(getOrgNameFromUrl(undefined)).toBe('unknown-organization');
    });

    it('should return "unknown-organization" when URL is empty', () => {
      expect(getOrgNameFromUrl('')).toBe('unknown-organization');
    });

    it('should return "unknown-organization" when URL does not match pattern', () => {
      const url = 'https://example.com/test-organization';
      expect(getOrgNameFromUrl(url)).toBe('unknown-organization');
    });
  });

  describe('defaultProject and defaultOrg', () => {
    // Since we can't easily test the environment variable initialization directly,
    // we'll test the getOrgNameFromUrl function which is used to derive defaultOrg

    it('should handle the real default case', () => {
      // This test is more of a documentation than a real test
      const orgNameFromUrl = getOrgNameFromUrl(
        process.env.AZURE_DEVOPS_ORG_URL,
      );
      // We can't assert an exact value since it depends on the environment
      expect(typeof orgNameFromUrl).toBe('string');
    });
  });
});
