import { Control, ControlGroup } from "@renderer/components/ui/control"
import { Input } from "@renderer/components/ui/input"
import {
  useConfigQuery,
  useSaveConfigMutation,
} from "@renderer/lib/query-client"
import { Config } from "@shared/types"

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

  return (
    <div className="grid gap-4">
      <ControlGroup title="OpenAI">
        <Control label="API Key" className="px-3">
          <Input
            type="password"
            defaultValue={configQuery.data.openaiApiKey}
            onChange={(e) => {
              saveConfig({
                openaiApiKey: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="API Base URL" className="px-3">
          <Input
            type="url"
            placeholder="https://api.openai.com/v1"
            defaultValue={configQuery.data.openaiBaseUrl}
            onChange={(e) => {
              saveConfig({
                openaiBaseUrl: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="STT Model" className="px-3">
          <Input
            type="text"
            placeholder="whisper-1"
            defaultValue={configQuery.data.openaiSttModel}
            onChange={(e) => {
              saveConfig({
                openaiSttModel: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="Chat Model" className="px-3">
          <Input
            type="text"
            placeholder="gpt-4o-mini"
            defaultValue={configQuery.data.openaiChatModel}
            onChange={(e) => {
              saveConfig({
                openaiChatModel: e.currentTarget.value,
              })
            }}
          />
        </Control>
      </ControlGroup>

      <ControlGroup title="Groq">
        <Control label="API Key" className="px-3">
          <Input
            type="password"
            defaultValue={configQuery.data.groqApiKey}
            onChange={(e) => {
              saveConfig({
                groqApiKey: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="API Base URL" className="px-3">
          <Input
            type="url"
            placeholder="https://api.groq.com/openai/v1"
            defaultValue={configQuery.data.groqBaseUrl}
            onChange={(e) => {
              saveConfig({
                groqBaseUrl: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="STT Model" className="px-3">
          <Input
            type="text"
            placeholder="whisper-large-v3"
            defaultValue={configQuery.data.groqSttModel}
            onChange={(e) => {
              saveConfig({
                groqSttModel: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="Chat Model" className="px-3">
          <Input
            type="text"
            placeholder="llama-3.3-70b-versatile"
            defaultValue={configQuery.data.groqChatModel}
            onChange={(e) => {
              saveConfig({
                groqChatModel: e.currentTarget.value,
              })
            }}
          />
        </Control>
      </ControlGroup>

      <ControlGroup title="Gemini">
        <Control label="API Key" className="px-3">
          <Input
            type="password"
            defaultValue={configQuery.data.geminiApiKey}
            onChange={(e) => {
              saveConfig({
                geminiApiKey: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="API Base URL" className="px-3">
          <Input
            type="url"
            placeholder="https://generativelanguage.googleapis.com"
            defaultValue={configQuery.data.geminiBaseUrl}
            onChange={(e) => {
              saveConfig({
                geminiBaseUrl: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="Chat Model" className="px-3">
          <Input
            type="text"
            placeholder="gemini-flash-latest"
            defaultValue={configQuery.data.geminiChatModel}
            onChange={(e) => {
              saveConfig({
                geminiChatModel: e.currentTarget.value,
              })
            }}
          />
        </Control>
      </ControlGroup>

      <ControlGroup title="OpenAI Compat A">
        <Control label="API Key" className="px-3">
          <Input
            type="password"
            defaultValue={configQuery.data.custom1ApiKey}
            onChange={(e) => {
              saveConfig({
                custom1ApiKey: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="API Base URL" className="px-3">
          <Input
            type="url"
            placeholder="https://your-provider.com/v1"
            defaultValue={configQuery.data.custom1BaseUrl}
            onChange={(e) => {
              saveConfig({
                custom1BaseUrl: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="STT Model" className="px-3">
          <Input
            type="text"
            placeholder="Leave blank if no STT support"
            defaultValue={configQuery.data.custom1SttModel}
            onChange={(e) => {
              saveConfig({
                custom1SttModel: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="Chat Model" className="px-3">
          <Input
            type="text"
            placeholder="e.g. gpt-4o, llama-3, etc."
            defaultValue={configQuery.data.custom1ChatModel}
            onChange={(e) => {
              saveConfig({
                custom1ChatModel: e.currentTarget.value,
              })
            }}
          />
        </Control>
      </ControlGroup>

      <ControlGroup title="OpenAI Compat B">
        <Control label="API Key" className="px-3">
          <Input
            type="password"
            defaultValue={configQuery.data.custom2ApiKey}
            onChange={(e) => {
              saveConfig({
                custom2ApiKey: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="API Base URL" className="px-3">
          <Input
            type="url"
            placeholder="https://your-provider.com/v1"
            defaultValue={configQuery.data.custom2BaseUrl}
            onChange={(e) => {
              saveConfig({
                custom2BaseUrl: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="STT Model" className="px-3">
          <Input
            type="text"
            placeholder="Leave blank if no STT support"
            defaultValue={configQuery.data.custom2SttModel}
            onChange={(e) => {
              saveConfig({
                custom2SttModel: e.currentTarget.value,
              })
            }}
          />
        </Control>

        <Control label="Chat Model" className="px-3">
          <Input
            type="text"
            placeholder="e.g. gpt-4o, llama-3, etc."
            defaultValue={configQuery.data.custom2ChatModel}
            onChange={(e) => {
              saveConfig({
                custom2ChatModel: e.currentTarget.value,
              })
            }}
          />
        </Control>
      </ControlGroup>
    </div>
  )
}

