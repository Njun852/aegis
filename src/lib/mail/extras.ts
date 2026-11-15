import "server-only";

import type { ParsedMail } from "mailparser";
import { readLinks } from "@/lib/mail-links";
import type { MailAttachmentInfo, MailLink } from "@/types";

/**
 * What an email carries besides its text: the files attached to it and the
 * links in it. Read from the parsed message when it is retrieved, and again
 * for older mail the first time it is opened. The files themselves are not
 * stored here; they stay in Gmail until someone opens one.
 */

/** Every attachment, in the parser's order, which is the index it is fetched by. */
export function readAttachmentInfo(parsed: ParsedMail): MailAttachmentInfo[] {
  return (parsed.attachments ?? []).map((file, index) => ({
    index,
    filename: (file.filename ?? "").trim().slice(0, 200) || `attachment-${index + 1}${extensionFor(file.contentType)}`,
    contentType: (file.contentType || "application/octet-stream").toLowerCase(),
    size: file.size ?? file.content?.length ?? 0,
    // Pasted into the body or tied to it by Content-ID, rather than attached as a file.
    inline: file.contentDisposition === "inline" || file.related === true,
  }));
}

export function readMailExtras(parsed: ParsedMail, plain: string): { attachments: MailAttachmentInfo[]; links: MailLink[] } {
  return { attachments: readAttachmentInfo(parsed), links: readLinks(parsed.html, plain) };
}

function extensionFor(contentType: string | undefined): string {
  const type = (contentType ?? "").toLowerCase();
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "image/gif") return ".gif";
  if (type === "image/webp") return ".webp";
  if (type === "application/pdf") return ".pdf";
  return "";
}
