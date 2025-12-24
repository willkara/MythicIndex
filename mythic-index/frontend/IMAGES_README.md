ResponsiveImage component — Usage guide

Purpose

- Use `app-responsive-image` for any image where an `ImageAsset` (with derivatives and optional blurhash) is available.
- Provides: blurhash LQIP, responsive srcset (AVIF/WebP/JPEG), sizing, object-fit, and Cloudflare variant hints.

Inputs (component)

- `@Input() asset: ImageAsset` — the full ImageAsset object (required for progressive loading).
- `@Input() alt: string` — accessibility text.
- `@Input() targetWidth?: number` — desired intrinsic width for the component (used to choose derivative).
- `@Input() sizes?: string` — HTML `sizes` attribute for responsive images.
- `@Input() loading?: 'lazy'|'eager'` — image loading hint.
- `@Input() objectFit?: 'cover'|'contain'|'fill'` — CSS object-fit.
- `@Input() cloudflareUsage?: string` — hint to choose a context-aware Cloudflare variant (e.g., 'portrait', 'establishing', 'gallery-thumb').
- `@Input() displayContext?: string` — optional alias for cloudflareUsage.
- `@Input() blurhashSize?: number` — size of decoded blurhash placeholder (default small).

Template patterns & safety

- Always guard asset bindings in templates. The Angular template compiler is strict; avoid `!.asset` or unguarded `.asset` access.
- Preferred pattern:
  - Use `*ngIf` with `as` to alias the asset and bind to that alias:

    <ng-container \*ngIf="item.featuredImage?.asset as imageAsset">
    <app-responsive-image [asset]="imageAsset" alt="..." />
    </ng-container>

  - Alternatively, alias the whole object if you compute it in the component:

    <ng-container \*ngIf="cardImageAsset() as imageAsset">
    <app-responsive-image [asset]="imageAsset" />
    </ng-container>

- Avoid non-null assertions in templates like `[asset]="cardImageAsset()!"` — they lead to compile errors under strict templates.

Fallbacks

- If no ImageAsset is available, fall back to a static placeholder image element with `loading="lazy"`.

Example — gallery thumbnail (safe)

<ng-container \*ngIf="image.imageLink?.asset as thumbAsset">
<app-responsive-image
[asset]="thumbAsset"
[targetWidth]="256"
[cloudflareUsage]="'gallery-thumb'"
[loading]="i < 6 ? 'eager' : 'lazy'"
class="thumbnail-image" ></app-responsive-image>
</ng-container>
<ng-template #thumbImg>
<img src="/images/reader/reader-placeholder.png" alt="..." loading="lazy" />
</ng-template>

Notes & best practices

- Prefer aliasing `asset` in the template to avoid long expressions and to satisfy the compiler.
- Use `cloudflareUsage`/`displayContext` to request appropriately sized Cloudflare variants (thumbnail, portrait, establishing, gallery-active, etc.).
- When writing components that compute `cardImageAsset()` or similar, ensure the function returns `ImageAsset | null` and use `*ngIf` aliasing in the template.
- The `ResponsiveImageComponent` will attempt to use `asset.derivatives` and `asset.cloudflare` metadata; provide the full `ImageAsset` where possible.

Troubleshooting

- Template compile error: "Object is possibly 'null' or 'undefined'" — fix by using `*ngIf="...?.asset as alias"` before binding.
- If images are missing in UI, verify backend `image_link` rows exist linking the content to an `ImageAsset` (data ingestion issue).

Contact

- For questions about Cloudflare variants or the variant manifest, see the repo docs: `CLOUDFLARE_VARIANT_QUICKSTART.md` and `CONTEXT_AWARE_VARIANT_SELECTION_COMPLETE.md`.
