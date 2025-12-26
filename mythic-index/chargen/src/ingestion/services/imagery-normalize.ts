import path from 'path';

export type ImageryKind = 'chapter' | 'character' | 'location';

export interface NormalizedImage {
  filePath: string;
  fileName: string;
  provider: string;
  model?: string;
  prompt?: string;
  negativePrompt?: string;
  customId?: string;
  imageType?: string;
  tags?: string[];
  sceneSlug?: string;
  caption?: string;
  alt?: string;
  quality?: string;
  size?: string;
  aspectRatio?: string;
  generatedAt?: string;
  roleHint?: string;
  sortOrder: number;
  group?: string;
  isPrimary?: boolean;
}

interface GenerationDefaults {
  provider?: string;
  model?: string;
  quality?: string;
  aspect_ratio?: string;
  size?: string;
}

function fallbackFileName(filePath: string, customId: string | undefined, index: number): string {
  if (filePath) return path.basename(filePath);
  if (customId) return `${customId}.png`;
  return `image-${index + 1}.png`;
}

function normalizeInventoryEntry(
	item: any,
	sort: number,
	group: string,
	defaults?: GenerationDefaults,
	isPrimary?: boolean
): NormalizedImage | null {
	if (!item) return null;
	if (item.status && item.status !== 'approved') return null;
	if (item.type && !['generated', 'imported', 'edited', 'placeholder'].includes(item.type)) return null;

	const filePath = item.path ?? '';
	if (!filePath) return null;

	const fileName = fallbackFileName(filePath, item.id, sort);
	const tags = Array.isArray(item.content?.tags) ? item.content.tags : undefined;
	const provider = item.generation?.provider ?? item.provenance?.source ?? defaults?.provider ?? 'imported';
	const model = item.generation?.model ?? defaults?.model ?? 'unknown';
	const quality = item.generation?.constraints?.quality ?? defaults?.quality;
	const size = item.generation?.constraints?.size ?? defaults?.size;
	const aspectRatio = item.generation?.constraints?.aspect_ratio ?? defaults?.aspect_ratio;

	return {
		filePath,
		fileName,
		provider,
		model,
		prompt: item.generation?.prompt_used,
		negativePrompt: item.generation?.negative_prompt_used,
		customId: item.id,
		imageType: item.image_type ?? item.type,
		tags,
		caption: item.content?.description,
		alt: item.content?.alt_text ?? item.content?.title ?? item.id ?? fileName,
		quality,
		size,
		aspectRatio,
		generatedAt: item.provenance?.created_at ?? item.generation?.provider_metadata?.createdAt,
		roleHint: item.image_type ?? item.role,
		sortOrder: sort,
		group,
		isPrimary
	};
}

export function normalizeChapterImagery(data: any): NormalizedImage[] {
  const defaults: GenerationDefaults = data?.metadata?.generation_defaults ?? {};
  const images = Array.isArray(data?.images) ? data.images : [];
  const normalized: NormalizedImage[] = [];
  let sort = 0;

  for (const img of images) {
    const inventory = Array.isArray(img?.image_inventory) ? img.image_inventory : [];
    const groupLabel = img?.custom_id || img?.source_moment || 'chapter-image';

    for (const item of inventory) {
      const entry = normalizeInventoryEntry(item, sort, `image:${groupLabel}`, defaults);
      if (!entry) continue;
      entry.sceneSlug = img?.scene_id;
      if (!entry.imageType && img?.image_type) {
        entry.imageType = img.image_type;
      }
      if (!entry.roleHint && img?.image_type) {
        entry.roleHint = img.image_type;
      }
      normalized.push(entry);
      sort += 1;
    }
  }

  return normalized;
}

export function normalizeCharacterImagery(data: any): NormalizedImage[] {
  const inventory = Array.isArray(data?.image_inventory) ? data.image_inventory : [];
  let sort = 0;

  return inventory
    .filter(
      (item: any) =>
        item?.status === 'approved' &&
        (!item.type || ['generated', 'imported', 'edited'].includes(item.type))
    )
    .map((item: any): NormalizedImage => {
      const filePath = item.path ?? '';
      const fileName = fallbackFileName(filePath, item.id, sort);
      const tags = Array.isArray(item.content?.tags) ? item.content.tags : undefined;
      const isPortrait =
        tags?.some((tag: string) => ['primary-portrait', 'portrait'].includes(tag.toLowerCase())) ||
        fileName.toLowerCase().includes('portrait');

      const normalized: NormalizedImage = {
        filePath,
        fileName,
        provider: item.provenance?.source ?? 'imported',
        model: 'unknown',
        prompt: undefined,
        customId: item.id,
        imageType: item.type,
        tags,
        caption: item.content?.description,
        alt: item.content?.alt_text ?? item.content?.title ?? item.id ?? fileName,
        roleHint: isPortrait ? 'primary-portrait' : undefined,
        sortOrder: sort,
        group: 'character',
        isPrimary: isPortrait,
      };

      sort += 1;
      return normalized;
    });
}

