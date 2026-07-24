/**
 * OpenFOAM Case Exporter
 *
 * Generates OpenFOAM-compatible case configuration from a SimulationCase.
 * Produces blockMeshDict, topoSetDict, createPatchDict, boundary conditions,
 * controlDict, fvSchemes, fvSolution, turbulence + thermophysical/transport
 * properties, and gravity.
 *
 * Wave 8 foundation repair: the emitted case must actually mesh and start a
 * solver. That means (a) blockMesh declares its six box faces, (b) named patches
 * are carved by topoSet + createPatch, and (c) the file set switches on the
 * solver — buoyantSimpleFoam needs thermophysicalProperties + g + p_rgh + alphat
 * (NOT transportProperties), while simpleFoam needs transportProperties.
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
  BoundaryPatchType,
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
  const buoyant = physics.buoyancy;

  // Sanitize patch names ONCE so blockMesh/topoSet/createPatch and the field
  // boundary files all reference identical, solver-safe names (hyphens survive).
  const sanitizedPatches: BoundaryPatch[] = mesh.patches.map((p) => ({
    ...p,
    name: sanitizePatchName(p.name),
  }));

  const extents: Vec3 = { x: mesh.extents.x, y: mesh.extents.y, z: mesh.extents.z };

  // Named patches for topoSet/createPatch, in mesh order.
  //
  // Do not sort or reorder this list. createPatch assigns a doubly-claimed face
  // (a supply grille sits ON a wall, and the wall's bounding box covers it) to
  // the LAST dict entry that lists it — so specific patches (HVAC vents) MUST
  // come AFTER generic ones (walls/floor/ceiling). geometry-builder already
  // emits walls/floor/ceiling first and HVAC vents last; preserve that order.
  const namedPatches = sanitizedPatches
    .filter((p) => p.faces.length > 0)
    .map((p) => ({
      name: p.name,
      role: p.type,
      foamType: mapFoamType(p.type),
      box: patchFaceBox(p, mesh.cellSizeM, extents),
    }));

  return {
    caseName: sanitizeCaseName(simCase.name),
    meshFormat: 'blockMesh',
    blockMesh: buildBlockMeshDict(mesh),
    solver: selectOpenFOAMSolver(physics),
    turbulenceProperties: buildTurbulenceProperties(physics),
    schemes: buildFvSchemes(solver),
    solution: buildFvSolution(solver, physics, sanitizedPatches),
    boundaryConditions: buildBoundaryConditions(sanitizedPatches, physics),
    controlDict: buildControlDict(simCase.name, solver, physics),
    namedPatches,
    meshExtents: extents,
    gravity: physics.gravity ?? { x: 0, y: 0, z: -9.81 },
    buoyant,
  };
}

/**
 * Generate OpenFOAM case directory file-content map for download.
 * Returns a map of relative file paths to their string content.
 *
 * The file set switches on the solver (Wave 8): a buoyant case that shipped
 * transportProperties + no p_rgh/alphat/g would exit at solver startup.
 */
