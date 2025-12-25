<script lang="ts">
	import { Button } from '$lib/components/ui';
	import { FormSection, TagInput, EntityAutocomplete } from '../inputs';
	import type { CharacterCreate } from '$lib/server/writer/validation';

	/**
	 * Comprehensive character editor form with all schema fields
	 */
	export let character: Partial<CharacterCreate> = {};
	export let mode: 'create' | 'edit' = 'create';
	export let onSubmit: (data: Partial<CharacterCreate>) => void = () => {};
	export let onCancel: () => void = () => {};

	// Form state
	let formData = $state({
		// Basic Info
		name: character.name || '',
		aliases: character.aliases || [],
		race: character.race || '',
		characterClass: character.characterClass || '',
		role: character.role || '',
		status: character.status || 'alive',
		firstAppearance: character.firstAppearance || '',
		faction: character.faction || '',
		occupation: character.occupation || '',

		// Appearance
		appearanceAge: character.appearanceAge || '',
		appearanceHeight: character.appearanceHeight || '',
		appearanceBuild: character.appearanceBuild || '',
		appearanceHair: character.appearanceHair || '',
		appearanceEyes: character.appearanceEyes || '',
		appearanceDistinguishingFeatures: character.appearanceDistinguishingFeatures || [],
		appearanceClothing: character.appearanceClothing || '',
		visualSummary: character.visualSummary || '',

		// Personality
		personalityArchetype: character.personalityArchetype || '',
		personalityTemperament: character.personalityTemperament || '',
		personalityPositiveTraits: character.personalityPositiveTraits || [],
		personalityNegativeTraits: character.personalityNegativeTraits || [],
		personalityMoralAlignment: character.personalityMoralAlignment || '',

		// Background & Psychology
		background: character.background || '',
		motivations: character.motivations || [],
		fears: character.fears || [],
		secrets: character.secrets || [],

		// Combat
		primaryWeapons: character.primaryWeapons || '',
		fightingStyle: character.fightingStyle || '',
		tacticalRole: character.tacticalRole || '',

		// Voice
		speechStyle: character.speechStyle || '',
		signaturePhrases: character.signaturePhrases || [],

		// Notes
		notes: character.notes || ''
	});

	function handleSubmit(event: Event) {
		event.preventDefault();
		onSubmit(formData);
	}
</script>

