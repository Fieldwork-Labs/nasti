---
"nasti-mobile": patch
---

Signing in with a different account after logging out no longer shows "Local data is locked for this account" when the previous account has nothing left to upload. Logging out now clears that account's local data and cached screens from the device, so the next person starts fresh. If the previous account still has unsynced changes, failed uploads or a save in progress, the device stays locked to it as before.

Logging out with unsynced changes now asks for confirmation first, explaining that nobody else can use the device until those changes are uploaded. When someone else signs in while the device is still locked, they're told whose unsynced data is waiting, by name if that person is in their organisation, and asked to have them log in and finish uploading. The lock screen also no longer flashes briefly while signing in.
