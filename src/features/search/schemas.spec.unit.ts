describe('search schemas', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  describe('SearchCodeSchema', () => {
    it('does not inject a placeholder projectId when projectId is omitted and AZURE_DEVOPS_DEFAULT_PROJECT is unset', async () => {
      process.env = {
        ...originalEnv,
        AZURE_DEVOPS_DEFAULT_PROJECT: '',
      };

      jest.resetModules();
      const { SearchCodeSchema } = await import('./schemas');

      const parsed = SearchCodeSchema.parse({
        searchText: 'hello',
      });

      expect(parsed.projectId).toBeUndefined();
    });

    it('does not inject a placeholder organizationId when organizationId is omitted and AZURE_DEVOPS_ORG_URL is unset', async () => {
      process.env = {
        ...originalEnv,
        AZURE_DEVOPS_ORG_URL: '',
      };

      jest.resetModules();
      const { SearchCodeSchema } = await import('./schemas');

      const parsed = SearchCodeSchema.parse({
        searchText: 'hello',
      });

      expect(parsed.organizationId).toBeUndefined();
    });
  });
});
