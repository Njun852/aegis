import "server-only";

import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatAmount, formatPercent, formatQuoteDay, lineAmountCents, signatureBoxes } from "@/lib/quotations";
import type { Quotation, QuotationSettings, QuoteLine, QuotePdfColors, QuoteSection } from "@/types";

/**
 * The quotation as a PDF, in the layout of the shop's own spreadsheet form.
 * One renderer serves the preview, the download and the email attachment, so
 * what staff look at is exactly what the customer receives.
 *
 * The customer copy never prints internal figures (cost, margin, where a line
 * came from). The internal copy (`internal`) is the same form with the cost
 * of each line and the profit added, marked across the top as not for the
 * customer, and without the signature boxes so it cannot pass for the real
 * thing. Only the PDF route asks for it; emailing always sends the customer
 * copy.
 *
 * The colours are the business's choice (Quotation settings), the classic
 * blue of the paper form unless changed.
 *
 * Fonts are the PDF built-ins, which cover the Latin-1 letters Davao
 * addresses use (Iñigo) but not the peso sign, so amounts print as plain
 * numbers, as on the paper form.
 */

const LINE = "#7F8FA6";
const INTERNAL_RED = "#C00000";

function stylesFor(colors: QuotePdfColors) {
  return StyleSheet.create({
    page: { padding: 28, fontFamily: "Helvetica", fontSize: 8.5, color: "#111" },
    frame: { borderWidth: 1.2, borderColor: colors.frame },
    row: { flexDirection: "row" },
    cell: {
      borderRightWidth: 0.6,
      borderBottomWidth: 0.6,
      borderColor: LINE,
      paddingVertical: 3,
      paddingHorizontal: 4,
      justifyContent: "center",
    },
    shaded: { backgroundColor: colors.shade },
    bold: { fontFamily: "Helvetica-Bold" },
    center: { textAlign: "center" },
    right: { textAlign: "right" },
    title: { fontFamily: "Helvetica-Bold", fontSize: 24, color: colors.heading, letterSpacing: 0.5 },
    bar: {
      backgroundColor: colors.shade,
      borderBottomWidth: 0.6,
      borderColor: LINE,
      paddingVertical: 3,
      textAlign: "center",
    },
    internalBanner: {
      backgroundColor: INTERNAL_RED,
      color: "#fff",
      fontFamily: "Helvetica-Bold",
      fontSize: 8,
      textAlign: "center",
      paddingVertical: 3,
      marginBottom: 6,
      letterSpacing: 0.4,
    },
    muted: { color: "#666", fontSize: 6.5 },
  });
}

type Styles = ReturnType<typeof stylesFor>;

export interface QuotePdfProps {
  quotation: Quotation;
  settings: QuotationSettings;
  businessName: string;
  /** The staff copy, with each line's cost and the profit. Never emailed. */
  internal?: boolean;
}

/** Empty rows under each section, as the paper form leaves room to write in. */
const PAD_ROWS = 2;

interface Columns {
  po: string;
  desc: string;
  qty: string;
  unit: string;
  price: string;
  amount: string;
  unitCost?: string;
  cost?: string;
}

const CUSTOMER_COLS: Columns = { po: "10%", desc: "42%", qty: "8%", unit: "8%", price: "16%", amount: "16%" };
const INTERNAL_COLS: Columns = {
  po: "7%",
  desc: "31%",
  qty: "6%",
  unit: "6%",
  unitCost: "12%",
  cost: "12%",
  price: "13%",
  amount: "13%",
};

