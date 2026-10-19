import { randomUUID } from "node:crypto";
import { marked, Renderer } from "../../vendor/marked/marked.esm.js";
import { parseFragment } from "../../vendor/parse5/parse5.esm.js";

const blockElements = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "details",
  "dialog",
  "div",
  "dl",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
]);
const codeElements = new Set(["code", "pre"]);
const renderedElementsWithoutText = new Set([
  "audio",
  "canvas",
  "embed",
  "hr",
  "iframe",
  "img",
  "input",
  "math",
  "object",
  "picture",
  "svg",
  "video",
]);
const defaultNonRenderedElements = new Set(["script", "style", "template"]);

function attribute(node, name) {
  return (
    node.attrs?.find((candidate) => candidate.name === name)?.value ?? null
  );
}

function visibility(additionalNonRenderedElements) {
  const nonRenderedElements = new Set([
    ...defaultNonRenderedElements,
    ...(additionalNonRenderedElements ?? []),
  ]);
  return (node) =>
    nonRenderedElements.has(node.tagName) || attribute(node, "hidden") !== null;
}

function renderedText(node, isHidden) {
  if (node.nodeName === "#text") return node.value;
  if (isHidden(node)) return "";
  if (node.tagName === "img") return attribute(node, "alt") ?? "";
  return (node.childNodes ?? [])
    .map((child) => renderedText(child, isHidden))
    .join("");
}

function containsHeading(node, isHidden) {
  if (isHidden(node)) return false;
  return (node.childNodes ?? []).some(
    (child) =>
      /^h[1-6]$/.test(child.tagName) || containsHeading(child, isHidden),
  );
}

function containsMedia(node, isHidden) {
  return (node.childNodes ?? []).some(
    (child) =>
      !isHidden(child) &&
      (renderedElementsWithoutText.has(child.tagName) ||
        containsMedia(child, isHidden)),
  );
}

// An anchor opened in a paragraph and closed after a heading is split by HTML
// parsing into an empty anchor followed by one that wraps or sits inside the
// heading. The empty remainder belongs to that heading, not to the section
// before it.
function followingHeadingLinks(elements, index) {
  const next = elements[index + 1];
  if (next?.wrapsHeading) return [next];
  if (next?.type !== "heading") return [];
  const links = [];
  for (const candidate of elements.slice(index + 2)) {
    if (!candidate.insideHeading) break;
    if (candidate.type === "link") links.push(candidate);
  }
  return links;
}

function attachSplitHeadingAnchors(elements) {
  elements.forEach((element, index) => {
    if (element.type !== "link" || element.text || element.containsMedia)
      return;
    if (
      followingHeadingLinks(elements, index).some(
        (link) => link.target === element.target,
      )
    ) {
      element.wrapsHeading = true;
    }
  });
  return elements;
}

