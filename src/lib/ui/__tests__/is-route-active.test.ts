import { describe, expect, it } from 'vitest';
import { isRouteActive } from '../is-route-active';

/**
 * Nav highlighting matches on segment boundaries.
 *
 * `pathname.startsWith(href)` also lights `/projects` up for
 * `/projects-archive`. No route in the app collides today, so this is
 * hardening rather than a fix for something visible — but the failure is
 * silent, and adding a route is how you would trip it.
 */
describe('isRouteActive', () => {
  it('matches the route itself', () => {
    expect(isRouteActive('/projects', '/projects')).toBe(true);
  });

  it('matches a child route, so a detail page highlights its section', () => {
    expect(isRouteActive('/projects/abc', '/projects')).toBe(true);
    expect(isRouteActive('/projects/abc/floorplan', '/projects')).toBe(true);
  });

  it('does not match a sibling that merely shares a prefix', () => {
    // The whole point: startsWith returns true for both of these.
    expect(isRouteActive('/projects-archive', '/projects')).toBe(false);
    expect(isRouteActive('/settings-advanced', '/settings')).toBe(false);
  });

  it('keeps the dashboard exact, since every path starts with /', () => {
    expect(isRouteActive('/', '/')).toBe(true);
    expect(isRouteActive('/projects', '/')).toBe(false);
  });

  it('distinguishes siblings under a shared parent', () => {
    expect(isRouteActive('/simulation/engine', '/simulation/viewer')).toBe(false);
    expect(isRouteActive('/simulation/viewer', '/simulation/viewer')).toBe(true);
  });

  it('tolerates a trailing slash on the href', () => {
    expect(isRouteActive('/projects', '/projects/')).toBe(true);
    expect(isRouteActive('/projects/abc', '/projects/')).toBe(true);
  });

  it('does not match an unrelated route', () => {
    expect(isRouteActive('/materials', '/projects')).toBe(false);
  });
});
