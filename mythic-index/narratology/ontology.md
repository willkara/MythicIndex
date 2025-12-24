# **A Comprehensive Narrative Ontology**

This document outlines a complete, low-level starter ontology designed for a Dungeons & Dragons-inspired fantasy world. It is structured to serve as the foundational schema for a narrative knowledge graph, capable of modeling both the objective facts of the world (_fabula_) and the subjective structure of its telling (_syuzhet_).  
The ontology is divided into two main parts:

1. **Node Types (Classes):** The core entities or "nouns" of your world.
2. **Relationship Types (Object Properties):** The connections or "verbs" that link those entities together.

---

## **1\. Node Types (Classes)**

These are the fundamental building blocks of your story. Each node type has a label and a set of properties that store its specific attributes.

#### **Creature**

This is a high-level node for any living being, from player characters to monsters.

| Property Name | Data Type     | Description                                                        |
| :------------ | :------------ | :----------------------------------------------------------------- |
| id            | String (UUID) | Unique identifier for the creature.                                |
| name          | String        | The creature's common name (e.g., "Kaelen," "Goblin").             |
| description   | Text          | A physical and biographical description.                           |
| race          | String        | The creature's race (e.g., "Human," "Elf," "Orc").                 |
| alignment     | String        | Moral and ethical alignment (e.g., "Lawful Good," "Chaotic Evil"). |
| status        | String        | Current state (e.g., "Alive," "Deceased," "Missing").              |
| created_at    | DateTime      | Timestamp of when this entity was created in the system.           |

#### **Character (Sub-class of Creature)**

This node represents sentient, plot-relevant creatures, including protagonists, antagonists, and major NPCs. It inherits all properties from Creature.

| Property Name      | Data Type      | Description                                                                          |
| :----------------- | :------------- | :----------------------------------------------------------------------------------- |
| class              | String         | The character's class or profession (e.g., "Ranger," "Wizard," "Thief").             |
| level              | Integer        | The character's power level or experience.                                           |
| stats              | JSON/Map       | A key-value map of core attributes (e.g., {"strength": 14, "dexterity": 18}).        |
| personality_vector | Array\[Float\] | A vector representing the character's Big Five personality traits for AI generation. |
| motivations        | Text           | The character's primary goals, desires, and fears.                                   |

#### **Location**

Represents any geographical place in the world.

| Property Name | Data Type     | Description                                                         |
| :------------ | :------------ | :------------------------------------------------------------------ |
| id            | String (UUID) | Unique identifier for the location.                                 |
| name          | String        | The name of the location (e.g., "Silvergate," "Whispering Peaks").  |
| type          | String        | The kind of location (e.g., "City," "Forest," "Dungeon," "Tavern"). |
| description   | Text          | A sensory description of the location's atmosphere and appearance.  |
| coordinates   | Point         | Geospatial data for mapping (if applicable).                        |

#### **Event**

The most critical node for tracking the _fabula_. An event is a discrete occurrence in the story's timeline.

| Property Name     | Data Type     | Description                                                                      |
| :---------------- | :------------ | :------------------------------------------------------------------------------- |
| id                | String (UUID) | Unique identifier for the event.                                                 |
| name              | String        | A short, descriptive name (e.g., "The Coronation Ambush").                       |
| description       | Text          | A detailed, objective account of what happened during the event.                 |
| timestamp         | DateTime      | The precise in-world date and time the event occurred.                           |
| story_grammar_tag | String        | The event's role in the plot (e.g., "Initiating Event," "Climax," "Resolution"). |

#### **Item**

Represents any tangible object in the world, from a simple sword to a magical artifact.

| Property Name | Data Type     | Description                                                                                          |
| :------------ | :------------ | :--------------------------------------------------------------------------------------------------- |
| id            | String (UUID) | Unique identifier for the item.                                                                      |
| name          | String        | The item's name (e.g., "Sword of Ancients," "Health Potion").                                        |
| type          | String        | The item's category (e.g., "Weapon," "Armor," "Potion," "Quest Item").                               |
| description   | Text          | What the item looks like and its history.                                                            |
| properties    | JSON/Map      | A key-value map of magical or special properties (e.g., {"damage": "1d8", "effect": "+2 Strength"}). |

#### **Faction**

Represents any group or organization, such as a kingdom, guild, or secret society.

