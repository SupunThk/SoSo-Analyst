'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import Link from 'next/link';
import { SodexBalance, SodexOrder, SodexPosition, SodexProfile, SodexTrade } from '@/lib/types';
import { fetchSodexProfile } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import SystemManualModal from '@/components/SystemManualModal';

const formatUsd = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(Number(value)) >= 1000 ? 0 : 2
  }).format(Number(value));
};

const formatNumber = (value: number | null | undefined, digits = 4) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '--';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits
  }).format(Number(value));
};

const formatTimestamp = (value: string | number | null | undefined) => {
  if (!value) return '--';
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 1e12 ? numeric : numeric * 1000)
    : new Date(value);

  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const StatCard = ({
  label,
  value,
  detail,
  accent = 'green'
}: {
  label: string;
  value: string;
  detail: string;
  accent?: 'green' | 'amber' | 'blue' | 'red';
}) => {
  const accents = {
    green: 'from-accent-green/10 text-accent-green',
    amber: 'from-accent-amber/10 text-accent-amber',
    blue: 'from-blue-500/10 text-blue-400',
    red: 'from-accent-red/10 text-accent-red'
  };

  return (
    <div className="bg-[#060A06]/80 border border-border/80 rounded-md p-5 md:p-6 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_32px_rgba(0,0,0,0.3)] relative overflow-hidden group">
      <div className={`absolute inset-0 bg-gradient-to-br ${accents[accent].split(' ')[0]} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <span className="text-xs font-sans font-medium text-text-secondary uppercase tracking-wider block mb-2">{label}</span>
      <div className="text-2xl md:text-3xl font-mono font-bold text-white tracking-tight break-words">{value}</div>
      <div className="mt-3 flex items-center gap-2">
        <span className={`text-xs font-sans font-medium ${accents[accent].split(' ')[1]}`}>{detail}</span>
      </div>
    </div>
  );
};

const EmptyState = ({ title, detail }: { title: string; detail: string }) => (
  <div className="border border-border/70 bg-[#060A06]/70 rounded-md px-4 py-8 text-center">
    <div className="text-sm font-sans font-medium text-text-secondary">{title}</div>
    <p className="mt-2 text-sm font-sans text-text-secondary/70 leading-relaxed max-w-md mx-auto">{detail}</p>
  </div>
);

const BalanceRow = ({ balance }: { balance: SodexBalance }) => (
  <div className="bg-[#060A06] border border-border/70 rounded-md p-4 shadow-sm relative overflow-hidden">
    <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent-green/60" />
    <div className="flex justify-between gap-3 pl-2">
      <div className="min-w-0">
        <div className="font-sans text-sm font-semibold text-white truncate">{balance.asset}</div>
        <div className="text-xs font-sans text-text-secondary mt-0.5">
          Price {formatUsd(balance.usdPrice)}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-mono font-medium text-white">{formatUsd(balance.valueUsd)}</div>
        <div className="text-xs font-sans text-text-secondary">{formatNumber(balance.total)}</div>
      </div>
    </div>
  </div>
);

const PositionRow = ({ position }: { position: SodexPosition }) => (
  <div className="bg-[#060A06] border border-border/70 rounded-md p-4 shadow-sm relative overflow-hidden">
    <div className={`absolute left-0 top-0 bottom-0 w-1 ${position.side === 'SHORT' ? 'bg-accent-red/70' : 'bg-accent-amber/70'}`} />
    <div className="flex justify-between gap-3 pl-2">
      <div className="min-w-0">
        <div className="font-sans text-sm font-semibold text-white truncate">{position.symbol}</div>
        <div className="text-xs font-sans text-text-secondary mt-0.5">
          {position.side} / Size {formatNumber(position.size)}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`text-sm font-mono font-medium ${(position.unrealizedPnl || 0) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
          {formatUsd(position.unrealizedPnl)}
        </div>
        <div className="text-xs font-sans text-text-secondary">Mark {formatUsd(position.markPrice)}</div>
      </div>
    </div>
  </div>
);

const TradeTable = ({ trades }: { trades: SodexTrade[] }) => {
  if (!trades.length) {
    return <EmptyState title="No Recent Trades" detail="SoDEX did not return recent fills for this wallet." />;
  }

  return (
    <div className="bg-[#060A06]/90 border border-border/80 rounded-md overflow-hidden backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-white/[0.02]">
              <th className="px-4 py-3 text-xs font-sans font-medium text-text-secondary text-left">Market</th>
              <th className="px-4 py-3 text-xs font-sans font-medium text-text-secondary text-left">Side</th>
              <th className="px-4 py-3 text-xs font-sans font-medium text-text-secondary text-left">Price</th>
              <th className="px-4 py-3 text-xs font-sans font-medium text-text-secondary text-left">Amount</th>
              <th className="px-4 py-3 text-xs font-sans font-medium text-text-secondary text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {trades.map((trade) => (
              <tr key={trade.id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <div className="font-sans text-sm font-semibold text-white">{trade.symbol}</div>
                  <div className="text-xs font-sans mt-0.5 text-text-secondary">
                    {trade.market} / {formatUsd(trade.valueUsd)}
                  </div>
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-sm font-bold ${(trade.side || '').includes('BUY') || (trade.side || '').includes('LONG') ? 'bg-accent-green/10 text-accent-green' : 'bg-red-500/10 text-red-400'}`}>
                    {trade.side || '--'}
                  </span>
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap font-mono text-sm text-text-primary">{formatUsd(trade.price)}</td>
                <td className="px-4 py-3.5 whitespace-nowrap font-mono text-sm text-text-primary">{formatNumber(trade.amount)}</td>
                <td className="px-4 py-3.5 whitespace-nowrap text-right">
                  <div className="font-sans text-xs text-text-secondary">{formatTimestamp(trade.timestamp)}</div>
                  <div className="text-xs font-sans text-text-secondary/60 mt-1">{trade.status}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const OrderList = ({ orders }: { orders: SodexOrder[] }) => {
  if (!orders.length) {
    return <EmptyState title="No Open Orders" detail="No active SoDEX spot or perps orders were returned." />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {orders.map((order) => (
        <div key={order.id} className="border border-border/70 bg-[#060A06] rounded-md p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-sans text-sm font-semibold text-white">{order.symbol}</div>
              <div className="text-xs font-sans text-text-secondary mt-1">{order.market} / {order.status}</div>
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-sm font-bold ${(order.side || '').includes('BUY') || (order.side || '').includes('LONG') ? 'bg-accent-green/10 text-accent-green' : 'bg-red-500/10 text-red-400'}`}>
              {order.side || '--'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 text-xs font-sans">
            <div>
              <div className="text-text-secondary">Price</div>
              <div className="text-text-primary font-mono mt-1">{formatUsd(order.price)}</div>
            </div>
            <div>
              <div className="text-text-secondary">Amount</div>
              <div className="text-text-primary font-mono mt-1">{formatNumber(order.amount)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default function ProfilePage() {
  const { walletAddress, authSession, handleWalletConnect } = useAuth();
  const [profile, setProfile] = useState<SodexProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tradeFilter, setTradeFilter] = useState<'all' | 'spot' | 'perps'>('all');
  const [isManualOpen, setIsManualOpen] = useState(false);

  const loadProfile = useCallback(async (address: string, token?: string | null) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const data = await fetchSodexProfile(address, token);
      setProfile(data);
    } catch (err) {
      setProfile(null);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load SoDEX profile data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (walletAddress && authSession?.token) {
      const timer = window.setTimeout(() => {
        void loadProfile(walletAddress, authSession.token);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [walletAddress, authSession?.token, loadProfile]);

  const filteredTrades = useMemo(() => {
    const trades = profile?.recentTrades || [];
    return tradeFilter === 'all' ? trades : trades.filter((trade) => trade.market === tradeFilter);
  }, [profile?.recentTrades, tradeFilter]);

  return (
    <div className="flex flex-col h-screen w-screen max-w-[100vw] bg-background overflow-hidden font-sans matrix-grid text-text-primary">
      <Header
        onConnectWallet={handleWalletConnect}
        walletAddress={walletAddress}
        onOpenManual={() => setIsManualOpen(true)}
      />

      <main className="flex-1 overflow-y-auto scroll-smooth p-4 md:p-8 relative z-10">
        <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">
          <div className="flex flex-col gap-4 border-b border-border/40 pb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-text-secondary hover:text-accent-green transition-colors text-xs font-mono uppercase tracking-widest w-fit"
            >
              <span aria-hidden="true">←</span> Back to Terminal
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-sans font-semibold tracking-tight text-white flex items-center gap-3">
                <span className="text-accent-amber text-glow-amber">/</span> SoDEX Profile
              </h1>
              <p className="text-text-secondary font-sans text-sm mt-2">
                {walletAddress ? `Connected: ${shortAddress(walletAddress)}` : 'Connect wallet to load live SoDEX account state'}
              </p>
            </div>
          </div>

          {!walletAddress && (
            <EmptyState
              title="Wallet Required"
              detail="Connect and sign with your wallet to load real SoDEX balances, positions, orders, and trades. Mock dashboard data has been removed."
            />
          )}

          {errorMessage && (
            <div className="border border-accent-red/40 bg-accent-red/[0.06] rounded-md p-4 text-[11px] font-mono text-accent-red">
              {errorMessage}
            </div>
          )}

          {walletAddress && isLoading && (
            <div className="border border-accent-green/30 bg-accent-green/[0.05] rounded-md p-4 text-[11px] font-mono text-accent-green uppercase tracking-widest">
              Loading SoDEX profile data...
            </div>
          )}

          {profile && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                <StatCard
                  label="Net SoDEX Value"
                  value={formatUsd(profile.summary.netValueUsd)}
                  detail={`Spot ${formatUsd(profile.summary.spotBalanceValueUsd)} / Perps ${formatUsd(profile.summary.perpsAccountValueUsd)}`}
                />
                <StatCard
                  label="Open Risk"
                  value={`${profile.summary.activePositions} Positions`}
                  detail={`${profile.summary.activeOrders} open orders`}
                  accent="amber"
                />
                <StatCard
                  label="24h Trade Volume"
                  value={formatUsd(profile.summary.tradeVolume24hUsd)}
                  detail={`${profile.summary.recentTrades} recent fills`}
                  accent="blue"
                />
              </div>

              {profile.summary.warnings.length > 0 && (
                <div className="border border-accent-amber/35 bg-accent-amber/[0.06] rounded-md p-4">
                  <div className="text-[10px] font-mono text-accent-amber uppercase tracking-widest mb-2">Partial Data</div>
                  <ul className="space-y-1 text-[10px] font-mono text-text-secondary">
                    {profile.summary.warnings.slice(0, 4).map((warning) => (
                      <li key={warning}>- {warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-sans font-medium text-text-secondary">Spot Balances</h2>
                      <span className="text-xs font-mono text-accent-green">{profile.spot.balances.length}</span>
                    </div>
                    <div className="flex flex-col gap-3">
                      {profile.spot.balances.length > 0 ? (
                        profile.spot.balances.slice(0, 8).map((balance) => (
                          <BalanceRow key={balance.asset} balance={balance} />
                        ))
                      ) : (
                        <EmptyState title="No Spot Balances" detail="No non-zero SoDEX spot balances were returned." />
                      )}
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-sans font-medium text-text-secondary">Perps Positions</h2>
                      <span className="text-xs font-mono text-accent-amber">{profile.perps.positions.length}</span>
                    </div>
                    <div className="flex flex-col gap-3">
                      {profile.perps.positions.length > 0 ? (
                        profile.perps.positions.slice(0, 8).map((position) => (
                          <PositionRow key={position.symbol} position={position} />
                        ))
                      ) : (
                        <EmptyState title="No Perps Positions" detail="No active SoDEX perpetual positions were returned." />
                      )}
                    </div>
                  </section>
                </div>

                <div className="lg:col-span-2 space-y-6">
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-sans font-medium text-text-secondary">Open Orders</h2>
                      <span className="text-xs font-mono text-accent-green">{profile.openOrders.length}</span>
                    </div>
                    <OrderList orders={profile.openOrders.slice(0, 6)} />
                  </section>

                  <section className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-sm font-sans font-medium text-text-secondary">Recent Trades</h2>
                      <div className="flex gap-2">
                        {(['all', 'spot', 'perps'] as const).map((filter) => (
                          <button
                            key={filter}
                            type="button"
                            onClick={() => setTradeFilter(filter)}
                            className={`text-[10px] font-mono px-2 py-1 rounded transition-colors uppercase ${
                              tradeFilter === filter
                                ? 'bg-white/10 text-white'
                                : 'bg-white/5 text-text-secondary hover:text-white'
                            }`}
                          >
                            {filter}
                          </button>
                        ))}
                      </div>
                    </div>
                    <TradeTable trades={filteredTrades} />
                  </section>
                </div>
              </div>

              <div className="text-[9px] font-mono text-text-secondary uppercase tracking-widest border-t border-border/40 pt-4">
                Source: {profile.source} / Synced {formatTimestamp(profile.fetchedAt)}
              </div>
            </>
          )}
        </div>
      </main>

      <div className="crt-overlay pointer-events-none fixed inset-0 z-50" />
      <div className="crt-vignette pointer-events-none fixed inset-0 z-50" />
      <SystemManualModal isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
    </div>
  );
}
