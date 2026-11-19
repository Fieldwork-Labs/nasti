import { Tabs, TabsList, TabsTrigger } from "@nasti/ui/tabs"

export type InventoryView = "assigned" | "owned"

/**
 * Testing organisations hold two kinds of seed: bags assigned to them for
 * testing, and batches they own (for example received in a transfer).
 */
export const InventoryViewTabs = ({
  view,
  onChange,
}: {
  view: InventoryView
  onChange: (view: InventoryView) => void
}) => (
  <Tabs
    value={view}
    onValueChange={(value) => onChange(value as InventoryView)}
  >
    <TabsList>
      <TabsTrigger value="assigned">Assigned</TabsTrigger>
      <TabsTrigger value="owned">Owned</TabsTrigger>
    </TabsList>
  </Tabs>
)