// When given spans, records each visited node's half-open range of the
// elements it produced, so that a heading's section can tell which blocks hold
// its content.
function semanticElements(
  fragment,
  isHidden,
  markdownHeadingMarker,
  spans = null,
) {
  const elements = [];
  const visitTargets = (node) => {
    if (isHidden(node)) return;
    if (node.tagName === "a") {
      elements.push({
        type: "link",
        text: renderedText(node, isHidden).trim(),
        target: attribute(node, "href") ?? "",
        containsMedia: containsMedia(node, isHidden),
        insideHeading: true,
      });
    } else if (node.tagName === "img") {
      elements.push({
        type: "image",
        text: attribute(node, "alt") ?? "",
        target: attribute(node, "src") ?? "",
        insideHeading: true,
      });
      return;
    }
    for (const child of node.childNodes ?? []) visitTargets(child);
  };
  const visit = (node, centered = false) => {
    const first = elements.length;
    visitNode(node, centered);
    spans?.set(node, [first, elements.length]);
  };
  const visitNode = (node, centered) => {
    if (isHidden(node)) return;
    if (node.nodeName === "#text") {
      if (node.value.trim()) elements.push({ type: "text", text: node.value });
      return;
    }

    const ownCenter =
      attribute(node, "align")?.toLocaleLowerCase("en-US") === "center";
    if (/^h[1-6]$/.test(node.tagName)) {
      const text = renderedText(node, isHidden).trim();
      if (text)
        elements.push({
          type: "heading",
          level: Number(node.tagName[1]),
          name: text,
          text,
          centered: ownCenter || centered,
          folded: text.toLocaleLowerCase("en-US"),
          source:
            attribute(node, "data-repo-canon-markdown-heading") ===
            markdownHeadingMarker
              ? "markdown"
              : "html",
        });
      for (const child of node.childNodes ?? []) visitTargets(child);
      return;
    }
    // An anchor without href, such as a named target, is not a hyperlink; only
    // its rendered children count as content.
    if (node.tagName === "a" && attribute(node, "href") !== null) {
      const link = {
        type: "link",
        text: renderedText(node, isHidden).trim(),
        target: attribute(node, "href"),
        containsMedia: containsMedia(node, isHidden),
      };
      if (!containsHeading(node, isHidden)) {
        elements.push(link);
        return;
      }
      elements.push({ ...link, wrapsHeading: true });
      for (const child of node.childNodes ?? []) visit(child, centered);
      return;
    }
    if (node.tagName === "img") {
      elements.push({
        type: "image",
        text: attribute(node, "alt") ?? "",
        target: attribute(node, "src") ?? "",
      });
      return;
    }
    if (renderedElementsWithoutText.has(node.tagName))
      elements.push({ type: "content" });
    const insideCenter = centered || (node.tagName === "div" && ownCenter);
    for (const child of node.childNodes ?? []) visit(child, insideCenter);
  };
  visit(fragment);
  return attachSplitHeadingAnchors(elements);
}

// An element belongs to a heading's section body when it belongs to no heading.
function inSectionBody(element) {
  return !element.insideHeading && !element.wrapsHeading;
}

// The blocks of a heading's section. A block belongs to the section when it
// holds one of the section's elements, and lists the links among them at any
// depth. Its text is what renders between start and end, so a block that also
// holds a heading or another section keeps only this section's part.
function sectionBlocks({ fragment, elements, spans, isHidden }, start, end) {
  const bodyBefore = [0];
  for (let index = start; index < end; index += 1) {
    bodyBefore.push(
      bodyBefore.at(-1) + (inSectionBody(elements[index]) ? 1 : 0),
    );
  }
  const bodyUntil = (index) =>
    bodyBefore[Math.min(Math.max(index, start), end) - start];
  const holdsBody = ([first, last]) => bodyUntil(last) > bodyUntil(first);
  const text = (node) => {
    const span = spans.get(node);
    if (!span) return "";
    if (span[0] >= start && span[1] <= end) return renderedText(node, isHidden);
    if (span[1] <= start || span[0] >= end) return "";
    return (node.childNodes ?? []).map(text).join("");
  };
  const blocks = (node) =>
    (node.childNodes ?? []).flatMap((child) => {
      const span = spans.get(child);
      if (!span || !holdsBody(span)) return [];
      if (!blockElements.has(child.tagName)) return blocks(child);
      return [
        {
          tag: child.tagName,
          text: text(child).trim(),
          links: elements
            .slice(Math.max(span[0], start), Math.min(span[1], end))
            .filter(
              (element) => element.type === "link" && inSectionBody(element),
            ),
          blocks: blocks(child),
        },
      ];
    });
  return blocks(fragment);
}

