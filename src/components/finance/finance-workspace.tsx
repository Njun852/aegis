"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ColumnLabel, Notice } from "@/components/forms/form-kit";
import { Button, Icon } from "@/components/ui";
import { accountTypeLabel } from "@/lib/finance";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { activateOnKey } from "@/lib/interaction";
import { formatQuoteDay } from "@/lib/quotations";
import { AccountDrawer } from "./account-drawer";
import { AccountModal } from "./account-modal";
import { CountBadge } from "./count-badge";
import { CountModal } from "./count-modal";
import { TransferModal } from "./transfer-modal";
import type { CountRow, MoneyAccountSummary } from "@/types";

const GRID =
  "grid gap-3 items-center grid-cols-[minmax(150px,1.4fr)_minmax(90px,1fr)_20px] wide:grid-cols-[minmax(180px,1.4fr)_110px_minmax(0,1fr)_minmax(0,1.1fr)_130px_22px]";

export interface FinanceWorkspaceProps {
  accounts: MoneyAccountSummary[];
  counts: CountRow[];
  openRef: string | null;
  isAdmin: boolean;
  businessName: string;
  /** Manila's today, as the server saw it. */
  today: string;
}

export function FinanceWorkspace({ accounts, counts, openRef, isAdmin, businessName, today }: FinanceWorkspaceProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [transferFrom, setTransferFrom] = useState<string | null>(null);
  const [counting, setCounting] = useState<string | null>(null);
  const [, startNavigation] = useTransition();

  const open = openRef ? accounts.find((account) => account.ref === openRef) ?? null : null;
  const active = accounts.filter((account) => account.active);
  const openCounts = counts.filter((count) => count.status === "open");

  const select = (ref: string | null) => {
    startNavigation(() => router.replace(ref ? `/finance?account=${encodeURIComponent(ref)}` : "/finance", { scroll: false }));
  };

  const total = (type: MoneyAccountSummary["type"]) =>
    accounts.filter((account) => account.type === type).reduce((sum, account) => sum + account.balanceCents, 0);

  const stats = [
    { label: "Cash on hand", value: formatMoney(total("cash")), icon: "wallet", bg: "var(--accent-soft)", fg: "var(--accent-primary)" },
    { label: "Bank / Passbook", value: formatMoney(total("bank")), icon: "building-2", bg: "var(--surface-inset)", fg: "var(--text-secondary)" },
    { label: "E-wallets", value: formatMoney(total("ewallet")), icon: "credit-card", bg: "var(--surface-inset)", fg: "var(--text-secondary)" },
    {
      label: "Counts with a difference",
      value: String(openCounts.length),
      icon: "alert-triangle",
      bg: openCounts.length > 0 ? "var(--status-negative-soft)" : "var(--surface-inset)",
      fg: openCounts.length > 0 ? "var(--status-negative)" : "var(--text-secondary)",
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "22px", lineHeight: "28px", fontWeight: 700, letterSpacing: "-.02em" }}>
              Finance
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "var(--text-secondary)" }}>
              {businessName} · cash, bank, passbook and e-wallet balances as of {formatQuoteDay(today)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="secondary" icon="check" disabled={active.length === 0} onClick={() => setCounting(open?.ref ?? active[0]?.ref ?? null)}>
              Record count
            </Button>
            <Button variant="secondary" icon="arrow-left-right" disabled={active.length < 2} onClick={() => setTransferFrom(open?.active ? open.ref : "")}>
              Transfer
            </Button>
            {isAdmin && (
              <Button icon="plus" onClick={() => setAdding(true)}>
                New account
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 wide:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-card)",
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: "11px",
                minWidth: 0,
              }}
            >
              <span style={{ width: 32, height: 32, flex: "0 0 auto", borderRadius: "9px", background: stat.bg, color: stat.fg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={stat.icon} size={15} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "19px", fontWeight: 700, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {stat.value}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {stat.label}
                </span>
              </span>
            </div>
          ))}
        </div>

        {openCounts.length > 0 && (
          <Notice tone="error">
            <strong>
              {openCounts.length === 1 ? "A count differs" : `${openCounts.length} counts differ`} from the book.
            </strong>{" "}
            {openCounts.slice(0, 3).map((count, index) => {
              const name = accounts.find((account) => account.ref === count.accountRef)?.name ?? count.accountRef;
              return (
                <span key={count.ref}>
                  {index > 0 && "; "}
                  <button
                    type="button"
                    onClick={() => select(count.accountRef)}
                    style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "inherit", textDecoration: "underline", cursor: "pointer" }}
                  >
                    {name}
                  </button>{" "}
                  {formatSignedMoney(count.differenceCents)} on {formatQuoteDay(count.asOf)}
                </span>
              );
            })}
            . {isAdmin ? "Open the account to explain each one." : "An administrator needs to explain each one."}
          </Notice>
        )}

        <section
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
            padding: "12px 12px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            minWidth: 0,
          }}
        >
          <div className={GRID} style={{ padding: "0 10px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
            <ColumnLabel>Account</ColumnLabel>
            <ColumnLabel className="hidden wide:block">Type</ColumnLabel>
            <ColumnLabel className="hidden wide:block">Held at</ColumnLabel>
            <ColumnLabel className="hidden wide:block">Last count</ColumnLabel>
            <ColumnLabel align="right">Balance today</ColumnLabel>
            <span />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {accounts.map((account) => {
              const choose = () => select(account.ref);
              return (
                <div
                  key={account.ref}
                  role="button"
                  tabIndex={0}
                  aria-label={`${account.name}, ${formatMoney(account.balanceCents)}`}
                  onClick={choose}
                  onKeyDown={activateOnKey(choose)}
                  className={GRID}
                  style={{
                    padding: "10px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--gray-50)",
                    background: account.ref === openRef ? "var(--surface-active)" : "transparent",
                    opacity: account.active ? 1 : 0.55,
                  }}
                >
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span style={{ fontSize: "12.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {account.name}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {account.ref}
                      <span className="wide:hidden"> · {accountTypeLabel(account)}</span>
                      {!account.active && " · no longer used"}
                    </span>
                  </span>
                  <span className="hidden wide:block" style={{ fontSize: "12.5px" }}>
                    {accountTypeLabel(account)}
                  </span>
                  <span className="hidden wide:block" style={{ fontSize: "12.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {account.type === "cash" ? "On hand" : `${account.institution} ···${account.numberLast4}`}
                  </span>
                  <span className="hidden min-w-0 items-center gap-2 wide:flex">
                    {account.lastCount ? (
                      <>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{formatQuoteDay(account.lastCount.asOf)}</span>
                        <CountBadge status={account.lastCount.status} differenceCents={account.lastCount.differenceCents} />
                      </>
                    ) : (
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Never counted</span>
                    )}
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {formatMoney(account.balanceCents)}
                  </span>
                  <span className="hidden wide:inline-flex" style={{ color: "var(--text-muted)", justifyContent: "flex-end" }}>
                    <Icon name="chevron-right" size={15} />
                  </span>
                </div>
              );
            })}
            {accounts.length === 0 && (
              <div style={{ padding: "30px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)", textWrap: "pretty" }}>
                {isAdmin
                  ? "No accounts yet. Add the cash box, each bank account or passbook, and each e-wallet, with its balance on the day you start."
                  : "No accounts yet. An administrator sets them up, each with its balance on the day Finance starts."}
              </div>
            )}
          </div>
          {accounts.length > 0 && (
            <span style={{ fontSize: "11px", color: "var(--text-muted)", padding: "0 10px", textWrap: "pretty" }}>
              A balance is the opening balance plus every payment since; open an account to see each one. A passbook is a bank
              account and is listed once.
            </span>
          )}
        </section>
      </div>

      {open && (
        <AccountDrawer
          key={open.ref}
          account={open}
          counts={counts.filter((count) => count.accountRef === open.ref)}
          isAdmin={isAdmin}
          today={today}
          canTransfer={active.length >= 2}
          onCount={() => setCounting(open.ref)}
          onTransfer={() => setTransferFrom(open.ref)}
          onClose={() => select(null)}
        />
      )}
      {adding && (
        <AccountModal
          account={null}
          today={today}
          onClose={() => setAdding(false)}
          onSaved={(ref) => {
            setAdding(false);
            select(ref);
          }}
        />
      )}
      {transferFrom !== null && (
        <TransferModal accounts={active} fromRef={transferFrom} today={today} onClose={() => setTransferFrom(null)} />
      )}
      {counting !== null && (
        <CountModal accounts={accounts} accountRef={counting} today={today} onClose={() => setCounting(null)} />
      )}
    </>
  );
}