export function normalizeLocationImagery(data: any): NormalizedImage[] {
  const images: NormalizedImage[] = [];
  let sort = 0;
  const inventory = Array.isArray(data?.image_inventory) ? data.image_inventory : [];
  const referenceDefaults = data?.reference_defaults || {};

  if (inventory.length) {
    const overviewId = referenceDefaults.overview;
    inventory
      .filter((item: any) => item?.status === 'approved')
      .forEach((item: any, index: number) => {
        const filePath = item.path ?? '';
        if (!filePath) return;
        const fileName = fallbackFileName(filePath, item.id, sort + index);
        const tags = Array.isArray(item.content?.tags) ? item.content.tags : undefined;
        const isOverview =
          overviewId === item.id || tags?.some((tag: string) => tag.toLowerCase() === 'overview');
        images.push({
          filePath,
          fileName,
          provider: item.provenance?.source ?? 'imported',
          model: 'unknown',
          prompt: undefined,
          customId: item.id,
          tags,
          imageType: isOverview ? 'overview-reference' : 'reference',
          caption: item.content?.description,
          alt: item.content?.alt_text ?? item.content?.title ?? item.id ?? fileName,
          quality: undefined,
          size: undefined,
          aspectRatio: undefined,
          generatedAt: item.provenance?.created_at,
          roleHint: isOverview ? 'overview' : undefined,
          sortOrder: sort + index,
          group: isOverview ? 'overview-reference' : 'reference',
          isPrimary: isOverview,
        });
      });
    sort += inventory.length;
  }

  const overviewImages = Array.isArray(data?.overview?.generated_images)
    ? data.overview.generated_images
    : [];
  if (overviewImages.length) {
    overviewImages
      .filter((img: any) => !img?.archived)
      .forEach((img: any, index: number) => {
        const filePath = img.file_path ?? '';
        if (!filePath) return;
        const fileName = img.file_name ?? fallbackFileName(filePath, img.custom_id, sort + index);
        images.push({
          filePath,
          fileName,
          provider: img.provider ?? 'unknown',
          model: img.model ?? 'unknown',
          prompt: img.prompt_used,
          customId: img.custom_id,
          tags: Array.isArray(img.tags) ? img.tags : undefined,
          imageType: img.image_type,
          caption: img.caption ?? img.title,
          alt: img.alt_text ?? img.custom_id ?? fileName,
          quality: img.quality,
          size: img.size,
          aspectRatio: img.aspect_ratio,
          generatedAt: img.generated_at,
          roleHint: img.role,
          sortOrder: sort + index,
          group: 'overview',
          isPrimary: index === 0,
        });
      });
    sort += overviewImages.length;
  }

	const overviewInventory = Array.isArray(data?.overview?.image_inventory) ? data.overview.image_inventory : [];
	if (overviewInventory.length) {
		overviewInventory.forEach((item: any, index: number) => {
			const normalized = normalizeInventoryEntry(item, sort + index, 'overview', data?.metadata?.generation_defaults);
			if (normalized) {
				if (normalized.roleHint == null && normalized.tags?.some((tag) => tag.toLowerCase() === 'overview')) {
					normalized.roleHint = 'overview';
				}
				normalized.isPrimary = index === 0;
				images.push(normalized);
			}
		});
		sort += overviewInventory.length;
	}

	const zones = Array.isArray(data?.zones) ? data.zones : [];
	for (const part of zones) {
		const partImages = Array.isArray(part?.generated_images) ? part.generated_images : [];
		partImages
			.filter((img: any) => !img?.archived)
			.forEach((img: any, index: number) => {
				const filePath = img.file_path ?? '';
				if (!filePath) return;
				const fileName = img.file_name ?? fallbackFileName(filePath, img.custom_id, sort + index);
				images.push({
					filePath,
					fileName,
					provider: img.provider ?? 'unknown',
					model: img.model ?? 'unknown',
					prompt: img.prompt_used,
					customId: img.custom_id,
					tags: Array.isArray(img.tags) ? img.tags : undefined,
					imageType: img.image_type,
					caption: img.caption ?? img.title,
					alt: img.alt_text ?? img.custom_id ?? fileName,
					quality: img.quality,
					size: img.size,
					aspectRatio: img.aspect_ratio,
					generatedAt: img.generated_at,
					roleHint: img.role,
					sortOrder: sort + index,
					group: `part:${part.slug ?? part.name ?? 'unnamed'}`,
					isPrimary: index === 0
				});
			});
		sort += partImages.length;

		const partInventory = Array.isArray(part?.image_inventory) ? part.image_inventory : [];
		if (partInventory.length) {
			partInventory.forEach((item: any, index: number) => {
				const normalized = normalizeInventoryEntry(
					item,
					sort + index,
					`part:${part.slug ?? part.name ?? 'unnamed'}`,
					data?.metadata?.generation_defaults
				);
				if (normalized) {
					images.push(normalized);
				}
			});
			sort += partInventory.length;
		}

		const zoneImages = Array.isArray(part?.images) ? part.images : [];
		for (const img of zoneImages) {
			const imgInventory = Array.isArray(img?.image_inventory) ? img.image_inventory : [];
			if (!imgInventory.length) continue;

			const zoneSlug = part?.slug ?? part?.zone_slug ?? part?.name ?? 'zone';
			const imageSlug = img?.image_slug ?? 'image';
			const group = `zone:${zoneSlug}/${imageSlug}`;

			imgInventory.forEach((item: any, index: number) => {
				const normalized = normalizeInventoryEntry(
					item,
					sort + index,
					group,
					data?.metadata?.generation_defaults
				);
				if (normalized) {
					if (!normalized.imageType && img?.image_type) {
						normalized.imageType = img.image_type;
					}
					if (!normalized.roleHint && img?.image_type) {
						normalized.roleHint = img.image_type;
					}
					images.push(normalized);
				}
			});
			sort += imgInventory.length;
		}
	}

  return images;
}

export function normalizeImagery(kind: ImageryKind, data: any): NormalizedImage[] {
  switch (kind) {
    case 'chapter':
      return normalizeChapterImagery(data);
    case 'character':
      return normalizeCharacterImagery(data);
    case 'location':
      return normalizeLocationImagery(data);
    default:
      return [];
  }
}
