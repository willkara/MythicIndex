"""
Fix missing content sections identified by the image generation parser.
"""
import re
from pathlib import Path


def fix_city_watch_hq():
    """Promote Inter-Building Linkages from subsection to main section."""
    file_path = Path("MemoryQuill/story-content/locations/city-watch-headquarters/description.md")

    content = file_path.read_text(encoding='utf-8')

    # Find and replace the subsection heading with a main section
    old_section = """### Inter-Building Linkages (Over Justicar's Way)
- Bridge of Scrutiny (3rd): Fully enclosed stone-and-iron corridor with interior shutters and privacy baffles; guarded at both portals.
- Bridge of Whispers (5th): Open-air but caged walkway with wind baffles and railings; controlled for informal coordination and observation; can be locked and sealed in foul weather.
- Engineering Notes: Masonry and iron truss underframes keyed into both buildings' bearing walls; expansion tolerances accounted for at bearings; emergency severance plan exists (mechanical/magical) but remains sealed protocol."""

    new_section = """## Inter-Building Linkages

The City Watch Headquarters features two elevated sky-bridges spanning Justicar's Way, connecting the public-facing Shield Hall to the secure Spire of Inquiry. These architectural links enable controlled coordination between departments while maintaining operational security.

### Bridge of Scrutiny (3rd Floor)
Fully enclosed stone-and-iron corridor with interior shutters and privacy baffles; guarded at both portals. Provides secure passage for sensitive coordination between Shield Hall and the Spire of Inquiry.

### Bridge of Whispers (5th Floor)
Open-air but caged walkway with wind baffles and railings; controlled for informal coordination and observation; can be locked and sealed in foul weather. Officers use this elevated passage for quick consultation and street surveillance.

### Engineering Notes
Masonry and iron truss underframes keyed into both buildings' bearing walls; expansion tolerances accounted for at bearings; emergency severance plan exists (mechanical/magical) but remains sealed protocol."""

    if old_section in content:
        content = content.replace(old_section, new_section)
        file_path.write_text(content, encoding='utf-8')
        print(f"✓ Fixed: {file_path.name} - Promoted Inter-Building Linkages to main section")
        return True
    else:
        print(f"✗ Could not find expected content in {file_path.name}")
        return False


def fix_undershade_canyon():
    """Add Visual Summary section to undershade-canyon."""
    file_path = Path("MemoryQuill/story-content/locations/undershade-canyon/description.md")

    content = file_path.read_text(encoding='utf-8')

    # Insert Visual Summary after the main heading
    visual_summary = """
## Visual Summary

Undershade Canyon is a deep, ochre-banded canyon system carved into sedimentary walls with darker igneous intrusions. Ancient vine-strangled pillars mark the threshold to a vaulted stone sanctuary adapted for draconic rituals. The canyon floor features brass brazier rows, a central basalt plinth altar, and evidence of recent fire transformation—portions of the ancient stonework now frozen in rippled, translucent glass from dragon-fire. Warm updrafts carry sage and brimstone notes from the depths, while the south switchbacks show a treacherous glazed surface from older fire events. The site combines natural geological drama with ancient architectural ambition, all overlaid by the scars of supernatural heat.

"""

    # Find the first ## heading after the title and insert before it
    match = re.search(r'\n(## Geography & Site Analysis)', content)
    if match:
        insertion_point = match.start()
        content = content[:insertion_point] + visual_summary + content[insertion_point:]
        file_path.write_text(content, encoding='utf-8')
        print(f"✓ Fixed: {file_path.name} - Added Visual Summary section")
        return True
    else:
        print(f"✗ Could not find insertion point in {file_path.name}")
        return False


