import { Card, ListRow } from "@/components/ui";
import { ALERT_ROWS } from "@/lib/data/dashboard";

export function AlertsCard() {
  return (
    <Card title="Alerts" padding="16px">
      <div className="flex flex-col overflow-hidden">
        {ALERT_ROWS.map((alert) => (
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