function Cell({
  styles,
  width,
  children,
  style,
  last,
}: {
  styles: Styles;
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

/** What a line cost the business: qty × unit cost, or null when no cost is recorded. */
function lineCostCents(line: QuoteLine): number | null {
  return line.costCents === null ? null : Math.round(line.qty * line.costCents);
}

function LineRow({ styles, cols, line }: { styles: Styles; cols: Columns; line: QuoteLine | null }) {
  const internal = cols.cost !== undefined;
  const cost = line ? lineCostCents(line) : null;
  const belowCost = line && line.unitPriceCents !== null && line.costCents !== null && line.unitPriceCents < line.costCents;
  return (
    <View style={styles.row} wrap={false}>
      <Cell styles={styles} width={cols.po}>
        {line?.po}
      </Cell>
      <View style={[styles.cell, { width: cols.desc }]}>
        <Text>{line?.description.toUpperCase() ?? " "}</Text>
        {internal && line?.costNote ? <Text style={styles.muted}>{line.costNote}</Text> : null}
      </View>
      <Cell styles={styles} width={cols.qty} style={styles.center}>
        {line ? formatQty(line.qty) : ""}
      </Cell>
      <Cell styles={styles} width={cols.unit} style={styles.center}>
        {line?.unit}
      </Cell>
      <Cell styles={styles} width={cols.price} style={[styles.right, ...(internal && belowCost ? [{ color: INTERNAL_RED }] : [])]}>
        {line && line.unitPriceCents !== null ? formatAmount(line.unitPriceCents) : ""}
      </Cell>
      {internal && (
        <Cell styles={styles} width={cols.unitCost!} style={styles.right}>
          {line ? (line.costCents === null ? (line.unitPriceCents === null ? "" : "no cost") : formatAmount(line.costCents)) : ""}
        </Cell>
      )}
      <Cell styles={styles} width={cols.amount} style={styles.right} last={!internal}>
        {line ? (line.unitPriceCents === null ? "" : formatAmount(lineAmountCents(line))) : "-"}
      </Cell>
      {internal && (
        <Cell styles={styles} width={cols.cost!} style={styles.right} last>
          {cost === null ? "" : formatAmount(cost)}
        </Cell>
      )}
    </View>
  );
}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/0$/, "");
}

function Section({ styles, cols, title, lines }: { styles: Styles; cols: Columns; title: string; lines: QuoteLine[] }) {
  const pad = Array.from({ length: PAD_ROWS }, () => null);
  return (
    <View>
      <View style={styles.row} wrap={false}>
        <View style={[styles.cell, { width: "100%", borderRightWidth: 0 }]}>
          <Text style={[styles.bold, styles.center, { textDecoration: "underline" }]}>{title}</Text>
        </View>
      </View>
      {[...lines, ...pad].map((line, index) => (
        <LineRow key={line?.id ?? `pad-${index}`} styles={styles} cols={cols} line={line} />
      ))}
    </View>
  );
}

function Labelled({
  styles,
  label,
  value,
  labelWidth,
  valueWidth,
  last,
  center,
}: {
  styles: Styles;
  label: string;
  value: string;
  labelWidth: string;
  valueWidth: string;
  last?: boolean;
  center?: boolean;
}) {
  return (
    <>
      <Cell styles={styles} width={labelWidth}>
        {label}
      </Cell>
      <Cell styles={styles} width={valueWidth} last={last} style={center ? styles.center : undefined}>
        {value}
      </Cell>
    </>
  );
}

