import fs from 'fs';
import path from 'path';

const mockupsDir = './page-mockups';

// Base HTML template with Tailwind CDN
const baseTemplate = (title, content) => `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        border: 'hsl(240 3.7% 15.9%)',
                        background: 'hsl(240 10% 3.9%)',
                        foreground: 'hsl(0 0% 98%)',
                        primary: {
                            DEFAULT: 'hsl(263 70% 50%)',
                            foreground: 'hsl(0 0% 100%)'
                        },
                        secondary: {
                            DEFAULT: 'hsl(240 3.7% 15.9%)',
                            foreground: 'hsl(0 0% 98%)'
                        },
                        muted: {
                            DEFAULT: 'hsl(240 3.7% 15.9%)',
                            foreground: 'hsl(240 5% 64.9%)'
                        },
                        accent: {
                            DEFAULT: 'hsl(240 3.7% 15.9%)',
                            foreground: 'hsl(0 0% 98%)'
                        },
                        card: {
                            DEFAULT: 'hsl(240 10% 3.9%)',
                            foreground: 'hsl(0 0% 98%)'
                        }
                    }
                }
            }
        }
    </script>
</head>
<body class="bg-background text-foreground antialiased">
${content}
</body>
</html>`;

// Mockup definitions
const mockups = {
    'canon-browser.html': baseTemplate('Canon Browser | Mythic Index', `
        <div class="container mx-auto py-8 px-4">
            <!-- Header -->
            <div class="mb-8">
                <h1 class="text-4xl font-bold tracking-tight mb-2">Canon Browser</h1>
                <p class="text-muted-foreground text-lg mb-4">
                    Explore your world's lore, characters, and storylines
                </p>
                <p class="text-sm text-muted-foreground">
                    67 items in your canon
                </p>

                <!-- Search and Filter Row -->
                <div class="mt-6 flex flex-col sm:flex-row gap-4">
                    <div class="relative flex-1 max-w-md">
                        <input
                            type="text"
                            placeholder="Search canon..."
                            class="w-full pl-10 pr-10 py-2.5 text-sm bg-muted/50 border border-transparent rounded-full focus:border-primary focus:bg-background focus:outline-none transition-all"
                        />
                    </div>
                    <div class="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
                        <button class="p-2 rounded-md bg-background shadow-sm">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                            </svg>
                        </button>
                        <button class="p-2 rounded-md text-muted-foreground">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Reading Progress -->
            <div class="bg-gradient-to-br from-primary/5 via-primary/10 to-transparent rounded-xl border border-border p-6 mb-8">
                <div class="flex items-center gap-3 mb-4">
                    <div class="p-2 rounded-lg bg-primary/20">
                        <svg class="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <h2 class="text-lg font-semibold">Reading Progress</h2>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div class="bg-background/50 rounded-lg p-4 text-center">
                        <div class="text-3xl font-bold text-primary">75%</div>
                        <div class="text-xs text-muted-foreground mt-1">Complete</div>
                    </div>
                    <div class="bg-background/50 rounded-lg p-4 text-center hover:bg-background/80 transition-colors">
                        <div class="text-2xl font-bold">9</div>
                        <div class="text-xs text-muted-foreground mt-1">Read</div>
                    </div>
                    <div class="bg-background/50 rounded-lg p-4 text-center hover:bg-background/80 transition-colors">
                        <div class="text-2xl font-bold">1</div>
                        <div class="text-xs text-muted-foreground mt-1">In Progress</div>
                    </div>
                    <div class="bg-background/50 rounded-lg p-4 text-center hover:bg-background/80 transition-colors">
                        <div class="text-2xl font-bold">2</div>
                        <div class="text-xs text-muted-foreground mt-1">Unread</div>
                    </div>
                </div>
                <div class="h-2 bg-muted rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-green-500 to-primary rounded-full" style="width: 75%"></div>
                </div>
            </div>

            <!-- Quick Nav Tabs -->
            <nav class="flex gap-2 mb-8 overflow-x-auto pb-2">
                <a href="#chapters" class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-secondary hover:bg-secondary/80">
                    Chapters
                    <span class="bg-background px-2 py-0.5 rounded-full text-xs">12</span>
                </a>
                <a href="#characters" class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-secondary hover:bg-secondary/80">
                    Characters
                    <span class="bg-background px-2 py-0.5 rounded-full text-xs">28</span>
                </a>
                <a href="#locations" class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-secondary hover:bg-secondary/80">
                    Locations
                    <span class="bg-background px-2 py-0.5 rounded-full text-xs">15</span>
                </a>
            </nav>

            <!-- Content Grid -->
            <section class="mb-12">
                <div class="flex items-center justify-between mb-6">
                    <div class="flex items-center gap-3">
                        <div class="p-2 rounded-lg bg-primary/10">
                            <svg class="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        </div>
                        <h2 class="text-2xl font-semibold">Chapters</h2>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div class="p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-lg transition-all group cursor-pointer">
                        <div class="aspect-video bg-muted rounded-lg mb-3 flex items-center justify-center">
                            <svg class="h-12 w-12 text-muted-foreground/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        </div>
                        <h3 class="font-semibold mb-2 group-hover:text-primary transition-colors">Chapter 1: The Awakening</h3>
                        <p class="text-sm text-muted-foreground mb-3">The journey begins in the ancient city of Eldoria...</p>
                        <div class="flex items-center justify-between text-xs text-muted-foreground">
                            <span>12.5k words</span>
                        </div>
                    </div>
                    <div class="p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-lg transition-all group cursor-pointer">
                        <div class="aspect-video bg-muted rounded-lg mb-3 flex items-center justify-center">
                            <svg class="h-12 w-12 text-muted-foreground/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        </div>
                        <h3 class="font-semibold mb-2 group-hover:text-primary transition-colors">Chapter 2: Shadows Rising</h3>
                        <p class="text-sm text-muted-foreground mb-3">Dark forces gather as our heroes venture forth...</p>
                        <div class="flex items-center justify-between text-xs text-muted-foreground">
                            <span>14.2k words</span>
                        </div>
                    </div>
                    <div class="p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-lg transition-all group cursor-pointer">
                        <div class="aspect-video bg-muted rounded-lg mb-3 flex items-center justify-center">
                            <svg class="h-12 w-12 text-muted-foreground/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        </div>
                        <h3 class="font-semibold mb-2 group-hover:text-primary transition-colors">Chapter 3: The Alliance</h3>
                        <p class="text-sm text-muted-foreground mb-3">Unexpected allies emerge in the face of danger...</p>
                        <div class="flex items-center justify-between text-xs text-muted-foreground">
                            <span>11.8k words</span>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    `),

    'search.html': baseTemplate('Semantic Search | Mythic Index', `
        <div class="container mx-auto py-8 px-4 max-w-4xl">
            <div class="text-center mb-8">
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    AI-Powered
                </div>
                <h1 class="text-4xl font-bold tracking-tight mb-3">Semantic Search</h1>
                <p class="text-muted-foreground text-lg max-w-2xl mx-auto">
                    Ask questions about your story or search for concepts, themes, and connections
                </p>
            </div>

            <form class="mb-8">
                <div class="flex gap-3 mb-3">
                    <div class="relative flex-1">
                        <input
                            type="text"
                            placeholder="Search for chapters, characters, or locations..."
                            class="w-full pl-10 pr-4 py-3 text-base bg-muted/50 border border-border rounded-lg focus:border-primary focus:outline-none"
                        />
                    </div>
                    <button class="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90">
                        Search
                    </button>
                </div>
                <div class="flex gap-2">
                    <button type="button" class="px-3 py-1 rounded-full text-sm bg-primary text-primary-foreground">All</button>
                    <button type="button" class="px-3 py-1 rounded-full text-sm bg-muted text-muted-foreground hover:bg-muted/80">Chapters</button>
                    <button type="button" class="px-3 py-1 rounded-full text-sm bg-muted text-muted-foreground hover:bg-muted/80">Characters</button>
                    <button type="button" class="px-3 py-1 rounded-full text-sm bg-muted text-muted-foreground hover:bg-muted/80">Locations</button>
                </div>
                <p class="text-sm text-muted-foreground mt-2">
                    Try: "dragon battle", "character development", or "mysterious locations"
                </p>
            </form>

            <div class="flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed border-border bg-muted/30">
                <svg class="h-12 w-12 text-muted-foreground/50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p class="text-lg font-medium mb-2">Start exploring your story</p>
                <p class="text-muted-foreground text-center max-w-md">
                    Enter a question or concept above to discover relevant passages, characters, and scenes.
                </p>
            </div>
        </div>
    `),

    'writer-dashboard.html': baseTemplate('Story Content Writer | Mythic Index', `
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <h1 class="text-4xl font-bold mb-2">Story Content Writer</h1>
            <p class="text-muted-foreground mb-8">
                Create and edit chapters, characters, locations, scenes, and zones
            </p>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div class="block p-6 border border-border rounded-lg hover:shadow-lg transition-shadow bg-card cursor-pointer">
                    <div class="flex items-start justify-between mb-4">
                        <h2 class="text-2xl font-semibold">Characters</h2>
                        <span class="text-3xl">👤</span>
                    </div>
                    <p class="text-muted-foreground mb-4">
                        Create detailed character profiles with appearance, personality, relationships, and more
                    </p>
                    <button class="w-full px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors">Create Character</button>
                </div>

                <div class="block p-6 border border-border rounded-lg hover:shadow-lg transition-shadow bg-card cursor-pointer">
                    <div class="flex items-start justify-between mb-4">
                        <h2 class="text-2xl font-semibold">Locations</h2>
                        <span class="text-3xl">🏛️</span>
                    </div>
                    <p class="text-muted-foreground mb-4">
                        Design locations with atmosphere, history, zones, and narrative significance
                    </p>
                    <button class="w-full px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors">Create Location</button>
                </div>

                <div class="block p-6 border border-border rounded-lg hover:shadow-lg transition-shadow bg-card cursor-pointer">
                    <div class="flex items-start justify-between mb-4">
                        <h2 class="text-2xl font-semibold">Chapters</h2>
                        <span class="text-3xl">📖</span>
                    </div>
                    <p class="text-muted-foreground mb-4">
                        Write chapters with structured sections, blocks, and scene organization
                    </p>
                    <button class="w-full px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors">Create Chapter</button>
                </div>

                <div class="block p-6 border border-border rounded-lg hover:shadow-lg transition-shadow bg-card cursor-pointer">
                    <div class="flex items-start justify-between mb-4">
                        <h2 class="text-2xl font-semibold">Scenes</h2>
                        <span class="text-3xl">🎬</span>
                    </div>
                    <p class="text-muted-foreground mb-4">
                        Manage scene metadata, character appearances, locations, and narrative tags
                    </p>
                    <button class="w-full px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors">Create Scene</button>
                </div>

                <div class="block p-6 border border-border rounded-lg hover:shadow-lg transition-shadow bg-card cursor-pointer">
                    <div class="flex items-start justify-between mb-4">
                        <h2 class="text-2xl font-semibold">Zones</h2>
                        <span class="text-3xl">📍</span>
                    </div>
                    <p class="text-muted-foreground mb-4">
                        Define zones within locations with physical descriptions and narrative functions
                    </p>
                    <button class="w-full px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors">Create Zone</button>
                </div>

                <div class="block p-6 border border-border rounded-lg hover:shadow-lg transition-shadow bg-card cursor-pointer">
                    <div class="flex items-start justify-between mb-4">
                        <h2 class="text-2xl font-semibold">Browse Content</h2>
                        <span class="text-3xl">📚</span>
                    </div>
                    <p class="text-muted-foreground mb-4">
                        View and edit existing chapters, characters, locations, and more
                    </p>
                    <button class="w-full px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors">Browse Canon</button>
                </div>
            </div>
        </div>
    `)
};

// Create directory if it doesn't exist
if (!fs.existsSync(mockupsDir)){
    fs.mkdirSync(mockupsDir);
}

// Write all mockup files
Object.entries(mockups).forEach(([filename, content]) => {
    const filepath = path.join(mockupsDir, filename);
    fs.writeFileSync(filepath, content);
    console.log(`Created: ${filepath}`);
});

console.log(`\n✓ Generated ${Object.keys(mockups).length} mockup HTML files in ${mockupsDir}/`);
