import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { interpretMarkdown } from "./lib/rendered-markdown.mjs";
import { resolvedLocalPath } from "./lib/local-markdown-links.mjs";
import {
  glossaryCorrections,
  glossaryTerms,
  isOneSentence,
  readmeDescriptionBlock,
} from "./lib/entry-document.mjs";

const resultFormat = "repo-standards/result/v2";
const recognizedSections = [
  "Installation",
  "Features",
  "Usage",
  "Configuration",
  "Documentation",
  "Contributing",
  "License",
];

function failProcess(message) {
  throw new Error(message);
}

function readRequest() {
  let request;
  try {
    request = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    failProcess("Operation input must be one JSON object.");
  }
  if (request?.format !== "repo-standards/operation/v2") {
    failProcess(
      "Unsupported operation input format; expected repo-standards/operation/v2.",
    );
  }
  if (request.operation?.phase !== "checks") {
    failProcess("Repository README validation must run as a checks operation.");
  }
  const { paths, directories } = request.allowedTargets ?? {};
  if (
    !Array.isArray(paths) ||
    paths.length !== 1 ||
    paths[0] !== "README.md" ||
    !Array.isArray(directories) ||
    directories.length !== 0
  ) {
    failProcess(
      "Repository README validation requires the exact README.md target and no directory targets.",
    );
  }
  if (
    typeof request.projectRoot !== "string" ||
    request.projectRoot.length === 0
  ) {
    failProcess("Operation input must identify the project root.");
  }
  return request;
}

function result(status, message) {
  process.stdout.write(
    `${JSON.stringify({ format: resultFormat, status, message })}\n`,
  );
}

function rootLicense(projectRoot) {
  const candidates = readdirSync(projectRoot, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && /^license(?:[._-].+)?$/i.test(entry.name),
    )
    .map((entry) => entry.name);
  if (!candidates.includes("LICENSE")) {
    const detail =
      candidates.length > 0
        ? ` Found ${candidates.sort().join(", ")} instead.`
        : "";
    return {
      blocked: `No root LICENSE file was found; identify the repository license and use the required filename.${detail}`,
    };
  }
  if (candidates.length > 1) {
    return {
      blocked: `Multiple root LICENSE variants were found (${candidates.sort().join(", ")}); identify which license applies and keep it in LICENSE.`,
    };
  }

  const path = "LICENSE";
  if (!readFileSync(join(projectRoot, path), "utf8").trim()) {
    return {
      blocked: `${path} is empty and does not establish repository licensing.`,
    };
  }
  return { path };
}

function sectionBody(allHeadings, name) {
  const index = allHeadings.findIndex(
    (heading) => heading.folded === name.toLocaleLowerCase("en-US"),
  );
  if (index < 0) return null;
  return allHeadings[index].body;
}

// A pointer section renders exactly one link, not wrapping an image. Every
// block the section keeps therefore holds that link, and they must be one
// paragraph, which may be wrapped in divs: the link is not outside a paragraph
// or inside a list, quotation, table, or other block. HTML parsing can nest a
// block inside a paragraph, for example through a button, so the paragraph
// must hold no block of its own.
function singleLink(body) {
  if (body.elements.length !== 1 || body.elements[0].type !== "link")
    return null;
  const [link] = body.elements;
  let blocks = body.blocks;
  while (blocks.length === 1 && blocks[0].tag === "div")
    blocks = blocks[0].blocks;
  const inParagraph =
    blocks.length === 1 &&
    blocks[0].tag === "p" &&
    blocks[0].blocks.length === 0;
  return !link.containsMedia && inParagraph ? link : null;
}

function checkPointerSection(
  projectRoot,
  allHeadings,
  section,
  target,
  corrections,
) {
  const body = sectionBody(allHeadings, section);
  const targetExists = lstatIsFile(join(projectRoot, target));
  if (body === null) {
    if (targetExists)
      corrections.push(
        `Add a ${section} section containing only a link to ${target}.`,
      );
    return;
  }
  const link = singleLink(body);
  if (!link || resolvedLocalPath("README.md", link.target) !== target) {
    corrections.push(
      targetExists
        ? `Make the ${section} section contain only a link to ${target}.`
        : `Make the ${section} section contain only a link to ${target} and create ${target}, or remove the section.`,
    );
  } else if (!link.text) {
    corrections.push(`Name the ${section} link.`);
  }
}

// Links remain single semantic elements for existing consumers; their children
// expose the images they wrap. Stop at the first non-image rendered content.
function headerBadges(document, description) {
  if (!description) return [];
  const elements = document.content.elements;
  const start = elements.indexOf(description.elements.at(-1)) + 1;
  const badges = [];
  for (const element of elements.slice(start)) {
    const images = element.type === "link" ? element.elements : [element];
    if (!images.length || images.some((image) => image.type !== "image")) break;
    badges.push(...images);
  }
  return badges;
}

function headerPrefixElements(elements, seen = new Set()) {
  const grouped = [];
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    if (element.wrapsHeading || seen.has(element)) continue;
    seen.add(element);
    if (element.type === "link") {
      grouped.push(...headerPrefixElements(element.elements, seen));
    } else if (
      element.tag === "picture" &&
      element.elements.length === 1 &&
      element.elements[0].type === "image" &&
      element.elements[0].target.trim()
    ) {
      const image = element.elements[0];
      seen.add(image);
      grouped.push({ ...image, centered: image.centered || element.centered });
      index += element.elements.length;
    } else {
      grouped.push(element);
    }
  }
  return grouped;
}

