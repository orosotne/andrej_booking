import type { Prisma } from "@/generated/prisma/client";

// Kept apart from note-category-service.ts (no DB import), so the
// Prisma-agnostic slot-dto.ts can map the names too.

/**
 * A patient's subcategory names in display order: the order the doctor created
 * them, which is also the order of the /poznamky list. Shared by every query
 * that shows the red line above a patient's note.
 */
export const NOTE_CATEGORY_NAMES = {
  select: { category: { select: { name: true } } },
  orderBy: [{ category: { createdAt: "asc" } }, { categoryId: "asc" }],
} satisfies Prisma.Patient$noteCategoriesArgs;

export function noteCategoryNames(
  links: { category: { name: string } }[],
): string[] {
  return links.map((l) => l.category.name);
}
