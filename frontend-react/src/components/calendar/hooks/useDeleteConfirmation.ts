import { useState } from "react";

export function useDeleteConfirmation() {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleConfirm = (id: string) => {
    setDeleteConfirmId((prev) => (prev === id ? null : id));
  };

  const confirmDelete = async (
    onDelete: (id: string) => Promise<void>,
  ): Promise<void> => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      await onDelete(deleteConfirmId);
      setDeleteConfirmId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const clear = () => setDeleteConfirmId(null);

  return {
    deleteConfirmId,
    isDeleting,
    toggleConfirm,
    confirmDelete,
    clear,
  };
}
