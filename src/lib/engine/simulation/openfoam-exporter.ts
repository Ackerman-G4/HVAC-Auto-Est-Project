/**
 * OpenFOAM Case Exporter
 *
 * Generates OpenFOAM-compatible case configuration from a SimulationCase.
 * Produces blockMeshDict, boundary conditions, controlDict, fvSchemes,
 * fvSolution, and turbulenceProperties content strings.
 */

import type {
  SimulationCase,
  StructuredGrid,
  PhysicsSetup,
  SolverProfile,
  OpenFOAMCaseConfig,
  OpenFOAMPatchBC,
  Vec3,
  BoundaryPatch,
} from '@/types/simulation';

// ─── Public API ─────────────────────────────────────────────

/**
 * Build a complete OpenFOAM case config from a SimulationCase.
 */
export function buildOpenFOAMConfig(simCase: SimulationCase): OpenFOAMCaseConfig {
  if (!simCase.mesh) {
    throw new Error('Case must have a generated mesh before export');
  }

  const mesh = simCase.mesh;
  const physics = simCase.physics;
  const solver = simCase.solver;

  return {
    caseName: sanitizeCaseName(simCase.name),
    meshFormat: 'blockMesh',
    blockMesh: buildBlockMeshDict(mesh),
    solver: selectOpenFOAMSolver(physics),
    turbulenceProperties: buildTurbulenceProperties(physics),
    schemes: buildFvSchemes(solver),
    solution: buildFvSolution(solver, physics, mesh.patches),
    boundaryConditions: buildBoundaryConditions(mesh.patches, physics),
    controlDict: buildControlDict(simCase.name, solver, physics),
  };
}

/**
 * Generate OpenFOAM case directory file-content map for download.
 * Returns a map of relative file paths to their string content.
 */
export function generateCaseFiles(config: OpenFOAMCaseConfig): Map<string, string> {
  const files = new Map<string, string>();

  files.set('system/blockMeshDict', renderBlockMeshDict(config));
  files.set('system/controlDict', renderControlDict(config));
  files.set('system/fvSchemes', renderFvSchemes(config));
  files.set('system/fvSolution', renderFvSolution(config));
  files.set('constant/turbulenceProperties', renderTurbulenceProperties(config));
  files.set('constant/transportProperties', renderTransportProperties(config));

  // Boundary condition files for each field
  for (const field of ['U', 'p', 'T', 'k', 'epsilon']) {
    files.set(`0/${field}`, renderFieldBC(config, field));
  }

  return files;
}

// ─── Config Builders ────────────────────────────────────────

function buildBlockMeshDict(mesh: StructuredGrid) {
  const x = mesh.extents.x;
  const y = mesh.extents.y;
  const z = mesh.extents.z;

  return {
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x, y: 0, z: 0 },
      { x, y, z: 0 },
      { x: 0, y, z: 0 },
      { x: 0, y: 0, z },
      { x, y: 0, z },
      { x, y, z },
      { x: 0, y, z },
    ] as Vec3[],
    blocks: [{
      cells: [mesh.nx, mesh.ny, mesh.nz] as [number, number, number],
      grading: [1, 1, 1] as [number, number, number],
    }],
  };
}

function selectOpenFOAMSolver(physics: PhysicsSetup): string {
  if (physics.buoyancy) return 'buoyantSimpleFoam';
  return 'simpleFoam';
}

function buildTurbulenceProperties(physics: PhysicsSetup) {
  if (physics.turbulenceModel === 'laminar') {
    return { simulationType: 'laminar' as const };
  }

  const modelMap: Record<string, string> = {
    'k-epsilon': 'kEpsilon',
    'realizable-k-epsilon': 'realizableKE',
    'k-omega-sst': 'kOmegaSST',
  };

  return {
    simulationType: 'RAS' as const,
    RASModel: modelMap[physics.turbulenceModel] || 'kEpsilon',
  };
}

