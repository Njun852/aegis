import "server-only";

import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatAmount, formatQuoteDay, lineAmountCents } from "@/lib/quotations";
import type { Quotation, QuotationSettings, QuoteLine, QuoteSection } from "@/types";

/**
 * The quotation as a PDF, in the layout of the shop's own spreadsheet form.
 * One renderer serves the preview, the download and the email attachment, so
 * what staff look at is exactly what the customer receives.
 *
 * Internal figures (cost, margin, where a line came from) are not passed in
 * at all, rather than passed and hidden: nothing here can print them.
 *
 * Fonts are the PDF built-ins, which cover the Latin-1 letters Davao
 * addresses use (Iñigo) but not the peso sign, so amounts print as plain
 * numbers, as on the paper form.
 */

const NAVY = "#1F3864";
const BLUE = "#2E75B6";
const SHADE = "#D9E1F2";
const RED = "#E00000";
const LINE = "#7F8FA6";

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Helvetica", fontSize: 8.5, color: "#111" },
  frame: { borderWidth: 1.2, borderColor: NAVY },
  row: { flexDirection: "row" },
  cell: {
    borderRightWidth: 0.6,
    borderBottomWidth: 0.6,
    borderColor: LINE,
    paddingVertical: 3,
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  shaded: { backgroundColor: SHADE },
  bold: { fontFamily: "Helvetica-Bold" },
  center: { textAlign: "center" },
  right: { textAlign: "right" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 24, color: BLUE, letterSpacing: 0.5 },
  bar: {
    backgroundColor: SHADE,
    borderBottomWidth: 0.6,
    borderColor: LINE,
    paddingVertical: 3,
    textAlign: "center",
  },
});

export interface QuotePdfProps {
  quotation: Quotation;
  settings: QuotationSettings;
  businessName: string;
}

/** Empty rows under each section, as the paper form leaves room to write in. */
const PAD_ROWS = 2;

const COLS = { po: "10%", desc: "42%", qty: "8%", unit: "8%", price: "16%", amount: "16%" };

function Cell({
  width,
  children,
  style,
  last,
}: {
  width: string;
  children?: React.ReactNode;
  style?: object | object[];
  last?: boolean;
}) {
  const extra = Array.isArray(style) ? style : style ? [style] : [];
  return (
    <View style={[styles.cell, { width }, ...(last ? [{ borderRightWidth: 0 }] : [])]}>
      <Text style={extra}>{children ?? " "}</Text>
    </View>
  );
}

function LineRow({ line }: { line: QuoteLine | null }) {
  return (
    <View style={styles.row} wrap={false}>
      <Cell width={COLS.po}>{line?.po}</Cell>
      <Cell width={COLS.desc}>{line?.description.toUpperCase()}</Cell>
      <Cell width={COLS.qty} style={styles.center}>
        {line ? formatQty(line.qty) : ""}
      </Cell>
      <Cell width={COLS.unit} style={styles.center}>
        {line?.unit}
      </Cell>
      <Cell width={COLS.price} style={styles.right}>
        {line && line.unitPriceCents !== null ? formatAmount(line.unitPriceCents) : ""}
      </Cell>
      <Cell width={COLS.amount} style={styles.right} last>
        {line ? (line.unitPriceCents === null ? "" : formatAmount(lineAmountCents(line))) : "-"}
      </Cell>
    </View>
  );
}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/0$/, "");
}

function Section({ title, lines }: { title: string; lines: QuoteLine[] }) {
  const pad = Array.from({ length: PAD_ROWS }, () => null);
  return (
    <View>
      <View style={styles.row} wrap={false}>
        <View style={[styles.cell, { width: "100%", borderRightWidth: 0 }]}>
          <Text style={[styles.bold, styles.center, { textDecoration: "underline" }]}>{title}</Text>
        </View>
      </View>
      {[...lines, ...pad].map((line, index) => (
        <LineRow key={line?.id ?? `pad-${index}`} line={line} />
      ))}
    </View>
  );
}

