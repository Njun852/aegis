"use client";

/**
 * The Mail title. The inbox syncs itself every two minutes from the shell, and
 * whether a mailbox is connected is reported on the System Status screen, so
 * the header carries no badges.
 */
export function MailHeader() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "30px",
            lineHeight: "36px",
            fontWeight: 700,
            letterSpacing: "-.02em",
          }}
        >
          AEGIS Mail
        </h2>
      </div>
    </div>
  );
}
