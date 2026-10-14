import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeDoc,
  plainText,
  imageIds,
  docFromText,
  safeHref,
} from "../lib/richtext.ts";

const id = "0b6f3c1e-4a8d-4c55-9a1e-2f3b4c5d6e7f";

test("keeps supported formatting", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Title" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Bold", marks: [{ type: "bold" }] },
          {
            type: "text",
            text: " link",
            marks: [
              {
                type: "link",
                attrs: { href: "https://example.com", target: "_blank" },
              },
            ],
          },
        ],
      },
      {
        type: "image",
        attrs: { src: `/media/${id}`, alt: "A poster", width: 40 },
      },
    ],
  };
  assert.deepEqual(sanitizeDoc(doc), {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Title" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Bold", marks: [{ type: "bold" }] },
          {
            type: "text",
            text: " link",
            marks: [{ type: "link", attrs: { href: "https://example.com/" } }],
          },
        ],
      },
      { type: "image", attrs: { src: `/media/${id}`, alt: "A poster" } },
    ],
  });
});

test("drops scripts, unsafe links and outside images", () => {
  const doc = sanitizeDoc({
    type: "doc",
    content: [
      { type: "script", content: [{ type: "text", text: "alert(1)" }] },
      { type: "image", attrs: { src: "https://evil.example/x.png" } },
      { type: "image", attrs: { src: "javascript:alert(1)" } },
      {
        type: "paragraph",
        attrs: { style: "color:red", onclick: "x" },
        content: [
          {
            type: "text",
            text: "click",
            marks: [
              { type: "link", attrs: { href: "javascript:alert(1)" } },
              { type: "textStyle", attrs: { color: "red" } },
            ],
          },
        ],
      },
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "H" }],
      },
    ],
  });
  assert.deepEqual(doc, {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "click" }] },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "H" }],
      },
    ],
  });
  assert.equal(sanitizeDoc("<p>html</p>"), null);
  assert.equal(sanitizeDoc({ type: "doc", content: [] }), null);
});

test("safe links", () => {
  assert.equal(safeHref("/work"), "/work");
  assert.equal(safeHref("//evil.example"), "");
  assert.equal(safeHref("mailto:a@b.co"), "mailto:a@b.co");
  assert.equal(safeHref("data:text/html,x"), "");
  assert.equal(safeHref(" JAVASCRIPT:alert(1)"), "");
});

test("plain text, image ids and plain-text conversion", () => {
  const doc = docFromText("First line\nsecond line\n\nNext paragraph");
  assert.equal(plainText(doc), "First line\nsecond line\n\nNext paragraph");
  const withImage = sanitizeDoc({
    type: "doc",
    content: [
      { type: "image", attrs: { src: `/media/${id}`, alt: "" } },
      { type: "image", attrs: { src: `/media/${id}`, alt: "" } },
    ],
  });
  assert.deepEqual(imageIds(withImage), [id]);
});

test("deeply nested input is cut off rather than crashing", () => {
  let node: Record<string, unknown> = { type: "text", text: "deep" };
  for (let i = 0; i < 5000; i++) node = { type: "blockquote", content: [node] };
  const doc = sanitizeDoc({ type: "doc", content: [node] });
  assert.ok(doc);
  assert.equal(plainText(doc), "");
});
