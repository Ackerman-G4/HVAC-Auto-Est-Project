-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT 'Manila',
    "city" TEXT NOT NULL DEFAULT 'Manila',
    "buildingType" TEXT NOT NULL DEFAULT 'office',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "outputClassification" TEXT NOT NULL DEFAULT 'preliminary',
    "totalFloorArea" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "floorsAboveGrade" INTEGER NOT NULL DEFAULT 1,
    "floorsBelowGrade" INTEGER NOT NULL DEFAULT 0,
    "outdoorDB" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "outdoorWB" DOUBLE PRECISION NOT NULL DEFAULT 28,
    "outdoorRH" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "indoorDB" DOUBLE PRECISION NOT NULL DEFAULT 24,
    "indoorRH" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "designConditions" TEXT NOT NULL DEFAULT '{}',
    "safetyFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.1,
    "diversityFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "floorNumber" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'Ground Floor',
    "floorPlanImage" TEXT,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "ceilingHeight" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Room',
    "polygon" TEXT NOT NULL DEFAULT '[]',
    "area" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perimeter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spaceType" TEXT NOT NULL DEFAULT 'office',
    "occupantCount" INTEGER NOT NULL DEFAULT 2,
    "lightingDensity" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "equipmentLoad" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "wallConstruction" TEXT NOT NULL DEFAULT 'concrete_150mm',
    "windowArea" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "windowOrientation" TEXT NOT NULL DEFAULT 'N',
    "windowType" TEXT NOT NULL DEFAULT 'single_clear_6mm',
    "ceilingHeight" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "hasRoofExposure" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoolingLoad" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "wallLoad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roofLoad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "glassSolarLoad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "glassConductionLoad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lightingLoad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "peopleLoadSensible" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "peopleLoadLatent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "equipmentLoadSensible" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "infiltrationLoadSensible" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "infiltrationLoadLatent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ventilationLoadSensible" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ventilationLoadLatent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSensibleLoad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLatentLoad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLoad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "btuPerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cfmSupply" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cfmFreshAir" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cfmReturn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cfmExhaust" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "safetyFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.1,
    "diversityFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "calculationMethod" TEXT NOT NULL DEFAULT 'CLTD_CLF',
    "inputSnapshot" TEXT NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoolingLoad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "capacityTR" DOUBLE PRECISION NOT NULL,
    "capacityBTU" DOUBLE PRECISION NOT NULL,
    "capacityKW" DOUBLE PRECISION NOT NULL,
    "powerInputKW" DOUBLE PRECISION NOT NULL,
    "currentAmps" DOUBLE PRECISION NOT NULL,
    "phase" TEXT NOT NULL DEFAULT '1-phase',
    "voltage" INTEGER NOT NULL DEFAULT 220,
    "refrigerant" TEXT NOT NULL DEFAULT 'R32',
    "eer" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "cop" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "indoorDimensions" TEXT NOT NULL DEFAULT '',
    "outdoorDimensions" TEXT NOT NULL DEFAULT '',
    "indoorWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outdoorWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxPipeLength" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "maxElevation" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "liquidPipeSize" TEXT NOT NULL DEFAULT '1/4',
    "gasPipeSize" TEXT NOT NULL DEFAULT '3/8',
    "unitPricePHP" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectedEquipment" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "derating" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SelectedEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specification" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'pc',
    "unitPricePHP" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'national',
    "website" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "contactInfo" TEXT NOT NULL DEFAULT '',
    "coverageArea" TEXT NOT NULL DEFAULT '',
    "categories" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BOQItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL,
    "specification" TEXT NOT NULL DEFAULT '',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'pc',
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "materialId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BOQItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipeRoute" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" TEXT NOT NULL DEFAULT '[]',
    "length" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diameter" TEXT NOT NULL DEFAULT '',
    "insulation" TEXT NOT NULL DEFAULT '',
    "refrigerantCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipeRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuctSegment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" TEXT NOT NULL DEFAULT '[]',
    "width" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "length" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "material" TEXT NOT NULL DEFAULT 'GI',
    "gaugeNumber" INTEGER NOT NULL DEFAULT 24,
    "insulationType" TEXT NOT NULL DEFAULT 'PE Foam',
    "insulationThickness" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "accessories" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuctSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectricalLoad" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "equipmentName" TEXT NOT NULL,
    "powerKW" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentAmps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voltage" INTEGER NOT NULL DEFAULT 220,
    "phase" TEXT NOT NULL DEFAULT '1-phase',
    "cableSize" TEXT NOT NULL DEFAULT '',
    "breakerRating" INTEGER NOT NULL DEFAULT 0,
    "disconnectType" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectricalLoad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL DEFAULT '',
    "previousValue" TEXT NOT NULL DEFAULT '',
    "newValue" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "data" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticHistory" (
    "id" TEXT NOT NULL,
    "systemType" TEXT NOT NULL DEFAULT '',
    "input" TEXT NOT NULL DEFAULT '{}',
    "result" TEXT NOT NULL DEFAULT '{}',
    "faultCount" INTEGER NOT NULL DEFAULT 0,
    "maxSeverity" TEXT NOT NULL DEFAULT 'info',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Floor_projectId_idx" ON "Floor"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_projectId_floorNumber_key" ON "Floor"("projectId", "floorNumber");

-- CreateIndex
CREATE INDEX "Room_floorId_idx" ON "Room"("floorId");

-- CreateIndex
CREATE UNIQUE INDEX "CoolingLoad_roomId_key" ON "CoolingLoad"("roomId");

-- CreateIndex
CREATE INDEX "SelectedEquipment_roomId_idx" ON "SelectedEquipment"("roomId");

-- CreateIndex
CREATE INDEX "SelectedEquipment_equipmentId_idx" ON "SelectedEquipment"("equipmentId");

-- CreateIndex
CREATE INDEX "Material_category_idx" ON "Material"("category");

-- CreateIndex
CREATE INDEX "Material_supplierId_idx" ON "Material"("supplierId");

-- CreateIndex
CREATE INDEX "BOQItem_projectId_idx" ON "BOQItem"("projectId");

-- CreateIndex
CREATE INDEX "BOQItem_category_idx" ON "BOQItem"("category");

-- CreateIndex
CREATE INDEX "PipeRoute_projectId_idx" ON "PipeRoute"("projectId");

-- CreateIndex
CREATE INDEX "DuctSegment_projectId_idx" ON "DuctSegment"("projectId");

-- CreateIndex
CREATE INDEX "ElectricalLoad_projectId_idx" ON "ElectricalLoad"("projectId");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_idx" ON "AuditLog"("projectId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoolingLoad" ADD CONSTRAINT "CoolingLoad_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectedEquipment" ADD CONSTRAINT "SelectedEquipment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectedEquipment" ADD CONSTRAINT "SelectedEquipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOQItem" ADD CONSTRAINT "BOQItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOQItem" ADD CONSTRAINT "BOQItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeRoute" ADD CONSTRAINT "PipeRoute_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuctSegment" ADD CONSTRAINT "DuctSegment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectricalLoad" ADD CONSTRAINT "ElectricalLoad_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
