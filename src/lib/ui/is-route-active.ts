/**
 * Whether a nav item pointing at `href` should read as active for `pathname`.
 *
 * A child route highlights its parent (`/projects/abc` lights up `/projects`),
 * but matching stops at segment boundaries: a plain `pathname.startsWith(href)`
 * also lights `/projects` up for `/projects-archive`, which is a different
 * page.
 *
 * No route in the app collides today, so this is hardening rather than a fix
 * for a visible bug — but the failure is silent when it does happen, and adding
 * a route is how you would trip it.
 *
 * `/` is exact: everything starts with it.
 */
export function isRouteActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';

  const base = href.endsWith('/') ? href.slice(0, -1) : href;
  if (pathname === base) return true;

  return pathname.startsWith(`${base}/`);
}
