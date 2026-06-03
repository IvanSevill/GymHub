export const safeImageUrl = (
  url: string | null | undefined,
): string | undefined => (url?.startsWith("https://") ? url : undefined);
