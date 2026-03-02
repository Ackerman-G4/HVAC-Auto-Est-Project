'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Download,
  FileSpreadsheet,
  BarChart3,
  Building2,
  Snowflake,
  PhilippinePeso,
  Loader2,
  FolderOpen,
  Printer,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import { formatPHP } from '@/lib/utils/format-currency';
import { listContainerVariants, listItemVariants } from '@/animations/list-variants';
import Link from 'next/link';

interface ProjectListItem {
  id: string;
  name: string;
  status: string;
  buildingType: string;
  totalFloorArea: number;
  updatedAt: string;
}

interface RoomData {
  id: string;
  name: string;
  area: number;
  spaceType: string;
  coolingLoad: { totalLoad: number; totalSensibleLoad: number; totalLatentLoad: number } | null;
}

interface EquipmentData {
  id: string;
  model: string;
  brand: string;
  type: string;
  capacityTR: number;
  unitPrice: number;
  quantity: number;
}

interface BOQData {
  items: {
    section: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    floorName?: string;
  }[];
  equipmentCost: number;
  materialCost: number;
  laborCost: number;
  overhead: number;
  contingency: number;
  subtotal: number;
  vat: number;
  grandTotal: number;
  costPerTR: number;
}

export default function ReportsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [boqData, setBOQData] = useState<BOQData | null>(null);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [equipment, setEquipment] = useState<EquipmentData[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Fetch projects
  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        setProjects(data.projects || []);
        setLoading(false);
      })
      .catch(() => {
        showToast('error', 'Failed to load projects');
        setLoading(false);
      });
  }, []);

  // Load project data when selected
  useEffect(() => {
    if (!selectedProjectId) {
      setBOQData(null);
      setRooms([]);
      setEquipment([]);
      return;
    }

    setGenerating(true);
    Promise.all([
      fetch(`/api/projects/${selectedProjectId}/boq`).then((r) => r.json()),
      fetch(`/api/projects/${selectedProjectId}`).then((r) => r.json()),
      fetch(`/api/projects/${selectedProjectId}/equipment`).then((r) => r.json()),
    ])
      .then(([boq, projectRes, equip]) => {
        setBOQData(boq);
        // API returns { project: { ... } } — unwrap
        const projectData = projectRes.project || projectRes;
        const allRooms: RoomData[] = [];
        (projectData.floors || []).forEach((f: { rooms: RoomData[] }) => {
          allRooms.push(...(f.rooms || []));
        });
        setRooms(allRooms);
        setEquipment(equip.equipment || []);
        setGenerating(false);
      })
      .catch(() => {
        showToast('error', 'Failed to load report data');
        setGenerating(false);
      });
  }, [selectedProjectId]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Export to PDF
  const exportPDF = async () => {
    if (!boqData) return;
    setGenerating(true);

    try {
      const jsPDF = (await import('jspdf')).default;
      const doc = new jsPDF();
      const project = projects.find((p) => p.id === selectedProjectId);

      // Title
      doc.setFontSize(18);
      doc.text('HVAC Auto-Estimation Report', 14, 20);
      doc.setFontSize(10);
      doc.text(`Project: ${project?.name || 'Unknown'}`, 14, 30);
      doc.text(`Building Type: ${project?.buildingType || 'N/A'}`, 14, 36);
      doc.text(`Total Floor Area: ${project?.totalFloorArea || 0} m²`, 14, 42);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-PH')}`, 14, 48);

      doc.setDrawColor(200);
      doc.line(14, 52, 196, 52);

      // Summary
      let y = 60;
      doc.setFontSize(13);
      doc.text('Cost Summary', 14, y);
      y += 8;
      doc.setFontSize(10);

      const summaryItems = [
        ['Equipment Cost', formatPHP(boqData.equipmentCost)],
        ['Material Cost', formatPHP(boqData.materialCost)],
        ['Labor Cost', formatPHP(boqData.laborCost)],
        ['Overhead', formatPHP(boqData.overhead)],
        ['Contingency', formatPHP(boqData.contingency)],
        ['Subtotal', formatPHP(boqData.subtotal)],
        ['VAT (12%)', formatPHP(boqData.vat)],
        ['Grand Total', formatPHP(boqData.grandTotal)],
      ];

      summaryItems.forEach(([label, value]) => {
        doc.text(label, 14, y);
        doc.text(value, 120, y);
        y += 6;
      });

      y += 5;
      doc.text(`Cost per TR: ${formatPHP(boqData.costPerTR)}`, 14, y);
      y += 10;

      // Cooling Loads
      if (rooms.length > 0) {
        doc.setFontSize(13);
        doc.text('Cooling Load Summary', 14, y);
        y += 8;
        doc.setFontSize(9);

        doc.text('Room', 14, y);
        doc.text('Area (m²)', 70, y);
        doc.text('Total (W)', 100, y);
        doc.text('Sensible (W)', 135, y);
        doc.text('Latent (W)', 170, y);
        y += 5;
        doc.line(14, y, 196, y);
        y += 4;

        rooms.forEach((room) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          doc.text(room.name.substring(0, 20), 14, y);
          doc.text(room.area.toFixed(1), 70, y);
          doc.text((room.coolingLoad?.totalLoad || 0).toFixed(0), 100, y);
          doc.text((room.coolingLoad?.totalSensibleLoad || 0).toFixed(0), 135, y);
          doc.text((room.coolingLoad?.totalLatentLoad || 0).toFixed(0), 170, y);
          y += 5;
        });

        y += 8;
      }

      // BOQ Table
      if (boqData.items.length > 0) {
        if (y > 200) {
          doc.addPage();
          y = 20;
        }
        doc.setFontSize(13);
        doc.text('Bill of Quantities', 14, y);
        y += 8;
        doc.setFontSize(8);

        doc.text('Description', 14, y);
        doc.text('Qty', 90, y);
        doc.text('Unit', 110, y);
        doc.text('Unit Price', 135, y);
        doc.text('Total', 170, y);
        y += 4;
        doc.line(14, y, 196, y);
        y += 4;

        boqData.items.forEach((item) => {
          if (y > 275) {
            doc.addPage();
            y = 20;
          }
          const desc = item.description.length > 40 ? item.description.substring(0, 40) + '...' : item.description;
          doc.text(desc, 14, y);
          doc.text(item.quantity.toString(), 90, y);
          doc.text(item.unit, 110, y);
          doc.text(formatPHP(item.unitPrice), 135, y);
          doc.text(formatPHP(item.totalPrice), 170, y);
          y += 5;
        });
      }

      doc.save(`HVAC-Report-${project?.name || 'project'}.pdf`);
      showToast('success', 'PDF exported successfully');
    } catch (err) {
      showToast('error', 'Failed to generate PDF');
      console.error(err);
    }

    setGenerating(false);
  };

  // Export to Excel
  const exportExcel = async () => {
    if (!boqData) return;
    setGenerating(true);

    try {
      const ExcelJS = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      wb.creator = 'HVAC AutoEst';
      wb.created = new Date();
      const project = projects.find((p) => p.id === selectedProjectId);

      // Summary sheet
      const ws1 = wb.addWorksheet('Summary');
      const summaryData = [
        ['HVAC Auto-Estimation Report'],
        [''],
        ['Project', project?.name || 'Unknown'],
        ['Building Type', project?.buildingType || 'N/A'],
        ['Total Floor Area (m²)', project?.totalFloorArea || 0],
        ['Generated', new Date().toLocaleDateString('en-PH')],
        [''],
        ['Cost Summary'],
        ['Equipment Cost', boqData.equipmentCost],
        ['Material Cost', boqData.materialCost],
        ['Labor Cost', boqData.laborCost],
        ['Overhead', boqData.overhead],
        ['Contingency', boqData.contingency],
        ['Subtotal', boqData.subtotal],
        ['VAT (12%)', boqData.vat],
        ['Grand Total', boqData.grandTotal],
        ['Cost per TR', boqData.costPerTR],
      ];
      summaryData.forEach((row) => ws1.addRow(row));
      ws1.getColumn(1).width = 25;
      ws1.getColumn(2).width = 20;
      ws1.getRow(1).font = { bold: true, size: 14 };

      // BOQ sheet
      const ws2 = wb.addWorksheet('BOQ');
      ws2.addRow(['Section', 'Description', 'Quantity', 'Unit', 'Unit Price (PHP)', 'Total Price (PHP)']);
      ws2.getRow(1).font = { bold: true };
      boqData.items.forEach((item) => {
        ws2.addRow([item.section, item.description, item.quantity, item.unit, item.unitPrice, item.totalPrice]);
      });
      ws2.columns.forEach((col) => { col.width = 18; });

      // Cooling Loads sheet
      if (rooms.length > 0) {
        const ws3 = wb.addWorksheet('Cooling Loads');
        ws3.addRow(['Room', 'Space Type', 'Area (m²)', 'Total Load (W)', 'Sensible (W)', 'Latent (W)']);
        ws3.getRow(1).font = { bold: true };
        rooms.forEach((r) => {
          ws3.addRow([
            r.name, r.spaceType, r.area,
            r.coolingLoad?.totalLoad || 0,
            r.coolingLoad?.totalSensibleLoad || 0,
            r.coolingLoad?.totalLatentLoad || 0,
          ]);
        });
        ws3.columns.forEach((col) => { col.width = 16; });
      }

      // Equipment sheet
      if (equipment.length > 0) {
        const ws4 = wb.addWorksheet('Equipment');
        ws4.addRow(['Model', 'Brand', 'Type', 'Capacity (TR)', 'Unit Price (PHP)', 'Qty']);
        ws4.getRow(1).font = { bold: true };
        equipment.forEach((e) => {
          ws4.addRow([e.model, e.brand, e.type, e.capacityTR, e.unitPrice, e.quantity]);
        });
        ws4.columns.forEach((col) => { col.width = 18; });
      }

      // Generate and download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HVAC-Report-${project?.name || 'project'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('success', 'Excel exported successfully');
    } catch (err) {
      showToast('error', 'Failed to generate Excel');
      console.error(err);
    }

    setGenerating(false);
  };

  // Group BOQ items by floor then section
  const groupedByFloor = boqData?.items.reduce(
    (acc, item) => {
      const floor = item.floorName || 'General';
      if (!acc[floor]) acc[floor] = {};
      const section = item.section || 'Other';
      if (!acc[floor][section]) acc[floor][section] = [];
      acc[floor][section].push(item);
      return acc;
    },
    {} as Record<string, Record<string, typeof boqData.items>>
  );

  // Flat grouped items by section (for backward compat)
  const groupedItems = boqData?.items.reduce(
    (acc, item) => {
      const key = item.section || 'Other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<string, typeof boqData.items>
  );

  const totalCoolingLoad = rooms.reduce((sum, r) => sum + (r.coolingLoad?.totalLoad || 0), 0);
  const totalTR = totalCoolingLoad / 3517;

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Reports & Export"
        description="Generate comprehensive HVAC estimation reports with detailed BOQ and cooling load analysis"
        actions={
          <div className="flex gap-2">
            <Link href="/quotation">
              <Button variant="secondary" size="sm">
                <FileText className="w-4 h-4 mr-1" /> Quotation
              </Button>
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportExcel}
              disabled={!boqData || generating}
            >
              <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={exportPDF}
              disabled={!boqData || generating}
              isLoading={generating}
            >
              <Download className="w-4 h-4 mr-1" /> PDF
            </Button>
          </div>
        }
      />

      {/* Project selector */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div className="flex-1 w-full">
              <Select
                label="Select Project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                options={[
                  { value: '', label: 'Choose a project...' },
                  ...projects.map((p) => ({
                    value: p.id,
                    label: `${p.name} — ${p.buildingType} (${p.totalFloorArea} m²)`,
                  })),
                ]}
              />
            </div>
            {selectedProjectId && (
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1" /> Print
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedProjectId && (
        <EmptyState
          icon={<FolderOpen className="w-12 h-12" />}
          title="Select a Project"
          description="Choose a project to generate reports and export data"
        />
      )}

      {generating && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-accent mr-2" />
          <span className="text-muted-foreground">Generating report...</span>
        </div>
      )}

      {boqData && !generating && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card padding="none">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/8 flex items-center justify-center flex-shrink-0">
                    <PhilippinePeso className="w-[18px] h-[18px] text-accent" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Grand Total</p>
                    <p className="text-base font-semibold tabular-nums truncate mt-0.5">{formatPHP(boqData.grandTotal)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card padding="none">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                    <Snowflake className="w-[18px] h-[18px] text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Cooling Load</p>
                    <p className="text-base font-semibold tabular-nums mt-0.5">{totalCoolingLoad.toLocaleString()} W</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">{totalTR.toFixed(1)} TR</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card padding="none">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-[18px] h-[18px] text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Rooms</p>
                    <p className="text-base font-semibold mt-0.5">{rooms.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card padding="none">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-[18px] h-[18px] text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Cost / TR</p>
                    <p className="text-base font-semibold tabular-nums truncate mt-0.5">{formatPHP(boqData.costPerTR)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cost Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PhilippinePeso className="w-4 h-4 text-muted-foreground" /> Cost Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: 'Equipment', value: boqData.equipmentCost, pct: (boqData.equipmentCost / boqData.subtotal) * 100 },
                  { label: 'Materials', value: boqData.materialCost, pct: (boqData.materialCost / boqData.subtotal) * 100 },
                  { label: 'Labor', value: boqData.laborCost, pct: (boqData.laborCost / boqData.subtotal) * 100 },
                  { label: 'Overhead', value: boqData.overhead, pct: (boqData.overhead / boqData.subtotal) * 100 },
                  { label: 'Contingency', value: boqData.contingency, pct: (boqData.contingency / boqData.subtotal) * 100 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="w-24 text-[13px] text-muted-foreground">{item.label}</span>
                    <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.pct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full bg-foreground/70 rounded-full"
                      />
                    </div>
                    <span className="w-28 text-right text-[13px] font-medium tabular-nums">{formatPHP(item.value)}</span>
                    <span className="w-10 text-right text-[11px] text-muted-foreground tabular-nums">{item.pct.toFixed(0)}%</span>
                  </div>
                ))}
                <div className="border-t border-border/50 pt-3 mt-3">
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium tabular-nums">{formatPHP(boqData.subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1.5 text-[13px]">
                    <span className="text-muted-foreground">VAT (12%)</span>
                    <span className="tabular-nums text-muted-foreground">{formatPHP(boqData.vat)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-3 text-sm font-semibold">
                    <span>Grand Total</span>
                    <span className="tabular-nums">{formatPHP(boqData.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cooling Load Table */}
          {rooms.length > 0 && (
            <Card>
              <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Snowflake className="w-4 h-4 text-muted-foreground" /> Cooling Load Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Room</th>
                        <th className="text-left py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Type</th>
                        <th className="text-right py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Area (m²)</th>
                        <th className="text-right py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Total (W)</th>
                        <th className="text-right py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Sensible (W)</th>
                        <th className="text-right py-2.5 text-[11px] uppercase tracking-wider font-medium">Latent (W)</th>
                      </tr>
                    </thead>
                    <motion.tbody
                      variants={listContainerVariants}
                      initial="initial"
                      animate="animate"
                    >
                      {rooms.map((room) => (
                        <motion.tr
                          key={room.id}
                          variants={listItemVariants}
                          className="border-b border-border/40 hover:bg-secondary/30 transition-colors"
                        >
                          <td className="py-2.5 pr-4 font-medium">{room.name}</td>
                          <td className="py-2.5 pr-4">
                            <Badge size="sm" variant="outline">
                              {room.spaceType}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{room.area.toFixed(1)}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums font-medium">
                            {(room.coolingLoad?.totalLoad || 0).toLocaleString()}
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                            {(room.coolingLoad?.totalSensibleLoad || 0).toLocaleString()}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                            {(room.coolingLoad?.totalLatentLoad || 0).toLocaleString()}
                          </td>
                        </motion.tr>
                      ))}
                    </motion.tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="py-2.5" colSpan={3}>
                          Total
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{totalCoolingLoad.toLocaleString()}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {rooms.reduce((s, r) => s + (r.coolingLoad?.totalSensibleLoad || 0), 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {rooms.reduce((s, r) => s + (r.coolingLoad?.totalLatentLoad || 0), 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* BOQ Detail — Grouped by Floor */}
          {groupedByFloor && Object.keys(groupedByFloor).length > 0 && (
            <Card>
              <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" /> Bill of Quantities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(groupedByFloor).map(([floorName, sections]) => {
                    const floorTotal = Object.values(sections).flat().reduce((s, i) => s + i.totalPrice, 0);
                    return (
                      <div key={floorName} className="space-y-2">
                        <div className="flex items-center justify-between px-2 py-1.5 bg-accent/8 rounded-lg">
                          <span className="font-semibold text-sm flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-accent" /> {floorName}
                          </span>
                          <span className="text-sm font-medium tabular-nums">{formatPHP(floorTotal)}</span>
                        </div>
                        {Object.entries(sections).map(([section, items]) => {
                          const isOpen = expandedSections[`${floorName}-${section}`] ?? true;
                          const sectionTotal = items.reduce((s, i) => s + i.totalPrice, 0);

                          return (
                            <div key={section} className="border border-border/50 rounded-lg overflow-hidden ml-3">
                              <button
                                onClick={() => toggleSection(`${floorName}-${section}`)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-secondary/40 hover:bg-secondary transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-[13px]">{section}</span>
                                  <Badge size="sm" variant="outline">{items.length} items</Badge>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[13px] font-medium tabular-nums">{formatPHP(sectionTotal)}</span>
                                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </div>
                              </button>
                              <AnimatePresence>
                                {isOpen && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                  >
                                    <table className="w-full text-[13px]">
                                      <thead>
                                        <tr className="border-b border-border/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                                          <th className="text-left py-2 px-4 font-medium">Description</th>
                                          <th className="text-right py-2 px-2 font-medium">Qty</th>
                                          <th className="text-left py-2 px-2 font-medium">Unit</th>
                                          <th className="text-right py-2 px-2 font-medium">Unit Price</th>
                                          <th className="text-right py-2 px-4 font-medium">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {items.map((item, idx) => (
                                          <tr
                                            key={idx}
                                            className="border-b border-border/30 hover:bg-secondary/30 transition-colors"
                                          >
                                            <td className="py-2 px-4">{item.description}</td>
                                            <td className="py-2 px-2 text-right tabular-nums">{item.quantity}</td>
                                            <td className="py-2 px-2 text-muted-foreground">{item.unit}</td>
                                            <td className="py-2 px-2 text-right tabular-nums">{formatPHP(item.unitPrice)}</td>
                                            <td className="py-2 px-4 text-right font-medium tabular-nums">{formatPHP(item.totalPrice)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Equipment List */}
          {equipment.length > 0 && (
            <Card>
              <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Snowflake className="w-4 h-4 text-muted-foreground" /> Equipment Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Model</th>
                        <th className="text-left py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Brand</th>
                        <th className="text-left py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Type</th>
                        <th className="text-right py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Capacity (TR)</th>
                        <th className="text-right py-2.5 pr-4 text-[11px] uppercase tracking-wider font-medium">Unit Price</th>
                        <th className="text-right py-2.5 text-[11px] uppercase tracking-wider font-medium">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {equipment.map((eq) => (
                        <tr key={eq.id} className="border-b border-border/40 hover:bg-secondary/30 transition-colors">
                          <td className="py-2.5 pr-4 font-medium">{eq.model}</td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{eq.brand}</td>
                          <td className="py-2.5 pr-4">
                            <Badge size="sm" variant="outline">{eq.type}</Badge>
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{eq.capacityTR.toFixed(1)} TR</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{formatPHP(eq.unitPrice)}</td>
                          <td className="py-2.5 text-right tabular-nums">{eq.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}
    </PageWrapper>
  );
}
