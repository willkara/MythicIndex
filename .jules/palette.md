## 2025-02-23 - Consistent Focus States
**Learning:** Custom button implementations (raw `<button>` tags) often miss the `focus-visible` styles that are standard in the UI library's `Button` component, leading to inconsistent keyboard navigation experiences.
**Action:** When auditing components, check all raw `<button>` elements for `focus-visible:ring-*` classes and align them with the design system's focus patterns (e.g. `ring-primary`).
