import { useState } from "react"
import { Control, ControlGroup } from "@renderer/components/ui/control"
import { Button } from "@renderer/components/ui/button"
import { Input } from "@renderer/components/ui/input"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@renderer/components/ui/dialog"
import {
    useConfigQuery,
    useSaveConfigMutation,
} from "@renderer/lib/query-client"
import { CommandMapping, Config } from "@shared/types"
import { Switch } from "@renderer/components/ui/switch"

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

    const mappings = configQuery.data?.commandMappings || []

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
    const [editingMapping, setEditingMapping] = useState<CommandMapping | null>(null)

    const handleSaveMapping = (mapping: CommandMapping) => {
        let newMappings = [...mappings]
        const index = newMappings.findIndex((m) => m.id === mapping.id)

        if (index > -1) {
            newMappings[index] = mapping
        } else {
            newMappings.push(mapping)
        }

        // Ensure only one default
        if (mapping.isDefault) {
            newMappings = newMappings.map(m => ({
                ...m,
                isDefault: m.id === mapping.id
            }))
        }

        saveConfig({ commandMappings: newMappings })
        setIsAddDialogOpen(false)
        setEditingMapping(null)
    }

    const handleDeleteMapping = (id: string) => {
        const newMappings = mappings.filter((m) => m.id !== id)
        saveConfig({ commandMappings: newMappings })
    }

    const handleSetDefault = (id: string) => {
        const newMappings = mappings.map(m => ({
            ...m,
            isDefault: m.id === id
        }))
        saveConfig({ commandMappings: newMappings })
    }

    return (
        <div className="grid gap-4">
            <ControlGroup
                title="Command Mappings"
                endDescription={
                    <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
                        <span className="i-mingcute-add-line mr-1"></span>
                        Add Command
                    </Button>
                }
            >
                {mappings.length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                        No commands configured. Add one to get started.
                    </div>
                )}

                {mappings.map((mapping) => (
                    <div
                        key={mapping.id}
                        className="flex items-center justify-between border-b p-3 last:border-0"
                    >
                        <div className="flex flex-col gap-1 overflow-hidden">
                            <div className="flex items-center gap-2">
                                <span className="font-medium">{mapping.name}</span>
                                {mapping.isDefault && (
                                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">Default</span>
                                )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                                Prefix: <span className="font-mono bg-muted px-1 rounded">{mapping.prefix}</span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate" title={mapping.action}>
                                Action: <span className="font-mono">{mapping.action}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                title="Set as Default"
                                disabled={mapping.isDefault}
                                onClick={() => handleSetDefault(mapping.id)}
                            >
                                <span className={mapping.isDefault ? "i-mingcute-star-fill text-yellow-500" : "i-mingcute-star-line"}></span>
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => setEditingMapping(mapping)}
                            >
                                <span className="i-mingcute-edit-2-line"></span>
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteMapping(mapping.id)}
                            >
                                <span className="i-mingcute-delete-2-line"></span>
                            </Button>
                        </div>
                    </div>
                ))}
            </ControlGroup>

            <CommandDialog
                open={isAddDialogOpen}
                onOpenChange={setIsAddDialogOpen}
                onSave={handleSaveMapping}
                title="Add Command"
            />

            <CommandDialog
                open={!!editingMapping}
                onOpenChange={(open) => !open && setEditingMapping(null)}
                initialData={editingMapping || undefined}
                onSave={handleSaveMapping}
                title="Edit Command"
            />
        </div>
    )
}

function CommandDialog({
    open,
    onOpenChange,
    initialData,
    onSave,
    title,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    initialData?: CommandMapping
    onSave: (mapping: CommandMapping) => void
    title: string
}) {
    const [name, setName] = useState(initialData?.name || "")
    const [prefix, setPrefix] = useState(initialData?.prefix || "")
    const [action, setAction] = useState(initialData?.action || "")
    const [isDefault, setIsDefault] = useState(initialData?.isDefault || false)

    // Reset form when opening
    if (open && !initialData && !name && !prefix && !action) {
        // keep state clean if needed
    }

    // Update state when initialData changes (for edit mode)
    // This is a bit hacky, better to use a key or useEffect, but simple for now
    // We'll rely on the parent unmounting/remounting or just manual sync if needed.
    // Actually, let's use a key on the dialog content or just reset in useEffect if we were being strict.
    // For this simple case, we can just let the user type. 
    // BUT, if we switch from Add to Edit, we need to update.
    // Let's just use a key on the DialogContent to force re-render if initialData changes?
    // Or better, use a form component.

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent key={initialData?.id || 'new'}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <label htmlFor="name" className="text-sm font-medium">
                            Name
                        </label>
                        <Input
                            id="name"
                            defaultValue={initialData?.name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Search Google"
                        />
                    </div>
                    <div className="grid gap-2">
                        <label htmlFor="prefix" className="text-sm font-medium">
                            Prefix
                        </label>
                        <Input
                            id="prefix"
                            defaultValue={initialData?.prefix}
                            onChange={(e) => setPrefix(e.target.value)}
                            placeholder="e.g. Google"
                        />
                        <p className="text-xs text-muted-foreground">
                            The word(s) to trigger this command.
                        </p>
                    </div>
                    <div className="grid gap-2">
                        <label htmlFor="action" className="text-sm font-medium">
                            Action
                        </label>
                        <Input
                            id="action"
                            defaultValue={initialData?.action}
                            onChange={(e) => setAction(e.target.value)}
                            placeholder="e.g. https://google.com/search?q={command}"
                        />
                        <p className="text-xs text-muted-foreground">
                            Use <span className="font-mono">{`{command}`}</span> for the rest of the spoken text.
                            <br />
                            Start with <span className="font-mono">http</span> for URLs, otherwise it executes as a system command.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="isDefault"
                            defaultChecked={initialData?.isDefault}
                            onCheckedChange={setIsDefault}
                        />
                        <label htmlFor="isDefault" className="text-sm font-medium">
                            Set as Default Command
                        </label>
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            onSave({
                                id: initialData?.id || Date.now().toString(),
                                name: name || initialData?.name || "Unnamed",
                                prefix: prefix || initialData?.prefix || "",
                                action: action || initialData?.action || "",
                                isDefault: isDefault
                            })
                        }}
                    >
                        Save
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
