'use client';

import { motion } from 'framer-motion';
import { Package, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
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
    <Card className="panel-glass border-border/70 bg-card shadow-sm">
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Material</th>
              <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:table-cell">Category</th>
              <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground lg:table-cell">Location</th>
              <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground md:table-cell">Specifications</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Unit</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Price</th>
              {canManageCatalog && (
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {materials.map((mat, idx) => (
              <motion.tr
                key={mat.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.02 }}
                className="border-b border-border hover:bg-secondary/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="text-[13px] font-medium text-foreground">{mat.name}</div>
                  {mat.supplier && (
                    <span className="text-[11px] text-muted-foreground">{mat.supplier.name}</span>
                  )}
                  <div className="sm:hidden">
                    <Badge size="sm" variant={categoryBadgeVariant(mat.category)} className="mt-1">{formatCategory(mat.category)}</Badge>
                  </div>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <Badge size="sm" variant={categoryBadgeVariant(mat.category)}>{formatCategory(mat.category)}</Badge>
                </td>
                <td className="hidden px-4 py-3 text-sm text-muted-foreground lg:table-cell">
                  {mat.location || '—'}
                </td>
                <td className="hidden px-4 py-3 text-sm text-muted-foreground md:table-cell">
                  {mat.specification || '—'}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">{mat.unit}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{formatPHP(mat.unitPricePHP)}</td>
                {canManageCatalog && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-9 px-3.5"
                        onClick={() => onEdit(mat)}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-9 px-3.5"
                        onClick={() => onDelete(mat)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </td>
                )}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
