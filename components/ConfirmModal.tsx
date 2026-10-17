"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { Star, Arrow } from "./Site";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  alertOnly?: boolean;
  icon?: ReactNode;
};

type ConfirmState = ConfirmOptions & {
  isOpen: boolean;
  resolve: (value: boolean) => void;
};

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback(
    (options: string | ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        const opts: ConfirmOptions =
          typeof options === "string" ? { message: options } : options;
        setState({
          ...opts,
          isOpen: true,
          resolve,
        });
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    if (state) {
      state.resolve(true);
      setState(null);
    }
  }, [state]);

  const handleCancel = useCallback(() => {
    if (state) {
      state.resolve(false);
      setState(null);
    }
  }, [state]);

  const modalNode = state?.isOpen ? (
    <ConfirmModal
      isOpen={state.isOpen}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      destructive={state.destructive}
      alertOnly={state.alertOnly}
      icon={state.icon}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, ConfirmModal: modalNode };
}

export type ConfirmModalProps = {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  alertOnly?: boolean;
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  isOpen,
  title = "Please confirm",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  alertOnly = false,
  icon,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const timer = setTimeout(() => {
      if (destructive) {
        cancelBtnRef.current?.focus();
      } else {
        confirmBtnRef.current?.focus();
      }
    }, 50);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, destructive, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="confirm-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
      >
        <button
          type="button"
          className="confirm-modal-close"
          aria-label="Close dialog"
          onClick={onCancel}
        >
          ✕
        </button>

        <div className="confirm-modal-header">
          <div className="confirm-modal-badge" aria-hidden="true">
            {icon || <Star />}
          </div>
          <p className="eyebrow">
            {destructive ? "Action required" : "Confirmation"}
          </p>
        </div>

        <h3 id="confirm-modal-title" className="confirm-modal-title">
          {title}
        </h3>

        <p id="confirm-modal-desc" className="confirm-modal-message">
          {message}
        </p>

        <div className="confirm-modal-actions">
          {!alertOnly && (
            <button
              ref={cancelBtnRef}
              type="button"
              className="button confirm-modal-btn-cancel"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            className={`button dark ${destructive ? "confirm-modal-btn-destructive" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel} <Arrow />
          </button>
        </div>
      </div>
    </div>
  );
}
