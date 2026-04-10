'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Package,
  MapPin,
  Phone,
  Globe,
  Store,
  Layers3,
  ClipboardList,
  Factory,
  Plus,
  Pencil,
  Trash2,
  ShieldAlert,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { showToast } from '@/components/ui/toast';
import { cardGridVariants, cardItemVariants } from '@/animations/list-variants';
import { formatPHP } from '@/lib/utils/format-currency';
import { safeJsonParse } from '@/lib/utils/safe-json';
import { useAuthStore } from '@/stores/auth-store';
import { authFetch } from '@/lib/api-client';

interface MaterialItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  unitPricePHP: number;
  specification?: string;
  supplierId?: string | null;
  supplier?: { id: string; name: string } | null;
}

interface SupplierItem {
  id: string;
  name: string;
  type: string;
  location: string;
  contactInfo?: string;
  website?: string;
  categories?: string | string[];
  coverageArea?: string;
}

interface MaterialFormState {
  name: string;
  category: string;
  unit: string;
  unitPricePHP: string;
  specification: string;
  supplierId: string;
}

interface SupplierFormState {
  name: string;
  type: string;
  website: string;
  location: string;
  contactInfo: string;
  coverageArea: string;
  categories: string;
}

const defaultMaterialForm: MaterialFormState = {
  name: '',
  category: '',
  unit: 'pc',
  unitPricePHP: '0',
  specification: '',
  supplierId: '',
};

const defaultSupplierForm: SupplierFormState = {
  name: '',
  type: '',
  website: '',
  location: '',
  contactInfo: '',
  coverageArea: '',
  categories: '',
};

function parseSupplierCategories(categories: SupplierItem['categories']): string[] {
  if (Array.isArray(categories)) return categories;
  if (typeof categories !== 'string') return [];

  const parsed = safeJsonParse<unknown>(categories);
  return Array.isArray(parsed) ? parsed : [];
}

function categoriesToInput(categories: SupplierItem['categories']): string {
  return parseSupplierCategories(categories).join(', ');
}

async function parseResponseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: string;
      description?: string;
    };

    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error;
    }

    if (typeof body.description === 'string' && body.description.trim()) {
      return body.description;
    }
  } catch {
    // Ignore response parse errors and use fallback message.
  }

  return fallback;
}