function checkHeaderPrefix(document, corrections) {
  const elements = document.content.elements;
  const titleIndex = elements.findIndex(
    (element) => element.type === "heading" && element.level === 1,
  );
  if (titleIndex < 0) return;
  const prefix = headerPrefixElements(elements.slice(0, titleIndex));
  const images = prefix.filter((element) => element.type === "image");
  if (images.length > 1) {
    corrections.push(
      `Keep at most one project image before the Repository README title; found ${images.map((image) => `"${image.target}"`).join(", ")}.`,
    );
  }
  for (const element of prefix) {
    if (element.type === "image" && !element.centered) {
      corrections.push(
        `Center the Repository README project image "${element.target}" before its title.`,
      );
    } else if (element.type !== "image") {
      const detail = element.text?.trim() || element.tag || element.type;
      corrections.push(
        `Remove rendered content "${detail}" before the Repository README title; only one optional centered project image may precede it.`,
      );
    }
  }
}

function checkStructure(projectRoot, markdown, license) {
  if (markdown === null) return ["Create the root README.md."];
  const corrections = [];
  const document = interpretMarkdown(markdown);
  checkHeaderPrefix(document, corrections);
  const parsedHeadings = document.headings;
  const title = parsedHeadings.find((heading) => heading.level === 1) ?? null;
  const descriptionBlock = readmeDescriptionBlock(document);
  const description = descriptionBlock?.text ?? null;
  if (description === null || !isOneSentence(description)) {
    corrections.push(
      "Make the Repository README description after its title one sentence.",
    );
  }
  if (descriptionBlock && !descriptionBlock.centered) {
    corrections.push("Center the Repository README description paragraph.");
  }
  if (description !== null) {
    corrections.push(
      ...glossaryCorrections(description, glossaryTerms(projectRoot)).map(
        (correction) => `Repository README description: ${correction}`,
      ),
    );
  }
  if (!title?.centered) {
    corrections.push(
      "Center the Repository README title in a nonempty HTML h1 or a centered block.",
    );
  }

  if (
    headerBadges(document, descriptionBlock).some((badge) => !badge.centered)
  ) {
    corrections.push(
      "Center the Repository README badges after its description.",
    );
  }

  const allHeadings = parsedHeadings.filter((heading) => heading !== title);
  const recognized = allHeadings.filter((heading) =>
    recognizedSections.some(
      (name) => name.toLocaleLowerCase("en-US") === heading.folded,
    ),
  );
  for (const section of recognizedSections) {
    const occurrences = recognized.filter(
      (heading) => heading.folded === section.toLocaleLowerCase("en-US"),
    );
    if (occurrences.length > 1)
      corrections.push(`Keep only one ${section} section.`);
  }
  let previous = null;
  for (const heading of recognized) {
    const current = recognizedSections.findIndex(
      (name) => name.toLocaleLowerCase("en-US") === heading.folded,
    );
    if (previous && current < previous.position) {
      corrections.push(
        `Move ${recognizedSections[current]} before ${recognizedSections[previous.position]}.`,
      );
      break;
    }
    previous = { position: current, heading };
  }
  const installation = allHeadings.find(
    (heading) => heading.folded === "installation",
  );
  if (installation && allHeadings[0] !== installation) {
    corrections.push(
      `Move Installation before ${allHeadings[0].name}; it is the first section when present.`,
    );
  }

  checkPointerSection(
    projectRoot,
    allHeadings,
    "Contributing",
    "CONTRIBUTING.md",
    corrections,
  );
  checkPointerSection(
    projectRoot,
    allHeadings,
    "Documentation",
    "docs/README.md",
    corrections,
  );

  const licenseBody = sectionBody(allHeadings, "License");
  if (license && licenseBody === null) {
    corrections.push(
      `Add a License section containing only [actual license name](${license.path}).`,
    );
  } else if (license) {
    const link = singleLink(licenseBody);
    if (!link) {
      corrections.push(
        "Make the License section contain only the license link.",
      );
    } else {
      if (!link.text)
        corrections.push(
          "Name the License link for the actual repository license.",
        );
      if (resolvedLocalPath("README.md", link.target) !== license.path)
        corrections.push(`Make the License link target ${license.path}.`);
    }
  }
  return [...new Set(corrections)];
}

function lstatIsFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

try {
  const request = readRequest();
  const readmePath = join(request.projectRoot, "README.md");
  const markdown = lstatIsFile(readmePath)
    ? readFileSync(readmePath, "utf8")
    : null;
  const license = rootLicense(request.projectRoot);
  const corrections = checkStructure(
    request.projectRoot,
    markdown,
    license.blocked ? null : license,
  );
  if (license.blocked) {
    const otherCorrections =
      corrections.length > 0
        ? ` Other structural corrections: ${corrections.join(" ")}`
        : "";
    result(
      "blocked",
      `Owner clarification required: ${license.blocked}${otherCorrections}`,
    );
  } else {
    result(
      corrections.length === 0 ? "passed" : "failed",
      corrections.length === 0
        ? "Repository README structure is valid; factual content still requires maintainer or agent review."
        : `Repository README structure needs correction: ${corrections.join(" ")}`,
    );
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
