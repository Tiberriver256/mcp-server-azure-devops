import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { getConfig, normalizeAuthMethod } from './index.ts';
import { AuthenticationMethod } from './shared/auth/auth-factory.ts';

void describe('index', () => {
  void describe('getConfig', () => {
    beforeEach(() => {
      mock.method(process.stderr, 'write', () => true);
    });

    afterEach(() => {
      mock.restoreAll();
    });

    void it('reads tool filtering and read-only options from environment variables', () => {
      const config = getConfig([], {
        AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/test-org',
        AZURE_DEVOPS_TOOLSETS: 'projects, work-items',
        AZURE_DEVOPS_ENABLED_TOOLS: 'get_project,get_work_item',
        AZURE_DEVOPS_DISABLED_TOOLS: 'delete_work_item_attachment',
        AZURE_DEVOPS_READ_ONLY: 'true',
      });

      assert.deepStrictEqual(config.toolsets, ['projects', 'work-items']);
      assert.deepStrictEqual(config.enabledTools, [
        'get_project',
        'get_work_item',
      ]);
      assert.deepStrictEqual(config.disabledTools, [
        'delete_work_item_attachment',
      ]);
      assert.strictEqual(config.readOnly, true);
    });

    void it('prefers CLI flags over environment variables', () => {
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

      assert.deepStrictEqual(config.toolsets, ['repositories']);
      assert.deepStrictEqual(config.enabledTools, ['list_repositories']);
      assert.deepStrictEqual(config.disabledTools, ['create_commit']);
      assert.strictEqual(config.readOnly, false);
    });
  });

  void describe('normalizeAuthMethod', () => {
    void it('should return AzureIdentity when authMethodStr is undefined', () => {
      // Arrange
      const authMethodStr = undefined;

      // Act
      const result = normalizeAuthMethod(authMethodStr);

      // Assert
      assert.strictEqual(result, AuthenticationMethod.AzureIdentity);
    });

    void it('should return AzureIdentity when authMethodStr is empty', () => {
      // Arrange
      const authMethodStr = '';

      // Act
      const result = normalizeAuthMethod(authMethodStr);

      // Assert
      assert.strictEqual(result, AuthenticationMethod.AzureIdentity);
    });

    void it('should handle PersonalAccessToken case-insensitively', () => {
      // Arrange
      const variations = ['pat', 'PAT', 'Pat', 'pAt', 'paT'];

      // Act & Assert
      variations.forEach((variant) => {
        assert.strictEqual(
          normalizeAuthMethod(variant),
          AuthenticationMethod.PersonalAccessToken,
        );
      });
    });

    void it('should handle AzureIdentity case-insensitively', () => {
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
        assert.strictEqual(
          normalizeAuthMethod(variant),
          AuthenticationMethod.AzureIdentity,
        );
      });
    });

    void it('should handle AzureCli case-insensitively', () => {
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
        assert.strictEqual(
          normalizeAuthMethod(variant),
          AuthenticationMethod.AzureCli,
        );
      });
    });

    void it('should return AzureIdentity for unrecognized values', () => {
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
      const stderrSpy = mock.method(process.stderr, 'write', () => true);

      try {
        unrecognized.forEach((value) => {
          assert.strictEqual(
            normalizeAuthMethod(value),
            AuthenticationMethod.AzureIdentity,
          );
        });
      } finally {
        stderrSpy.mock.restore();
      }
    });
  });
});
