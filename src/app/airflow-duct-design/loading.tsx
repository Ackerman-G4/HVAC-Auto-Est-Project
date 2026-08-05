import { PageHeaderSkeleton, StatRowSkeleton } from '@/components/ui/route-skeletons';

export default function SectionLoading() {
  return (
    <div className="px-2 py-2">
      <PageHeaderSkeleton />
      <StatRowSkeleton />
    </div>
  );
}
