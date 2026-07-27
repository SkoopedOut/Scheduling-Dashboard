import { PublicClientApplication } from '@azure/msal-browser';

// ============================================================
// UPDATE THESE 3 VALUES — see SETUP.md for instructions
// ============================================================
const CLIENT_ID = '033521cc-16fc-4e1d-92d6-48cd61b46c00';
const TENANT_ID = '1318af2f-0125-4b9b-91ee-ffa4262434db';
const REDIRECT_URI = window.location.origin + window.location.pathname;

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri: REDIRECT_URI,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
};

const loginRequest = {
  scopes: ['Sites.Read.All', 'Files.Read.All'],
};

let msalInstance = null;

export async function initAuth() {
  if (CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
    return null;
  }
  msalInstance = new PublicClientApplication(msalConfig);
  await msalInstance.initialize();
  const response = await msalInstance.handleRedirectPromise();
  if (response) return response.accessToken;
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
    try {
      const tokenResponse = await msalInstance.acquireTokenSilent(loginRequest);
      return tokenResponse.accessToken;
    } catch {
      return null;
    }
  }
  return null;
}

export async function login() {
  if (!msalInstance) await initAuth();
  if (!msalInstance) throw new Error('Auth not configured — update CLIENT_ID and TENANT_ID in src/auth.js');
  try {
    const response = await msalInstance.loginPopup(loginRequest);
    msalInstance.setActiveAccount(response.account);
    return response.accessToken;
  } catch (err) {
    console.error('Login failed:', err);
    throw err;
  }
}

export async function getToken() {
  if (!msalInstance) return null;
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) return null;
  msalInstance.setActiveAccount(accounts[0]);
  try {
    const response = await msalInstance.acquireTokenSilent(loginRequest);
    return response.accessToken;
  } catch {
    const response = await msalInstance.loginPopup(loginRequest);
    return response.accessToken;
  }
}

export function isConfigured() {
  return CLIENT_ID !== 'YOUR_CLIENT_ID_HERE' && TENANT_ID !== 'YOUR_TENANT_ID_HERE';
}

// Acquire a token for a specific set of scopes (e.g. Teams messaging scopes
// that aren't in the default loginRequest). Uses incremental consent: the
// user is prompted the first time these scopes are requested, then silent.
// Does not alter the default sign-in scopes above.
export async function getTokenForScopes(scopes) {
  if (!msalInstance) await initAuth();
  if (!msalInstance) throw new Error('Auth not configured — update CLIENT_ID and TENANT_ID in src/auth.js');
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    const r = await msalInstance.loginPopup({ scopes });
    msalInstance.setActiveAccount(r.account);
    return r.accessToken;
  }
  msalInstance.setActiveAccount(accounts[0]);
  const request = { scopes, account: accounts[0] };
  try {
    const r = await msalInstance.acquireTokenSilent(request);
    return r.accessToken;
  } catch {
    // Silent fails when the user hasn't yet consented to these scopes.
    const r = await msalInstance.acquireTokenPopup(request);
    return r.accessToken;
  }
}
