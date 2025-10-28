import { Button } from "@superset/ui/button";

interface CreateWorktreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isCreating: boolean;
  branchName: string;
  onBranchNameChange: (value: string) => void;
}

export function CreateWorktreeModal({
  isOpen,
  onClose,
  onSubmit,
  isCreating,
  branchName,
  onBranchNameChange,
}: CreateWorktreeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-neutral-800 rounded-lg shadow-xl p-6 w-96">
        <h3 className="text-lg font-semibold mb-4">Create New Worktree</h3>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="branchName"
              className="block text-sm font-medium mb-2"
            >
              New Branch Name
            </label>
            <input
              type="text"
              value={branchName}
              onChange={(e) => onBranchNameChange(e.target.value)}
              placeholder="feature/my-branch"
              className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white focus:outline-none focus:border-blue-500"
              autoFocus
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              A new branch will be created from the current branch
            </p>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isCreating || !branchName.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
