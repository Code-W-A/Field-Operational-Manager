# Attendance System (Pontaj) Implementation

## Overview

This document describes the comprehensive attendance (pontaj) system implemented for FOM technicians. The system supports two modes of operation: **Office (Kiosk)** and **Field (In Car)**, with face recognition, GPS tracking, and extra time management.

## Features

### 1. Dual-Mode Check-In/Out

#### Office Mode (Kiosk)
- Dedicated device (phone/tablet) with a special kiosk user account
- No auto-logout for kiosk users
- User selection interface before face recognition
- Play/Stop buttons for check-in/out
- Accessible at `/kiosk` (legacy `/dashboard/kiosk` redirects)

#### Field Mode (In Car)
- Available in the technician's FOM app after authentication
- Integrated into the "lucrari" (work orders) page
- GPS location capture
- Play/Stop buttons with face recognition
- Real-time status display with timer

### 2. Interchangeable Methods
- A shift opened at the office can be closed in the car, and vice-versa
- Session continuity maintained across methods
- Automatic mode detection based on GPS location

### 3. Extra Time Tracking

#### Traseu Către Client (Route to Client)
- Activates after "Play" in the car
- Available until 8:00 AM
- Tracks paid extra time from button press until standard work start
- Automatically calculates eligible minutes

#### Traseu Către Casă (Route to Home)
- Activates after "Stop" in the car
- Available after standard work end (e.g., 4:30 PM)
- Active for max 1 hour after work end
- Tracks paid extra time for commute home

### 4. Safety Features

#### 1-Minute Rule
- After pressing "Play", "Stop" cannot be pressed for 60 seconds
- Visual countdown timer displayed
- Prevents accidental check-outs
- Enforced at both UI and database level

#### Location Validation
- GPS coordinates captured for field check-ins
- Automatic determination of office vs. field mode
- Reverse geocoding for human-readable addresses
- 50-meter radius for office detection

### 5. Face Recognition
- Mock implementation ready for production integration
- 3-second countdown before capture
- Success/failure animations
- Auto-retry on failure
- Confidence scoring
- Face ID storage for audit trail

### 6. HR System Integration

#### Automatic Sync
- Daily sync of attendance sessions to HR timesheet (condică)
- Separate calculation of work hours and extra hours
- Employee matching by UID or name
- Batch processing for efficiency

#### Manual Sync Interface
- Admin page at `/dashboard/resurse-umane/pontaj/sync`
- Single day sync
- Date range sync
- Sync status verification
- Detailed sync logs

### 7. Admin Dashboard
- Real-time attendance monitoring at `/dashboard/resurse-umane/pontaj/dashboard`
- Date-based filtering
- Statistics cards (total sessions, active now, hours worked, extra hours)
- Detailed session table with all relevant information
- Export capabilities (planned)

## File Structure

```
├── types/
│   └── attendance.ts                      # TypeScript types for attendance system
├── lib/
│   ├── attendance/
│   │   ├── storage.ts                     # Firebase CRUD operations
│   │   ├── location.ts                    # GPS and location utilities
│   │   ├── extra-time.ts                  # Extra time management
│   │   └── sync-timesheet.ts              # HR system sync logic
│   ├── face-recognition/
│   │   └── mock-service.ts                # Mock face recognition (ready for real API)
│   └── firebase/
│       └── auth.ts                        # Updated with kiosk role
├── components/
│   └── attendance/
│       ├── face-recognition-capture.tsx   # Face recognition UI component
│       ├── field-check-in-card.tsx        # Technician check-in card (for lucrari page)
│       ├── kiosk-check-in.tsx             # Office kiosk interface
│       └── check-in-card.tsx              # Base reference component
├── app/
│   └── dashboard/
│       ├── kiosk/
│       │   └── page.tsx                   # Kiosk mode page
│       ├── lucrari/
│       │   └── page.tsx                   # Updated with check-in card
│       └── resurse-umane/
│           └── pontaj/
│               ├── dashboard/
│               │   └── page.tsx           # Admin attendance dashboard
│               └── sync/
│                   └── page.tsx           # Manual sync interface
└── contexts/
    └── AuthContext.tsx                    # Updated to support kiosk role (no auto-logout)
```

## Database Schema

### Collection: `attendance`

