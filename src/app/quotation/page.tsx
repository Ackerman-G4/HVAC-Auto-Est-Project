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
			const { createAndDownloadPdf, hrLine, boldText } = await import('@/lib/utils/pdf-make');
			type Content = import('pdfmake/interfaces').Content;
			const bold = boldText;
			const dateStr = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

			// Equipment schedule
			const equipContent: Content[] = [];
			if (equipment.length > 0) {
				equipContent.push(bold('EQUIPMENT SCHEDULE', { fontSize: 9, margin: [0, 6, 0, 4] }));
				equipContent.push({
					table: {
						headerRows: 1,
						widths: [14, '*', 55, 45, 20, 55, 55],
						body: [
							['#', 'Equipment', 'Brand', 'Capacity', 'Qty', 'Unit Price', 'Total'].map((h) => bold(h, { fontSize: 8 })),
							...equipment.map((eq, idx) => [
								`${idx + 1}`,
								`${eq.model} (${eq.type})`.substring(0, 35),
								eq.brand.substring(0, 20),
								`${eq.capacityTR.toFixed(1)} TR`,
								`${eq.quantity}`,
								formatPHP(eq.unitPrice),
								formatPHP(eq.unitPrice * eq.quantity),
							]),
						],
					},
					layout: 'lightHorizontalLines',
					fontSize: 8,
					margin: [0, 0, 0, 6] as [number, number, number, number],
				});
			}

			// BOQ
			const boqContent: Content[] = [];
			if (boqData.items.length > 0) {
				boqContent.push(bold('BILL OF QUANTITIES', { fontSize: 9, margin: [0, 6, 0, 4] }));

				const boqBody: string[][] = [['Description', 'Qty', 'Unit', 'Unit Price', 'Amount'].map((h) => h)];
				let currentSection = '';
				for (const item of boqData.items) {
					if (item.section !== currentSection) {
						currentSection = item.section;
						boqBody.push([{ text: currentSection, bold: true, colSpan: 5 } as unknown as string, '', '', '', '']);
					}
					const desc = item.description.length > 45 ? `${item.description.substring(0, 45)}...` : item.description;
					boqBody.push([`  ${desc}`, `${item.quantity}`, item.unit, formatPHP(item.unitPrice), formatPHP(item.totalPrice)]);
				}

				boqContent.push({
					table: {
						headerRows: 1,
						widths: ['*', 25, 30, 55, 55],
						body: boqBody.map((row, i) =>
							i === 0 ? row.map((h) => bold(h, { fontSize: 8 })) : row,
						),
					},
					layout: 'lightHorizontalLines',
					fontSize: 8,
					margin: [0, 0, 0, 6] as [number, number, number, number],
				});
			}

			// Cost summary
			const costLines = [
				['Equipment Cost', formatPHP(boqData.equipmentCost)],
				['Material Cost', formatPHP(boqData.materialCost)],
				['Labor Cost', formatPHP(boqData.laborCost)],
				['Overhead', formatPHP(boqData.overhead)],
				['Contingency', formatPHP(boqData.contingency)],
			];

			await createAndDownloadPdf(
				{
					content: [
						bold('QUOTATION', { fontSize: 20, alignment: 'center', margin: [0, 0, 0, 10] }),
						{
							columns: [
								{
									width: '*',
									stack: [
										bold('HVAC AutoEst Engineering', { fontSize: 10 }),
										{ text: 'HVAC Design & Estimation System', fontSize: 10 },
										{ text: 'Metro Manila, Philippines', fontSize: 10 },
									],
								},
								{
									width: 'auto',
									stack: [
										bold(`Quotation No: ${quotationNumber}`, { fontSize: 10 }),
										{ text: `Date: ${dateStr}`, fontSize: 10 },
										{ text: 'Validity: 30 days', fontSize: 10 },
									],
									alignment: 'right' as const,
								},
							],
							margin: [0, 0, 0, 6] as [number, number, number, number],
						},
						{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#224FC6' }], margin: [0, 0, 0, 8] },
						bold('PROJECT DETAILS', { fontSize: 9, margin: [0, 0, 0, 4] }),
						{
							columns: [
								{ width: '*', stack: [
									{ text: `Project: ${project.name}`, fontSize: 9 },
									{ text: `Client: ${project.clientName || 'N/A'}`, fontSize: 9 },
									{ text: `Location: ${project.location || ''}, ${project.city || ''}`, fontSize: 9 },
								]},
								{ width: '*', stack: [
									{ text: `Building Type: ${project.buildingType}`, fontSize: 9 },
									{ text: `Floor Area: ${project.totalFloorArea} m²`, fontSize: 9 },
									{ text: `Cooling Load: ${totalTR.toFixed(1)} TR`, fontSize: 9 },
								]},
							],
							margin: [0, 0, 0, 8] as [number, number, number, number],
						},
						...equipContent,
						...boqContent,
						hrLine('#224FC6'),
						{
							table: {
								widths: ['*', 80],
								body: [
									...costLines.map(([label, value]) => [
										{ text: label, fontSize: 9 },
										{ text: value, fontSize: 9, alignment: 'right' as const },
									]),
									[{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.3 }], colSpan: 2 }, ''],
									[bold('Subtotal', { fontSize: 9 }), { text: formatPHP(boqData.subtotal), fontSize: 9, alignment: 'right' as const }],
									[{ text: 'VAT (12%)', fontSize: 9 }, { text: formatPHP(boqData.vat), fontSize: 9, alignment: 'right' as const }],
									[{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 1, lineColor: '#224FC6' }], colSpan: 2 }, ''],
									[bold('GRAND TOTAL', { fontSize: 12 }), bold(formatPHP(boqData.grandTotal), { fontSize: 12, alignment: 'right' })],
								],
							},
							layout: 'noBorders',
							margin: [200, 6, 0, 0] as [number, number, number, number],
						},
					],
					pageSize: 'A4',
					defaultStyle: { font: 'Roboto' },
				},
				`Quotation-${quotationNumber}.pdf`,
			);
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