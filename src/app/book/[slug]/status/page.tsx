import type { Metadata } from "next";
import styles from "@/components/book/book.module.css";
import { RetrieveForm } from "@/components/book/retrieve-form";
import { Icon } from "@/components/ui";
import { Unavailable } from "@/components/book/unavailable";
import { bookableBusiness } from "@/lib/dal/public-booking";

export async function generateMetadata(props: PageProps<"/book/[slug]/status">): Promise<Metadata> {
  const { slug } = await props.params;
  const business = await bookableBusiness(slug);
  return {
    title: business ? `Your booking · ${business.name}` : "Online booking",
    robots: { index: false, follow: false },
  };
}

export default async function StatusPage(props: PageProps<"/book/[slug]/status">) {
  const { slug } = await props.params;
  const business = await bookableBusiness(slug);
  if (!business) return <Unavailable />;

  return (
    <>
      <p className={styles.eyebrow}>
        <Icon name="search" size={12} />
        Retrieve booking
      </p>
      <h1 className={styles.title}>Check your appointment</h1>
      <p className={styles.lead}>
        See whether your request has been confirmed, and the time we have you down for.
      </p>
      <RetrieveForm slug={slug} />
    </>
  );
}
