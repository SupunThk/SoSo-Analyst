import Header from '@/components/Header';
import { IndexDashboard } from '@/components/indexes/IndexDashboard';

export const metadata = {
  title: 'Indexes | SoSo Analyst',
  description: 'Track proprietary crypto indexes from SoSoValue',
};

export default function IndexesPage() {
  return (
    <div className="flex h-screen w-screen max-w-[100vw] bg-background overflow-hidden font-sans matrix-grid text-text-primary">
      <main className="flex-1 min-w-0 w-full max-w-full flex flex-col h-screen max-h-screen relative">
        {/* Fixed header */}
        <div className="shrink-0 z-20">
          <Header />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto relative">
          {/* Ambient glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent-green/10 blur-[120px] rounded-full pointer-events-none opacity-50" />

          <IndexDashboard />
        </div>

        {/* CRT Overlays */}
        <div className="crt-overlay pointer-events-none fixed inset-0 z-50" />
        <div className="crt-vignette pointer-events-none fixed inset-0 z-50" />
      </main>
    </div>
  );
}