export function generateCaseFiles(config: OpenFOAMCaseConfig): Map<string, string> {
  const files = new Map<string, string>();
  const buoyant = config.buoyant ?? config.controlDict.application === 'buoyantSimpleFoam';

  // system/
  files.set('system/blockMeshDict', renderBlockMeshDict(config));
  files.set('system/controlDict', renderControlDict(config));
  files.set('system/fvSchemes', renderFvSchemes(config));
  files.set('system/fvSolution', renderFvSolution(config));
  files.set('system/topoSetDict', renderTopoSetDict(config));
  files.set('system/createPatchDict', renderCreatePatchDict(config));

  // constant/
  files.set('constant/turbulenceProperties', renderTurbulenceProperties(config));

  if (buoyant) {
    files.set('constant/g', renderGravity(config));
    files.set('constant/thermophysicalProperties', renderThermophysicalProperties());

    // 0/ — buoyantSimpleFoam field set
    files.set('0/U', renderFieldBC(config, 'U'));
    files.set('0/T', renderFieldBC(config, 'T'));
    files.set('0/k', renderFieldBC(config, 'k'));
    files.set('0/epsilon', renderFieldBC(config, 'epsilon'));
    files.set('0/p_rgh', renderPRgh(config));
    files.set('0/p', renderBuoyantP(config));
    files.set('0/alphat', renderAlphat(config));
    files.set('0/nut', renderNut(config));
  } else {
    files.set('constant/transportProperties', renderTransportProperties());

    // 0/ — simpleFoam field set (isothermal)
    files.set('0/U', renderFieldBC(config, 'U'));
    files.set('0/p', renderFieldBC(config, 'p'));
    files.set('0/k', renderFieldBC(config, 'k'));
    files.set('0/epsilon', renderFieldBC(config, 'epsilon'));
    files.set('0/nut', renderNut(config));
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

/** Map a semantic patch role to the OpenFOAM createPatch patch type. */
function mapFoamType(role: BoundaryPatchType): 'patch' | 'wall' {
  return role === 'inlet' || role === 'outlet' ? 'patch' : 'wall';
}

/**
 * Axis-aligned bounding box (m) selecting a patch's boundary faces via
 * boxToFace. Each geometry-builder patch is single-direction, so we collapse
 * the box to a thin slab at the correct wall and span the tangential cells.
 */
function patchFaceBox(
  patch: BoundaryPatch,
  cs: number,
  extents: Vec3,
): { min: Vec3; max: Vec3 } {
  const dir = patch.faces[0].face;
  let iMin = Infinity, iMax = -Infinity;
  let jMin = Infinity, jMax = -Infinity;
  let kMin = Infinity, kMax = -Infinity;
  for (const f of patch.faces) {
    iMin = Math.min(iMin, f.i); iMax = Math.max(iMax, f.i);
    jMin = Math.min(jMin, f.j); jMax = Math.max(jMax, f.j);
    kMin = Math.min(kMin, f.k); kMax = Math.max(kMax, f.k);
  }
  const e = cs * 0.25;
  let xlo = iMin * cs - e, xhi = (iMax + 1) * cs + e;
  let ylo = jMin * cs - e, yhi = (jMax + 1) * cs + e;
  let zlo = kMin * cs - e, zhi = (kMax + 1) * cs + e;

  switch (dir) {
    case '-x': xlo = -e; xhi = e; break;
    case '+x': xlo = extents.x - e; xhi = extents.x + e; break;
    case '-y': ylo = -e; yhi = e; break;
    case '+y': ylo = extents.y - e; yhi = extents.y + e; break;
    case '-z': zlo = -e; zhi = e; break;
    case '+z': zlo = extents.z - e; zhi = extents.z + e; break;
  }

  return { min: { x: xlo, y: ylo, z: zlo }, max: { x: xhi, y: yhi, z: zhi } };
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
  physics: PhysicsSetup,
  patches: BoundaryPatch[],
) {
  const hasInlet = patches.some((p) => p.type === 'inlet');
  const buoyant = physics.buoyancy;

  // buoyantSimpleFoam solves p_rgh (not p); simpleFoam solves p.
  const pressureSolver = { solver: 'GAMG', preconditioner: 'none', tolerance: 1e-6, relTol: 0.01 } as const;
  const solvers: Record<string, { solver: string; preconditioner?: string; tolerance: number; relTol: number }> = {
    U: { solver: 'smoothSolver', preconditioner: 'symGaussSeidel', tolerance: 1e-6, relTol: 0.1 },
    T: { solver: 'smoothSolver', preconditioner: 'symGaussSeidel', tolerance: 1e-6, relTol: 0.1 },
    k: { solver: 'smoothSolver', preconditioner: 'symGaussSeidel', tolerance: 1e-8, relTol: 0.1 },
    epsilon: { solver: 'smoothSolver', preconditioner: 'symGaussSeidel', tolerance: 1e-8, relTol: 0.1 },
  };
  if (buoyant) {
    solvers.p_rgh = pressureSolver;
    solvers.h = { solver: 'smoothSolver', preconditioner: 'symGaussSeidel', tolerance: 1e-6, relTol: 0.1 };
  } else {
    solvers.p = pressureSolver;
  }

  const relaxationFactors: Record<string, number> = {
    U: solver.relaxation.velocity,
    T: solver.relaxation.temperature,
    k: solver.relaxation.turbulence,
    epsilon: solver.relaxation.turbulence,
  };
  if (buoyant) {
    relaxationFactors.p_rgh = solver.relaxation.pressure;
    relaxationFactors.h = solver.relaxation.temperature;
  } else {
    relaxationFactors.p = solver.relaxation.pressure;
  }

  return {
    solvers,
    algorithms: {
      SIMPLE: {
        nNonOrthogonalCorrectors: 1,
        pRefCell: 0,
        pRefValue: hasInlet ? 0 : 0,
      },
    },
    relaxationFactors,
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
      case 'symmetry':
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

  // Six generic box faces. createPatch re-assigns matched faces to the named
  // patches; whatever is left stays here as a wall (safe no-slip default).
  const boundary = `    box_xmin
    {
        type wall;
        faces ( (0 4 7 3) );
    }
    box_xmax
    {
        type wall;
        faces ( (1 2 6 5) );
    }
    box_ymin
    {
        type wall;
        faces ( (0 1 5 4) );
    }
    box_ymax
    {
        type wall;
        faces ( (3 7 6 2) );
    }
    box_zmin
    {
        type wall;
        faces ( (0 3 2 1) );
    }
    box_zmax
    {
        type wall;
        faces ( (4 5 6 7) );
    }`;

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
${boundary}
);

mergePatchPairs
(
);
`;
}

function renderTopoSetDict(config: OpenFOAMCaseConfig): string {
  const patches = config.namedPatches ?? [];
  const actions = patches.map((p) => {
    const { min, max } = p.box;
    return `    {
        name    ${p.name}_faces;
        type    faceSet;
        action  new;
        source  boxToFace;
        sourceInfo
        {
            box (${min.x} ${min.y} ${min.z}) (${max.x} ${max.y} ${max.z});
        }
    }`;
  }).join('\n');

  return `${foamHeader('dictionary', 'topoSetDict', 'system')}
actions
(
${actions}
);
`;
}

function renderCreatePatchDict(config: OpenFOAMCaseConfig): string {
  const patches = config.namedPatches ?? [];
  // Order preserved from config.namedPatches — see the "do not reorder" note.
  const entries = patches.map((p) => `    {
        name ${p.name};
        patchInfo
        {
            type ${p.foamType};
        }
        constructFrom set;
        set ${p.name}_faces;
    }`).join('\n');

  return `${foamHeader('dictionary', 'createPatchDict', 'system')}
pointSync false;

patches
(
${entries}
);
`;
}

function renderGravity(config: OpenFOAMCaseConfig): string {
  const g = config.gravity ?? { x: 0, y: 0, z: -9.81 };
  return `${foamHeader('uniformDimensionedVectorField', 'g', 'constant')}
dimensions      [0 1 -2 0 0 0 0];
value           (${g.x} ${g.y} ${g.z});
`;
}

function renderThermophysicalProperties(): string {
  return `${foamHeader('dictionary', 'thermophysicalProperties', 'constant')}
thermoType
{
    type            heRhoThermo;
    mixture         pureMixture;
    transport       const;
    thermo          hConst;
    equationOfState perfectGas;
    specie          specie;
    energy          sensibleEnthalpy;
}

mixture
{
    specie
    {
        molWeight       28.96;
    }
    thermodynamics
    {
        Cp              1004.5;
        Hf              0;
    }
    transport
    {
        mu              1.8e-05;
        Pr              0.71;
    }
}
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

function renderTransportProperties(): string {
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

// ── Derived buoyant fields (synthesized from patch roles) ────

/** Render a scalar field whose BCs are derived per patch role. */
function renderDerivedField(
  config: OpenFOAMCaseConfig,
  opts: {
    field: string;
    className: string;
    dimensions: string;
    internalField: string;
    bcFor: (role: BoundaryPatchType) => { type: string; value?: string };
  },
): string {
  const patches = config.namedPatches ?? [];
  let boundaryBlock = '';
  for (const p of patches) {
    const bc = opts.bcFor(p.role);
    boundaryBlock += `    ${p.name}\n    {\n        type            ${bc.type};\n`;
    if (bc.value) boundaryBlock += `        value           ${bc.value};\n`;
    boundaryBlock += `    }\n`;
  }

  return `${foamHeader(opts.className, opts.field, '0')}
dimensions      ${opts.dimensions};

internalField   ${opts.internalField};

boundaryField
{
${boundaryBlock}}
`;
}

function renderPRgh(config: OpenFOAMCaseConfig): string {
  return renderDerivedField(config, {
    field: 'p_rgh',
    className: 'volScalarField',
    dimensions: '[1 -1 -2 0 0 0 0]',
    internalField: 'uniform 101325',
    bcFor: (role) => role === 'outlet'
      ? { type: 'fixedValue', value: 'uniform 101325' }
      : { type: 'fixedFluxPressure', value: 'uniform 101325' },
  });
}

function renderBuoyantP(config: OpenFOAMCaseConfig): string {
  // p is calculated from p_rgh by buoyantSimpleFoam.
  return renderDerivedField(config, {
    field: 'p',
    className: 'volScalarField',
    dimensions: '[1 -1 -2 0 0 0 0]',
    internalField: 'uniform 101325',
    bcFor: () => ({ type: 'calculated', value: 'uniform 101325' }),
  });
}

function renderAlphat(config: OpenFOAMCaseConfig): string {
  return renderDerivedField(config, {
    field: 'alphat',
    className: 'volScalarField',
    dimensions: '[1 -1 -1 0 0 0 0]',
    internalField: 'uniform 0',
    bcFor: (role) => role === 'wall' || role === 'fixedTemperature' || role === 'heatFlux'
      ? { type: 'compressible::alphatWallFunction', value: 'uniform 0' }
      : { type: 'calculated', value: 'uniform 0' },
  });
}

function renderNut(config: OpenFOAMCaseConfig): string {
  return renderDerivedField(config, {
    field: 'nut',
    className: 'volScalarField',
    dimensions: '[0 2 -1 0 0 0 0]',
    internalField: 'uniform 0',
    bcFor: (role) => role === 'wall' || role === 'fixedTemperature' || role === 'heatFlux'
      ? { type: 'nutkWallFunction', value: 'uniform 0' }
      : { type: 'calculated', value: 'uniform 0' },
  });
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

/**
 * Sanitize a boundary-patch name for OpenFOAM. Allows letters, digits,
 * underscore and hyphen — hyphens are preserved so UUID-bearing vent patch
 * names (e.g. hvac_supply_3f2a-...) survive intact and still match the
 * boundary-field entries. (The export smoke test asserts hyphen survival.)
 */
function sanitizePatchName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}
