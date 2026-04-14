export interface RouteMeta {
  title: string;
  subtitle: string;
  hideHeader?: boolean;
  fullBleed?: boolean;
  constrained?: boolean;
}

const DEFAULT_META: RouteMeta = {
  title: 'HVAC Engineering Platform',
  subtitle: 'Program cockpit',
  hideHeader: false,
  fullBleed: false,
  constrained: false,
};

const ROUTE_META: Array<{ match: (pathname: string) => boolean; meta: RouteMeta }> = [
  {
    match: (pathname) => pathname === '/',
    meta: {
      title: 'Dashboard',
      subtitle: 'System overview',
      constrained: false,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/projects'),
    meta: {
      title: 'Projects Workspace',
      subtitle: 'Project lifecycle and estimates',
      fullBleed: true,
      constrained: false,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/load-calculation'),
    meta: {
      title: 'Load Calculation Workspace',
      subtitle: 'Thermal analytics',
      fullBleed: true,
      constrained: false,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/airflow-duct-design'),
    meta: {
      title: 'Airflow and Duct Design',
      subtitle: 'Air distribution and sizing',
      fullBleed: true,
      constrained: false,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/equipment-selection'),
    meta: {
      title: 'Equipment Selection',
      subtitle: 'System fit and costing',
      fullBleed: true,
      constrained: false,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/reports'),
    meta: {
      title: 'Reports Workspace',
      subtitle: 'Engineering report outputs',
      fullBleed: true,
      constrained: false,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/quotation'),
    meta: {
      title: 'Quotation Workspace',
      subtitle: 'Commercial proposal preparation',
      fullBleed: true,
      constrained: false,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/materials'),
    meta: {
      title: 'Tools Inventory',
      subtitle: 'Equipment and tool catalog',
      fullBleed: true,
      constrained: false,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/settings'),
    meta: {
      title: 'Settings',
      subtitle: 'System controls and preferences',
      fullBleed: true,
      constrained: false,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/diagnostics'),
    meta: {
      title: 'Diagnostics',
      subtitle: 'Health checks and validation',
      fullBleed: true,
      constrained: false,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/simulation/workspace'),
    meta: {
      title: 'CFD Simulation Workspace',
      subtitle: 'Data-center airflow analysis',
      hideHeader: true,
      fullBleed: true,
      constrained: false,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/simulation/engine'),
    meta: {
      title: 'Simulation Engine',
      subtitle: 'CFD case management & execution',
      fullBleed: true,
      constrained: false,
    },
  },
  {
    match: (pathname) => pathname.startsWith('/simulation'),
    meta: {
      title: 'CFD Simulation',
      subtitle: 'Model orchestration',
      fullBleed: true,
      constrained: false,
    },
  },
];

export function getRouteMeta(pathname: string): RouteMeta {
  for (const route of ROUTE_META) {
    if (route.match(pathname)) {
      return route.meta;
    }
  }

  return DEFAULT_META;
}
