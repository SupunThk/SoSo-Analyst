import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DisclaimerModal from '@/components/DisclaimerModal';

vi.mock('framer-motion', () => {
  const stripMotionProps = (props: Record<string, unknown>) => {
    const rest = { ...props };
    delete rest.animate;
    delete rest.exit;
    delete rest.initial;
    delete rest.transition;
    return rest;
  };

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: (props: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
        <div {...stripMotionProps(props)} />
      ),
    },
  };
});

describe('DisclaimerModal', () => {
  it('requires acknowledgement before accepting and resets after close', () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const { rerender } = render(
      <DisclaimerModal isOpen onAccept={onAccept} onDecline={onDecline} />
    );

    const acceptButton = screen.getByRole('button', { name: /accept and continue/i });
    expect(acceptButton).toBeDisabled();

    fireEvent.click(acceptButton);
    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(acceptButton).toBeEnabled();

    fireEvent.click(acceptButton);
    expect(onAccept).toHaveBeenCalledTimes(1);

    rerender(<DisclaimerModal isOpen={false} onAccept={onAccept} onDecline={onDecline} />);
    rerender(<DisclaimerModal isOpen onAccept={onAccept} onDecline={onDecline} />);

    expect(screen.getByRole('button', { name: /accept and continue/i })).toBeDisabled();
  });

  it('declines when Escape is pressed', () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    render(<DisclaimerModal isOpen onAccept={onAccept} onDecline={onDecline} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });
});