function buildFvSchemes(solver: SolverProfile) {
  const isTransient = solver.timeStepS > 0;
  return {
    ddtSchemes: { default: isTransient ? 'Euler' : 'steadyState' },
    gradSchemes: { default: 'Gauss linear' },
    divSchemes: {
      default: 'none',
      'div(phi,U)': 'bounded Gauss linearUpwind grad(U)',
      'div(phi,T)': 'bounded Gauss linearUpwind grad(T)',
      'div(phi,k)': 'bounded Gauss upwind',
      'div(phi,epsilon)': 'bounded Gauss upwind',
      'div((nuEff*dev2(T(grad(U)))))': 'Gauss linear',
    },
    laplacianSchemes: { default: 'Gauss linear corrected' },
  };
}

function buildFvSolution(
  solver: SolverProfile,
  _physics: PhysicsSetup,
  patches: BoundaryPatch[],
) {
  const hasInlet = patches.some((p) => p.type === 'inlet');

  return {
    solvers: {
      p: { solver: 'GAMG', preconditioner: 'none', tolerance: 1e-6, relTol: 0.01 },
      U: { solver: 'smoothSolver', preconditioner: 'symGaussSeidel', tolerance: 1e-6, relTol: 0.1 },
      T: { solver: 'smoothSolver', preconditioner: 'symGaussSeidel', tolerance: 1e-6, relTol: 0.1 },
      k: { solver: 'smoothSolver', preconditioner: 'symGaussSeidel', tolerance: 1e-8, relTol: 0.1 },
      epsilon: { solver: 'smoothSolver', preconditioner: 'symGaussSeidel', tolerance: 1e-8, relTol: 0.1 },
    },
    algorithms: {
      SIMPLE: {
        nNonOrthogonalCorrectors: 1,
        pRefCell: 0,
        pRefValue: hasInlet ? 0 : 0,
      },
    },
    relaxationFactors: {
      p: solver.relaxation.pressure,
      U: solver.relaxation.velocity,
      T: solver.relaxation.temperature,
      k: solver.relaxation.turbulence,
      epsilon: solver.relaxation.turbulence,
    },
  };
}

function buildBoundaryConditions(
  patches: BoundaryPatch[],
  physics: PhysicsSetup,
): OpenFOAMPatchBC[] {
  const bcs: OpenFOAMPatchBC[] = [];

  for (const patch of patches) {
    switch (patch.type) {
      case 'wall':
        bcs.push({ patchName: patch.name, field: 'U', type: 'fixedValue', value: { x: 0, y: 0, z: 0 } });
        bcs.push({ patchName: patch.name, field: 'p', type: 'zeroGradient' });
        bcs.push({ patchName: patch.name, field: 'T', type: 'zeroGradient' });
        bcs.push({ patchName: patch.name, field: 'k', type: 'kqRWallFunction', value: 1e-6 });
        bcs.push({ patchName: patch.name, field: 'epsilon', type: 'epsilonWallFunction', value: 1e-6 });
        break;

      case 'inlet': {
        const vel = patch.params.velocity || { x: 0, y: 0, z: 1 };
        const temp = patch.params.temperature ?? physics.referenceTemperatureC;
        bcs.push({ patchName: patch.name, field: 'U', type: 'fixedValue', value: vel });
        bcs.push({ patchName: patch.name, field: 'p', type: 'zeroGradient' });
        bcs.push({ patchName: patch.name, field: 'T', type: 'fixedValue', value: temp });
        bcs.push({ patchName: patch.name, field: 'k', type: 'fixedValue', value: 0.1 });
        bcs.push({ patchName: patch.name, field: 'epsilon', type: 'fixedValue', value: 0.01 });
        break;
      }

      case 'outlet':
        bcs.push({ patchName: patch.name, field: 'U', type: 'zeroGradient' });
        bcs.push({ patchName: patch.name, field: 'p', type: 'fixedValue', value: 0 });
        bcs.push({ patchName: patch.name, field: 'T', type: 'zeroGradient' });
        bcs.push({ patchName: patch.name, field: 'k', type: 'zeroGradient' });
        bcs.push({ patchName: patch.name, field: 'epsilon', type: 'zeroGradient' });
        break;

      case 'fixedTemperature':
        bcs.push({ patchName: patch.name, field: 'U', type: 'fixedValue', value: { x: 0, y: 0, z: 0 } });
        bcs.push({ patchName: patch.name, field: 'p', type: 'zeroGradient' });
        bcs.push({ patchName: patch.name, field: 'T', type: 'fixedValue', value: patch.params.temperature ?? 24 });
        bcs.push({ patchName: patch.name, field: 'k', type: 'kqRWallFunction', value: 1e-6 });
        bcs.push({ patchName: patch.name, field: 'epsilon', type: 'epsilonWallFunction', value: 1e-6 });
        break;

      case 'heatFlux':
        bcs.push({ patchName: patch.name, field: 'U', type: 'fixedValue', value: { x: 0, y: 0, z: 0 } });
        bcs.push({ patchName: patch.name, field: 'p', type: 'zeroGradient' });
        bcs.push({ patchName: patch.name, field: 'T', type: 'zeroGradient' }); // Simplified; real setup uses fixedGradient
        bcs.push({ patchName: patch.name, field: 'k', type: 'kqRWallFunction', value: 1e-6 });
        bcs.push({ patchName: patch.name, field: 'epsilon', type: 'epsilonWallFunction', value: 1e-6 });
        break;
    }
  }

  return bcs;
}

