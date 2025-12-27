import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders title and description', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete Feed"
        description="Are you sure you want to delete this feed?"
        onConfirm={() => {}}
      />
    );

    expect(screen.getByText('Delete Feed')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this feed?')).toBeInTheDocument();
  });

  it('uses default button labels', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Confirm"
        description="Continue?"
        onConfirm={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('uses custom button labels', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="Sure?"
        onConfirm={() => {}}
        confirmLabel="Yes, delete"
        cancelLabel="No, keep it"
      />
    );

    expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No, keep it' })).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="Sure?"
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onOpenChange with false when cancel clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete"
        description="Sure?"
        onConfirm={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not render when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={() => {}}
        title="Hidden Dialog"
        description="Should not be visible"
        onConfirm={() => {}}
      />
    );

    expect(screen.queryByText('Hidden Dialog')).not.toBeInTheDocument();
  });

  it('calls onOpenChange(false) after confirm', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete"
        description="Sure?"
        onConfirm={onConfirm}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('applies destructive variant to confirm button', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={() => {}}
        title="Delete"
        description="This cannot be undone"
        onConfirm={() => {}}
        variant="destructive"
      />
    );

    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    expect(confirmButton).toHaveClass('bg-destructive');
  });
});
