# Player profile schema template

```lua
-- Example shape only. Merge with the existing profile system; do not install as a second system.
local DEFAULT_PROFILE = {
    Version = 1,
    Currency = 0,
    Inventory = {},
    ClaimedRewards = {},
}
return DEFAULT_PROFILE
```

Before use: identify the existing data owner, confirm what must persist, define migrations and failure behavior, and never overwrite real data with defaults after a failed load.
