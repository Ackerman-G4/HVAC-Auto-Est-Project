'use client';

/**
 * Project export utilities — PDF report, DXF CAD, Excel/CSV
 */

interface ExportRoom {
  name: string;
  spaceType: string;
  area: number;
  ceilingHeight: number;
  occupantCount: number;
  windowArea: number;
  windowOrientation: string;
  wallConstruction: string;
  windowType: string;
  hasRoofExposure: boolean;
  coolingLoad?: {
    totalLoad: number;
    trValue: number;
    btuPerHour: number;
    totalSensibleLoad: number;
    totalLatentLoad: number;
    wallLoad: number;
    roofLoad: number;
    glassSolarLoad: number;
    glassConductionLoad: number;
    lightingLoad: number;
    peopleLoadSensible: number;
    peopleLoadLatent: number;
    equipmentLoadSensible: number;
    ventilationLoadSensible: number;
    ventilationLoadLatent: number;
    cfmSupply: number;
    cfmReturn: number;
  } | null;
}

interface ExportFloor {
  floorNumber: number;
  name: string;
  rooms: ExportRoom[];
}

interface ExportEquipment {
  brand: string;
  model: string;
  type: string;
  capacityTR: number;
  capacityBTU: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  eer: number;
  isInverter: boolean;
}

