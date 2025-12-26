/**
 * Cloudflare Images Service - Upload and manage images
 *
 * Handles uploading generated images to Cloudflare Images CDN
 * and creating database records for tracking.
 */

import { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { v4 as uuidv4 } from 'uuid';

/**
 * Upload result from Cloudflare Images
 */
export interface CloudflareImageUploadResult {
	success: boolean;
	cloudflareId?: string;
	uploadUrl?: string;
	error?: string;
}

/**
 * Cloudflare Images service
 */
export class CloudflareImagesService {
	private accountId: string;
	private apiToken: string;
	private accountHash: string;
	private db: DrizzleD1Database<typeof schema>;

	constructor(
		accountId: string,
		apiToken: string,
		accountHash: string,
		db: DrizzleD1Database<typeof schema>
	) {
		this.accountId = accountId;
		this.apiToken = apiToken;
		this.accountHash = accountHash;
		this.db = db;
	}

	/**
	 * Upload an image to Cloudflare Images
	 */
	async uploadImage(
		imageData: Uint8Array,
		metadata: {
			entityType: 'character' | 'location' | 'chapter';
			entitySlug: string;
			targetId: string;
			role?: string;
		}
	): Promise<CloudflareImageUploadResult> {
		try {
			// Create form data
			const formData = new FormData();
			const blob = new Blob([imageData], { type: 'image/png' });
			formData.append('file', blob, `${metadata.targetId}.png`);

			// Add metadata
			formData.append(
				'metadata',
				JSON.stringify({
					entity_type: metadata.entityType,
					entity_slug: metadata.entitySlug,
					target_id: metadata.targetId,
					role: metadata.role,
				})
			);

			// Upload to Cloudflare Images
			const response = await fetch(
				`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/images/v1`,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${this.apiToken}`,
					},
					body: formData,
				}
			);

			if (!response.ok) {
				const error = await response.text();
				return {
					success: false,
					error: `Cloudflare Images upload failed: ${error}`,
				};
			}

			const result = await response.json();

			// @ts-expect-error - Dynamic response structure
			if (!result.success || !result.result?.id) {
				return {
					success: false,
					// @ts-expect-error - Dynamic response structure
					error: result.errors?.[0]?.message || 'Upload failed',
				};
			}

			// @ts-expect-error - Dynamic response structure
			const cloudflareId = result.result.id;
			const uploadUrl = this.getImageUrl(cloudflareId);

			return {
				success: true,
				cloudflareId,
				uploadUrl,
			};
		} catch (error) {
			return {
				success: false,
				error: `Upload exception: ${error}`,
			};
		}
	}

	/**
	 * Create image asset record in database
	 */
	async createImageAsset(
		cloudflareId: string,
		metadata: {
			entityType: 'character' | 'location' | 'chapter';
			entitySlug: string;
			targetId: string;
			generatedBy?: string;
			prompt?: string;
			generationRunId?: string;
		}
	): Promise<string> {
		const assetId = uuidv4();
		const now = Date.now();

		await this.db.insert(schema.imageAsset).values({
			id: assetId,
			cloudflareId,
			alt: `Generated image for ${metadata.targetId}`,
			caption: metadata.prompt ? `AI-generated: ${metadata.prompt.slice(0, 200)}...` : null,
			generatedBy: metadata.generatedBy || null,
			generatedAt: now,
			generationRunId: metadata.generationRunId || null,
			uploadedAt: now,
			createdAt: now,
			updatedAt: now,
		});

		return assetId;
	}

	/**
	 * Link image asset to entity
	 */
	async linkImageToEntity(
		imageId: string,
		entityType: 'character' | 'location' | 'chapter',
		entitySlug: string,
		role?: string
	): Promise<void> {
		const linkId = uuidv4();
		const now = Date.now();

		await this.db.insert(schema.imageLink).values({
			id: linkId,
			imageId,
			entityType,
			entitySlug,
			role: role || null,
			createdAt: now,
		});
	}

	/**
	 * Set image reference metadata (quality, aspects)
	 */
	async setReferenceMetadata(
		assetId: string,
		metadata: {
			isCanonical?: boolean;
			referenceQuality?: 'high' | 'medium' | 'low';
			faceReference?: boolean;
			bodyReference?: boolean;
			clothingReference?: boolean;
			environmentReference?: boolean;
		}
	): Promise<void> {
		const now = Date.now();

		await this.db.insert(schema.imageReferenceMetadata).values({
			assetId,
			isCanonical: metadata.isCanonical ? 1 : 0,
			referenceQuality: metadata.referenceQuality || null,
			faceReference: metadata.faceReference ? 1 : 0,
			bodyReference: metadata.bodyReference ? 1 : 0,
			clothingReference: metadata.clothingReference ? 1 : 0,
			environmentReference: metadata.environmentReference ? 1 : 0,
			createdAt: now,
			updatedAt: now,
		});
	}

	/**
	 * Get image URL for a Cloudflare Images ID
	 */
	getImageUrl(cloudflareId: string, variant: string = 'public'): string {
		return `https://imagedelivery.net/${this.accountHash}/${cloudflareId}/${variant}`;
	}

	/**
	 * Delete image from Cloudflare Images
	 */
	async deleteImage(cloudflareId: string): Promise<boolean> {
		try {
			const response = await fetch(
				`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/images/v1/${cloudflareId}`,
				{
					method: 'DELETE',
					headers: {
						Authorization: `Bearer ${this.apiToken}`,
					},
				}
			);

			return response.ok;
		} catch (error) {
			console.error('Failed to delete image:', error);
			return false;
		}
	}

	/**
	 * Complete workflow: Upload image, create asset record, link to entity
	 */
	async uploadAndLinkImage(
		imageData: Uint8Array,
		metadata: {
			entityType: 'character' | 'location' | 'chapter';
			entitySlug: string;
			targetId: string;
			role?: string;
			prompt?: string;
			generationRunId?: string;
			referenceMetadata?: {
				isCanonical?: boolean;
				referenceQuality?: 'high' | 'medium' | 'low';
				faceReference?: boolean;
				bodyReference?: boolean;
				clothingReference?: boolean;
				environmentReference?: boolean;
			};
		}
	): Promise<{
		success: boolean;
		assetId?: string;
		cloudflareId?: string;
		uploadUrl?: string;
		error?: string;
	}> {
		// Upload to Cloudflare Images
		const uploadResult = await this.uploadImage(imageData, metadata);
		if (!uploadResult.success || !uploadResult.cloudflareId) {
			return {
				success: false,
				error: uploadResult.error,
			};
		}

		// Create asset record
		const assetId = await this.createImageAsset(uploadResult.cloudflareId, {
			...metadata,
			generatedBy: 'ai',
		});

		// Link to entity
		await this.linkImageToEntity(
			assetId,
			metadata.entityType,
			metadata.entitySlug,
			metadata.role
		);

		// Set reference metadata if provided
		if (metadata.referenceMetadata) {
			await this.setReferenceMetadata(assetId, metadata.referenceMetadata);
		}

		return {
			success: true,
			assetId,
			cloudflareId: uploadResult.cloudflareId,
			uploadUrl: uploadResult.uploadUrl,
		};
	}
}
