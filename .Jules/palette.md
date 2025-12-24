# Palette's Journal

## 2025-12-15 - Content Cards Hidden Summary
**Learning:** Hiding content until hover (`opacity-0`) makes it inaccessible to keyboard users. The `ContentCard` component hid summaries, leaving keyboard users with less context than mouse users.
**Action:** When implementing "reveal on hover" patterns, always pair `group-hover` with `group-focus-visible` to ensure keyboard users can access the same information.
