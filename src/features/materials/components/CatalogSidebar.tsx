'use client';

import { ClipboardList, Layers3, Package, Factory } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatPHP } from '@/lib/utils/format-currency';

interface CatalogSidebarProps {
  loading: boolean;
  materialsCount: number;
  suppliersCount: number;
  averageMaterialPrice: number;
  categoriesCount: number;
  supplierTypesCount: number;
}

export function CatalogSidebar({
  loading,
  materialsCount,
  suppliersCount,
  averageMaterialPrice,
  categoriesCount,
  supplierTypesCount,
}: CatalogSidebarProps) {
  return (
    <div className="space-y-4">
      <Card className="panel-glass border-border/70 bg-primary/5 shadow-sm">
        <CardHeader>
          <CardTitle className="text-[13px] flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-accent" /> Catalog Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="rounded-sm border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Materials</p>
            <p className="text-xl font-semibold tabular-nums">{loading ? '—' : materialsCount}</p>
          </div>
          <div className="rounded-sm border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Suppliers</p>
            <p className="text-xl font-semibold tabular-nums">{loading ? '—' : suppliersCount}</p>
          </div>
          <div className="rounded-sm border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Avg Material Price</p>
            <p className="text-xl font-semibold tabular-nums">{loading ? '—' : formatPHP(averageMaterialPrice)}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="panel-glass border-border/70 bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-[13px] flex items-center gap-2">
            <Layers3 className="w-4 h-4 text-muted-foreground" /> Coverage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-[12px] text-muted-foreground">
          <div className="flex items-center justify-between rounded-sm border border-border bg-secondary/50 px-3.5 py-2.5">
            <span className="flex items-center gap-2"><Package className="w-3.5 h-3.5" /> Categories</span>
            <span className="font-medium tabular-nums text-foreground">{categoriesCount}</span>
          </div>
          <div className="flex items-center justify-between rounded-sm border border-border bg-secondary/50 px-3.5 py-2.5">
            <span className="flex items-center gap-2"><Factory className="w-3.5 h-3.5" /> Supplier Types</span>
            <span className="font-medium tabular-nums text-foreground">{supplierTypesCount}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
