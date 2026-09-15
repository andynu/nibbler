import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoryExtraction } from '@/lib/api';
import { FollowStoryDialog } from './FollowStoryDialog';

/** A promise whose settlement this test controls, to force response ordering. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

  it('saves without a source entry when extraction failed', async () => {
    const user = userEvent.setup();
    // entryId is a UserEntry id, and stories.source_entry_id references entries.
    // Only a successful extraction reports the matching Entry id.
    mockedExtract.mockRejectedValue(new Error('LLM unreachable'));
    mockedCreate.mockResolvedValue({
      id: 7,
      name: 'Manual',
      queries: ['manual query'],
      summary: null,
      status: 'active',
      source_entry_id: null,
      concluded_at: null,
      created_at: '2026-04-13T00:00:00Z',
    });

    render(
      <FollowStoryDialog
        open={true}
        onOpenChange={() => {}}
        entryId={42}
      />
    );

    await screen.findByText('LLM unreachable');
    await user.type(screen.getByLabelText('Story name'), 'Manual');
    await user.type(screen.getByLabelText('Search query 1'), 'manual query');
    await user.click(screen.getByRole('button', { name: /follow/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledTimes(1);
    });
    const { story } = mockedCreate.mock.calls[0][0];
    expect(story).toMatchObject({ name: 'Manual', queries: ['manual query'] });
    expect(story.source_entry_id).toBeUndefined();
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

  it('extracts once per opening, so edits made after the proposal arrives are kept', async () => {
    const user = userEvent.setup();
    // source_entry_id is an Entry id, unlike the UserEntry id the dialog opened
    // with. Any second request stays pending, as a slow LLM call would.
    mockedExtract
      .mockResolvedValueOnce({ topic: 'Original', queries: ['q1'], source_entry_id: 99 })
      .mockReturnValue(new Promise(() => {}));
    mockedCreate.mockResolvedValue({
      id: 7,
      name: 'Edited',
      queries: ['q1'],
      summary: null,
      status: 'active',
      source_entry_id: 99,
      concluded_at: null,
      created_at: '2026-04-13T00:00:00Z',
    });

    render(
      <FollowStoryDialog
        open={true}
        onOpenChange={() => {}}
        entryId={42}
      />
    );

    const nameInput = await screen.findByLabelText('Story name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Edited');
    await user.click(screen.getByRole('button', { name: /follow/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({
        story: { name: 'Edited', queries: ['q1'], source_entry_id: 99 },
      });
    });
    expect(mockedExtract).toHaveBeenCalledTimes(1);
  });

  it('ignores a proposal requested before the dialog was closed and reopened', async () => {
    const user = userEvent.setup();
    const beforeClose = deferred<StoryExtraction>();
    const afterReopen = deferred<StoryExtraction>();
    mockedExtract
      .mockReturnValueOnce(beforeClose.promise)
      .mockReturnValueOnce(afterReopen.promise);
    mockedCreate.mockReturnValue(new Promise(() => {}));

    const { rerender } = render(
      <FollowStoryDialog open={true} onOpenChange={() => {}} entryId={42} />
    );
    rerender(<FollowStoryDialog open={false} onOpenChange={() => {}} entryId={42} />);
    rerender(<FollowStoryDialog open={true} onOpenChange={() => {}} entryId={42} />);
    expect(mockedExtract).toHaveBeenCalledTimes(2);

    afterReopen.resolve({ topic: 'Reopened', queries: ['newer query'], source_entry_id: 100 });
    const nameInput = await screen.findByLabelText('Story name');
    expect(nameInput).toHaveValue('Reopened');
    await user.clear(nameInput);
    await user.type(nameInput, 'Edited');

    await act(async () => {
      beforeClose.resolve({ topic: 'Stale', queries: ['stale query'], source_entry_id: 99 });
    });

    expect(screen.getByLabelText('Story name')).toHaveValue('Edited');
    expect(screen.getByLabelText('Search query 1')).toHaveValue('newer query');
    await user.click(screen.getByRole('button', { name: /follow/i }));
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({
        story: { name: 'Edited', queries: ['newer query'], source_entry_id: 100 },
      });
    });
  });

  it('does not carry a proposal that lands while closed into the next opening', async () => {
    const beforeClose = deferred<StoryExtraction>();
    mockedExtract
      .mockReturnValueOnce(beforeClose.promise)
      .mockRejectedValueOnce(new Error('LLM unreachable'));

    const { rerender } = render(
      <FollowStoryDialog open={true} onOpenChange={() => {}} entryId={42} />
    );
    rerender(<FollowStoryDialog open={false} onOpenChange={() => {}} entryId={42} />);
    await act(async () => {
      beforeClose.resolve({ topic: 'Stale', queries: ['stale query'], source_entry_id: 99 });
    });
    rerender(<FollowStoryDialog open={true} onOpenChange={() => {}} entryId={43} />);

    await screen.findByText('LLM unreachable');
    expect(screen.getByLabelText('Story name')).toHaveValue('');
    expect(screen.getByLabelText('Search query 1')).toHaveValue('');
  });

  it('ignores a proposal for the entry the dialog showed before the current one', async () => {
    const user = userEvent.setup();
    const first = deferred<StoryExtraction>();
    const second = deferred<StoryExtraction>();
    mockedExtract
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    mockedCreate.mockReturnValue(new Promise(() => {}));

    const { rerender } = render(
      <FollowStoryDialog open={true} onOpenChange={() => {}} entryId={42} />
    );
    rerender(<FollowStoryDialog open={true} onOpenChange={() => {}} entryId={43} />);
    expect(mockedExtract).toHaveBeenLastCalledWith(43);

    second.resolve({ topic: 'Second entry', queries: ['second query'], source_entry_id: 200 });
    expect(await screen.findByLabelText('Story name')).toHaveValue('Second entry');

    await act(async () => {
      first.resolve({ topic: 'First entry', queries: ['first query'], source_entry_id: 99 });
    });

    expect(screen.getByLabelText('Story name')).toHaveValue('Second entry');
    expect(screen.getByLabelText('Search query 1')).toHaveValue('second query');
    await user.click(screen.getByRole('button', { name: /follow/i }));
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({
        story: { name: 'Second entry', queries: ['second query'], source_entry_id: 200 },
      });
    });
  });

  it('keeps waiting on the current entry when an earlier entry fails to extract', async () => {
    const user = userEvent.setup();
    const first = deferred<StoryExtraction>();
    const second = deferred<StoryExtraction>();
    mockedExtract
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    mockedCreate.mockReturnValue(new Promise(() => {}));

    const { rerender } = render(
      <FollowStoryDialog open={true} onOpenChange={() => {}} entryId={42} />
    );
    rerender(<FollowStoryDialog open={true} onOpenChange={() => {}} entryId={43} />);

    await act(async () => {
      first.reject(new Error('LLM unreachable'));
    });
    expect(screen.getByText('Generating queries...')).toBeInTheDocument();

    second.resolve({ topic: 'Second entry', queries: ['second query'], source_entry_id: 200 });
    expect(await screen.findByLabelText('Story name')).toHaveValue('Second entry');
    expect(screen.queryByText('LLM unreachable')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /follow/i }));
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({
        story: { name: 'Second entry', queries: ['second query'], source_entry_id: 200 },
      });
    });
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