```typescript
{
  id: string                    // Auto-generated
  userId: string                // Firebase Auth UID
  userName: string              // Display name
  sessionStart: Timestamp       // Check-in time
  sessionEnd?: Timestamp        // Check-out time (optional if active)
  mode: "office" | "field"      // Check-in method
  location: {
    lat: number
    lng: number
    address?: string            // Reverse geocoded
  }
  faceRecognitionId?: string    // Reference to face scan
  extraTimeLogs?: [
    {
      type: "to_client" | "to_home"
      startTime: number
      endTime?: number
      minutesEligible: number
    }
  ]
  status: "active" | "completed"
  deviceInfo: {
    type: string
    userAgent: string
  }
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### Collection: `hrTimesheets` (Updated by Sync)

```typescript
{
  employeeId: string
  date: string                  // YYYY-MM-DD
  entries: {
    [date]: {
      start: string             // HH:mm
      end: string               // HH:mm
      type: "P"                 // Present
      hours: string             // Decimal hours
      notes: string             // Includes extra time info
      syncedFromAttendance: true
      attendanceSessionIds: string[]
    }
  }
  syncedAt: Timestamp
  syncedBy: string
}
```

## User Roles

### Updated `UserRole` Type
```typescript
type UserRole = "admin" | "dispecer" | "tehnician" | "client" | "kiosk"
```

### Kiosk User
- Special role for office attendance devices
- `disableAutoLogout: true` in user document
- No access to other FOM features
- Dedicated kiosk page only

## Usage Instructions

### For Administrators

1. **Create Kiosk User**:
   - Go to Users management
   - Create a new user with role "Kiosk"
   - Assign to the office device
   - User will not be auto-logged out

2. **Setup Office Location**:
   - Edit `DEFAULT_OFFICE_LOCATION` in `/app/kiosk/page.tsx`
   - Set GPS coordinates and address

3. **Monitor Attendance**:
   - Visit `/dashboard/resurse-umane/pontaj/dashboard`
   - Select date to view sessions
   - Review statistics and session details

4. **Sync to HR System**:
   - Visit `/dashboard/resurse-umane/pontaj/sync`
   - Use single day sync for daily operations
   - Use range sync for backfilling or corrections

### For Eligible Employees (Tehnician/Admin/Dispecer)

1. **Check-In at Office**:
   - Use kiosk device at `/kiosk`
   - Press "Start" button
   - Select your name
   - Complete face recognition
   - Confirm success message

2. **Check-In in Field**:
   - Login to FOM app
   - Go to "Tichete" (lucrari) page
   - Find check-in card at top
   - Press "PLAY" button
   - Complete face recognition
   - Card shows active status with timer

3. **Request Extra Time**:
   - After check-in, buttons appear based on time:
     - "Traseu Către Client" (before 8 AM)
     - "Traseu Către Casă" (after 4:30 PM, max 1 hour)
   - Press button to start tracking
   - Time is automatically calculated

4. **Check-Out**:
   - Press "STOP" button (available after 1 minute)
   - Complete face recognition
   - Confirm success message
   - Session is saved

### Location-Based Features

The system automatically detects location:
- **At office** (within 50m of configured location): Mode = "office"
- **In field** (outside office radius): Mode = "field"
- Location is captured at both check-in and check-out
- Addresses are reverse-geocoded for readability

## Security & Privacy

1. **Face Recognition**:
   - Currently mocked (80% success rate for testing)
   - Ready for production API integration
   - Face IDs stored securely
   - No actual images stored (only reference IDs)

2. **Location Data**:
   - Only captured when checking in/out
   - Used for mode determination and audit
   - Addresses are approximate (geocoded)
   - Complies with GDPR (work-related tracking only)

3. **Session Validation**:
   - 1-minute rule prevents abuse
   - Active session check prevents double check-ins
   - User can only have one active session at a time

## Future Enhancements

1. **Real Face Recognition**:
   - Integrate with AWS Rekognition, Azure Face API, or similar
   - Update `lib/face-recognition/mock-service.ts`
   - Add face enrollment process

2. **Automated Daily Sync**:
   - Add Firebase Function or cron job
   - Run `syncAttendanceToTimesheet()` nightly
   - Email reports on failures

3. **Mobile App Integration**:
   - Convert to PWA for offline support
   - Background GPS tracking
   - Push notifications for reminders

4. **Analytics & Reports**:
   - Weekly/monthly attendance reports
   - Extra time approval workflow
   - Anomaly detection (e.g., missing check-outs)

5. **Geofencing**:
   - Multiple office locations
   - Client site geofences
   - Automatic check-in suggestions

## Testing

### Manual Testing Checklist

- [ ] Kiosk check-in flow (office)
- [ ] Kiosk check-out flow (office)
- [ ] Field check-in flow (in car)
- [ ] Field check-out flow (in car)
- [ ] Cross-method check-in/out (office → field)
- [ ] 1-minute rule enforcement
- [ ] Extra time - client route (before 8 AM)
- [ ] Extra time - home route (after 4:30 PM)
- [ ] Face recognition success flow
- [ ] Face recognition failure + retry
- [ ] HR timesheet sync (single day)
- [ ] HR timesheet sync (date range)
- [ ] Admin dashboard display
- [ ] Location capture and display

## Troubleshooting

### Common Issues

1. **"Nu s-a putut determina locația"**
   - User denied location permissions
   - GPS not available on device
   - Solution: Grant location permissions

2. **"Utilizatorul are deja o sesiune activă"**
   - Previous session not closed
   - Solution: Check out from previous session first
   - Admin: Manually update session status in Firestore

3. **"Nu există o sesiune activă"**
   - Trying to check out without checking in
   - Session expired or corrupted
   - Solution: Check in first, or contact admin

4. **Sync Failures**
   - Employee not found for user
   - Solution: Link user UID to employee in HR system
   - Or ensure display names match exactly

5. **Kiosk Auto-Logout**
   - User role not set to "kiosk"
   - `disableAutoLogout` flag missing
   - Solution: Update user document in Firestore

## Support

For issues or questions:
1. Check this documentation
2. Review Firestore console for data consistency
3. Check browser console for errors
4. Contact development team

## Changelog

### Version 1.0 (Initial Release)
- Dual-mode check-in/out (office & field)
- Face recognition integration (mocked)
- GPS location tracking
- Extra time tracking (client/home routes)
- 1-minute rule safety feature
- HR system sync
- Admin dashboard
- Kiosk user role

---

*Last Updated: January 2026*