interface ExportBOQItem {
  section: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

interface ExportProject {
  name: string;
  clientName: string;
  buildingType: string;
  city: string;
  location: string;
  totalFloorArea: number;
  outdoorDB: number;
  outdoorWB: number;
  outdoorRH: number;
  indoorDB: number;
  indoorRH: number;
  floors: ExportFloor[];
  selectedEquipment: ExportEquipment[];
  boqItems: ExportBOQItem[];
}

/* ─────────────── PDF Export ─────────────── */

export async function exportProjectPDF(project: ExportProject) {
  const jsPDF = (await import('jspdf')).default;
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  let y = 20;

  const addPage = () => {
    doc.addPage();
    y = 20;
  };

  const checkPage = (needed: number) => {
    if (y + needed > 270) addPage();
  };

  // ── Header ──
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(project.name, pageW / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Client: ${project.clientName || '—'} | Type: ${project.buildingType} | City: ${project.city}`, pageW / 2, y, { align: 'center' });
  y += 5;
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageW / 2, y, { align: 'center' });
  y += 10;

  // ── Design Conditions ──
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Design Conditions', 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Outdoor: ${project.outdoorDB}°C DB / ${project.outdoorWB}°C WB / ${project.outdoorRH}% RH`, 14, y);
  y += 5;
  doc.text(`Indoor: ${project.indoorDB}°C DB / ${project.indoorRH}% RH`, 14, y);
  y += 5;
  doc.text(`Total Floor Area: ${project.totalFloorArea} m²`, 14, y);
  y += 10;

  // Line separator
  doc.setDrawColor(200);
  doc.line(14, y, pageW - 14, y);
  y += 8;

  // ── Floors & Rooms ──
  const allRooms = project.floors.flatMap((f) => f.rooms);
  const totalTR = allRooms.reduce((s, r) => s + (r.coolingLoad?.trValue || 0), 0);
  const totalBTU = allRooms.reduce((s, r) => s + (r.coolingLoad?.btuPerHour || 0), 0);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Cooling Load Summary', 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Rooms: ${allRooms.length} | Total TR: ${totalTR.toFixed(2)} | Total BTU/h: ${totalBTU.toLocaleString()}`, 14, y);
  y += 10;

  for (const floor of project.floors) {
    checkPage(30);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`${floor.name} (Floor ${floor.floorNumber})`, 14, y);
    y += 6;

    // Room table header
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const cols = [14, 50, 80, 100, 120, 140, 165];
    doc.text('Room', cols[0], y);
    doc.text('Type', cols[1], y);
    doc.text('Area (m²)', cols[2], y);
    doc.text('Height (m)', cols[3], y);
    doc.text('TR', cols[4], y);
    doc.text('BTU/h', cols[5], y);
    doc.text('CFM', cols[6], y);
    y += 1;
    doc.setDrawColor(180);
    doc.line(14, y, pageW - 14, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    for (const room of floor.rooms) {
      checkPage(8);
      doc.text(room.name.substring(0, 18), cols[0], y);
      doc.text(room.spaceType.replace(/_/g, ' ').substring(0, 14), cols[1], y);
      doc.text(room.area.toFixed(2), cols[2], y);
      doc.text(String(room.ceilingHeight), cols[3], y);
      doc.text(room.coolingLoad ? String(room.coolingLoad.trValue) : '—', cols[4], y);
      doc.text(room.coolingLoad ? room.coolingLoad.btuPerHour.toLocaleString() : '—', cols[5], y);
      doc.text(room.coolingLoad ? String(room.coolingLoad.cfmSupply) : '—', cols[6], y);
      y += 5;
    }
    y += 5;
  }

  // ── Equipment ──
  if (project.selectedEquipment.length > 0) {
    checkPage(30);
    doc.setDrawColor(200);
    doc.line(14, y, pageW - 14, y);
    y += 8;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Selected Equipment', 14, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const eqCols = [14, 55, 90, 115, 135, 160];
    doc.text('Brand / Model', eqCols[0], y);
    doc.text('Type', eqCols[1], y);
    doc.text('Capacity', eqCols[2], y);
    doc.text('Qty', eqCols[3], y);
    doc.text('EER', eqCols[4], y);
    doc.text('Total Price', eqCols[5], y);
    y += 1;
    doc.line(14, y, pageW - 14, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    for (const eq of project.selectedEquipment) {
      checkPage(8);
      doc.text(`${eq.brand} ${eq.model}`.substring(0, 22), eqCols[0], y);
      doc.text(eq.type.replace(/_/g, ' ').substring(0, 16), eqCols[1], y);
      doc.text(`${eq.capacityTR} TR`, eqCols[2], y);
      doc.text(String(eq.quantity), eqCols[3], y);
      doc.text(String(eq.eer), eqCols[4], y);
      doc.text(`₱${eq.totalPrice.toLocaleString()}`, eqCols[5], y);
      y += 5;
    }

    const eqTotal = project.selectedEquipment.reduce((s, e) => s + e.totalPrice, 0);
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.text(`Equipment Subtotal: ₱${eqTotal.toLocaleString()}`, pageW - 14, y, { align: 'right' });
    y += 8;
  }

  // ── BOQ ──
  if (project.boqItems.length > 0) {
    checkPage(30);
    doc.setDrawColor(200);
    doc.line(14, y, pageW - 14, y);
    y += 8;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill of Quantities', 14, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const bCols = [14, 40, 100, 118, 135, 160];
    doc.text('Section', bCols[0], y);
    doc.text('Description', bCols[1], y);
    doc.text('Qty', bCols[2], y);
    doc.text('Unit', bCols[3], y);
    doc.text('Unit Price', bCols[4], y);
    doc.text('Total', bCols[5], y);
    y += 1;
    doc.line(14, y, pageW - 14, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    for (const item of project.boqItems) {
      checkPage(8);
      doc.text(item.section.substring(0, 12), bCols[0], y);
      doc.text(item.description.substring(0, 30), bCols[1], y);
      doc.text(String(item.quantity), bCols[2], y);
      doc.text(item.unit, bCols[3], y);
      doc.text(`₱${item.unitPrice.toLocaleString()}`, bCols[4], y);
      doc.text(`₱${item.totalPrice.toLocaleString()}`, bCols[5], y);
      y += 5;
    }

    const boqTotal = project.boqItems.reduce((s, b) => s + b.totalPrice, 0);
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Grand Total: ₱${boqTotal.toLocaleString()}`, pageW - 14, y, { align: 'right' });
  }

  // Footer on each page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text(`HVAC Auto-Estimation — ${project.name} — Page ${i}/${totalPages}`, pageW / 2, 290, { align: 'center' });
    doc.setTextColor(0);
  }

  doc.save(`${project.name.replace(/\s+/g, '_')}_HVAC_Report.pdf`);
}

/* ─────────────── DXF Export (AutoCAD compatible) ─────────────── */

export function exportProjectDXF(project: ExportProject) {
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  // DXF header
  w('0'); w('SECTION');
  w('2'); w('HEADER');
  w('9'); w('$ACADVER'); w('1'); w('AC1009');
  w('0'); w('ENDSEC');

  // Tables section
  w('0'); w('SECTION');
  w('2'); w('TABLES');

  // Layer table
  w('0'); w('TABLE');
  w('2'); w('LAYER');
  w('70'); w('10');

  const layers = ['FLOOR_SLABS', 'ROOMS', 'ROOM_LABELS', 'DIMENSIONS', 'EQUIPMENT', 'TITLE'];
  const layerColors = [8, 1, 7, 3, 4, 5];
  layers.forEach((name, i) => {
    w('0'); w('LAYER');
    w('2'); w(name);
    w('70'); w('0');
    w('62'); w(String(layerColors[i]));
    w('6'); w('CONTINUOUS');
  });
  w('0'); w('ENDTAB');
  w('0'); w('ENDSEC');

  // Entities
  w('0'); w('SECTION');
  w('2'); w('ENTITIES');

  // Title block
  w('0'); w('TEXT');
  w('8'); w('TITLE');
  w('10'); w('0'); w('20'); w('-3');  w('30'); w('0');
  w('40'); w('1.5');
  w('1'); w(`PROJECT: ${project.name}`);

  w('0'); w('TEXT');
  w('8'); w('TITLE');
  w('10'); w('0'); w('20'); w('-5');  w('30'); w('0');
  w('40'); w('0.8');
  w('1'); w(`Client: ${project.clientName} | Type: ${project.buildingType} | City: ${project.city}`);

  // Draw floors and rooms
  const floorSpacing = 2; // gap between floors in Y
  let currentY = 0;

  for (const floor of project.floors) {
    const roomsPerRow = Math.max(1, Math.ceil(Math.sqrt(floor.rooms.length)));
    const roomSize = 6; // base room size in CAD units (meters)
    const gap = 1;
    const floorWidth = roomsPerRow * (roomSize + gap);
    const floorRows = Math.ceil(floor.rooms.length / roomsPerRow);
    const floorDepth = floorRows * (roomSize + gap);

    // Floor slab outline
    w('0'); w('LINE');
    w('8'); w('FLOOR_SLABS');
    w('10'); w('-1'); w('20'); w(String(currentY - 1)); w('30'); w('0');
    w('11'); w(String(floorWidth + 1)); w('21'); w(String(currentY - 1)); w('31'); w('0');

    w('0'); w('LINE');
    w('8'); w('FLOOR_SLABS');
    w('10'); w(String(floorWidth + 1)); w('20'); w(String(currentY - 1)); w('30'); w('0');
    w('11'); w(String(floorWidth + 1)); w('21'); w(String(currentY + floorDepth + 1)); w('31'); w('0');

    w('0'); w('LINE');
    w('8'); w('FLOOR_SLABS');
    w('10'); w(String(floorWidth + 1)); w('20'); w(String(currentY + floorDepth + 1)); w('30'); w('0');
    w('11'); w('-1'); w('21'); w(String(currentY + floorDepth + 1)); w('31'); w('0');

    w('0'); w('LINE');
    w('8'); w('FLOOR_SLABS');
    w('10'); w('-1'); w('20'); w(String(currentY + floorDepth + 1)); w('30'); w('0');
    w('11'); w('-1'); w('21'); w(String(currentY - 1)); w('31'); w('0');

    // Floor label
    w('0'); w('TEXT');
    w('8'); w('ROOM_LABELS');
    w('10'); w('-1'); w('20'); w(String(currentY + floorDepth + 2)); w('30'); w('0');
    w('40'); w('0.8');
    w('1'); w(`${floor.name} (Floor ${floor.floorNumber})`);

    floor.rooms.forEach((room, idx) => {
      const col = idx % roomsPerRow;
      const row = Math.floor(idx / roomsPerRow);
      const rx = col * (roomSize + gap);
      const ry = currentY + row * (roomSize + gap);

      const side = Math.min(Math.sqrt(room.area), roomSize);
      const rw = side;
      const rh = side;

      // Room rectangle
      w('0'); w('LINE'); w('8'); w('ROOMS');
      w('10'); w(String(rx)); w('20'); w(String(ry)); w('30'); w('0');
      w('11'); w(String(rx + rw)); w('21'); w(String(ry)); w('31'); w('0');

      w('0'); w('LINE'); w('8'); w('ROOMS');
      w('10'); w(String(rx + rw)); w('20'); w(String(ry)); w('30'); w('0');
      w('11'); w(String(rx + rw)); w('21'); w(String(ry + rh)); w('31'); w('0');

      w('0'); w('LINE'); w('8'); w('ROOMS');
      w('10'); w(String(rx + rw)); w('20'); w(String(ry + rh)); w('30'); w('0');
      w('11'); w(String(rx)); w('21'); w(String(ry + rh)); w('31'); w('0');

      w('0'); w('LINE'); w('8'); w('ROOMS');
      w('10'); w(String(rx)); w('20'); w(String(ry + rh)); w('30'); w('0');
      w('11'); w(String(rx)); w('21'); w(String(ry)); w('31'); w('0');

      // Room label
      w('0'); w('TEXT'); w('8'); w('ROOM_LABELS');
      w('10'); w(String(rx + 0.2)); w('20'); w(String(ry + rh - 0.4)); w('30'); w('0');
      w('40'); w('0.35');
      w('1'); w(room.name);

      // Room info
      w('0'); w('TEXT'); w('8'); w('DIMENSIONS');
      w('10'); w(String(rx + 0.2)); w('20'); w(String(ry + 0.6)); w('30'); w('0');
      w('40'); w('0.2');
      w('1'); w(`${room.area.toFixed(2)} m2 | ${room.ceilingHeight}m H`);

      if (room.coolingLoad) {
        w('0'); w('TEXT'); w('8'); w('EQUIPMENT');
        w('10'); w(String(rx + 0.2)); w('20'); w(String(ry + 0.2)); w('30'); w('0');
        w('40'); w('0.2');
        w('1'); w(`${room.coolingLoad.trValue} TR | ${room.coolingLoad.cfmSupply} CFM`);
      }
    });

    currentY += floorDepth + floorSpacing + 4;
  }

  w('0'); w('ENDSEC');
  w('0'); w('EOF');

  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, '_')}_HVAC.dxf`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────── CSV Export ─────────────── */

export function exportProjectCSV(project: ExportProject) {
  const rows: string[][] = [];

  // Header
  rows.push(['Floor', 'Room', 'Space Type', 'Area (m²)', 'Ceiling (m)', 'Occupants',
    'Wall', 'Window Area (m²)', 'Orientation', 'Glass Type',
    'Total Load (W)', 'TR', 'BTU/h', 'Sensible (W)', 'Latent (W)',
    'Wall Load', 'Roof Load', 'Glass Solar', 'Glass Cond',
    'Lighting', 'People Sens', 'People Lat', 'Equip Sens',
    'Vent Sens', 'Vent Lat', 'CFM Supply', 'CFM Return']);

  for (const floor of project.floors) {
    for (const room of floor.rooms) {
      const cl = room.coolingLoad;
      rows.push([
        `${floor.name} (F${floor.floorNumber})`,
        room.name,
        room.spaceType,
        String(room.area),
        String(room.ceilingHeight),
        String(room.occupantCount),
        room.wallConstruction,
        String(room.windowArea),
        room.windowOrientation,
        room.windowType,
        cl ? String(cl.totalLoad) : '',
        cl ? String(cl.trValue) : '',
        cl ? String(cl.btuPerHour) : '',
        cl ? String(cl.totalSensibleLoad) : '',
        cl ? String(cl.totalLatentLoad) : '',
        cl ? String(cl.wallLoad) : '',
        cl ? String(cl.roofLoad) : '',
        cl ? String(cl.glassSolarLoad) : '',
        cl ? String(cl.glassConductionLoad) : '',
        cl ? String(cl.lightingLoad) : '',
        cl ? String(cl.peopleLoadSensible) : '',
        cl ? String(cl.peopleLoadLatent) : '',
        cl ? String(cl.equipmentLoadSensible) : '',
        cl ? String(cl.ventilationLoadSensible) : '',
        cl ? String(cl.ventilationLoadLatent) : '',
        cl ? String(cl.cfmSupply) : '',
        cl ? String(cl.cfmReturn) : '',
      ]);
    }
  }

  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, '_')}_Cooling_Loads.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────── Excel Export ─────────────── */

export async function exportProjectExcel(project: ExportProject) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HVAC Auto-Estimation';
  workbook.created = new Date();

  // ── Sheet 1: Cooling Loads ──
  const ws1 = workbook.addWorksheet('Cooling Loads');

  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF2563EB' } },
    border: {
      top: { style: 'thin' as const },
      bottom: { style: 'thin' as const },
      left: { style: 'thin' as const },
      right: { style: 'thin' as const },
    },
  };

  const headers = ['Floor', 'Room', 'Space Type', 'Area (m²)', 'Ceiling (m)', 'Occupants',
    'Total Load (W)', 'TR', 'BTU/h', 'Sensible (W)', 'Latent (W)',
    'CFM Supply', 'CFM Return', 'Wall Load', 'Roof Load',
    'Glass Solar', 'Glass Cond', 'Lighting', 'People (S)',
    'People (L)', 'Equipment (S)', 'Vent (S)', 'Vent (L)'];

  const headerRow = ws1.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = headerStyle.font;
    cell.fill = headerStyle.fill;
    cell.border = headerStyle.border;
  });

