import React, { useMemo } from 'react';
import { MarketIntelligence, AlertTemplate } from '@/lib/types';
import { cn, severityTone, PanelHeader } from './ui';

export const AlertEnginePanel = ({
  data,
  disabledAlertIds,
  toggleAlert,
}: {
  data: MarketIntelligence;
  disabledAlertIds: string[];
  toggleAlert: (id: string) => void;
}) => {
  const disabled = useMemo(() => new Set(disabledAlertIds), [disabledAlertIds]);
  const enabledTemplates = data.alerts.templates.filter((template) => !disabled.has(template.id));
  const activeAlerts = data.alerts.triggered.filter((alert) => !disabled.has(alert.templateId));

  return (
    <section className="rounded-md border border-border/80 bg-[#050805]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_50px_rgba(0,0,0,0.35)]">
      <PanelHeader
        kicker="Alert Engine"
        title={`${activeAlerts.length} Active / ${enabledTemplates.length} Armed`}
      />

      <div className="mt-4 grid gap-2">
        {data.alerts.templates.map((template: AlertTemplate) => {
          const isDisabled = disabled.has(template.id);
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => toggleAlert(template.id)}
              className={cn(
                'w-full rounded-md border px-3 py-2 text-left transition-colors',
                isDisabled
                  ? 'border-border/60 bg-black/10 opacity-55'
                  : severityTone(template.severity)
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[10px] font-mono font-bold uppercase tracking-[0.08em]">
                    {template.title}
                  </div>
                  <div className="mt-1 truncate text-[8px] font-mono uppercase tracking-[0.12em] opacity-70">
                    {template.condition}
                  </div>
                </div>
                <div className="shrink-0 text-[9px] font-mono font-bold uppercase tracking-widest">
                  {isDisabled ? 'Off' : 'On'}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        {activeAlerts.length === 0 ? (
          <div className="rounded-md border border-border/70 bg-black/20 px-3 py-3 text-[10px] font-mono text-text-secondary">
            No armed alert is firing on the current snapshot.
          </div>
        ) : activeAlerts.slice(0, 4).map((alert) => (
          <div
            key={`${alert.templateId}-${alert.title}`}
            className={cn('rounded-md border px-3 py-2', severityTone(alert.severity))}
          >
            <div className="text-[10px] font-mono font-bold uppercase tracking-[0.08em]">
              {alert.title}
            </div>
            <div className="mt-1 space-y-1">
              {alert.evidence.slice(0, 2).map((fact) => (
                <div key={fact} className="text-[9px] font-mono leading-relaxed opacity-80">
                  {fact}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
