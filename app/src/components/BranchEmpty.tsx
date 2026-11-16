import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export function BranchEmpty({ branch }: { branch: string }) {
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyTitle>No changes on {branch}</EmptyTitle>
        <EmptyDescription>This branch has no file changes to show.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