  for (const floor of project.floors) {
    for (const room of floor.rooms) {
      const cl = room.coolingLoad;
      ws1.addRow([
        `${floor.name} (F${floor.floorNumber})`,
        room.name,
        room.spaceType.replace(/_/g, ' '),
        room.area,
        room.ceilingHeight,
        room.occupantCount,
        cl?.totalLoad ?? '',
        cl?.trValue ?? '',
        cl?.btuPerHour ?? '',
        cl?.totalSensibleLoad ?? '',
        cl?.totalLatentLoad ?? '',
        cl?.cfmSupply ?? '',
        cl?.cfmReturn ?? '',
        cl?.wallLoad ?? '',
        cl?.roofLoad ?? '',
        cl?.glassSolarLoad ?? '',
        cl?.glassConductionLoad ?? '',
        cl?.lightingLoad ?? '',
        cl?.peopleLoadSensible ?? '',
        cl?.peopleLoadLatent ?? '',
        cl?.equipmentLoadSensible ?? '',
        cl?.ventilationLoadSensible ?? '',
        cl?.ventilationLoadLatent ?? '',
      ]);
    }
  }

  ws1.columns.forEach((col) => {
    col.width = 14;
  });
  if (ws1.columns[0]) ws1.columns[0].width = 20;
  if (ws1.columns[1]) ws1.columns[1].width = 20;

