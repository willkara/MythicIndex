# **System Requirements Document: Narrative Intelligence Platform**

**Version:** 1.0  
**Date:** October 26, 2025

## **1\. Introduction**

### **1.1 Purpose**

This document outlines the functional and non-functional requirements for the **Narrative Intelligence Platform**, a complete software solution designed to assist writers in the creation, management, and maturation of complex narrative worlds. The platform will leverage principles of computational narratology, knowledge graphs, and artificial intelligence to serve as an intelligent co-writer and an infallible story bible.

### **1.2 Scope**

The platform will provide a comprehensive suite of tools for world-building, manuscript writing, consistency checking, and narrative analysis. It will manage all story-related data—including characters, locations, events, and world rules—in a structured, queryable format. The system will feature an AI-powered assistant capable of generating prose, answering complex questions about the story world, and providing creative suggestions, all while maintaining strict narrative consistency.

### **1.3 Core Philosophy**

The system is designed to augment, not replace, the human author. Its primary function is to offload the cognitive burden of managing a complex fictional universe, thereby freeing the writer to focus on the uniquely human aspects of storytelling: creativity, emotional depth, and thematic resonance. The platform will act as a collaborative partner, ensuring logical rigor without stifling creative exploration.

### **1.4 Target Audience**

This document is intended for project managers, software architects, and development teams responsible for the design, implementation, and deployment of the Narrative Intelligence Platform.

## **2\. System Architecture & Technology Stack**

### **2.1 High-Level Architecture**

The platform will be a modern web application composed of four primary layers:

1. **Frontend (Writer's Cockpit):** An Angular-based single-page application (SPA) providing the user interface for all writing, world-building, and visualization tools.
2. **Backend (Narrative Engine):** A Python/FastAPI service layer that exposes a RESTful API, handles business logic, and orchestrates communication between the frontend, the knowledge graph, and the AI services.
3. **Data Layer (Knowledge Graph):** A native graph database serving as the central repository and single source of truth for all narrative data.
4. **AI Layer (Creative Co-Pilot):** A suite of services, orchestrated by the backend, that integrates Large Language Models (LLMs) for natural language processing, query generation, and content creation.

### **2.2 Recommended Technology Stack**

| Layer                | Technology                | Rationale                                                                                                                                                                                       |
| :------------------- | :------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**         | Angular                   | A robust, feature-rich framework for building complex single-page applications.                                                                                                                 |
| **Backend**          | Python 3.11+ with FastAPI | High-performance, asynchronous framework with excellent data validation capabilities via Pydantic. 1                                                                                            |
| **Data Layer**       | Neo4j                     | The leading native graph database, optimized for relationship-heavy data and complex traversals using the intuitive Cypher query language.                                                      |
| **AI Orchestration** | LangChain & LlamaIndex    | Python-native frameworks for building complex, data-aware LLM applications. LlamaIndex excels at data retrieval for RAG, while LangChain is ideal for overall workflow and agent orchestration. |
| **Data Pipelines**   | Prefect or Dagster        | Modern, Python-native workflow orchestration tools for automating data ingestion and processing tasks.                                                                                          |
| **Deployment**       | Docker / Docker Compose   | For containerizing services and ensuring consistent development and production environments. 1                                                                                                  |

## **3\. Core Data Layer Requirements (The Knowledge Graph)**

The heart of the platform is a knowledge graph that formally represents the story's universe.

### **3.1. Database System**

- **Requirement:** The system must use a native graph database that treats relationships as first-class citizens, ensuring high performance for deep traversal queries. 5
- **Recommendation:** **Neo4j** is the primary recommendation due to its maturity, extensive community support, and the Cypher query language.
- **Alternatives:** **ArangoDB** can be considered for its multi-model capabilities if storing unstructured documents alongside the graph is a key requirement.

### **3.2. Narrative Data Model**

- **Requirement:** The database schema must be designed around the principles of computational narratology, distinguishing between the _fabula_ and the _syuzhet_. 8
  - The **fabula** (the chronological, causal chain of all events) will be stored as the canonical truth within the graph. 9
  - The **syuzhet** (the narrative as presented to the reader) will be generated from queries against the fabula.
- **Requirement:** The graph shall model story elements as nodes and their interactions as relationships. Core node labels must include, but are not limited to: Character, Event, Location, Item, Faction, and Lore. 12

### **3.3. Ontology Management**

- **Requirement:** The system must support a formal ontology that defines the classes of entities, their properties, and the rules governing their interactions. This ontology serves as the world's "constitution" to enforce logical consistency. 13
- **Requirement:** An external tool shall be used to define and manage the ontology in a standard format (e.g., OWL 2).
- **Recommendation:** **Protégé**, a free, open-source ontology editor, is recommended for this purpose.

### **3.4. Version Control ("Scratch Space")**

- **Requirement:** The platform must provide a "scratch space" for creative experimentation. This shall be implemented using a version control system for the graph database, mirroring the functionality of Git. 17
- **Functional Requirements:**
  - **Branching:** Users must be able to create isolated branches of the main story graph to explore "what-if" scenarios.
  - **Committing:** Users must be able to save changes (new nodes, relationships, properties) as commits within a branch. 19
  - **Merging:** Users must be able to merge an experimental branch back into the main story branch, with a system for flagging and resolving any narrative contradictions.
  - **Diffing:** The system must be able to compute and display the differences between two branches or commits.
- **Implementation Note:** This can be achieved via tools like **lakeFS** or **RecallGraph** (for ArangoDB), or by implementing a versioning pattern within Neo4j itself (e.g., using linked lists or state nodes). 20

## **4\. Backend Service Requirements (FastAPI)**

The FastAPI backend will serve as the central nervous system of the platform.

### **4.1. API Endpoints**

- **Requirement:** The backend must expose a secure, RESTful API for all frontend operations.
- **Requirement:** Standard CRUD (Create, Read, Update, Delete) endpoints must be available for all core narrative entities (Characters, Locations, Items, Factions, Lore, Events, etc.).
- **Requirement:** Authentication will be handled via JWT tokens, with secure password hashing and an email-based recovery mechanism. 1

### **4.2. AI Orchestration Layer**

- **Requirement:** The backend must integrate with LLM orchestration frameworks to manage interactions with AI models.
- **Requirement:** A **Natural Language to Cypher (NL2Cypher)** pipeline must be implemented to allow users to query the knowledge graph in plain English. This pipeline must:
  - Dynamically retrieve the graph schema and inject it into the LLM prompt. 27
  - Utilize few-shot learning by providing examples of questions and correct Cypher queries. 29
  - Implement a self-correction loop to validate query syntax and re-prompt the LLM upon failure. 28
- **Requirement:** A **Graph-RAG (Retrieval-Augmented Generation)** pipeline must be implemented for content generation. This pipeline will query the knowledge graph for structured, factual context to ground the LLM's output, minimizing hallucinations.
- **Requirement:** The system must support the use of **Personality Vectors** to ensure character consistency. The backend will retrieve a character's personality vector from the graph and apply it to the LLM during dialogue or action generation.

### **4.3. Data Ingestion & Processing**

- **Requirement:** The platform must support automated pipelines for extracting entities and relationships from unstructured text (e.g., manuscripts, author notes) and populating the knowledge graph.
- **Recommendation:** A Python-native workflow orchestrator like **Prefect** or **Dagster** should be used to manage these data pipelines.

## **5\. Frontend Application Requirements (Angular)**

The frontend will be the primary interface for the writer, designed for a fluid and intuitive creative experience.

### **5.1. Core Interfaces**

- **World-Building Module:** A user-friendly interface for creating and editing all narrative entities (Characters, Locations, etc.) with customizable templates, similar to tools like Campfire. 31
- **Manuscript Editor:** A rich text editor for writing prose, with functionality to link text directly to entities in the knowledge graph.
- **Natural Language Query Interface:** A chat-like interface where the author can ask questions about their story world (e.g., "Who has Kaelen met in Silvergate?").

### **5.2. The Observatory: Visualization Dashboard**

- **Requirement:** The platform must include a dedicated dashboard for visualizing narrative structures and analytics. 5
- **Functional Requirements:** The dashboard must include the following interactive visualizations:
  - **Character Relationship Map:** A dynamic network graph showing characters as nodes and their relationships (e.g., ALLY, ENEMY, FAMILY) as edges.
  - **Event Timeline:** An interactive timeline plotting all major story events chronologically, allowing the user to zoom and filter.
  - **Narrative Momentum & Pacing Chart:** A chart that visualizes the story's pacing by analyzing metrics like scene length, action vs. exposition ratio, and sentence structure per chapter.
  - **Story Arc Infographic:** A visualization plotting the story's value shifts scene-by-scene against the core values of its genre, inspired by frameworks like the Story Grid.
- **Technology Recommendations:**
  - **JavaScript:** **D3.js** for bespoke visualizations, **Plotly.js** for standard charts, or a dedicated Neo4j library like **Neovis.js**.
  - **Python (for backend generation):** **Matplotlib**, **Seaborn**, **Plotly**, or **Bokeh** can generate static or interactive chart data to be rendered by the frontend.

## **6\. Non-Functional Requirements**

| Category            | Requirement                                                                                                                                                          |
| :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Performance**     | The graph database must scale to handle millions of nodes and relationships with query response times for typical traversals under 500ms.                            |
| **Usability**       | The user interface must be intuitive, responsive, and designed to minimize friction in the creative process. The learning curve for core features should be minimal. |
| **Scalability**     | The backend architecture must be stateless and horizontally scalable to handle multiple concurrent users and intensive AI processing tasks.                          |
| **Security**        | All API endpoints must be protected. User authentication and authorization must be implemented for all data-modifying operations.                                    |
| **Reliability**     | The system must be highly available, with automated backups of the knowledge graph to prevent data loss.                                                             |
| **Maintainability** | The codebase must be modular, well-documented, and include a comprehensive suite of unit and integration tests.                                                      |

#### **Works cited**

1. Full Stack FastAPI Template, accessed October 26, 2025, [https://fastapi.tiangolo.com/project-generation/](https://fastapi.tiangolo.com/project-generation/)
2. Building an Angular CRUD App with a FastAPI \- StackPuz Blog, accessed October 26, 2025, [https://blog.stackpuz.com/building-an-angular-crud-app-with-a-fastapi/](https://blog.stackpuz.com/building-an-angular-crud-app-with-a-fastapi/)
3. Okta Integration for Angular Single Page Application (SPA) and FastAPI Backend, accessed October 26, 2025, [https://verticalserve.medium.com/okta-integration-for-angular-single-page-application-spa-and-fastapi-backend-91e4bf3d588a](https://verticalserve.medium.com/okta-integration-for-angular-single-page-application-spa-and-fastapi-backend-91e4bf3d588a)
4. dirm02/course_explorer-fastapi_angular-: The test website using FastAPI, Angular and MongoDB \- GitHub, accessed October 26, 2025, [https://github.com/dirm02/course_explorer-fastapi_angular-](https://github.com/dirm02/course_explorer-fastapi_angular-)
5. Visualizing literary narratives with a graph-centered approach., accessed October 26, 2025, [https://knowledge.e.southern.edu/cgi/viewcontent.cgi?article=1215\&context=crd](https://knowledge.e.southern.edu/cgi/viewcontent.cgi?article=1215&context=crd)
6. A Unified Narrative for Query Processing in Graph Databases \- Semantic Scholar, accessed October 26, 2025, [https://www.semanticscholar.org/paper/A-Unified-Narrative-for-Query-Processing-in-Graph-Pang-Zou/4e63744a40f53b2ad32547d6fac0da2f14736bf1](https://www.semanticscholar.org/paper/A-Unified-Narrative-for-Query-Processing-in-Graph-Pang-Zou/4e63744a40f53b2ad32547d6fac0da2f14736bf1)
7. Graph Databases: New Opportunities For Connected Data, accessed October 26, 2025, [https://prod.rli.sas.ac.uk/760Y52Y/+TEXT/166Y8140Y3/Graph+Databases:+New+Opportunities+for+Connected+Data.pdf](https://prod.rli.sas.ac.uk/760Y52Y/+TEXT/166Y8140Y3/Graph+Databases:+New+Opportunities+for+Connected+Data.pdf)
8. Computational Narratology \- the living handbook of narratology, accessed October 26, 2025, [http://lhn.sub.uni-hamburg.de/index.php/Computational_Narratology.html](http://lhn.sub.uni-hamburg.de/index.php/Computational_Narratology.html)
9. (PDF) Formal Components of Narratives \- ResearchGate, accessed October 26, 2025, [https://www.researchgate.net/publication/315858275_Formal_Components_of_Narratives](https://www.researchgate.net/publication/315858275_Formal_Components_of_Narratives)
10. Steps Towards a Formal Ontology of Narratives Based on Narratology, accessed October 26, 2025, [https://d-nb.info/1365193373/34](https://d-nb.info/1365193373/34)
11. An Ontology for Creating Hypermedia Stories Over Knowledge Graphs \- CEUR-WS, accessed October 26, 2025, [https://ceur-ws.org/Vol-3540/paper5.pdf](https://ceur-ws.org/Vol-3540/paper5.pdf)
12. Simplified. A knowledge graph is a structured… | by ilya \- Medium, accessed October 26, 2025, [https://medium.com/@ilya0x/knowledge-graphs-simplified-321d6aa4507f](https://medium.com/@ilya0x/knowledge-graphs-simplified-321d6aa4507f)
13. University of Groningen Grounding the development of an ontology for narrative and fiction Scotti, Luca; Pianzola, Federico, accessed October 26, 2025, [https://research.rug.nl/files/1390728976/swj3880.pdf](https://research.rug.nl/files/1390728976/swj3880.pdf)
14. Grounding the development of an ontology for narrative and fiction \- Semantic Web Journal, accessed October 26, 2025, [https://www.semantic-web-journal.net/system/files/swj3880.pdf](https://www.semantic-web-journal.net/system/files/swj3880.pdf)
15. The GOLEM Ontology for Narrative and Fiction \- MDPI, accessed October 26, 2025, [https://www.mdpi.com/2076-0787/14/10/193](https://www.mdpi.com/2076-0787/14/10/193)
16. A Flexible Framework for the Creation of Narrative-Centered Tools \- DROPS, accessed October 26, 2025, [https://drops.dagstuhl.de/storage/01oasics/oasics-vol041-cmn2014/OASIcs.CMN.2014.130/OASIcs.CMN.2014.130.pdf](https://drops.dagstuhl.de/storage/01oasics/oasics-vol041-cmn2014/OASIcs.CMN.2014.130/OASIcs.CMN.2014.130.pdf)
17. Best Data Version Control Tools in 2025 \- lakeFS, accessed October 26, 2025, [https://lakefs.io/data-version-control/dvc-tools/](https://lakefs.io/data-version-control/dvc-tools/)
18. Data Version Control: What It Is and How It Works \[2025\] \- lakeFS, accessed October 26, 2025, [https://lakefs.io/data-version-control/](https://lakefs.io/data-version-control/)
19. RecallGraph/RecallGraph: A versioning data store for time-variant graph data. \- GitHub, accessed October 26, 2025, [https://github.com/RecallGraph/RecallGraph](https://github.com/RecallGraph/RecallGraph)
20. Versioning \- Getting Started \- Neo4j, accessed October 26, 2025, [https://neo4j.com/docs/getting-started/data-modeling/versioning/](https://neo4j.com/docs/getting-started/data-modeling/versioning/)
21. Neo4j Versioner Core Documentation \- GitHub Pages, accessed October 26, 2025, [https://h-omer.github.io/neo4j-versioner-core/](https://h-omer.github.io/neo4j-versioner-core/)
22. Cypher Versioning \- Graph Database & Analytics \- Neo4j, accessed October 26, 2025, [https://neo4j.com/blog/developer/cypher-versioning/](https://neo4j.com/blog/developer/cypher-versioning/)
23. Versioning \- Neo4j GraphQL Library, accessed October 26, 2025, [https://neo4j.com/docs/graphql/current/versioning/](https://neo4j.com/docs/graphql/current/versioning/)
24. Transforming Graph DBMS With Cypher API & Database Calendar Versioning \- Neo4j, accessed October 26, 2025, [https://neo4j.com/blog/developer/neo4j-graph-database-versioning/](https://neo4j.com/blog/developer/neo4j-graph-database-versioning/)
25. What's the best way to do time versioning of a neo4j node? \- Stack Overflow, accessed October 26, 2025, [https://stackoverflow.com/questions/64638711/whats-the-best-way-to-do-time-versioning-of-a-neo4j-node](https://stackoverflow.com/questions/64638711/whats-the-best-way-to-do-time-versioning-of-a-neo4j-node)
26. Developing a Single Page App with FastAPI and Vue.js \- TestDriven.io, accessed October 26, 2025, [https://testdriven.io/blog/developing-a-single-page-app-with-fastapi-and-vuejs/](https://testdriven.io/blog/developing-a-single-page-app-with-fastapi-and-vuejs/)
27. Natural Language Query Generation in NeoDash\! \- NeoDash \- Neo4j, accessed October 26, 2025, [https://neo4j.com/labs/neodash/2.3/user-guide/extensions/natural-language-queries/](https://neo4j.com/labs/neodash/2.3/user-guide/extensions/natural-language-queries/)
28. Text2Cypher \- Natural Language Queries \- NeoDash \- Neo4j, accessed October 26, 2025, [https://neo4j.com/labs/neodash/2.4/user-guide/extensions/natural-language-queries/](https://neo4j.com/labs/neodash/2.4/user-guide/extensions/natural-language-queries/)
29. Enterprise-grade natural language to SQL generation using LLMs ..., accessed October 26, 2025, [https://aws.amazon.com/blogs/machine-learning/enterprise-grade-natural-language-to-sql-generation-using-llms-balancing-accuracy-latency-and-scale/](https://aws.amazon.com/blogs/machine-learning/enterprise-grade-natural-language-to-sql-generation-using-llms-balancing-accuracy-latency-and-scale/)
30. NL-to-SQL Architecture Evolution \- Medium, accessed October 26, 2025, [https://medium.com/@genai_cybage_software/nl-to-sql-architecture-evolution-8c81dfcef8d3](https://medium.com/@genai_cybage_software/nl-to-sql-architecture-evolution-8c81dfcef8d3)
31. Comprehensive Worldbuilding Tools for Fiction Authors \- Campfire, accessed October 26, 2025, [https://www.campfirewriting.com/worldbuilding-tools](https://www.campfirewriting.com/worldbuilding-tools)
