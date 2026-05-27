'use client';
import React, { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };
  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-[#030503] text-red-500 font-mono">
          <div className="p-6 border border-red-500 bg-red-500/10 rounded-md">
            <h2 className="text-xl font-bold mb-2">System Error</h2>
            <p className="text-sm">{this.state.error?.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
