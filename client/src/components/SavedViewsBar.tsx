/**
 * Named, reusable lists for one Address Book tab. A view stores the search text,
 * filters, visible columns and sort, so recurring jobs ("SOA mailing list",
 * "vessels without IMO") are one click away. Personal by default; sharing
 * publishes the view to the whole team.
 */
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Bookmark, BookmarkPlus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type AddressBookEntity = "group" | "customer" | "vessel" | "contact";

export function SavedViewsBar({
  entity,
  activeViewId,
  currentConfig,
  onApply,
}: {
  entity: AddressBookEntity;
  activeViewId: number | null;
  /** JSON-serialisable snapshot of the current search, filters, columns and sort. */
  currentConfig: unknown;
  onApply: (viewId: number, config: unknown) => void;
}) {
  const utils = trpc.useUtils();
  const { data: views } = trpc.addressBook.views.useQuery({ entity });
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);

  const saveView = trpc.addressBook.saveView.useMutation({
    onSuccess: () => {
      toast.success("View saved");
      utils.addressBook.views.invalidate({ entity });
      setSaveOpen(false);
      setName("");
      setShared(false);
    },
    onError: e => toast.error(e.message),
  });
  const deleteView = trpc.addressBook.deleteView.useMutation({
    onSuccess: () => {
      toast.success("View deleted");
      utils.addressBook.views.invalidate({ entity });
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(views ?? []).map(v => (
        <span
          key={v.id}
          className={`group/view inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
            activeViewId === v.id
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background hover:bg-accent"
          }`}
        >
          <button
            className="inline-flex items-center gap-1"
            onClick={() => {
              try {
                onApply(v.id, JSON.parse(v.config));
              } catch {
                toast.error("This view could not be read");
              }
            }}
            title={v.shared ? "Shared with the team" : "Personal view"}
          >
            {v.shared ? <Users className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
            {v.name}
          </button>
          {v.isOwner && (
            <button
              className="opacity-0 group-hover/view:opacity-70 hover:opacity-100"
              title="Delete this view"
              onClick={() => deleteView.mutate({ id: v.id })}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setSaveOpen(true)}>
        <BookmarkPlus className="h-3.5 w-3.5" /> Save current view
      </Button>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. SOA mailing list"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Share with the team</p>
                <p className="text-xs text-muted-foreground">Everyone can apply it; only you can delete it.</p>
              </div>
              <Switch checked={shared} onCheckedChange={setShared} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || saveView.isPending}
              onClick={() =>
                saveView.mutate({
                  entity,
                  name: name.trim(),
                  config: JSON.stringify(currentConfig),
                  shared,
                })
              }
            >
              {saveView.isPending ? "Saving…" : "Save view"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
