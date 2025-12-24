<script lang="ts">
  import { X, List } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils/cn';

  export interface SectionItem {
    id: string;
    text: string;
    level: number;
  }

  interface Props {
    /** Section items extracted from headings */
    sections: SectionItem[];
    /** Currently active section id */
    activeId?: string | null;
  }

  let { sections, activeId = null }: Props = $props();

  let drawerOpen = $state(false);

  function handleSectionClick(id: string) {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Close drawer on mobile after navigation
    if (window.innerWidth < 1024) {
      drawerOpen = false;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      drawerOpen = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      drawerOpen = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if sections.length > 0}
  <!-- Desktop: Fixed sidebar pills -->
  <nav
    class="hidden lg:block fixed left-4 top-1/3 z-30 max-w-[200px]"
    aria-label="Section navigation"
  >
    <div class="space-y-1">
      {#each sections as section}
        <button
          onclick={() => handleSectionClick(section.id)}
          class={cn(
            'block w-full text-left px-3 py-1.5 text-xs rounded-full transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            'hover:bg-accent hover:text-accent-foreground',
            'truncate',
            activeId === section.id
              ? 'bg-primary text-primary-foreground font-medium'
              : 'bg-muted/50 text-muted-foreground',
            section.level > 2 && 'ml-2 text-[11px]'
          )}
          aria-current={activeId === section.id ? 'location' : undefined}
        >
          {section.text}
        </button>
      {/each}
    </div>
  </nav>

  <!-- Mobile: Floating button + drawer -->
  <Button
    onclick={() => (drawerOpen = !drawerOpen)}
    variant="secondary"
    size="sm"
    class="lg:hidden fixed bottom-6 left-6 rounded-full shadow-lg z-30"
    aria-label="Toggle section navigation"
    aria-expanded={drawerOpen}
  >
    <List class="h-4 w-4" aria-hidden="true" />
    <span class="ml-2">Sections</span>
  </Button>

  <!-- Mobile drawer -->
  {#if drawerOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="lg:hidden fixed inset-0 z-40 bg-black/50"
      onclick={handleBackdropClick}
      aria-hidden="true"
    ></div>

    <nav
      class="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-background border-t rounded-t-2xl shadow-lg max-h-[60vh]"
      aria-label="Section navigation"
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b">
        <h2 class="font-semibold text-sm">Sections</h2>
        <button
          onclick={() => (drawerOpen = false)}
          class="p-1.5 rounded-md hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Close section navigation"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Section list -->
      <div class="overflow-y-auto max-h-[calc(60vh-56px)] p-3">
        <ul class="space-y-1">
          {#each sections as section}
            <li>
              <button
                onclick={() => handleSectionClick(section.id)}
                class={cn(
                  'w-full text-left px-4 py-2.5 text-sm rounded-lg transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  'hover:bg-accent hover:text-accent-foreground',
                  activeId === section.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground',
                  section.level > 2 && 'pl-8'
                )}
                aria-current={activeId === section.id ? 'location' : undefined}
              >
                {section.text}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    </nav>
  {/if}
{/if}