  // ── Sheet 2: Equipment ──
  if (project.selectedEquipment.length > 0) {
    const ws2 = workbook.addWorksheet('Equipment');
    const eqHeaders = ['Brand', 'Model', 'Type', 'Capacity TR', 'Capacity BTU', 'Qty',
      'EER', 'Inverter', 'Unit Price (₱)', 'Total Price (₱)'];
    const eqRow = ws2.addRow(eqHeaders);
    eqRow.eachCell((cell) => {
      cell.font = headerStyle.font;
      cell.fill = headerStyle.fill;
      cell.border = headerStyle.border;
    });

    for (const eq of project.selectedEquipment) {
      ws2.addRow([
        eq.brand, eq.model, eq.type.replace(/_/g, ' '),
        eq.capacityTR, eq.capacityBTU, eq.quantity,
        eq.eer, eq.isInverter ? 'Yes' : 'No', eq.unitPrice, eq.totalPrice,
      ]);
    }
    ws2.columns.forEach((col) => { col.width = 16; });
  }

  // ── Sheet 3: BOQ ──
  if (project.boqItems.length > 0) {
    const ws3 = workbook.addWorksheet('BOQ');
    const bHeaders = ['Section', 'Description', 'Quantity', 'Unit', 'Unit Price (₱)', 'Total Price (₱)'];
    const bRow = ws3.addRow(bHeaders);
    bRow.eachCell((cell) => {
      cell.font = headerStyle.font;
      cell.fill = headerStyle.fill;
      cell.border = headerStyle.border;
    });

    for (const item of project.boqItems) {
      ws3.addRow([
        item.section, item.description, item.quantity,
        item.unit, item.unitPrice, item.totalPrice,
      ]);
    }

    const boqTotal = project.boqItems.reduce((s, b) => s + b.totalPrice, 0);
    const totalRow = ws3.addRow(['', '', '', '', 'GRAND TOTAL', boqTotal]);
    totalRow.eachCell((cell) => {
      cell.font = { bold: true, size: 12 };
    });

    ws3.columns.forEach((col) => { col.width = 18; });
    if (ws3.columns[1]) ws3.columns[1].width = 40;
  }

  // Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, '_')}_HVAC.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
