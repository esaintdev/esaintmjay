"use client";
import { useState } from "react";
import { GroupCard, Star } from "./Site";
export default function WorkGrid({ groups }) {
  const [category, setCategory] = useState("All work");
  const categories = [
    "All work",
    ...new Set(groups.map((g) => g.category).filter(Boolean)),
  ];
  return (
    <>
      <div className="filters" aria-label="Filter collections">
        {categories.map((c) => (
          <button
            key={c}
            aria-pressed={category === c}
            className={category === c ? "active" : ""}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="work-grid">
        {groups
          .filter((g) => category === "All work" || g.category === category)
          .map((g, i) => (
            <GroupCard key={g.id} group={g} index={i} />
          ))}
      </div>
      {!groups.length && (
        <div className="work-empty">
          <Star />
          <div>
            <h3>The next chapter is taking shape.</h3>
            <p>New design collections will appear here soon.</p>
            <a className="text-link" href="#contact">
              Let’s create something together ↗
            </a>
          </div>
        </div>
      )}
    </>
  );
}
