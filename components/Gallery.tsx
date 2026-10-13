"use client";
import { useState, useRef, useEffect } from "react";
import type { Asset } from "../lib/types.ts";
export default function Gallery({ images }: { images: Asset[] }) {
  const [index, setIndex] = useState<number | null>(null),
    dialog = useRef<HTMLDialogElement>(null),
    lastButton = useRef<HTMLButtonElement | null>(null);
  const current = index === null ? undefined : images[index];
  useEffect(() => {
    const d = dialog.current;
    if (index !== null && d && !d.open) d.showModal();
  }, [index]);
  useEffect(() => {
    if (index === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [index]);
  function close() {
    dialog.current?.close();
    setIndex(null);
    lastButton.current?.focus();
  }
  function step(n: number) {
    setIndex((i) =>
      i === null ? null : (i + n + images.length) % images.length,
    );
  }
  return (
    <>
      <div className="gallery-grid">
        {images.map((a, i) => (
          <figure key={a.id}>
            <button
              className="gallery-item"
              aria-label={`Enlarge ${a.title}`}
              onClick={(e) => {
                lastButton.current = e.currentTarget;
                setIndex(i);
              }}
            >
              <img
                src={`/media/${a.id}`}
                alt={a.alt || a.title}
                loading={i > 1 ? "lazy" : "eager"}
              />
              <span aria-hidden="true">↗</span>
            </button>
            <figcaption>
              <h3>{a.title}</h3>
              {a.caption && <p>{a.caption}</p>}
            </figcaption>
          </figure>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="lightbox"
        aria-label="Design image viewer"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
      >
        {index !== null && current && (
          <>
            <div className="lightbox-top">
              <p>
                {index + 1} / {images.length} — {current.title}
              </p>
              <button autoFocus onClick={close}>
                Close ×
              </button>
            </div>
            <img src={`/media/${current.id}`} alt={current.alt} />
            <div className="lightbox-bottom">
              <button onClick={() => step(-1)}>← Previous</button>
              <p>{current.caption}</p>
              <button onClick={() => step(1)}>Next →</button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
