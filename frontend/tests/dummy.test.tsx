import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

describe('Dummy test', () => {
  it('renders without crashing', () => {
    render(
      <ErrorBoundary>
        <div>ready</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('ready')).toBeInTheDocument();
  });
});
