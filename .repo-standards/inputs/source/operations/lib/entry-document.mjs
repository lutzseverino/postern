import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { marked } from "../../vendor/marked/marked.esm.js";
import { interpretMarkdown } from "./rendered-markdown.mjs";
import { localPathExists, resolvedLocalPath } from "./local-markdown-links.mjs";

const sentenceEnd = /[.!?]["'\u2019\u201d)\]]*$/u;
const sentenceBoundary =
  /[.!?]["'\u2019\u201d)\]]*\s+["'\u2018\u201c([]*\p{Lu}/u;

// The same deterministic sentence rule applies to descriptions and index
// purposes: terminal punctuation, with no internal end before a capitalized word.
export function isOneSentence(text) {
  return sentenceEnd.test(text) && !sentenceBoundary.test(text);
}

// Centered README introductions can wrap their title and paragraphs in divs.
// Only flatten those wrappers; examples, lists and quotations are not intros.
export function readmeDescriptionBlock(document) {
  const flatten = (blocks) =>
    blocks.flatMap((block) =>
      block.tag === "div" ? flatten(block.blocks) : [block],
    );
  const blocks = flatten(document.blocks);
  const title = blocks.findIndex((block) => block.tag === "h1");
  return title >= 0 && blocks[title + 1]?.tag === "p"
    ? blocks[title + 1]
    : null;
}

export function readmeDescription(document) {
  return readmeDescriptionBlock(document)?.text ?? null;
}

function optionalMarkdown(projectRoot, path) {
  try {
    return readFileSync(join(projectRoot, path), "utf8");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

// The domain-modeling glossary format defines a term as **Term**: at the
// start of a paragraph; definitions, Avoid lists and code are not terms.
export function glossaryTerms(projectRoot) {
  const paths = new Set(["GLOSSARY.md"]);
  const map = optionalMarkdown(projectRoot, "GLOSSARY-MAP.md");
  if (map !== null) {
    const contexts =
      interpretMarkdown(map).sections(["Contexts"]).get("contexts") ?? [];
    for (const section of contexts) {
      for (const element of section.content.elements) {
        if (element.type !== "link") continue;
        const path = resolvedLocalPath("GLOSSARY-MAP.md", element.target);
        if (
          typeof path === "string" &&
          posix.basename(path) === "GLOSSARY.md" &&
          localPathExists(projectRoot, path)
        ) {
          paths.add(path);
        }
      }
    }
  }
  return [...paths].flatMap((glossary) => {
    const source = optionalMarkdown(projectRoot, glossary);
    if (source === null) return [];
    return marked.lexer(source).flatMap((token) => {
      if (token.type !== "paragraph") return [];
      const [name, definition] = token.tokens ?? [];
      if (name?.type !== "strong" || !/^:\s/.test(definition?.text ?? ""))
        return [];
      const term = (interpretMarkdown(name.raw).blocks[0]?.text ?? "")
        .replace(/\s+/g, " ")
        .trim();
      return term ? [{ term, glossary }] : [];
    });
  });
}

// A term is bounded by the text's ends, whitespace, or punctuation other than
// a hyphen, so the hyphen-joined on-demand does not contain Demand.
const termBoundary = String.raw`^|$|\s|(?![-\u2010\u2011])\p{P}`;

export function glossaryCorrections(text, terms) {
  const normalized = text.replace(/\s+/g, " ");
  return terms.flatMap(({ term, glossary }) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wholeWord = new RegExp(
      `(?<=${termBoundary})${escaped}(?=${termBoundary})`,
      "iu",
    );
    return wholeWord.test(normalized)
      ? [`remove the glossary term "${term}" defined in ${glossary}.`]
      : [];
  });
}
