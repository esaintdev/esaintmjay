import test from "node:test";
import assert from "node:assert/strict";
import { htmlToRichDoc } from "../lib/calmify-html.ts";
import { sanitizeDoc } from "../lib/richtext.ts";

const id = "0b6f3c1e-4a8d-4c55-9a1e-2f3b4c5d6e7f";
/** The sanitized document Calmify's HTML ends up as. */
const doc = (html: string) => sanitizeDoc(htmlToRichDoc(html));

test("headings, emphasis, links and line breaks", () => {
  assert.deepEqual(
    doc(
      '<h2>Hello <strong>world</strong></h2>' +
        '<p>A <a href="https://example.com">link</a> and <em>more</em>.<br>New line</p>',
    ),
    {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world", marks: [{ type: "bold" }] },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "A " },
            {
              type: "text",
              text: "link",
              marks: [{ type: "link", attrs: { href: "https://example.com/" } }],
            },
            { type: "text", text: " and " },
            { type: "text", text: "more", marks: [{ type: "italic" }] },
            { type: "text", text: "." },
            { type: "hardBreak" },
            { type: "text", text: "New line" },
          ],
        },
      ],
    },
  );
});

test("headings are clamped to the levels the site renders", () => {
  const levels = (html: string) => {
    const d = doc(html);
    return d?.content.map((n) => n.attrs?.level);
  };
  assert.deepEqual(levels("<h1>a</h1><h3>b</h3><h6>c</h6>"), [2, 3, 4]);
});

test("lists, quotes and rules", () => {
  assert.deepEqual(
    doc(
      "<ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul>" +
        '<ol start="3"><li>Three</li></ol>' +
        "<blockquote><p>Quote</p></blockquote><hr>",
    ),
    {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "One" }] },
              ],
            },
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Two" }] },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Nested" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Three" }] },
              ],
            },
          ],
        },
        {
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Quote" }] },
          ],
        },
        { type: "horizontalRule" },
      ],
    },
  );
});

test("entities are decoded and empty blocks are dropped", () => {
  assert.deepEqual(doc("<p>Tom &amp; Jerry &#169; &lt;x&gt;</p>"), {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Tom & Jerry © <x>" }] },
    ],
  });
  assert.equal(doc(""), null);
  assert.equal(doc("   "), null);
  assert.equal(doc("<p></p>"), null);
});

test("scripts, unsafe links and outside images are removed", () => {
  assert.deepEqual(
    doc(
      "<p>a<script>alert(1)</script>b</p>" +
        '<p><a href="javascript:alert(1)">bad</a></p>' +
        '<p><img src="https://evil.example/x.png" alt="x"></p>' +
        "<div><span>kept</span></div>" +
        "<style>p{color:red}</style>",
    ),
    {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "ab" }] },
        { type: "paragraph", content: [{ type: "text", text: "bad" }] },
        { type: "paragraph", content: [{ type: "text", text: "kept" }] },
      ],
    },
  );
});

test("simple inline marks survive; unknown tags are kept as text", () => {
  assert.deepEqual(doc("<p><u>u</u> <s>s</s> <code>c</code> <mark>m</mark></p>"), {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "u", marks: [{ type: "underline" }] },
          { type: "text", text: " " },
          { type: "text", text: "s", marks: [{ type: "strike" }] },
          { type: "text", text: " " },
          { type: "text", text: "c", marks: [{ type: "code" }] },
          { type: "text", text: " m" },
        ],
      },
    ],
  });
});

test("code blocks keep their whitespace", () => {
  assert.deepEqual(doc("<pre><code>const x = 1;\nif (x) {}</code></pre>"), {
    type: "doc",
    content: [
      {
        type: "codeBlock",
        content: [{ type: "text", text: "const x = 1;\nif (x) {}" }],
      },
    ],
  });
});

test("a figure's image keeps its caption as the title", () => {
  assert.deepEqual(
    doc(
      `<figure><img src="/media/${id}" alt="a poster"><figcaption>Caption here</figcaption></figure>`,
    ),
    {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: `/media/${id}`, alt: "a poster", title: "Caption here" },
        },
      ],
    },
  );
});

test("deeply nested html is cut off rather than crashing", () => {
  const html = "<div>".repeat(3000) + "deep" + "</div>".repeat(3000);
  const d = doc(html);
  assert.ok(d === null || d.type === "doc");
});
