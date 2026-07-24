import { PageHeaderSkeleton, StatRowSkeleton, CardGridSkeleton } from '@/components/ui/route-skeletons';

export default function RootLoading() {
  return (
    <div className="px-2 py-2">
      <PageHeaderSkeleton />
      <StatRowSkeleton />
      <CardGridSkeleton count={6} />
    </div>
  );
}
