import Link from "next/link";
import styles from "@/components/book/book.module.css";
import { bookableBusiness } from "@/lib/dal/public-booking";

/**
 * The public booking site's frame: its own header and page background, and none
 * of the AEGIS app shell. Customers never see the app, and nothing here needs a
 * session.
 */
export default async function BookLayout(props: LayoutProps<"/book/[slug]">) {
  const { slug } = await props.params;
  const business = await bookableBusiness(slug);
  const name = business?.name ?? "Online booking";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href={`/book/${slug}`} className={styles.brand}>
            <span className={styles.brandMark} aria-hidden>
              {name.charAt(0).toUpperCase()}
            </span>
            <span style={{ minWidth: 0 }}>
              <span className={styles.brandName}>{name}</span>
              <span className={styles.brandSub}>Online appointment booking</span>
            </span>
          </Link>
          {business && (
            <>
              <Link href={`/book/${slug}/status`} className={`${styles.navLink} ${styles.hideNarrow}`}>
                Retrieve booking
              </Link>
              <Link href={`/book/${slug}`} className={styles.linkButton}>
                Book now
              </Link>
            </>
          )}
        </div>
      </header>
      <main className={styles.main}>{props.children}</main>
    </div>
  );
}
