HVAC AUTOCALC
COMPLETE MASTER DEVELOPMENT PLAN

Professional HVAC Engineering Design Platform

Version: 1.0
System Type: Web-Based Engineering Software
Primary Purpose: HVAC Design, Airflow Simulation, and Data Center Cooling Optimization

1. SYSTEM VISION

HVAC AutoCalc will be a professional engineering platform designed to help engineers design and analyze HVAC systems with high accuracy.

The system combines:

• HVAC engineering calculations
• CAD-style floor plan design
• CFD airflow simulation
• 3D airflow visualization
• cooling optimization tools
• engineering reports

The goal is to create a complete engineering environment that engineers can use to design and evaluate HVAC cooling systems.

2. CORE SYSTEM CAPABILITIES

The platform must support the following engineering tasks:

Design building layouts
Place HVAC equipment
Calculate cooling loads
Simulate airflow distribution
Detect hot spots
Optimize cooling infrastructure
Generate engineering reports

3. SOFTWARE ARCHITECTURE

The system follows a multi-layer engineering architecture.

Client Interface
↓
Frontend Application
↓
Backend API
↓
Simulation Engine
↓
Database System
4. TECHNOLOGY STACK
Frontend

Language
TypeScript

Framework
React + Vite

Rendering
Three.js

UI Framework
TailwindCSS + ShadCN

State Management
Zustand

Backend

Language
Node.js

Framework
Fastify

Authentication
JWT + bcrypt

Database

PostgreSQL hosted on NeonDB

Deployment

Frontend → Netlify
Backend → Serverless functions
Database → Neon

5. DATABASE STRUCTURE

Core database tables include:

Users
Projects
Floors
Structures
HVAC Equipment
Server Racks
CFD Tiles
Simulation Results
Archives
User Logs

These tables store engineering data, designs, and simulation outputs.

6. USER INTERFACE SYSTEM MAP

The interface must provide a clear engineering workflow.

Main navigation panels:

Dashboard
Project Workspace
Floorplan Editor
3D Viewer
Simulation Control
Results Analysis
Reports

7. DASHBOARD

The dashboard provides system overview.

Features:

Recent projects
Create new project
Simulation summaries
Quick access tools

8. PROJECT WORKSPACE

The project workspace is the central design environment.

Panels:

Left Sidebar
Project assets

Top Toolbar
design tools

Main Workspace
floorplan canvas

Right Panel
object properties

Bottom Panel
simulation controls

9. FLOORPLAN CAD ENGINE

The CAD engine allows engineers to create building layouts.

Capabilities:

Draw walls
Add doors and windows
Define room dimensions
Place equipment
Edit objects

Coordinate system uses meters.

Snap-to-grid ensures accurate placement.

10. HVAC EQUIPMENT LIBRARY

Engineers can place HVAC components.

Equipment types include:

CRAC units
CRAH units
Air handling units
In-row cooling systems
Rear door heat exchangers
Ventilation ducts

Each object stores capacity and airflow.

11. DATA CENTER EQUIPMENT MODEL

Server racks generate heat.

Typical rack power densities:

Low density: 3–5 kW
Medium density: 5–10 kW
High density: 10–30 kW

Heat conversion:

1 watt = 3.412 BTU/hr

12. HVAC LOAD CALCULATION ENGINE

The calculation module determines cooling requirements.

Heat transfer equation

Q = U × A × ΔT

Airflow requirement

CFM = BTU / (1.08 × ΔT)

Total heat load

Qt = Qs + Ql

Cooling tonnage

Tons = BTU / 12000
13. CFD AIRFLOW SIMULATION ENGINE

The CFD module simulates airflow and heat distribution.

The space is divided into a 3D voxel grid.

Typical grid resolution:

0.5m × 0.5m × 0.5m

Each cell stores:

velocity
temperature
pressure
heat source

14. AIRFLOW PHYSICS MODEL

Simplified Navier–Stokes approximation.

Momentum equation

ρ (du/dt) = −∇P + μ∇²u + F

Temperature equation

dT/dt = α∇²T − (V·∇T) + Q
15. RAISED FLOOR PLENUM MODEL

Raised floor airflow is distributed through perforated tiles.

Tile airflow equation

V = sqrt((2 × ΔP) / ρ)

Correction factor

C ≈ 1.6

Corrected airflow

V_corrected = C × V
16. RACK HEAT PLUME MODEL

Hot air rises due to buoyancy.

Buoyancy force

F = ρ g β (T − T_ref)

This generates upward airflow above racks.

17. SIMULATION PROCESS

Each simulation iteration performs:

1 Apply airflow sources
2 Apply heat sources
3 Update velocity field
4 Update pressure field
5 Update temperature field
6 Advect airflow through grid

18. 3D VISUALIZATION SYSTEM

Three.js renders the building model.

Scene objects include:

Floor mesh
Wall mesh
Rack models
HVAC equipment
Airflow particles

19. AIRFLOW VISUALIZATION

Airflow is shown using:

Vector arrows
Particle streams
Temperature heatmaps

Particles move according to velocity vectors.

20. COOLING OPTIMIZATION ENGINE

The optimizer tests design variations.

Parameters adjusted:

Tile placement
CRAC position
Rack layout

Goal

Minimize hotspot severity.

21. AI ENGINEERING ASSISTANT

The AI module analyzes simulation outputs.

It detects:

Cooling gaps
Hotspots
Airflow recirculation
Insufficient cooling capacity

It suggests design improvements.

22. ASHRAE COMPLIANCE ENGINE

The system validates designs against guidelines from the American Society of Heating, Refrigerating and Air-Conditioning Engineers.

Checks include:

Rack inlet temperature range
Airflow per rack
Cooling redundancy

23. FAILURE SIMULATION

Engineers can simulate system failures.

Examples:

CRAC failure
Power loss
Cooling restart

Thermal rise equation

dT/dt = Q / (m × Cp)
24. ENERGY EFFICIENCY ANALYSIS

Calculate Power Usage Effectiveness.

PUE = Total Facility Power / IT Power

Lower PUE indicates better efficiency.

25. INTERACTIVE TUTORIAL SYSTEM

New users are guided through the interface.

Tutorial steps highlight UI elements while blurring the background.

Each step explains:

tool function
engineering purpose
recommended workflow

26. CONTEXTUAL HINTS

Hovering over tools shows explanations.

Examples:

CRAC placement
tile placement
rack layout best practices

27. REPORT GENERATION

The system generates professional engineering reports.

Reports include:

Cooling load calculations
Equipment list
CFD airflow results
Optimization recommendations

Export format:

PDF engineering documentation.

28. PERFORMANCE OPTIMIZATION

Performance strategies include:

GPU rendering
WebGL acceleration
worker threads for simulation
geometry batching

29. SECURITY SYSTEM

Authentication uses:

JWT tokens
bcrypt password hashing

User roles:

Admin
Engineer
Viewer

30. FUTURE EXTENSIONS

Possible future upgrades include:

Real sensor integration
IoT HVAC monitoring
Machine learning design optimization
cloud-based CFD simulations

FINAL OBJECTIVE

The finished HVAC AutoCalc platform must function as a professional HVAC engineering software system capable of assisting engineers with:

HVAC system design
Cooling load calculations
Airflow simulations
Thermal risk assessment
Data center cooling optimization

The system must be accurate, stable, and visually professional, capable of being presented as a serious engineering tool developed by you.