| Property Name | Data Type     | Description                                                                      |
| :------------ | :------------ | :------------------------------------------------------------------------------- |
| id            | String (UUID) | Unique identifier for the faction.                                               |
| name          | String        | The faction's name (e.g., "The Iron Circle," "Kingdom of Eldoria").              |
| type          | String        | The type of organization (e.g., "Kingdom," "Thieves' Guild," "Religious Order"). |
| ideology      | Text          | The faction's core beliefs, goals, and principles.                               |
| symbol        | String        | A description or URL of the faction's symbol.                                    |

#### **Lore**

Represents a piece of abstract knowledge, history, or a world rule.

| Property Name | Data Type     | Description                                                                           |
| :------------ | :------------ | :------------------------------------------------------------------------------------ |
| id            | String (UUID) | Unique identifier for the lore entry.                                                 |
| title         | String        | The title of the lore entry (e.g., "The War of the Magi," "Rules of Necromancy").     |
| text          | Text          | The full text of the lore, myth, or rule.                                             |
| type          | String        | The category of knowledge (e.g., "History," "Mythology," "Magic System," "Prophecy"). |

#### **MediaObject**

Represents a visual or multimedia asset related to the story world.

| Property Name | Data Type     | Description                                                                    |
| :------------ | :------------ | :----------------------------------------------------------------------------- |
| id            | String (UUID) | Unique identifier for the media object.                                        |
| url           | String        | The URL or file path to the asset.                                             |
| type          | String        | The kind of media (e.g., "Character Portrait," "Location Concept Art," "Map"). |
| description   | Text          | A brief description of what the media shows or its artistic style.             |
| created_at    | DateTime      | Timestamp of when this asset was added to the system.                          |

#### **Book (or Story)**

This is the top-level node, representing the entire work.

| Property Name | Data Type     | Description                                               |
| :------------ | :------------ | :-------------------------------------------------------- |
| id            | String (UUID) | Unique identifier for the book.                           |
| title         | String        | The title of the book.                                    |
| genre         | String        | The primary genre (e.g., "High Fantasy," "Epic Fantasy"). |
| theme         | Text          | A summary of the core thematic argument or message.       |

#### **Act**

A node for grouping chapters into major structural sections (e.g., Act I, Act II, Act III).

| Property Name | Data Type     | Description                                                             |
| :------------ | :------------ | :---------------------------------------------------------------------- |
| id            | String (UUID) | Unique identifier for the act.                                          |
| act_number    | Integer       | The sequential number of the act (1, 2, 3, etc.).                       |
| title         | String        | An optional title for the act (e.g., "The Setup," "The Confrontation"). |
| summary       | Text          | A high-level summary of this act's purpose in the story.                |

#### **Chapter**

A node representing a single chapter.

| Property Name    | Data Type     | Description                                                          |
| :--------------- | :------------ | :------------------------------------------------------------------- |
| id               | String (UUID) | Unique identifier for the chapter.                                   |
| chapter_number   | Integer       | The sequential number of the chapter.                                |
| title            | String        | The title of the chapter.                                            |
| summary          | Text          | A concise summary of the chapter's key plot points and developments. |
| pov_character_id | String        | The ID of the Character node whose point of view is used.            |
| word_count       | Integer       | The total word count, useful for pacing analysis.                    |

#### **Scene**

This is the most granular and important structural node. A scene is a continuous segment of the story that occurs in a single time and place from a specific character's perspective.

| Property Name      | Data Type     | Description                                                                             |
| :----------------- | :------------ | :-------------------------------------------------------------------------------------- |
| id                 | String (UUID) | Unique identifier for the scene.                                                        |
| scene_number       | Integer       | The scene's number within its parent chapter.                                           |
| summary            | Text          | A one-sentence description of the scene's core action.                                  |
| prose_text         | Text          | The actual written content of the scene.                                                |
| pacing_label       | String        | A qualitative label for the scene's pace (e.g., "Fast," "Slow," "Introspective").       |
| narrative_function | String        | The scene's purpose in the plot (e.g., "Exposition," "Rising Action," "Climax").        |
| value_shift        | String        | The change in a core story value that occurs in the scene (e.g., "Safe to Threatened"). |

---

## **2\. Relationship Types (Object Properties)**

Relationships are directed edges that give the graph its meaning and structure. They can also have properties to add context.

#### **Core World Relationships**

