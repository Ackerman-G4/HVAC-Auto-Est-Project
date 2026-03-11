# Firebase Configuration & Security Rules

This document tracks the security rules and RBAC (Role-Based Access Control) configuration for the HVAC Auto-Est project.

## 1. Authentication Configuration
- **Provider:** Google Login (Enabled)
- **Custom Claims:** Used for RBAC roles.
  - `admin`: Full access to metadata (materials/suppliers) and user management.
  - `engineer`: Default role. Can create and manage own projects.
  - `viewer`: Read-only access to specific projects.

## 2. Realtime Database Security Rules

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    
    "users": {
      "$uid": {
        // Users can only read/write their own profile and project list
        ".read": "auth != null && auth.uid == $uid",
        ".write": "auth != null && auth.uid == $uid",
        
        "projects": {
          "$projectId": {
            ".validate": "newData.hasChildren(['name', 'status'])"
          }
        },
        "settings": {
           ".read": "auth != null && auth.uid == $uid",
           ".write": "auth != null && auth.uid == $uid"
        }
      }
    },
    
    "projectData": {
      "$projectId": {
        // Access is granted if the project exists in the user's project list
        // OR if they are an admin
        ".read": "auth != null && (root.child('users').child(auth.uid).child('projects').child($projectId).exists() || auth.token.admin === true)",
        ".write": "auth != null && (root.child('users').child(auth.uid).child('projects').child($projectId).exists() || auth.token.admin === true)",
        
        "floors": {
          ".indexOn": ["floorNumber"]
        },
        "rooms": {
          ".indexOn": ["floorId"]
        }
      }
    },
    
    "metadata": {
      // Global metadata like materials and suppliers
      "materials": {
        ".read": "auth != null", // Any logged-in user can read
        ".write": "auth != null && auth.token.admin === true" // Only admins can update
      },
      "suppliers": {
        ".read": "auth != null",
        ".write": "auth != null && auth.token.admin === true"
      }
    },
    
    "simulations": {
      "$projectId": {
        ".read": "auth != null && (root.child('users').child(auth.uid).child('projects').child($projectId).exists() || auth.token.admin === true)",
        ".write": "auth != null && (root.child('users').child(auth.uid).child('projects').child($projectId).exists() || auth.token.admin === true)"
      }
    },
    
    "auditLogs": {
      "$uid": {
        ".read": "auth != null && (auth.uid == $uid || auth.token.admin === true)",
        ".write": "auth != null && auth.uid == $uid"
      }
    }
  }
}
```

## 3. RBAC Implementation Logic

### Admin Setup
To set an admin claim, use the Firebase Admin SDK (e.g., in a one-time script or admin tool):
```javascript
admin.auth().setCustomUserClaims(uid, { admin: true });
```

### Route Protection (Server-Side)
Our API routes verify the token and can check for these claims:
```javascript
const decodedToken = await adminAuth.verifyIdToken(token);
if (decodedToken.admin) {
  // Grant elevated access
}
```

## 4. Path Explanations
- `/users/{uid}/projects`: Shallow metadata for project listings (Name, Status, Date).
- `/projectData/{projectId}`: Deep project data (Floors, Rooms, BOQ). Separated to keep project lists fast.
- `/metadata`: Shared global industry data.
- `/simulations`: Heavy binary/JSON data for CFD tiles, separated to avoid bloating project data.
