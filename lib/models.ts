/**
 * The model picker's catalog. Mirrors `core/chat_models.py` on the backend —
 * ids, credit costs and the auth/image rules must match it exactly, because the
 * backend re-checks every one of them and will 400/401 a request the UI let
 * through.
 *
 * This replaced the Fast/Pro *mode* switch. A mode used to change the prompt,
 * the turn budget and the skill roster; a model changes only the weights.
 * Everything downstream — prompt, tools, skills — is identical across all of them.
 */

export type ChatModelId = 'best' | 'rix' | 'luna' | 'gemini'

export interface ChatModelInfo {
  id: ChatModelId
  label: string
  desc: string
  /**
   * Credits per turn. Not shown in the picker — kept because it mirrors
   * `MODE_CREDIT_COST` on the backend, which is what actually bills, and
   * `creditsFor` reads it. `best` is a router and is billed as the model it
   * routes to (see `serving_model` in core/chat_models.py): Luna today, so 3.
   * It goes back to 1 when the fine-tune takes its text path again.
   */
  credits: number
  requiresAuth: boolean
  /**
   * False for a text-only entry: an image turn would 400 server-side, so the
   * upload handlers in chat-view/search-home check this and refuse the file
   * before it is ever sent. True for every model listed today — `rix` is
   * multimodal (Gemma 4, served with vision) and reads images itself.
   */
  acceptsImages: boolean
  /** Renders the teal "New" chip beside the label. */
  isNew?: boolean
}

// `id` is the wire value and is persisted (localStorage preference, `mode` on
// stored message rows), so it stays fixed even when the display name changes.
export const CHAT_MODELS: ChatModelInfo[] = [
  {
    id: 'best',
    label: 'Best',
    desc: 'Automatically routes to the best model for your prompt',
    credits: 3,
    requiresAuth: false,
    acceptsImages: true,
  },
  {
    id: 'rix',
    label: 'Rix',
    desc: "Omni's experimental in-house model",
    credits: 1,
    requiresAuth: false,
    // Gemma 4 is multimodal, W&B serves the adapter with vision, and the
    // training set includes image turns. Mirrors `accepts_images` in
    // core/chat_models.py.
    acceptsImages: true,
    isNew: true,
  },
  {
    id: 'luna',
    label: 'GPT-6 Luna',
    desc: "OpenAI's latest versatile model",
    credits: 3,
    requiresAuth: true,
    acceptsImages: true,
  },
  {
    id: 'gemini',
    label: 'Gemini 3.6 Flash',
    desc: "Google's latest versatile model",
    credits: 3,
    requiresAuth: true,
    acceptsImages: true,
  },
]

export const DEFAULT_MODEL: ChatModelId = 'best'

const BY_ID = new Map(CHAT_MODELS.map((m) => [m.id, m]))

/**
 * Ids this catalog no longer lists but that are still out there: `fast` / `pro`
 * from before the mode/model switch, and `gemma` from before it was dropped
 * from the picker. All become `best` — the closest equivalent, and the only one
 * a guest whose preference was `pro` can still use.
 *
 * `gemma` is in the backend's `_LEGACY_ALIASES` too (Cerebras archived the
 * model, so it was removed there and maps to `best`), which keeps a rewind of a
 * thread created while it was selectable from 400ing.
 *
 * `rix` is deliberately absent. It sat here while the fine-tune was offline,
 * and this set is consulted *before* the catalog lookup below — so leaving it
 * would silently rewrite the user's choice to `best` and the model would
 * appear in the picker while never actually serving a turn.
 */
const LEGACY_IDS = new Set(['fast', 'pro', 'gemma'])

export function normalizeModelId(value: unknown): ChatModelId {
  if (typeof value !== 'string') return DEFAULT_MODEL
  if (LEGACY_IDS.has(value)) return DEFAULT_MODEL
  return BY_ID.has(value as ChatModelId) ? (value as ChatModelId) : DEFAULT_MODEL
}

export function getModel(id: ChatModelId): ChatModelInfo {
  return BY_ID.get(id) ?? CHAT_MODELS[0]
}

/** Whether this caller may select `id` right now. */
export function isModelLocked(id: ChatModelId, isSignedIn: boolean): boolean {
  return getModel(id).requiresAuth && !isSignedIn
}

/** What one turn costs. Image turns cost the same today: `best` routes both
 *  its text and image paths to Luna. */
export function creditsFor(id: ChatModelId): number {
  return getModel(id).credits
}

// Only shown for a model with `acceptsImages: false`; none is listed today.
export const IMAGE_UNSUPPORTED_MESSAGE =
  "This model can't read images. Switch to Best to send one."
