<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui';
	import { FormSection, TagInput, EntityAutocomplete } from '../inputs';
	import type { LocationCreate } from '$lib/server/writer/validation';

	/**
	 * Comprehensive location editor form with all schema fields
	 */
	interface Props {
		location?: Partial<LocationCreate>;
		mode?: 'create' | 'edit';
		action?: string;
		onCancel?: () => void;
	}

	let {
		location = {},
		mode = 'create',
		action = '?/create',
		onCancel = () => {}
	}: Props = $props();

	// Form state
	let formData = $state({
		// Basic Info
		name: location.name || '',
		locationType: location.locationType || '',
		region: location.region || '',
		parentLocationId: location.parentLocationId || '',
		significanceLevel: location.significanceLevel || '',
		firstAppearance: location.firstAppearance || '',

		// Descriptions
		quickDescription: location.quickDescription || '',
		visualSummary: location.visualSummary || '',
		atmosphere: location.atmosphere || '',
		history: location.history || '',
		storyRole: location.storyRole || '',
		accessibility: location.accessibility || '',

		// Content (arrays)
		notableLandmarks: location.notableLandmarks || [],
		keyPersonnel: location.keyPersonnel || [],
		hazardsDangers: location.hazardsDangers || [],
		connections: location.connections || []
	});
</script>

<form method="POST" {action} use:enhance class="space-y-6">
	<!-- Hidden fields for array data (serialized as JSON) -->
	<input
		type="hidden"
		name="notableLandmarks"
		value={JSON.stringify(formData.notableLandmarks)}
	/>
	<input type="hidden" name="keyPersonnel" value={JSON.stringify(formData.keyPersonnel)} />
	<input
		type="hidden"
		name="hazardsDangers"
		value={JSON.stringify(formData.hazardsDangers)}
	/>
	<input type="hidden" name="connections" value={JSON.stringify(formData.connections)} />

	<!-- Basic Info Section -->
	<FormSection title="Basic Information" icon="🏛️" defaultOpen={true}>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div class="md:col-span-2">
				<label class="block text-sm font-medium mb-2">
					Name <span class="text-red-500">*</span>
				</label>
				<input
					type="text"
					name="name"
					bind:value={formData.name}
					required
					placeholder="Location name"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Type</label>
				<select
					name="locationType"
					bind:value={formData.locationType}
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				>
					<option value="">Select type...</option>
					<option value="city">City</option>
					<option value="town">Town</option>
					<option value="village">Village</option>
					<option value="building">Building</option>
					<option value="room">Room</option>
					<option value="region">Region</option>
					<option value="landmark">Landmark</option>
					<option value="natural">Natural</option>
				</select>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Region</label>
				<input
					type="text"
					name="region"
					bind:value={formData.region}
					placeholder="e.g., Northern Territories"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Parent Location</label>
				<input
					type="text"
					name="parentLocationId"
					bind:value={formData.parentLocationId}
					placeholder="Parent location ID (optional)"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
				<p class="text-xs text-gray-500 mt-1">
					For hierarchical locations (e.g., a room within a building)
				</p>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Significance Level</label>
				<select
					name="significanceLevel"
					bind:value={formData.significanceLevel}
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
		</div>
	</FormSection>

	<!-- Descriptions Section -->
	<FormSection title="Descriptions" icon="📝" defaultOpen={true}>
		<div class="space-y-4">
			<div>
				<label class="block text-sm font-medium mb-2">Quick Description</label>
				<textarea
					name="quickDescription"
					bind:value={formData.quickDescription}
					rows="2"
					placeholder="Brief one-sentence description"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				></textarea>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Visual Summary</label>
				<textarea
					name="visualSummary"
					bind:value={formData.visualSummary}
					rows="3"
					placeholder="Overall visual appearance and layout"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				></textarea>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Atmosphere</label>
				<textarea
					name="atmosphere"
					bind:value={formData.atmosphere}
					rows="3"
					placeholder="Mood, feeling, ambiance of the location"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				></textarea>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">History</label>
				<textarea
					name="history"
					bind:value={formData.history}
					rows="4"
					placeholder="Historical background and significance"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				></textarea>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Story Role</label>
				<textarea
					name="storyRole"
					bind:value={formData.storyRole}
					rows="3"
					placeholder="Plot relevance and symbolic meaning"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				></textarea>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Accessibility</label>
				<textarea
					name="accessibility"
					bind:value={formData.accessibility}
					rows="2"
					placeholder="Access restrictions, hidden paths, entry requirements"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				></textarea>
			</div>
		</div>
	</FormSection>

	<!-- Content Section -->
	<FormSection title="Content & Details" icon="🗺️" defaultOpen={false}>
		<div class="space-y-4">
			<div>
				<TagInput
					label="Notable Landmarks"
					placeholder="Add landmark..."
					bind:tags={formData.notableLandmarks}
				/>
			</div>

			<div>
				<TagInput
					label="Key Personnel"
					placeholder="Add character slug..."
					bind:tags={formData.keyPersonnel}
				/>
				<p class="text-xs text-gray-500 mt-1">
					Character slugs of important people at this location
				</p>
			</div>

			<div>
				<TagInput
					label="Hazards & Dangers"
					placeholder="Add hazard..."
					bind:tags={formData.hazardsDangers}
				/>
			</div>

			<div>
				<TagInput
					label="Connections"
					placeholder="Add connected location..."
					bind:tags={formData.connections}
				/>
				<p class="text-xs text-gray-500 mt-1">
					Other locations connected to this one (neighboring areas, travel routes)
				</p>
			</div>
		</div>
	</FormSection>

	<!-- Form Actions -->
	<div class="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
		<Button type="submit">
			{mode === 'create' ? 'Create Location' : 'Update Location'}
		</Button>
		<Button type="button" variant="outline" onclick={onCancel}>Cancel</Button>
	</div>
</form>
