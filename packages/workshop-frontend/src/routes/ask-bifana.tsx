import { classifyRpcError, logRpcFailure } from '../rpcErrors'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight } from '@phosphor-icons/react'
import { useKumoToastManager } from '@cloudflare/kumo'
import { ChatInput } from '../ChatInterface'
import { useAuthenticatedApi } from '../AuthContext'
import { RpcStub } from 'capnweb'
import {
  Overseer,
  AiChatAuthorInfo,
  CapsuleSpecifier,
  ChatAttachmentHandle,
  MessageFormatRef,
  SlashCommandRequest,
} from '@gadgets/workshop-shared/api'
import {
  getStoredSelectedModel,
} from '../modelSelection'
import { useDocumentTitle } from '../useDocumentTitle'
import { homePromptFromSearch } from '../homePrompt'
import { composerDraftStorageKey } from '../composerDraft'
import { EMPLOYEE_CONVERSATION_SEARCH } from '../employeeConversationRoute'

type AskBifanaSearch = { prompt?: string }

const EXAMPLES = [
  'What is the latest information about Avenida Apartment?',
  'Which Lisbon properties currently need attention?',
  'Compare the latest authorized information for our Upkeep properties.',
]

export const Route = createFileRoute('/ask-bifana')({
  component: AskBifanaPage,
  validateSearch: (search: Record<string, unknown>): AskBifanaSearch => ({
    prompt: homePromptFromSearch(search.prompt),
  }),
})

function AskBifanaPage() {
  return <AskBifanaPageContent prompt={Route.useSearch().prompt} />
}