def fix_medic_halden():
    """Add Profile section to medic-halden."""
    file_path = Path("MemoryQuill/story-content/characters/medic-halden/profile.md")

    content = file_path.read_text(encoding='utf-8')

    # Insert Profile section after the frontmatter and main heading
    profile_section = """
## Profile

Halden is a shy but earnest field medic serving with the City Guard, representing the practical medical expertise needed for dangerous rescue operations. He brings methodical discipline to wound treatment and pain management, complementing the more mystical healing provided by clerics like Aldwin. His nervous tic reveals the stress of field work, but his compassionate approach and patient-focused care make him an invaluable asset. As a member of Captain Thorne Brightward's original patrol that discovered Veyra at Undershade Canyon, Halden is counted among the Last Light Company's founding members. His philosophy of "ice numbs; water cleans; pain obeys discipline" reflects his practical, grounded approach to battlefield medicine.

"""

    # Find the first ## heading after the title and insert before it
    match = re.search(r'\n(## Basic Information)', content)
    if match:
        insertion_point = match.start()
        content = content[:insertion_point] + profile_section + content[insertion_point:]
        file_path.write_text(content, encoding='utf-8')
        print(f"✓ Fixed: {file_path.name} - Added Profile section")
        return True
    else:
        print(f"✗ Could not find insertion point in {file_path.name}")
        return False


def fix_masons_guildhall():
    """Add main sections for basement content."""
    file_path = Path("MemoryQuill/story-content/locations/masons-guildhall/description.md")

    content = file_path.read_text(encoding='utf-8')

    # Find the subsection F and add main sections after Hearthstone Lounge section
    insertion_marker = '### F. "Hammer & Chisel" Training Workshops and Proving Cellar (Basement)'

    new_sections = """## Basement - Hammer & Chisel Workshops

The "Hammer & Chisel" training workshops occupy a continuous undercroft beneath the entire guildhall footprint, broken into functional bays with 12-14 foot clear headroom. Segmental brick and stone vaults rest on substantial granite piers, creating a robust foundation for the activities above while providing ample working space below. Banker benches with integrated clamp rails line the perimeter, allowing apprentices and journeymen to practice traditional stonemasonry techniques. A wet room features stone troughs for cleaning and finishing work, while a saw pit accommodates larger cutting operations. Sand stores and a lime-slaking cistern (properly vented to exterior) support mortar preparation and stone treatment.

The east service court provides direct access via a hatch and chain-beam hoist system, enabling efficient delivery of stone blocks and removal of waste. A secure tool cage maintains the guild's inventory of specialized implements, while an iron-bound strongroom with slab and arch vault construction protects valuable plans, seals, and master templates.

## Basement - Proving Cellar

The Proving Cellar represents the guild's commitment to empirical testing and quality assurance. This specialized area contains compression testing rigs with massive screw frames for evaluating stone samples under load, wedge test beds for assessing shear resistance, and shear frames for controlled failure analysis. A ring-test rack allows construction and testing of small-scale arches to validate geometric principles before full-scale application.

Dust-settle boxes connected to cross-vent shafts capture airborne particles from cutting and grinding operations, protecting both workers' health and the precision of testing equipment. The proving cellar's systematic approach to material testing ensures that only stones meeting guild standards are approved for critical structural applications, maintaining Waterdeep's reputation for enduring construction.

### F. "Hammer & Chisel" Training Workshops and Proving Cellar (Basement)"""

    if insertion_marker in content:
        content = content.replace(insertion_marker, new_sections)
        file_path.write_text(content, encoding='utf-8')
        print(f"✓ Fixed: {file_path.name} - Added basement main sections")
        return True
    else:
        print(f"✗ Could not find insertion marker in {file_path.name}")
        return False


def main():
    """Run all fixes."""
    print("Fixing missing content sections...\n")

    results = []
    results.append(fix_undershade_canyon())
    results.append(fix_medic_halden())
    results.append(fix_city_watch_hq())
    results.append(fix_masons_guildhall())

    print(f"\n{'='*60}")
    print(f"Results: {sum(results)}/{len(results)} files fixed successfully")

    if all(results):
        print("\n✓ All fixes applied successfully!")
        print("\nNext step: Re-run the parser to verify all sections are now found")
    else:
        print("\n✗ Some fixes failed - review output above")


if __name__ == "__main__":
    main()
