'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { showToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { authFetch } from '@/lib/api-client';
import { defaultMaterialForm, defaultSupplierForm } from './constants';
import { categoriesToInput, parseResponseError } from './helpers';
import type {
  MaterialFormState,
  MaterialItem,
  SupplierFormState,
  SupplierItem,
} from './types';

/**
 * Owns all catalog state, data fetching, and mutation handlers for the
 * Materials page. Extracted verbatim from the former monolith page so the
 * page component can stay a thin composition shell — behavior unchanged.
 */
export function useMaterialsCatalog() {
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
      location: material.location || '',
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
          location: materialForm.location.trim(),
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

  return {
    // access
    canManageCatalog,
    // tab + data
    activeTab,
    setActiveTab,
    materials,
    suppliers,
    categories,
    supplierTypes,
    loading,
    averageMaterialPrice,
    supplierOptions,
    // search + filters
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    supplierTypeFilter,
    setSupplierTypeFilter,
    handleSearch,
    // material dialog
    materialDialogOpen,
    materialDialogMode,
    materialForm,
    setMaterialForm,
    materialSubmitting,
    openCreateMaterialDialog,
    openEditMaterialDialog,
    closeMaterialDialog,
    handleMaterialSubmit,
    // supplier dialog
    supplierDialogOpen,
    supplierDialogMode,
    supplierForm,
    setSupplierForm,
    supplierSubmitting,
    openCreateSupplierDialog,
    openEditSupplierDialog,
    closeSupplierDialog,
    handleSupplierSubmit,
    // deletes
    materialDeleteTarget,
    setMaterialDeleteTarget,
    materialDeleting,
    handleDeleteMaterial,
    supplierDeleteTarget,
    setSupplierDeleteTarget,
    supplierDeleting,
    handleDeleteSupplier,
  };
}
