<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui';
	import { FormSection, TagInput } from '../inputs';
	import type { ZoneCreate } from '$lib/server/writer/validation';

	/**
	 * Zone editor form for creating zones within locations
	 */
	export let zone: Partial<ZoneCreate> = {};
	export let mode: 'create' | 'edit' = 'create';
	export let action: string = '?/create';
	export let onCancel: () => void = () => {};

	// Form state
	let formData = $state({
		// Required fields
		locationId: zone.locationId || '',
		name: zone.name || '',

		// Basic Info
		zoneType: zone.zoneType || '',
		locationWithin: zone.locationWithin || '',
		parentZoneId: zone.parentZoneId || '',
		firstAppearance: zone.firstAppearance || '',
		storySignificance: zone.storySignificance || '',

		// Descriptions
		physicalDescription: zone.physicalDescription || '',
		narrativeFunction: zone.narrativeFunction || '',
		emotionalRegister: zone.emotionalRegister || '',

		// Details (arrays)
		signatureDetails: zone.signatureDetails || [],
		moodAffinity: zone.moodAffinity || [],
		characterAssociations: zone.characterAssociations || []
	});
</script>

<form method="POST" {action} use:enhance class="space-y-6">
	<!-- Hidden fields for array data (serialized as JSON) -->
	<input
		type="hidden"
		name="signatureDetails"
		value={JSON.stringify(formData.signatureDetails)}
	/>
	<input type="hidden" name="moodAffinity" value={JSON.stringify(formData.moodAffinity)} />
	<input
		type="hidden"
		name="characterAssociations"
		value={JSON.stringify(formData.characterAssociations)}
	/>

	<!-- Basic Info Section -->
	<FormSection title="Basic Information" icon="📍" defaultOpen={true}>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div class="md:col-span-2">
				<label class="block text-sm font-medium mb-2">
					Parent Location ID <span class="text-red-500">*</span>
				</label>
				<input
					type="text"
					name="locationId"
					bind:value={formData.locationId}
					required
					placeholder="Location ID (from location table)"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
				<p class="text-xs text-gray-500 mt-1">The location that contains this zone</p>
			</div>

			<div class="md:col-span-2">
				<label class="block text-sm font-medium mb-2">
					Zone Name <span class="text-red-500">*</span>
				</label>
				<input
					type="text"
					name="name"
					bind:value={formData.name}
					required
					placeholder="e.g., The Forge, Main Hall, Training Grounds"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Zone Type</label>
				<select
					name="zoneType"
					bind:value={formData.zoneType}
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				>
					<option value="">Select type...</option>
					<option value="perimeter">Perimeter</option>
					<option value="threshold">Threshold</option>
					<option value="heart">Heart</option>
					<option value="forge">Forge</option>
					<option value="liminal">Liminal</option>
					<option value="sanctuary">Sanctuary</option>
				</select>
				<p class="text-xs text-gray-500 mt-1">Narrative function type of the zone</p>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Location Within</label>
				<input
					type="text"
					name="locationWithin"
					bind:value={formData.locationWithin}
					placeholder="e.g., Eastern wing, Underground level"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Parent Zone ID</label>
				<input
					type="text"
					name="parentZoneId"
					bind:value={formData.parentZoneId}
					placeholder="Parent zone ID (for nested zones)"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
				<p class="text-xs text-gray-500 mt-1">For hierarchical zones within zones</p>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Story Significance</label>
				<select
					name="storySignificance"
					bind:value={formData.storySignificance}
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				>
					<option value="">Select significance...</option>
					<option value="high">High</option>
					<option value="medium">Medium</option>
					<option value="low">Low</option>
				</select>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">First Appearance</label>
				<input
					type="text"
					name="firstAppearance"
					bind:value={formData.firstAppearance}
					placeholder="Chapter slug"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Emotional Register</label>
				<input
					type="text"
					name="emotionalRegister"
					bind:value={formData.emotionalRegister}
					placeholder="e.g., Tense, Peaceful, Foreboding"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>
		</div>
	</FormSection>

	<!-- Descriptions Section -->
	<FormSection title="Descriptions & Narrative" icon="📝" defaultOpen={true}>
		<div class="space-y-4">
			<div>
				<label class="block text-sm font-medium mb-2">Physical Description</label>
				<textarea
					name="physicalDescription"
					bind:value={formData.physicalDescription}
					rows="3"
					placeholder="Detailed physical appearance and layout of the zone"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				></textarea>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Narrative Function</label>
				<textarea
					name="narrativeFunction"
					bind:value={formData.narrativeFunction}
					rows="3"
					placeholder="Role of this zone in the story and plot"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				></textarea>
			</div>
		</div>
	</FormSection>

	<!-- Details Section -->
	<FormSection title="Details & Associations" icon="🗺️" defaultOpen={false}>
		<div class="space-y-4">
			<div>
				<TagInput
					label="Signature Details"
					placeholder="Add detail..."
					bind:tags={formData.signatureDetails}
				/>
				<p class="text-xs text-gray-500 mt-1">
					Distinctive features that make this zone memorable
				</p>
			</div>

			<div>
				<TagInput
					label="Mood Affinity"
					placeholder="Add mood..."
					bind:tags={formData.moodAffinity}
				/>
				<p class="text-xs text-gray-500 mt-1">Moods or emotions associated with this zone</p>
			</div>

			<div>
				<TagInput
					label="Character Associations"
					placeholder="Add character slug..."
					bind:tags={formData.characterAssociations}
				/>
				<p class="text-xs text-gray-500 mt-1">Characters frequently found in this zone</p>
			</div>
		</div>
	</FormSection>

	<!-- Form Actions -->
	<div class="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
		<Button type="submit">
			{mode === 'create' ? 'Create Zone' : 'Update Zone'}
		</Button>
		<Button type="button" variant="outline" onclick={onCancel}>Cancel</Button>
	</div>
</form>
