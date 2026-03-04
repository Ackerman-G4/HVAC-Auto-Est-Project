'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
	FileText,
	Download,
	Printer,
	Building2,
	Snowflake,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

	const exportQuotationPDF = async () => {
		if (!boqData || !project) return;
		setGenerating(true);

		try {
			const jsPDF = (await import('jspdf')).default;
			const doc = new jsPDF();

			doc.setFontSize(20);
			doc.setFont('helvetica', 'bold');
			doc.text('QUOTATION', 105, 20, { align: 'center' });

			doc.setFontSize(10);
			doc.setFont('helvetica', 'bold');
			doc.text('HVAC AutoEst Engineering', 14, 35);
			doc.setFont('helvetica', 'normal');
			doc.text('HVAC Design & Estimation System', 14, 41);
			doc.text('Metro Manila, Philippines', 14, 47);

			doc.setFont('helvetica', 'bold');
			doc.text(`Quotation No: ${quotationNumber}`, 130, 35);
			doc.setFont('helvetica', 'normal');
			doc.text(`Date: ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`, 130, 41);
			doc.text('Validity: 30 days', 130, 47);

			doc.setDrawColor(34, 79, 198);
			doc.setLineWidth(0.5);
			doc.line(14, 52, 196, 52);

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
					const desc = item.description.length > 45 ? `${item.description.substring(0, 45)}...` : item.description;
					doc.text(`  ${desc}`, 14, y);
					doc.text(`${item.quantity}`, 100, y);
					doc.text(item.unit, 115, y);
					doc.text(formatPHP(item.unitPrice), 140, y);
					doc.text(formatPHP(item.totalPrice), 175, y);
					y += 5;
				});
			}

			if (y > 220) { doc.addPage(); y = 20; }
			y += 5;
			doc.setDrawColor(34, 79, 198);
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
			doc.setDrawColor(34, 79, 198);
			doc.setLineWidth(1);
			doc.line(120, y, 196, y);
			y += 7;
			doc.setFontSize(12);
			doc.setFont('helvetica', 'bold');
			doc.text('GRAND TOTAL', 120, y);
			doc.text(formatPHP(boqData.grandTotal), 196, y, { align: 'right' });

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

			<Card className="mb-6 no-print border-accent/20 bg-linear-to-r from-accent/10 via-primary/5 to-secondary/40">
				<CardContent className="py-4">
					<div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Quotation Workspace</p>
							<p className="text-sm font-medium text-foreground mt-0.5">
								Build client-ready quotations with complete BOQ, equipment schedule, and commercial terms.
							</p>
						</div>
						<div className="text-xs text-muted-foreground tabular-nums">
							{project ? `Active quote: ${quotationNumber}` : `${projects.length} projects available`}
						</div>
					</div>
				</CardContent>
			</Card>

			<div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
				<div className="xl:col-span-3">
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
						<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="quotation-doc max-w-none">
							<Card className="print-card overflow-hidden">
								<CardContent className="p-0">
									<div className="bg-linear-to-r from-accent to-primary text-white px-8 py-6">
										<div className="flex items-start justify-between">
											<div>
												<div className="flex items-center gap-2 mb-1">
													<Snowflake className="w-6 h-6" />
													<h1 className="text-xl font-bold tracking-tight">HVAC AutoEst Engineering</h1>
												</div>
												<p className="text-white/90 text-sm">HVAC Design, Estimation & Project Management</p>
												<p className="text-white/75 text-xs mt-1">Metro Manila, Philippines</p>
											</div>
											<div className="text-right">
												<h2 className="text-2xl font-bold tracking-wider">QUOTATION</h2>
												<p className="text-white/90 text-sm mt-1">{quotationNumber}</p>
											</div>
										</div>
									</div>

									<div className="px-8 py-5 bg-secondary/30 border-b border-border/50">
										<div className="grid grid-cols-2 gap-8">
											<div className="space-y-2.5">
												<h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Project information</h3>
												<div className="space-y-1.5 text-[13px]">
													<div className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="font-medium">{project.name}</span></div>
													<div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground">{project.clientName || 'N/A'}</span></div>
													<div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground">{[project.location, project.city].filter(Boolean).join(', ') || 'N/A'}</span></div>
												</div>
											</div>
											<div className="space-y-2.5">
												<h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quotation details</h3>
												<div className="space-y-1.5 text-[13px]">
													<div className="flex items-center gap-2"><Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span>Ref: {quotationNumber}</span></div>
													<div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground">{new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
													<div className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-muted-foreground">Valid for 30 days</span></div>
												</div>
											</div>
										</div>
									</div>

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
																	<td colSpan={4} className="py-2 font-semibold text-[11px] text-foreground">{section}</td>
																	<td className="py-2 text-right font-medium tabular-nums text-[11px]">{formatPHP(sectionTotal)}</td>
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

									<div className="px-8 py-5 border-b border-border/50">
										<div className="max-w-sm ml-auto">
											<h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Cost summary</h3>
											<div className="space-y-2 text-[13px]">
												{[
													{ label: 'Equipment cost', value: boqData.equipmentCost },
													{ label: 'Material cost', value: boqData.materialCost },
													{ label: 'Labor cost', value: boqData.laborCost },
													{ label: 'Overhead (10%)', value: boqData.overhead },
													{ label: 'Contingency (5%)', value: boqData.contingency },
												].map((item) => (
													<div key={item.label} className="flex justify-between py-1">
														<span className="text-muted-foreground">{item.label}</span>
														<span className="tabular-nums">{formatPHP(item.value)}</span>
													</div>
												))}
												<div className="border-t border-border pt-2 mt-2">
													<div className="flex justify-between py-1 font-medium"><span>Subtotal</span><span className="tabular-nums">{formatPHP(boqData.subtotal)}</span></div>
													<div className="flex justify-between py-1 text-muted-foreground"><span>VAT (12%)</span><span className="tabular-nums">{formatPHP(boqData.vat)}</span></div>
												</div>
												<div className="border-t-2 border-accent pt-3 mt-2">
													<div className="flex justify-between items-baseline">
														<span className="text-base font-bold text-foreground">Grand Total</span>
														<span className="text-xl font-bold text-accent tabular-nums">{formatPHP(boqData.grandTotal)}</span>
													</div>
												</div>
											</div>
										</div>
									</div>
								</CardContent>
							</Card>
						</motion.div>
					)}
				</div>

				<div className="space-y-5 no-print">
					<Card className="border-accent/20 bg-accent/5">
						<CardHeader><CardTitle className="text-[13px]">Quotation Snapshot</CardTitle></CardHeader>
						<CardContent className="space-y-2">
							<div className="rounded-lg border border-border/70 bg-card p-3"><p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Quotation No.</p><p className="text-sm font-semibold truncate">{quotationNumber || '—'}</p></div>
							<div className="rounded-lg border border-border/70 bg-card p-3"><p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Client</p><p className="text-sm font-semibold truncate">{project?.clientName || 'N/A'}</p></div>
							<div className="rounded-lg border border-border/70 bg-card p-3"><p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Grand Total</p><p className="text-2xl font-semibold tabular-nums text-accent">{boqData ? formatPHP(boqData.grandTotal) : '—'}</p></div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader><CardTitle className="text-[13px]">Output Readiness</CardTitle></CardHeader>
						<CardContent className="space-y-2 text-[12px]">
							<div className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2"><span className="text-muted-foreground">Project selected</span><Badge size="sm" variant={project ? 'success' : 'default'}>{project ? 'Ready' : 'Pending'}</Badge></div>
							<div className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2"><span className="text-muted-foreground">BOQ loaded</span><Badge size="sm" variant={boqData ? 'success' : 'default'}>{boqData ? 'Ready' : 'Pending'}</Badge></div>
							<div className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2"><span className="text-muted-foreground">Equipment list</span><Badge size="sm" variant={equipment.length > 0 ? 'success' : 'default'}>{equipment.length > 0 ? 'Ready' : 'Pending'}</Badge></div>
							<Button variant="accent" size="sm" className="w-full mt-2" onClick={exportQuotationPDF} disabled={!boqData || generating} isLoading={generating}>
								<Download className="w-4 h-4 mr-1" /> Export PDF
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		</PageWrapper>
	);
}