import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/book/book.module.css";
import { BookingForm } from "@/components/book/booking-form";
import { Icon } from "@/components/ui";
import { Unavailable } from "@/components/book/unavailable";
import { TIMEZONE_LABEL, bookingWindow } from "@/lib/booking-slots";
import { bookableBusiness, readOpenDays } from "@/lib/dal/public-booking";

export async function generateMetadata(props: PageProps<"/book/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const business = await bookableBusiness(slug);
  return {
    title: business ? `Book a service · ${business.name}` : "Online booking",
    // A shop's own link to share, not something to surface in search results.
    robots: { index: false, follow: false },
  };
}

export default async function BookPage(props: PageProps<"/book/[slug]">) {
  const { slug } = await props.params;
  const business = await bookableBusiness(slug);
  if (!business) return <Unavailable />;

  const now = new Date();
  const openDays = await readOpenDays(business.businessId, now);

  return (
    <>
      <p className={styles.eyebrow}>
        <Icon name="calendar" size={12} />
        Online appointment request
      </p>
      <h1 className={styles.title}>Book your service appointment</h1>
      <p className={styles.lead}>
        Send us your preferred service time and vehicle details. Your booking will remain pending
        until our team confirms it.
      </p>
      <p className={styles.small}>
        <Icon name="clock" size={12} style={{ marginTop: 1, flex: "0 0 auto" }} />
        All appointment times use {TIMEZONE_LABEL}. We&apos;ll use your mobile number to help
        retrieve your booking later.
      </p>

      <BookingForm slug={slug} openDays={openDays} dateRange={bookingWindow(now)} />

      <p className={styles.after}>
        Already sent a request?{" "}
        <Link href={`/book/${slug}/status`} className={styles.link}>
          Retrieve your booking
        </Link>
        .
      </p>
    </>
  );
}
