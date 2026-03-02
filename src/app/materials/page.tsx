'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Package,
  MapPin,
  Phone,
  Globe,
  Store,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cardGridVariants, cardItemVariants, listContainerVariants, listItemVariants } from '@/animations/list-variants';
import { formatPHP } from '@/lib/utils/format-currency';

interface MaterialItem {
  name: string;
  category: string;
  unit: string;
  unitPrice: number;
  specifications?: string;
  brand?: string;
}

interface SupplierItem {
  name: string;
  type: string;
  location: string;
  contactInfo?: string;
  website?: string;
  categories?: string[];
  coverageArea?: string;
}

export default function MaterialsPage() {
  const [activeTab, setActiveTab] = useState('materials');
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [supplierTypes, setSupplierTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [supplierTypeFilter, setSupplierTypeFilter] = useState('');

  const fetchMaterials = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (categoryFilter) params.set('category', categoryFilter);

    fetch(`/api/materials?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setMaterials(data.materials || []);
        setCategories(data.categories || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const fetchSuppliers = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (supplierTypeFilter) params.set('type', supplierTypeFilter);

    fetch(`/api/suppliers?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setSuppliers(data.suppliers || []);
        setSupplierTypes(data.types || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'materials') fetchMaterials();
    else fetchSuppliers();
  }, [activeTab, categoryFilter, supplierTypeFilter]);

  const handleSearch = () => {
    if (activeTab === 'materials') fetchMaterials();
    else fetchSuppliers();
  };

  const tabs = [
    { id: 'materials', label: 'Materials', icon: <Package className="w-4 h-4" /> },
    { id: 'suppliers', label: 'Suppliers', icon: <Store className="w-4 h-4" /> },
  ];

  const formatCategory = (cat: string) =>
    cat.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <PageWrapper>
      <PageHeader
        title="Materials & Suppliers"
        description="Browse HVAC materials catalog and Philippine suppliers directory"
      />

      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mt-4 mb-4">
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
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2.5 px-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Material</th>
                    <th className="text-left py-2.5 px-3 hidden sm:table-cell text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Category</th>
                    <th className="text-left py-2.5 px-3 hidden md:table-cell text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Specifications</th>
                    <th className="text-right py-2.5 px-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Unit</th>
                    <th className="text-right py-2.5 px-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((mat, idx) => (
                    <motion.tr
                      key={`${mat.category}-${mat.name}-${idx}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.02 }}
                      className="border-b border-border/40 hover:bg-secondary/40 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="text-[13px] font-medium text-foreground">{mat.name}</div>
                        {mat.brand && (
                          <span className="text-[11px] text-muted-foreground">{mat.brand}</span>
                        )}
                        <div className="sm:hidden">
                          <Badge size="sm" className="mt-1">{formatCategory(mat.category)}</Badge>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 hidden sm:table-cell">
                        <Badge size="sm">{formatCategory(mat.category)}</Badge>
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell text-xs text-muted-foreground">
                        {mat.specifications || '—'}
                      </td>
                      <td className="text-right py-2.5 px-3 text-muted-foreground">{mat.unit}</td>
                      <td className="text-right py-2.5 px-3 font-medium tabular-nums">{formatPHP(mat.unitPrice)}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-muted-foreground mt-3 text-right">
                Showing {materials.length} materials · Prices in Philippine Peso (₱)
              </p>
            </div>
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
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {suppliers.map((supplier, idx) => (
                <motion.div key={`${supplier.name}-${idx}`} variants={cardItemVariants}>
                  <Card className="h-full" hover>
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
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
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{supplier.location}</span>
                        </div>
                        {supplier.contactInfo && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{supplier.contactInfo}</span>
                          </div>
                        )}
                        {supplier.website && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Globe className="w-3.5 h-3.5 flex-shrink-0" />
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
                      {supplier.categories && supplier.categories.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {supplier.categories.slice(0, 5).map((cat) => (
                            <Badge key={cat} size="sm" variant="outline">{cat.replace(/_/g, ' ')}</Badge>
                          ))}
                          {supplier.categories.length > 5 && (
                            <Badge size="sm" variant="outline">+{supplier.categories.length - 5}</Badge>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </>
      )}
      </Tabs>
    </PageWrapper>
  );
}
