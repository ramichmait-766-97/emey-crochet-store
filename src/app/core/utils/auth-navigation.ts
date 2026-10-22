import { StoreRole } from '../models/user.model';

export function loginDestination(role: StoreRole, returnUrl: string | null): string {
  const home = role === 'admin' ? '/admin' : '/account';
  // Accept only local paths and avoid login loops or a client's forbidden admin route.
  if (!returnUrl || !/^\/(?![\/\\])/.test(returnUrl) || /[\\\r\n]/.test(returnUrl)) return home;
  const path = returnUrl.split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
  if (path === '/login' || (role !== 'admin' && /^\/admin(?:\/|;|$)/.test(path))) return home;
  return returnUrl;
}
