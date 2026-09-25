import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Next's dev server logs every Server Function call with its arguments, which
   * put Meta access tokens and the passwords typed on the Users screen into the
   * terminal in clear text. Secrets do not belong in a log.
   */
  logging: { serverFunctions: false },
  /**
   * IMAP and SMTP clients open raw TCP sockets and load optional native
   * dependencies at runtime. Bundling them breaks both, so they stay external
   * and are required from node_modules on the server as normal.
   */
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer"],
};

export default nextConfig;