function renderedContent(
  fragment,
  isHidden,
  markdownHeadingMarker,
  spans = null,
) {
  const elements = semanticElements(
    fragment,
    isHidden,
    markdownHeadingMarker,
    spans,
  );
  return {
    elements,
    hasContent: elements.length > 0,
    text({
      includeCode = true,
      includeKeyboardInput = includeCode,
      includeImageAlt = true,
      includeLinkTargets = false,
      blockBreaks = false,
    } = {}) {
      const links = [];
      const fragments = [];
      let text = "";
      const append = (value) => {
        if (includeLinkTargets) fragments.push(value);
        else text += value;
      };
      const stack = [{ node: fragment, closing: false }];
      while (stack.length) {
        const { node, closing } = stack.pop();
        if (closing) {
          append("\n");
          continue;
        }
        if (node.nodeName === "#comment") continue;
        if (node.nodeName === "#text") {
          append(node.value);
          continue;
        }
        if (
          isHidden(node) ||
          (!includeCode && codeElements.has(node.tagName)) ||
          (!includeKeyboardInput && node.tagName === "kbd")
        )
          continue;
        if (node.tagName === "a") {
          const href = attribute(node, "href");
          if (href) {
            links.push(href);
            if (includeLinkTargets) fragments.push(href);
          }
        }
        if (includeImageAlt && node.tagName === "img")
          append(attribute(node, "alt") ?? "");
        if (blockBreaks && node.tagName === "br") append("\n");
        if (blockBreaks && blockElements.has(node.tagName))
          stack.push({ node, closing: true });
        const children = node.childNodes ?? [];
        for (let index = children.length - 1; index >= 0; index -= 1) {
          stack.push({ node: children[index], closing: false });
        }
      }
      return { text: includeLinkTargets ? fragments.join("\n") : text, links };
    },
  };
}

export function markdownInlineText(tokens) {
  return (tokens ?? [])
    .map((token) => {
      if (token.type === "html") return "";
      if (token.type === "codespan") return token.text;
      if (token.tokens) return markdownInlineText(token.tokens);
      return typeof token.text === "string" ? token.text : "";
    })
    .join("");
}

function normalizedHeadingName(value, stripTrailingColon) {
  let normalized = value
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
  if (stripTrailingColon) normalized = normalized.replace(/:\s*$/, "").trim();
  return normalized.toLocaleLowerCase("en-US");
}

// Marked normalizes line endings in each token's raw text, so tokens are
// located in the Markdown with normalized line endings, and each index refers
// to that text.
export function markdownTokenSpans(markdown, tokens) {
  const source = markdown.replace(/\r\n?/g, "\n");
  let cursor = 0;
  return (tokens ?? marked.lexer(source)).map((token) => {
    const index = source.indexOf(token.raw, cursor);
    if (index === -1)
      throw new Error(
        `Could not locate parsed Markdown token after offset ${cursor}.`,
      );
    cursor = index + token.raw.length;
    return { token, index };
  });
}

function headingName(token, nameSource, isHidden) {
  if (nameSource === "markdown") return markdownInlineText(token.tokens);
  const fragment = parseFragment(marked.Parser.parseInline(token.tokens));
  return renderedContent(fragment, isHidden, null).text({ blockBreaks: true })
    .text;
}

function sectionMap(
  markdown,
  tokens,
  names,
  options,
  renderTokens,
  renderMarkdown,
  isHidden,
) {
  const accepted = new Set(
    [...names].map((name) =>
      normalizedHeadingName(name, options.stripTrailingColon),
    ),
  );
  const sections = new Map();
  const record = (key, value) => {
    const occurrences = sections.get(key) ?? [];
    occurrences.push(value);
    sections.set(key, occurrences);
  };
  const keyFor = (token) =>
    normalizedHeadingName(
      headingName(token, options.nameSource, isHidden),
      options.stripTrailingColon,
    );

  if (options.hierarchy === "matching") {
    let current = null;
    for (const token of tokens) {
      if (token.type === "heading") {
        const key = keyFor(token);
        if (!accepted.has(key)) {
          if (!current || token.depth <= current.level) current = null;
          continue;
        }
        current = { key, level: token.depth, tokens: [] };
        record(key, current);
        continue;
      }
      if (current) current.tokens.push(token);
    }
    for (const occurrences of sections.values()) {
      for (const section of occurrences) {
        section.source = section.tokens.map((token) => token.raw).join("");
        section.content = renderTokens(section.tokens);
        delete section.tokens;
      }
    }
    return sections;
  }

  const headings = markdownTokenSpans(markdown, tokens)
    .filter(({ token }) => token.type === "heading")
    .map(({ token, index }) => ({
      index,
      length: token.raw.length,
      level: token.depth,
      key: keyFor(token),
    }));
  const hierarchy = [];
  const selected = [];
  for (const heading of headings) {
    while (hierarchy.length > 0 && heading.level <= hierarchy.at(-1).level)
      hierarchy.pop();
    const insideSection = hierarchy.some((entry) => entry.section);
    const section = accepted.has(heading.key) && !insideSection;
    if (section) selected.push(heading);
    hierarchy.push({ level: heading.level, section });
  }
  for (const heading of selected) {
    const start = heading.index + heading.length;
    const nextPeer = headings.find(
      (candidate) =>
        candidate.index > heading.index && candidate.level <= heading.level,
    );
    const end = nextPeer?.index ?? markdown.length;
    const source = markdown.slice(start, end).trim();
    record(heading.key, {
      key: heading.key,
      level: heading.level,
      source,
      content: renderMarkdown(source),
    });
  }
  return sections;
}

