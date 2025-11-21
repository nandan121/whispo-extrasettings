import { Control, ControlGroup } from "@renderer/components/ui/control"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select"
import { Switch } from "@renderer/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip"
import {
  CHAT_PROVIDER_ID,
  CHAT_PROVIDERS,
  STT_PROVIDER_ID,
  STT_PROVIDERS,
} from "@shared/index"
import { Textarea } from "@renderer/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@renderer/components/ui/dialog"
import { Button } from "@renderer/components/ui/button"
import {
  useConfigQuery,
  useSaveConfigMutation,
} from "@renderer/lib/query-client"
import { Config } from "@shared/types"
import { ShortcutRecorder } from "@renderer/components/shortcut-recorder"
import { tipcClient } from "@renderer/lib/tipc-client"

export function Component() {
  const configQuery = useConfigQuery()

  const saveConfigMutation = useSaveConfigMutation()

  const saveConfig = (config: Partial<Config>) => {
    saveConfigMutation.mutate({
      config: {
        ...configQuery.data,
        ...config,
      },
    })
  }

  const sttProviderId: STT_PROVIDER_ID =
    configQuery.data?.sttProviderId || "openai"
  const shortcut = configQuery.data?.shortcut || "Ctrl+Space"
  const shortcutMode = configQuery.data?.shortcutMode || "hold"
  const cleanupShortcut = configQuery.data?.cleanupShortcut || "Ctrl+Shift+C"
  const cleanupShortcutMode = configQuery.data?.cleanupShortcutMode || "toggle"
  const transcriptPostProcessingProviderId: CHAT_PROVIDER_ID =
    configQuery.data?.transcriptPostProcessingProviderId || "openai"
  const textCleanupProviderId: CHAT_PROVIDER_ID =
    configQuery.data?.textCleanupProviderId || "openai"

  if (!configQuery.data) return null

  return (
    <div className="grid gap-4">
      {process.env.IS_MAC && (
        <ControlGroup title="App">
          <Control label="Hide Dock Icon" className="px-3">
            <Switch
              defaultChecked={configQuery.data.hideDockIcon}
              onCheckedChange={(value) => {
                saveConfig({
                  hideDockIcon: value,
                })
              }}
            />
          </Control>
        </ControlGroup>
      )}

      <ControlGroup
        title="Shortcuts"
        endDescription={
          <div className="flex items-center gap-1">
            <div>
              Click to record a new shortcut.
            </div>
            <TooltipProvider disableHoverableContent delayDuration={0}>
              <Tooltip>
                <TooltipTrigger className="inline-flex items-center justify-center">
                  <span className="i-mingcute-information-fill text-base"></span>
                </TooltipTrigger>
                <TooltipContent collisionPadding={5}>
                  Press keys to record. Click outside to cancel.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        }
      >
        <Control label="Recording" className="px-3">
          <div className="flex flex-col gap-2 flex-1">
            <ShortcutRecorder
              value={shortcut}
              onChange={(value) => {
                saveConfig({
                  shortcut: value,
                })
              }}
            />
            <div className="flex items-center gap-2">
              <Switch
                checked={shortcutMode === "hold"}
                onCheckedChange={(checked) => {
                  saveConfig({
                    shortcutMode: checked ? "hold" : "toggle"
                  })
                }}
              />
              <span className="text-sm text-muted-foreground">Push to Talk (Hold to Record)</span>
            </div>
          </div>
        </Control>
      </ControlGroup>

      <ControlGroup title="Speech to Text">
        <Control label="Provider" className="px-3">
          <Select
            defaultValue={sttProviderId}
            onValueChange={(value) => {
              saveConfig({
                sttProviderId: value as STT_PROVIDER_ID,
              })
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STT_PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Control>
      </ControlGroup>

      <ControlGroup title="Transcript Post-Processing">
        <Control label="Enabled" className="px-3">
          <Switch
            defaultChecked={configQuery.data.transcriptPostProcessingEnabled}
            onCheckedChange={(value) => {
              saveConfig({
                transcriptPostProcessingEnabled: value,
                // Initialize default prompt when enabling
                ...(value && !configQuery.data?.transcriptPostProcessingPrompt && {
                  transcriptPostProcessingPrompt: "Clean up this text: fix grammar, punctuation, and formatting. Do not change meaning or tone. Do not add any more text\n\n{transcript}"
                }),
              })
            }}
          />
        </Control>

        {configQuery.data.transcriptPostProcessingEnabled && (
          <>
            <Control label="Provider" className="px-3">
              <Select
                defaultValue={transcriptPostProcessingProviderId}
                onValueChange={(value) => {
                  saveConfig({
                    transcriptPostProcessingProviderId:
                      value as CHAT_PROVIDER_ID,
                  })
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHAT_PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Control>

            <Control label="Prompt" className="px-3">
              <div className="flex flex-col items-end gap-1 text-right">
                {configQuery.data.transcriptPostProcessingPrompt && (
                  <div className="line-clamp-3 text-sm text-neutral-500 dark:text-neutral-400">
                    {configQuery.data.transcriptPostProcessingPrompt}
                  </div>
                )}
                <Dialog>
                  <DialogTrigger className="" asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 gap-1 px-2"
                    >
                      <span className="i-mingcute-edit-2-line"></span>
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit Prompt</DialogTitle>
                    </DialogHeader>
                    <Textarea
                      rows={10}
                      defaultValue={
                        configQuery.data.transcriptPostProcessingPrompt ||
                        "Clean up this text: fix grammar, punctuation, and formatting. Do not change meaning or tone. Do not add any more text\n\n{transcript}"
                      }
                      onChange={(e) => {
                        saveConfig({
                          transcriptPostProcessingPrompt: e.currentTarget.value,
                        })
                      }}
                    ></Textarea>
                    <div className="text-sm text-muted-foreground">
                      Use <span className="select-text">{"{transcript}"}</span>{" "}
                      placeholder to insert the original transcript
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </Control>
          </>
        )}
      </ControlGroup>

      <ControlGroup title="Text Cleanup">
        <Control label="Enabled" className="px-3">
          <Switch
            defaultChecked={configQuery.data?.textCleanupEnabled}
            onCheckedChange={(value) => {
              saveConfig({
                textCleanupEnabled: value,
                // Initialize default prompt template when enabling
                ...(value && !configQuery.data?.textCleanupPromptTemplate && {
                  textCleanupPromptTemplate: "\"{command}\" for the following text. The request is only for editing the text. Do not reply back with anything other that text edits requested. Only English, otherwise just return back the below text.\n\n{selected_text}"
                }),
              })
            }}
          />
        </Control>

        <Control label="Shortcut" className="px-3">
          <div className="flex flex-col gap-2 flex-1">
            <ShortcutRecorder
              value={cleanupShortcut}
              onChange={(value) => {
                saveConfig({
                  cleanupShortcut: value,
                })
              }}
            />
            <div className="flex items-center gap-2">
              <Switch
                checked={cleanupShortcutMode === "hold"}
                onCheckedChange={(checked) => {
                  saveConfig({
                    cleanupShortcutMode: checked ? "hold" : "toggle"
                  })
                }}
              />
              <span className="text-sm text-muted-foreground">Push to Talk (Hold to Record)</span>
            </div>
          </div>
        </Control>

        {configQuery.data?.textCleanupEnabled && (
          <>
            <Control label="Provider" className="px-3">
              <Select
                defaultValue={textCleanupProviderId}
                onValueChange={(value) => {
                  saveConfig({
                    textCleanupProviderId:
                      value as CHAT_PROVIDER_ID,
                  })
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHAT_PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Control>

            <Control label="Prompt Template" className="px-3">
              <div className="flex flex-col items-end gap-1 text-right">
                {configQuery.data.textCleanupPromptTemplate && (
                  <div className="line-clamp-3 text-sm text-neutral-500 dark:text-neutral-400">
                    {configQuery.data.textCleanupPromptTemplate}
                  </div>
                )}
                <Dialog>
                  <DialogTrigger className="" asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 gap-1 px-2"
                    >
                      <span className="i-mingcute-edit-2-line"></span>
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit Cleanup Prompt Template</DialogTitle>
                    </DialogHeader>
                    <Textarea
                      rows={6}
                      defaultValue={
                        configQuery.data.textCleanupPromptTemplate ||
                        "\"{command}\" for the following text. The request is only for editing the text. Do not reply back with anything other that text edits requested. Only English, otherwise just return back the below text.\n\n{selected_text}"
                      }
                      onChange={(e) => {
                        saveConfig({
                          textCleanupPromptTemplate: e.currentTarget.value,
                        })
                      }}
                      onBlur={(e) => {
                        // Ensure it's saved when focus leaves
                        saveConfig({
                          textCleanupPromptTemplate: e.currentTarget.value,
                        })
                      }}
                    ></Textarea>
                    <div className="text-sm text-muted-foreground">
                      Use <span className="select-text">{"{selected_text}"}</span>{" "}
                      and <span className="select-text">{"{command}"}</span>{" "}
                      placeholders
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </Control>
          </>
        )}
      </ControlGroup>

      <div className="flex justify-end px-3 pb-4">
        <Button
          variant="destructive"
          onClick={() => {
            tipcClient.quitApp()
          }}
        >
          Exit Application
        </Button>
      </div>
    </div>
  )
}
