'use client';

import dynamic from 'next/dynamic';
import type { ProjectData } from '../types';

const BuildingViewer3D = dynamic(() => import('@/components/building/BuildingViewer3D'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-125 border border-border rounded-xl bg-secondary/30">
      <div className="text-center text-muted-foreground">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm">Loading 3D viewer...</p>
      </div>
    </div>
  ),
});

interface ThreeDTabProps {
  project: ProjectData;
  active: boolean;
}

export function ThreeDTab({ project, active }: ThreeDTabProps) {
  return (
    <div className={active ? 'block' : 'hidden'}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">3D Building Visualization</h3>
      </div>
      <BuildingViewer3D
        floors={project.floors}
        buildingType={project.buildingType}
        projectName={project.name}
      />
    </div>
  );
}
