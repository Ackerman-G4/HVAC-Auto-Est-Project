'use client';

import { useMemo } from 'react';
import { Package, Pencil, Trash2 } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable } from '@/components/ui/data-table';
import { formatPHP } from '@/lib/utils/format-currency';
import { categoryBadgeVariant, formatCategory } from '../helpers';
import type { MaterialItem } from '../types';

interface MaterialsTableProps {
  materials: MaterialItem[];
  loading: boolean;
  canManageCatalog: boolean;
  onEdit: (material: MaterialItem) => void;
  onDelete: (material: MaterialItem) => void;
}

export function MaterialsTable({
  materials,
  loading,
  canManageCatalog,
  onEdit,
  onDelete,
}: MaterialsTableProps) {
  const columns = useMemo<ColumnDef<MaterialItem, unknown>[]>(() => {
    const base: ColumnDef<MaterialItem, unknown>[] = [
      {
        accessorKey: 'name',
        header: 'Material',
        cell: ({ row }) => {
          const mat = row.original;
          return (
            <div>
              <div className="font-medium text-foreground">{mat.name}</div>
              {mat.supplier ? (
                <span className="text-[11px] text-muted-foreground">{mat.supplier.name}</span>
              ) : null}
              {/* The category column is hidden on small screens, so it rides
                  along with the name there rather than disappearing. */}
              <div className="sm:hidden">
                <Badge size="sm" variant={categoryBadgeVariant(mat.category)} className="mt-1">
                  {formatCategory(mat.category)}
                </Badge>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'category',
        header: 'Category',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => (
          <Badge size="sm" variant={categoryBadgeVariant(row.original.category)}>
            {formatCategory(row.original.category)}
          </Badge>
        ),
      },
      {
        accessorKey: 'location',
        header: 'Location',
        meta: { hideBelow: 'lg' },
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.location || '—'}</span>
        ),
      },
      {
        accessorKey: 'specification',
        header: 'Specifications',
        meta: { hideBelow: 'md' },
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.specification || '—'}</span>
        ),
      },
      {
        accessorKey: 'unit',
        header: 'Unit',
        meta: { numeric: true },
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.unit}</span>,
      },
      {
        accessorKey: 'unitPricePHP',
        header: 'Price',
        meta: { numeric: true },
        cell: ({ row }) => (
          <span className="font-medium">{formatPHP(row.original.unitPricePHP)}</span>
        ),
      },
    ];

    if (canManageCatalog) {
      base.push({
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { numeric: true },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" className="h-9 px-3.5" onClick={() => onEdit(row.original)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
            <Button variant="destructive" size="sm" className="h-9 px-3.5" onClick={() => onDelete(row.original)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        ),
      });
    }

    return base;
  }, [canManageCatalog, onEdit, onDelete]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (materials.length === 0) {
    return (
      <EmptyState
        icon={<Package className="w-12 h-12" />}
        title="No materials found"
        description="Try a different search term or category"
      />
    );
  }

  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardContent className="p-0">
        {/* Columns are now sortable, which the hand-rolled version was not. */}
        <DataTable
          data={materials}
          columns={columns}
          caption="Materials catalog"
          getRowId={(m) => m.id}
        />
      </CardContent>
    </Card>
  );
}
