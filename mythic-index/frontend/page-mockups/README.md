# MythicIndex Page Mockups

This directory contains visual documentation of all the pages in the MythicIndex application.

## Overview

The application has **20 unique pages** organized into several sections:

### Public-Facing Pages (Reader Experience)

#### 1. **Home Page** (`/`)
- **Purpose**: Landing page and dashboard
- **Features**:
  - Welcome hero section
  - Quick action cards (Browse Canon, Search)
  - Statistics grid (chapters, characters, locations, lore, worldbuilding, word count)
  - Recent chapters list
  - Empty state when no content exists

#### 2. **Canon Browser** (`/canon`)
- **Purpose**: Main content browsing interface
- **Features**:
  - Search bar with filter options
  - Grid/List view toggle
  - Reading progress dashboard with stats (% complete, read, in-progress, unread)
  - Continue reading card with progress indicator
  - Latest updates carousel
  - Quick navigation tabs for each content type
  - Sortable sections (alphabetical / recent)
  - Content cards with thumbnails and summaries

#### 3. **Chapter Reader** (`/chapters/[slug]`)
- **Purpose**: Read individual chapters
- **Features**:
  - Chapter title and metadata
  - Structured content blocks (prose, dialogue, scene headers)
  - Reading progress tracking
  - Navigation to previous/next chapters
  - Responsive images

#### 4. **Character Profile** (`/characters/[slug]`)
- **Purpose**: View character details
- **Features**:
  - Character portrait/thumbnail
  - Full profile information
  - Relationships visualization
  - Appearance details
  - Character history

#### 5. **Location Overview** (`/locations/[slug]`)
- **Purpose**: Explore location details
- **Features**:
  - Location imagery
  - Atmospheric description
  - Zone breakdowns
  - Historical context
  - Related characters/scenes

#### 6. **Lore Entry** (`/lore/[slug]`)
- **Purpose**: Read lore entries
- **Features**:
  - Lore content display
  - Related entries
  - Tagging system

#### 7. **Worldbuilding Entry** (`/worldbuilding/[slug]`)
- **Purpose**: View worldbuilding content
- **Features**:
  - Worldbuilding documentation
  - Cross-references
  - Hierarchical structure

#### 8. **Search** (`/search`)
- **Purpose**: AI-powered semantic search
- **Features**:
  - Search input with AI badge
  - Content type filters (All, Chapters, Characters, Locations)
  - Results with similarity scores
  - Result previews with context
  - Empty state with search suggestions

### Writer Tools (Content Creation)

#### 9. **Writer Dashboard** (`/writer`)
- **Purpose**: Central hub for content creation
- **Features**:
  - Grid of creation options
  - Quick links to create Characters, Locations, Chapters, Scenes, Zones
  - Link to browse existing content

#### 10. **Create Chapter** (`/writer/chapters/new`)
- **Purpose**: Write new chapters
- **Features**:
  - Rich text editor (Tiptap)
  - Section/block structure
  - Scene management
  - Metadata fields
  - Save/publish workflow

#### 11. **Edit Chapter** (`/writer/chapters/[slug]`)
- **Purpose**: Edit existing chapters
- **Features**:
  - Same as create, but with loaded content
  - Publish status badges
  - Auto-republish on changes to published chapters

#### 12. **Create Character** (`/writer/characters/new`)
- **Purpose**: Create character profiles
- **Features**:
  - Form-based character creation
  - Appearance fields
  - Personality traits
  - Relationship management
  - Image upload

#### 13. **Edit Character** (`/writer/characters/[slug]`)
- **Purpose**: Edit existing characters
- **Features**:
  - Same as create with loaded data
  - Version history
  - Related content links

#### 14. **Create Location** (`/writer/locations/new`)
- **Purpose**: Design new locations
- **Features**:
  - Location details form
  - Zone creation
  - Atmospheric descriptions
  - Image management

#### 15. **Edit Location** (`/writer/locations/[slug]`)
- **Purpose**: Edit existing locations
- **Features**:
  - Same as create with loaded data
  - Zone management
  - Related scenes/characters

#### 16. **Create Scene** (`/writer/scenes/new`)
- **Purpose**: Define scene metadata
- **Features**:
  - Scene details form
  - Character selection
  - Location/zone assignment
  - Narrative tags
  - Timeline placement

#### 17. **Edit Scene** (`/writer/scenes/[slug]` or `/writer/scenes/[id]`)
- **Purpose**: Edit scene metadata
- **Features**:
  - Same as create with loaded data
  - Character management
  - Zone associations
  - Tiptap editor integration

#### 18. **Create Zone** (`/writer/zones/new`)
- **Purpose**: Define zones within locations
- **Features**:
  - Zone naming and description
  - Location association
  - Physical details
  - Narrative function

#### 19. **Edit Zone** (`/writer/zones/[slug]`)
- **Purpose**: Edit zone details
- **Features**:
  - Same as create with loaded data
  - Related scenes
  - Zone hierarchy

### Admin Pages

#### 20. **Upload Content** (`/admin/upload`)
- **Purpose**: Bulk content ingestion from markdown
- **Features**:
  - File upload interface
  - Markdown parsing
  - Content validation
  - Bulk import workflow

## Design System

### Color Palette (Dark Theme)
- **Background**: `hsl(240 10% 3.9%)`
- **Foreground**: `hsl(0 0% 98%)`
- **Primary**: `hsl(263 70% 50%)` (Purple)
- **Muted**: `hsl(240 3.7% 15.9%)`
- **Border**: `hsl(240 3.7% 15.9%)`

### Typography
- **Headings**: Bold, tracking-tight
- **Body**: Antialiased, muted foreground for secondary text
- **Font Stack**: System fonts (via Tailwind)

### Components
- **Cards**: Rounded borders, subtle shadows, hover states
- **Buttons**: Rounded corners, transition effects
- **Inputs**: Rounded, focus rings with primary color
- **Icons**: Lucide icon library

### Layout Patterns
- **Container**: Max-width with responsive padding
- **Grids**: Responsive (1/2/3 columns based on viewport)
- **Spacing**: Consistent 8px base unit
- **Navigation**: Sticky headers, breadcrumbs on detail pages

## Key Features Across Pages

### Reading Progress Tracking
- Tracks scroll position per chapter
- Displays completion percentage
- Shows "Continue Reading" card on canon browser
- Syncs via localStorage

### Responsive Images
- Cloudflare Images integration
- Variant selection based on viewport
- Lazy loading
- Fallback states

### Search & Discovery
- Semantic search with AI embeddings
- Filter by content type
- Sort by alphabetical or recent
- Quick navigation tabs

### Content Workflow
- Draft → Published states
- Auto-republish on edits to published content
- Structured content hierarchy (content_item → revision → section → block)
- Scene-level metadata with character/location tagging

## Technical Stack

- **Framework**: SvelteKit 5 (Runes)
- **Styling**: TailwindCSS
- **Database**: Cloudflare D1 (SQLite)
- **ORM**: Drizzle
- **Rich Text**: Tiptap
- **Icons**: Lucide
- **Hosting**: Cloudflare Pages/Workers

## Files in This Directory

- `home.html` - Home page mockup
- `canon-browser.html` - Canon browser mockup
- `search.html` - Search page mockup
- `writer-dashboard.html` - Writer dashboard mockup
- `screenshots/` - PNG screenshots of each mockup
