'use client';

import { motion } from 'framer-motion';
import { Store, MapPin, Phone, Globe, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cardGridVariants, cardItemVariants } from '@/animations/list-variants';
import { formatCategory, parseSupplierCategories } from '../helpers';
import type { SupplierItem } from '../types';

interface SupplierGridProps {
  suppliers: SupplierItem[];
  loading: boolean;
  canManageCatalog: boolean;
  onEdit: (supplier: SupplierItem) => void;
  onDelete: (supplier: SupplierItem) => void;
}

export function SupplierGrid({
  suppliers,
  loading,
  canManageCatalog,
  onEdit,
  onDelete,
}: SupplierGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  if (suppliers.length === 0) {
    return (
      <EmptyState
        icon={<Store className="w-12 h-12" />}
        title="No suppliers found"
        description="Try a different search or filter"
      />
    );
  }

  return (
    <motion.div
      variants={cardGridVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4"
    >
      {suppliers.map((supplier) => {
        const cats = parseSupplierCategories(supplier.categories);

        return (
          <motion.div key={supplier.id} variants={cardItemVariants}>
            <Card className="panel-glass h-full border-border/70 bg-card shadow-sm">
              <CardContent className="p-6">
                <div className="mb-3 flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-border bg-secondary">
                    <Store className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {supplier.name}
                    </h3>
                    <Badge size="sm" className="mt-1">{formatCategory(supplier.type)}</Badge>
                  </div>
                </div>
                <div className="space-y-1.5 text-[13px]">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>{supplier.location}</span>
                  </div>
                  {supplier.contactInfo && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{supplier.contactInfo}</span>
                    </div>
                  )}
                  {supplier.website && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <a
                        href={supplier.website.startsWith('http') ? supplier.website : `https://${supplier.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline truncate"
                      >
                        {supplier.website}
                      </a>
                    </div>
                  )}
                </div>
                {cats.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {cats.slice(0, 5).map((cat: string) => (
                      <Badge key={cat} size="sm" variant="outline">{cat.replace(/_/g, ' ')}</Badge>
                    ))}
                    {cats.length > 5 && (
                      <Badge size="sm" variant="outline">+{cats.length - 5}</Badge>
                    )}
                  </div>
                )}
                {canManageCatalog && (
                  <div className="mt-4 flex gap-2 border-t border-border pt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => onEdit(supplier)}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={() => onDelete(supplier)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
