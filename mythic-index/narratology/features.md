# **System Requirements: Literary & Creative Module (v1.1)**

**Version:** 1.1  
**Date:** October 26, 2025

## **1\. Thematic & Symbolic Analysis Layer**

This layer provides tools to track and analyze the deeper meaning woven into the narrative, ensuring the story is thematically coherent and symbolically rich.

### **1.1 Feature: Thematic Resonance Engine**

|           |                                                                                                                                                                                                                                                                                                                                                                                                                              |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Who**   | The Author, during the outlining, drafting, and revision stages.                                                                                                                                                                                                                                                                                                                                                             |
| **What**  | A system to formally define, tag, and visualize the presence and development of the story's core themes (e.g., "Betrayal vs. Loyalty," "Freedom vs. Destiny").                                                                                                                                                                                                                                                               |
| **When**  | **Outlining:** To intentionally structure the story around its central message. **Revision:** To diagnose "thematic drift" and ensure every part of the story serves its purpose.                                                                                                                                                                                                                                            |
| **Where** | **Definition:** A dedicated "Themes" section within the world-building module. **Analysis:** A "Thematic Heatmap" visualization within the "Observatory" dashboard.                                                                                                                                                                                                                                                          |
| **Why**   | To ensure the story's plot, character arcs, and conflicts consistently reinforce its central message. This adds profound depth and ensures the narrative feels purposeful and resonant. Character relationships are the proving ground of theme, and this tool makes that connection explicit.                                                                                                                               |
| **How**   | The author creates Theme nodes in the knowledge graph. Using the manuscript editor, they can link scenes, character decisions, or key dialogue to these theme nodes. The Thematic Heatmap then visualizes the manuscript, color-coding chapters or scenes based on the density of thematic connections, instantly revealing which parts of the story are thematically rich and which are disconnected from the core message. |

#### **Implementation Details**