<form {onsubmit}={handleSubmit} class="space-y-6">
	<!-- Basic Info Section -->
	<FormSection title="Basic Information" icon="ℹ️" defaultOpen={true}>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div class="md:col-span-2">
				<label class="block text-sm font-medium mb-2">
					Name <span class="text-red-500">*</span>
				</label>
				<input
					type="text"
					bind:value={formData.name}
					required
					placeholder="Character name"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div class="md:col-span-2">
				<TagInput label="Aliases" placeholder="Add alias..." bind:tags={formData.aliases} />
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Race</label>
				<input
					type="text"
					bind:value={formData.race}
					placeholder="e.g., Human, Elf, Dwarf"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Class</label>
				<input
					type="text"
					bind:value={formData.characterClass}
					placeholder="e.g., Warrior, Mage, Rogue"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Role</label>
				<select
					bind:value={formData.role}
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				>
					<option value="">Select role...</option>
					<option value="protagonist">Protagonist</option>
					<option value="antagonist">Antagonist</option>
					<option value="supporting">Supporting</option>
					<option value="minor">Minor</option>
				</select>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Status</label>
				<select
					bind:value={formData.status}
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				>
					<option value="alive">Alive</option>
					<option value="dead">Dead</option>
					<option value="unknown">Unknown</option>
				</select>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">First Appearance</label>
				<input
					type="text"
					bind:value={formData.firstAppearance}
					placeholder="Chapter slug"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Faction</label>
				<input
					type="text"
					bind:value={formData.faction}
					placeholder="e.g., The Order, Rebellion"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Occupation</label>
				<input
					type="text"
					bind:value={formData.occupation}
					placeholder="e.g., Blacksmith, Scholar"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>
		</div>
	</FormSection>

	<!-- Appearance Section -->
	<FormSection title="Physical Appearance" icon="👁️" defaultOpen={true}>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<div>
				<label class="block text-sm font-medium mb-2">Age</label>
				<input
					type="text"
					bind:value={formData.appearanceAge}
					placeholder="e.g., Early 30s, Ancient"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Height</label>
				<input
					type="text"
					bind:value={formData.appearanceHeight}
					placeholder="e.g., Tall, 6'2\""
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Build</label>
				<input
					type="text"
					bind:value={formData.appearanceBuild}
					placeholder="e.g., Muscular, Slender"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Hair</label>
				<input
					type="text"
					bind:value={formData.appearanceHair}
					placeholder="e.g., Long black hair"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Eyes</label>
				<input
					type="text"
					bind:value={formData.appearanceEyes}
					placeholder="e.g., Piercing blue"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div class="md:col-span-3">
				<label class="block text-sm font-medium mb-2">Clothing</label>
				<input
					type="text"
					bind:value={formData.appearanceClothing}
					placeholder="Typical attire"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div class="md:col-span-3">
				<TagInput
					label="Distinguishing Features"
					placeholder="Add feature..."
					bind:tags={formData.appearanceDistinguishingFeatures}
				/>
			</div>

			<div class="md:col-span-3">
				<label class="block text-sm font-medium mb-2">Visual Summary</label>
				<textarea
					bind:value={formData.visualSummary}
					rows="3"
					placeholder="Overall visual description for image generation"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				></textarea>
			</div>
		</div>
	</FormSection>

	<!-- Personality Section -->
	<FormSection title="Personality" icon="🧠" defaultOpen={true}>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div>
				<label class="block text-sm font-medium mb-2">Archetype</label>
				<input
					type="text"
					bind:value={formData.personalityArchetype}
					placeholder="e.g., The Hero, The Mentor"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Temperament</label>
				<input
					type="text"
					bind:value={formData.personalityTemperament}
					placeholder="e.g., Hot-headed, Calm"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Moral Alignment</label>
				<input
					type="text"
					bind:value={formData.personalityMoralAlignment}
					placeholder="e.g., Lawful Good, Chaotic Neutral"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div class="md:col-span-2">
				<TagInput
					label="Positive Traits"
					placeholder="Add trait..."
					bind:tags={formData.personalityPositiveTraits}
				/>
			</div>

			<div class="md:col-span-2">
				<TagInput
					label="Negative Traits"
					placeholder="Add trait..."
					bind:tags={formData.personalityNegativeTraits}
				/>
			</div>
		</div>
	</FormSection>

	<!-- Background & Psychology Section -->
	<FormSection title="Background & Psychology" icon="📜" defaultOpen={false}>
		<div class="space-y-4">
			<div>
				<label class="block text-sm font-medium mb-2">Background</label>
				<textarea
					bind:value={formData.background}
					rows="4"
					placeholder="Character's history, upbringing, and formative experiences"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				></textarea>
			</div>

			<div>
				<TagInput
					label="Motivations"
					placeholder="Add motivation..."
					bind:tags={formData.motivations}
				/>
			</div>

			<div>
				<TagInput label="Fears" placeholder="Add fear..." bind:tags={formData.fears} />
			</div>

			<div>
				<TagInput label="Secrets" placeholder="Add secret..." bind:tags={formData.secrets} />
			</div>
		</div>
	</FormSection>

	<!-- Combat Section -->
	<FormSection title="Combat & Abilities" icon="⚔️" defaultOpen={false}>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div>
				<label class="block text-sm font-medium mb-2">Primary Weapons</label>
				<input
					type="text"
					bind:value={formData.primaryWeapons}
					placeholder="e.g., Longsword, Bow"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Fighting Style</label>
				<input
					type="text"
					bind:value={formData.fightingStyle}
					placeholder="e.g., Aggressive, Defensive"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div class="md:col-span-2">
				<label class="block text-sm font-medium mb-2">Tactical Role</label>
				<input
					type="text"
					bind:value={formData.tacticalRole}
					placeholder="e.g., Front-line fighter, Ranged support"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>
		</div>
	</FormSection>

	<!-- Voice & Speech Section -->
	<FormSection title="Voice & Speech" icon="💬" defaultOpen={false}>
		<div class="space-y-4">
			<div>
				<label class="block text-sm font-medium mb-2">Speech Style</label>
				<input
					type="text"
					bind:value={formData.speechStyle}
					placeholder="e.g., Eloquent, Gruff, Playful"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div>
				<TagInput
					label="Signature Phrases"
					placeholder="Add phrase..."
					bind:tags={formData.signaturePhrases}
				/>
			</div>
		</div>
	</FormSection>

	<!-- Notes Section -->
	<FormSection title="Additional Notes" icon="📝" defaultOpen={false}>
		<div>
			<label class="block text-sm font-medium mb-2">Notes</label>
			<textarea
				bind:value={formData.notes}
				rows="4"
				placeholder="Any additional notes, ideas, or reminders"
				class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
			></textarea>
		</div>
	</FormSection>

	<!-- Form Actions -->
	<div class="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
		<Button type="submit">
			{mode === 'create' ? 'Create Character' : 'Update Character'}
		</Button>
		<Button type="button" variant="outline" onclick={onCancel}>Cancel</Button>
	</div>
</form>
