export default function SettingsPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-4 md:p-6 overflow-y-auto">
      <div className="p-8 border border-accent-green/30 bg-[#060A06]/90 rounded-md shadow-lg max-w-lg w-full text-center">
        <h1 className="text-2xl font-bold text-accent-green mb-4 uppercase tracking-widest font-mono">Settings</h1>
        <p className="text-sm text-text-secondary mb-6 font-sans">
          Configure your SoSo Analyst terminal preferences, API keys, and connection settings.
        </p>
        <p className="text-xs text-text-secondary/70 font-mono">
          Wallet connection and session management are available from the header profile control.
        </p>
      </div>
    </div>
  );
}
