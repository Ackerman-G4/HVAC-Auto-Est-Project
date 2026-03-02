-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "clientName" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT 'Manila',
    "city" TEXT NOT NULL DEFAULT 'Manila',
    "buildingType" TEXT NOT NULL DEFAULT 'office',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "outputClassification" TEXT NOT NULL DEFAULT 'preliminary',
    "totalFloorArea" REAL NOT NULL DEFAULT 0,
    "floorsAboveGrade" INTEGER NOT NULL DEFAULT 1,
    "floorsBelowGrade" INTEGER NOT NULL DEFAULT 0,
    "outdoorDB" REAL NOT NULL DEFAULT 35,
    "outdoorWB" REAL NOT NULL DEFAULT 28,
    "indoorDB" REAL NOT NULL DEFAULT 24,
    "indoorRH" REAL NOT NULL DEFAULT 50,
    "designConditions" TEXT NOT NULL DEFAULT '{}',
    "safetyFactor" REAL NOT NULL DEFAULT 1.1,
    "diversityFactor" REAL NOT NULL DEFAULT 0.85,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "floorNumber" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'Ground Floor',
    "floorPlanImage" TEXT,
    "scale" REAL NOT NULL DEFAULT 50,
    "ceilingHeight" REAL NOT NULL DEFAULT 3.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Floor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Room',
    "polygon" TEXT NOT NULL DEFAULT '[]',
    "area" REAL NOT NULL DEFAULT 0,
    "perimeter" REAL NOT NULL DEFAULT 0,
    "spaceType" TEXT NOT NULL DEFAULT 'office',
    "occupantCount" INTEGER NOT NULL DEFAULT 2,
    "lightingDensity" REAL NOT NULL DEFAULT 15,
    "equipmentLoad" REAL NOT NULL DEFAULT 10,
    "wallConstruction" TEXT NOT NULL DEFAULT 'concrete_150mm',
    "windowArea" REAL NOT NULL DEFAULT 0,
    "windowOrientation" TEXT NOT NULL DEFAULT 'N',
    "windowType" TEXT NOT NULL DEFAULT 'single_clear_6mm',
    "ceilingHeight" REAL NOT NULL DEFAULT 3.0,
    "hasRoofExposure" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Room_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoolingLoad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "wallLoad" REAL NOT NULL DEFAULT 0,
    "roofLoad" REAL NOT NULL DEFAULT 0,
    "glassSolarLoad" REAL NOT NULL DEFAULT 0,
    "glassConductionLoad" REAL NOT NULL DEFAULT 0,
    "lightingLoad" REAL NOT NULL DEFAULT 0,
    "peopleLoadSensible" REAL NOT NULL DEFAULT 0,
    "peopleLoadLatent" REAL NOT NULL DEFAULT 0,
    "equipmentLoadSensible" REAL NOT NULL DEFAULT 0,
    "infiltrationLoadSensible" REAL NOT NULL DEFAULT 0,
    "infiltrationLoadLatent" REAL NOT NULL DEFAULT 0,
    "ventilationLoadSensible" REAL NOT NULL DEFAULT 0,
    "ventilationLoadLatent" REAL NOT NULL DEFAULT 0,
    "totalSensibleLoad" REAL NOT NULL DEFAULT 0,
    "totalLatentLoad" REAL NOT NULL DEFAULT 0,
    "totalLoad" REAL NOT NULL DEFAULT 0,
    "trValue" REAL NOT NULL DEFAULT 0,
    "btuPerHour" REAL NOT NULL DEFAULT 0,
    "cfmSupply" REAL NOT NULL DEFAULT 0,
    "cfmFreshAir" REAL NOT NULL DEFAULT 0,
    "cfmReturn" REAL NOT NULL DEFAULT 0,
    "cfmExhaust" REAL NOT NULL DEFAULT 0,
    "safetyFactor" REAL NOT NULL DEFAULT 1.1,
    "diversityFactor" REAL NOT NULL DEFAULT 0.85,
    "calculationMethod" TEXT NOT NULL DEFAULT 'CLTD_CLF',
    "inputSnapshot" TEXT NOT NULL DEFAULT '{}',
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoolingLoad_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "capacityTR" REAL NOT NULL,
    "capacityBTU" REAL NOT NULL,
    "capacityKW" REAL NOT NULL,
    "powerInputKW" REAL NOT NULL,
    "currentAmps" REAL NOT NULL,
    "phase" TEXT NOT NULL DEFAULT '1-phase',
    "voltage" INTEGER NOT NULL DEFAULT 220,
    "refrigerant" TEXT NOT NULL DEFAULT 'R32',
    "eer" REAL NOT NULL DEFAULT 10,
    "cop" REAL NOT NULL DEFAULT 3.0,
    "indoorDimensions" TEXT NOT NULL DEFAULT '',
    "outdoorDimensions" TEXT NOT NULL DEFAULT '',
    "indoorWeight" REAL NOT NULL DEFAULT 0,
    "outdoorWeight" REAL NOT NULL DEFAULT 0,
    "maxPipeLength" REAL NOT NULL DEFAULT 15,
    "maxElevation" REAL NOT NULL DEFAULT 10,
    "liquidPipeSize" TEXT NOT NULL DEFAULT '1/4',
    "gasPipeSize" TEXT NOT NULL DEFAULT '3/8',
    "unitPricePHP" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SelectedEquipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "positionX" REAL NOT NULL DEFAULT 0,
    "positionY" REAL NOT NULL DEFAULT 0,
    "derating" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SelectedEquipment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SelectedEquipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specification" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'pc',
    "unitPricePHP" REAL NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Material_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'national',
    "website" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "contactInfo" TEXT NOT NULL DEFAULT '',
    "coverageArea" TEXT NOT NULL DEFAULT '',
    "categories" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BOQItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL,
    "specification" TEXT NOT NULL DEFAULT '',
    "quantity" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'pc',
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "totalPrice" REAL NOT NULL DEFAULT 0,
    "materialId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BOQItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BOQItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PipeRoute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" TEXT NOT NULL DEFAULT '[]',
    "length" REAL NOT NULL DEFAULT 0,
    "diameter" TEXT NOT NULL DEFAULT '',
    "insulation" TEXT NOT NULL DEFAULT '',
    "refrigerantCharge" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PipeRoute_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DuctSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" TEXT NOT NULL DEFAULT '[]',
    "width" REAL NOT NULL DEFAULT 0,
    "height" REAL NOT NULL DEFAULT 0,
    "length" REAL NOT NULL DEFAULT 0,
    "material" TEXT NOT NULL DEFAULT 'GI',
    "gaugeNumber" INTEGER NOT NULL DEFAULT 24,
    "insulationType" TEXT NOT NULL DEFAULT 'PE Foam',
    "insulationThickness" REAL NOT NULL DEFAULT 25,
    "accessories" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DuctSegment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ElectricalLoad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "equipmentName" TEXT NOT NULL,
    "powerKW" REAL NOT NULL DEFAULT 0,
    "currentAmps" REAL NOT NULL DEFAULT 0,
    "voltage" INTEGER NOT NULL DEFAULT 220,
    "phase" TEXT NOT NULL DEFAULT '1-phase',
    "cableSize" TEXT NOT NULL DEFAULT '',
    "breakerRating" INTEGER NOT NULL DEFAULT 0,
    "disconnectType" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ElectricalLoad_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL DEFAULT '',
    "previousValue" TEXT NOT NULL DEFAULT '',
    "newValue" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Floor_projectId_idx" ON "Floor"("projectId");

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
