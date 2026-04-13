import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StoriesPanel, StoryDetail } from './StoriesPanel';

// Mock PreferencesContext because useDateFormat reads from it.
vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    preferences: { date_format: 'short' },
    updatePreference: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    stories: {
      list: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { api } from '@/lib/api';
const mockedList = api.stories.list as unknown as ReturnType<typeof vi.fn>;
const mockedGet = api.stories.get as unknown as ReturnType<typeof vi.fn>;
const mockedUpdate = api.stories.update as unknown as ReturnType<typeof vi.fn>;
const mockedDelete = api.stories.delete as unknown as ReturnType<typeof vi.fn>;

describe('StoriesPanel', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    mockedDelete.mockReset();
  });

  it('shows empty state when no stories exist', async () => {
    mockedList.mockResolvedValue([]);
    render(<StoriesPanel selectedStoryId={null} onSelectStory={vi.fn()} />);
    expect(await screen.findByText(/no stories yet/i)).toBeInTheDocument();
  });

  it('lists active stories with timeline label and separates concluded into a collapsed section', async () => {
    mockedList.mockResolvedValue([
      {
        id: 1,
        name: 'Active Alpha',
        queries: ['q'],
        summary: null,
        status: 'active',
        source_entry_id: null,
        concluded_at: null,
        created_at: '2026-04-10T00:00:00Z',
        latest_analysis: {
          timeline_label: 'new_development',
          new_development: true,
          created_at: '2026-04-12T00:00:00Z',
        },
        updated_at: '2026-04-12T00:00:00Z',
      },
      {
        id: 2,
        name: 'Wrapped Beta',
        queries: ['q'],
        summary: null,
        status: 'concluded',
        source_entry_id: null,
        concluded_at: '2026-04-11T00:00:00Z',
        created_at: '2026-04-05T00:00:00Z',
      },
    ]);

    const onSelect = vi.fn();
    render(<StoriesPanel selectedStoryId={null} onSelectStory={onSelect} />);

    expect(await screen.findByText('Active Alpha')).toBeInTheDocument();
    expect(screen.getByText(/new development/i)).toBeInTheDocument();

    // Concluded story is hidden until the section is expanded.
    expect(screen.queryByText('Wrapped Beta')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /concluded \(1\)/i });
    const user = userEvent.setup();
    await user.click(toggle);
    expect(screen.getByText('Wrapped Beta')).toBeInTheDocument();

    await user.click(screen.getByText('Active Alpha'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('shows error when loading fails', async () => {
    mockedList.mockRejectedValue(new Error('boom'));
    render(<StoriesPanel selectedStoryId={null} onSelectStory={vi.fn()} />);
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });
});

describe('StoryDetail', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    mockedDelete.mockReset();
  });

  it('renders name, summary, timeline entries, and grouped articles', async () => {
    mockedGet.mockResolvedValue({
      id: 5,
      name: 'SEC Crypto',
      queries: ['SEC crypto'],
      summary: 'Ongoing regulation changes.',
      status: 'active',
      source_entry_id: null,
      concluded_at: null,
      created_at: '2026-04-01T00:00:00Z',
      analyses: [
        {
          id: 10,
          new_development: false,
          concluded: false,
          timeline_label: 'no_change',
          summary: 'Nothing new.',
          rationale: 'n/a',
          article_ids: [],
          created_at: '2026-04-05T00:00:00Z',
        },
        {
          id: 11,
          new_development: true,
          concluded: false,
          timeline_label: 'new_development',
          summary: 'Policy shift.',
          rationale: 'Multiple sources.',
          article_ids: [101, 102],
          created_at: '2026-04-12T00:00:00Z',
        },
      ],
      articles: [
        {
          id: 101,
          url: 'https://example.com/a1',
          title: 'Framework Announced',
          snippet: 'SEC ...',
          source: 'example.com',
          published_at: '2026-04-11T00:00:00Z',
          fetched_at: '2026-04-12T00:00:00Z',
        },
        {
          id: 102,
          url: 'https://example.com/a2',
          title: 'Reactions Pour In',
          snippet: null,
          source: 'example.com',
          published_at: null,
          fetched_at: '2026-04-12T00:00:00Z',
        },
      ],
    });

    render(<StoryDetail storyId={5} />);

    expect(await screen.findByRole('heading', { name: 'SEC Crypto' })).toBeInTheDocument();
    expect(screen.getByText('Ongoing regulation changes.')).toBeInTheDocument();

    // Timeline shows the label only for new_development entries.
    expect(screen.getAllByText(/new development/i).length).toBeGreaterThan(0);
    // Timeline also includes the no-change entry's summary.
    expect(screen.getByText('Nothing new.')).toBeInTheDocument();

    // Articles are grouped by their analysis batch.
    expect(screen.getByText('Framework Announced')).toBeInTheDocument();
    expect(screen.getByText('Reactions Pour In')).toBeInTheDocument();
  });

  it('allows marking a story concluded', async () => {
    mockedGet.mockResolvedValue({
      id: 5,
      name: 'Story',
      queries: ['q'],
      summary: null,
      status: 'active',
      source_entry_id: null,
      concluded_at: null,
      created_at: '2026-04-01T00:00:00Z',
      analyses: [],
      articles: [],
    });
    mockedUpdate.mockResolvedValue({
      id: 5,
      name: 'Story',
      queries: ['q'],
      summary: null,
      status: 'concluded',
      source_entry_id: null,
      concluded_at: '2026-04-13T00:00:00Z',
      created_at: '2026-04-01T00:00:00Z',
    });

    render(<StoryDetail storyId={5} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /mark concluded/i }));

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith(5, { story: { status: 'concluded' } });
    });
  });

  it('deletes via the Delete button and fires onDeleted', async () => {
    mockedGet.mockResolvedValue({
      id: 5,
      name: 'Story',
      queries: ['q'],
      summary: null,
      status: 'active',
      source_entry_id: null,
      concluded_at: null,
      created_at: '2026-04-01T00:00:00Z',
      analyses: [],
      articles: [],
    });
    mockedDelete.mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    vi.stubGlobal('confirm', () => true);

    render(<StoryDetail storyId={5} onDeleted={onDeleted} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(mockedDelete).toHaveBeenCalledWith(5);
      expect(onDeleted).toHaveBeenCalledWith(5);
    });
  });
});
