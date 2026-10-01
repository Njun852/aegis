import { Icon } from "@/components/ui";
import styles from "./book.module.css";

/**
 * Shown for any link that is not an open booking page: unknown, switched off,
 * or a business without Bookings. All three read the same, so the page cannot
 * be used to find out which businesses exist.
 */
export function Unavailable() {
  return (
    <div className={styles.card}>
      <div className={styles.sectionHead} style={{ marginBottom: 0 }}>
        <span className={styles.sectionIcon} style={{ background: "var(--surface-inset)", color: "var(--text-muted)" }}>
          <Icon name="calendar" size={15} />
        </span>
        <span>
          <h1 className={styles.sectionTitle}>Online booking isn&apos;t available</h1>
          <p className={styles.sectionHelp}>
            This booking page is not open right now. Please contact the shop directly to arrange
            your appointment.
          </p>
        </span>
      </div>
    </div>
  );
}