function buildControlDict(
  caseName: string,
  solver: SolverProfile,
  physics: PhysicsSetup,
): OpenFOAMCaseConfig['controlDict'] {
  const isTransient = solver.timeStepS > 0;
  return {
    application: physics.buoyancy ? 'buoyantSimpleFoam' : 'simpleFoam',
    startFrom: 'startTime',
    startTime: 0,
    stopAt: isTransient ? 'endTime' : 'endTime',
    endTime: isTransient ? solver.maxIterations * solver.timeStepS : solver.maxIterations,
    deltaT: isTransient ? solver.timeStepS : 1,
    writeControl: 'timeStep',
    writeInterval: Math.max(1, Math.floor(solver.maxIterations / 10)),
    purgeWrite: 3,
    writeFormat: 'ascii',
    writePrecision: 8,
  };
}

// ─── File Renderers ─────────────────────────────────────────

function foamHeader(className: string, objectName: string, location: string): string {
  return `FoamFile
{
    version     2.0;
    format      ascii;
    class       ${className};
    location    "${location}";
    object      ${objectName};
}
`;
}

function renderBlockMeshDict(config: OpenFOAMCaseConfig): string {
  const bm = config.blockMesh;
  if (!bm) return '';

  const verts = bm.vertices.map((v) => `    (${v.x} ${v.y} ${v.z})`).join('\n');
  const block = bm.blocks[0];

  return `${foamHeader('dictionary', 'blockMeshDict', 'system')}
convertToMeters 1;

vertices
(
${verts}
);

blocks
(
    hex (0 1 2 3 4 5 6 7) (${block.cells.join(' ')}) simpleGrading (${block.grading.join(' ')})
);

edges
(
);

boundary
(
);

mergePatchPairs
(
);
`;
}

function renderControlDict(config: OpenFOAMCaseConfig): string {
  const cd = config.controlDict;
  return `${foamHeader('dictionary', 'controlDict', 'system')}
application     ${cd.application};
startFrom       ${cd.startFrom};
startTime       ${cd.startTime};
stopAt          ${cd.stopAt};
endTime         ${cd.endTime};
deltaT          ${cd.deltaT};
writeControl    ${cd.writeControl};
writeInterval   ${cd.writeInterval};
purgeWrite      ${cd.purgeWrite};
writeFormat     ${cd.writeFormat};
writePrecision  ${cd.writePrecision};
`;
}

function renderFvSchemes(config: OpenFOAMCaseConfig): string {
  const s = config.schemes;
  const section = (name: string, entries: Record<string, string>) => {
    const lines = Object.entries(entries).map(([k, v]) => `    ${k}  ${v};`).join('\n');
    return `${name}\n{\n${lines}\n}`;
  };

  return `${foamHeader('dictionary', 'fvSchemes', 'system')}
${section('ddtSchemes', s.ddtSchemes)}

${section('gradSchemes', s.gradSchemes)}

${section('divSchemes', s.divSchemes)}

${section('laplacianSchemes', s.laplacianSchemes)}

interpolationSchemes
{
    default  linear;
}

snGradSchemes
{
    default  corrected;
}
`;
}

