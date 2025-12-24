"""Fix the remaining two files with regex patterns."""
import re
from pathlib import Path

# Fix city-watch-headquarters
file1 = Path('MemoryQuill/story-content/locations/city-watch-headquarters/description.md')
content1 = file1.read_text(encoding='utf-8')

# Use regex to find and replace the subsection
pattern1 = r'### Inter-Building Linkages \(Over Justicar\'s Way\)\n- Bridge of Scrutiny.*?- Engineering Notes: [^\n]+\n'
replacement1 = '''## Inter-Building Linkages

The City Watch Headquarters features two elevated sky-bridges spanning Justicar's Way, connecting the public-facing Shield Hall to the secure Spire of Inquiry.

### Bridge of Scrutiny (3rd Floor)
Fully enclosed stone-and-iron corridor with interior shutters and privacy baffles; guarded at both portals.

### Bridge of Whispers (5th Floor)
Open-air but caged walkway with wind baffles and railings; controlled for informal coordination and observation.

### Engineering Notes
Masonry and iron truss underframes keyed into both buildings' bearing walls; expansion tolerances accounted for at bearings; emergency severance plan exists (mechanical/magical) but remains sealed protocol.

'''

content1 = re.sub(pattern1, replacement1, content1, flags=re.DOTALL)
file1.write_text(content1, encoding='utf-8')
print('✓ Fixed city-watch-headquarters')

# Fix masons-guildhall
file2 = Path('MemoryQuill/story-content/locations/masons-guildhall/description.md')
content2 = file2.read_text(encoding='utf-8')

# Find where to insert basement sections (before subsection F)
insertion = '''## Basement - Hammer & Chisel Workshops

The training workshops occupy a continuous undercroft with 12-14 foot clear headroom. Banker benches, wet rooms, saw pits, and material stores support hands-on training in traditional stonemasonry techniques. The east service court hatch and hoist enable efficient stone delivery.

## Basement - Proving Cellar

The Proving Cellar contains compression rigs, wedge test beds, shear frames, and ring-test racks for empirical testing of stone samples and structural elements. Dust-settle boxes on cross-vent shafts maintain air quality during testing operations.

'''

# Insert before subsection F
pattern2 = r'(### F\. "Hammer & Chisel" Training Workshops)'
content2 = re.sub(pattern2, insertion + r'\1', content2)
file2.write_text(content2, encoding='utf-8')
print('✓ Fixed masons-guildhall')

print('\n✓ All remaining files fixed successfully!')
