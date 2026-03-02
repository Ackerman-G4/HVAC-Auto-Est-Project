'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Download,
  Printer,
  Building2,
  Snowflake,
  PhilippinePeso,
  Loader2,
  FolderOpen,
  ArrowLeft,
  CheckCircle2,
  MapPin,
  Calendar,
  User,
  Hash,
} from 'lucide-react';
import { PageWrapper, PageHeader } from '@/components/ui/page-wrapper';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import { formatPHP } from '@/lib/utils/format-currency';
import Link from 'next/link';

interface ProjectListItem {
  id: string;
  name: string;
  status: string;
  buildingType: string;
  totalFloorArea: number;
  clientName: string;
  location: string;
  city: string;
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

export default function QuotationPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [boqData, setBOQData] = useState<BOQData | null>(null);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [equipment, setEquipment] = useState<EquipmentData[]>([]);
  const [project, setProject] = useState<ProjectListItem | null>(null);

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
      setProject(null);
      return;
    }

    setGenerating(true);
    Promise.all([
      fetch(`/api/projects/${selectedProjectId}/boq`).then((r) => r.json()),
      fetch(`/api/projects/${selectedProjectId}`).then((r) => r.json()),
      fetch(`/api/projects/${selectedProjectId}/equipment`).then((r) => r.json()),
    ])
      .then(([boq, projRes, equip]) => {
        setBOQData(boq);
        // API returns { project: { ... } } — unwrap
        const projData = projRes.project || projRes;
        const allRooms: RoomData[] = [];
        (projData.floors || []).forEach((f: { rooms: RoomData[] }) => {
          allRooms.push(...(f.rooms || []));
        });
        setRooms(allRooms);
        setEquipment(equip.equipment || []);
        setProject({
          id: projData.id,
          name: projData.name,
          status: projData.status,
          buildingType: projData.buildingType,
          totalFloorArea: projData.totalFloorArea,
          clientName: projData.clientName || '',
          location: projData.location || '',
          city: projData.city || '',
          updatedAt: projData.updatedAt,
        });
        setGenerating(false);
      })
      .catch(() => {
        showToast('error', 'Failed to load project data');
        setGenerating(false);
      });
  }, [selectedProjectId]);

  const totalCoolingLoad = rooms.reduce((sum, r) => sum + (r.coolingLoad?.totalLoad || 0), 0);
  const totalTR = totalCoolingLoad / 3517;

  const quotationNumber = selectedProjectId
    ? `QTN-${new Date().getFullYear()}-${selectedProjectId.substring(0, 6).toUpperCase()}`
    : '';

  const groupedItems = boqData?.items.reduce(
    (acc, item) => {
      const key = item.section || 'Other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<string, typeof boqData.items>
  );

  // Export quotation PDF
  const exportQuotationPDF = async () => {
    if (!boqData || !project) return;
    setGenerating(true);

    try {
      const jsPDF = (await import('jspdf')).default;
      const doc = new jsPDF();

      // Header
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('QUOTATION', 105, 20, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('HVAC AutoEst Engineering', 14, 35);
      doc.setFont('helvetica', 'normal');
      doc.text('HVAC Design & Estimation System', 14, 41);
      doc.text('Metro Manila, Philippines', 14, 47);

      // Quotation info
      doc.setFont('helvetica', 'bold');
      doc.text(`Quotation No: ${quotationNumber}`, 130, 35);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`, 130, 41);
      doc.text(`Validity: 30 days`, 130, 47);

      doc.setDrawColor(29, 78, 216);
      doc.setLineWidth(0.5);
      doc.line(14, 52, 196, 52);

      // Client info
      let y = 60;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('PROJECT DETAILS', 14, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.text(`Project: ${project.name}`, 14, y);
      doc.text(`Building Type: ${project.buildingType}`, 110, y);
      y += 5;
      doc.text(`Client: ${project.clientName || 'N/A'}`, 14, y);
      doc.text(`Floor Area: ${project.totalFloorArea} m²`, 110, y);
      y += 5;
      doc.text(`Location: ${project.location || ''}, ${project.city || ''}`, 14, y);
      doc.text(`Cooling Load: ${totalTR.toFixed(1)} TR`, 110, y);
      y += 10;

      // Equipment schedule
      if (equipment.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.text('EQUIPMENT SCHEDULE', 14, y);
        y += 6;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('#', 14, y);
        doc.text('Equipment', 20, y);
        doc.text('Brand', 80, y);
        doc.text('Capacity', 120, y);
        doc.text('Qty', 145, y);
        doc.text('Unit Price', 155, y);
        doc.text('Total', 180, y);
        y += 3;
        doc.setDrawColor(200);
        doc.line(14, y, 196, y);
        y += 4;
        doc.setFont('helvetica', 'normal');

        equipment.forEach((eq, idx) => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(`${idx + 1}`, 14, y);
          doc.text(`${eq.model} (${eq.type})`.substring(0, 35), 20, y);
          doc.text(eq.brand.substring(0, 20), 80, y);
          doc.text(`${eq.capacityTR.toFixed(1)} TR`, 120, y);
          doc.text(`${eq.quantity}`, 145, y);
          doc.text(formatPHP(eq.unitPrice), 155, y);
          doc.text(formatPHP(eq.unitPrice * eq.quantity), 180, y);
          y += 5;
        });
        y += 5;
      }

      // BOQ items
      if (boqData.items.length > 0) {
        if (y > 200) { doc.addPage(); y = 20; }
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('BILL OF QUANTITIES', 14, y);
        y += 6;
        doc.setFontSize(8);
        doc.text('Description', 14, y);
        doc.text('Qty', 100, y);
        doc.text('Unit', 115, y);
        doc.text('Unit Price', 140, y);
        doc.text('Amount', 175, y);
        y += 3;
        doc.line(14, y, 196, y);
        y += 4;
        doc.setFont('helvetica', 'normal');

        let currentSection = '';
        boqData.items.forEach((item) => {
          if (y > 270) { doc.addPage(); y = 20; }
          if (item.section !== currentSection) {
            currentSection = item.section;
            doc.setFont('helvetica', 'bold');
            doc.text(currentSection, 14, y);
            doc.setFont('helvetica', 'normal');
            y += 5;
          }
          const desc = item.description.length > 45 ? item.description.substring(0, 45) + '...' : item.description;
          doc.text(`  ${desc}`, 14, y);
          doc.text(`${item.quantity}`, 100, y);
          doc.text(item.unit, 115, y);
          doc.text(formatPHP(item.unitPrice), 140, y);
          doc.text(formatPHP(item.totalPrice), 175, y);
          y += 5;
        });
      }

      // Cost summary
      if (y > 220) { doc.addPage(); y = 20; }
      y += 5;
      doc.setDrawColor(29, 78, 216);
      doc.setLineWidth(0.5);
      doc.line(120, y, 196, y);
      y += 8;
      doc.setFontSize(9);

      const costLines = [
        ['Equipment Cost', formatPHP(boqData.equipmentCost)],
        ['Material Cost', formatPHP(boqData.materialCost)],
        ['Labor Cost', formatPHP(boqData.laborCost)],
        ['Overhead', formatPHP(boqData.overhead)],
        ['Contingency', formatPHP(boqData.contingency)],
      ];
      costLines.forEach(([label, value]) => {
        doc.setFont('helvetica', 'normal');
        doc.text(label, 120, y);
        doc.text(value, 196, y, { align: 'right' });
        y += 5;
      });

      y += 2;
      doc.line(120, y, 196, y);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Subtotal', 120, y);
      doc.text(formatPHP(boqData.subtotal), 196, y, { align: 'right' });
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.text('VAT (12%)', 120, y);
      doc.text(formatPHP(boqData.vat), 196, y, { align: 'right' });
      y += 6;
      doc.setDrawColor(29, 78, 216);
      doc.setLineWidth(1);
      doc.line(120, y, 196, y);
      y += 7;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('GRAND TOTAL', 120, y);
      doc.text(formatPHP(boqData.grandTotal), 196, y, { align: 'right' });

      // Terms
      y += 15;
      if (y > 245) { doc.addPage(); y = 20; }
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('TERMS & CONDITIONS', 14, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      const terms = [
        '1. This quotation is valid for 30 calendar days from date of issue.',
        '2. Prices are in Philippine Peso (PHP) and inclusive of applicable taxes unless stated otherwise.',
        '3. Payment terms: 50% downpayment upon signing, 40% upon delivery, 10% upon completion.',
        '4. Delivery: 4-6 weeks after receipt of downpayment and approved shop drawings.',
        '5. Warranty: 1 year on installation workmanship, equipment warranty per manufacturer terms.',
        '6. Excludes: Civil, structural, and architectural works unless specified.',
        '7. Any variation or additional work shall be subject to a separate quotation.',
      ];
      terms.forEach(t => {
        doc.text(t, 14, y);
        y += 4;
      });

      // Signature
      y += 10;
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(9);
      doc.text('Prepared by:', 14, y);
      doc.text('Conforme:', 120, y);
      y += 20;
      doc.line(14, y, 80, y);
      doc.line(120, y, 196, y);
      y += 5;
      doc.setFontSize(8);
      doc.text('HVAC AutoEst Engineering', 14, y);
      doc.text(project.clientName || 'Client Name', 120, y);
      y += 4;
      doc.text('Authorized Representative', 14, y);
      doc.text('Authorized Representative', 120, y);

      doc.save(`Quotation-${quotationNumber}.pdf`);
      showToast('success', 'Quotation PDF exported');
    } catch (err) {
      showToast('error', 'Failed to generate quotation PDF');
      console.error(err);
    }
    setGenerating(false);
  };

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
      <style>{`
        @media print {
          nav, .no-print, .sidebar { display: none !important; }
          .print-card { box-shadow: none !important; border: none !important; }
          .quotation-doc { max-width: 100% !important; margin: 0 !important; padding: 20px !important; }
        }
      `}</style>

      <PageHeader
        title="Quotation Preview"
        description="Generate and preview professional HVAC quotation documents"
        actions={
          <div className="flex gap-2 no-print">
            <Link href="/reports">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1" /> Reports
              </Button>
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportQuotationPDF}
              disabled={!boqData || generating}
              isLoading={generating}
            >
              <Download className="w-4 h-4 mr-1" /> PDF
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={() => window.print()}
              disabled={!boqData}
            >
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
          </div>
        }
      />

      {/* Project selector */}
      <Card className="mb-6 no-print">
        <CardContent className="p-4">
          <Select
            label="Select project"
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
        </CardContent>
      </Card>

      {!selectedProjectId && (
        <EmptyState
          icon={<FolderOpen className="w-12 h-12" />}
          title="Select a project"
          description="Choose a project to generate a professional quotation document"
        />
      )}

      {generating && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-accent mr-2" />
          <span className="text-muted-foreground">Loading quotation data...</span>
        </div>
      )}

      {boqData && project && !generating && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="quotation-doc max-w-4xl mx-auto"
        >
          {/* Quotation Document */}
          <Card className="print-card overflow-hidden">
            <CardContent className="p-0">
              {/* ── Document Header ────────────────────────────────────── */}
              <div className="bg-gradient-to-r from-[#1D4ED8] to-[#2563EB] text-white px-8 py-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Snowflake className="w-6 h-6" />
                      <h1 className="text-xl font-bold tracking-tight">HVAC AutoEst Engineering</h1>
                    </div>
                    <p className="text-blue-100 text-sm">HVAC Design, Estimation & Project Management</p>
                    <p className="text-blue-200 text-xs mt-1">Metro Manila, Philippines</p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-2xl font-bold tracking-wider">QUOTATION</h2>
                    <p className="text-blue-100 text-sm mt-1">{quotationNumber}</p>
                  </div>
                </div>
              </div>

              {/* ── Document Info ──────────────────────────────────────── */}
              <div className="px-8 py-5 bg-secondary/30 border-b border-border/50">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2.5">
                    <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Project information</h3>
                    <div className="space-y-1.5 text-[13px]">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium">{project.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">{project.clientName || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">
                          {[project.location, project.city].filter(Boolean).join(', ') || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quotation details</h3>
                    <div className="space-y-1.5 text-[13px]">
                      <div className="flex items-center gap-2">
                        <Hash className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span>Ref: {quotationNumber}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">
                          {new Date().toLocaleDateString('en-PH', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-muted-foreground">Valid for 30 days</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Project stats */}
                <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap gap-4">
                  {[
                    { label: 'Building type', value: project.buildingType },
                    { label: 'Floor area', value: `${project.totalFloorArea} m²` },
                    { label: 'Rooms', value: `${rooms.length}` },
                    { label: 'Cooling load', value: `${totalTR.toFixed(1)} TR` },
                  ].map((stat) => (
                    <div key={stat.label} className="flex items-baseline gap-1.5 text-[12px]">
                      <span className="text-muted-foreground">{stat.label}:</span>
                      <span className="font-medium">{stat.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Equipment Schedule ────────────────────────────────── */}
              {equipment.length > 0 && (
                <div className="px-8 py-5 border-b border-border/50">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Snowflake className="w-3.5 h-3.5" /> Equipment schedule
                  </h3>
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="text-left py-2 font-medium">#</th>
                        <th className="text-left py-2 font-medium">Equipment</th>
                        <th className="text-left py-2 font-medium">Brand</th>
                        <th className="text-right py-2 font-medium">Capacity</th>
                        <th className="text-right py-2 font-medium">Qty</th>
                        <th className="text-right py-2 font-medium">Unit price</th>
                        <th className="text-right py-2 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {equipment.map((eq, idx) => (
                        <tr key={eq.id} className="border-b border-border/30">
                          <td className="py-2 text-muted-foreground">{idx + 1}</td>
                          <td className="py-2 font-medium">
                            {eq.model}
                            <span className="text-muted-foreground ml-1">({eq.type})</span>
                          </td>
                          <td className="py-2 text-muted-foreground">{eq.brand}</td>
                          <td className="py-2 text-right tabular-nums">{eq.capacityTR.toFixed(1)} TR</td>
                          <td className="py-2 text-right tabular-nums">{eq.quantity}</td>
                          <td className="py-2 text-right tabular-nums">{formatPHP(eq.unitPrice)}</td>
                          <td className="py-2 text-right tabular-nums font-medium">{formatPHP(eq.unitPrice * eq.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border font-medium">
                        <td colSpan={6} className="py-2 text-right text-muted-foreground text-[11px]">Equipment subtotal</td>
                        <td className="py-2 text-right tabular-nums">{formatPHP(boqData.equipmentCost)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Bill of Quantities ────────────────────────────────── */}
              {groupedItems && Object.keys(groupedItems).length > 0 && (
                <div className="px-8 py-5 border-b border-border/50">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" /> Bill of quantities
                  </h3>
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="text-left py-2 font-medium">Description</th>
                        <th className="text-right py-2 font-medium">Qty</th>
                        <th className="text-left py-2 pl-3 font-medium">Unit</th>
                        <th className="text-right py-2 font-medium">Unit price</th>
                        <th className="text-right py-2 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(groupedItems).map(([section, items]) => {
                        const sectionTotal = items.reduce((s, i) => s + i.totalPrice, 0);
                        return (
                          <React.Fragment key={section}>
                            <tr className="border-b border-border/40">
                              <td colSpan={4} className="py-2 font-semibold text-[11px] text-foreground">
                                {section}
                              </td>
                              <td className="py-2 text-right font-medium tabular-nums text-[11px]">
                                {formatPHP(sectionTotal)}
                              </td>
                            </tr>
                            {items.map((item, idx) => (
                              <tr key={idx} className="border-b border-border/20">
                                <td className="py-1.5 pl-4 text-muted-foreground">{item.description}</td>
                                <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
                                <td className="py-1.5 pl-3 text-muted-foreground">{item.unit}</td>
                                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{formatPHP(item.unitPrice)}</td>
                                <td className="py-1.5 text-right tabular-nums">{formatPHP(item.totalPrice)}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Cost Summary ──────────────────────────────────────── */}
              <div className="px-8 py-5 border-b border-border/50">
                <div className="max-w-sm ml-auto">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Cost summary
                  </h3>
                  <div className="space-y-2 text-[13px]">
                    {[
                      { label: 'Equipment cost', value: boqData.equipmentCost },
                      { label: 'Material cost', value: boqData.materialCost },
                      { label: 'Labor cost', value: boqData.laborCost },
                      { label: 'Overhead (10%)', value: boqData.overhead },
                      { label: 'Contingency (5%)', value: boqData.contingency },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex justify-between py-1"
                      >
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="tabular-nums">{formatPHP(item.value)}</span>
                      </div>
                    ))}

                    <div className="border-t border-border pt-2 mt-2">
                      <div className="flex justify-between py-1 font-medium">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{formatPHP(boqData.subtotal)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-muted-foreground">
                        <span>VAT (12%)</span>
                        <span className="tabular-nums">{formatPHP(boqData.vat)}</span>
                      </div>
                    </div>

                    <div className="border-t-2 border-accent pt-3 mt-2">
                      <div className="flex justify-between items-baseline">
                        <span className="text-base font-bold text-foreground">Grand Total</span>
                        <span className="text-xl font-bold text-accent tabular-nums">
                          {formatPHP(boqData.grandTotal)}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground text-right mt-1">
                        Cost per TR: {formatPHP(boqData.costPerTR)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Terms & Conditions ────────────────────────────────── */}
              <div className="px-8 py-5 border-b border-border/50 bg-secondary/20">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Terms & conditions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5 text-[11px] text-muted-foreground leading-relaxed">
                  <div className="flex gap-2">
                    <span className="text-foreground font-medium shrink-0">1.</span>
                    <span>This quotation is valid for 30 calendar days from the date of issue.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-foreground font-medium shrink-0">2.</span>
                    <span>Prices are in Philippine Peso (PHP) and inclusive of applicable taxes unless stated otherwise.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-foreground font-medium shrink-0">3.</span>
                    <span>Payment: 50% downpayment upon contract signing, 40% upon delivery, 10% upon completion.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-foreground font-medium shrink-0">4.</span>
                    <span>Delivery timeline: 4–6 weeks after receipt of downpayment and approved shop drawings.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-foreground font-medium shrink-0">5.</span>
                    <span>Warranty: 1 year on installation workmanship; equipment warranty per manufacturer terms.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-foreground font-medium shrink-0">6.</span>
                    <span>Excludes civil, structural, and architectural works unless specifically stated.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-foreground font-medium shrink-0">7.</span>
                    <span>Any variation or additional work shall be subject to a separate quotation and approval.</span>
                  </div>
                </div>
              </div>

              {/* ── Signature Block ───────────────────────────────────── */}
              <div className="px-8 py-6">
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-12">Prepared by:</p>
                    <div className="border-t border-border pt-2">
                      <p className="text-[12px] font-medium">HVAC AutoEst Engineering</p>
                      <p className="text-[11px] text-muted-foreground">Authorized representative</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-12">Conforme:</p>
                    <div className="border-t border-border pt-2">
                      <p className="text-[12px] font-medium">{project.clientName || 'Client'}</p>
                      <p className="text-[11px] text-muted-foreground">Authorized representative</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Footer ────────────────────────────────────────────── */}
              <div className="bg-secondary/40 px-8 py-3 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Generated by HVAC AutoEst — Estimation System</span>
                <span>{quotationNumber} · Page 1 of 1</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </PageWrapper>
  );
}