export function AskBifanaPageContent({ prompt }: AskBifanaSearch) {
  useDocumentTitle('Ask Bifana')

  const { authenticatedApi, currentUser } = useAuthenticatedApi()
  const navigate = useNavigate()
  const toasts = useKumoToastManager()

  const [models, setModels] = useState<AiChatAuthorInfo[]>([])
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [modelLoadState, setModelLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [modelLoadAttempt, setModelLoadAttempt] = useState(0)
  const [seed, setSeed] = useState<{ text: string; nonce: number } | null>(null)

  useEffect(() => {
    if (!prompt) return
    setSeed((previous) => ({ text: prompt, nonce: (previous?.nonce ?? 0) + 1 }))
    navigate({ to: '/ask-bifana', search: {}, replace: true })
  }, [navigate, prompt])

  useEffect(() => {
    let cancelled = false
    setModelLoadState('loading')
    authenticatedApi.listModels()
      .then((list) => {
        if (cancelled) return
        setModels(list)
        setSelectedModel(getStoredSelectedModel(list))
        setModelLoadState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setModelLoadState('error')
        logRpcFailure('Failed to fetch models:', err)
        if (classifyRpcError(err) !== 'connection') {
          toasts.add({ title: "Couldn't load AI models", variant: 'error' })
        }
      })
    return () => { cancelled = true }
    // `toasts` is deliberately not a dependency: useKumoToastManager returns a fresh object every
    // render, so including it refires this effect (and listModels) after its own setModels.
  }, [authenticatedApi, modelLoadAttempt])

  const provisionalOverseerRef = useRef<{ stub: RpcStub<Overseer> } | null>(null)

  const ensureProvisionalGadget = useCallback(() => {
    if (!provisionalOverseerRef.current) {
      provisionalOverseerRef.current = { stub: authenticatedApi.newGadget() }
    }
  }, [authenticatedApi])

  useEffect(() => () => {
    provisionalOverseerRef.current?.stub[Symbol.dispose]()
    provisionalOverseerRef.current = null
  }, [])

  const handleSend = useCallback(
    async (
      message: string | SlashCommandRequest,
      modelId: string | null,
      capsules?: CapsuleSpecifier[],
      attachments?: ChatAttachmentHandle[],
      formats?: MessageFormatRef[],
    ) => {
      try {
        ensureProvisionalGadget()
        const overseer = provisionalOverseerRef.current!.stub
        const [chat, { id }] = await Promise.all([
          overseer.newChat(message, modelId, capsules, attachments, formats),
          overseer.getMetadata(),
        ])
        provisionalOverseerRef.current?.stub[Symbol.dispose]()
        provisionalOverseerRef.current = null
        navigate({
          to: '/workspace/$id',
          params: { id },
          search: { chat, ...EMPLOYEE_CONVERSATION_SEARCH },
        })
      } catch (err) {
        const transient = logRpcFailure('Failed to create conversation:', err, {
          reportSite: 'workspace.create',
        })
        if (!attachments?.length && !capsules?.length) {
          provisionalOverseerRef.current?.stub[Symbol.dispose]()
          provisionalOverseerRef.current = null
        }
        if (!transient) {
          toasts.add({ title: 'Failed to start conversation', variant: 'error' })
        }
        throw err
      }
    },
    [ensureProvisionalGadget, navigate, toasts],
  )

  const getOverseer = useCallback((): RpcStub<Overseer> => {
    ensureProvisionalGadget()
    return provisionalOverseerRef.current!.stub
  }, [ensureProvisionalGadget])

  const createCapsuleGatekeeper = useCallback(
    (accountId: number, url: string) => {
      ensureProvisionalGadget()
      return provisionalOverseerRef.current!.stub.newGatekeeper(accountId, url)
    },
    [ensureProvisionalGadget],
  )

  return (
    <div className="relative isolate flex min-h-full w-full flex-col items-center justify-start bg-kumo-base px-4 pb-16 pt-10 sm:px-8 sm:pt-16 lg:pt-20">
      <div className="flex w-full max-w-[920px] flex-col items-stretch gap-8">
        <header className="text-center">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-kumo-brand">
            Lisbeyond's operational assistant
          </p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-kumo-default sm:text-4xl">
            Ask Bifana
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-[14px] leading-5 tracking-[-0.25px] text-kumo-subtle">
            Ask about a property, region, service, or workflow. Bifana can only use the connections
            and property information your Lisbeyond account is allowed to access.
          </p>
        </header>

        <ChatInput
          createCapsuleGatekeeper={createCapsuleGatekeeper}
          getOverseer={getOverseer}
          onSend={handleSend}
          isAgentActive={false}
          models={models}
          selectedModel={selectedModel}
          newChat
          offerFormats
          autoFocus
          minRows={3}
          seedText={seed?.text}
          seedNonce={seed?.nonce}
          blockedReason={modelLoadState === 'loading'
            ? 'Loading AI models…'
            : modelLoadState === 'error'
              ? 'AI models could not load.'
              : undefined}
          draftStorageKey={currentUser
            ? composerDraftStorageKey(currentUser.id, 'ask-bifana')
            : undefined}
        />

        {modelLoadState === 'error' && (
          <div
            className="flex items-center justify-center gap-2 text-[13px] text-kumo-subtle"
            role="alert"
          >
            <span>AI models could not load.</span>
            <button
              type="button"
              className="min-h-11 px-2 font-medium text-kumo-brand underline underline-offset-2 sm:min-h-10"
              onClick={() => setModelLoadAttempt((attempt) => attempt + 1)}
            >
              Try again
            </button>
          </div>
        )}

        <section aria-labelledby="ask-examples-title">
          <h2 id="ask-examples-title" className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-kumo-subtle">
            Example questions
          </h2>
          <div className="grid gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setSeed((previous) => ({
                  text: example,
                  nonce: (previous?.nonce ?? 0) + 1,
                }))}
                className="press group flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-xl border border-kumo-line bg-kumo-elevated px-4 py-3 text-left text-[13px] leading-[18px] text-kumo-default transition-[border-color,background-color,transform] duration-150 hover:border-kumo-fill hover:bg-kumo-tint active:scale-[0.99]"
              >
                <span>{example}</span>
                <ArrowRight size={14} className="shrink-0 text-kumo-inactive transition-colors group-hover:text-kumo-brand" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
