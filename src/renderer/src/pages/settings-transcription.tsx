import { Control, ControlGroup } from "@renderer/components/ui/control"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@renderer/components/ui/select"
import { Switch } from "@renderer/components/ui/switch"
import { Textarea } from "@renderer/components/ui/textarea"
import {
    useConfigQuery,
    useSaveConfigMutation,
} from "@renderer/lib/query-client"
import { Config } from "@shared/types"
import { SUPPORTED_LANGUAGES } from "@renderer/lib/language-codes"

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

    if (!configQuery.data) return null

    const transcriptionLanguage = configQuery.data.transcriptionLanguage || "auto"
    const transcriptionPrompt = configQuery.data.transcriptionPrompt || ""

    return (
        <div className="grid gap-4">
            <ControlGroup
                title="Language"
                endDescription="Select the language for transcription. Auto will detect language automatically."
            >
                <Control label="Transcription Language" className="px-3">
                    <Select
                        value={transcriptionLanguage}
                        onValueChange={(value) => {
                            saveConfig({
                                transcriptionLanguage: value,
                            })
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="auto">Auto (Detect Automatically)</SelectItem>
                            {SUPPORTED_LANGUAGES.map((lang) => (
                                <SelectItem key={lang.code} value={lang.code}>
                                    {lang.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Control>
            </ControlGroup>

            <ControlGroup
                title="Custom Words"
                endDescription='Example: "ChatGPT, OpenAI, Groq, Gemini"'
            >
                <div className="px-3 py-3 bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-500 text-sm">
                    <div className="flex gap-2">
                        <span className="i-mingcute-alert-fill text-amber-600 dark:text-amber-500 text-lg shrink-0 mt-0.5"></span>
                        <div className="text-amber-900 dark:text-amber-200">
                            <strong>Important:</strong> Custom words should match your transcription language. If speaking in a different language than your phrases (e.g., phrases in English but speaking Hindi), <strong>disable "Use Custom Words"</strong> to avoid romanization issues and get correct native script output.
                        </div>
                    </div>
                </div>

                <Control label="Use Custom Words" className="px-3">
                    <Switch
                        checked={configQuery.data.transcriptionPromptEnabled !== false}
                        onCheckedChange={(checked) => {
                            saveConfig({
                                transcriptionPromptEnabled: checked,
                            })
                        }}
                    />
                </Control>

                <Control label="Prompt Words/Phrases" className="px-3">
                    <Textarea
                        rows={4}
                        placeholder="ChatGPT, OpenAI, Groq, Whisper, Gemini, API"
                        defaultValue={transcriptionPrompt}
                        disabled={configQuery.data.transcriptionPromptEnabled === false}
                        onBlur={(e) => {
                            saveConfig({
                                transcriptionPrompt: e.currentTarget.value,
                            })
                        }}
                    />
                </Control>
            </ControlGroup>
        </div>
    )
}