function renderFvSolution(config: OpenFOAMCaseConfig): string {
  const sol = config.solution;

  const solverLines = Object.entries(sol.solvers).map(([field, cfg]) => {
    const lines = [
      `        solver          ${cfg.solver};`,
      cfg.preconditioner ? `        preconditioner  ${cfg.preconditioner};` : null,
      `        tolerance       ${cfg.tolerance};`,
      `        relTol          ${cfg.relTol};`,
    ].filter(Boolean).join('\n');
    return `    ${field}\n    {\n${lines}\n    }`;
  }).join('\n\n');

  const relaxLines = Object.entries(sol.relaxationFactors)
    .map(([k, v]) => `        ${k}  ${v};`)
    .join('\n');

  const algoLines = Object.entries(sol.algorithms).map(([name, params]) => {
    const pLines = Object.entries(params)
      .map(([pk, pv]) => `        ${pk}  ${pv};`)
      .join('\n');
    return `    ${name}\n    {\n${pLines}\n    }`;
  }).join('\n\n');

  return `${foamHeader('dictionary', 'fvSolution', 'system')}
solvers
{
${solverLines}
}

${algoLines}

relaxationFactors
{
    fields
    {
${relaxLines}
    }
}
`;
}

function renderTurbulenceProperties(config: OpenFOAMCaseConfig): string {
  const tp = config.turbulenceProperties;
  let body = `simulationType  ${tp.simulationType};\n`;
  if (tp.RASModel) {
    body += `\nRAS\n{\n    RASModel        ${tp.RASModel};\n    turbulence      on;\n    printCoeffs     on;\n}\n`;
  }
  return `${foamHeader('dictionary', 'turbulenceProperties', 'constant')}\n${body}`;
}

function renderTransportProperties(_config: OpenFOAMCaseConfig): string {
  // Extract from the solved boundary conditions
  return `${foamHeader('dictionary', 'transportProperties', 'constant')}
transportModel  Newtonian;

nu              nu [ 0 2 -1 0 0 0 0 ] 1.5e-05;
`;
}

function renderFieldBC(config: OpenFOAMCaseConfig, field: string): string {
  const fieldBCs = config.boundaryConditions.filter((bc) => bc.field === field);

  const dimensionMap: Record<string, string> = {
    U: '[0 1 -1 0 0 0 0]',
    p: '[0 2 -2 0 0 0 0]',
    T: '[0 0 0 1 0 0 0]',
    k: '[0 2 -2 0 0 0 0]',
    epsilon: '[0 2 -3 0 0 0 0]',
  };

  const defaultValueMap: Record<string, string> = {
    U: 'uniform (0 0 0)',
    p: 'uniform 0',
    T: 'uniform 293.15',
    k: 'uniform 0.1',
    epsilon: 'uniform 0.01',
  };

  const classMap: Record<string, string> = {
    U: 'volVectorField',
    p: 'volScalarField',
    T: 'volScalarField',
    k: 'volScalarField',
    epsilon: 'volScalarField',
  };

  let boundaryBlock = '';
  for (const bc of fieldBCs) {
    const valueStr = formatBCValue(bc.value, field);
    boundaryBlock += `    ${bc.patchName}\n    {\n        type            ${bc.type};\n`;
    if (valueStr) {
      boundaryBlock += `        value           ${valueStr};\n`;
    }
    boundaryBlock += `    }\n`;
  }

  return `${foamHeader(classMap[field] || 'volScalarField', field, '0')}
dimensions      ${dimensionMap[field] || '[0 0 0 0 0 0 0]'};

internalField   ${defaultValueMap[field] || 'uniform 0'};

boundaryField
{
${boundaryBlock}}
`;
}

function formatBCValue(value: number | Vec3 | undefined, field: string): string {
  if (value === undefined) return '';
  if (typeof value === 'number') {
    if (field === 'T') return `uniform ${value + 273.15}`; // Convert °C to K
    return `uniform ${value}`;
  }
  return `uniform (${value.x} ${value.y} ${value.z})`;
}

// ─── Utilities ──────────────────────────────────────────────

function sanitizeCaseName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64);
}
