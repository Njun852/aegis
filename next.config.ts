import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * IMAP and SMTP clients open raw TCP sockets and load optional native
   * dependencies at runtime. Bundling them breaks both, so they stay external
   * and are required from node_modules on the server as normal.
   */
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer"],
};

export default nextConfig;
