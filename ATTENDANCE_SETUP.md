# Attendance System - Quick Setup Guide

## Prerequisites

- FOM app running with Firebase configured
- Admin access to Firebase Console
- Device for kiosk mode (tablet/phone recommended)

## Step-by-Step Setup

### 1. Create Kiosk User (5 minutes)

1. Login as admin
2. Navigate to **Users Management** (`/dashboard/utilizatori`)
3. Click **"Add User"**
4. Fill in details:
   - Email: `kiosk@yourcompany.com`
   - Password: (strong password)
   - Display Name: `Pontaj Birou`
   - Role: **Kiosk**
5. Save the user
6. In Firebase Console:
   - Go to Firestore → `users` collection
   - Find the newly created kiosk user
   - Add field: `disableAutoLogout: true`

### 2. Configure Office Location (2 minutes)

1. Open `/app/dashboard/kiosk/page.tsx`
2. Update `DEFAULT_OFFICE_LOCATION`:
   ```typescript
   const DEFAULT_OFFICE_LOCATION: OfficeLocation = {
     lat: 44.4268,      // Your office latitude
     lng: 26.1025,      // Your office longitude
     address: "Your Office Address",
   }
   ```
3. Save the file

**How to get coordinates:**
- Go to Google Maps
- Right-click on your office location
- Click on the coordinates (e.g., "44.4268, 26.1025")
- Copy the values

### 3. Setup Kiosk Device (3 minutes)

1. Use a dedicated tablet or phone for office
2. Open browser and go to: `https://yourapp.com/dashboard/kiosk`
3. Login with kiosk credentials (email/password from Step 1)
4. Bookmark the page or add to home screen
5. **Important**: The device will stay logged in (no auto-logout)

### 4. Link Employees to Users (10 minutes)

For the sync to work, employees must be linked to user accounts:

**Option A: Automatic (by name matching)**
- Ensure employee names in HR system match user display names exactly
- Sync will auto-match: `"Prenume Nume"` in employees = `displayName` in users

**Option B: Manual (recommended)**
1. Go to Firebase Console → Firestore
2. For each employee in `hrEmployees`:
   - Find corresponding user in `users` collection
   - Copy user's document ID (UID)
   - Add field to employee: `userUid: "copied-uid-here"`

### 5. Test the System (10 minutes)

#### Test Office Check-In:
1. Go to kiosk device
2. Press **"Start"**
3. Select a technician name
4. Complete face recognition (mocked - will succeed)
5. Verify success message

#### Test Field Check-In:
1. Login as technician on phone
2. Go to "Tichete" page
3. See check-in card at top
4. Press **"PLAY"**
5. Complete face recognition
6. Verify card shows "CHECKED IN" with timer

#### Test Check-Out:
1. Wait 1 minute (required)
2. Press **"STOP"**
3. Complete face recognition
4. Verify success message

### 6. Setup HR Sync (Optional but Recommended)

#### Manual Sync:
1. Login as admin
2. Go to `/dashboard/resurse-umane/pontaj/sync`
3. Select yesterday's date
4. Click **"Sincronizează"**
5. Check "Condică de prezență" to verify entries created

#### Automated Sync (Future):
- Will be triggered automatically via Firebase Functions
- For now, run manual sync daily

### 7. Monitor Attendance

1. Go to `/dashboard/resurse-umane/pontaj/dashboard`
2. Select date to view
3. Review:
   - Total sessions
   - Active sessions
   - Hours worked
   - Extra time requests

## Common Setup Issues

### Issue: Kiosk keeps logging out
**Solution**: 
1. Check user role is set to "kiosk" (not "tehnician")
2. Verify `disableAutoLogout: true` in Firestore user document
3. Clear browser cache and re-login

### Issue: "Employee not found" during sync
**Solution**:
1. Check employee has `userUid` field in Firestore
2. Or ensure employee name exactly matches user displayName
3. Use manual linking (Step 4, Option B)

### Issue: Face recognition always fails
**Solution**:
- This is a mock service (80% success rate for testing)
- Keep retrying - it will succeed
- For production: integrate real face recognition API (see main docs)

### Issue: Location not detected
**Solution**:
1. Browser must have location permissions
2. Check browser console for errors
3. Ensure HTTPS (required for geolocation)
4. For kiosk mode: location is optional (uses office default)

### Issue: Extra time buttons don't appear
**Solution**:
1. Check current time:
   - "Traseu Către Client" only shows before 8 AM
   - "Traseu Către Casă" only shows after work end (e.g., 4:30 PM)
2. Verify session is active (checked in)
3. Buttons disappear after first use (can't request same route twice)

## Next Steps

1. **Train Technicians**:
   - Show them the check-in card on "Tichete" page
   - Explain 1-minute wait rule
   - Demo extra time buttons

2. **Setup Office Device**:
   - Mount tablet in visible location
   - Plug in to keep charged
   - Test with all team members

3. **Monitor for a Week**:
   - Check dashboard daily
   - Verify sync is working
   - Collect feedback from technicians

4. **Fine-Tune**:
   - Adjust office location radius if needed (in `location.ts`)
   - Customize work hours for extra time (in `field-check-in-card.tsx`)
   - Update face recognition to production API when ready

## Quick Reference

### URLs
- Kiosk: `/dashboard/kiosk`
- Dashboard: `/dashboard/resurse-umane/pontaj/dashboard`
- Sync: `/dashboard/resurse-umane/pontaj/sync`
- HR Timesheet: `/dashboard/resurse-umane/condica-prezenta`

### Default Times
- Work start: 8:00 AM
- Work end: 4:30 PM (16:30)
- Extra time window: 1 hour after work end
- Check-out wait: 1 minute after check-in

### Support
For issues, check:
1. Browser console for errors
2. Firebase Console → Firestore for data
3. Main documentation: `ATTENDANCE_SYSTEM.md`

---

**Setup Complete!** 🎉

Your attendance system is ready to use. Monitor it for the first few days and adjust as needed.
