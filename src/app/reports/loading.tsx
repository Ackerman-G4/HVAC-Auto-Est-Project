import { PageHeaderSkeleton, DataTableSkeleton } from '@/components/ui/route-skeletons';

export default function SectionLoading() {
  return (
    <div className="px-2 py-2">
      <PageHeaderSkeleton />
      <DataTableSkeleton rows={10} />
    </div>
  );
}