| Relationship Type    | Start Node(s)      | End Node(s)        | Direction & Meaning                                                               | Example Properties                           |
| :------------------- | :----------------- | :----------------- | :-------------------------------------------------------------------------------- | :------------------------------------------- |
| **PARTICIPATED_IN**  | Creature           | Event              | (Creature) \-\> (Event): The creature was involved in the event.                  | role: "Protagonist", action: "Fought"        |
| **OCCURRED_AT**      | Event              | Location           | (Event) \-\> (Location): The event took place at this location.                   |                                              |
| **CAUSED**           | Event              | Event              | (Event) \-\> (Event): The first event is a direct cause of the second.            | causality_type: "Direct"                     |
| **PRECEDED**         | Event              | Event              | (Event) \-\> (Event): The first event happened immediately before the second.     |                                              |
| **KNOWS**            | Character          | Character          | (Character) \-\> (Character): The first character knows the second.               | since: "Event ID", opinion: "Trusts"         |
| **HAS_KNOWLEDGE_OF** | Character          | Lore               | (Character) \-\> (Lore): The character is aware of this piece of lore.            | source: "Ancient Tome"                       |
| **MEMBER_OF**        | Character          | Faction            | (Character) \-\> (Faction): The character is a member of the faction.             | rank: "Captain", joined_on: "Date"           |
| **LEADER_OF**        | Character          | Faction            | (Character) \-\> (Faction): The character leads the faction.                      |                                              |
| **ALLIED_WITH**      | Faction            | Faction            | (Faction) \-\> (Faction): The factions are allies.                                | treaty_signed: "Event ID"                    |
| **ENEMY_OF**         | Faction, Character | Faction, Character | (Entity) \-\> (Entity): The entities are hostile to one another.                  | reason: "Betrayal"                           |
| **POSSESSES**        | Creature, Location | Item               | (Entity) \-\> (Item): The entity currently has the item.                          | quantity: 1                                  |
| **LOCATED_IN**       | Location, Creature | Location           | (Entity) \-\> (Location): A sub-location or creature is within a larger location. |                                              |
| **BORN_IN**          | Creature           | Location           | (Creature) \-\> (Location): The creature's birthplace.                            |                                              |
| **TRAVELLED_TO**     | Creature           | Location           | (Creature) \-\> (Location): The creature visited this location.                   | arrival_date: "Date", departure_date: "Date" |

#### **Visual & Asset Relationships**

| Relationship Type | Start Node(s)             | End Node(s) | Direction & Meaning                                                                    | Example Properties                                |
| :---------------- | :------------------------ | :---------- | :------------------------------------------------------------------------------------- | :------------------------------------------------ |
| **HAS_PORTRAIT**  | Character                 | MediaObject | (Character) \-\> (MediaObject): The character is officially represented by this image. |                                                   |
| **HAS_IMAGE**     | Location, Item, Faction   | MediaObject | (Entity) \-\> (MediaObject): The entity is depicted by this image.                     |                                                   |
| **APPEARS_IN**    | Character, Location, Item | MediaObject | (Entity) \-\> (MediaObject): The entity is visually present in this media object.      | region: "background", prominence: "central_focus" |

#### **Structural & Sequential Relationships**

| Relationship Type | Start Node     | End Node       | Direction & Meaning                                             |
| :---------------- | :------------- | :------------- | :-------------------------------------------------------------- |
| **HAS_ACT**       | Book           | Act            | (Book) \-\> (Act): The book contains this act.                  |
| **HAS_CHAPTER**   | Act            | Chapter        | (Act) \-\> (Chapter): The act contains this chapter.            |
| **HAS_SCENE**     | Chapter        | Scene          | (Chapter) \-\> (Scene): The chapter contains this scene.        |
| **NEXT**          | Chapter, Scene | Chapter, Scene | (Unit) \-\> (Unit): Creates a linked list for sequential order. |

#### **The Bridge: Connecting Prose to World**

| Relationship Type  | Start Node | End Node  | Direction & Meaning                                                                   |
| :----------------- | :--------- | :-------- | :------------------------------------------------------------------------------------ |
| **DEPICTS**        | Scene      | Event     | (Scene) \-\> (Event): This scene portrays this chronological event from the _fabula_. |
| **FEATURES**       | Scene      | Character | (Scene) \-\> (Character): This character is present or active in this scene.          |
| **TAKES_PLACE_IN** | Scene      | Location  | (Scene) \-\> (Location): This scene occurs in this location.                          |
| **REVEALS**        | Scene      | Lore      | (Scene) \-\> (Lore): This scene discloses a piece of world knowledge to the reader.   |