- **Ontology:** Add a Theme node to the ontology with properties like name (e.g., "Redemption") and central_question (e.g., "Can a person truly escape their past?"). Add a DISCUSSES relationship to connect Scene, Event, or Character nodes to Theme nodes.
- **Backend (FastAPI):** Create API endpoints for CRUD operations on Theme nodes. Create an endpoint that takes a Book ID and returns a data structure representing the thematic density of each chapter (e.g., \`\`).
- **Frontend (Angular):** In the editor, allow users to highlight text and tag it with a theme from a dropdown list. In the "Observatory" dashboard, use a library like **D3.js** or **Plotly.js** to render the data from the backend as an interactive heatmap or stacked bar chart, showing the thematic composition of each chapter.

#### **Usage Ideas & Examples**

- **Example:** An author writing a space opera about a galactic rebellion defines the theme "Freedom vs. Security." After writing ten chapters, they look at the Thematic Heatmap and notice that Chapters 6-8 have zero connection to this theme. They realize the subplot in those chapters has drifted. The tool prompts them to either integrate the theme into the subplot or reconsider the subplot's relevance.
- **Benefit:** Moves theme from an abstract concept to a measurable element, helping the author craft a more cohesive and impactful narrative.

### **1.2 Feature: Symbolism & Motif Tracker**

|           |                                                                                                                                                                                                                                                                                                                                                                                                       |
| :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Who**   | The Author, during world-building, drafting, and revision.                                                                                                                                                                                                                                                                                                                                            |
| **What**  | A tool to create a formal library of recurring symbols and motifs, defining their intended meaning and tracking their appearances throughout the narrative.                                                                                                                                                                                                                                           |
| **When**  | **World-Building:** To establish a symbolic language for the story. **Drafting & Revision:** To ensure symbols are used consistently and their meaning evolves or deepens over time.                                                                                                                                                                                                                  |
| **Where** | **Definition:** A "Symbolism" section in the world-building module. **Analysis:** As an overlay on the "Observatory" timeline and character maps, showing where and when symbols appear.                                                                                                                                                                                                              |
| **Why**   | To move beyond accidental imagery and empower the author to consciously craft a symbolic layer that adds subtext, foreshadows events, and reinforces themes. A well-chosen symbol can act as a thread that ties together various plotlines and character arcs.                                                                                                                                        |
| **How**   | The author creates Symbol nodes (e.g., "A Raven") and adds properties defining its meaning ("prophecy, foreboding"). The system can then use NLP to suggest potential appearances of the symbol in the prose. Once tagged, the system can visualize the "constellation" of a symbol, showing its proximity to key characters and events across the story's timeline, revealing patterns in its usage. |

#### **Implementation Details**

- **Ontology:** Add a Symbol node with properties like name, intended_meaning, and type (e.g., "Object," "Animal," "Color"). Add a CONTAINS_SYMBOL relationship to link Scene or MediaObject nodes to Symbol nodes.
- **Backend (FastAPI):** Create API endpoints for CRUD operations on Symbol nodes. Implement an NLP service (e.g., using spaCy) that can scan Scene.prose_text for keywords associated with defined symbols and suggest potential links to the author.
- **Frontend (Angular):** Create a UI for managing the symbol library. In the "Observatory," use a graph visualization library like **Pyvis** or **D3.js** to display a network graph showing a selected symbol at the center, connected to all the scenes and characters it appears with.

#### **Usage Ideas & Examples**

- **Example:** An author defines "Mirrors" as a symbol for "self-deception." They ask the system, "Show me all scenes where the protagonist interacts with a mirror." The resulting graph shows these scenes are clustered in Act I. The system might then suggest, "The 'Mirrors' symbol has not appeared since Chapter 5\. Consider reintroducing it in Act III to show the character's final self-realization."
- **Benefit:** Helps the author use symbolism with intention, ensuring motifs build meaning throughout the story rather than appearing randomly.

## **2\. Emotional Arc & Pacing Analysis Layer**

This layer focuses on the reader's journey, providing objective feedback on the story's rhythm, tension, and emotional impact.

### **2.1 Feature: Narrative Pacing Dashboard**

|           |                                                                                                                                                                                                                                                                                                                            |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Who**   | The Author, primarily during the editing and revision process.                                                                                                                                                                                                                                                             |
| **What**  | A suite of visualizations that analyze the story's pacing, defined as the speed at which the reader experiences events. It distinguishes between micro-pacing (sentence/paragraph structure) and macro-pacing (scene/chapter structure).                                                                                   |
| **When**  | After a first draft is complete, to get a "bird's-eye view" of the narrative rhythm and identify sections that feel too slow or too rushed.                                                                                                                                                                                |
| **Where** | A dedicated "Pacing & Momentum" tab within the "Observatory" dashboard.                                                                                                                                                                                                                                                    |
| **Why**   | To give the author objective control over the reader's experience. Good pacing keeps readers engaged, builds tension effectively, and ensures the story's rhythm matches its content (e.g., fast for action, slow for introspection).                                                                                      |
| **How**   | The system generates a "Pacing Score" for each scene by analyzing quantifiable metrics like sentence length, paragraph length, and the ratio of dialogue to narration. This is plotted on a graph across the story's timeline. The author can also manually tag scenes as "fast" or "slow" to see the balance at a glance. |

#### **Implementation Details**

- **Backend (FastAPI):** Create a service that, for a given Scene ID, analyzes the prose_text. It should calculate metrics like average sentence length, paragraph length, and the percentage of the text that is dialogue. Combine these into a normalized "Pacing Score."
- **Frontend (Angular):** In the "Observatory," display a line or bar chart plotting the Pacing Score for every scene in the book, allowing the author to see the story's rhythm visually. The author should be able to click on a point in the graph to navigate directly to that scene in the editor. Libraries like **Plotly** or **Bokeh** are well-suited for this.

#### **Usage Ideas & Examples**

- **Example:** An author feels their thriller's climax is falling flat. They check the Pacing Dashboard and see that the Pacing Score _decreases_ during the climax chapters due to long, descriptive paragraphs. This objective data confirms their gut feeling. They then rewrite the scenes using shorter, punchier sentences to increase the pace and tension.
- **Benefit:** Turns the subjective "feel" of pacing into an objective, actionable metric, allowing for more precise and effective revisions.

### **2.2 Feature: Emotional Arc Visualization**

|           |                                                                                                                                                                                                                                                                                                                                                                  |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Who**   | The Author, during outlining and revision.                                                                                                                                                                                                                                                                                                                       |
| **What**  | A graph that plots the emotional trajectory of the story, showing the shifts in emotional valence (positive/negative) and intensity on a scene-by-scene basis.                                                                                                                                                                                                   |
| **When**  | **Outlining:** To plan the story's emotional "roller coaster" and ensure it builds toward a satisfying climax. **Revision:** To verify that the written prose successfully evokes the intended emotions.                                                                                                                                                         |
| **Where** | Within the "Observatory" dashboard, ideally as a chart that can be compared against the pacing and plot-point timelines.                                                                                                                                                                                                                                         |
| **Why**   | To ensure the story delivers a compelling emotional journey. It helps the author visualize the story's structure in terms of emotional impact, identifying flat spots, insufficient stakes, or a climax that doesn't feel like the story's emotional peak.                                                                                                       |
| **How**   | The system uses sentiment analysis to score the emotional content of each Scene node's prose. This score is plotted on a vertical axis (from negative to positive) against the scene sequence on the horizontal axis. This creates a visual curve of the story's emotional arc, similar to the Story Grid Infographic, which tracks value shifts scene by scene. |

#### **Implementation Details**

- **Backend (FastAPI):** Implement a sentiment analysis pipeline. For each Scene, process its prose_text through a sentiment analysis model (e.g., VADER, or a more advanced transformer-based model) to get a compound score from \-1 (negative) to \+1 (positive). Create an API endpoint to return these scores for all scenes in a book.
- **Frontend (Angular):** Use a charting library like **Plotly.js** or **Chart.js** to create a line chart of the emotional arc. The x-axis represents the scene number, and the y-axis represents the sentiment score. Allow the user to overlay key plot points (like Inciting Incident, Climax) on the chart as annotations.

#### **Usage Ideas & Examples**

- **Example:** An author wants to write a tragedy. They review the Emotional Arc chart and see that the story ends on a slightly positive note. The visualization immediately shows them that the final scenes aren't landing with the intended tragic impact, prompting a rewrite to create a more powerful, downbeat conclusion.
- **Benefit:** Provides a high-level, data-driven view of the reader's emotional journey, making it easier to craft a satisfying and intentional arc.

## **3\. Advanced Narrative Device Modeling**

This layer provides tools for analyzing and suggesting sophisticated literary techniques that rely on controlling the flow of information.

### **3.1 Feature: Suspense & Irony Detector**

|           |                                                                                                                                                                                                                                                                                                                                                      |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Who**   | The Author, during drafting and revision.                                                                                                                                                                                                                                                                                                            |
| **What**  | An analytical engine that identifies opportunities to create dramatic irony and suspense by tracking the knowledge state of each character versus the knowledge state of the reader.                                                                                                                                                                 |
| **When**  | During drafting, the system can provide real-time suggestions. During revision, it can highlight missed opportunities for tension.                                                                                                                                                                                                                   |
| **Where** | As contextual alerts or suggestions within the manuscript editor (e.g., a small icon next to a paragraph indicating an irony opportunity).                                                                                                                                                                                                           |
| **Why**   | To help the author masterfully control narrative tension. Dramatic irony—where the reader knows more than the character—is a key tool for generating suspense and engaging the reader on a deeper intellectual and emotional level.                                                                                                                  |
| **How**   | The knowledge graph tracks what each character knows via HAS_KNOWLEDGE_OF relationships. The system detects an opportunity for dramatic irony when a Scene REVEALS a piece of Lore to the reader, but the Character featured in that scene does not yet have a HAS_KNOWLEDGE_OF link to that same Lore. The system can then flag this knowledge gap. |

#### **Implementation Details**

- **Backend (FastAPI):** This requires a sophisticated logic engine. When a scene is analyzed, the backend will run a Cypher query to find the set of all Lore nodes connected to that Scene via a REVEALS relationship. It will then run a second query for each Character FEATURED in the scene to get the set of Lore they HAVE_KNOWLEDGE_OF. If the first set contains lore not present in the second set, an "Irony Opportunity" is flagged.
- **Frontend (Angular):** The editor will periodically poll the backend for these opportunities for the currently active scene. When an opportunity is detected, a subtle icon will appear in the margin. Clicking it will open a tooltip explaining the knowledge gap (e.g., "The reader knows about the 'Poisoned Chalice,' but Kaelen does not.").

#### **Usage Ideas & Examples**

- **Example:** A character is about to enter a building the reader knows is rigged with explosives. The system flags this as a moment of high dramatic irony and suggests, "To increase suspense, consider slowing the pace here. Describe the character's mundane actions or thoughts, contrasting their ignorance with the reader's knowledge of the imminent danger."
- **Benefit:** Proactively helps the author identify and amplify moments of suspense, turning the AI into a collaborator that understands narrative tension, not just facts.

## **4\. Generative & Ideation Layer ("The Muse")**

This layer acts as a creative partner, helping the author brainstorm ideas, overcome writer's block, and explore the possibilities of their world.

### **4.1 Feature: "What If" Scenario Generator**

|           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Who**   | The Author, during brainstorming and outlining.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **What**  | A "sandbox" mode that allows the author to explore alternate plotlines and character decisions without altering the main, canonical story.                                                                                                                                                                                                                                                                                                                                     |
| **When**  | When an author is stuck at a major plot decision, wants to explore the consequences of a character's choice, or is comparing different potential plot twists.                                                                                                                                                                                                                                                                                                                  |
| **Where** | A "Branches" or "Scenarios" management panel, visually represented like a Git branch graph.                                                                                                                                                                                                                                                                                                                                                                                    |
| **Why**   | To provide a risk-free environment for creative experimentation. This encourages bold storytelling by allowing the author to see the logical outcomes of different paths before committing to one, turning the knowledge graph into a story simulator.                                                                                                                                                                                                                         |
| **How**   | This feature is built on a version control system for the graph database, inspired by Git. The user creates a "branch," which is an efficient, isolated copy of the story's graph. The AI co-writer then operates within this branch, generating summaries or scenes based on the alternate reality. The author can compare branches and, if desired, "merge" the changes into the main story, with the system flagging any resulting narrative contradictions for resolution. |

#### **Implementation Details**

- **Data Layer (Neo4j):** This is the most complex feature to implement. One approach is to use a dedicated versioning tool like **TerminusDB** or **lakeFS**. A native Neo4j approach could involve modeling branches explicitly. When a branch is created, new Event or Scene nodes created within that branch would have a branch_id property. Queries would then be filtered by the active branch ID. Merging would involve re-assigning the branch_id of the desired nodes to "main" and running a series of validation queries to detect contradictions.
- **Backend (FastAPI):** The API would manage the logic for creating branches, switching the user's active context to a different branch, and initiating the merge process. The merge conflict resolution would be a key challenge, requiring queries that check for logical impossibilities (e.g., a character participating in two events at the same time).
- **Frontend (Angular):** A UI to manage branches (create, switch, delete, merge). A visualization of the branch history, similar to a Git commit graph, would be highly beneficial.

#### **Usage Ideas & Examples**

- **Example:** The author is considering killing a major character. They create a "Character Dies" branch and write a few scenes. They then create a "Character Lives" branch and do the same. By comparing the two timelines and the AI's projected consequences for each, they can make a more informed creative decision before committing it to the main story.
- **Benefit:** Liberates the author from the "fear of the blank page" and the paralysis of big decisions by making experimentation cheap and reversible.

### **4.2 Feature: Plot Twist Generator**

|           |                                                                                                                                                                                                                                                                                                                                                                 |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Who**   | The Author, during brainstorming or when a plot feels too predictable.                                                                                                                                                                                                                                                                                          |
| **What**  | An AI-powered ideation tool that suggests narratively consistent and surprising plot twists by analyzing the existing knowledge graph.                                                                                                                                                                                                                          |
| **When**  | When the author needs inspiration, wants to add a layer of unpredictability, or is looking for a way to connect disparate plot threads.                                                                                                                                                                                                                         |
| **Where** | A "Muse" or "Brainstorm" panel that can be invoked from the editor or outliner.                                                                                                                                                                                                                                                                                 |
| **Why**   | To overcome writer's block by generating novel ideas that are organically rooted in the established world logic. This avoids generic suggestions and instead provides twists that feel earned and surprising.                                                                                                                                                   |
| **How**   | The AI doesn't invent randomly. It runs deep traversal queries on the knowledge graph to find non-obvious, distant connections between entities. For example, it might identify two enemy characters who share a BORN_IN relationship to the same obscure village. These hidden, logical connections become the seeds for plausible and impactful plot twists.1 |

#### **Implementation Details**

- **Backend (FastAPI):** Develop a library of "twist-finding" Cypher queries. These queries are designed to find surprising patterns, such as:
  - MATCH (c1:Character)--\>(c2:Character), (c1)--\>(loc:Location)\<--(c2) RETURN c1, c2, loc (Enemies from the same hometown).
  - MATCH (c:Character)--\>(f:Faction), (c)--\>(l:Lore) WHERE l.content CONTAINS f.secret RETURN c, f, l (A character knows a secret about their own faction).  
    The results of these queries are fed as structured context to an LLM with a prompt like, "Based on this surprising connection, generate three potential plot twists."
- **Frontend (Angular):** A simple button ("Suggest a Twist") that triggers the backend service. The results are displayed as a list of ideas for the author to consider.

#### **Usage Ideas & Examples**

- **Example:** A story's momentum is flagging. The author clicks "Suggest a Twist." The system finds that the magical sword the hero carries was forged by the same smith who created the antagonist's cursed armor. It suggests: 1\) The sword and armor are magically linked, and one can destroy the other. 2\) The smith embedded a secret weakness in the armor, and the sword is the key. 3\) The smith was the antagonist's father, and the sword contains his spirit.
- **Benefit:** Acts as an AI brainstorming partner that uses the author's own world-building to generate relevant, non-cliché ideas, sparking new creative directions.

#### **Works cited**

1. Graph-based RAG | WRITER Knowledge Graph, accessed October 26, 2025, [https://writer.com/product/graph-based-rag/](https://writer.com/product/graph-based-rag/)
