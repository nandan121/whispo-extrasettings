import { useState, useEffect, useRef } from "react"
import { cn } from "@renderer/lib/utils"

interface ShortcutRecorderProps {
    value?: string
    onChange: (value: string) => void
    className?: string
    placeholder?: string
}

export function ShortcutRecorder({
    value,
    onChange,
    className,
    placeholder = "Click to record shortcut",
}: ShortcutRecorderProps) {
    const [isRecording, setIsRecording] = useState(false)
    const [currentKeys, setCurrentKeys] = useState<Set<string>>(new Set())
    const buttonRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (!isRecording) return

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault()
            e.stopPropagation()

            const keys = new Set(currentKeys)

            // Map keys to a standardized format
            let key = e.code

            // Handle modifiers
            if (e.key === "Control") key = "Ctrl"
            if (e.key === "Shift") key = "Shift"
            if (e.key === "Alt") key = "Alt"
            if (e.key === "Meta") key = "Win"

            // Handle regular keys
            if (key.startsWith("Key")) key = key.slice(3)
            if (key.startsWith("Digit")) key = key.slice(5)
            if (key.startsWith("Numpad")) key = key.slice(6) // Numpad0-9 → 0-9, NumpadAdd → Add, etc.

            // Add to set
            keys.add(key)
            setCurrentKeys(keys)
        }

        const handleKeyUp = (e: KeyboardEvent) => {
            e.preventDefault()
            e.stopPropagation()

            // If we have a valid combination (at least one modifier and one key, or just a key if it's special), save it
            if (currentKeys.size > 0) {
                const sortedKeys = Array.from(currentKeys).sort((a, b) => {
                    const modifiers = ["Ctrl", "Win", "Alt", "Shift"]
                    const aIdx = modifiers.indexOf(a)
                    const bIdx = modifiers.indexOf(b)
                    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
                    if (aIdx !== -1) return -1
                    if (bIdx !== -1) return 1
                    return a.localeCompare(b)
                })

                // Save even if only modifiers are pressed
                onChange(sortedKeys.join("+"))
                setIsRecording(false)
                setCurrentKeys(new Set())
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        window.addEventListener("keyup", handleKeyUp)

        return () => {
            window.removeEventListener("keydown", handleKeyDown)
            window.removeEventListener("keyup", handleKeyUp)
        }
    }, [isRecording, currentKeys, onChange])

    const handleClick = () => {
        setIsRecording(true)
        setCurrentKeys(new Set())
    }

    const handleBlur = () => {
        setIsRecording(false)
        setCurrentKeys(new Set())
    }

    const displayValue = isRecording
        ? Array.from(currentKeys).join(" + ") || "Press keys..."
        : value || placeholder

    return (
        <button
            ref={buttonRef}
            className={cn(
                "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                isRecording && "border-primary ring-1 ring-primary",
                className
            )}
            onClick={handleClick}
            onBlur={handleBlur}
            type="button"
        >
            <span className={cn(!value && !isRecording && "text-muted-foreground")}>
                {displayValue}
            </span>
            {isRecording && <span className="text-xs text-muted-foreground animate-pulse">Recording...</span>}
        </button>
    )
}
