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
  const { createAndDownloadPdf, hrLine, boldText } = await import('./pdf-make');
  type Content = import('pdfmake/interfaces').Content;

  const allRooms = project.floors.flatMap((f) => f.rooms);
  const totalTR = allRooms.reduce((s, r) => s + (r.coolingLoad?.trValue || 0), 0);
  const totalBTU = allRooms.reduce((s, r) => s + (r.coolingLoad?.btuPerHour || 0), 0);

  const bold = boldText;

  // Build floor-by-floor room tables
  const floorSections: Content[] = [];
  for (const floor of project.floors) {
    floorSections.push(bold(`${floor.name} (Floor ${floor.floorNumber})`, { fontSize: 11, margin: [0, 6, 0, 4] }));
    floorSections.push({
      table: {
        headerRows: 1,
        widths: [80, 60, 45, 40, 30, 55, 35],
        body: [
          ['Room', 'Type', 'Area (m²)', 'Height (m)', 'TR', 'BTU/h', 'CFM'].map((h) => bold(h, { fontSize: 8 })),
          ...floor.rooms.map((room) => [
            room.name.substring(0, 18),
            room.spaceType.replace(/_/g, ' ').substring(0, 14),
            room.area.toFixed(2),
            String(room.ceilingHeight),
            room.coolingLoad ? String(room.coolingLoad.trValue) : '—',
            room.coolingLoad ? room.coolingLoad.btuPerHour.toLocaleString() : '—',
            room.coolingLoad ? String(room.coolingLoad.cfmSupply) : '—',
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
      fontSize: 8,
      margin: [0, 0, 0, 6] as [number, number, number, number],
    });
  }

  // Equipment table
  const equipContent: Content[] = [];
  if (project.selectedEquipment.length > 0) {
    const eqTotal = project.selectedEquipment.reduce((s, e) => s + e.totalPrice, 0);
    equipContent.push(hrLine());
    equipContent.push(bold('Selected Equipment', { fontSize: 13, margin: [0, 4, 0, 4] }));
    equipContent.push({
      table: {
        headerRows: 1,
        widths: ['*', 70, 55, 30, 30, 65],
        body: [
          ['Brand / Model', 'Type', 'Capacity', 'Qty', 'EER', 'Total Price'].map((h) => bold(h, { fontSize: 8 })),
          ...project.selectedEquipment.map((eq) => [
            `${eq.brand} ${eq.model}`.substring(0, 30),
            eq.type.replace(/_/g, ' ').substring(0, 16),
            `${eq.capacityTR} TR`,
            String(eq.quantity),
            String(eq.eer),
            `₱${eq.totalPrice.toLocaleString()}`,
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
      fontSize: 8,
      margin: [0, 0, 0, 4] as [number, number, number, number],
    });
    equipContent.push(bold(`Equipment Subtotal: ₱${eqTotal.toLocaleString()}`, { alignment: 'right', fontSize: 9, margin: [0, 2, 0, 6] }));
  }

  // BOQ table
  const boqContent: Content[] = [];
  if (project.boqItems.length > 0) {
    const boqTotal = project.boqItems.reduce((s, b) => s + b.totalPrice, 0);
    boqContent.push(hrLine());
    boqContent.push(bold('Bill of Quantities', { fontSize: 13, margin: [0, 4, 0, 4] }));
    boqContent.push({
      table: {
        headerRows: 1,
        widths: [55, '*', 30, 35, 55, 60],
        body: [
          ['Section', 'Description', 'Qty', 'Unit', 'Unit Price', 'Total'].map((h) => bold(h, { fontSize: 8 })),
          ...project.boqItems.map((item) => [
            item.section.substring(0, 12),
            item.description.substring(0, 30),
            String(item.quantity),
            item.unit,
            `₱${item.unitPrice.toLocaleString()}`,
            `₱${item.totalPrice.toLocaleString()}`,
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
      fontSize: 8,
      margin: [0, 0, 0, 4] as [number, number, number, number],
    });
    boqContent.push(bold(`Grand Total: ₱${boqTotal.toLocaleString()}`, { alignment: 'right', fontSize: 10, margin: [0, 4, 0, 0] }));
  }

  await createAndDownloadPdf(
    {
      content: [
        { text: project.name, fontSize: 20, bold: true, alignment: 'center' },
        { text: `Client: ${project.clientName || '—'} | Type: ${project.buildingType} | City: ${project.city}`, fontSize: 10, alignment: 'center', margin: [0, 4, 0, 2] },
        { text: `Generated: ${new Date().toLocaleDateString()}`, fontSize: 10, alignment: 'center', margin: [0, 0, 0, 8] },
        bold('Design Conditions', { fontSize: 13, margin: [0, 6, 0, 4] }),
        { text: `Outdoor: ${project.outdoorDB}°C DB / ${project.outdoorWB}°C WB / ${project.outdoorRH}% RH`, fontSize: 9 },
        { text: `Indoor: ${project.indoorDB}°C DB / ${project.indoorRH}% RH`, fontSize: 9 },
        { text: `Total Floor Area: ${project.totalFloorArea} m²`, fontSize: 9, margin: [0, 0, 0, 8] },
        hrLine(),
        bold('Cooling Load Summary', { fontSize: 13, margin: [0, 6, 0, 4] }),
        { text: `Total Rooms: ${allRooms.length} | Total TR: ${totalTR.toFixed(2)} | Total BTU/h: ${totalBTU.toLocaleString()}`, fontSize: 9, margin: [0, 0, 0, 6] },
        ...floorSections,
        ...equipContent,
        ...boqContent,
      ],
      footer: (currentPage: number, pageCount: number) => ({
        text: `HVAC Auto-Estimation — ${project.name} — Page ${currentPage}/${pageCount}`,
        fontSize: 7,
        alignment: 'center' as const,
        color: '#999999',
        margin: [0, 10, 0, 0],
      }),
      pageSize: 'A4',
      defaultStyle: { font: 'Roboto' },
    },
    `${project.name.replace(/\s+/g, '_')}_HVAC_Report.pdf`,
  );
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
