/**
 * The slice of `mailparser` AEGIS uses.
 *
 * `@types/mailparser` on DefinitelyTyped pulls `@types/nodemailer`, which is
 * still published for nodemailer 8 while this project runs the patched 10 — the
 * two cannot be installed together. Declaring what we actually call is smaller
 * than the conflict, and it documents our dependency surface exactly: if a
 * future change needs another field, it has to be added here deliberately.
 */
declare module "mailparser" {
  interface AddressObject {
    value: { address?: string; name?: string }[];
    text: string;
  }

  export interface ParsedMail {
    messageId?: string;
    subject?: string;
    from?: AddressObject;
    date?: Date;
    /** The plain-text part, when the message has one. */
    text?: string;
    /** The HTML part; false when absent. */
    html?: string | false;
    /** Plain text derived from the HTML part by mailparser itself. */
    textAsHtml?: string;
  }

  export function simpleParser(
    source: string | Buffer | NodeJS.ReadableStream,
  ): Promise<ParsedMail>;
}
