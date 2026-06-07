import { IndexDashboard } from '@/components/indexes/IndexDashboard';

export const metadata = {
  title: 'Indexes | SoSo Analyst',
  description: 'Track proprietary crypto indexes from SoSoValue',
};

export default function IndexesPage() {
  return (
    <div className="flex-1 overflow-y-auto relative h-full">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-accent-green/10 blur-[120px] rounded-full pointer-events-none opacity-50" />

      <IndexDashboard />
    </div>
  );
}
