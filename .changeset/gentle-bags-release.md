---
"nasti-mobile": patch
---

Signing in with a different account after logging out no longer shows "Local data is locked for this account" when the previous account has nothing left to upload. Logging out now clears that account's local data and cached screens from the device, so the next person starts fresh. If the previous account still has unsynced changes, failed uploads or a save in progress, the device stays locked to it as before. The lock screen also no longer flashes briefly while signing in.
