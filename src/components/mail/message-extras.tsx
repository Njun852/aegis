"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { loadMailExtrasAction } from "@/app/actions/mail";
import { Icon } from "@/components/ui";
import { isSafeLink, linkHost } from "@/lib/mail-links";
import type { MailAttachmentInfo, MailLink, MailMessage } from "@/types";

/** Logos, spacers and tracking pixels in a newsletter's design: inline and tiny. Not worth showing as photos. */
const DESIGN_IMAGE_BYTES = 12 * 1024;
/** Links shown before "Show all". */
const FIRST_LINKS = 8;

function attachmentUrl(messageId: string, index: number, download = false): string {
  return `/api/mail/attachment?message=${encodeURIComponent(messageId)}&index=${index}${download ? "&download=1" : ""}`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The photos, files and links an email came with. Recorded when the email is
 * read in; for older mail they are read from Gmail the first time it is
 * opened. Files open from Gmail on demand and are never shown from anywhere
 * else, and every link says where it really goes.
 */
export function MessageExtras({ message }: { message: MailMessage }) {
  const known = message.attachments && message.links ? { attachments: message.attachments, links: message.links } : null;
  const [extras, setExtras] = useState<{ attachments: MailAttachmentInfo[]; links: MailLink[] } | null>(known);
  const [error, setError] = useState<string | null>(null);
  const [allLinks, setAllLinks] = useState(false);
  // One request per opened message, even when React runs the effect twice.
  const request = useRef<ReturnType<typeof loadMailExtrasAction> | null>(null);

  useEffect(() => {
    if (extras) return;
    let live = true;
    request.current ??= loadMailExtrasAction(message.id);
    request.current
      .then((result) => {
        if (!live) return;
        setExtras({ attachments: result.attachments, links: result.links });
        setError(result.error);
      })
      .catch(() => {
        if (live) setError("The attachments could not be read just now.");
      });
    return () => {
      live = false;
    };
  }, [extras, message.id]);

  if (!extras && !error) {
    return (
      <span className="flex items-center gap-2" style={{ fontSize: "12px", color: "var(--text-muted)" }}>
        <Icon name="paperclip" size={13} />
        Checking Gmail for attachments and links…
      </span>
    );
  }

  const attachments = extras?.attachments ?? [];
  const links = extras?.links ?? [];
  const photos = attachments.filter(
    (file) => file.contentType.startsWith("image/") && !(file.inline && file.size < DESIGN_IMAGE_BYTES) && file.contentType !== "image/svg+xml",
  );
  const designImages = attachments.filter((file) => file.contentType.startsWith("image/") && file.inline && file.size < DESIGN_IMAGE_BYTES);
  const files = attachments.filter((file) => !photos.includes(file) && !designImages.includes(file));
  const shownLinks = allLinks ? links : links.slice(0, FIRST_LINKS);

  if (error && attachments.length === 0 && links.length === 0) {
    return (
      <span role="alert" className="flex items-center gap-2" style={{ fontSize: "12px", color: "var(--status-negative)" }}>
        <Icon name="circle-alert" size={13} />
        {error}
      </span>
    );
  }
  if (photos.length === 0 && files.length === 0 && links.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {(photos.length > 0 || files.length > 0) && (
        <section className="flex flex-col gap-2">
          <span style={HEADING}>
            <Icon name="paperclip" size={13} />
            Attachments · {photos.length + files.length}
            {designImages.length > 0 && (
              <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                {" "}
                ({designImages.length} small {designImages.length === 1 ? "image" : "images"} from the email&apos;s design not shown)
              </span>
            )}
          </span>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((file) => (
                <a
                  key={file.index}
                  href={attachmentUrl(message.id, file.index)}
                  target="_blank"
                  rel="noreferrer"
                  title={`${file.filename} · ${formatSize(file.size)}. Opens in a new tab.`}
                  style={PHOTO}
                >
                  {/* Served by AEGIS from the business's own mailbox; next/image adds nothing. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachmentUrl(message.id, file.index)}
                    alt={file.filename}
                    loading="lazy"
                    style={{ width: "100%", height: 104, objectFit: "cover", display: "block", background: "var(--surface-inset)" }}
                  />
                  <span style={CAPTION}>{file.filename}</span>
                </a>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((file) => {
                const opens = file.contentType === "application/pdf" || file.contentType === "text/plain";
                return (
                  <a
                    key={file.index}
                    href={attachmentUrl(message.id, file.index, !opens)}
                    target={opens ? "_blank" : undefined}
                    rel="noreferrer"
                    title={opens ? "Opens in a new tab" : "Downloads the file"}
                    style={CHIP}
                  >
                    <Icon name={file.contentType === "application/pdf" ? "file-text" : "paperclip"} size={14} />
                    <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.filename}</span>
                    <span style={{ color: "var(--text-muted)" }}>{formatSize(file.size)}</span>
                  </a>
                );
              })}
            </div>
          )}
        </section>
      )}

      {links.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <span style={HEADING}>
            <Icon name="external-link" size={13} />
            Links · {links.length}
          </span>
          <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {shownLinks.map((link) => (
              <a
                key={link.url}
                href={isSafeLink(link.url) ? link.url : undefined}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center gap-2"
                title={link.url}
                style={{ padding: "7px 10px", borderBottom: "1px solid var(--gray-50)", textDecoration: "none", fontSize: "12px", minWidth: 0 }}
              >
                <span style={{ flex: 1, minWidth: 0, color: "var(--text-accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {link.text || link.url}
                </span>
                {/* Where it really goes, whatever the words say. */}
                <span style={{ flex: "0 0 auto", maxWidth: "45%", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {linkHost(link.url)}
                </span>
              </a>
            ))}
          </div>
          {links.length > FIRST_LINKS && (
            <button type="button" onClick={() => setAllLinks((open) => !open)} style={MORE}>
              {allLinks ? "Show fewer" : `Show all ${links.length} links`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

const HEADING: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: "11.5px",
  fontWeight: 700,
  color: "var(--text-secondary)",
};

const PHOTO: CSSProperties = {
  width: 148,
  display: "flex",
  flexDirection: "column",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  overflow: "hidden",
  textDecoration: "none",
  background: "var(--surface-card)",
};

const CAPTION: CSSProperties = {
  padding: "5px 8px",
  fontSize: "11px",
  color: "var(--text-secondary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const CHIP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 30,
  padding: "0 10px",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-card)",
  color: "var(--text-primary)",
  fontSize: "12px",
  textDecoration: "none",
};

const MORE: CSSProperties = {
  alignSelf: "flex-start",
  border: 0,
  background: "none",
  padding: 0,
  font: "inherit",
  fontSize: "11.5px",
  fontWeight: 600,
  color: "var(--accent-primary)",
  cursor: "pointer",
};