export function interpretMarkdown(
  markdown,
  { additionalNonRenderedElements = [] } = {},
) {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, "\n");
  const tokens = marked.lexer(normalizedMarkdown);
  const isHidden = visibility(additionalNonRenderedElements);
  const parseTokens = (selectedTokens) => {
    const marker = randomUUID();
    const renderer = new Renderer();
    renderer.heading = function ({ depth, tokens: headingTokens }) {
      return `<h${depth} data-repo-canon-markdown-heading="${marker}">${this.parser.parseInline(headingTokens)}</h${depth}>`;
    };
    return {
      fragment: parseFragment(marked.parser(selectedTokens, { renderer })),
      marker,
    };
  };
  const renderTokens = (selectedTokens) => {
    const { fragment, marker } = parseTokens(selectedTokens);
    return renderedContent(fragment, isHidden, marker);
  };
  const renderMarkdown = (source) => renderTokens(marked.lexer(source));
  const { fragment, marker } = parseTokens(tokens);
  const spans = new Map();
  const content = renderedContent(fragment, isHidden, marker, spans);
  const rendered = { fragment, elements: content.elements, spans, isHidden };
  const headings = content.elements.flatMap((element, index) => {
    if (element.type !== "heading") return [];
    const next = content.elements.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index &&
        candidate.type === "heading" &&
        candidate.level <= element.level,
    );
    const end = next < 0 ? content.elements.length : next;
    let blocks;
    return [
      {
        ...element,
        body: {
          elements: content.elements
            .slice(index + 1, end)
            .filter(inSectionBody),
          get blocks() {
            blocks ??= sectionBlocks(rendered, index + 1, end);
            return blocks;
          },
        },
      },
    ];
  });
  const markdownHeadings = markdownTokenSpans(normalizedMarkdown, tokens)
    .filter(({ token }) => token.type === "heading")
    .map(({ token, index }) => ({
      index,
      length: token.raw.length,
      level: token.depth,
      name: markdownInlineText(token.tokens),
    }));

  let documentBlocks;
  return {
    content,
    headings,
    markdownHeadings,
    // The document's ordered top-level blocks, headings included, in the same
    // shape as a heading section's blocks.
    get blocks() {
      documentBlocks ??= sectionBlocks(rendered, 0, content.elements.length);
      return documentBlocks;
    },
    sections(
      names,
      {
        hierarchy = "outermost",
        nameSource = "markdown",
        stripTrailingColon = false,
      } = {},
    ) {
      if (!["matching", "outermost"].includes(hierarchy))
        throw new Error(`Unknown Markdown section hierarchy: ${hierarchy}.`);
      if (!["markdown", "rendered"].includes(nameSource))
        throw new Error(`Unknown Markdown heading name source: ${nameSource}.`);
      return sectionMap(
        normalizedMarkdown,
        tokens,
        names,
        { hierarchy, nameSource, stripTrailingColon },
        renderTokens,
        renderMarkdown,
        isHidden,
      );
    },
  };
}
