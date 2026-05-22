import authService from './authService';
import { getToken } from '../utils/tokenStorage';
import { loadBootstrapShell } from './bootstrapService';
import { mergeAuthUserFromProfile, unwrapApiData } from '../utils/helpers';

let inflightRestore = null;

/**
 * Khôi phục phiên sau reload — một flight (StrictMode / tab song song).
 * Ưu tiên GET /api/bootstrap (đã gồm user + orgs + badges); fallback getCurrentUser.
 */
export async function restoreAuthSession() {
  const token = getToken();
  if (!token) {
    return { user: null, fromBootstrap: false };
  }

  if (inflightRestore) {
    return inflightRestore;
  }

  inflightRestore = (async () => {
    try {
      const boot = await loadBootstrapShell();
      if (boot?.user) {
        return {
          user: mergeAuthUserFromProfile(null, boot.user),
          fromBootstrap: true,
        };
      }
    } catch (bootErr) {
      console.warn('[authSession] Bootstrap restore failed, fallback /auth/me:', bootErr?.message || bootErr);
    }

    const userData = await authService.getCurrentUser();
    const profile = unwrapApiData(userData);
    return {
      user: mergeAuthUserFromProfile(null, profile),
      fromBootstrap: false,
    };
  })();

  try {
    return await inflightRestore;
  } finally {
    inflightRestore = null;
  }
}

export async function restoreAuthSessionAfterLogin(loginUser) {
  try {
    const boot = await loadBootstrapShell();
    if (boot?.user) {
      return mergeAuthUserFromProfile(loginUser, boot.user);
    }
  } catch (bootErr) {
    console.warn('[authSession] Bootstrap after login failed:', bootErr?.message || bootErr);
  }

  try {
    const me = await authService.getCurrentUser();
    return mergeAuthUserFromProfile(loginUser, unwrapApiData(me) || me);
  } catch {
    return loginUser;
  }
}
