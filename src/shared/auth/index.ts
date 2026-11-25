export {
  AZURE_DEVOPS_RESOURCE_ID,
  AuthenticationMethod,
  classifyConnectionError,
  createAuthClient,
  createAuthProvider,
  createBasicAuthHeader,
  formatOrgUrlForLog,
  isCredentialAuthFailure,
  isLocationLookupFailure,
  normalizeAuthMethod,
} from './auth-factory.ts';
export type { AuthConfig, AuthProvider } from './auth-factory.ts';
