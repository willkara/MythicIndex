<script lang="ts">
	import { page } from '$app/stores';

	const navItems = [
		{ path: '/admin/templates', label: 'Templates', icon: '📝' },
		{ path: '/admin/templates/components', label: 'Components', icon: '🧩' },
		{ path: '/admin/templates/styles', label: 'Styles', icon: '🎨' },
		{ path: '/admin/templates/negatives', label: 'Negative Prompts', icon: '🚫' },
	];
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="bg-white border-b border-gray-200">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between h-16">
				<div class="flex items-center">
					<h1 class="text-xl font-semibold text-gray-900">Template Management</h1>
				</div>
				<nav class="flex space-x-4">
					{#each navItems as item}
						<a
							href={item.path}
							class="px-3 py-2 rounded-md text-sm font-medium transition-colors
								{$page.url.pathname === item.path
								? 'bg-gray-900 text-white'
								: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}"
						>
							<span class="mr-2">{item.icon}</span>
							{item.label}
						</a>
					{/each}
				</nav>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<slot />
	</main>
</div>
