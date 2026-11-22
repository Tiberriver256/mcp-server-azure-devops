import { getConfig, normalizeAuthMethod } from './index';
import { AuthenticationMethod } from './shared/auth/auth-factory';

describe('index', () => {
  describe('getConfig', () => {
    let originalStderrWrite: typeof process.stderr.write;

    beforeEach(() => {
      originalStderrWrite = process.stderr.write;
      process.stderr.write =
        jest.fn() as unknown as typeof process.stderr.write;
    });

    afterEach(() => {
      process.stderr.write = originalStderrWrite;
    });

    it('reads tool filtering and read-only options from environment variables', () => {
      const config = getConfig([], {
        AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/test-org',
        AZURE_DEVOPS_TOOLSETS: 'projects, work-items',
        AZURE_DEVOPS_ENABLED_TOOLS: 'get_project,get_work_item',
        AZURE_DEVOPS_DISABLED_TOOLS: 'delete_work_item_attachment',
        AZURE_DEVOPS_READ_ONLY: 'true',
      });

      expect(config.toolsets).toEqual(['projects', 'work-items']);
      expect(config.enabledTools).toEqual(['get_project', 'get_work_item']);
      expect(config.disabledTools).toEqual(['delete_work_item_attachment']);
      expect(config.readOnly).toBe(true);
    });

    it('prefers CLI flags over environment variables', () => {
      const config = getConfig(
        [
          '--toolsets',
          'repositories',
          '--enabled-tools=list_repositories',
          '--disabled-tools=create_commit',
          '--read-only=false',
        ],
        {
          AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/test-org',
          AZURE_DEVOPS_TOOLSETS: 'projects',
          AZURE_DEVOPS_ENABLED_TOOLS: 'get_project',
          AZURE_DEVOPS_DISABLED_TOOLS: 'get_work_item',
          AZURE_DEVOPS_READ_ONLY: 'true',
        },
      );

      expect(config.toolsets).toEqual(['repositories']);
      expect(config.enabledTools).toEqual(['list_repositories']);
      expect(config.disabledTools).toEqual(['create_commit']);
      expect(config.readOnly).toBe(false);
    });
  });

  describe('normalizeAuthMethod', () => {
    it('should return AzureIdentity when authMethodStr is undefined', () => {
      // Arrange
      const authMethodStr = undefined;

      // Act
      const result = normalizeAuthMethod(authMethodStr);

      // Assert
      expect(result).toBe(AuthenticationMethod.AzureIdentity);
    });

    it('should return AzureIdentity when authMethodStr is empty', () => {
      // Arrange
      const authMethodStr = '';

      // Act
      const result = normalizeAuthMethod(authMethodStr);

      // Assert
      expect(result).toBe(AuthenticationMethod.AzureIdentity);
    });

    it('should handle PersonalAccessToken case-insensitively', () => {
      // Arrange
      const variations = ['pat', 'PAT', 'Pat', 'pAt', 'paT'];

      // Act & Assert
      variations.forEach((variant) => {
        expect(normalizeAuthMethod(variant)).toBe(
          AuthenticationMethod.PersonalAccessToken,
        );
      });
    });

    it('should handle AzureIdentity case-insensitively', () => {
      // Arrange
      const variations = [
        'azure-identity',
        'AZURE-IDENTITY',
        'Azure-Identity',
        'azure-Identity',
        'Azure-identity',
      ];

      // Act & Assert
      variations.forEach((variant) => {
        expect(normalizeAuthMethod(variant)).toBe(
          AuthenticationMethod.AzureIdentity,
        );
      });
    });

    it('should handle AzureCli case-insensitively', () => {
      // Arrange
      const variations = [
        'azure-cli',
        'AZURE-CLI',
        'Azure-Cli',
        'azure-Cli',
        'Azure-cli',
      ];

      // Act & Assert
      variations.forEach((variant) => {
        expect(normalizeAuthMethod(variant)).toBe(
          AuthenticationMethod.AzureCli,
        );
      });
    });

    it('should return AzureIdentity for unrecognized values', () => {
      // Arrange
      const unrecognized = [
        'unknown',
        'azureCli', // no hyphen
        'azureIdentity', // no hyphen
        'personal-access-token', // not matching enum value
        'cli',
        'identity',
      ];

      // Act & Assert (mute stderr for warning messages)
      const originalStderrWrite = process.stderr.write;
      process.stderr.write = jest.fn();

      try {
        unrecognized.forEach((value) => {
          expect(normalizeAuthMethod(value)).toBe(
            AuthenticationMethod.AzureIdentity,
          );
        });
      } finally {
        process.stderr.write = originalStderrWrite;
      }
    });
  });
});
