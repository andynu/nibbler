import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FollowStoryDialog } from './FollowStoryDialog';

// Mock the api module at the boundary; tests drive behavior through these spies.
vi.mock('@/lib/api', () => ({
  api: {
    stories: {
      extractFromEntry: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Import the mocked api after the mock is registered so vi.fn()s are in scope.
import { api } from '@/lib/api';

const mockedExtract = api.stories.extractFromEntry as unknown as ReturnType<typeof vi.fn>;
const mockedCreate = api.stories.create as unknown as ReturnType<typeof vi.fn>;

describe('FollowStoryDialog', () => {
  beforeEach(() => {
    mockedExtract.mockReset();
    mockedCreate.mockReset();
  });

  it('does not extract when closed', () => {
    render(
      <FollowStoryDialog
        open={false}
        onOpenChange={() => {}}
        entryId={42}
      />
    );

    expect(mockedExtract).not.toHaveBeenCalled();
  });

  it('calls extract_from_entry when opened with an entry', async () => {
    mockedExtract.mockResolvedValue({
      topic: 'Test Topic',
      queries: ['q1', 'q2'],
      source_entry_id: 99,
    });

    render(
      <FollowStoryDialog
        open={true}
        onOpenChange={() => {}}
        entryId={42}
      />
    );

    await waitFor(() => {
      expect(mockedExtract).toHaveBeenCalledWith(42);
    });
  });

  it('populates name and queries from extraction result', async () => {
    mockedExtract.mockResolvedValue({
      topic: 'SEC Crypto',
      queries: ['SEC crypto', 'crypto enforcement'],
      source_entry_id: 99,
    });

    render(
      <FollowStoryDialog
        open={true}
        onOpenChange={() => {}}
        entryId={42}
      />
    );

    const nameInput = await screen.findByLabelText('Story name') as HTMLInputElement;
    expect(nameInput.value).toBe('SEC Crypto');

    const query1 = screen.getByLabelText('Search query 1') as HTMLInputElement;
    const query2 = screen.getByLabelText('Search query 2') as HTMLInputElement;
    expect(query1.value).toBe('SEC crypto');
    expect(query2.value).toBe('crypto enforcement');
  });

  it('shows error when extraction fails', async () => {
    mockedExtract.mockRejectedValue(new Error('LLM unreachable'));

    render(
      <FollowStoryDialog
        open={true}
        onOpenChange={() => {}}
        entryId={42}
      />
    );

    expect(await screen.findByText('LLM unreachable')).toBeInTheDocument();
  });

  it('creates story with edited values on save', async () => {
    const user = userEvent.setup();
    mockedExtract.mockResolvedValue({
      topic: 'Original',
      queries: ['q1'],
      source_entry_id: 99,
    });
    mockedCreate.mockResolvedValue({
      id: 7,
      name: 'Edited',
      queries: ['edited query'],
      summary: null,
      status: 'active',
      source_entry_id: 99,
      concluded_at: null,
      created_at: '2026-04-13T00:00:00Z',
    });

    const onStoryCreated = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <FollowStoryDialog
        open={true}
        onOpenChange={onOpenChange}
        entryId={42}
        onStoryCreated={onStoryCreated}
      />
    );

    const nameInput = await screen.findByLabelText('Story name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Edited');

    const query1 = screen.getByLabelText('Search query 1');
    await user.clear(query1);
    await user.type(query1, 'edited query');

    await user.click(screen.getByRole('button', { name: /follow/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({
        story: {
          name: 'Edited',
          queries: ['edited query'],
          source_entry_id: 99,
        },
      });
    });
    expect(onStoryCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('validates name and at least one query before saving', async () => {
    const user = userEvent.setup();
    mockedExtract.mockResolvedValue({
      topic: '',
      queries: [''],
      source_entry_id: 99,
    });

    render(
      <FollowStoryDialog
        open={true}
        onOpenChange={() => {}}
        entryId={42}
      />
    );

    await screen.findByLabelText('Story name');
    await user.click(screen.getByRole('button', { name: /follow/i }));

    expect(await screen.findByText(/provide a name and at least one query/i)).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('allows adding and removing queries', async () => {
    const user = userEvent.setup();
    mockedExtract.mockResolvedValue({
      topic: 'T',
      queries: ['q1', 'q2'],
      source_entry_id: 99,
    });

    render(
      <FollowStoryDialog
        open={true}
        onOpenChange={() => {}}
        entryId={42}
      />
    );

    await screen.findByLabelText('Search query 1');

    await user.click(screen.getByRole('button', { name: /add query/i }));
    expect(screen.getByLabelText('Search query 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove query 1/i }));
    expect(screen.queryByDisplayValue('q1')).not.toBeInTheDocument();
  });
});
