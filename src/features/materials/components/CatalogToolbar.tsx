'use client';

import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';
import { formatCategory } from '../helpers';

interface CatalogToolbarProps {
  activeTab: string;
  search: string;
  setSearch: (value: string) => void;
  onSearch: () => void;
  categories: string[];
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  supplierTypes: string[];
  supplierTypeFilter: string;
  setSupplierTypeFilter: (value: string) => void;
  canManageCatalog: boolean;
  onAdd: () => void;
}

export function CatalogToolbar({
  activeTab,
  search,
  setSearch,
  onSearch,
  categories,
  categoryFilter,
  setCategoryFilter,
  supplierTypes,
  supplierTypeFilter,
  setSupplierTypeFilter,
  canManageCatalog,
  onAdd,
}: CatalogToolbarProps) {
  return (
    <>
      <div className="mb-4 mt-4 flex flex-col gap-4 rounded-md border border-border bg-card px-4 py-4 shadow-sm sm:flex-row">
        <div className="flex gap-2 flex-1">
          <Input
            placeholder={activeTab === 'materials' ? 'Search materials...' : 'Search suppliers...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            className="flex-1"
          />
          <Button variant="secondary" size="md" onClick={onSearch}>
            <Search className="w-4 h-4" />
          </Button>
        </div>
        {activeTab === 'materials' && categories.length > 0 && (
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            options={[
              { value: '', label: 'All categories' },
              ...categories.map((cat) => ({
                value: cat,
                label: formatCategory(cat),
              })),
            ]}
            className="sm:w-56"
          />
        )}
        {activeTab === 'suppliers' && supplierTypes.length > 0 && (
          <Select
            value={supplierTypeFilter}
            onChange={(e) => setSupplierTypeFilter(e.target.value)}
            options={[
              { value: '', label: 'All types' },
              ...supplierTypes.map((type) => ({
                value: type,
                label: formatCategory(type),
              })),
            ]}
            className="sm:w-56"
          />
        )}
        {canManageCatalog && (
          <Button variant="accent" size="md" onClick={onAdd}>
            <Plus className="mr-2 h-4 w-4" />
            {activeTab === 'materials' ? 'Add Tool' : 'Add Supplier'}
          </Button>
        )}
      </div>

      {/* Category filter pills */}
      {activeTab === 'materials' && categories.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter('')}
            className={cn(
              'rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
              !categoryFilter
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-card text-muted-foreground hover:bg-secondary',
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
              className={cn(
                'rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
                cat === categoryFilter
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-muted-foreground hover:bg-secondary',
              )}
            >
              {formatCategory(cat)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
