import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>ready</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('ready')).toBeInTheDocument();
  });
});
