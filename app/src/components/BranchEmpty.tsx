import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

// The centered placeholder for a branch with no changes, whether it is read from a working folder or previewed.
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