function Labelled({
  label,
  value,
  labelWidth,
  valueWidth,
  last,
  center,
}: {
  label: string;
  value: string;
  labelWidth: string;
  valueWidth: string;
  last?: boolean;
  center?: boolean;
}) {
  return (
    <>
      <Cell width={labelWidth}>{label}</Cell>
      <Cell width={valueWidth} last={last} style={center ? styles.center : undefined}>
        {value}
      </Cell>
    </>
  );
}

export function QuotePdf({ quotation, settings, businessName }: QuotePdfProps) {
  const { billTo, vehicle, totals } = quotation;
  const bySection = (section: QuoteSection) => quotation.lines.filter((line) => line.section === section);
  const notes = quotation.notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const left = [
    ["Customer Name", billTo.name],
    ["Company Name", billTo.company],
    ["Street Address", billTo.address],
    ["Contact Number", billTo.phone],
    ["Email Address", billTo.email],
    ["Service Advisor", quotation.serviceAdvisor],
  ];
  const right = [
    ["ODOMETER", vehicle.odometerKm === null ? "" : `${vehicle.odometerKm.toLocaleString("en-US")} km`],
    ["PLATE NUMBER", vehicle.plate],
    ["MODEL/MAKE", vehicle.makeModel.toUpperCase()],
    ["Technician", quotation.technician],
    ["", ""],
    ["", ""],
  ];

  const totalRows: [string, string, boolean?][] = [
    ["TOTAL PARTS", formatAmount(totals.partsCents)],
    ["TOTAL LABOR", formatAmount(totals.laborCents)],
    ["SUBTOTAL", formatAmount(totals.subtotalCents)],
    ["DISCOUNT", totals.discountCents ? formatAmount(totals.discountCents) : ""],
    ["TOTAL", formatAmount(totals.totalCents), true],
  ];

  return (
    <Document title={`Quotation ${quotation.ref}`} author={businessName} creator="AEGIS" producer="AEGIS">
      <Page size="A4" style={styles.page}>
        <View style={styles.frame}>
          {/* Title and letterhead */}
          <View style={[styles.row, { borderBottomWidth: 0.6, borderColor: LINE }]}>
            <View style={{ width: "45%", justifyContent: "center", alignItems: "center", paddingVertical: 10 }}>
              <Text style={styles.title}>QUOTATION</Text>
            </View>
            <View style={{ width: "55%", height: 62, justifyContent: "center", alignItems: "center" }}>
              {settings.logo ? (
                // eslint-disable-next-line jsx-a11y/alt-text -- a PDF image has no alt attribute
                <Image src={settings.logo} style={{ maxHeight: 58, maxWidth: "100%", objectFit: "contain" }} />
              ) : (
                <View
                  style={{
                    backgroundColor: NAVY,
                    width: "100%",
                    height: "100%",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 22, color: "#fff" }}>
                    {businessName.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Date, quote number, address */}
          <View style={styles.row}>
            <View style={{ width: "50%" }}>
              <View style={styles.row}>
                <Cell width="36%" style={styles.center}>
                  Date
                </Cell>
                <Cell width="34%" style={styles.center}>
                  QUOTE NO
                </Cell>
                <Cell width="30%" style={styles.center}>
                  D.R. Number
                </Cell>
              </View>
              <View style={styles.row}>
                <Cell width="36%" style={styles.center}>
                  {formatQuoteDay(quotation.quoteDate)}
                </Cell>
                <Cell width="34%" style={[styles.center, styles.bold]}>
                  {quotation.ref}
                </Cell>
                <Cell width="30%" style={styles.center}>
                  {quotation.drNumber}
                </Cell>
              </View>
            </View>
            <View
              style={{
                width: "50%",
                borderBottomWidth: 0.6,
                borderColor: LINE,
                paddingHorizontal: 6,
                justifyContent: "center",
                alignItems: "flex-end",
              }}
            >
              {settings.address ? <Text style={[styles.bold, { fontSize: 9.5 }]}>{settings.address}</Text> : null}
              {settings.contact ? <Text style={{ marginTop: 2 }}>{settings.contact}</Text> : null}
            </View>
          </View>

          <Text style={styles.bar}>Bill To</Text>

          {/* Customer and vehicle */}
          {left.map(([label, value], index) => (
            <View key={label} style={styles.row} wrap={false}>
              <Labelled label={label} value={value} labelWidth="18%" valueWidth="32%" />
              <Labelled
                label={right[index][0]}
                value={right[index][1]}
                labelWidth="18%"
                valueWidth="32%"
                center
                last
              />
            </View>
          ))}

          <View style={{ height: 8, borderBottomWidth: 0.6, borderColor: LINE }} />

          {/* Lines */}
          <View style={[styles.row, styles.shaded]} fixed>
            <Cell width={COLS.po} style={styles.center}>
              P.O.
            </Cell>
            <Cell width={COLS.desc} style={styles.center}>
              PRODUCT DESCRIPTION
            </Cell>
            <Cell width={COLS.qty} style={styles.center}>
              QTY
            </Cell>
            <Cell width={COLS.unit} style={styles.center}>
              UNIT
            </Cell>
            <Cell width={COLS.price} style={styles.center}>
              UNIT PRICE
            </Cell>
            <Cell width={COLS.amount} style={styles.center} last>
              AMOUNT
            </Cell>
          </View>
          <Section title="PARTS" lines={bySection("parts")} />
          <Section title="LABOR" lines={bySection("labor")} />

          {/* Notes and totals */}
          <View style={styles.row} wrap={false}>
            <View style={{ width: "50%", borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: LINE }}>
              <Text style={[styles.bar, styles.bold, { borderBottomWidth: 0.6 }]}>NOTE/S:</Text>
              <View style={{ padding: 8, flexGrow: 1, justifyContent: "center" }}>
                {notes.map((note, index) => (
                  <Text
                    key={index}
                    style={[styles.bold, styles.center, { color: RED, fontSize: 9, marginBottom: 3 }]}
                  >
                    {note}
                  </Text>
                ))}
              </View>
            </View>
            <View style={{ width: "50%" }}>
              {totalRows.map(([label, value, strong]) => (
                <View key={label} style={styles.row}>
                  <Cell width="56%" style={[styles.bold, styles.center, ...(strong ? [{ color: BLUE }] : [])]}>
                    {label}
                  </Cell>
                  <Cell width="44%" style={[styles.right, ...(strong ? [styles.bold, { color: RED }] : [])]} last>
                    {value}
                  </Cell>
                </View>
              ))}
            </View>
          </View>

          <Text style={[styles.bar, styles.bold, { color: BLUE }]}>{settings.footer || " "}</Text>

          {/* Signatures */}
          {[
            ["Service Advisor:", "Assigned Technician:", "Customer:"],
            ["Accounting:", "Head Technician:", "Manager:"],
          ].map((row, rowIndex) => (
            <View key={rowIndex} style={styles.row} wrap={false}>
              {row.map((label, index) => (
                <View
                  key={label}
                  style={[
                    styles.cell,
                    { width: index === 2 ? "30%" : "35%", height: 30, justifyContent: "flex-start" },
                    ...(index === 2 ? [{ borderRightWidth: 0 }] : []),
                    ...(rowIndex === 1 ? [{ borderBottomWidth: 0 }] : []),
                  ]}
                >
                  <Text style={styles.bold}>{label}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export function renderQuotePdf(props: QuotePdfProps): Promise<Buffer> {
  return renderToBuffer(<QuotePdf {...props} />);
}

/** "AUTOBLITZ-QT-1001.pdf", safe as a download and attachment name. */
export function quotePdfFilename(businessName: string, ref: string): string {
  const name = businessName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "Quotation";
  return `${name}-${ref}.pdf`;
}
