import { PageHeaderSkeleton, CardGridSkeleton } from '@/components/ui/route-skeletons';

export default function ProjectsLoading() {
  return (
    <div className="px-2 py-2">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={9} />
    </div>
  );
}
