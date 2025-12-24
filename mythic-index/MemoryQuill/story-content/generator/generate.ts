import fs from "fs";
import path from "path";
import axios from "axios";
import yaml from "js-yaml";
import { performance } from "perf_hooks";

// --- Configuration ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY in environment");
  process.exit(1);
}

// Assumes script is run from the 'generator' directory
const CHARACTERS_DIR = path.resolve(process.cwd(), "../characters");
const MASTER_CHARACTER_ART_DIRECTION_PATH = path.resolve(
  process.cwd(),
  "../core/08-character-art-direction.md"
);

const axiosClient = axios.create({
  baseURL: "https://api.openai.com/v1",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${OPENAI_API_KEY}`,
  },
  timeout: 120000, // 120s timeout for generation
});

// --- Helper Functions ---

async function readOptionalText(filePath: string): Promise<string> {
  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Finds a portrait image (jpg/png/webp) in the directory and returns it as a base64 string.
 */
async function getBase64Image(dirPath: string): Promise<string | null> {
  const extensions = ["png", "jpg", "jpeg", "webp"];
  for (const ext of extensions) {
    const probe = path.join(dirPath, `portrait.${ext}`);
    if (fs.existsSync(probe)) {
      console.log(`🖼️  Found character portrait: portrait.${ext}`);
      const data = await fs.promises.readFile(probe);
      const mime = ext === "jpg" ? "jpeg" : ext;
      return `data:image/${mime};base64,${data.toString("base64")}`;
    }
  }
  return null;
}

/**
 * Downloads an image URL and saves it to a local path.
 */
async function saveImageToDisk(url: string, savePath: string): Promise<void> {
  const writer = fs.createWriteStream(savePath);
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function saveBase64ToDisk(
  base64Data: string,
  savePath: string
): Promise<void> {
  const buffer = Buffer.from(base64Data, "base64");
  await fs.promises.writeFile(savePath, buffer);
}

function extractJson(text: string): string {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text;
}

// --- Core Logic ---

async function getOptimization(
  characterName: string,
  ideaTitle: string,
  context: string,
  base64Image: string | null
): Promise<{ prompt: string; size: string; filename: string }> {
  console.log(`🧠 GPT-4o analyzing scene: "${ideaTitle}"...`);

  const userContent: any[] = [
    {
      type: "text",
      text: `Character: ${characterName}\n\nScene Idea: ${ideaTitle}\n\nContext:\n${context}`,
    },
  ];

  if (base64Image) {
    userContent.push({
      type: "image_url",
      image_url: { url: base64Image, detail: "high" },
    });
  }

  const start = performance.now();
  const response = await axiosClient.post("/chat/completions", {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert fantasy illustration art director.

You will be given:
- A MASTER character art direction document (the global style bible).
- Optional per-character image_style.yaml overrides.
- The character profile and development notes.
- A GOLDEN CHARACTER DESCRIPTION that MUST be used verbatim.
- A scene idea to depict.

Your job is to produce a prompt for "gpt-image-1.5" that matches the MASTER style bible, and an appropriate image size.

Rules (strict):
1) The result must read as grounded D&D / fantasy, not modern photography.
2) Start the prompt with the art style declaration (oil painting + lighting + palette + finish).
3) Use the provided "GOLDEN CHARACTER DESCRIPTION" verbatim for the character’s identity (do not paraphrase).
4) Enforce the MASTER "Negative Prompt Core" by adding an explicit "Avoid: ..." clause in the prompt.
5) Include at least two fantasy grounding signifiers (wards/sigils, practical magic infrastructure, alchemical seals, mixed ancestries, heraldry, etc.), unless the scene explicitly forbids them.
6) Never use camera/photography language (DSLR, 35mm, bokeh, studio portrait, 8k, fashion editorial).
7) Choose the best aspect ratio strictly from: "1024x1024", "1024x1536" (portrait), or "1536x1024" (landscape).
8) Generate a filename that is safe: lowercase, underscores, ends in .png, and describes the scene.

Return JSON ONLY:
        {
          "prompt": "...",
          "size": "...",
          "filename": "..."
        }`,
      },
      { role: "user", content: userContent },
    ],
    max_tokens: 4000,
  });

  console.log(`⏱️  Analysis took ${(performance.now() - start).toFixed(0)}ms`);

  try {
    const raw = extractJson(response.data.choices[0].message.content);
    return JSON.parse(raw);
  } catch (err) {
    console.error(
      "❌ Failed to parse GPT-4o response:",
      response.data.choices[0].message.content
    );
    throw err;
  }
}