export default function MaterialsPage() {
  const user = useAuthStore((state) => state.user);
  const canManageCatalog = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState('materials');
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [supplierTypes, setSupplierTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [supplierTypeFilter, setSupplierTypeFilter] = useState('');
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [materialDialogMode, setMaterialDialogMode] = useState<'create' | 'edit'>('create');
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [materialForm, setMaterialForm] = useState<MaterialFormState>(defaultMaterialForm);
  const [materialSubmitting, setMaterialSubmitting] = useState(false);
  const [materialDeleteTarget, setMaterialDeleteTarget] = useState<MaterialItem | null>(null);
  const [materialDeleting, setMaterialDeleting] = useState(false);

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierDialogMode, setSupplierDialogMode] = useState<'create' | 'edit'>('create');
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(defaultSupplierForm);
  const [supplierSubmitting, setSupplierSubmitting] = useState(false);
  const [supplierDeleteTarget, setSupplierDeleteTarget] = useState<SupplierItem | null>(null);
  const [supplierDeleting, setSupplierDeleting] = useState(false);

  const fetchCatalogData = useCallback(
    async (
      endpoint: string,
      filters: Record<string, string>,
      showLoading = true,
    ) => {
      if (showLoading) setLoading(true);

      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });

      try {
        const response = await authFetch(`${endpoint}?${params}`);
        return await response.json();
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchMaterials = useCallback(async (showLoading = true) => {
    const data = await fetchCatalogData(
      '/api/materials',
      {
        search,
        category: categoryFilter,
      },
      showLoading,
    );

    setMaterials(data.materials || []);
    setCategories(data.categories || []);
  }, [categoryFilter, fetchCatalogData, search]);

  const fetchSuppliers = useCallback(async (showLoading = true) => {
    const data = await fetchCatalogData(
      '/api/suppliers',
      {
        search,
        type: supplierTypeFilter,
      },
      showLoading,
    );

    setSuppliers(data.suppliers || []);
    setSupplierTypes(data.types || []);
  }, [fetchCatalogData, search, supplierTypeFilter]);

  useEffect(() => {
    if (activeTab === 'materials') fetchMaterials(false);
    else fetchSuppliers(false);
  }, [activeTab, fetchMaterials, fetchSuppliers]);

  const handleSearch = () => {
    if (activeTab === 'materials') fetchMaterials();
    else fetchSuppliers();
  };

  const supplierOptions = useMemo(
    () => [
      { value: '', label: 'No linked supplier' },
      ...suppliers.map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
      })),
    ],
    [suppliers],
  );

  const tabs = [
    { id: 'materials', label: 'Materials', icon: <Package className="w-4 h-4" /> },
    { id: 'suppliers', label: 'Suppliers', icon: <Store className="w-4 h-4" /> },
  ];

  const formatCategory = (cat: string) =>
    cat.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  const averageMaterialPrice = materials.length
    ? materials.reduce((sum, m) => sum + (m.unitPricePHP || 0), 0) / materials.length
    : 0;

  const ensureSuppliersLoaded = async () => {
    if (suppliers.length > 0) {
      return;
    }

    await fetchSuppliers(false);
  };

  const forceCloseMaterialDialog = () => {
    setMaterialDialogOpen(false);
    setEditingMaterialId(null);
    setMaterialForm(defaultMaterialForm);
  };

  const closeMaterialDialog = () => {
    if (materialSubmitting) {
      return;
    }

    forceCloseMaterialDialog();
  };

  const forceCloseSupplierDialog = () => {
    setSupplierDialogOpen(false);
    setEditingSupplierId(null);
    setSupplierForm(defaultSupplierForm);
  };

  const closeSupplierDialog = () => {
    if (supplierSubmitting) {
      return;
    }

    forceCloseSupplierDialog();
  };

  const openCreateMaterialDialog = async () => {
    if (!canManageCatalog) {
      showToast('warning', 'Read-only access', 'Only admins can manage catalog records.');
      return;
    }

    try {
      await ensureSuppliersLoaded();
    } catch {
      showToast('warning', 'Supplier list unavailable', 'You can still save a material without linking a supplier.');
    }

    setMaterialDialogMode('create');
    setEditingMaterialId(null);
    setMaterialForm({
      ...defaultMaterialForm,
      category: categoryFilter || '',
    });
    setMaterialDialogOpen(true);
  };

  const openEditMaterialDialog = async (material: MaterialItem) => {
    if (!canManageCatalog) {
      showToast('warning', 'Read-only access', 'Only admins can manage catalog records.');
      return;
    }

    try {
      await ensureSuppliersLoaded();
    } catch {
      showToast('warning', 'Supplier list unavailable', 'Supplier options may be incomplete in this session.');
    }

    setMaterialDialogMode('edit');
    setEditingMaterialId(material.id);
    setMaterialForm({
      name: material.name,
      category: material.category,
      unit: material.unit,
      unitPricePHP: String(material.unitPricePHP || 0),
      specification: material.specification || '',
      supplierId: material.supplierId || material.supplier?.id || '',
    });
    setMaterialDialogOpen(true);
  };

  const openCreateSupplierDialog = () => {
    if (!canManageCatalog) {
      showToast('warning', 'Read-only access', 'Only admins can manage catalog records.');
      return;
    }

    setSupplierDialogMode('create');
    setEditingSupplierId(null);
    setSupplierForm(defaultSupplierForm);
    setSupplierDialogOpen(true);
  };

  const openEditSupplierDialog = (supplier: SupplierItem) => {
    if (!canManageCatalog) {
      showToast('warning', 'Read-only access', 'Only admins can manage catalog records.');
      return;
    }

    setSupplierDialogMode('edit');
    setEditingSupplierId(supplier.id);
    setSupplierForm({
      name: supplier.name || '',
      type: supplier.type || '',
      website: supplier.website || '',
      location: supplier.location || '',
      contactInfo: supplier.contactInfo || '',
      coverageArea: supplier.coverageArea || '',
      categories: categoriesToInput(supplier.categories),
    });
    setSupplierDialogOpen(true);
  };

  const handleMaterialSubmit = async () => {
    if (!canManageCatalog) {
      showToast('warning', 'Read-only access', 'Only admins can manage catalog records.');
      return;
    }

    const name = materialForm.name.trim();
    const category = materialForm.category.trim();
    const unit = materialForm.unit.trim();
    const specification = materialForm.specification.trim();
    const unitPricePHP = Number(materialForm.unitPricePHP);

    if (!name || !category || !unit) {
      showToast('warning', 'Missing required values', 'Material name, category, and unit are required.');
      return;
    }

    if (!Number.isFinite(unitPricePHP) || unitPricePHP < 0) {
      showToast('warning', 'Invalid unit price', 'Unit price must be a non-negative number.');
      return;
    }

    const isEdit = materialDialogMode === 'edit' && !!editingMaterialId;
    const endpoint = isEdit ? `/api/materials/${editingMaterialId}` : '/api/materials';

    setMaterialSubmitting(true);
    try {
      const response = await authFetch(endpoint, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category,
          unit,
          unitPricePHP,
          specification,
          supplierId: materialForm.supplierId || null,
        }),
      });

      if (!response.ok) {
        const detail = await parseResponseError(response, 'Unable to save material.');
        showToast('error', 'Material save failed', detail);
        return;
      }

      forceCloseMaterialDialog();
      await fetchMaterials(false);
      showToast('success', isEdit ? 'Material updated' : 'Material created');
    } catch {
      showToast('error', 'Material save failed', 'Please try again in a few seconds.');
    } finally {
      setMaterialSubmitting(false);
    }
  };

  const handleSupplierSubmit = async () => {
    if (!canManageCatalog) {
      showToast('warning', 'Read-only access', 'Only admins can manage catalog records.');
      return;
    }

    const name = supplierForm.name.trim();
    const type = supplierForm.type.trim();

    if (!name || !type) {
      showToast('warning', 'Missing required values', 'Supplier name and type are required.');
      return;
    }

    const categories = supplierForm.categories
      .split(',')
      .map((categoryItem) => categoryItem.trim())
      .filter(Boolean);

    const isEdit = supplierDialogMode === 'edit' && !!editingSupplierId;
    const endpoint = isEdit ? `/api/suppliers/${editingSupplierId}` : '/api/suppliers';

    setSupplierSubmitting(true);
    try {
      const response = await authFetch(endpoint, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type,
          website: supplierForm.website.trim(),
          location: supplierForm.location.trim(),
          contactInfo: supplierForm.contactInfo.trim(),
          coverageArea: supplierForm.coverageArea.trim(),
          categories,
        }),
      });

      if (!response.ok) {
        const detail = await parseResponseError(response, 'Unable to save supplier.');
        showToast('error', 'Supplier save failed', detail);
        return;
      }

      forceCloseSupplierDialog();
      await Promise.all([fetchSuppliers(false), fetchMaterials(false)]);
      showToast('success', isEdit ? 'Supplier updated' : 'Supplier created');
    } catch {
      showToast('error', 'Supplier save failed', 'Please try again in a few seconds.');
    } finally {
      setSupplierSubmitting(false);
    }
  };

  const handleDeleteMaterial = async () => {
    if (!materialDeleteTarget) {
      return;
    }

    setMaterialDeleting(true);
    try {
      const response = await authFetch(`/api/materials/${materialDeleteTarget.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const detail = await parseResponseError(response, 'Unable to delete material.');
        showToast('error', 'Delete failed', detail);
        return;
      }

      setMaterialDeleteTarget(null);
      await fetchMaterials(false);
      showToast('success', 'Material deleted');
    } catch {
      showToast('error', 'Delete failed', 'Unable to delete material at this time.');
    } finally {
      setMaterialDeleting(false);
    }
  };

  const handleDeleteSupplier = async () => {
    if (!supplierDeleteTarget) {
      return;
    }

    setSupplierDeleting(true);
    try {
      const response = await authFetch(`/api/suppliers/${supplierDeleteTarget.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const detail = await parseResponseError(response, 'Unable to delete supplier.');
        showToast('error', 'Delete failed', detail);
        return;
      }

      setSupplierDeleteTarget(null);
      await Promise.all([fetchSuppliers(false), fetchMaterials(false)]);
      showToast('success', 'Supplier deleted');
    } catch {
      showToast('error', 'Delete failed', 'Unable to delete supplier at this time.');
    } finally {
      setSupplierDeleting(false);
    }
  };

  return (
    <PageWrapper>
      <PageHeader
        title="Materials & Suppliers"
        description="Browse HVAC materials catalog and Philippine suppliers directory"
      />

      {!canManageCatalog && (
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

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
      <Card className="mb-5 border-border bg-primary/5 shadow-sm">
        <CardContent className="py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Catalog Workspace</p>
              <p className="text-sm text-foreground font-medium mt-0.5">
                Keep material pricing and supplier options aligned for faster project costing.
              </p>
            </div>
            <div className="text-sm text-muted-foreground tabular-nums">
              {activeTab === 'materials'
                ? `${materials.length} materials indexed`
                : `${suppliers.length} suppliers indexed`}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3">
          <div className="mb-4 mt-4 flex flex-col gap-4 rounded-xl border border-border bg-card px-4 py-4 shadow-sm sm:flex-row">
            <div className="flex gap-2 flex-1">
              <Input
                placeholder={activeTab === 'materials' ? 'Search materials...' : 'Search suppliers...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1"
              />
              <Button variant="secondary" size="md" onClick={handleSearch}>
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
              <Button
                variant="accent"
                size="md"
                onClick={() => {
                  if (activeTab === 'materials') {
                    void openCreateMaterialDialog();
                  } else {
                    openCreateSupplierDialog();
                  }
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {activeTab === 'materials' ? 'Add Material' : 'Add Supplier'}
              </Button>
            )}
          </div>

          {/* Materials Tab */}
          {activeTab === 'materials' && (
            <>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : materials.length === 0 ? (
                <EmptyState
                  icon={<Package className="w-12 h-12" />}
                  title="No materials found"
                  description="Try a different search term or category"
                />
              ) : (
                <Card className="border-border bg-card shadow-sm">
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Material</th>
                          <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:table-cell">Category</th>
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
                                <Badge size="sm" className="mt-1">{formatCategory(mat.category)}</Badge>
                              </div>
                            </td>
                            <td className="hidden px-4 py-3 sm:table-cell">
                              <Badge size="sm">{formatCategory(mat.category)}</Badge>
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
                                    onClick={() => {
                                      void openEditMaterialDialog(mat);
                                    }}
                                  >
                                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-9 px-3.5"
                                    onClick={() => setMaterialDeleteTarget(mat)}
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
              )}
            </>
          )}

          {/* Suppliers Tab */}
          {activeTab === 'suppliers' && (
            <>
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40" />)}
                </div>
              ) : suppliers.length === 0 ? (
                <EmptyState
                  icon={<Store className="w-12 h-12" />}
                  title="No suppliers found"
                  description="Try a different search or filter"
                />
              ) : (
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
                        <Card className="h-full border-border bg-card shadow-sm">
                          <CardContent className="p-6">
                          <div className="mb-3 flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary">
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
                                onClick={() => openEditSupplierDialog(supplier)}
                              >
                                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="flex-1"
                                onClick={() => setSupplierDeleteTarget(supplier)}
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
              )}
            </>
          )}
        </div>

        <div className="space-y-4">
          <Card className="border-border bg-primary/5 shadow-sm">
            <CardHeader>
              <CardTitle className="text-[13px] flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-accent" /> Catalog Snapshot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Materials</p>
                <p className="text-xl font-semibold tabular-nums">{loading ? '—' : materials.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Suppliers</p>
                <p className="text-xl font-semibold tabular-nums">{loading ? '—' : suppliers.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Avg Material Price</p>
                <p className="text-xl font-semibold tabular-nums">{loading ? '—' : formatPHP(averageMaterialPrice)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="text-[13px] flex items-center gap-2">
                <Layers3 className="w-4 h-4 text-muted-foreground" /> Coverage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[12px] text-muted-foreground">
              <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3.5 py-2.5">
                <span className="flex items-center gap-2"><Package className="w-3.5 h-3.5" /> Categories</span>
                <span className="font-medium tabular-nums text-foreground">{categories.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3.5 py-2.5">
                <span className="flex items-center gap-2"><Factory className="w-3.5 h-3.5" /> Supplier Types</span>
                <span className="font-medium tabular-nums text-foreground">{supplierTypes.length}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </Tabs>

      <Dialog
        open={materialDialogOpen}
        onClose={closeMaterialDialog}
        title={materialDialogMode === 'create' ? 'Add Material' : 'Edit Material'}
        description="Maintain catalog pricing and supplier linkage for takeoff and costing workflows."
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Material Name"
              value={materialForm.name}
              onChange={(event) => setMaterialForm((prev) => ({ ...prev, name: event.target.value }))}
              maxLength={120}
            />
            <Input
              label="Category"
              value={materialForm.category}
              onChange={(event) => setMaterialForm((prev) => ({ ...prev, category: event.target.value }))}
              maxLength={80}
            />
            <Input
              label="Unit"
              value={materialForm.unit}
              onChange={(event) => setMaterialForm((prev) => ({ ...prev, unit: event.target.value }))}
              maxLength={24}
            />
            <Input
              label="Unit Price (PHP)"
              type="number"
              min={0}
              step={0.01}
              value={materialForm.unitPricePHP}
              onChange={(event) => setMaterialForm((prev) => ({ ...prev, unitPricePHP: event.target.value }))}
              showRangeHint={false}
            />
          </div>

          <Select
            label="Linked Supplier"
            value={materialForm.supplierId}
            onChange={(event) => setMaterialForm((prev) => ({ ...prev, supplierId: event.target.value }))}
            options={supplierOptions}
          />

          <Textarea
            label="Specification"
            value={materialForm.specification}
            onChange={(event) => setMaterialForm((prev) => ({ ...prev, specification: event.target.value }))}
            maxLength={500}
            placeholder="Optional specification details"
          />

          <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
            <Button variant="outline" onClick={closeMaterialDialog} disabled={materialSubmitting}>
              Cancel
            </Button>
            <Button variant="accent" onClick={() => void handleMaterialSubmit()} isLoading={materialSubmitting}>
              {materialDialogMode === 'create' ? 'Create Material' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={supplierDialogOpen}
        onClose={closeSupplierDialog}
        title={supplierDialogMode === 'create' ? 'Add Supplier' : 'Edit Supplier'}
        description="Maintain supplier contacts and category coverage for procurement planning."
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Supplier Name"
              value={supplierForm.name}
              onChange={(event) => setSupplierForm((prev) => ({ ...prev, name: event.target.value }))}
              maxLength={120}
            />
            <Input
              label="Type"
              value={supplierForm.type}
              onChange={(event) => setSupplierForm((prev) => ({ ...prev, type: event.target.value }))}
              maxLength={80}
            />
            <Input
              label="Location"
              value={supplierForm.location}
              onChange={(event) => setSupplierForm((prev) => ({ ...prev, location: event.target.value }))}
              maxLength={200}
            />
            <Input
              label="Website"
              value={supplierForm.website}
              onChange={(event) => setSupplierForm((prev) => ({ ...prev, website: event.target.value }))}
              maxLength={300}
              placeholder="example.com"
            />
          </div>

          <Textarea
            label="Contact Information"
            value={supplierForm.contactInfo}
            onChange={(event) => setSupplierForm((prev) => ({ ...prev, contactInfo: event.target.value }))}
            maxLength={500}
            placeholder="Phone numbers, emails, and points of contact"
          />

          <Input
            label="Coverage Area"
            value={supplierForm.coverageArea}
            onChange={(event) => setSupplierForm((prev) => ({ ...prev, coverageArea: event.target.value }))}
            maxLength={300}
            placeholder="NCR, Central Luzon, CALABARZON"
          />

          <Input
            label="Categories"
            value={supplierForm.categories}
            onChange={(event) => setSupplierForm((prev) => ({ ...prev, categories: event.target.value }))}
            maxLength={500}
            placeholder="ducting, refrigerant, controls"
            hint="Comma-separated values"
          />

          <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
            <Button variant="outline" onClick={closeSupplierDialog} disabled={supplierSubmitting}>
              Cancel
            </Button>
            <Button variant="accent" onClick={() => void handleSupplierSubmit()} isLoading={supplierSubmitting}>
              {supplierDialogMode === 'create' ? 'Create Supplier' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!materialDeleteTarget}
        onClose={() => setMaterialDeleteTarget(null)}
        onConfirm={() => {
          void handleDeleteMaterial();
        }}
        title="Delete Material"
        description={
          materialDeleteTarget
            ? `Delete ${materialDeleteTarget.name}? This action cannot be undone.`
            : 'Delete this material?'
        }
        confirmText="Delete"
        variant="destructive"
        isLoading={materialDeleting}
      />

      <ConfirmDialog
        open={!!supplierDeleteTarget}
        onClose={() => setSupplierDeleteTarget(null)}
        onConfirm={() => {
          void handleDeleteSupplier();
        }}
        title="Delete Supplier"
        description={
          supplierDeleteTarget
            ? `Delete ${supplierDeleteTarget.name}? Linked materials will remain without a supplier reference.`
            : 'Delete this supplier?'
        }
        confirmText="Delete"
        variant="destructive"
        isLoading={supplierDeleting}
      />
    </PageWrapper>
  );
}
