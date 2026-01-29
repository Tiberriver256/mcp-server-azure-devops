describe('search schemas', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  describe('SearchCodeSchema', () => {
    it('does not inject a placeholder projectId when projectId is omitted and AZURE_DEVOPS_DEFAULT_PROJECT is unset', () => {
      process.env = {
        ...originalEnv,
        AZURE_DEVOPS_DEFAULT_PROJECT: '',
      };

      jest.resetModules();
      // `import('./schemas')` triggers TS2835 under `moduleResolution: Node16` (explicit extensions required).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SearchCodeSchema } = require('./schemas');

      const parsed = SearchCodeSchema.parse({
        searchText: 'hello',
      });

      expect(parsed.projectId).toBeUndefined();
    });

    it('does not inject a placeholder organizationId when organizationId is omitted and AZURE_DEVOPS_ORG_URL is unset', () => {
      process.env = {
        ...originalEnv,
        AZURE_DEVOPS_ORG_URL: '',
      };

      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SearchCodeSchema } = require('./schemas');

      const parsed = SearchCodeSchema.parse({
        searchText: 'hello',
      });

      expect(parsed.organizationId).toBeUndefined();
    });
  });
});
