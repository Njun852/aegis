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
import { FeeRulesSection } from "./fee-rules";
import { MoneyModal } from "./money-modal";
import { PaymentDrawer } from "./payment-drawer";
import { StatTiles, type StatTile } from "./stat-tiles";
import { TransferModal } from "./transfer-modal";
import type { CountRow, FeeRule, MoneyAccountSummary, PaymentDetail, RecordTrail } from "@/types";

const GRID =
  "grid gap-3 items-center grid-cols-[minmax(150px,1.4fr)_minmax(90px,1fr)_20px] wide:grid-cols-[minmax(180px,1.4fr)_110px_minmax(0,1fr)_minmax(0,1.1fr)_130px_22px]";

export interface AccountsPanelProps {
  accounts: MoneyAccountSummary[];
  counts: CountRow[];
  feeRules: FeeRule[];
  openRef: string | null;
  /** The payment open over the account, with its history and documents. */
  openPayment: { payment: PaymentDetail; trail: RecordTrail } | null;
  isAdmin: boolean;
  /** Manila's today, as the server saw it. */
  today: string;
}

/** The Accounts tab: cash, bank, passbook and e-wallet balances, money in and out, transfers and counts. */
export function AccountsPanel({ accounts, counts, feeRules, openRef, openPayment, isAdmin, today }: AccountsPanelProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [moneyFor, setMoneyFor] = useState<string | null>(null);
  const [transferFrom, setTransferFrom] = useState<string | null>(null);
  const [counting, setCounting] = useState<string | null>(null);
  const [, startNavigation] = useTransition();

  const open = openRef ? accounts.find((account) => account.ref === openRef) ?? null : null;
  const active = accounts.filter((account) => account.active);
  const openCounts = counts.filter((count) => count.status === "open");

  const select = (ref: string | null, payment?: string) => {
    startNavigation(() =>
      router.replace(
        ref
          ? `/finance?tab=accounts&account=${encodeURIComponent(ref)}${payment ? `&payment=${encodeURIComponent(payment)}` : ""}`
          : "/finance?tab=accounts",
        { scroll: false },
      ),
    );
  };

  const total = (type: MoneyAccountSummary["type"]) =>
    accounts.filter((account) => account.type === type).reduce((sum, account) => sum + account.balanceCents, 0);

  const tiles: StatTile[] = [
    { label: "Cash on hand", value: formatMoney(total("cash")), icon: "wallet", tone: "accent" },
    { label: "Bank / Passbook", value: formatMoney(total("bank")), icon: "building-2" },
    { label: "E-wallets", value: formatMoney(total("ewallet")), icon: "credit-card" },
    { label: "Counts with a difference", value: String(openCounts.length), icon: "alert-triangle", tone: openCounts.length > 0 ? "alert" : "plain" },
  ];

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Balances as of {formatQuoteDay(today)}</span>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button icon="wallet" disabled={active.length === 0} onClick={() => setMoneyFor(open?.active ? open.ref : "")}>
              Money in / out
            </Button>
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

        <StatTiles tiles={tiles} />

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

        <FeeRulesSection rules={feeRules} isAdmin={isAdmin} />
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
          onMoney={() => setMoneyFor(open.ref)}
          onOpenPayment={(ref) => select(open.ref, ref)}
          onClose={() => select(null)}
        />
      )}
      {openPayment && (
        <PaymentDrawer
          key={openPayment.payment.ref}
          payment={openPayment.payment}
          trail={openPayment.trail}
          isAdmin={isAdmin}
          onClose={() => select(open?.ref ?? openPayment.payment.accountRef)}
        />
      )}
      {moneyFor !== null && (
        <MoneyModal accounts={active} feeRules={feeRules} accountRef={moneyFor} today={today} onClose={() => setMoneyFor(null)} />
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
        <TransferModal accounts={active} feeRules={feeRules} fromRef={transferFrom} today={today} onClose={() => setTransferFrom(null)} />
      )}
      {counting !== null && (
        <CountModal accounts={accounts} accountRef={counting} today={today} onClose={() => setCounting(null)} />
      )}
    </>
  );
}