export function QuotePdf({ quotation, settings, businessName, internal = false }: QuotePdfProps) {
  const colors = settings.pdfColors;
  const styles = stylesFor(colors);
  const cols = internal ? INTERNAL_COLS : CUSTOMER_COLS;
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
  ];
  const right = [
    ["ODOMETER", vehicle.odometerKm === null ? "" : `${vehicle.odometerKm.toLocaleString("en-US")} km`],
    ["PLATE NUMBER", vehicle.plate],
    ["MODEL/MAKE", vehicle.makeModel.toUpperCase()],
    ["Technician", quotation.technician],
    ["Valid Until", formatQuoteDay(quotation.validUntil)],
  ];

  // Who signs each box: the name, and beside it their saved signature when
  // there is one. A box with no signature is left for a hand signature.
  const signatureRows = signatureBoxes(quotation, settings);

  // label, value, which emphasis: "total" for the customer's total, "internal" for staff-only figures.
  const totalRows: [string, string, ("total" | "internal")?][] = [
    ["TOTAL PARTS", formatAmount(totals.partsCents)],
    ["TOTAL LABOR", formatAmount(totals.laborCents)],
    ["SUBTOTAL", formatAmount(totals.subtotalCents)],
    [
      quotation.discountPercent && totals.discountCents ? `DISCOUNT (${formatPercent(quotation.discountPercent)})` : "DISCOUNT",
      totals.discountCents ? formatAmount(totals.discountCents) : "",
    ],
    ["TOTAL", formatAmount(totals.totalCents), "total"],
  ];
  if (internal) {
    const covered =
      totals.costedLines < totals.pricedLines ? ` (${totals.costedLines} OF ${totals.pricedLines} LINES)` : "";
    totalRows.push(
      [`TOTAL COST${covered}`, totals.costedLines ? formatAmount(totals.costCents) : "—", "internal"],
      ["GROSS PROFIT", totals.costedLines ? formatAmount(totals.marginCents) : "—", "internal"],
      ["MARGIN", totals.marginPercent === null ? "—" : `${totals.marginPercent.toFixed(1)}%`, "internal"],
    );
  }

  const reference = quotation.revision > 1 ? `${quotation.ref} Rev ${quotation.revision}` : quotation.ref;

  return (
    <Document
      title={`${internal ? "Internal costing" : "Quotation"} ${quotation.ref}`}
      author={businessName}
      creator="AEGIS"
      producer="AEGIS"
    >
      <Page size="A4" style={styles.page}>
        {internal && (
          <Text style={styles.internalBanner} fixed>
            INTERNAL COPY · INCLUDES COSTS AND PROFIT · DO NOT SEND TO THE CUSTOMER
          </Text>
        )}
        <View style={styles.frame}>
          {/* Title and letterhead */}
          <View style={[styles.row, { borderBottomWidth: 0.6, borderColor: LINE }]}>
            <View style={{ width: "45%", justifyContent: "center", alignItems: "center", paddingVertical: 10 }}>
              <Text style={styles.title}>QUOTATION</Text>
              {internal && <Text style={[styles.bold, { color: INTERNAL_RED, fontSize: 8, marginTop: 2 }]}>INTERNAL COSTING</Text>}
            </View>
            <View style={{ width: "55%", height: 62, justifyContent: "center", alignItems: "center" }}>
              {settings.logo ? (
                // eslint-disable-next-line jsx-a11y/alt-text -- a PDF image has no alt attribute
                <Image src={settings.logo} style={{ maxHeight: 58, maxWidth: "100%", objectFit: "contain" }} />
              ) : (
                <View
                  style={{
                    backgroundColor: colors.frame,
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
                <Cell styles={styles} width="36%" style={styles.center}>
                  Date
                </Cell>
                <Cell styles={styles} width="34%" style={styles.center}>
                  QUOTE NO
                </Cell>
                <Cell styles={styles} width="30%" style={styles.center}>
                  D.R. Number
                </Cell>
              </View>
              <View style={styles.row}>
                <Cell styles={styles} width="36%" style={styles.center}>
                  {formatQuoteDay(quotation.quoteDate)}
                </Cell>
                <Cell styles={styles} width="34%" style={[styles.center, styles.bold]}>
                  {reference}
                </Cell>
                <Cell styles={styles} width="30%" style={styles.center}>
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
              <Labelled styles={styles} label={label} value={value} labelWidth="18%" valueWidth="32%" />
              <Labelled
                styles={styles}
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
            <Cell styles={styles} width={cols.po} style={styles.center}>
              P.O.
            </Cell>
            <Cell styles={styles} width={cols.desc} style={styles.center}>
              PRODUCT DESCRIPTION
            </Cell>
            <Cell styles={styles} width={cols.qty} style={styles.center}>
              QTY
            </Cell>
            <Cell styles={styles} width={cols.unit} style={styles.center}>
              UNIT
            </Cell>
            <Cell styles={styles} width={cols.price} style={styles.center}>
              UNIT PRICE
            </Cell>
            {internal && (
              <Cell styles={styles} width={cols.unitCost!} style={[styles.center, styles.bold, { color: INTERNAL_RED }]}>
                UNIT COST
              </Cell>
            )}
            <Cell styles={styles} width={cols.amount} style={styles.center} last={!internal}>
              AMOUNT
            </Cell>
            {internal && (
              <Cell styles={styles} width={cols.cost!} style={[styles.center, styles.bold, { color: INTERNAL_RED }]} last>
                TOTAL COST
              </Cell>
            )}
          </View>
          <Section styles={styles} cols={cols} title="PARTS" lines={bySection("parts")} />
          <Section styles={styles} cols={cols} title="LABOR" lines={bySection("labor")} />

          {/* Notes and totals */}
          <View style={styles.row} wrap={false}>
            <View style={{ width: "50%", borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: LINE }}>
              <Text style={[styles.bar, styles.bold, { borderBottomWidth: 0.6 }]}>NOTE/S:</Text>
              <View style={{ padding: 8, flexGrow: 1, justifyContent: "center" }}>
                {notes.map((note, index) => (
                  <Text
                    key={index}
                    style={[styles.bold, styles.center, { color: colors.highlight, fontSize: 9, marginBottom: 3 }]}
                  >
                    {note}
                  </Text>
                ))}
                {internal && quotation.discountReason ? (
                  <Text style={[styles.muted, styles.center, { marginTop: 4 }]}>Discount reason: {quotation.discountReason}</Text>
                ) : null}
              </View>
            </View>
            <View style={{ width: "50%" }}>
              {totalRows.map(([label, value, emphasis]) => (
                <View key={label} style={[styles.row, ...(emphasis === "internal" ? [{ backgroundColor: "#FFF1F1" }] : [])]}>
                  <Cell
                    styles={styles}
                    width="56%"
                    style={[
                      styles.bold,
                      styles.center,
                      ...(emphasis === "total" ? [{ color: colors.heading }] : []),
                      ...(emphasis === "internal" ? [{ color: INTERNAL_RED }] : []),
                    ]}
                  >
                    {label}
                  </Cell>
                  <Cell
                    styles={styles}
                    width="44%"
                    style={[
                      styles.right,
                      ...(emphasis === "total" ? [styles.bold, { color: colors.highlight }] : []),
                      ...(emphasis === "internal" ? [styles.bold] : []),
                    ]}
                    last
                  >
                    {value}
                  </Cell>
                </View>
              ))}
            </View>
          </View>

          {internal ? (
            <Text style={[styles.bar, styles.bold, { color: INTERNAL_RED, borderBottomWidth: 0 }]}>
              For staff only. Costs are as recorded on the quotation; lines with no cost are left out of the profit.
            </Text>
          ) : (
            <>
              <Text style={[styles.bar, styles.bold, { color: colors.heading }]}>{settings.footer || " "}</Text>

              {/* Signatures */}
              {signatureRows.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row} wrap={false}>
                  {row.map((box, index) => (
                    <View
                      key={box.label}
                      style={[
                        styles.cell,
                        { width: index === 2 ? "30%" : "35%", height: 46, justifyContent: "flex-start" },
                        ...(index === 2 ? [{ borderRightWidth: 0 }] : []),
                        ...(rowIndex === 1 ? [{ borderBottomWidth: 0 }] : []),
                      ]}
                    >
                      <Text style={styles.bold}>{box.label}</Text>
                      {box.name || box.image ? (
                        <View style={{ marginTop: "auto", flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
                          <Text style={{ flexShrink: 1 }}>{box.name}</Text>
                          {box.image ? (
                            // eslint-disable-next-line jsx-a11y/alt-text -- a PDF image has no alt attribute
                            <Image src={box.image} style={{ height: 26, maxWidth: 100, objectFit: "contain" }} />
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ))}
            </>
          )}
        </View>
      </Page>
    </Document>
  );
}

export function renderQuotePdf(props: QuotePdfProps): Promise<Buffer> {
  return renderToBuffer(<QuotePdf {...props} />);
}

/**
 * "AUTOBLITZ-QT-1001.pdf", or "AUTOBLITZ-QT-1001-rev2.pdf" after a revision;
 * the internal copy ends "-INTERNAL". Safe as a download and attachment name.
 */
export function quotePdfFilename(businessName: string, ref: string, revision = 1, internal = false): string {
  const name = businessName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "Quotation";
  return `${name}-${ref}${revision > 1 ? `-rev${revision}` : ""}${internal ? "-INTERNAL" : ""}.pdf`;
}
