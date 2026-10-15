"use client";

import { Card, ListRow } from "@/components/ui";
import { useDashboardRange } from "./dashboard-range-provider";

/** What needs attention now, worked out on the server from each module. */
export function AlertsCard() {
  const { alerts } = useDashboardRange();

  return (
    <Card title="Alerts" padding="16px">
      <div className="flex flex-col overflow-hidden">
        {alerts.length === 0 && (
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Nothing needs attention right now.</span>
        )}
        {alerts.map((alert) => (
          <ListRow
            key={alert.title}
            title={alert.title}
            meta={alert.meta}
            amount={alert.amount}
            amountTone={alert.amountTone}
            tag={alert.tag}
            icon={alert.icon}
            iconColor={alert.iconColor}
          />
        ))}
      </div>
    </Card>
  );
}
