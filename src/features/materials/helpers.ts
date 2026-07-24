import { safeJsonParse } from '@/lib/utils/safe-json';
import { CATEGORY_COLORS } from './constants';
import type { BadgeVariant, SupplierItem } from './types';

export function parseSupplierCategories(categories: SupplierItem['categories']): string[] {
  if (Array.isArray(categories)) return categories;
  if (typeof categories !== 'string') return [];

  const parsed = safeJsonParse<unknown>(categories);
  return Array.isArray(parsed) ? parsed : [];
}

export function categoriesToInput(categories: SupplierItem['categories']): string {
  return parseSupplierCategories(categories).join(', ');
}

export function categoryBadgeVariant(category: string): BadgeVariant {
  const key = category.toLowerCase().replace(/[_\s]/g, '');
  for (const [match, variant] of Object.entries(CATEGORY_COLORS)) {
    if (key.includes(match)) return variant;
  }
  return 'default';
}

export function formatCategory(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export async function parseResponseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: string;
      description?: string;
    };

    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error;
    }

    if (typeof body.description === 'string' && body.description.trim()) {
      return body.description;
    }
  } catch {
    // Ignore response parse errors and use fallback message.
  }

  return fallback;
}
