/**
 * Cannect PDS Client
 * 
 * Interfaces with the self-hosted PDS at cannect.space
 * Uses did:plc identifiers registered with plc.directory
 * 
 * PDS: https://cannect.space
 * PLC Directory: https://plc.directory
 * App View: https://api.bsky.app
 * Relay: https://bsky.network
 */

// =============================================================================
// Configuration
// =============================================================================

export const PDS_CONFIG = {
  hostname: 'cannect.space',
  url: 'https://cannect.space',
  plcUrl: 'https://plc.directory',
  appViewUrl: 'https://api.bsky.app',
  appViewDid: 'did:web:api.bsky.app',
  relayUrl: 'https://bsky.network',
  reportServiceUrl: 'https://mod.bsky.app',
  reportServiceDid: 'did:plc:ar7c4by46qjdydhdevvrndac',
} as const;

// =============================================================================
// Types
// =============================================================================

export interface CreateAccountParams {
  email: string;
  handle: string;
  password: string;
  inviteCode?: string;
}

export interface CreateAccountResponse {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

export interface PdsSession {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
  email?: string;
}

export interface PdsError {
  error: string;
  message: string;
}

export interface ResolveHandleResponse {
  did: string;
}

export interface DescribeServerResponse {
  did: string;
  availableUserDomains: string[];
  inviteCodeRequired: boolean;
  links?: {
    privacyPolicy?: string;
    termsOfService?: string;
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalize a username to a valid handle
 * - Lowercase
 * - Remove special characters
 * - Ensure it's not too long
 */
export function normalizeUsername(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 20); // AT Protocol handles have limits
}

/**
 * Create a full handle from a username
 */
export function createHandle(username: string): string {
  const normalized = normalizeUsername(username);
  return `${normalized}.${PDS_CONFIG.hostname}`;
}

/**
 * Check if a response is an error
 */
function isPdsError(response: any): response is PdsError {
  return response && typeof response.error === 'string';
}

// =============================================================================
// PDS API Functions
// =============================================================================

/**
 * Get server description
 * Useful for checking if the PDS is online and getting configuration
 */
export async function describeServer(): Promise<DescribeServerResponse> {
  const response = await fetch(`${PDS_CONFIG.url}/xrpc/com.atproto.server.describeServer`);
  
  if (!response.ok) {
    throw new Error(`Failed to describe server: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Check if a handle is available on the PDS
 */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  try {
    await resolveHandle(handle);
    return false; // Handle exists, not available
  } catch {
    return true; // Handle doesn't exist, available
  }
}

/**
 * Resolve a handle to a DID
 */
export async function resolveHandle(handle: string): Promise<string> {
  const response = await fetch(
    `${PDS_CONFIG.url}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Handle resolution failed: ${error.message || handle}`);
  }

  const data: ResolveHandleResponse = await response.json();
  return data.did;
}

/**
 * Create a new account on the Cannect PDS
 * This registers the user with plc.directory and creates their repo
 */
export async function createPdsAccount(params: CreateAccountParams): Promise<CreateAccountResponse> {
  const response = await fetch(`${PDS_CONFIG.url}/xrpc/com.atproto.server.createAccount`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email,
      handle: params.handle.includes('.') ? params.handle : createHandle(params.handle),
      password: params.password,
      inviteCode: params.inviteCode,
    }),
  });

  const data = await response.json();

  if (!response.ok || isPdsError(data)) {
    const error = data as PdsError;
    throw new Error(error.message || `PDS account creation failed: ${response.statusText}`);
  }

  return data as CreateAccountResponse;
}

/**
 * Create a session (login) on the PDS
 */
export async function createPdsSession(identifier: string, password: string): Promise<PdsSession> {
  const response = await fetch(`${PDS_CONFIG.url}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier, // Can be handle or DID
      password,
    }),
  });

  const data = await response.json();

  if (!response.ok || isPdsError(data)) {
    const error = data as PdsError;
    throw new Error(error.message || `PDS login failed: ${response.statusText}`);
  }

  return data as PdsSession;
}

/**
 * Refresh an expired session
 */
export async function refreshPdsSession(refreshJwt: string): Promise<PdsSession> {
  const response = await fetch(`${PDS_CONFIG.url}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${refreshJwt}`,
    },
  });

  const data = await response.json();

  if (!response.ok || isPdsError(data)) {
    throw new Error('Session refresh failed');
  }

  return data as PdsSession;
}

/**
 * Delete/logout a session
 */
export async function deletePdsSession(accessJwt: string): Promise<void> {
  const response = await fetch(`${PDS_CONFIG.url}/xrpc/com.atproto.server.deleteSession`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessJwt}`,
    },
  });

  if (!response.ok) {
    throw new Error('Session deletion failed');
  }
}

/**
 * Get the current session info
 */
export async function getSession(accessJwt: string): Promise<PdsSession> {
  const response = await fetch(`${PDS_CONFIG.url}/xrpc/com.atproto.server.getSession`, {
    headers: {
      'Authorization': `Bearer ${accessJwt}`,
    },
  });

  const data = await response.json();

  if (!response.ok || isPdsError(data)) {
    throw new Error('Failed to get session');
  }

  return data as PdsSession;
}

// =============================================================================
// Profile Operations
// =============================================================================

export interface GetProfileParams {
  actor: string; // DID or handle
}

export interface ProfileRecord {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  banner?: string;
  followersCount: number;
  followsCount: number;
  postsCount: number;
  indexedAt: string;
}

/**
 * Get a profile from the App View
 */
export async function getProfile(actor: string): Promise<ProfileRecord> {
  const response = await fetch(
    `${PDS_CONFIG.appViewUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`
  );

  const data = await response.json();

  if (!response.ok || isPdsError(data)) {
    throw new Error(`Failed to get profile: ${actor}`);
  }

  return data as ProfileRecord;
}

// =============================================================================
// DID Resolution
// =============================================================================

export interface DidDocument {
  '@context': string[];
  id: string;
  alsoKnownAs?: string[];
  verificationMethod?: Array<{
    id: string;
    type: string;
    controller: string;
    publicKeyMultibase?: string;
  }>;
  service?: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
}

/**
 * Resolve a DID to its document from plc.directory
 */
export async function resolveDid(did: string): Promise<DidDocument> {
  const response = await fetch(`${PDS_CONFIG.plcUrl}/${did}`);

  if (!response.ok) {
    throw new Error(`Failed to resolve DID: ${did}`);
  }

  return response.json();
}

/**
 * Check if a DID exists in plc.directory
 */
export async function didExists(did: string): Promise<boolean> {
  try {
    await resolveDid(did);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Health Check
// =============================================================================

export interface PdsHealthStatus {
  online: boolean;
  version?: string;
  did?: string;
  availableDomains?: string[];
  error?: string;
}

/**
 * Check if the PDS is online and get basic info
 */
export async function checkPdsHealth(): Promise<PdsHealthStatus> {
  try {
    const serverInfo = await describeServer();
    return {
      online: true,
      did: serverInfo.did,
      availableDomains: serverInfo.availableUserDomains,
    };
  } catch (error) {
    return {
      online: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
