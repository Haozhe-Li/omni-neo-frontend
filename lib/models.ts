/**
 * The model picker's catalog. Mirrors `core/chat_models.py` on the backend —
 * ids, credit costs and the auth/image rules must match it exactly, because the
 * backend re-checks every one of them and will 400/401 a request the UI let
 * through.
 *
 * This replaced the Fast/Pro *mode* switch. A mode used to change the prompt,
 * the turn budget and the skill roster; a model changes only the weights.
 * Everything downstream — prompt, tools, skills — is identical across all five.
 */

export type ChatModelId = 'best' | 'rix' | 'gemma' | 'luna' | 'gemini'

export interface ChatModelInfo {
  id: ChatModelId
  label: string
  desc: string
  /**
   * Credits per turn. Not shown in the picker — kept because it mirrors
   * `MODE_CREDIT_COST` on the backend, which is what actually bills, and
   * `creditsFor` reads it. `best` is billed at 3 when the turn carries an
   * image, because the backend reroutes those to Gemma.
   */
  credits: number
  requiresAuth: boolean
  /** False only for `rix`: it is served text-only and 400s on an image. */
  acceptsImages: boolean
  /** Renders the teal "New" chip beside the label. */
  isNew?: boolean
}

// `id` is the wire value and is persisted (localStorage preference, `mode` on
// stored message rows), so it stays fixed even when the display name changes —
// `rix` is the model the UI calls Rix.
export const CHAT_MODELS: ChatModelInfo[] = [
  {
    id: 'best',
    label: 'Best',
    desc: 'Automatically routes to the best model for your prompt',
    credits: 1,
    requiresAuth: false,
    acceptsImages: true,
  },
  {
    id: 'rix',
    label: 'Rix',
    desc: "Omni's fast, experimental in-house model",
    credits: 1,
    requiresAuth: false,
    acceptsImages: false,
    isNew: true,
  },
  {
    id: 'gemma',
    label: 'Gemma 4',
    desc: "Google's latest open-weight model",
    credits: 3,
    requiresAuth: true,
    acceptsImages: true,
  },
  {
    id: 'luna',
    label: 'GPT-5.6 Luna',
    desc: "OpenAI's fast, well-rounded model",
    credits: 3,
    requiresAuth: true,
    acceptsImages: true,
  },
  {
    id: 'gemini',
    label: 'Gemini 3.6 Flash',
    desc: "Google's quick, low-latency model",
    credits: 3,
    requiresAuth: true,
    acceptsImages: true,
  },
]

export const DEFAULT_MODEL: ChatModelId = 'best'

const BY_ID = new Map(CHAT_MODELS.map((m) => [m.id, m]))

/**
 * Threads and localStorage written before this change carry `fast` / `pro`.
 * Both become `best` — the closest equivalent, and the only one a guest whose
 * preference was `pro` can still use.
 */
export function normalizeModelId(value: unknown): ChatModelId {
  if (typeof value !== 'string') return DEFAULT_MODEL
  if (value === 'fast' || value === 'pro') return DEFAULT_MODEL
  return BY_ID.has(value as ChatModelId) ? (value as ChatModelId) : DEFAULT_MODEL
}

export function getModel(id: ChatModelId): ChatModelInfo {
  return BY_ID.get(id) ?? CHAT_MODELS[0]
}

/** Whether this caller may select `id` right now. */
export function isModelLocked(id: ChatModelId, isSignedIn: boolean): boolean {
  return getModel(id).requiresAuth && !isSignedIn
}

/** What one turn costs, given whether the user is sending an image. */
export function creditsFor(id: ChatModelId, hasImage = false): number {
  const m = getModel(id)
  // `best` routes image turns to Gemma, and the user pays for the model that
  // actually ran. Mirrors `_charge_key` in core/routers/chat.py.
  if (hasImage && m.id === 'best') return 3
  return m.credits
}

export const IMAGE_UNSUPPORTED_MESSAGE =
  "Rix can't read images. Switch to Best to send one."
