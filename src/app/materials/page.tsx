'use client';

import { Package, Store, ShieldAlert } from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useMaterialsCatalog } from '@/features/materials/useMaterialsCatalog';
import { CatalogToolbar } from '@/features/materials/components/CatalogToolbar';
import { MaterialsTable } from '@/features/materials/components/MaterialsTable';
import { SupplierGrid } from '@/features/materials/components/SupplierGrid';
import { CatalogSidebar } from '@/features/materials/components/CatalogSidebar';
import { MaterialDialog } from '@/features/materials/components/MaterialDialog';
import { SupplierDialog } from '@/features/materials/components/SupplierDialog';

const tabs = [
  { id: 'materials', label: 'Materials', icon: <Package className="w-4 h-4" /> },
  { id: 'suppliers', label: 'Suppliers', icon: <Store className="w-4 h-4" /> },
];

export default function MaterialsPage() {
  const c = useMaterialsCatalog();

  return (
    <PageWrapper>
      <PageHeader
        title="Tools Inventory"
        description="Browse HVAC tools & materials catalog and Philippine suppliers directory"
      />

      {!c.canManageCatalog && (
        <Card className="mb-6 border-[rgba(206,161,74,0.45)] bg-[rgba(206,161,74,0.12)]">
          <CardContent className="py-3">
            <div className="flex items-start gap-2 text-sm text-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-accent" />
              <p>
                Read-only mode: material and supplier updates are restricted to admin accounts.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs tabs={tabs} activeTab={c.activeTab} onTabChange={c.setActiveTab}>
        <Card className="panel-glass mb-5 border-border/70 bg-primary/5 shadow-sm">
          <CardContent className="py-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Catalog Workspace</p>
                <p className="text-sm text-foreground font-medium mt-0.5">
                  Keep material pricing and supplier options aligned for faster project costing.
                </p>
              </div>
              <div className="text-sm text-muted-foreground tabular-nums">
                {c.activeTab === 'materials'
                  ? `${c.materials.length} materials indexed`
                  : `${c.suppliers.length} suppliers indexed`}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="xl:col-span-3">
            <CatalogToolbar
              activeTab={c.activeTab}
              search={c.search}
              setSearch={c.setSearch}
              onSearch={c.handleSearch}
              categories={c.categories}
              categoryFilter={c.categoryFilter}
              setCategoryFilter={c.setCategoryFilter}
              supplierTypes={c.supplierTypes}
              supplierTypeFilter={c.supplierTypeFilter}
              setSupplierTypeFilter={c.setSupplierTypeFilter}
              canManageCatalog={c.canManageCatalog}
              onAdd={() => {
                if (c.activeTab === 'materials') {
                  void c.openCreateMaterialDialog();
                } else {
                  c.openCreateSupplierDialog();
                }
              }}
            />

            {c.activeTab === 'materials' && (
              <MaterialsTable
                materials={c.materials}
                loading={c.loading}
                canManageCatalog={c.canManageCatalog}
                onEdit={(mat) => void c.openEditMaterialDialog(mat)}
                onDelete={c.setMaterialDeleteTarget}
              />
            )}

            {c.activeTab === 'suppliers' && (
              <SupplierGrid
                suppliers={c.suppliers}
                loading={c.loading}
                canManageCatalog={c.canManageCatalog}
                onEdit={c.openEditSupplierDialog}
                onDelete={c.setSupplierDeleteTarget}
              />
            )}
          </div>

          <CatalogSidebar
            loading={c.loading}
            materialsCount={c.materials.length}
            suppliersCount={c.suppliers.length}
            averageMaterialPrice={c.averageMaterialPrice}
            categoriesCount={c.categories.length}
            supplierTypesCount={c.supplierTypes.length}
          />
        </div>
      </Tabs>

      <MaterialDialog
        open={c.materialDialogOpen}
        mode={c.materialDialogMode}
        form={c.materialForm}
        setForm={c.setMaterialForm}
        submitting={c.materialSubmitting}
        supplierOptions={c.supplierOptions}
        onClose={c.closeMaterialDialog}
        onSubmit={() => void c.handleMaterialSubmit()}
      />

      <SupplierDialog
        open={c.supplierDialogOpen}
        mode={c.supplierDialogMode}
        form={c.supplierForm}
        setForm={c.setSupplierForm}
        submitting={c.supplierSubmitting}
        onClose={c.closeSupplierDialog}
        onSubmit={() => void c.handleSupplierSubmit()}
      />

      <ConfirmDialog
        open={!!c.materialDeleteTarget}
        onClose={() => c.setMaterialDeleteTarget(null)}
        onConfirm={() => {
          void c.handleDeleteMaterial();
        }}
        title="Delete Material"
        description={
          c.materialDeleteTarget
            ? `Delete ${c.materialDeleteTarget.name}? This action cannot be undone.`
            : 'Delete this material?'
        }
        confirmText="Delete"
        variant="destructive"
        isLoading={c.materialDeleting}
      />

      <ConfirmDialog
        open={!!c.supplierDeleteTarget}
        onClose={() => c.setSupplierDeleteTarget(null)}
        onConfirm={() => {
          void c.handleDeleteSupplier();
        }}
        title="Delete Supplier"
        description={
          c.supplierDeleteTarget
            ? `Delete ${c.supplierDeleteTarget.name}? Linked materials will remain without a supplier reference.`
            : 'Delete this supplier?'
        }
        confirmText="Delete"
        variant="destructive"
        isLoading={c.supplierDeleting}
      />
    </PageWrapper>
  );
}
