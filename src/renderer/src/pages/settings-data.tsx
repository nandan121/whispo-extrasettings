import { Button } from "@renderer/components/ui/button"
import { Control, ControlGroup } from "@renderer/components/ui/control"
import { Input } from "@renderer/components/ui/input"
import { tipcClient } from "@renderer/lib/tipc-client"
import { queryClient } from "@renderer/lib/query-client"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"

export function Component() {
  const deleteRecordingHistoryMutation = useMutation({
    mutationFn: tipcClient.deleteRecordingHistory,
    onSuccess() {},
  })
  
  const clearHistoryMutation = useMutation({
    mutationFn: tipcClient.clearHistory,
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["recording-history"] })
    },
  })

  const [days, setDays] = useState(5)

  return (
    <div>
      <ControlGroup>
        <Control label="Clear Older Recordings" className="px-3">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              className="h-7 w-20"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
            <span className="text-sm">days</span>
            <Button
              variant="ghost"
              className="h-7 gap-1 px-2 py-0 text-red-500 hover:text-red-500"
              onClick={() => {
                if (
                  window.confirm(
                    `Are you sure you want to delete all recordings older than ${days} days? This action cannot be undone.`,
                  )
                ) {
                  clearHistoryMutation.mutate({ days })
                }
              }}
            >
              <span className="i-mingcute-delete-2-fill"></span>
              <span>Clear</span>
            </Button>
          </div>
        </Control>
        <Control label="History Recordings" className="px-3">
          <Button
            variant="ghost"
            className="h-7 gap-1 px-2 py-0 text-red-500 hover:text-red-500"
            onClick={() => {
              if (
                window.confirm(
                  "Are you absolutely sure to remove all recordings forever?",
                )
              ) {
                deleteRecordingHistoryMutation.mutate()
              }
            }}
          >
            <span className="i-mingcute-delete-2-fill"></span>
            <span>Delete All</span>
          </Button>
        </Control>
      </ControlGroup>
    </div>
  )
}