async function generateWithGptImage15(
  prompt: string,
  size: string
): Promise<string | null> {
  console.log(`🎨 Generating with gpt-image-1.5 (${size})...`);
  try {
    const response = await axiosClient.post("/images/generations", {
      model: "gpt-image-1.5",
      prompt: prompt,
      n: 1,
      size: size,
    });
    return response.data.data[0].b64_json;
  } catch (err: any) {
    console.error("❌ Generation failed:", err.response?.data || err.message);
    return null;
  }
}

// --- Main Pipeline ---

async function processCharacter(characterName: string) {
  const log = (msg: string) => console.log(`[${characterName}] ${msg}`);
  const error = (msg: string) => console.error(`[${characterName}] ${msg}`);

  const charDir = path.join(CHARACTERS_DIR, characterName);

  // 1. Setup Paths
  const paths = {
    profile: path.join(charDir, "profile.md"),
    development: path.join(charDir, "development.md"),
    ideas: path.join(charDir, "image-ideas.yaml"),
    imagery: path.join(charDir, "imagery.yaml"),
    imageStyle: path.join(charDir, "image_style.yaml"),
    outputDir: path.join(charDir, "generated_images"), // Logical place for images
  };

  if (!fs.existsSync(paths.ideas)) {
    // error(`⚠️  No image-ideas.yaml found`);
    return;
  }

  // 2. Ensure Output Directory
  if (!fs.existsSync(paths.outputDir)) {
    fs.mkdirSync(paths.outputDir, { recursive: true });
  }

  // 3. Load Data
  log(`📂 Loading data...`);
  const profile = fs.existsSync(paths.profile)
    ? await fs.promises.readFile(paths.profile, "utf-8")
    : "";
  const dev = fs.existsSync(paths.development)
    ? await fs.promises.readFile(paths.development, "utf-8")
    : "";
  const imagery = fs.existsSync(paths.imagery)
    ? await fs.promises.readFile(paths.imagery, "utf-8")
    : "";
  const masterArtDirection = await readOptionalText(
    MASTER_CHARACTER_ART_DIRECTION_PATH
  );
  const imageStyle = await readOptionalText(paths.imageStyle);
  const ideasYaml: any = yaml.load(
    await fs.promises.readFile(paths.ideas, "utf-8")
  );
  const portraitBase64 = await getBase64Image(charDir);

  // 3b. Generate Golden Character Description
  log(
    `✨ Generating 'Golden Character Description' for consistency...`
  );
  let goldenDescription = "";
  try {
    const goldenDescResponse = await axiosClient.post("/chat/completions", {
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert character designer. 
        Analyze the provided context (especially 'imagery.yaml') and portrait. Create a COMPACT, HIGHLY VISUAL description of the character (physical appearance, outfit, key details) that blends the text description with the visual specifics of the portrait.
        Do NOT include actions or expressions. Focus ONLY on visual identity to ensure consistency across multiple generations.
        Example: "A short, sturdy rock gnome female with unruly copper-red hair streaked with blue. She wears heavy oil-stained dark leather workwear with brass buckles. Her left arm is a complex brass prosthetic with visible gears and glowing blue conduits. She wears brass tinkerer goggles on her forehead."`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `MASTER CHARACTER ART DIRECTION:\n${masterArtDirection}\n\nCHARACTER IMAGE STYLE OVERRIDES (optional):\n${imageStyle}\n\nCharacter: ${characterName}\n\nContext:\n${profile}\n\n${imagery}`,
            },
            ...(portraitBase64
              ? [
                  {
                    type: "image_url",
                    image_url: { url: portraitBase64, detail: "high" },
                  },
                ]
              : []),
          ],
        },
      ],
      max_tokens: 300,
    });
    goldenDescription =
      goldenDescResponse.data.choices[0].message.content.trim();
    log(`🔒 Golden Description Locked`);
  } catch (err: any) {
    error(`❌ Failed to generate golden description: ${err.message}`);
    return;
  }

  const scenes = ideasYaml.scenes || [];
  if (scenes.length === 0) {
    log("⚠️  No scenes found in YAML.");
    return;
  }

  // 4. Iterate Ideas
  for (const idea of scenes) {
    log(`🔹 Processing: ${idea.title}`);

    // Step A: Optimize Prompt & Filename
    const context = `MASTER CHARACTER ART DIRECTION:\n${masterArtDirection}\n\nCHARACTER IMAGE STYLE OVERRIDES (optional):\n${imageStyle}\n\n${profile}\n\n${dev}\n\nImagery/Style Guide:\n${imagery}\n\nGOLDEN CHARACTER DESCRIPTION (MUST BE USED VERBATIM):\n${goldenDescription}\n\nIdea Description: ${
      idea.scene || ""
    }`;
    
    let optimization;
    try {
      optimization = await getOptimization(
        characterName,
        idea.title,
        context,
        portraitBase64
      );
    } catch (err) {
      error(`Skipping scene due to optimization error`);
      continue;
    }

    const { prompt, size, filename } = optimization;

    // Ensure filename ends in .png
    const safeFilename = filename.endsWith(".png")
      ? filename
      : `${filename}.png`;
    const outputPath = path.join(paths.outputDir, safeFilename);

    if (fs.existsSync(outputPath)) {
      log(`⏭️  Skipping (File exists: ${safeFilename})`);
      continue;
    }

    // Step B: Generate
    try {
      log(`🎨 Generating ${size}...`);
      const imageData = await generateWithGptImage15(prompt, size);

      // Step C: Save
      if (imageData) {
        log(`💾 Saving to ${safeFilename}...`);
        await saveBase64ToDisk(imageData, outputPath);
        log(`✅ Success!`);

        await fs.promises.writeFile(
          outputPath.replace(".png", ".json"),
          JSON.stringify({ prompt, size, original_idea: idea }, null, 2)
        );
      }
    } catch (err: any) {
      error(`❌ Generation failed for ${safeFilename}: ${err.message}`);
    }
  }
}

// --- Entry Point ---
const args = process.argv.slice(2);
const CONCURRENCY = 4; // Default concurrency

async function main() {
  if (args.length < 1) {
    console.error("❌ Usage: npx ts-node script.ts <CharacterName> OR 'ALL'");
    process.exit(1);
  }

  let targets: string[] = [];

  if (args[0] === 'ALL') {
    const entries = await fs.promises.readdir(CHARACTERS_DIR, { withFileTypes: true });
    targets = entries
      .filter(dirent => {
        if (!dirent.isDirectory()) return false;
        const ideasPath = path.join(CHARACTERS_DIR, dirent.name, "image-ideas.yaml");
        return fs.existsSync(ideasPath);
      })
      .map(dirent => dirent.name);
    console.log(`🚀 Found ${targets.length} characters to process.`);
  } else {
    targets = args;
  }

  // Simple concurrency queue
  const executing: Promise<void>[] = [];

  for (const charName of targets) {
    const p = processCharacter(charName).then(() => {
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);

    if (executing.length >= CONCURRENCY) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  console.log("🏁 Batch processing complete.");
}

main().catch(console.error);
