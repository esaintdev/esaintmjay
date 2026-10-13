"use client";
import { useState, useRef, useEffect } from "react";
export default function Gallery({ images }) {
  const [index, setIndex] = useState(null),
    dialog = useRef(null),
    lastButton = useRef(null);
  useEffect(() => {
    if (index !== null && !dialog.current.open) dialog.current.showModal();
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
    dialog.current.close();
    setIndex(null);
    lastButton.current?.focus();
  }
  function step(n) {
    setIndex((i) => (i + n + images.length) % images.length);
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
        {index !== null && (
          <>
            <div className="lightbox-top">
              <p>
                {index + 1} / {images.length} — {images[index].title}
              </p>
              <button autoFocus onClick={close}>
                Close ×
              </button>
            </div>
            <img src={`/media/${images[index].id}`} alt={images[index].alt} />
            <div className="lightbox-bottom">
              <button onClick={() => step(-1)}>← Previous</button>
              <p>{images[index].caption}</p>
              <button onClick={() => step(1)}>Next →</button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
