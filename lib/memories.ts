export interface Memories {
  user_profile: string | null;
  current_focus: string | null;
  interaction_style: string | null;
  avoid_topics: string | null;
}

export const getMemories = (): Memories | null => {
  if (typeof window === 'undefined') return null;
  const savedMemories = localStorage.getItem('omni_memories');
  if (savedMemories) {
    try {
      let parsed = JSON.parse(savedMemories);
      if (Array.isArray(parsed)) {
        // Migration from old string[] array format
        return {
          user_profile: parsed.join(', '),
          current_focus: null,
          interaction_style: null,
          avoid_topics: null,
        };
      }

      return parsed as Memories;
    } catch (e) {
      console.error('Failed to parse memories', e);
    }
  }
  return null;
};

export const appendQueryToMemoryQueue = async (query: string) => {
  if (typeof window === 'undefined') return;

  const savedEnableMemories = localStorage.getItem('omni_enable_memories');
  if (savedEnableMemories === 'false') return;

  const queueKey = 'omni_memory_query_queue';
  let queue: string[] = [];
  try {
    const queueStr = localStorage.getItem(queueKey);
    if (queueStr) {
      queue = JSON.parse(queueStr);
    }
  } catch (e) { }

  queue.push(query);

  if (queue.length >= 3) {
    const past_queries = [...queue];
    const pastMemoriesRaw = getMemories();

    // Clean null fields which might trigger Pydantic 422 Unprocessable Entity
    const cleanedMemories: Partial<Memories> = {};
    if (pastMemoriesRaw) {
      if (pastMemoriesRaw.user_profile) cleanedMemories.user_profile = pastMemoriesRaw.user_profile;
      if (pastMemoriesRaw.current_focus) cleanedMemories.current_focus = pastMemoriesRaw.current_focus;
      if (pastMemoriesRaw.interaction_style) cleanedMemories.interaction_style = pastMemoriesRaw.interaction_style;
      if (pastMemoriesRaw.avoid_topics) cleanedMemories.avoid_topics = pastMemoriesRaw.avoid_topics;
    }

    const requestBody: { past_queries: string[]; past_memories?: Partial<Memories> } = { past_queries };
    if (Object.keys(cleanedMemories).length > 0) {
      requestBody.past_memories = cleanedMemories;
    }

    // Clear queue early to prevent duplicate processing
    localStorage.removeItem(queueKey);

    try {
      const apiEndpoint = process.env.NEXT_PUBLIC_BACKEND_URL ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/update_memories` : '/api/update_memories';
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        let data = await response.json();
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (e) { }
        }

        const newMemories: Memories = data;
        localStorage.setItem('omni_memories', JSON.stringify(newMemories));

        // Dispatch an event so the UI can update immediately across components
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('memories_updated'));
        }
      } else {
        // If it failed, we could optionally restore the queue, but here we just ignore
        console.error('Failed to update memories from API');
      }
    } catch (e) {
      console.error('Error updating memories', e);
    }
  } else {
    localStorage.setItem(queueKey, JSON.stringify(queue));
  }
};
