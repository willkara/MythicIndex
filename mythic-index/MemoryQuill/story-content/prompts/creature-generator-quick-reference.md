# Creature Generator - Quick Reference

Use this checklist when generating creatures for a new location.

## Quick Process

1. **Read** location overview.md
2. **Identify** location type and atmosphere
3. **Design** 4 creatures with variety in scale, threat, visibility
4. **Write** complete YAML profiles
5. **Verify** uniqueness and story integration

## Template

```yaml
creatures:
  - name: [Unique, Evocative Name]
    description: 2-3 sentences about what it is and why it matters
    visual_aspects:
      - Physical description items (5-6 bullets)
    habitat:
      where: Specific location area
      when: Activity timing/conditions
      why: Ecological reason for presence
    behavior:
      who: Social structure
      what: Primary activities
      how: Methods and abilities
    lore: 2-4 sentences with history, significance, and human interaction
```

## Creature Variety Matrix

Create one creature from each quadrant:

| | **Helpful** | **Harmful** |
|---------|-------------|-------------|
| **Visible** | Workshop familiar, Service animal | Guard beast, Territorial predator |
| **Hidden** | Secret organizer, Silent protector | Ambush predator, Corruption agent |

## Type-Specific Reminders

**Wilderness**: Environmental adaptation, natural magic, ancient guardians
**Urban**: City-specific (no repeats!), human activity manifestations
**Tavern/Inn**: Comfort providers, atmosphere enhancers, hospitality spirits
**Underground**: Bioluminescence, mineral feeders, worker echoes
**Corrupted**: Twisted mutations, supernatural manifestations

## Quality Gates

- [ ] Each creature unique to THIS location
- [ ] No generic D&D monsters without unique twists
- [ ] Urban creatures don't repeat across districts
- [ ] Mix of helpful/harmful, visible/hidden
- [ ] Rich lore showing lived-in world
- [ ] Clear story/gameplay potential

## Common Creature Niches

- **Maintenance**: Keeps location functional (repairs, cleaning, organization)
- **Warning**: Alerts to danger, intruders, or problems
- **Diagnostic**: Reveals hidden information or conditions
- **Comfort**: Provides emotional support or reduces suffering
- **Record**: Preserves memory, information, or history
- **Protection**: Guards territory or secrets
- **Scavenger**: Cleans up waste, pests, or decay
- **Manifestation**: Embodies location's purpose or history

## Save Location

```
story-content/locations/[location-slug]/creatures.yaml
```
